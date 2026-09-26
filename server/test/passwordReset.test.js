// Test di integrazione per il flusso "password dimenticata" / reset password.
//
// Esegue richieste HTTP reali (fetch) contro un'istanza del server già in esecuzione
// (npm run dev / npm start in server/) e usa direttamente `query` da server/src/db.js
// per seedare/ispezionare/pulire i dati di supporto (utente di prova, token di reset).
//
// Non richiede SMTP: sendPasswordResetEmail (server/src/mail.js) è no-op senza
// SMTP_HOST configurato, quindi il token in chiaro non arriva mai via email nei test.
// Per i casi che richiedono un token "noto" in chiaro (scaduto, già usato), il test
// genera lui stesso un token casuale e inserisce la riga in password_reset_tokens con
// token_hash = SHA-256(token), replicando esattamente la logica di server/src/auth/routes.js.
//
// Requisiti: Node >= 18 (fetch globale), server e MySQL raggiungibili. Se non lo sono,
// i test vengono saltati con un messaggio esplicito (nessun fallimento "rumoroso").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { query, pool } from '../src/db.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000';
const API = `${BASE_URL}/api`;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const testEmail = `resettest+${Date.now()}@example.local`;
const initialPassword = 'InitialPass123';

let userId = null;
let serverReachable = false;
let dbReachable = false;

// Traccia gli id dei token inseriti manualmente dal test, per la pulizia finale.
const insertedTokenIds = [];

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // risposta non-JSON: lasciamo json = null, il test fallirà sull'assert successivo
  }
  return { status: res.status, body: json };
}

async function insertResetToken(rawToken, { expiresInMin = 60, usedAt = null } = {}) {
  const tokenHash = sha256(rawToken);
  const result = await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?)`,
    [userId, tokenHash, expiresInMin, usedAt]
  );
  insertedTokenIds.push(result.insertId);
  return result.insertId;
}

// --- Setup: verifica raggiungibilità di server e DB, poi crea l'utente di prova. ---
test.before(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    serverReachable = res.ok;
  } catch {
    serverReachable = false;
  }

  try {
    await pool.query('SELECT 1');
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  if (serverReachable && dbReachable) {
    // La registrazione ora risponde 200 generico e NON restituisce id/token: l'utente
    // nasce 'pending_verification'. Recupero l'id dal DB e lo porto ad 'active' così i
    // test di reset/login (che richiedono un account utilizzabile) funzionano.
    const { status, body } = await apiPost('/auth/register', {
      email: testEmail,
      password: initialPassword,
      displayName: 'Reset Test',
    });
    assert.equal(status, 200, `registrazione utente di prova fallita: ${JSON.stringify(body)}`);
    const rows = await query('SELECT id FROM users WHERE email = ?', [testEmail]);
    userId = rows[0].id;
    await query(
      "UPDATE users SET status = 'active', email_verified_at = NOW(), approved_at = NOW() WHERE id = ?",
      [userId]
    );
  }
});

// --- Cleanup: rimuove utente e token di prova (best effort). ---
test.after(async () => {
  if (!dbReachable || !userId) return;
  try {
    await query('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
    await query('DELETE FROM users WHERE id = ?', [userId]);
  } catch {
    // pulizia best-effort: non far fallire la suite per un errore di cleanup
  }
  await pool.end().catch(() => {});
});

function skipIfUnreachable(t) {
  if (!serverReachable || !dbReachable) {
    t.skip('server o DB non raggiungibili (TEST_BASE_URL=' + BASE_URL + ')');
    return true;
  }
  return false;
}

test('1. forgot-password con email valida esistente risponde 200 con messaggio generico', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiPost('/auth/forgot-password', { email: testEmail });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.match(body.message, /Se esiste un account/);
});

test('2. forgot-password con email inesistente risponde con lo STESSO 200/messaggio (anti user-enumeration)', async (t) => {
  if (skipIfUnreachable(t)) return;
  const { status, body } = await apiPost('/auth/forgot-password', {
    email: `nonexistent+${Date.now()}@example.local`,
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.match(body.message, /Se esiste un account/);
});

test('3. reset-password con token valido risponde 200 { ok:true }', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: 60 });

  const { status, body } = await apiPost('/auth/reset-password', {
    token: rawToken,
    newPassword: 'BrandNewPass456',
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('4. reset-password con token inesistente/non valido risponde 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const fakeToken = crypto.randomBytes(32).toString('hex'); // mai inserito in DB
  const { status, body } = await apiPost('/auth/reset-password', {
    token: fakeToken,
    newPassword: 'SomePass789',
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('5. reset-password con token scaduto risponde 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: -10 }); // scaduto 10 minuti fa

  const { status, body } = await apiPost('/auth/reset-password', {
    token: rawToken,
    newPassword: 'SomePass789',
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('6. reset-password con token già usato risponde 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: 60, usedAt: new Date() }); // già usato

  const { status, body } = await apiPost('/auth/reset-password', {
    token: rawToken,
    newPassword: 'SomePass789',
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

// Nota: il controllo "password e conferma differenti" è una validazione lato CLIENT
// (il form del client confronta i due campi prima di inviare la richiesta); il server
// riceve solo `newPassword` e non ha modo di verificare una "conferma" che non gli
// viene mai inviata. Come equivalente lato server testiamo il vincolo di robustezza
// che il server applica davvero: la lunghezza minima della password (caso 8 sotto).
// Qui copriamo invece un caso limite analogo lato server: newPassword mancante.
test('7. reset-password senza newPassword (campo mancante) risponde 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: 60 });

  const { status, body } = await apiPost('/auth/reset-password', { token: rawToken });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('8. reset-password con newPassword troppo corta (<8) risponde 400', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: 60 });

  const { status, body } = await apiPost('/auth/reset-password', {
    token: rawToken,
    newPassword: 'short',
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('9. dopo un reset riuscito, la nuova password funziona per il login', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: 60 });

  const newPassword = 'LoginWorksNow123';
  const resetRes = await apiPost('/auth/reset-password', { token: rawToken, newPassword });
  assert.equal(resetRes.status, 200);

  const loginRes = await apiPost('/auth/login', { email: testEmail, password: newPassword });
  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.body.token);
  assert.equal(loginRes.body.user.email, testEmail);

  // Verifica anche che la vecchia password non funzioni più.
  const oldLoginRes = await apiPost('/auth/login', { email: testEmail, password: initialPassword });
  assert.equal(oldLoginRes.status, 401);
});

test('10. lo stesso token non è riutilizzabile dopo un reset riuscito', async (t) => {
  if (skipIfUnreachable(t)) return;
  const rawToken = crypto.randomBytes(32).toString('hex');
  await insertResetToken(rawToken, { expiresInMin: 60 });

  const first = await apiPost('/auth/reset-password', { token: rawToken, newPassword: 'FirstUseOk123' });
  assert.equal(first.status, 200);

  const second = await apiPost('/auth/reset-password', { token: rawToken, newPassword: 'SecondUseNo456' });
  assert.equal(second.status, 400);
  assert.ok(second.body.error);
});
