// Stili condivisi del pannello di amministrazione. Stessa convenzione delle altre
// pagine (oggetti `style` inline, nessuna libreria UI): vedi Dashboard.jsx e Login.jsx.

export const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const adminStyles = {
  page: { fontFamily: FONT, padding: 24, maxWidth: 1200, margin: '0 auto', color: '#1e1b2e' },

  layoutHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' },
  title: { margin: 0, fontSize: 20 },
  nav: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 24 },
  navLink: { padding: '8px 14px', borderRadius: 8, color: '#1e1b2e', textDecoration: 'none', fontSize: 14 },
  navLinkActive: { background: '#4c6ef5', color: '#fff' },
  back: { display: 'flex', alignItems: 'center', gap: 6, color: '#4c6ef5', textDecoration: 'none', fontSize: 14, marginBottom: 16 },

  muted: { color: '#888', fontSize: 13 },
  error: { color: '#e03131', fontSize: 14 },

  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  input: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14 },
  select: { padding: '8px 10px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, background: '#fff' },

  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 640 },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', color: '#888', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle', whiteSpace: 'nowrap' },

  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 },
  badgeAdmin: { background: '#eef1ff', color: '#4c6ef5' },
  badgeUser: { background: '#f4f5f7', color: '#555' },
  badgeActive: { background: '#e6fcf5', color: '#0ca678' },
  badgeDisabled: { background: '#fff0f0', color: '#e03131' },
  badgePending: { background: '#fff4e6', color: '#e8590c' },
  badgeSuspended: { background: '#fff0f0', color: '#e03131' },
  badgeRejected: { background: '#f4f5f7', color: '#868e96' },

  link: { background: 'none', border: 'none', color: '#4c6ef5', cursor: 'pointer', fontSize: 13, padding: 0, marginRight: 10, textDecoration: 'none' },
  linkDanger: { background: 'none', border: 'none', color: '#e03131', cursor: 'pointer', fontSize: 13, padding: 0, marginRight: 10, textDecoration: 'none' },
  primary: { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#4c6ef5', color: '#fff', cursor: 'pointer', fontSize: 14 },
  ghost: { padding: '8px 14px', border: '1px solid #ccc', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 },

  pagination: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', marginTop: 16, fontSize: 13 },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 },
  statCard: { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 20 },
  statValue: { fontSize: 28, fontWeight: 700 },
  statLabel: { color: '#888', fontSize: 13, marginTop: 4 },

  card: { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 },
  h2: { margin: '0 0 4px', fontSize: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 },
  label: { fontSize: 12, color: '#888' },

  pre: { background: '#f4f5f7', borderRadius: 8, padding: 10, fontSize: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
};
