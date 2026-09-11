import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { query, pool } from '../db.js';
import { requireAuth, requireBoardRole } from '../auth/middleware.js';
import { asyncHandler } from '../asyncHandler.js';

const UPLOAD_DIR = path.resolve('uploads');

export const boardsRouter = Router();
boardsRouter.use(requireAuth);

// Documento vuoto di default per una nuova lavagna.
const EMPTY_DOC = { version: 1, objects: [] };

// GET /api/boards  -> lavagne dell'utente (proprie + condivise)
boardsRouter.get('/', asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const rows = await query(
    `SELECT b.id, b.name, b.created_at, b.updated_at,
            CASE WHEN b.owner_id = ? THEN 'owner'
                 ELSE COALESCE(bc.role, 'viewer') END AS role
       FROM boards b
       LEFT JOIN board_collaborators bc ON bc.board_id = b.id AND bc.user_id = ?
      WHERE b.owner_id = ? OR bc.user_id = ?
      ORDER BY b.updated_at DESC`,
    [uid, uid, uid, uid]
  );
  res.json(rows);
}));

// POST /api/boards  { name }  -> crea (+ documento vuoto)
boardsRouter.post('/', asyncHandler(async (req, res) => {
  const name = (req.body?.name || 'Senza titolo').slice(0, 200);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO boards (owner_id, name) VALUES (?, ?)', [req.user.id, name]);
    await conn.query('INSERT INTO board_content (board_id, doc) VALUES (?, ?)', [r.insertId, JSON.stringify(EMPTY_DOC)]);
    await conn.commit();
    res.status(201).json({ id: r.insertId, name, role: 'owner' });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// GET /api/boards/:id  -> metadati + documento (>= viewer)
boardsRouter.get('/:id', asyncHandler(requireBoardRole('viewer')), asyncHandler(async (req, res) => {
  const meta = await query('SELECT id, name, owner_id, created_at, updated_at FROM boards WHERE id = ?', [req.params.id]);
  const content = await query('SELECT doc FROM board_content WHERE board_id = ?', [req.params.id]);
  res.json({ ...meta[0], role: req.boardRole, doc: content[0]?.doc ?? EMPTY_DOC });
}));

// PUT /api/boards/:id  { name?, doc? }  -> rinomina e/o salva stato (>= editor)
boardsRouter.put('/:id', asyncHandler(requireBoardRole('editor')), asyncHandler(async (req, res) => {
  const { name, doc } = req.body || {};
  if (typeof name === 'string') {
    await query('UPDATE boards SET name = ? WHERE id = ?', [name.slice(0, 200), req.params.id]);
  }
  if (doc !== undefined) {
    await query(
      `INSERT INTO board_content (board_id, doc) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE doc = VALUES(doc)`,
      [req.params.id, JSON.stringify(doc)]
    );
    await query('UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  }
  res.json({ ok: true });
}));

// Copia una lavagna nello spazio DB di `ownerId`: nuova board di sua proprietà, con TUTTO il
// contenuto (testo, note, tratti penna/evidenziatore vivono nel doc JSON e sono copiati così
// come sono) e i media caricati (/uploads) duplicati su disco + righe media_assets a suo nome,
// con gli URL riscritti nel doc. Gli URL esterni (YouTube, immagini via URL) restano invariati.
// I write passano da `conn` (transazione del chiamante); ritorna l'id della nuova board.
async function copyBoardInto(conn, srcId, ownerId, newName) {
  const content = await query('SELECT doc FROM board_content WHERE board_id = ?', [srcId]);
  const srcMedia = await query('SELECT kind, filename, mime, size_bytes, url FROM media_assets WHERE board_id = ?', [srcId]);
  const doc = content[0]?.doc ?? EMPTY_DOC;
  const byUrl = new Map(srcMedia.map((m) => [m.url, m]));
  const [r] = await conn.query('INSERT INTO boards (owner_id, name) VALUES (?, ?)', [ownerId, newName]);
  const newId = r.insertId;

  // Copia dei file /uploads referenziati dagli oggetti e riscrittura degli URL.
  const urlMap = new Map(); // vecchio url -> nuovo url
  for (const o of (doc.objects || [])) {
    const url = o.src;
    if (typeof url !== 'string' || !url.startsWith('/uploads/') || urlMap.has(url)) continue;
    const media = byUrl.get(url);
    // Sicurezza: solo il basename (niente componenti di path) + verifica che il
    // sorgente resti dentro UPLOAD_DIR, per impedire path traversal via o.src.
    const oldName = path.basename(url.slice('/uploads/'.length));
    const srcPath = path.join(UPLOAD_DIR, oldName);
    if (!srcPath.startsWith(UPLOAD_DIR + path.sep)) continue;
    const copyName = crypto.randomBytes(8).toString('hex') + path.extname(oldName);
    try {
      await fs.copyFile(srcPath, path.join(UPLOAD_DIR, copyName));
    } catch (err) {
      console.error('copyBoardInto: copia media fallita', oldName, err.message);
      continue; // file mancante: lascia l'URL originale
    }
    const newUrl = `/uploads/${copyName}`;
    await conn.query(
      `INSERT INTO media_assets (board_id, uploader_id, kind, filename, mime, size_bytes, url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, ownerId, media?.kind || 'image', media?.filename || copyName, media?.mime || '', media?.size_bytes || 0, newUrl]
    );
    urlMap.set(url, newUrl);
  }
  const newDoc = {
    ...doc,
    objects: (doc.objects || []).map((o) => (urlMap.has(o.src) ? { ...o, src: urlMap.get(o.src) } : o)),
  };
  await conn.query('INSERT INTO board_content (board_id, doc) VALUES (?, ?)', [newId, JSON.stringify(newDoc)]);
  return newId;
}

// POST /api/boards/:id/duplicate  (>= viewer: chi può vederla può duplicarla come propria)
boardsRouter.post('/:id/duplicate', asyncHandler(requireBoardRole('viewer')), asyncHandler(async (req, res) => {
  const src = await query('SELECT name FROM boards WHERE id = ?', [req.params.id]);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const newId = await copyBoardInto(conn, req.params.id, req.user.id, `${src[0].name} (copia)`);
    await conn.commit();
    res.status(201).json({ id: newId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// DELETE /api/boards/:id  (solo owner)
boardsRouter.delete('/:id', asyncHandler(requireBoardRole('owner')), asyncHandler(async (req, res) => {
  await query('DELETE FROM boards WHERE id = ?', [req.params.id]); // FK ON DELETE CASCADE pulisce il resto
  res.json({ ok: true });
}));

// --- Condivisione / permessi ---

// GET /api/boards/:id/collaborators  (>= viewer)
boardsRouter.get('/:id/collaborators', asyncHandler(requireBoardRole('viewer')), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.email, u.display_name, bc.role
       FROM board_collaborators bc JOIN users u ON u.id = bc.user_id
      WHERE bc.board_id = ?`,
    [req.params.id]
  );
  res.json(rows);
}));

// GET /api/boards/:id/user-exists?email=...  (solo owner) -> { exists }
// Usato dal flusso di condivisione per proporre la scelta del ruolo solo se
// l'email è già registrata. (Stessa info già ottenibile dal 404 di /share.)
boardsRouter.get('/:id/user-exists', asyncHandler(requireBoardRole('owner')), asyncHandler(async (req, res) => {
  const users = await query('SELECT 1 FROM users WHERE email = ?', [req.query.email || '']);
  res.json({ exists: users.length > 0 });
}));

// POST /api/boards/:id/share  { email, role }  (solo owner)
boardsRouter.post('/:id/share', asyncHandler(requireBoardRole('owner')), asyncHandler(async (req, res) => {
  const { email, role } = req.body || {};
  if (!['editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Ruolo non valido' });
  const users = await query('SELECT id FROM users WHERE email = ?', [email]);
  if (!users.length) return res.status(404).json({ error: 'Utente non trovato' });
  const targetId = users[0].id;
  // Distinguo una condivisione NUOVA da un semplice cambio ruolo: la copia va creata solo la
  // prima volta (altrimenti ogni cambio ruolo genererebbe copie doppie).
  const existing = await query('SELECT 1 FROM board_collaborators WHERE board_id = ? AND user_id = ?', [req.params.id, targetId]);
  await query(
    `INSERT INTO board_collaborators (board_id, user_id, role) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [req.params.id, targetId, role]
  );
  // Alla prima condivisione, copia i contenuti (testo/note/penna/evidenziatore nel doc + media
  // a suo nome) nello spazio DB del ricevente, OLTRE all'accesso live alla lavagna condivisa.
  // Best-effort: se la copia fallisce, la condivisione resta comunque valida (solo log).
  if (!existing.length && targetId !== req.user.id) {
    const src = await query('SELECT name FROM boards WHERE id = ?', [req.params.id]);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await copyBoardInto(conn, req.params.id, targetId, `${src[0].name} (copia condivisa)`);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error('share: copia nello spazio del ricevente fallita', e.message);
    } finally {
      conn.release();
    }
  }
  res.json({ ok: true });
}));

// DELETE /api/boards/:id/share/:userId  (solo owner)
boardsRouter.delete('/:id/share/:userId', asyncHandler(requireBoardRole('owner')), asyncHandler(async (req, res) => {
  await query('DELETE FROM board_collaborators WHERE board_id = ? AND user_id = ?', [req.params.id, req.params.userId]);
  res.json({ ok: true });
}));

// TODO (Fase 4): condivisione via link con token (accesso senza invito diretto).
