import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { styles } from './Login.jsx';

export default function ResetPassword() {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  if (!token) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Link non valido</h1>
          <p style={styles.muted}>Il link di reimpostazione non è valido o è incompleto.</p>
          <p style={styles.muted}><Link to="/forgot-password">Richiedi un nuovo link</Link></p>
        </div>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (password.length < 8) {
      setErr('La password deve avere almeno 8 caratteri.');
      return;
    }
    if (password !== confirm) {
      setErr('Le password non coincidono.');
      return;
    }
    setLoading(true);
    setInvalidToken(false);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (e) {
      setErr(e.message);
      if (/token|scadut|non valid/i.test(e.message)) setInvalidToken(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Password reimpostata</h1>
          <p style={styles.muted}>Password reimpostata con successo.</p>
          <p style={styles.muted}><Link to="/login">Vai al login</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.h1}>Reimposta password</h1>
        <input style={styles.input} type={show ? 'text' : 'password'} placeholder="Nuova password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input style={styles.input} type={show ? 'text' : 'password'} placeholder="Conferma password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        <label style={styles.muted}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostra password
        </label>
        {err && <p style={styles.err}>{err}</p>}
        <button style={styles.btn} type="submit" disabled={loading}>{loading ? 'Invio…' : 'Reimposta password'}</button>
        {invalidToken && <p style={styles.muted}><Link to="/forgot-password">Richiedi un nuovo link</Link></p>}
      </form>
    </div>
  );
}
