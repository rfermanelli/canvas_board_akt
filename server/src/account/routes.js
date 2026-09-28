import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../asyncHandler.js';

// Pannello UTENTE (non admin): espone SOLO i dati del richiedente. Ogni query filtra
// per req.user.id → un utente non può mai vedere lavagne/media/attività di altri.
// Protetto dal solo requireAuth (qualsiasi account attivo), NON da requireAdmin.
export const accountRouter = Router();
accountRouter.use(requireAuth);

// Paginazione con limiti (default 20, max 100), come nel pannello admin.
function pagination(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// GET /api/account/boards?page&pageSize&q  -> lavagne di cui sono owner O collaboratore
accountRouter.get('/boards', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const uid = req.user.id;
  const q = (req.query.q || '').trim();
  const nameSql = q ? 'AND b.name LIKE ?' : '';
  const qParam = q ? [`%${q}%`] : [];

  const totalRows = await query(
    `SELECT COUNT(*) AS total
       FROM boards b
       LEFT JOIN board_collaborators bc ON bc.board_id = b.id AND bc.user_id = ?
      WHERE (b.owner_id = ? OR bc.user_id = ?) ${nameSql}`,
    [uid, uid, uid, ...qParam]
  );
  const rows = await query(
    `SELECT b.id, b.name, b.created_at, b.updated_at,
            CASE WHEN b.owner_id = ? THEN 'owner' ELSE COALESCE(bc.role, 'viewer') END AS role,
            (SELECT COUNT(*) FROM board_collaborators c WHERE c.board_id = b.id) AS collaborators_count,
            (SELECT COUNT(*) FROM media_assets m WHERE m.board_id = b.id) AS media_count
       FROM boards b
       LEFT JOIN board_collaborators bc ON bc.board_id = b.id AND bc.user_id = ?
      WHERE (b.owner_id = ? OR bc.user_id = ?) ${nameSql}
      ORDER BY b.updated_at DESC
      LIMIT ? OFFSET ?`,
    [uid, uid, uid, uid, ...qParam, pageSize, offset]
  );
  res.json({ rows, total: totalRows[0].total, page, pageSize });
}));

// GET /api/account/media?page&pageSize&q&kind  -> i media caricati da me
accountRouter.get('/media', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const uid = req.user.id;
  const q = (req.query.q || '').trim();
  const kind = req.query.kind;

  const where = ['m.uploader_id = ?'];
  const params = [uid];
  if (q) {
    where.push('(m.filename LIKE ? OR b.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (['image', 'video', 'pdf', 'pptx'].includes(kind)) {
    where.push('m.kind = ?');
    params.push(kind);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const totalRows = await query(
    `SELECT COUNT(*) AS total
       FROM media_assets m LEFT JOIN boards b ON b.id = m.board_id ${whereSql}`,
    params
  );
  const rows = await query(
    `SELECT m.id, m.kind, m.filename, m.mime, m.size_bytes, m.url, m.created_at,
            m.board_id, b.name AS board_name
       FROM media_assets m LEFT JOIN boards b ON b.id = m.board_id
       ${whereSql}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  res.json({ rows, total: totalRows[0].total, page, pageSize });
}));

// GET /api/account/activity?page&pageSize  -> il mio log attività personale
accountRouter.get('/activity', asyncHandler(async (req, res) => {
  const { page, pageSize, offset } = pagination(req);
  const uid = req.user.id;
  const totalRows = await query('SELECT COUNT(*) AS total FROM user_activity_log WHERE user_id = ?', [uid]);
  const rows = await query(
    `SELECT id, action, entity_type, entity_id, details, created_at
       FROM user_activity_log WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?`,
    [uid, pageSize, offset]
  );
  res.json({ rows, total: totalRows[0].total, page, pageSize });
}));
