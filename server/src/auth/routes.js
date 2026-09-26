import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query, pool } from '../db.js';
import { requireAuth } from './middleware.js';
import { asyncHandler } from '../asyncHandler.js';
import { assertTransition } from '../users/status.js';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendNewUserPendingNotification,
} from '../mail.js';
import { loginRateLimiter, resendVerificationRateLimiter } from '../rateLimit.js';

export const authRouter = Router();

// Throttle in-memory delle richieste di reset per email (anti-spam, no nuove dipendenze).
const lastResetRequestAt = new Map();
const RESET_THROTTLE_MS = 60_000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpires,
  });
}

// Genera un token di verifica in chiaro e ne inserisce l'hash. `runner` è `query`
// oppure una connessione in transazione (conn.execute), così l'inserimento può far
// parte della stessa transazione della creazione utente.
async function createVerificationToken(runner, userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  await runner(
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
    [userId, sha256(rawToken), config.emailVerificationTtlMin]
  );
  return rawToken;
}

// Avvisa gli amministratori (attivi) che un utente ha verificato l'email ed è in
// attesa di approvazione. Best-effort: non deve far fallire la verifica.
async function notifyAdminsOfPendingUser(user) {
  const admins = await query(
    "SELECT email FROM users WHERE role = 'admin' AND status = 'active' AND disabled_at IS NULL"
  );
  const emails = admins.map((a) => a.email);
  if (emails.length) await sendNewUserPendingNotification(emails, user);
}

// POST /api/auth/register  { email, password, displayName }
// Crea l'utente in stato 'pending_verification' e un token di verifica nella STESSA
// transazione, poi invia l'email di verifica. NON restituisce un token di sessione:
// l'accesso è possibile solo dopo verifica email + approvazione admin.
authRouter.post('/register', asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Email non valida' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8)' });

  // Risposta identica sia per una registrazione nuova sia per un'email già esistente,
  // per non rivelare quali indirizzi sono registrati (anti user-enumeration).
  const genericResponse = {
    ok: true,
    message: 'Registrazione ricevuta. Controlla la tua email per confermare l\'indirizzo.',
  };

  const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.json(genericResponse);

  const hash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  let rawToken;
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
      [email, hash, displayName || email.split('@')[0]]
    );
    rawToken = await createVerificationToken((sql, params) => conn.execute(sql, params), result.insertId);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    // Corsa su email duplicata (vincolo UNIQUE): mantieni la risposta generica.
    if (/Duplicate entry/i.test(e.message)) return res.json(genericResponse);
    throw e;
  } finally {
    conn.release();
  }

  const verifyUrl = `${config.appBaseUrl}/verify-email?token=${rawToken}`;
  // Invio non atteso: l'esito dell'SMTP non deve influenzare la risposta (né il timing).
  sendVerificationEmail(email, verifyUrl).catch((e) => console.error('sendVerificationEmail:', e.message));

  res.json(genericResponse);
}));

// Messaggi per gli stati che NON possono accedere. Il `code` è machine-readable:
// il frontend lo usa (es. per offrire il reinvio del link di verifica).
const LOGIN_STATUS_MESSAGES = {
  pending_verification: 'Email non ancora verificata. Controlla la posta o richiedi un nuovo link di verifica.',
  pending_approval: 'Account in attesa di approvazione da parte di un amministratore.',
  rejected: 'Accesso negato: la richiesta di accesso non è stata approvata.',
  suspended: 'Accesso negato: account sospeso.',
};

// POST /api/auth/login  { email, password }
// Verifica PRIMA le credenziali, POI lo stato dell'account: solo 'active' ottiene un token.
authRouter.post('/login', loginRateLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password richieste' });

  const rows = await query('SELECT id, email, password_hash, display_name, role, status, disabled_at FROM users WHERE email = ?', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Credenziali non valide' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

  // Disabilitazione admin (kill-switch ortogonale al ciclo di vita): ha la precedenza.
  if (rows[0].disabled_at) return res.status(403).json({ error: 'Account disattivato', code: 'disabled' });

  if (rows[0].status !== 'active') {
    const message = LOGIN_STATUS_MESSAGES[rows[0].status] || 'Accesso negato.';
    return res.status(403).json({ error: message, code: rows[0].status });
  }

  const user = { id: rows[0].id, email: rows[0].email };
  res.json({ token: signToken(user), user: { id: user.id, email: user.email, displayName: rows[0].display_name, role: rows[0].role } });
}));

