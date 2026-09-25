import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { adminStyles as s } from './adminStyles.js';
import { ArrowLeft } from 'lucide-react';

export default function AdminUserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null);
    setErr('');
    api.get(`/admin/users/${id}`).then(setData).catch((e) => setErr(e.message));
  }, [id]);

  return (
    <div>
      <Link to="/admin/users" style={s.back}><ArrowLeft size={16} /> Torna agli utenti</Link>

      {err && <p style={s.error}>{err}</p>}
      {!data && !err && <p style={s.muted}>Caricamento…</p>}

      {data && (
        <>
          <div style={s.card}>
            <h2 style={s.h2}>{data.user.email}</h2>
            <div style={s.field}><span style={s.label}>Nome</span><span>{data.user.display_name || '—'}</span></div>
            <div style={s.field}><span style={s.label}>Ruolo</span><span>{data.user.role === 'admin' ? 'Admin' : 'Utente'}</span></div>
            <div style={s.field}><span style={s.label}>Stato</span><span>{data.user.disabled_at ? 'Disattivato' : 'Attivo'}</span></div>
            <div style={s.field}><span style={s.label}>Creato il</span><span>{new Date(data.user.created_at).toLocaleString()}</span></div>
            <div style={s.field}><span style={s.label}>Media totali</span><span>{data.media_count}</span></div>
          </div>

          <h2 style={s.h2}>Lavagne ({data.boards.length})</h2>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Nome</th>
                  <th style={s.th}>Creata</th>
                  <th style={s.th}>Aggiornata</th>
                  <th style={s.th}>Media</th>
                </tr>
              </thead>
              <tbody>
                {data.boards.map((b) => (
                  <tr key={b.id}>
                    <td style={s.td}>{b.name}</td>
                    <td style={s.td}>{new Date(b.created_at).toLocaleDateString()}</td>
                    <td style={s.td}>{new Date(b.updated_at).toLocaleDateString()}</td>
                    <td style={s.td}>{b.media_count}</td>
                  </tr>
                ))}
                {data.boards.length === 0 && (
                  <tr><td style={s.td} colSpan={4}>Nessuna lavagna.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
