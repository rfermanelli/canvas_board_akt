import nodemailer from 'nodemailer';
import { config } from './config.js';

// Invia l'email di reset password. Se SMTP non è configurato, non fa nulla
// (feature non-bloccante: il flusso di reset resta invocabile ma non recapita).
export async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!config.smtp.host) {
    console.warn('SMTP non configurato: email di reset NON inviata (configurare SMTP_* per abilitarla).');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });

  const text = `Hai richiesto di reimpostare la password.\n\n`
    + `Apri questo link entro ${config.resetTokenTtlMin} minuti per sceglierne una nuova:\n${resetUrl}\n\n`
    + `Se non hai richiesto tu il reset, ignora pure questa email.`;
  const html = `<p>Hai richiesto di reimpostare la password.</p>`
    + `<p>Apri questo link entro ${config.resetTokenTtlMin} minuti per sceglierne una nuova:</p>`
    + `<p><a href="${resetUrl}">${resetUrl}</a></p>`
    + `<p>Se non hai richiesto tu il reset, ignora pure questa email.</p>`;

  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to: toEmail,
      subject: 'Reimposta la tua password',
      text,
      html,
    });
  } catch (e) {
    console.error('Invio email di reset fallito:', e.message);
  }
}
