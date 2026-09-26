import nodemailer from 'nodemailer';
import { config } from './config.js';

// Servizio di invio email isolato e facilmente sostituibile (oggi SMTP diretto via
// nodemailer; domani una coda o un provider esterno cambierebbero solo questo file).
// Se SMTP non è configurato (config.smtp.host vuoto) l'invio è un no-op con warning:
// le feature che inviano email restano invocabili anche senza un server SMTP.

// Helper interno: invia una singola email. Ritorna true se inviata, false se saltata
// per SMTP non configurato. Non rilancia: l'errore viene solo loggato (gli inviti sono
// best-effort e non devono far fallire l'operazione applicativa che li ha richiesti).
async function sendMail({ to, subject, text, html }) {
  if (!config.smtp.host) {
    console.warn(`SMTP non configurato: email "${subject}" NON inviata (configurare SMTP_* per abilitarla).`);
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
    return true;
  } catch (e) {
    console.error(`Invio email "${subject}" fallito:`, e.message);
    return false;
  }
}

// Reset password.
export async function sendPasswordResetEmail(toEmail, resetUrl) {
  const text = `Hai richiesto di reimpostare la password.\n\n`
    + `Apri questo link entro ${config.resetTokenTtlMin} minuti per sceglierne una nuova:\n${resetUrl}\n\n`
    + `Se non hai richiesto tu il reset, ignora pure questa email.`;
  const html = `<p>Hai richiesto di reimpostare la password.</p>`
    + `<p>Apri questo link entro ${config.resetTokenTtlMin} minuti per sceglierne una nuova:</p>`
    + `<p><a href="${resetUrl}">${resetUrl}</a></p>`
    + `<p>Se non hai richiesto tu il reset, ignora pure questa email.</p>`;
  return sendMail({ to: toEmail, subject: 'Reimposta la tua password', text, html });
}

// Verifica email in registrazione.
export async function sendVerificationEmail(toEmail, verifyUrl) {
  const hours = Math.round(config.emailVerificationTtlMin / 60);
  const text = `Grazie per esserti registrato su Canvas Board AKT.\n\n`
    + `Conferma il tuo indirizzo email aprendo questo link entro ${hours} ore:\n${verifyUrl}\n\n`
    + `Dopo la verifica, un amministratore dovrà approvare l'account prima del primo accesso.\n`
    + `Se non ti sei registrato tu, ignora pure questa email.`;
  const html = `<p>Grazie per esserti registrato su Canvas Board AKT.</p>`
    + `<p>Conferma il tuo indirizzo email aprendo questo link entro ${hours} ore:</p>`
    + `<p><a href="${verifyUrl}">${verifyUrl}</a></p>`
    + `<p>Dopo la verifica, un amministratore dovrà approvare l'account prima del primo accesso.</p>`
    + `<p>Se non ti sei registrato tu, ignora pure questa email.</p>`;
  return sendMail({ to: toEmail, subject: 'Conferma il tuo indirizzo email', text, html });
}

// Notifica agli amministratori: nuovo utente in attesa di approvazione.
export async function sendNewUserPendingNotification(adminEmails, user) {
  if (!adminEmails || adminEmails.length === 0) return false;
  const who = `${user.display_name || ''} <${user.email}>`.trim();
  const adminUrl = `${config.appBaseUrl}/admin/users?status=pending_approval`;
  const text = `Un nuovo utente ha verificato l'email ed è in attesa di approvazione:\n${who}\n\n`
    + `Gestisci le richieste dal pannello di amministrazione:\n${adminUrl}`;
  const html = `<p>Un nuovo utente ha verificato l'email ed è in attesa di approvazione:</p>`
    + `<p><strong>${who}</strong></p>`
    + `<p>Gestisci le richieste dal <a href="${adminUrl}">pannello di amministrazione</a>.</p>`;
  return sendMail({ to: adminEmails, subject: 'Nuovo utente in attesa di approvazione', text, html });
}

// Esito approvazione all'utente.
export async function sendApprovalEmail(toEmail) {
  const loginUrl = `${config.appBaseUrl}/login`;
  const text = `Il tuo account è stato approvato. Ora puoi accedere:\n${loginUrl}`;
  const html = `<p>Il tuo account è stato approvato. Ora puoi accedere:</p>`
    + `<p><a href="${loginUrl}">${loginUrl}</a></p>`;
  return sendMail({ to: toEmail, subject: 'Account approvato', text, html });
}

// Esito rifiuto all'utente (con eventuale motivazione).
export async function sendRejectionEmail(toEmail, reason) {
  const motivo = reason ? `\n\nMotivazione: ${reason}` : '';
  const text = `La tua richiesta di accesso non è stata approvata.${motivo}`;
  const html = `<p>La tua richiesta di accesso non è stata approvata.</p>`
    + (reason ? `<p>Motivazione: ${reason}</p>` : '');
  return sendMail({ to: toEmail, subject: 'Richiesta di accesso non approvata', text, html });
}

// Notifica di sospensione all'utente.
export async function sendSuspensionEmail(toEmail) {
  const text = `Il tuo account è stato sospeso. Per informazioni contatta un amministratore.`;
  const html = `<p>Il tuo account è stato sospeso. Per informazioni contatta un amministratore.</p>`;
  return sendMail({ to: toEmail, subject: 'Account sospeso', text, html });
}
