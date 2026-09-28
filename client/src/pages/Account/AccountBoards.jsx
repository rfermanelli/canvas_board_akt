import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { adminStyles as s } from '../Admin/adminStyles.js';

const PAGE_SIZE = 20;

const ROLE_LABELS = { owner: 'Proprietario', editor: 'Editor', viewer: 'Visualizzatore' };

// Le mie lavagne (di mia proprietà + condivise con me). Sola consultazione: le azioni
// (rinomina/elimina/condividi) restano nella Dashboard.
export default function AccountBoards() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  function load() {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    if (q) params.set('q', q);
    api.get(`/account/boards?${params}`)
      .then((data) => { setRows(data.rows); setTotal(data.total); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page, q]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={s.toolbar}>
        <input
          style={s.input}
          placeholder="Cerca per nome…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
      </div>

      {err && <p style={s.error}>{err}</p>}
      {loading && !err && <p style={s.muted}>Caricamento…</p>}

      {!loading && !err && (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Nome</th>
                  <th style={s.th}>Ruolo</th>
                  <th style={s.th}>Collaboratori</th>
                  <th style={s.th}>Media</th>
                  <th style={s.th}>Aggiornata</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={s.td}><Link style={s.link} to={`/board/${row.id}`}>{row.name}</Link></td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, ...(row.role === 'owner' ? s.badgeAdmin : s.badgeUser) }}>
                        {ROLE_LABELS[row.role] || row.role}
                      </span>
                    </td>
                    <td style={s.td}>{row.collaborators_count}</td>
                    <td style={s.td}>{row.media_count}</td>
                    <td style={s.td}>{new Date(row.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td style={s.td} colSpan={5}>{q ? 'Nessuna lavagna trovata.' : 'Nessuna lavagna.'}</td></tr>
                )}
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
