import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { adminStyles as s } from './adminStyles.js';

const METRICS = [
  { key: 'users_total', label: 'Utenti totali' },
  { key: 'users_last_7d', label: 'Nuovi ultimi 7 giorni' },
  { key: 'users_disabled', label: 'Disattivati' },
  { key: 'admins_total', label: 'Amministratori' },
  { key: 'boards_total', label: 'Lavagne totali' },
  { key: 'media_total', label: 'Media totali' },
];

export default function AdminHome() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/admin/stats').then(setStats).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p style={s.error}>{err}</p>;
  if (!stats) return <p style={s.muted}>Caricamento…</p>;

  return (
    <div style={s.grid}>
      {METRICS.map((m) => (
        <div key={m.key} style={s.statCard}>
          <div style={s.statValue}>{stats[m.key]}</div>
          <div style={s.statLabel}>{m.label}</div>
        </div>
      ))}
    </div>
  );
}
