import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Presentation, Video } from 'lucide-react';
import { api } from '../../api.js';
import { adminStyles as s } from '../Admin/adminStyles.js';

const PAGE_SIZE = 20;

const KIND_LABELS = { image: 'Immagine', video: 'Video', pdf: 'PDF', pptx: 'PowerPoint' };
const KIND_ICON = { video: Video, pdf: FileText, pptx: Presentation };

function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Anteprima: miniatura per le immagini, icona del tipo per gli altri media.
function Preview({ row }) {
  if (row.kind === 'image') {
    return (
      <a href={row.url} target="_blank" rel="noreferrer">
        <img src={row.url} alt={row.filename} style={thumb} loading="lazy" />
      </a>
    );
  }
  const Icon = KIND_ICON[row.kind] || FileText;
  return <span style={thumbBox}><Icon size={20} /></span>;
}

// I media che HO caricato io (uploader = me). Sola consultazione.
export default function AccountMedia() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
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
    if (kind) params.set('kind', kind);
    api.get(`/account/media?${params}`)
      .then((data) => { setRows(data.rows); setTotal(data.total); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [page, q, kind]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div style={s.toolbar}>
        <input
          style={s.input}
          placeholder="Cerca per file o nome lavagna…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <select style={s.select} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
          <option value="">Tutti i tipi</option>
          <option value="image">Immagini</option>
          <option value="video">Video</option>
          <option value="pdf">PDF</option>
          <option value="pptx">PowerPoint</option>
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
                  <th style={s.th}>Anteprima</th>
                  <th style={s.th}>File</th>
                  <th style={s.th}>Tipo</th>
                  <th style={s.th}>Lavagna</th>
                  <th style={s.th}>Dimensione</th>
                  <th style={s.th}>Caricato il</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={s.td}><Preview row={row} /></td>
                    <td style={s.td}>
                      <a style={s.link} href={row.url} target="_blank" rel="noreferrer">{row.filename}</a>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, ...s.badgeUser }}>{KIND_LABELS[row.kind] || row.kind}</span>
                    </td>
                    <td style={s.td}>
                      {row.board_id
                        ? <Link style={s.link} to={`/board/${row.board_id}`}>{row.board_name || `#${row.board_id}`}</Link>
                        : <span style={s.muted}>— (nessuna)</span>}
                    </td>
                    <td style={s.td}>{formatSize(row.size_bytes)}</td>
                    <td style={s.td}>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td style={s.td} colSpan={6}>Nessun media trovato.</td></tr>
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

const thumb = { width: 56, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' };
const thumbBox = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 40, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f4f5f7', color: '#868e96' };
