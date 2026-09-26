// Test di integrazione per il flusso di attivazione utente:
// registrazione -> verifica email -> approvazione admin -> login.
//
// Come gli altri test del progetto: richieste HTTP reali (fetch) contro un server già
// in esecuzione (npm run dev / start in server/) e accesso diretto al DB via query/pool
// per seed/ispezione/cleanup. Per i casi che richiedono un token di verifica "noto" in
// chiaro (scaduto/usato) il test inserisce lui la riga in email_verification_tokens con
// token_hash = SHA-256(token), replicando la logica di server/src/auth/routes.js.
//
// Se server o DB non sono raggiungibili i test vengono saltati (nessun fallimento rumoroso).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query, pool } from '../src/db.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000';
const API = `${BASE_URL}/api`;
const PASS = 'ActivationPass123';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const stamp = Date.now();
const emailFor = (tag) => `act_${tag}_${stamp}@example.local`;

let adminId = null;
let adminToken = null;
let serverReachable = false;
let dbReachable = false;

const createdUserIds = [];   // per il cleanup finale

async function apiReq(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON: json resta null */ }
  return { status: res.status, body: json };
}

// Registra un utente via API (resta 'pending_verification') e ne ritorna l'id dal DB.
async function registerPending(email) {
  const r = await apiReq('POST', '/auth/register', { body: { email, password: PASS, displayName: 'Act Test' } });
  assert.equal(r.status, 200, `registrazione fallita: ${JSON.stringify(r.body)}`);
  const rows = await query('SELECT id FROM users WHERE email = ?', [email]);
  const id = rows[0].id;
  createdUserIds.push(id);
  return id;
}

async function setStatus(id, sql) { await query(`UPDATE users SET ${sql} WHERE id = ?`, [id]); }
const makeVerified = (id) => setStatus(id, "status = 'pending_approval', email_verified_at = NOW()");
const makeActive = (id) => setStatus(id, "status = 'active', email_verified_at = NOW(), approved_at = NOW()");

async function insertVerificationToken(userId, rawToken, { expiresInMin = 60, usedAt = null } = {}) {
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at, used_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
    [userId, sha256(rawToken), expiresInMin, usedAt]
  );
}

const getStatus = async (id) => (await query('SELECT status FROM users WHERE id = ?', [id]))[0]?.status;

test.before(async () => {
  try { serverReachable = (await fetch(`${BASE_URL}/api/health`)).ok; } catch { serverReachable = false; }
  try { await pool.query('SELECT 1'); dbReachable = true; } catch { dbReachable = false; }
  if (!(serverReachable && dbReachable)) return;

  // Admin di supporto per le azioni di approvazione/rifiuto/sospensione.
  adminId = await registerPending(emailFor('admin'));
  await setStatus(adminId, "status = 'active', email_verified_at = NOW(), approved_at = NOW(), role = 'admin'");
  const login = await apiReq('POST', '/auth/login', { body: { email: emailFor('admin'), password: PASS } });
  assert.equal(login.status, 200, `login admin fallito: ${JSON.stringify(login.body)}`);
  adminToken = login.body.token;
});

test.after(async () => {
  if (!dbReachable) return;
  try {
    for (const id of createdUserIds) {
      await query('DELETE FROM admin_audit_log WHERE admin_id = ? OR (entity_type = "user" AND entity_id = ?)', [id, id]);
    }
    // approved_by referenzia users(id) con ON DELETE SET NULL: nessun blocco all'eliminazione.
    for (const id of createdUserIds) {
      await query('DELETE FROM users WHERE id = ?', [id]); // cascade sui token di verifica
    }
  } catch { /* cleanup best-effort */ }
  await pool.end().catch(() => {});
});

function skipIfUnreachable(t) {
  if (!serverReachable || !dbReachable) {
    t.skip('server o DB non raggiungibili (TEST_BASE_URL=' + BASE_URL + ')');
    return true;
  }
  return false;
}

// --- Fase 1: registrazione ---

