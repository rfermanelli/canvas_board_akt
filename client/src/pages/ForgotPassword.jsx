import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { styles } from './Login.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!EMAIL_RE.test(email)) {
      setErr('Inserisci un indirizzo email valido.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.post('/auth/forgot-password', { email });
      setMsg(data.message || 'Se esiste un account associato a questa email, riceverai un link per reimpostare la password.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.h1}>Password dimenticata</h1>
        {!msg && (
          <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        )}
        {err && <p style={styles.err}>{err}</p>}
        {msg && <p style={styles.muted}>{msg}</p>}
        {!msg && (
          <button style={styles.btn} type="submit" disabled={loading}>{loading ? 'Invio…' : 'Invia link di reset'}</button>
        )}
        <p style={styles.muted}><Link to="/login">Torna al login</Link></p>
      </form>
    </div>
  );
}
