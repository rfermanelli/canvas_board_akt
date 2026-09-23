import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { alertError, alertInfo } from '../ui.js';
import { ArrowLeft } from 'lucide-react';

export default function Profile() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function changePassword(e) {
    e.preventDefault();
    if (newPassword.length < 8) { alertError('La nuova password deve avere almeno 8 caratteri.'); return; }
    if (newPassword !== confirmPassword) { alertError('Le password non coincidono.'); return; }
    try {
      await api.put('/auth/password', { currentPassword, newPassword });
      alertInfo('Password aggiornata!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      alertError(err.message);
    }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.back} onClick={() => nav('/')}><ArrowLeft size={16} /> Le mie lavagne</button>
        <strong>Profilo</strong>
      </header>

      <div style={s.card}>
        <h2 style={s.h2}>Informazioni personali</h2>
        <div style={s.field}>
          <span style={s.label}>Email</span>
          <span>{user?.email}</span>
        </div>
        <div style={s.field}>
          <span style={s.label}>Nome</span>
          <span>{user?.displayName}</span>
        </div>
      </div>

      <form style={s.card} onSubmit={changePassword}>
        <h2 style={s.h2}>Cambia password</h2>
        <input style={s.input} type="password" placeholder="Password attuale" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <input style={s.input} type="password" placeholder="Nuova password (min 8)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        <input style={s.input} type="password" placeholder="Conferma nuova password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        <button style={s.primary} type="submit">Aggiorna password</button>
      </form>
    </div>
  );
}

const s = {
  page: { fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', padding: 24, maxWidth: 480, margin: '0 auto', color: '#1e1b2e' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  back: { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#4c6ef5', cursor: 'pointer', fontSize: 14, padding: 0 },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 },
  h2: { margin: 0, fontSize: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 },
  label: { fontSize: 12, color: '#888' },
  input: { padding: 10, border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  primary: { padding: 10, border: 'none', borderRadius: 8, background: '#4c6ef5', color: '#fff', fontSize: 15, cursor: 'pointer' },
};
