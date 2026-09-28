import { query } from '../db.js';

// Registra un'azione dell'utente nel suo log attività personale (mostrato nel pannello
// utente in /account/activity). Best-effort: un errore di logging non deve mai far
// fallire l'operazione già andata a buon fine (solo console.error), come per logAdminAction.
export async function logUserActivity(userId, action, entityType, entityId, details) {
  await query(
    'INSERT INTO user_activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId ?? null, details ? JSON.stringify(details) : null]
  ).catch((e) => console.error('user activity:', e.message));
}
