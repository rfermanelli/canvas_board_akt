# Prompt — Web app "lavagna collaborativa" per creatori di contenuti

## 1. Obiettivo
Realizza una web app di **lavagna collaborativa a canvas infinito** ispirata all'esperienza d'uso di Figma, pensata per **creatori di contenuti**. Deve funzionare come spazio di lavoro visivo generico per: moodboard, storyboard, pianificazione di contenuti video/social, brainstorming visivo e organizzazione di riferimenti. L'app è multiutente, persistente e accessibile da browser.

## 2. Canvas e strumenti
Tela a **zoom e pan infiniti**. L'utente deve poter creare e manipolare i seguenti oggetti:
- **Testo**: caselle di testo libere e note, con controllo di dimensione, colore e allineamento.
- **Disegno a mano libera**: penna con spessore e colore regolabili; gomma.
- **Forme geometriche**: rettangolo, ellisse/cerchio, linea, poligono, con riempimento, bordo e opacità.
- **Frecce e connettori**: frecce dritte e a gomito; i connettori possono agganciarsi agli oggetti e seguirli quando vengono spostati.
- **Immagini**: caricamento di file (upload) e inserimento da URL.
- **Video**: caricamento di file e inserimento da URL/embed (es. YouTube); i video devono essere **riproducibili direttamente all'interno del canvas** (play/pausa inline).

Manipolazione oggetti (comportamento in stile Figma — sono richieste tutte le funzioni):
- Selezione singola e multipla (click, shift-click, selezione ad area).
- Spostamento, ridimensionamento con maniglie, rotazione, eliminazione.
- Copia / incolla / duplica.
- Raggruppamento e separazione.
- Gestione livelli e ordine di sovrapposizione (porta avanti/indietro), con pannello livelli.
- Guide di allineamento e snapping.
- Undo / redo.

## 3. Modello multiutente (account privati + collaborazione real-time + condivisione)
- **Account privati**: ogni utente ha le proprie lavagne, non visibili ad altri se non esplicitamente condivise.
- **Collaborazione in tempo reale**: più utenti possono lavorare simultaneamente sulla stessa lavagna, con sincronizzazione live delle modifiche, cursori degli altri utenti visibili e indicatore di presenza (chi è online sulla board).
- **Condivisione con permessi**: una lavagna può essere condivisa tramite link o invito, con ruoli **proprietario / editor (può modificare) / visualizzatore (sola lettura)**. I permessi devono essere applicati lato server.

Per la sincronizzazione collaborativa senza conflitti si consiglia un approccio **CRDT (es. Yjs)** con trasporto via **WebSocket**; presenza e cursori sono dati effimeri (non persistiti).

## 4. Persistenza e dashboard
- Tutte le lavagne sono salvate su backend e sopravvivono alla sessione.
- **Database: MySQL** (requisito fisso). Lo stato di ogni lavagna può essere salvato come documento JSON per board (MySQL 8, tipo JSON), con salvataggi periodici e a ogni modifica/chiusura; i metadati (proprietario, collaboratori, permessi, date) in tabelle relazionali.
- **Dashboard utente**: elenco delle lavagne dell'utente (proprie + condivise con lui), ciascuna con nome, data di creazione e data di ultima modifica. Azioni: crea, apri, rinomina, duplica, elimina, condividi.
- Nota di scope: è richiesto **solo l'elenco delle lavagne** dell'utente; **non** è richiesta la cronologia delle versioni della singola lavagna.

Modello dati minimo suggerito: `users`, `boards`, `board_collaborators` (relazione utente–board + ruolo), `board_content` (stato serializzato), `media_assets` (riferimenti a immagini/video caricati).

## 5. Media caricati
I file immagine/video caricati vanno archiviati (filesystem del server o storage object-compatibile) con riferimento in DB; nel canvas si salva il riferimento, non il binario. Gestire limiti di dimensione e formati supportati.

## 6. Autenticazione
Autenticazione obbligatoria: registrazione e login con **email + password**, con hashing sicuro delle password (es. bcrypt) e gestione della sessione via cookie di sessione o JWT. Opzionale ma gradito: login con Google (OAuth). API e risorse devono essere protette e autorizzate in base ai permessi sulla board.

## 7. Requisiti non-funzionali
- **Deployment**: l'app deve essere deployabile ed eseguita su una **macchina server remota**. Prevedere containerizzazione (Docker), reverse proxy (es. nginx) e HTTPS.
- **Supporto mobile (gradito)**: interfaccia responsive con supporto touch — pan/zoom con pinch, disegno e manipolazione oggetti da touchscreen.
- **Export (desiderabile)**: esportazione della lavagna o di una selezione in PNG / PDF / SVG.
- Prestazioni fluide su canvas con molti oggetti; salvataggio robusto senza perdita di lavoro in caso di disconnessione.

## 8. Stack consigliato (adattabile — vincoli fissi: MySQL + server remoto)
- **Frontend**: framework SPA (es. React) con libreria canvas (es. Konva.js / Fabric.js, oppure tldraw come base) per la resa grafica.
- **Backend**: Node.js (Express o NestJS) con server WebSocket (es. Socket.io) per la collaborazione real-time.
- **Stato real-time**: Yjs (CRDT) con persistenza periodica su MySQL.
- **Database**: MySQL.

## 9. Ordine di realizzazione consigliato
Poiché sono richieste tutte le funzionalità, si suggerisce di costruire in fasi:
1. Autenticazione + dashboard + CRUD lavagne (persistenza MySQL).
2. Canvas single-user con tutti gli strumenti (testo, penna, forme, frecce, immagini, video inline) e manipolazione oggetti.
3. Collaborazione real-time (sync, cursori, presenza).
4. Condivisione con permessi (link/inviti, ruoli).
5. Rifiniture: supporto mobile, export, ottimizzazioni prestazionali.
