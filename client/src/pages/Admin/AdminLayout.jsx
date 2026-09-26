import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { adminStyles as s } from './adminStyles.js';
import { ArrowLeft } from 'lucide-react';

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/pending', label: 'Approvazioni' },
  { to: '/admin/users', label: 'Utenti' },
  { to: '/admin/boards', label: 'Lavagne' },
  { to: '/admin/audit-log', label: 'Log' },
];

export default function AdminLayout() {
  const { user } = useAuth();

  return (
    <div style={s.page}>
      <header style={s.layoutHeader}>
        <h1 style={s.title}>Amministrazione</h1>
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
