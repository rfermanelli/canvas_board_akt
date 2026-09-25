import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { asyncHandler } from '../asyncHandler.js';

// Tutte le rotte admin richiedono un utente autenticato E amministratore.
// Il controllo è SEMPRE lato server (requisito): l'interfaccia si limita a nascondere.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// --- Helper ---

// Paginazione con limiti (evita page/pageSize fuori scala). Default 20, max 100.
function pagination(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// Valida un id numerico positivo dai parametri di rotta.
function parseId(v) {
  const id = Number(v);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Registra un'azione amministrativa. Best-effort: un errore di log non deve
// far fallire l'operazione già andata a buon fine (solo console.error).
async function logAdminAction(adminId, action, entityType, entityId, details) {
  await query(
    'INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [adminId, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null]
  ).catch((e) => console.error('admin audit:', e.message));
}

// --- Dashboard / metriche ---

// GET /api/admin/stats
adminRouter.get('/stats', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users_total,
       (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS users_last_7d,
       (SELECT COUNT(*) FROM users WHERE disabled_at IS NOT NULL) AS users_disabled,
       (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins_total,
       (SELECT COUNT(*) FROM boards) AS boards_total,
       (SELECT COUNT(*) FROM media_assets) AS media_total`
  );
  res.json(rows[0]);
}));

// --- Utenti ---

// GET /api/admin/users?page&pageSize&q&role&status
adminRouter.get('/users', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const q = (req.query.q || '').trim();
  const role = req.query.role;
  const status = req.query.status;

  const where = [];
  const params = [];
  if (q) {
    where.push('(email LIKE ? OR display_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (role === 'user' || role === 'admin') {
    where.push('role = ?');
    params.push(role);
  }
  if (status === 'disabled') where.push('disabled_at IS NOT NULL');
  else if (status === 'active') where.push('disabled_at IS NULL');
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRows = await query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
  const rows = await query(
    `SELECT id, email, display_name, role, disabled_at, created_at,
            (SELECT COUNT(*) FROM boards b WHERE b.owner_id = users.id) AS boards_count
       FROM users ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ rows, total: totalRows[0].total, page, pageSize });
}));

// GET /api/admin/users/:id  -> dettaglio + lavagne possedute + n. media
adminRouter.get('/users/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Id non valido' });

  const rows = await query('SELECT id, email, display_name, role, disabled_at, created_at FROM users WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });

  const boards = await query(
    `SELECT id, name, created_at, updated_at,
            (SELECT COUNT(*) FROM media_assets m WHERE m.board_id = boards.id) AS media_count
       FROM boards WHERE owner_id = ? ORDER BY updated_at DESC`,
    [id]
  );
  const media = await query('SELECT COUNT(*) AS total FROM media_assets WHERE uploader_id = ?', [id]);
  res.json({ user: rows[0], boards, media_count: media[0].total });
}));

// PATCH /api/admin/users/:id/role  { role }
adminRouter.patch('/users/:id/role', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Id non valido' });
  const { role } = req.body || {};
  if (role !== 'user' && role !== 'admin') return res.status(400).json({ error: 'Ruolo non valido' });

  const rows = await query('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });

  // Sicurezza: un admin non può rimuovere il proprio ruolo di amministratore.
  if (id === Number(req.user.id) && role !== 'admin') {
    return res.status(403).json({ error: 'Non puoi rimuovere il tuo ruolo di amministratore' });
  }

  await query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  await logAdminAction(req.user.id, 'user.role.change', 'user', id, { from: rows[0].role, to: role });
  res.json({ ok: true });
}));

// PATCH /api/admin/users/:id/disable
adminRouter.patch('/users/:id/disable', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Id non valido' });

  const rows = await query('SELECT id, disabled_at FROM users WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });

  // Sicurezza: un admin non può disattivare il proprio account.
  if (id === Number(req.user.id)) {
    return res.status(403).json({ error: 'Non puoi disattivare il tuo account' });
  }

  await query('UPDATE users SET disabled_at = NOW() WHERE id = ? AND disabled_at IS NULL', [id]);
  await logAdminAction(req.user.id, 'user.disable', 'user', id, null);
  res.json({ ok: true });
}));

// PATCH /api/admin/users/:id/enable
adminRouter.patch('/users/:id/enable', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Id non valido' });

  const rows = await query('SELECT id FROM users WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Utente non trovato' });

  await query('UPDATE users SET disabled_at = NULL WHERE id = ?', [id]);
  await logAdminAction(req.user.id, 'user.enable', 'user', id, null);
  res.json({ ok: true });
}));

// --- Lavagne ---

// GET /api/admin/boards?page&pageSize&q   (q cerca per nome lavagna o email proprietario)
adminRouter.get('/boards', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const q = (req.query.q || '').trim();

  const where = [];
  const params = [];
  if (q) {
    where.push('(b.name LIKE ? OR u.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRows = await query(
    `SELECT COUNT(*) AS total FROM boards b JOIN users u ON u.id = b.owner_id ${whereSql}`,
    params
  );
  const rows = await query(
    `SELECT b.id, b.name, b.created_at, b.updated_at,
            u.id AS owner_id, u.email AS owner_email, u.display_name AS owner_name,
            (SELECT COUNT(*) FROM board_collaborators c WHERE c.board_id = b.id) AS collaborators_count,
            (SELECT COUNT(*) FROM media_assets m WHERE m.board_id = b.id) AS media_count
       FROM boards b JOIN users u ON u.id = b.owner_id ${whereSql}
      ORDER BY b.updated_at DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ rows, total: totalRows[0].total, page, pageSize });
}));

// DELETE /api/admin/boards/:id  (hard delete; FK ON DELETE CASCADE pulisce il resto)
adminRouter.delete('/boards/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Id non valido' });

  const rows = await query('SELECT id, name FROM boards WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Lavagna non trovata' });

  await query('DELETE FROM boards WHERE id = ?', [id]);
  await logAdminAction(req.user.id, 'board.delete', 'board', id, { name: rows[0].name });
  res.json({ ok: true });
}));

// --- Audit log ---

// GET /api/admin/audit-log?page&pageSize
adminRouter.get('/audit-log', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const totalRows = await query('SELECT COUNT(*) AS total FROM admin_audit_log');
  const rows = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
            a.admin_id, u.email AS admin_email
       FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_id
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  res.json({ rows, total: totalRows[0].total, page, pageSize });
}));
