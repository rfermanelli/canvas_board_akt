import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { askConfirm, alertError } from '../../ui.js';
import { adminStyles as s } from './adminStyles.js';

const PAGE_SIZE = 20;

// Etichetta + stile del badge per lo stato del ciclo di vita dell'account.
const STATUS_META = {
  active: { label: 'Attivo', style: s.badgeActive },
  pending_verification: { label: 'Verifica email', style: s.badgePending },
  pending_approval: { label: 'Da approvare', style: s.badgePending },
  suspended: { label: 'Sospeso', style: s.badgeSuspended },
  rejected: { label: 'Rifiutato', style: s.badgeRejected },
};

export default function AdminUsers() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Debounce della ricerca: aggiorna `q` (che scatena il caricamento) 400ms dopo
  // l'ultima digitazione, così non si chiama l'API a ogni carattere.
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  function load() {
    setLoading(true);
    setErr('');
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    api.get(`/admin/users?${params}`)
      .then((data) => { setRows(data.rows); setTotal(data.total); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page, q, role, status]);

  async function toggleRole(row) {
    const nextRole = row.role === 'admin' ? 'user' : 'admin';
    if (nextRole === 'user' && !(await askConfirm(`Rendere "${row.email}" un utente normale?`, 'Rendi utente'))) return;
    try { await api.patch(`/admin/users/${row.id}/role`, { role: nextRole }); load(); }
    catch (e) { alertError(e.message); }
  }
  async function toggleStatus(row) {
    if (row.disabled_at) {
      try { await api.patch(`/admin/users/${row.id}/enable`); load(); }
      catch (e) { alertError(e.message); }
      return;
    }
    if (!(await askConfirm(`Disattivare l'account di "${row.email}"?`, 'Disattiva'))) return;
    try { await api.patch(`/admin/users/${row.id}/disable`); load(); }
    catch (e) { alertError(e.message); }
  }
  async function suspend(row) {
    if (!(await askConfirm(`Sospendere l'account di "${row.email}"? Non potrà più accedere.`, 'Sospendi'))) return;
    try { await api.post(`/admin/users/${row.id}/suspend`); load(); }
    catch (e) { alertError(e.message); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={s.toolbar}>
        <input
          style={s.input}
          placeholder="Cerca per email o nome…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <select style={s.select} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">Tutti i ruoli</option>
          <option value="user">Utente</option>
          <option value="admin">Admin</option>
        </select>
        <select style={s.select} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Tutti gli stati</option>
          <option value="active">Attivi</option>
          <option value="disabled">Disattivati</option>
        </select>
      </div>

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
                  <th style={s.th}>Ruolo</th>
                  <th style={s.th}>Stato</th>
                  <th style={s.th}>Lavagne</th>
                  <th style={s.th}>Creato il</th>
                  <th style={s.th}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isSelf = user?.id === row.id;
                  const disabled = !!row.disabled_at;
                  return (
                    <tr key={row.id}>
                      <td style={s.td}>{row.email}</td>
                      <td style={s.td}>{row.display_name || '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, ...(row.role === 'admin' ? s.badgeAdmin : s.badgeUser) }}>
                          {row.role === 'admin' ? 'Admin' : 'Utente'}
                        </span>
                      </td>
                      <td style={s.td}>
                        {(() => {
                          const m = STATUS_META[row.status] || { label: row.status, style: s.badgeUser };
                          return <span style={{ ...s.badge, ...m.style }}>{m.label}</span>;
                        })()}
                        {disabled && <span style={{ ...s.badge, ...s.badgeDisabled, marginLeft: 6 }}>Disattivato</span>}
                      </td>
                      <td style={s.td}>{row.boards_count}</td>
                      <td style={s.td}>{new Date(row.created_at).toLocaleDateString()}</td>
                      <td style={s.td}>
                        {/* Un admin non può declassare o disattivare se stesso dalla lista. */}
                        {!(isSelf && row.role === 'admin') && (
                          <button style={s.link} onClick={() => toggleRole(row)}>
                            {row.role === 'admin' ? 'Rendi utente' : 'Rendi admin'}
                          </button>
                        )}
                        {!(isSelf && !disabled) && (
                          <button style={disabled ? s.link : s.linkDanger} onClick={() => toggleStatus(row)}>
                            {disabled ? 'Riattiva' : 'Disattiva'}
                          </button>
                        )}
                        {!isSelf && row.status === 'active' && (
                          <button style={s.linkDanger} onClick={() => suspend(row)}>Sospendi</button>
                        )}
                        <Link style={s.link} to={`/admin/users/${row.id}`}>Dettaglio</Link>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td style={s.td} colSpan={7}>Nessun utente trovato.</td></tr>
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
