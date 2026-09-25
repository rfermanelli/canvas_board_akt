// Test di integrazione per il pannello di amministrazione (/api/admin).
//
// Come passwordReset.test.js: richieste HTTP reali contro un server già in esecuzione
// (npm run dev / start in server/) e accesso diretto al DB via `query`/`pool` per
// seedare/promuovere/pulire. Se server o DB non sono raggiungibili i test vengono
// saltati (nessun fallimento rumoroso).
//
// Requisiti: Node >= 18 (fetch globale), server + MySQL raggiungibili.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../src/db.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000';
const API = `${BASE_URL}/api`;

const stamp = Date.now();
const adminEmail = `admintest+${stamp}@example.local`;
const userEmail = `usertest+${stamp}@example.local`;
const PASS = 'AdminPass123';

let adminId = null;
let adminToken = null;
let userId = null;
let userToken = null;
let createdBoardId = null;

let serverReachable = false;
let dbReachable = false;

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

test.before(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    serverReachable = res.ok;
  } catch { serverReachable = false; }
  try {
    await pool.query('SELECT 1');
    dbReachable = true;
  } catch { dbReachable = false; }

  if (!(serverReachable && dbReachable)) return;

  // Utente normale
  const u = await apiReq('POST', '/auth/register', { body: { email: userEmail, password: PASS, displayName: 'User Test' } });
  assert.equal(u.status, 201, `registrazione utente fallita: ${JSON.stringify(u.body)}`);
  userId = u.body.user.id;
  userToken = u.body.token;

  // Utente admin: registro e poi promuovo via SQL (il token esistente resta valido:
  // requireAuth rilegge il ruolo dal DB a ogni richiesta).
  const a = await apiReq('POST', '/auth/register', { body: { email: adminEmail, password: PASS, displayName: 'Admin Test' } });
  assert.equal(a.status, 201, `registrazione admin fallita: ${JSON.stringify(a.body)}`);
  adminId = a.body.user.id;
  adminToken = a.body.token;
  await query('UPDATE users SET role = ? WHERE id = ?', ['admin', adminId]);
});

test.after(async () => {
  if (!dbReachable) return;
  try {
    if (createdBoardId) await query('DELETE FROM boards WHERE id = ?', [createdBoardId]);
    for (const id of [userId, adminId]) {
      if (!id) continue;
      await query('DELETE FROM admin_audit_log WHERE admin_id = ? OR (entity_type = "user" AND entity_id = ?)', [id, id]);
      await query('DELETE FROM users WHERE id = ?', [id]);
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

// --- Controllo accessi ---

test('1. senza token le rotte admin rispondono 401', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status } = await apiReq('GET', '/admin/stats');
  assert.equal(status, 401);
});

test('2. un utente NON admin riceve 403 sulle rotte admin', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('GET', '/admin/users', { token: userToken });
  assert.equal(status, 403);
  assert.ok(body.error);
});

test('3. un admin ottiene 200 su /admin/stats con metriche numeriche', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('GET', '/admin/stats', { token: adminToken });
  assert.equal(status, 200);
  for (const k of ['users_total', 'users_last_7d', 'users_disabled', 'admins_total', 'boards_total', 'media_total']) {
    assert.equal(typeof body[k], 'number', `metrica ${k} mancante o non numerica`);
  }
});

// --- Nessun dato sensibile esposto ---

test('4. la lista utenti NON espone password_hash', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('GET', '/admin/users?pageSize=100', { token: adminToken });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.rows));
  assert.equal(typeof body.total, 'number');
  for (const row of body.rows) {
    assert.equal(row.password_hash, undefined, 'password_hash non deve comparire');
  }
});

test('5. il dettaglio utente NON espone password_hash', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('GET', `/admin/users/${userId}`, { token: adminToken });
  assert.equal(status, 200);
  assert.equal(body.user.id, userId);
  assert.equal(body.user.password_hash, undefined);
  assert.ok(Array.isArray(body.boards));
});

// --- Validazione input ---

test('6. id non valido -> 400; ruolo non valido -> 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const bad = await apiReq('GET', '/admin/users/abc', { token: adminToken });
  assert.equal(bad.status, 400);
  const badRole = await apiReq('PATCH', `/admin/users/${userId}/role`, { token: adminToken, body: { role: 'superuser' } });
  assert.equal(badRole.status, 400);
});

