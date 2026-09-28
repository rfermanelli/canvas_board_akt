import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { adminStyles as s } from '../Admin/adminStyles.js';
import { ArrowLeft } from 'lucide-react';

// Pannello dell'utente semplice: mostra SOLO i suoi dati. Stessa impostazione visiva
// del pannello admin (riusa adminStyles), ma con sole tre sezioni: Lavagne, Media, Log.
const navItems = [
  { to: '/account', label: 'Lavagne', end: true },
  { to: '/account/media', label: 'Media' },
  { to: '/account/activity', label: 'Log' },
];

export default function AccountLayout() {
  const { user } = useAuth();

  return (
    <div style={s.page}>
      <header style={s.layoutHeader}>
        <h1 style={s.title}>Il mio pannello</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={s.muted}>{user?.email}</span>
          <Link to="/" style={{ ...s.back, marginBottom: 0 }}><ArrowLeft size={16} /> Torna all&apos;app</Link>
        </div>
      </header>

      <nav style={s.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({ ...s.navLink, ...(isActive ? s.navLinkActive : {}) })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
