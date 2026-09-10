import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      await login(email, password);
      nav('/');
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.h1}>Accedi</h1>
        <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={styles.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={styles.err}>{err}</p>}
        <button style={styles.btn} type="submit">Entra</button>
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
};
