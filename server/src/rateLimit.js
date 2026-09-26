import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from './config.js';

// Rate limiter per il login: chiave per (IP + email). Così un IP che tenta di
// indovinare la password di UN account viene limitato, senza però bloccare account
// diversi che accedono dallo stesso IP (es. una rete aziendale con NAT, o la suite di
// test). Richiede `app.set('trust proxy', 1)` (index.js) per leggere l'IP reale dietro
// nginx da X-Forwarded-For. ipKeyGenerator normalizza gli IPv6 (evita bypass per subnet).
export const loginRateLimiter = rateLimit({
  windowMs: config.rateLimit.loginWindowMin * 60_000,
  limit: config.rateLimit.loginMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body?.email || '').trim().toLowerCase();
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  message: { error: 'Troppi tentativi di accesso. Riprova più tardi.' },
});

// Rate limiter per il reinvio dell'email di verifica: per indirizzo email (non per IP),
// così un attaccante non può far spammare la casella di una vittima cambiando IP.
export const resendVerificationRateLimiter = rateLimit({
  windowMs: config.rateLimit.resendWindowMin * 60_000,
  limit: config.rateLimit.resendMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body?.email || '').trim().toLowerCase() || ipKeyGenerator(req.ip),
  message: { error: 'Troppe richieste di verifica per questo indirizzo. Riprova più tardi.' },
});
