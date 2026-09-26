import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { askConfirm, askText, alertError } from '../../ui.js';
import { adminStyles as s } from './adminStyles.js';

const PAGE_SIZE = 20;

export default function AdminPending() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    setErr('');
    api.get(`/admin/pending?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((data) => { setRows(data.rows); setTotal(data.total); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page]);

  async function approve(row, asAdmin) {
    const label = asAdmin ? `Approvare "${row.email}" come AMMINISTRATORE?` : `Approvare l'accesso di "${row.email}"?`;
    if (!(await askConfirm(label, 'Approva'))) return;
    try { await api.post(`/admin/users/${row.id}/approve`, { role: asAdmin ? 'admin' : 'user' }); load(); }
    catch (e) { alertError(e.message); }
  }
  async function reject(row) {
    const reason = await askText(`Motivo del rifiuto per "${row.email}":`);
    if (reason === null) return;              // annullato
    if (!reason.trim()) { alertError('La motivazione è obbligatoria.'); return; }
    try { await api.post(`/admin/users/${row.id}/reject`, { reason }); load(); }
    catch (e) { alertError(e.message); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <p style={s.muted}>Utenti che hanno verificato l&apos;email e attendono l&apos;approvazione di un amministratore.</p>

      {err && <p style={s.error}>{err}</p>}
      {loading && !err && <p style={s.muted}>Caricamento…</p>}

      {!loading && !err && (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Nome</th>
                  <th style={s.th}>Email verificata il</th>
                  <th style={s.th}>Registrato il</th>
                  <th style={s.th}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={s.td}>{row.email}</td>
                    <td style={s.td}>{row.display_name || '—'}</td>
                    <td style={s.td}>{row.email_verified_at ? new Date(row.email_verified_at).toLocaleString() : '—'}</td>
                    <td style={s.td}>{new Date(row.created_at).toLocaleDateString()}</td>
                    <td style={s.td}>
                      <button style={s.link} onClick={() => approve(row, false)}>Approva</button>
                      <button style={s.link} onClick={() => approve(row, true)}>Approva come admin</button>
                      <button style={s.linkDanger} onClick={() => reject(row)}>Rifiuta</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td style={s.td} colSpan={5}>Nessun utente in attesa di approvazione.</td></tr>
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
