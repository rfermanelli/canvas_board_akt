import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { adminStyles as s } from '../Admin/adminStyles.js';

const PAGE_SIZE = 20;

// Etichette leggibili per i codici azione registrati in user_activity_log.
const ACTION_LABELS = {
  'board.create': 'Lavagna creata',
  'board.rename': 'Lavagna rinominata',
  'board.delete': 'Lavagna eliminata',
  'board.duplicate': 'Lavagna duplicata',
  'board.share': 'Lavagna condivisa',
  'board.unshare': 'Condivisione revocata',
  'media.upload': 'Media caricato',
};

// Il mio log attività personale (azioni che HO fatto io).
export default function AccountActivity() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    api.get(`/account/activity?${params}`)
      .then((data) => { setRows(data.rows); setTotal(data.total); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {err && <p style={s.error}>{err}</p>}
      {loading && !err && <p style={s.muted}>Caricamento…</p>}
      {!loading && !err && rows.length === 0 && <p style={s.muted}>Nessuna attività registrata.</p>}

      {!loading && !err && rows.length > 0 && (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Data/ora</th>
                  <th style={s.th}>Azione</th>
                  <th style={s.th}>Entità</th>
                  <th style={s.th}>Dettagli</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={s.td}>{new Date(row.created_at).toLocaleString()}</td>
                    <td style={s.td}>{ACTION_LABELS[row.action] || row.action}</td>
                    <td style={s.td}>{row.entity_type}{row.entity_id ? ` #${row.entity_id}` : ''}</td>
                    <td style={{ ...s.td, whiteSpace: 'normal' }}>
                      {row.details ? <pre style={s.pre}>{JSON.stringify(row.details, null, 2)}</pre> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={s.pagination}>
            <button style={s.ghost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Precedente</button>
            <span>Pagina {page} di {totalPages}</span>
            <button style={s.ghost} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Successiva</button>
          </div>
        </>
      )}
    </div>
  );
}
