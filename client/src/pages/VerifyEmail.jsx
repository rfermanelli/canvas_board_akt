import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { styles } from './Login.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState('loading'); // loading | ok | error
  const [msg, setMsg] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Evita la doppia esecuzione in StrictMode (dev): il token è monouso.
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState('error');
      setMsg('Link non valido: token mancante.');
      return;
    }
    api.post('/auth/verify-email', { token })
      .then((data) => {
        setState('ok');
        setMsg(data?.message || 'Email verificata.');
      })
      .catch((e) => {
        setState('error');
        setMsg(e.message || 'Link non valido o scaduto.');
      });
  }, [token]);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Verifica email</h1>
        {state === 'loading' && <p style={styles.muted}>Verifica in corso…</p>}
        {state === 'ok' && <p style={styles.muted}>{msg}</p>}
        {state === 'error' && <p style={styles.err}>{msg}</p>}
        <p style={styles.muted}><Link to="/login">Vai al login</Link></p>
      </div>
    </div>
  );
}
