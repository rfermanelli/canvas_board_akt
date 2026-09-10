# Canvas Board — lavagna collaborativa a canvas infinito

Web app di **lavagna collaborativa** a canvas infinito (stile Figma/FigJam) per creatori di
contenuti: disegno, forme, testo, note, media (immagini/video/PDF/PPTX), collaborazione in
tempo reale con più utenti, condivisione con ruoli e modalità presentazione a scene.

Questo README descrive **la struttura del progetto**, **le tecnologie impiegate** e **la
configurazione di sistema** necessaria per eseguire l'applicazione.

---

## 1. Tecnologie impiegate

| Livello | Tecnologie |
|---|---|
| **Client** | React 18 + Vite; canvas con **Konva** / `react-konva`; real-time con **Yjs** (CRDT) + `y-websocket`; routing `react-router-dom`; icone `lucide-react` |
| **Server** | Node.js + **Express** (ESM); WebSocket real-time con **`y-websocket`** (+ `ws`); accesso DB con `mysql2`; auth con `jsonwebtoken` + `bcryptjs`; upload file con `multer` |
| **Database** | **MySQL 8** — metadati in tabelle relazionali; stato della lavagna come colonna **JSON** (snapshot del documento Yjs) |
| **Deploy** | **Docker Compose**: MySQL + server Node + **nginx** (serve la SPA buildata e fa da reverse proxy per `/api`, `/uploads`, `/yjs`) |
| **Conversione PPTX→PDF** | LibreOffice headless (`soffice`) dentro l'immagine del server |

---

## 2. Struttura del progetto

```
canvas_board_akt/
├─ docker-compose.yml          Orchestrazione: db (MySQL) + server (Node) + web (nginx)
├─ .env / .env.example         Variabili d'ambiente (segreti DB, JWT, porte, limiti upload)
├─ db/
│  └─ schema.sql               5 tabelle: users, boards, board_collaborators,
│                              board_content (colonna JSON), media_assets
├─ server/                     API REST + WebSocket real-time (Node/Express ESM)
│  ├─ Dockerfile
│  └─ src/
│     ├─ index.js              Bootstrap Express, static /uploads, error handler
│     ├─ config.js             Lettura/validazione env (fail-fast su JWT_SECRET)
│     ├─ db.js                 Pool mysql2 + ensureSchema
│     ├─ asyncHandler.js       Wrapper per inoltrare gli errori async all'error middleware
│     ├─ auth/                 register/login JWT, middleware permessi (autorizzazione)
│     ├─ boards/               CRUD board, condivisione/ruoli, load/save documento, duplica
│     ├─ media/                upload immagini/video/PDF/PPTX su filesystem + record in DB
│     └─ realtime/yjs.js       Server y-websocket: auth upgrade, sync doc, snapshot JSON su DB
└─ client/                     SPA React (Vite)
   ├─ Dockerfile               Build Vite + nginx
   ├─ nginx.conf               Serve la SPA + proxy /api, /uploads, /yjs (WebSocket)
   ├─ vite.config.js
   └─ src/
      ├─ main.jsx / App.jsx    Entry + routing
      ├─ api.js                Client REST (JWT in localStorage)
      ├─ auth.jsx              Context di autenticazione
      ├─ ui.js                 Toast e modali (askText/askConfirm)
      └─ pages/                Login, Register, Dashboard, Board (canvas)
```

### Modello dati (MySQL)
- **users** — account (email unica, password hashata bcrypt, display name).
- **boards** — lavagne, con `owner_id` (FK → users).
- **board_collaborators** — condivisione con ruoli `owner`/`editor`/`viewer` (PK composta board+utente).
- **board_content** — 1:1 con la board, colonna **JSON** `doc` = snapshot del documento Yjs.
- **media_assets** — file caricati (immagini/video/PDF/PPTX), riferimento a board e uploader.

---

## 3. Configurazione di sistema per eseguire l'applicazione

