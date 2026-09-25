import mysql from 'mysql2/promise';
import { config } from './config.js';

// Pool condiviso. mysql2 gestisce il tipo JSON: in lettura torna già un oggetto,
// in scrittura passare una stringa JSON.stringify(...).
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
});

// Helper: esegue una query e ritorna solo le righe.
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Migrazioni idempotenti applicate all'avvio (per DB già esistenti: schema.sql
// viene applicato solo alla PRIMA inizializzazione del volume MySQL).
export async function ensureSchema() {
  // Consente i tipi 'pdf' e 'pptx' fra i media (documenti sfogliabili / presentazioni sul canvas).
  await pool.query(
    "ALTER TABLE media_assets MODIFY kind ENUM('image','video','pdf','pptx') NOT NULL"
  ).catch((e) => console.error('ensureSchema:', e.message));

  // Ruolo globale + soft-disable sugli utenti (DB già esistenti). MySQL 8 non supporta
  // ADD COLUMN IF NOT EXISTS: eseguo l'ALTER e ignoro l'errore "Duplicate column" se già presente.
  await pool.query(
    "ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'"
  ).catch((e) => { if (!/Duplicate column/i.test(e.message)) console.error('ensureSchema:', e.message); });
  await pool.query(
    'ALTER TABLE users ADD COLUMN disabled_at DATETIME NULL'
  ).catch((e) => { if (!/Duplicate column/i.test(e.message)) console.error('ensureSchema:', e.message); });

  // Log delle azioni amministrative.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      admin_id    BIGINT UNSIGNED NULL,
      action      VARCHAR(64) NOT NULL,
      entity_type VARCHAR(32) NOT NULL,
      entity_id   BIGINT UNSIGNED NULL,
      details     JSON NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_audit_created (created_at),
      CONSTRAINT fk_audit_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch((e) => console.error('ensureSchema:', e.message));

  // Tabella dei token per il recupero password (DB già esistenti senza schema.sql aggiornato).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id     BIGINT UNSIGNED NOT NULL,
      token_hash  CHAR(64) NOT NULL,
      expires_at  DATETIME NOT NULL,
      used_at     DATETIME NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_prt_token (token_hash),
      KEY idx_prt_user (user_id),
      CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch((e) => console.error('ensureSchema:', e.message));
}
