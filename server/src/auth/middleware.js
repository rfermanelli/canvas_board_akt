import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

// Verifica il JWT (header "Authorization: Bearer <token>") e popola req.user.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token mancante' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Token non valido' });
  }
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
