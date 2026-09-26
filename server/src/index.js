import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { config } from './config.js';
import { ensureSchema } from './db.js';
import { authRouter } from './auth/routes.js';
import { boardsRouter } from './boards/routes.js';
import { mediaRouter } from './media/routes.js';
import { adminRouter } from './admin/routes.js';
import { initYjs } from './realtime/yjs.js';

const app = express();
// Dietro il reverse proxy nginx: fidati di 1 hop per leggere l'IP reale del client
// (X-Forwarded-For), così il rate limiting per-IP del login non conta tutti come un solo IP.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/admin', adminRouter);

// File media caricati (Fase 5: sostituibile con storage object-compatibile).
app.use('/uploads', express.static(path.resolve('uploads'), {
  setHeaders: (res, filePath) => {
    // nosniff su tutto (niente MIME-sniffing verso HTML). Gli SVG, unico tipo
    // eseguibile same-origin, sono forzati in download; pdf/immagini/video restano
    // inline così PDF e preview pptx si vedono in-canvas.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (path.extname(filePath).toLowerCase() === '.svg') {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// Handler errori centralizzato (es. limite dimensione upload di multer).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Errore interno' });
});

const server = http.createServer(app);
initYjs(server);

ensureSchema().finally(() => {
  server.listen(config.port, () => {
    console.log(`Server in ascolto sulla porta ${config.port}`);
  });
});
