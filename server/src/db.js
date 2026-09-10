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
}