// POST /api/auth/verify-email  { token }
// Verifica il token e, in un'unica transazione: segna email_verified_at, marca il
// token come usato, porta lo stato a 'pending_approval'. Poi notifica gli admin.
authRouter.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token mancante' });

  const tokenHash = sha256(token);
  const conn = await pool.getConnection();
  let verifiedUser = null;
  try {
    await conn.beginTransaction();
    // Claim atomico del token (chiude la race sul monouso, come nel reset password).
    const [claim] = await conn.execute(
      'UPDATE email_verification_tokens SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
      [tokenHash]
    );
    if (!claim.affectedRows) {
      await conn.rollback();
      return res.status(400).json({ error: 'Link non valido o scaduto' });
    }
    const [trows] = await conn.execute('SELECT user_id FROM email_verification_tokens WHERE token_hash = ?', [tokenHash]);
    const userId = trows[0].user_id;
    const [urows] = await conn.execute('SELECT id, email, display_name, status FROM users WHERE id = ?', [userId]);
    // Transiziona solo se ancora in attesa di verifica (idempotenza: se già oltre,
    // il token viene consumato ma lo stato non regredisce).
    if (urows.length && urows[0].status === 'pending_verification') {
      assertTransition(urows[0].status, 'pending_approval');
      await conn.execute(
        "UPDATE users SET email_verified_at = NOW(), status = 'pending_approval' WHERE id = ?",
        [userId]
      );
      verifiedUser = urows[0];
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  if (verifiedUser) {
    notifyAdminsOfPendingUser(verifiedUser).catch((e) => console.error('notifyAdminsOfPendingUser:', e.message));
  }
  res.json({ ok: true, message: 'Email verificata. Un amministratore approverà a breve il tuo account.' });
}));

// POST /api/auth/resend-verification  { email }
// Reinvia il link di verifica (rate-limited per email). Invalida i token precedenti.
// Risposta generica per non rivelare quali email siano registrate/non verificate.
authRouter.post('/resend-verification', resendVerificationRateLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Email non valida' });

  const genericResponse = {
    ok: true,
    message: 'Se esiste un account non verificato con questa email, riceverai un nuovo link.',
  };

  const rows = await query('SELECT id, status FROM users WHERE email = ?', [email]);
  if (rows.length && rows[0].status === 'pending_verification') {
    const userId = rows[0].id;
    await query('DELETE FROM email_verification_tokens WHERE user_id = ? AND used_at IS NULL', [userId]);
    const rawToken = await createVerificationToken(query, userId);
    const verifyUrl = `${config.appBaseUrl}/verify-email?token=${rawToken}`;
    sendVerificationEmail(email, verifyUrl).catch((e) => console.error('sendVerificationEmail:', e.message));
  }

  res.json(genericResponse);
}));

// GET /api/auth/me
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, email, display_name, role FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name, role: rows[0].role });
}));

// PUT /api/auth/password  { currentPassword, newPassword }
authRouter.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Password attuale e nuova richieste' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8)' });

  const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Password attuale non corretta' });

  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  res.json({ ok: true });
}));

// POST /api/auth/forgot-password  { email }
authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Email non valida' });

  const genericResponse = { ok: true, message: 'Se esiste un account associato a questa email, riceverai un link per reimpostare la password.' };

  const key = email.toLowerCase();
  const now = Date.now();
  const last = lastResetRequestAt.get(key);
  if (last && now - last < RESET_THROTTLE_MS) {
    // Non rigenera/invia, ma la risposta resta identica per non rivelare nulla.
    return res.json(genericResponse);
  }
  lastResetRequestAt.set(key, now);

  const rows = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length) {
    const userId = rows[0].id;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);

    await query('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL', [userId]);
    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [userId, tokenHash, config.resetTokenTtlMin]
    );

    const resetUrl = `${config.appBaseUrl}/reset-password?token=${rawToken}`;
    // Non attendere l'invio (I/O di rete verso SMTP): altrimenti il tempo di risposta
    // rivelerebbe se l'email esiste (canale laterale di user enumeration via timing).
    sendPasswordResetEmail(email, resetUrl).catch((e) => console.error('sendPasswordResetEmail:', e.message));
  }

  res.json(genericResponse);
}));

// POST /api/auth/reset-password  { token, newPassword }
authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'Token e nuova password richiesti' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8)' });

  const tokenHash = sha256(token);
  // UPDATE condizionato (non SELECT-poi-UPDATE): l'UPDATE su riga InnoDB è atomico,
  // quindi due richieste concorrenti con lo stesso token non possono marcarlo "usato"
  // entrambe (chiude la race window sul monouso del token).
  const claim = await query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()',
    [tokenHash]
  );
  if (!claim.affectedRows) return res.status(400).json({ error: 'Link non valido o scaduto' });

  const rows = await query('SELECT user_id FROM password_reset_tokens WHERE token_hash = ?', [tokenHash]);
  const userId = rows[0].user_id;
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  await query('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL', [userId]);

  res.json({ ok: true });
}));

// TODO (Fase 6, opzionale): login con Google (OAuth). Punto d'innesto qui.
