import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setResendMsg('');
    setNeedsVerification(false);
    try {
      await login(email, password);
      nav('/');
    } catch (e) {
      setErr(e.message);
      // Email non verificata: offri il reinvio del link (il code arriva dal server).
      if (e.code === 'pending_verification') setNeedsVerification(true);
    }
  }

  async function resend() {
    setResendMsg('');
    try {
      const data = await api.post('/auth/resend-verification', { email });
      setResendMsg(data?.message || 'Se esiste un account non verificato con questa email, riceverai un nuovo link.');
    } catch (e) {
      setResendMsg(e.message);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.h1}>Accedi</h1>
        <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={styles.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={styles.err}>{err}</p>}
        {needsVerification && (
          <button style={styles.linkBtn} type="button" onClick={resend}>Reinvia email di verifica</button>
        )}
        {resendMsg && <p style={styles.muted}>{resendMsg}</p>}
        <button style={styles.btn} type="submit">Entra</button>
        <p style={styles.muted}><Link to="/forgot-password">Password dimenticata?</Link></p>
        <p style={styles.muted}>Non hai un account? <Link to="/register">Registrati</Link></p>
      </form>
    </div>
  );
}

export const styles = {
  wrap: { display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f4f5f7', fontFamily: 'system-ui' },
  card: { display: 'flex', flexDirection: 'column', gap: 12, width: 320, padding: 28, background: '#fff', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,.08)' },
  h1: { margin: 0, fontSize: 22 },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  btn: { padding: 10, border: 'none', borderRadius: 8, background: '#4c6ef5', color: '#fff', fontSize: 15, cursor: 'pointer' },
  err: { color: '#e03131', margin: 0, fontSize: 13 },
  muted: { color: '#666', fontSize: 13, margin: 0 },
  linkBtn: { background: 'none', border: 'none', color: '#4c6ef5', cursor: 'pointer', fontSize: 13, padding: 0, textAlign: 'left', textDecoration: 'underline' },
};