test('1. registrazione riuscita: 200 generico, utente creato pending_verification + token', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('reg');
  const r = await apiReq('POST', '/auth/register', { body: { email, password: PASS, displayName: 'Reg' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const rows = await query('SELECT id, status FROM users WHERE email = ?', [email]);
  assert.equal(rows.length, 1);
  createdUserIds.push(rows[0].id);
  assert.equal(rows[0].status, 'pending_verification');
  const tok = await query('SELECT COUNT(*) AS n FROM email_verification_tokens WHERE user_id = ?', [rows[0].id]);
  assert.equal(tok[0].n, 1, 'atteso un token di verifica creato in registrazione');
});

test('2. email duplicata: risposta IDENTICA al successo, nessun secondo utente (no enumeration)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('dup');
  const first = await apiReq('POST', '/auth/register', { body: { email, password: PASS, displayName: 'Dup' } });
  const rows1 = await query('SELECT id FROM users WHERE email = ?', [email]);
  createdUserIds.push(rows1[0].id);

  const second = await apiReq('POST', '/auth/register', { body: { email, password: 'AnotherPass999', displayName: 'Dup2' } });
  assert.equal(second.status, first.status);
  assert.deepEqual(second.body, first.body, 'la risposta a email duplicata deve essere identica');
  const count = await query('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email]);
  assert.equal(count[0].n, 1, 'nessun secondo utente per email duplicata');
});

test('3. registrazione con password corta (<8) -> 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const r = await apiReq('POST', '/auth/register', { body: { email: emailFor('short'), password: 'abc', displayName: 'X' } });
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
});

// --- Fase 2: verifica email ---

test('4. verifica con token valido -> 200, stato pending_approval + email_verified_at', async (t) => {
  if (skipIfUnreachable(t)) return;
  const id = await registerPending(emailFor('verok'));
  const raw = crypto.randomBytes(32).toString('hex');
  await insertVerificationToken(id, raw, { expiresInMin: 60 });

  const r = await apiReq('POST', '/auth/verify-email', { body: { token: raw } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const rows = await query('SELECT status, email_verified_at FROM users WHERE id = ?', [id]);
  assert.equal(rows[0].status, 'pending_approval');
  assert.ok(rows[0].email_verified_at, 'email_verified_at deve essere valorizzato');
});

test('5. verifica con token inesistente -> 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const r = await apiReq('POST', '/auth/verify-email', { body: { token: crypto.randomBytes(32).toString('hex') } });
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
});

test('6. verifica con token scaduto -> 400 (stato invariato)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const id = await registerPending(emailFor('verexp'));
  const raw = crypto.randomBytes(32).toString('hex');
  await insertVerificationToken(id, raw, { expiresInMin: -10 });
  const r = await apiReq('POST', '/auth/verify-email', { body: { token: raw } });
  assert.equal(r.status, 400);
  assert.equal(await getStatus(id), 'pending_verification');
});

test('7. verifica con token già usato -> 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const id = await registerPending(emailFor('verused'));
  const raw = crypto.randomBytes(32).toString('hex');
  await insertVerificationToken(id, raw, { expiresInMin: 60, usedAt: new Date() });
  const r = await apiReq('POST', '/auth/verify-email', { body: { token: raw } });
  assert.equal(r.status, 400);
});

test('8. reinvio verifica invalida i token precedenti (il vecchio link non funziona più)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('resend');
  const id = await registerPending(email);
  const oldRaw = crypto.randomBytes(32).toString('hex');
  await insertVerificationToken(id, oldRaw, { expiresInMin: 60 });

  const r = await apiReq('POST', '/auth/resend-verification', { body: { email } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);

  // Il token precedente è stato invalidato (rimosso): verificarlo ora fallisce.
  const verifyOld = await apiReq('POST', '/auth/verify-email', { body: { token: oldRaw } });
  assert.equal(verifyOld.status, 400, 'il vecchio token deve essere invalidato dal reinvio');
});

