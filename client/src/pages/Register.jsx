import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { styles } from './Login.jsx';

export default function Register() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const data = await register(email, password, displayName);
      // Registrazione non auto-autenticata: mostra l'invito a verificare l'email.
      setDone(data?.message || 'Registrazione ricevuta. Controlla la tua email per confermare l\'indirizzo.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Controlla la tua email</h1>
          <p style={styles.muted}>{done}</p>
          <p style={styles.muted}>Dopo la verifica, un amministratore dovrà approvare l&apos;account prima del primo accesso.</p>
          <p style={styles.muted}><Link to="/login">Torna al login</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <h1 style={styles.h1}>Crea account</h1>
        <input style={styles.input} placeholder="Nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={styles.input} type="password" placeholder="Password (min 8)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p style={styles.err}>{err}</p>}
        <button style={styles.btn} type="submit" disabled={loading}>{loading ? 'Invio…' : 'Registrati'}</button>
        <p style={styles.muted}>Hai già un account? <Link to="/login">Accedi</Link></p>
      </form>
    </div>
  );
}
