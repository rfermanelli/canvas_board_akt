import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

// Verifica il JWT (header "Authorization: Bearer <token>") e popola req.user.
// Rilegge l'utente dal DB a ogni richiesta (una query per PK) per: (a) avere il
// ruolo aggiornato senza fidarsi del token, (b) bloccare SUBITO gli account
// disattivati anche con un JWT ancora valido.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
  try {
    const rows = await query('SELECT id, email, role, status, disabled_at FROM users WHERE id = ?', [payload.sub]);
    if (!rows.length) return res.status(401).json({ error: 'Utente non trovato' });
    if (rows[0].disabled_at) return res.status(403).json({ error: 'Account disattivato' });
    // Solo gli account attivi possono operare: una sospensione (o un account non ancora
    // approvato) ha effetto immediato perché lo stato è riletto a ogni richiesta.
    if (rows[0].status !== 'active') {
      return res.status(403).json({ error: 'Account non attivo', code: rows[0].status });
    }
    req.user = { id: rows[0].id, email: rows[0].email, role: rows[0].role, status: rows[0].status };
    next();
  } catch (e) {
    next(e);
  }
}

// Richiede che l'utente autenticato sia un amministratore globale.
// Da usare SEMPRE dopo requireAuth (che popola req.user.role dal DB).
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  }
  next();
}

// Ritorna il ruolo dell'utente su una board ('owner'|'editor'|'viewer') o null.
export async function getBoardRole(boardId, userId) {
  const board = await query('SELECT owner_id FROM boards WHERE id = ?', [boardId]);
  if (board.length === 0) return null;
  if (String(board[0].owner_id) === String(userId)) return 'owner';
  const rows = await query(
    'SELECT role FROM board_collaborators WHERE board_id = ? AND user_id = ?',
    [boardId, userId]
  );
  return rows.length ? rows[0].role : null;
}

// Middleware factory: richiede almeno il ruolo indicato sulla board (:id).
// L'autorizzazione è SEMPRE lato server (requisito del prompt).
export function requireBoardRole(minRole) {
  const rank = { viewer: 1, editor: 2, owner: 3 };
  return async (req, res, next) => {
    const boardId = req.params.id;
    const role = await getBoardRole(boardId, req.user.id);
    if (!role) return res.status(404).json({ error: 'Board non trovata' });
    if (rank[role] < rank[minRole]) {
      return res.status(403).json({ error: 'Permessi insufficienti' });
    }
    req.boardRole = role;
    next();
  };
}