test('9. reinvio verifica: rate limiting per email (4ª richiesta -> 429)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('ratelimit'); // email dedicata: budget isolato dagli altri test
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const r = await apiReq('POST', '/auth/resend-verification', { body: { email } });
    codes.push(r.status);
  }
  assert.deepEqual(codes.slice(0, 3), [200, 200, 200], `attese 3 richieste OK, avute ${codes}`);
  assert.equal(codes[3], 429, `la 4ª richiesta deve essere limitata (429), avuto ${codes[3]}`);
});

// --- Fase 3: approvazione / rifiuto / sospensione ---

test('10. approvazione (admin): pending_approval -> active, con ruolo, poi login OK', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('approve');
  const id = await registerPending(email);
  await makeVerified(id);

  const r = await apiReq('POST', `/admin/users/${id}/approve`, { token: adminToken, body: { role: 'user' } });
  assert.equal(r.status, 200);
  const rows = await query('SELECT status, approved_at, approved_by, role FROM users WHERE id = ?', [id]);
  assert.equal(rows[0].status, 'active');
  assert.ok(rows[0].approved_at);
  assert.equal(Number(rows[0].approved_by), Number(adminId));

  const login = await apiReq('POST', '/auth/login', { body: { email, password: PASS } });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});

test('11. rifiuto (admin): pending_approval -> rejected con motivazione', async (t) => {
  if (skipIfUnreachable(t)) return;
  const id = await registerPending(emailFor('reject'));
  await makeVerified(id);

  const noReason = await apiReq('POST', `/admin/users/${id}/reject`, { token: adminToken, body: {} });
  assert.equal(noReason.status, 400, 'la motivazione è obbligatoria');

  const r = await apiReq('POST', `/admin/users/${id}/reject`, { token: adminToken, body: { reason: 'Dominio non ammesso' } });
  assert.equal(r.status, 200);
  const rows = await query('SELECT status, rejection_reason FROM users WHERE id = ?', [id]);
  assert.equal(rows[0].status, 'rejected');
  assert.equal(rows[0].rejection_reason, 'Dominio non ammesso');
});

test('12. sospensione (admin): active -> suspended', async (t) => {
  if (skipIfUnreachable(t)) return;
  const id = await registerPending(emailFor('suspend'));
  await makeActive(id);
  const r = await apiReq('POST', `/admin/users/${id}/suspend`, { token: adminToken });
  assert.equal(r.status, 200);
  assert.equal(await getStatus(id), 'suspended');
});

test('13. SICUREZZA: un non-admin non può approvare/rifiutare/sospendere (403)', async (t) => {
  if (skipIfUnreachable(t)) return;
  // utente normale attivo con token
  const email = emailFor('nonadmin');
  const id = await registerPending(email);
  await makeActive(id);
  const login = await apiReq('POST', '/auth/login', { body: { email, password: PASS } });
  const userToken = login.body.token;

  // bersaglio in pending_approval
  const targetId = await registerPending(emailFor('target'));
  await makeVerified(targetId);

  for (const [method, path] of [
    ['POST', `/admin/users/${targetId}/approve`],
    ['POST', `/admin/users/${targetId}/reject`],
    ['POST', `/admin/users/${targetId}/suspend`],
  ]) {
    const r = await apiReq(method, path, { token: userToken, body: { reason: 'x' } });
    assert.equal(r.status, 403, `${path} da non-admin deve dare 403`);
  }
  assert.equal(await getStatus(targetId), 'pending_approval', 'lo stato del bersaglio non deve cambiare');
});

test('14. SICUREZZA: un admin non può sospendere se stesso (403)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const r = await apiReq('POST', `/admin/users/${adminId}/suspend`, { token: adminToken });
  assert.equal(r.status, 403);
  assert.equal(await getStatus(adminId), 'active');
});

// --- Fase 4: login per ciascuno stato ---

