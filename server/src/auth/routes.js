import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireAuth } from './middleware.js';
import { asyncHandler } from '../asyncHandler.js';

export const authRouter = Router();

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
  res.status(201).json({ token: signToken(user), user: { id: user.id, email, displayName } });
}));

// POST /api/auth/login  { email, password }
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password richieste' });

  const rows = await query('SELECT id, email, password_hash, display_name FROM users WHERE email = ?', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Credenziali non valide' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenziali non valide' });

  const user = { id: rows[0].id, email: rows[0].email };
  res.json({ token: signToken(user), user: { id: user.id, email: user.email, displayName: rows[0].display_name } });
}));

// GET /api/auth/me
authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const rows = await query('SELECT id, email, display_name FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });
  res.json({ id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name });
}));

// TODO (Fase 6, opzionale): login con Google (OAuth). Punto d'innesto qui.
