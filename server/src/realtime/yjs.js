import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';
import { config } from '../config.js';
import { query } from '../db.js';
import { getBoardRole } from '../auth/middleware.js';

// Real-time collaborativo via Yjs (CRDT) + y-websocket (Fase 3).
//
// - Un Y.Doc per board; gli oggetti stanno in ymap('objects') (id -> oggetto).
// - Presenza e cursori: awareness di Yjs (dati effimeri, non persistiti).
// - Persistenza: hook setPersistence che semina il doc dal JSON in MySQL al primo
//   collegamento e risalva (debounced) un SNAPSHOT JSON in board_content.doc.
//   Così il requisito "stato come documento JSON in MySQL" resta soddisfatto.
//
// NOTA import: usiamo createRequire per caricare y-websocket/bin/utils (modulo CJS)
// in modo affidabile da ESM, evitando problemi di risoluzione dei subpath.
//
// TODO sicurezza: l'autorizzazione ad APRIRE la board è applicata qui sull'upgrade.
// Il blocco-scrittura per i viewer sul canale Yjs NON è ancora fatto (Yjs non lo
// offre nativamente): andrebbe filtrando i messaggi di update per ruolo 'viewer'.
const require = createRequire(import.meta.url);
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');

const saveTimers = new Map();

export function initYjs(httpServer) {
  setPersistence({
    // Chiamato una volta per doc (al primo client): semina dal DB e registra il salvataggio.
    bindState: async (docName, ydoc) => {
      const boardId = docName;
      const rows = await query('SELECT doc FROM board_content WHERE board_id = ?', [boardId]);
      const doc = rows[0]?.doc;
      const ymap = ydoc.getMap('objects');
      if (doc && Array.isArray(doc.objects) && ymap.size === 0) {
        ydoc.transact(() => { for (const o of doc.objects) ymap.set(o.id, o); });
      }
      ydoc.on('update', () => scheduleSave(boardId, ydoc));
    },
    writeState: async (docName, ydoc) => { await persist(docName, ydoc); },
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return socket.destroy(); }
    if (!url.pathname.startsWith('/yjs/')) return; // upgrade non destinato a Yjs
    const boardId = url.pathname.split('/')[2];
    const token = url.searchParams.get('token');
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { return socket.destroy(); }
    // getBoardRole tocca il DB: un errore qui non deve diventare unhandledRejection
    // (che terminerebbe il processo); su errore chiudiamo il socket in modo pulito.
    try {
      const role = await getBoardRole(boardId, payload.sub);
      if (!role) return socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, boardId));
    } catch (e) {
      console.error('yjs upgrade: errore autorizzazione', e.message);
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req, boardId) => {
    setupWSConnection(ws, req, { docName: boardId, gc: true });
  });
}

function scheduleSave(boardId, ydoc) {
  clearTimeout(saveTimers.get(boardId));
  saveTimers.set(boardId, setTimeout(() => persist(boardId, ydoc).catch(console.error), 2000));
}

async function persist(boardId, ydoc) {
  const objects = Array.from(ydoc.getMap('objects').values());
  await query(
    `INSERT INTO board_content (board_id, doc) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE doc = VALUES(doc)`,
    [boardId, JSON.stringify({ version: 1, objects })]
  );
  await query('UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [boardId]);
}