test('15. login: pending_verification -> 403 code pending_verification', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('login_pv');
  await registerPending(email);
  const r = await apiReq('POST', '/auth/login', { body: { email, password: PASS } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'pending_verification');
});

test('16. login: pending_approval -> 403 code pending_approval', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('login_pa');
  const id = await registerPending(email);
  await makeVerified(id);
  const r = await apiReq('POST', '/auth/login', { body: { email, password: PASS } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'pending_approval');
});

test('17. login: rejected -> 403; suspended -> 403; active -> 200', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rejectedEmail = emailFor('login_rej');
  const rid = await registerPending(rejectedEmail);
  await setStatus(rid, "status = 'rejected', rejection_reason = 'no'");
  const rej = await apiReq('POST', '/auth/login', { body: { email: rejectedEmail, password: PASS } });
  assert.equal(rej.status, 403);
  assert.equal(rej.body.code, 'rejected');

  const suspEmail = emailFor('login_susp');
  const sid = await registerPending(suspEmail);
  await setStatus(sid, "status = 'suspended'");
  const susp = await apiReq('POST', '/auth/login', { body: { email: suspEmail, password: PASS } });
  assert.equal(susp.status, 403);
  assert.equal(susp.body.code, 'suspended');

  const activeEmail = emailFor('login_act');
  const aid = await registerPending(activeEmail);
  await makeActive(aid);
  const act = await apiReq('POST', '/auth/login', { body: { email: activeEmail, password: PASS } });
  assert.equal(act.status, 200);
  assert.ok(act.body.token);
});

test('18. login con credenziali errate -> 401 (le credenziali si verificano PRIMA dello stato)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('badcreds');
  const id = await registerPending(email);
  await makeActive(id);
  const r = await apiReq('POST', '/auth/login', { body: { email, password: 'WrongPassword1' } });
  assert.equal(r.status, 401);
});

// --- Transizioni di stato non consentite ---

test('19. transizioni non consentite rifiutate (409)', async (t) => {
  if (skipIfUnreachable(t)) return;
  // approvare un utente non ancora verificato (pending_verification -> active): vietato
  const pv = await registerPending(emailFor('t_pv'));
  const a1 = await apiReq('POST', `/admin/users/${pv}/approve`, { token: adminToken });
  assert.equal(a1.status, 409);

  // sospendere un utente in pending_approval (solo active -> suspended): vietato
  const pa = await registerPending(emailFor('t_pa'));
  await makeVerified(pa);
  const a2 = await apiReq('POST', `/admin/users/${pa}/suspend`, { token: adminToken });
  assert.equal(a2.status, 409);

  // approvare un utente già active (active -> active): vietato
  const ac = await registerPending(emailFor('t_ac'));
  await makeActive(ac);
  const a3 = await apiReq('POST', `/admin/users/${ac}/approve`, { token: adminToken });
  assert.equal(a3.status, 409);

  // rifiutare un utente active (active -> rejected): vietato
  const a4 = await apiReq('POST', `/admin/users/${ac}/reject`, { token: adminToken, body: { reason: 'x' } });
  assert.equal(a4.status, 409);
});

// --- Middleware: sospensione ha effetto immediato ---

test('20. il middleware blocca un utente sospeso DOPO il login (token già emesso)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const email = emailFor('mw');
  const id = await registerPending(email);
  await makeActive(id);
  const login = await apiReq('POST', '/auth/login', { body: { email, password: PASS } });
  assert.equal(login.status, 200);
  const token = login.body.token;

  // prima della sospensione il token funziona
  const me1 = await apiReq('GET', '/auth/me', { token });
  assert.equal(me1.status, 200);

  // sospensione via admin -> il token esistente viene rifiutato subito (requireAuth rilegge lo stato)
  const susp = await apiReq('POST', `/admin/users/${id}/suspend`, { token: adminToken });
  assert.equal(susp.status, 200);
  const me2 = await apiReq('GET', '/auth/me', { token });
  assert.equal(me2.status, 403);
  assert.equal(me2.body.code, 'suspended');
});
