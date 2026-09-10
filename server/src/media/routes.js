import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { query } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { asyncHandler } from '../asyncHandler.js';

const execFileP = promisify(execFile);

// Converte un .pptx (o .ppt) in PDF con LibreOffice headless, così è sfogliabile in-canvas.
// Ritorna l'URL del PDF generato, o null se la conversione fallisce (l'upload resta valido).
async function pptxToPdf(uploadDir, filename) {
  try {
    await execFileP('soffice', ['--headless', '-env:UserInstallation=file:///tmp/lo', '--convert-to', 'pdf', '--outdir', uploadDir, path.join(uploadDir, filename)], { timeout: 90000 });
    const pdfName = filename.replace(/\.[^.]+$/, '.pdf');
    await fs.access(path.join(uploadDir, pdfName));
    return `/uploads/${pdfName}`;
  } catch (e) {
    console.error('pptxToPdf: conversione fallita', e.message);
    return null;
  }
}

export const mediaRouter = Router();

const UPLOAD_DIR = path.resolve('uploads');
const ALLOWED = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/gif': 'image', 'image/webp': 'image', 'image/svg+xml': 'image',
  'video/mp4': 'video', 'video/webm': 'video',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', // .pptx
  'application/vnd.ms-powerpoint': 'pptx', // .ppt
};

// Estensione derivata dal MIME (in whitelist), NON da originalname: impedisce di
// salvare come .html un file con mimetype spoofato e servirlo come eseguibile.
const EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'video/mp4': '.mp4', 'video/webm': '.webm',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-powerpoint': '.ppt',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomBytes(8).toString('hex');
    cb(null, id + (EXT[file.mimetype] || ''));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

// POST /api/media  (multipart, campo "file", opzionale boardId)
// Salva il binario su filesystem e il RIFERIMENTO in DB. Ritorna l'url da mettere nel canvas.
mediaRouter.post('/', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File mancante o formato non supportato' });
  const kind = ALLOWED[req.file.mimetype];
  const url = `/uploads/${req.file.filename}`;
  const boardId = req.body.boardId || null;
  const result = await query(
    `INSERT INTO media_assets (board_id, uploader_id, kind, filename, mime, size_bytes, url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [boardId, req.user.id, kind, req.file.originalname, req.file.mimetype, req.file.size, url]
  );
  // Per i .pptx genera anche un PDF sfogliabile in-canvas (best-effort).
  const pdfUrl = kind === 'pptx' ? await pptxToPdf(UPLOAD_DIR, req.file.filename) : null;
  res.status(201).json({ id: result.insertId, kind, url, pdfUrl });
}));

// Nota: i file statici in /uploads sono serviti da index.js.
// TODO (Fase 5): storage object-compatibile (S3/MinIO) al posto del filesystem.
