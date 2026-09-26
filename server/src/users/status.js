// Ciclo di vita di un account utente. UNICO punto di verità per gli stati ammessi
// e per le transizioni consentite: ogni cambio di stato deve passare da
// assertTransition(), così una transizione non prevista viene rifiutata invece di
// scrivere silenziosamente uno stato incoerente.

export const USER_STATUSES = [
  'pending_verification', // registrato, email non ancora verificata
  'pending_approval',     // email verificata, in attesa di un amministratore
  'active',               // approvato: può accedere
  'rejected',             // respinto da un amministratore
  'suspended',            // sospeso da un amministratore dopo essere stato attivo
];

// Grafo delle transizioni consentite (from -> [to ammessi]). Contiene solo le
// transizioni realmente eseguite dal codice: aggiungerne di nuove (es. la
// riattivazione suspended -> active) significa dichiararle qui, in un solo posto.
const ALLOWED = {
  pending_verification: ['pending_approval'], // verifica email
  pending_approval: ['active', 'rejected'],   // approvazione / rifiuto admin
  active: ['suspended'],                       // sospensione admin
  suspended: [],
  rejected: [],
};

export function canTransition(from, to) {
  return Array.isArray(ALLOWED[from]) && ALLOWED[from].includes(to);
}

// Lancia un errore (409) se la transizione non è ammessa. L'error handler
// centralizzato di Express trasforma err.status/err.message nella risposta.
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Transizione di stato non consentita: ${from} → ${to}`);
    err.status = 409;
    throw err;
  }
}
