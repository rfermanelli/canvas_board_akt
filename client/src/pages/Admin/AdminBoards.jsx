import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { askConfirm, alertError } from '../../ui.js';
import { adminStyles as s } from './adminStyles.js';

const PAGE_SIZE = 20;

export default function AdminBoards() {
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
    api.get(`/admin/boards?${params}`)
      .then((data) => { setRows(data.rows); setTotal(data.total); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page, q]);

  async function remove(row) {
    if (!(await askConfirm(`Eliminare definitivamente "${row.name}"? Verranno cancellati anche contenuto e media associati. L'operazione è irreversibile.`, 'Elimina'))) return;
    try { await api.del(`/admin/boards/${row.id}`); load(); }
    catch (e) { alertError(e.message); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={s.toolbar}>
        <input
          style={s.input}
          placeholder="Cerca per nome o email proprietario…"
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
                  <th style={s.th}>Proprietario</th>
                  <th style={s.th}>Collaboratori</th>
                  <th style={s.th}>Media</th>
                  <th style={s.th}>Aggiornata</th>
                  <th style={s.th}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={s.td}>{row.name}</td>
                    <td style={s.td}>{row.owner_email}</td>
                    <td style={s.td}>{row.collaborators_count}</td>
                    <td style={s.td}>{row.media_count}</td>
                    <td style={s.td}>{new Date(row.updated_at).toLocaleDateString()}</td>
                    <td style={s.td}>
                      <button style={s.linkDanger} onClick={() => remove(row)}>Elimina</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td style={s.td} colSpan={6}>Nessuna lavagna trovata.</td></tr>
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
