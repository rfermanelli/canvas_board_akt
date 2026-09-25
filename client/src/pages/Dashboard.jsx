import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { askText, askConfirm, alertError, alertInfo } from '../ui.js';
import { Presentation, Plus, Shield } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [boards, setBoards] = useState([]);
  const [err, setErr] = useState('');

  const load = () => api.get('/boards').then(setBoards).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function create() {
    const name = await askText('Nome della lavagna:', 'Senza titolo');
    if (name === null) return;
    const b = await api.post('/boards', { name });
    nav(`/board/${b.id}`);
  }
  async function rename(b) {
    const name = await askText('Nuovo nome:', b.name);
    if (!name) return;
    await api.put(`/boards/${b.id}`, { name });
    load();
  }
  async function duplicate(b) { await api.post(`/boards/${b.id}/duplicate`); load(); }
  async function remove(b) {
    if (!(await askConfirm(`Eliminare "${b.name}"?`, 'Elimina'))) return;
    await api.del(`/boards/${b.id}`); load();
  }
  async function share(b) {
    const email = await askText('Email della persona con cui condividere:');
    if (!email) return;
    // Propone la scelta dei permessi solo se l'email è già registrata.
    let exists;
    try { ({ exists } = await api.get(`/boards/${b.id}/user-exists?email=${encodeURIComponent(email)}`)); }
    catch (e) { alertError(e.message); return; }
    if (!exists) { alertError('Utente non trovato'); return; }
    const role = (await askConfirm('Che permesso vuoi assegnare?', 'Editor', 'Viewer')) ? 'editor' : 'viewer';
    try { await api.post(`/boards/${b.id}/share`, { email, role }); alertInfo('Lavagna condivisa!'); }
    catch (e) { alertError(e.message); }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <strong>Le mie lavagne</strong>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={s.muted}>{user?.email}</span>
          {user?.role === 'admin' && (
            <button style={s.ghost} onClick={() => nav('/admin')}><Shield size={15} style={{ verticalAlign: '-3px' }} /> Admin</button>
          )}
          <button style={s.ghost} onClick={() => nav('/profile')}>Profilo</button>
          <button style={s.primary} onClick={create}><Plus size={15} style={{ verticalAlign: '-3px' }} /> Nuova</button>
          <button style={s.ghost} onClick={logout}>Esci</button>
        </div>
      </header>

      {err && <p style={{ color: '#e03131' }}>{err}</p>}

      <div style={s.grid}>
        {boards.map((b) => (
          <div key={b.id} style={s.tile}>
            <div style={s.thumb} onClick={() => nav(`/board/${b.id}`)}><Presentation size={40} color="#adb5bd" /></div>
            <div style={s.tileBody}>
              <div style={s.name} onClick={() => nav(`/board/${b.id}`)}>
                {b.name}
                {/* Etichetta per le lavagne condivise con me (non di mia proprietà),
                    analoga al "(copia)" delle duplicate ma solo nella mia dashboard. */}
                {b.role !== 'owner' && <span style={s.sharedTag}>(condivisa)</span>}
              </div>
              <div style={s.muted}>{b.role} · agg. {new Date(b.updated_at).toLocaleDateString()}</div>
              <div style={s.actions}>
                <button style={s.link} onClick={() => rename(b)}>Rinomina</button>
                <button style={s.link} onClick={() => duplicate(b)}>Duplica</button>
                {b.role === 'owner' && <button style={s.link} onClick={() => share(b)}>Condividi</button>}
                {b.role === 'owner' && <button style={s.linkDanger} onClick={() => remove(b)}>Elimina</button>}
              </div>
            </div>
          </div>
        ))}
        {boards.length === 0 && <p style={s.muted}>Nessuna lavagna. Creane una!</p>}
      </div>
    </div>
  );
}

const s = {
  page: { fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', padding: 24, maxWidth: 1100, margin: '0 auto', color: '#1e1b2e' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 },
  tile: { border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  thumb: { height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, background: '#f4f5f7', cursor: 'pointer' },
  tileBody: { padding: 12 },
  name: { fontWeight: 600, cursor: 'pointer', marginBottom: 4 },
  sharedTag: { marginLeft: 6, fontWeight: 500, fontSize: 12, color: '#7048e8' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  muted: { color: '#888', fontSize: 12 },
  link: { background: 'none', border: 'none', color: '#4c6ef5', cursor: 'pointer', fontSize: 13, padding: 0 },
  linkDanger: { background: 'none', border: 'none', color: '#e03131', cursor: 'pointer', fontSize: 13, padding: 0 },
  primary: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#4c6ef5', color: '#fff', cursor: 'pointer' },
  ghost: { padding: '8px 14px', border: '1px solid #ccc', borderRadius: 8, background: '#fff', cursor: 'pointer' },
};
