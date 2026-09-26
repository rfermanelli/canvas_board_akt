import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { adminStyles as s } from './adminStyles.js';
import { ArrowLeft } from 'lucide-react';

const STATUS_LABELS = {
  active: 'Attivo',
  pending_verification: 'Verifica email in attesa',
  pending_approval: 'In attesa di approvazione',
  suspended: 'Sospeso',
  rejected: 'Rifiutato',
};

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
            <div style={s.field}><span style={s.label}>Stato account</span><span>{STATUS_LABELS[data.user.status] || data.user.status}{data.user.disabled_at ? ' · Disattivato' : ''}</span></div>
            <div style={s.field}><span style={s.label}>Email verificata il</span><span>{data.user.email_verified_at ? new Date(data.user.email_verified_at).toLocaleString() : '—'}</span></div>
            <div style={s.field}><span style={s.label}>Approvata il</span><span>{data.user.approved_at ? new Date(data.user.approved_at).toLocaleString() : '—'}</span></div>
            {data.user.rejection_reason && (
              <div style={s.field}><span style={s.label}>Motivo rifiuto</span><span>{data.user.rejection_reason}</span></div>
            )}
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