// --- Cambio ruolo ---

test('7. un admin può promuovere e declassare un altro utente', async (t) => {
  if (skipIfUnreachable(t)) return;
  const up = await apiReq('PATCH', `/admin/users/${userId}/role`, { token: adminToken, body: { role: 'admin' } });
  assert.equal(up.status, 200);
  let d = await apiReq('GET', `/admin/users/${userId}`, { token: adminToken });
  assert.equal(d.body.user.role, 'admin');

  const down = await apiReq('PATCH', `/admin/users/${userId}/role`, { token: adminToken, body: { role: 'user' } });
  assert.equal(down.status, 200);
  d = await apiReq('GET', `/admin/users/${userId}`, { token: adminToken });
  assert.equal(d.body.user.role, 'user');
});

test('8. SICUREZZA: un admin non può rimuovere il proprio ruolo admin (403)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('PATCH', `/admin/users/${adminId}/role`, { token: adminToken, body: { role: 'user' } });
  assert.equal(status, 403);
  assert.ok(body.error);
  // e il ruolo è rimasto admin
  const d = await apiReq('GET', `/admin/users/${adminId}`, { token: adminToken });
  assert.equal(d.body.user.role, 'admin');
});

// --- Gestione lavagne ---

test('9. un admin vede ed elimina una lavagna di un altro utente', async (t) => {
  if (skipIfUnreachable(t)) return;
  // crea una board come utente normale
  const created = await apiReq('POST', '/boards', { token: userToken, body: { name: `AdminSuite Board ${stamp}` } });
  assert.equal(created.status, 201);
  createdBoardId = created.body.id;

  const list = await apiReq('GET', `/admin/boards?q=AdminSuite%20Board%20${stamp}`, { token: adminToken });
  assert.equal(list.status, 200);
  const found = list.body.rows.find((b) => b.id === createdBoardId);
  assert.ok(found, 'la board creata deve comparire nella lista admin');
  assert.equal(found.owner_email, userEmail);

  const del = await apiReq('DELETE', `/admin/boards/${createdBoardId}`, { token: adminToken });
  assert.equal(del.status, 200);
  const after = await query('SELECT id FROM boards WHERE id = ?', [createdBoardId]);
  assert.equal(after.length, 0);
  createdBoardId = null;
});

// --- Disattivazione / riattivazione ---

test('10. disattivare un utente lo blocca subito (login 403 e token esistente 403), riattivarlo lo sblocca', async (t) => {
  if (skipIfUnreachable(t)) return;
  const dis = await apiReq('PATCH', `/admin/users/${userId}/disable`, { token: adminToken });
  assert.equal(dis.status, 200);

  // login bloccato
  const login = await apiReq('POST', '/auth/login', { body: { email: userEmail, password: PASS } });
  assert.equal(login.status, 403);
  // token già emesso bloccato subito (controllo in requireAuth)
  const me = await apiReq('GET', '/auth/me', { token: userToken });
  assert.equal(me.status, 403);

  const en = await apiReq('PATCH', `/admin/users/${userId}/enable`, { token: adminToken });
  assert.equal(en.status, 200);
  const login2 = await apiReq('POST', '/auth/login', { body: { email: userEmail, password: PASS } });
  assert.equal(login2.status, 200);
  userToken = login2.body.token; // aggiorna il token per eventuali usi successivi
});

test('11. SICUREZZA: un admin non può disattivare il proprio account (403)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('PATCH', `/admin/users/${adminId}/disable`, { token: adminToken });
  assert.equal(status, 403);
  assert.ok(body.error);
});

// --- Audit log ---

test('12. le azioni admin sono registrate nell audit log', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiReq('GET', '/admin/audit-log?pageSize=100', { token: adminToken });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.rows));
  // deve esistere almeno un log delle azioni fatte da questo admin sull'utente di test
  const mine = body.rows.filter((r) => r.admin_id === adminId);
  assert.ok(mine.length > 0, 'atteso almeno un log per l admin di test');
  const actions = mine.map((r) => r.action);
  assert.ok(actions.includes('user.role.change'), 'atteso log user.role.change');
  assert.ok(actions.includes('user.disable'), 'atteso log user.disable');
});
