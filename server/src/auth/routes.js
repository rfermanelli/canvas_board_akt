import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireAuth } from './middleware.js';
import { asyncHandler } from '../asyncHandler.js';
import { sendPasswordResetEmail } from '../mail.js';

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

// POST /api/auth/register  { email, password, displayName }
authRouter.post('/register', asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password richieste' });
  if (password.length < 8) return res.status(400).json({ error: 'Password troppo corta (min 8)' });

  const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'Email già registrata' });

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
    [email, hash, displayName || email.split('@')[0]]
  );
  const user = { id: result.insertId, email };
  res.status(201).json({ token: signToken(user), user: { id: user.id, email, displayName, role: 'user' } });
}));

// POST /api/auth/login  { email, password }
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password richieste' });

  const rows = await query('SELECT id, email, password_hash, display_name, role, disabled_at FROM users WHERE email = ?', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Credenziali non valide' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

  if (rows[0].disabled_at) return res.status(403).json({ error: 'Account disattivato' });

  const user = { id: rows[0].id, email: rows[0].email };
  res.json({ token: signToken(user), user: { id: user.id, email: user.email, displayName: rows[0].display_name, role: rows[0].role } });
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