### Requisiti (percorso consigliato: Docker)
- **Docker** + **Docker Compose** (Docker Desktop su Windows/macOS, o Docker Engine su Linux).
- ~2 GB liberi per le immagini (l'immagine del server include LibreOffice per la conversione PPTX).
- Porta host **8080** libera (l'app è pubblicata lì).

### Variabili d'ambiente (`.env`)
Copiare `.env.example` in `.env` e **impostare valori sicuri** prima di qualsiasi uso reale:

| Variabile | Descrizione |
|---|---|
| `MYSQL_ROOT_PASSWORD` | Password root MySQL |
| `MYSQL_DATABASE` | Nome database (default `canvas_board`) |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Utente applicativo del DB |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Connessione del server al DB (in Docker `DB_HOST=db`) |
| `PORT` | Porta interna del server Node (default `4000`) |
| `JWT_SECRET` | **Segreto di firma dei token — obbligatorio, min 32 caratteri** (il server si rifiuta di avviarsi se manca/è corto) |
| `JWT_EXPIRES` | Durata token (es. `7d`) |
| `MAX_UPLOAD_MB` | Dimensione massima upload (MB) |

> ⚠️ In produzione **rigenerare** `JWT_SECRET` (es. `openssl rand -hex 32`) e le password DB con
> valori robusti, e **non** usare i valori di sviluppo del repo. Il file `.env` è escluso da git.

### Avvio con Docker (consigliato)
```bash
cp .env.example .env      # poi imposta i segreti
docker compose up --build -d
```
- App: **http://localhost:8080**
- Health API: **http://localhost:8080/api/health**
- Lo schema `db/schema.sql` viene applicato automaticamente da MySQL al **primo** avvio (volume vuoto).
- Fermare: `docker compose down` (aggiungere `-v` per azzerare anche i dati del DB e i media).

### Avvio in sviluppo (senza Docker)
Serve un **MySQL 8** raggiungibile con lo schema applicato (`mysql < db/schema.sql`).
```bash
# Terminale 1 — server (Node 20+)
cd server && npm install
DB_HOST=localhost DB_USER=canvas DB_PASSWORD=... DB_NAME=canvas_board \
  JWT_SECRET=<almeno-32-caratteri> npm run dev      # server su :4000

# Terminale 2 — client (proxy verso :4000 già configurato in vite.config.js)
cd client && npm install && npm run dev             # Vite dev server
```

---

## 4. Funzionalità principali
- **Autenticazione** email/password (JWT) + dashboard con CRUD delle lavagne.
- **Canvas infinito**: pan/zoom; strumenti rettangolo/ellisse/testo/penna/evidenziatore/nota/
  emoji/connettori; immagini, **video inline**, **PDF** e **PPTX** (con conversione a PDF);
  selezione singola/multipla, resize/rotazione, undo/redo, snapping, pannello livelli, export PNG.
- **Toolbar trascinabile** e orientabile (orizzontale/verticale), con posizione ricordata.
- **Real-time** (Yjs/CRDT): sincronizzazione senza conflitti, cursori e presenza; snapshot JSON
  persistito su MySQL lato server.
- **Condivisione con ruoli** owner/editor/viewer, applicati lato server.
- **Scene / presentazione**: sequenza di inquadrature con navigazione a scene.

---

## 5. Note su sicurezza e produzione
- Terminare **TLS/HTTPS** davanti a nginx (es. Caddy/Traefik/certbot) per il deploy remoto.
- Restringere il **CORS** del server all'origine reale.
- Rigenerare tutti i **segreti** (`JWT_SECRET`, password DB) e non versionarli.
- I media sono serviti con `X-Content-Type-Options: nosniff` (e gli SVG come download) per
  ridurre il rischio XSS same-origin.

---

Per la documentazione tecnica di dettaglio vedere `docs/Documentazione_Tecnica.docx`.
