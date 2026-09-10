import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { styles } from './Login.jsx';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      await register(email, password, displayName);
      nav('/');
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.h1}>Crea account</h1>
        <input style={styles.input} placeholder="Nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={styles.input} type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={styles.err}>{err}</p>}
        <button style={styles.btn} type="submit">Registrati</button>
        <p style={styles.muted}>Hai già un account? <Link to="/login">Accedi</Link></p>
      </form>
    </div>
  );
}
