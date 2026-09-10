import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Group, Rect, Ellipse, Text, Line, Circle, RegularPolygon, Star, Arrow, Image as KImage, Transformer } from 'react-konva';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { api, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { toast, askText, askConfirm } from '../ui.js';
import {
  MousePointer2, Hand, Pen, Highlighter, Eraser, Shapes, Type, StickyNote, Plus,
  Menu, Save, Download, Undo2, Redo2, Check, Layers, ArrowLeft, Users, Clapperboard,
  Timer, Pause, Image as ImageIcon, Video, Upload, Minus, HelpCircle, X, ArrowUp,
  ArrowDown, Pencil, Play, Copy, CopyPlus, Trash2, ClipboardPaste, Link as LinkIcon,
  List, ChevronDown, ChevronLeft, ChevronRight, Square, Circle as CircleIcon,
  Triangle, Diamond, Pentagon, Hexagon, Star as StarIcon, ArrowRight, Slash, Presentation, Move, Spline, Smile,
  Squircle, Octagon, TriangleRight, User, GripVertical, GripHorizontal, MoveHorizontal, MoveVertical,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// CANVAS collaborativo. Modello dati: Y.Doc con Y.Map 'objects' (id -> oggetto).
// Real-time (Fase 3): y-websocket per sync doc + awareness (cursori/presenza);
// undo/redo CONDIVISO via Y.UndoManager. Persistenza JSON su MySQL lato server.
//
// Strumenti (Fase 2): select / rettangolo / ellisse / testo / penna / immagine
// (URL o upload) / video (URL YouTube-embed o file, riproducibile inline).
// Manipolazione: selezione singola/multipla, resize+rotazione, elimina, duplica,
// copia/incolla, undo/redo, snapping con guide, pannello livelli + z-order, export PNG.
//
// Gomma: cancellazione parziale del tratto a mano libera (spezza la linea nei segmenti
// superstiti); le altre forme si cancellano per intero.
// TODO Fase 2 residui: selezione ad area (marquee), raggruppamento,
// poligono, connettori/frecce agganciabili, export PDF/SVG.
// ---------------------------------------------------------------------------

const PALETTE = [
  '#212529', '#495057', '#868e96', '#ced4da', '#ffffff',
  '#e03131', '#c2255c', '#f08c00', '#f59f00', '#ffd43b',
  '#2f9e44', '#82c91e', '#0ca678', '#1098ad', '#22b8cf',
  '#4c6ef5', '#4dabf7', '#7048e8', '#9775fa', '#e8590c',
];
// Font dell'interfaccia: Inter (come FigJam), con fallback di sistema.
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const NOTE_FILL = '#ffe08a';               // giallo caldo di default per le note (stile FigJam)
const NOTE_BORDER = '#f2c94c';             // bordo morbido in tono con il giallo (niente contorno viola)
// Palette note multi-colore in stile FigJam (fill + bordo in tono), scelta alla creazione.
const NOTE_COLORS = [
  { fill: '#ffe08a', border: '#f2c94c' }, // giallo
  { fill: '#fff3bf', border: '#f2d55c' }, // giallo pallido
  { fill: '#ffd8b0', border: '#f5b775' }, // arancio
  { fill: '#ffc9c9', border: '#f28b8b' }, // rosso chiaro
  { fill: '#ffd6e0', border: '#f7a8bf' }, // rosa
  { fill: '#e5d4ff', border: '#c3a6f5' }, // viola
  { fill: '#d0bfff', border: '#a98eea' }, // lavanda
  { fill: '#bfe3ff', border: '#8cc7f5' }, // azzurro
  { fill: '#a5d8ff', border: '#6fb4ee' }, // blu chiaro
  { fill: '#c3f0d8', border: '#8fdcb4' }, // verde
  { fill: '#b2f2bb', border: '#74d17f' }, // menta
  { fill: '#eaddd7', border: '#cbb3a6' }, // beige
  { fill: '#e9ecef', border: '#ced4da' }, // grigio
  { fill: '#ffffff', border: '#e3e3ea' }, // bianco
  { fill: '#343a40', border: '#212529' }, // scuro
];
// Spessori preimpostati per gli strumenti (mostrati "a richiesta").
const STROKE_PRESETS = { pen: [1, 2, 4, 6, 10], highlighter: [10, 16, 24, 32, 44], eraser: [8, 16, 24, 36, 48] };
// Emoji/reazioni "timbrabili" sul canvas (stile FigJam).
const EMOJIS = ['👍', '❤️', '😀', '🎉', '🔥', '⭐', '✅', '❓', '💡', '🚀', '👀', '💯'];
// Intersezione tra due rettangoli {x,y,width,height} (per la selezione ad area).
const rectsIntersect = (a, b) => !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const NOTE_PLACEHOLDER = 'Scrivi qualcosa…'; // testo segnaposto della nota vuota
// Opzioni della barra di formattazione nota (modello nota.png).
const FONTS = [
  { key: '"Inter", system-ui, sans-serif', label: 'Inter' },
  { key: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { key: '"Helvetica Neue", Helvetica, sans-serif', label: 'Helvetica' },
  { key: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { key: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { key: '"Trebuchet MS", sans-serif', label: 'Trebuchet' },
  { key: '"Segoe UI", system-ui, sans-serif', label: 'Segoe UI' },
  { key: 'Georgia, serif', label: 'Georgia' },
  { key: '"Times New Roman", Times, serif', label: 'Times' },
  { key: '"Palatino Linotype", "Book Antiqua", Palatino, serif', label: 'Palatino' },
  { key: 'Garamond, "Times New Roman", serif', label: 'Garamond' },
  { key: '"Courier New", Courier, monospace', label: 'Courier' },
  { key: 'ui-monospace, Consolas, "SFMono-Regular", monospace', label: 'Mono' },
  { key: '"Comic Sans MS", "Segoe Print", cursive', label: 'Comic Sans' },
  { key: 'Impact, Charcoal, sans-serif', label: 'Impact' },
  { key: '"Brush Script MT", "Segoe Script", cursive', label: 'Brush' },
];
const SIZES = [10, 12, 14, 16, 18, 22, 26, 32, 40, 48, 64].map((v) => ({ v, label: String(v) }));
const bulletize = (s) => s.split('\n').map((ln) => (ln.trim() ? '•  ' + ln : ln)).join('\n');
const uid = () => Math.random().toString(36).slice(2, 10);

// Icone SVG inline per le forme senza icona Lucide dedicata (ettagono/parallelogramma/trapezio).
const polyIconPts = (n) => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return `${(12 + 8 * Math.cos(a)).toFixed(1)},${(12 + 8 * Math.sin(a)).toFixed(1)}`; }).join(' ');
const SvgShape = (pts) => ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><polygon points={pts} /></svg>
);
const IcHeptagon = SvgShape(polyIconPts(7));
const IcParallelogram = SvgShape('6,17 14,17 18,7 10,7');
const IcTrapezoid = SvgShape('5,17 19,17 15,7 9,7');

// Catalogo forme geometriche, suddiviso in categorie (per il menù "Forme").
// Ogni forma è uno strumento: cliccando sul canvas si crea l'oggetto relativo.
const SHAPE_CATS = [
  { cat: 'Base', items: [
    { tool: 'rect', label: 'Rettangolo', icon: Square },
    { tool: 'roundrect', label: 'Rett. arrotondato', icon: Squircle },
    { tool: 'ellipse', label: 'Ellisse / Cerchio', icon: CircleIcon },
    { tool: 'triangle', label: 'Triangolo', icon: Triangle },
    { tool: 'righttriangle', label: 'Triangolo rettangolo', icon: TriangleRight },
    { tool: 'diamond', label: 'Rombo', icon: Diamond },
    { tool: 'parallelogram', label: 'Parallelogramma', icon: IcParallelogram },
    { tool: 'trapezoid', label: 'Trapezio', icon: IcTrapezoid },
  ] },
  { cat: 'Poligoni', items: [
    { tool: 'pentagon', label: 'Pentagono', icon: Pentagon },
    { tool: 'hexagon', label: 'Esagono', icon: Hexagon },
    { tool: 'heptagon', label: 'Ettagono', icon: IcHeptagon },
    { tool: 'octagon', label: 'Ottagono', icon: Octagon },
    { tool: 'star', label: 'Stella', icon: StarIcon },
  ] },
  { cat: 'Frecce e linee', items: [
    { tool: 'arrow', label: 'Freccia', icon: ArrowRight },
    { tool: 'straight', label: 'Linea', icon: Slash },
  ] },
];
const POLY_SIDES = { triangle: 3, diamond: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8 };
// Crea l'oggetto forma per il tool dato, alla posizione pos, col colore corrente.
function makeShape(toolKind, pos, color) {
  // Forme con riempimento bianco e bordo del colore corrente (blu di default).
  const base = { id: uid(), x: pos.x, y: pos.y, fill: '#ffffff', stroke: color, strokeWidth: 2, opacity: 1, rotation: 0 };
  if (toolKind === 'rect') return { ...base, type: 'rect', width: 120, height: 80 };
  if (toolKind === 'ellipse') return { ...base, type: 'ellipse', rx: 60, ry: 40 };
  if (toolKind === 'star') return { ...base, type: 'star', radius: 55, innerRadius: 24 };
  if (POLY_SIDES[toolKind]) return { ...base, type: 'poly', sides: POLY_SIDES[toolKind], radius: 60, rotation: 0 };
  if (toolKind === 'arrow') return { id: base.id, type: 'arrow', x: 0, y: 0, points: [pos.x, pos.y, pos.x + 140, pos.y], stroke: color, strokeWidth: 4, rotation: 0 };
  if (toolKind === 'straight') return { id: base.id, type: 'straight', x: 0, y: 0, points: [pos.x, pos.y, pos.x + 140, pos.y], stroke: color, strokeWidth: 4, rotation: 0 };
  if (toolKind === 'roundrect') return { ...base, type: 'rect', width: 120, height: 80, cornerRadius: 18 };
  // Poligoni non regolari (triangolo rettangolo/parallelogramma/trapezio): Line chiusa, punti assoluti.
  const cpoly = (points) => ({ id: base.id, type: 'cpoly', x: 0, y: 0, fill: '#ffffff', stroke: color, strokeWidth: 2, closed: true, rotation: 0, points });
  if (toolKind === 'righttriangle') return cpoly([pos.x, pos.y + 90, pos.x, pos.y, pos.x + 120, pos.y + 90]);
  if (toolKind === 'parallelogram') return cpoly([pos.x + 30, pos.y, pos.x + 150, pos.y, pos.x + 120, pos.y + 80, pos.x, pos.y + 80]);
  if (toolKind === 'trapezoid') return cpoly([pos.x + 30, pos.y, pos.x + 110, pos.y, pos.x + 140, pos.y + 80, pos.x, pos.y + 80]);
  return null;
}
const SHAPE_TOOLS = ['rect', 'roundrect', 'ellipse', 'triangle', 'righttriangle', 'diamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'star', 'arrow', 'straight'];
// Colore testo leggibile sopra uno sfondo esadecimale (per le sticky note).
const readable = (hex) => {
  const c = hex?.replace('#', '') || 'ffd43b';
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1a1a' : '#ffffff';
};
const isYouTube = (u) => /youtu\.?be/.test(u);
const ytEmbed = (u) => {
  const m = u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : u;
};
// Aggiunge i parametri di autoplay (muto, come richiesto dalla policy dei browser) all'URL
// dell'embed YouTube, così il video parte da solo senza dover cliccare sul canvas.
const withAutoplay = (u) => u + (u.includes('?') ? '&' : '?') + 'autoplay=1&mute=1&playsinline=1';

function useHTMLImage(url) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    if (!url) return;
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.src = url;
    i.onload = () => setImg(i);
  }, [url]);
  return img;
}
function CanvasImage({ obj, shapeRef, ...rest }) {
  const img = useHTMLImage(obj.src);
  return <KImage ref={shapeRef} image={img} x={obj.x} y={obj.y} width={obj.width} height={obj.height} rotation={obj.rotation} {...rest} />;
}

// Menù a tendina della barra. `swatch` mostra un quadratino di colore accanto all'etichetta.
function Dropdown({ label, open, onToggle, swatch, align = 'right', children }) {
  return (
    <div style={{ position: 'relative' }}>
      <button style={m.trigger} onClick={onToggle}>
        {swatch && <span style={{ ...m.dot, background: swatch }} />}
        {label} <ChevronDown size={13} style={{ verticalAlign: 'middle' }} />
      </button>
      {open && (
        <>
          <div style={m.backdrop} onClick={onToggle} />
          <div style={{ ...m.panel, ...(align === 'left' ? { left: 0, right: 'auto' } : {}) }}>{children}</div>
        </>
      )}
    </div>
  );
}
function MenuItem({ onClick, disabled, children }) {
  return (
    <button style={{ ...m.item, ...(disabled ? m.itemOff : {}) }} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

// Pulsante icona della toolbar FigJam (in basso). `tint` colora l'icona a riposo
// (quando non è attiva/disabilitata).
function ToolButton({ active, disabled, onClick, title, tint, label, caret, children }) {
  const tintStyle = tint && !active && !disabled ? { color: tint } : {};
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      style={{ ...m.tool, position: 'relative', ...(active ? m.toolOn : {}), ...(disabled ? m.toolOff : {}), ...tintStyle }}>
      {children}
      {label && <span style={m.toolLabel}>{label}</span>}
      {caret && <span style={{ position: 'absolute', top: 4, right: 6, width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '4px solid currentColor', opacity: 0.85 }} />}
    </button>
  );
}

// Popover che si apre SOPRA il pulsante (per la toolbar in basso).
function Popover({ trigger, title, active, open, onToggle, label, tint, orient = 'h', children }) {
  const tintStyle = tint && !active && !open ? { color: tint } : {};
  // Verso di apertura: barra orizzontale -> sopra il pulsante (default); barra verticale -> di lato.
  const popStyle = orient === 'v' ? { ...m.popup, bottom: 'auto', top: 0, left: '110%', transform: 'none' } : m.popup;
  return (
    <div style={{ position: 'relative' }}>
      <button title={title} style={{ ...m.tool, ...(active || open ? m.toolOn : {}), ...tintStyle }} onClick={onToggle}>
        {trigger}
        {label && <span style={m.toolLabel}>{label}</span>}
      </button>
      {open && (
        <>
          <div style={m.backdrop} onClick={onToggle} />
          <div style={popStyle}>{children}</div>
        </>
      )}
    </div>
  );
}

// Icona a corredo di una voce di menu (allineata al testo).
const MIcon = ({ icon: I }) => <I size={16} style={{ verticalAlign: '-3px', marginRight: 8, flex: 'none' }} />;

// Icone della toolbar inferiore (Lucide), stile line-art in currentColor.
const Ic = {
  cursor: <MousePointer2 size={21} />,
  hand: <Hand size={21} />,
  pen: <Pen size={21} />,
  marker: <Highlighter size={21} />,
  eraser: <Eraser size={21} />,
  square: <Shapes size={21} />,
  text: <Type size={21} />,
  sticky: <StickyNote size={21} />,
  plus: <Plus size={21} />,
};

// Cursori-icona mostrati SUL CANVAS quando è attivo lo strumento: stessa icona Lucide
// della toolbar, resa come cursore CSS (data URI) con alone bianco per leggibilità.
// `hx,hy` = punto attivo (hotspot) dell'icona, in coordinate 0..24.
const cursorFor = (paths, hx, hy) => {
  const layer = (stroke, w) => paths.map((d) => `<path d="${d}" stroke="${stroke}" stroke-width="${w}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${layer('#fff', 4)}${layer('#111', 2)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, auto`;
};
const TOOL_CURSORS = {
  select: cursorFor(['M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'], 4, 4),
  pan: cursorFor([
    'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
    'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2',
    'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  ], 12, 11),
  pen: cursorFor(['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'], 3, 21),
  highlighter: cursorFor(['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'], 3, 20),
  eraser: cursorFor(['M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21', 'm5.082 11.09 8.828 8.828'], 4, 19),
};

const m = {
  trigger: { display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13 },
  dot: { width: 14, height: 14, borderRadius: 3, border: '1px solid #ccc' },
  backdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  panel: { position: 'absolute', top: '100%', right: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', padding: 6, zIndex: 41, minWidth: 190 },
  popup: { position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)', padding: 6, zIndex: 41, minWidth: 200 },
  item: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#222' },
  itemOff: { color: '#bbb', cursor: 'not-allowed' },
  tool: { minWidth: 48, height: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '4px 6px', border: 'none', borderRadius: 12, background: 'transparent', cursor: 'pointer', fontSize: 16, color: '#3a3a44' },
  toolLabel: { fontSize: 9, lineHeight: 1, fontWeight: 600, letterSpacing: 0.2 },
  toolOn: { background: 'linear-gradient(135deg,#7048e8,#9775fa)', color: '#fff', boxShadow: '0 4px 12px rgba(112,72,232,.4)' },
  toolOff: { color: '#ccc', cursor: 'not-allowed' },
};

export default function Board() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  const [objects, setObjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tool, setTool] = useState('select');
  const [color, setColor] = useState('#4c6ef5');
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [cursors, setCursors] = useState([]);   // cursori remoti (awareness)
  const [guides, setGuides] = useState([]);      // linee-guida di snapping
  const [draft, setDraft] = useState(null);      // linea in corso (penna)
  const [eraserPos, setEraserPos] = useState(null); // centro della gomma (coord. canvas) per l'anteprima
  const [penWidth, setPenWidth] = useState(3);       // spessore penna (px)
  const [markerWidth, setMarkerWidth] = useState(18); // spessore evidenziatore (px)
  const [eraserWidth, setEraserWidth] = useState(14); // raggio gomma (px-schermo)
  const [toolPop, setToolPop] = useState(null);       // popover opzioni strumento: 'pen'|'highlighter'|'eraser'|'note'
  const [noteColor, setNoteColor] = useState(0);      // indice colore nota corrente in NOTE_COLORS
  const [connectFrom, setConnectFrom] = useState(null); // id oggetto sorgente durante la creazione di un connettore
  const [stampEmoji, setStampEmoji] = useState('👍');   // emoji corrente da timbrare (tool 'stamp')
  const [marqueeBox, setMarqueeBox] = useState(null);   // rettangolo di selezione ad area {x,y,w,h} (coord. canvas)
  const marqueeRef = useRef(null);                       // punto di partenza del marquee
  const [showLayers, setShowLayers] = useState(false);
  const [showCollabs, setShowCollabs] = useState(false); // pannello collaboratori (icona 👥)
  const [collabs, setCollabs] = useState([]);             // elenco collaboratori caricato via REST
  const [showScenes, setShowScenes] = useState(false);    // pannello scene/frame
  const [presenting, setPresenting] = useState(false);    // modalità presentazione attiva
  const [presentIdx, setPresentIdx] = useState(0);        // indice scena corrente in presentazione
  const [exporting, setExporting] = useState(false);      // export in corso (rende i link dei video)
  const [hoveredMedia, setHoveredMedia] = useState(null); // id media col mouse sopra -> contenuto interattivo (hover)
  const [openMenu, setOpenMenu] = useState(null); // menù a tendina aperto
  const [noteMenu, setNoteMenu] = useState(null);  // sotto-menù della barra nota (color/font/size)
  const [inlineEdit, setInlineEdit] = useState(null); // id nota in editing inline sul canvas
  const [inlineText, setInlineText] = useState('');   // testo corrente della nota in editing
  const [ctxMenu, setCtxMenu] = useState(null); // menu contestuale (tasto destro): {x,y,objId}
  const [timer, setTimer] = useState(180);        // timer stile FigJam (secondi)
  const [timerOn, setTimerOn] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // Toolbar trascinabile: pos {x,y} in px-schermo (null = default basso-centro), orient 'h'|'v'. Persistita in localStorage.
  const [toolbar, setToolbar] = useState(() => { try { return JSON.parse(localStorage.getItem('cb.toolbar')) || { pos: null, orient: 'h' }; } catch { return { pos: null, orient: 'h' }; } });
  const [draggingBar, setDraggingBar] = useState(false); // drag della barra in corso -> z-index sopra i pannelli

  const ydoc = useRef(null);
  const ymap = useRef(null);
  const undoMgr = useRef(null);
  const awareness = useRef(null);
  const stageRef = useRef(null);
  const trRef = useRef(null);
  const shapeRefs = useRef({});
  const clipboard = useRef([]);
  const fileInput = useRef(null);
  const erasing = useRef(false);            // gomma: true mentre si trascina per cancellare
  const viewBeforePresent = useRef(null);   // vista da ripristinare uscendo dalla presentazione
  const camAnim = useRef(0);                // id requestAnimationFrame del tween camera (0 = nessuno)
  const barRef = useRef(null);              // nodo DOM della toolbar (per posizione/dimensioni reali nel drag)
  const canEdit = role === 'owner' || role === 'editor';

  // Persistenza posizione/orientamento della toolbar.
  useEffect(() => { try { localStorage.setItem('cb.toolbar', JSON.stringify(toolbar)); } catch {} }, [toolbar]);

  // Anti-sparizione: al mount, al resize e quando la barra ricompare/cambia orientamento,
  // ri-clampa una `pos` salvata dentro i limiti correnti del parent (stesse semantiche del drag).
  // Recupera automaticamente una pos stantia finita off-screen (viewport più piccola, ecc.).
  useEffect(() => {
    const clamp = () => {
      const bar = barRef.current; if (!bar) return;
      const par = bar.parentElement; if (!par) return;
      const rect = bar.getBoundingClientRect(), parRect = par.getBoundingClientRect();
      setToolbar((tb) => {
        if (!tb.pos) return tb; // default (basso-centro): niente da clampare
        const x = Math.max(0, Math.min(parRect.width - rect.width, tb.pos.x));
        const y = Math.max(0, Math.min(parRect.height - rect.height, tb.pos.y));
        if (x === tb.pos.x && y === tb.pos.y) return tb; // guardia anti-loop: nessun cambio, nessun re-render
        return { ...tb, pos: { x, y } };
      });
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [presenting, canEdit, toolbar.orient]);

  // Metadati (nome/ruolo) via REST. Gli oggetti arrivano da Yjs, non da qui.
  useEffect(() => {
    api.get(`/boards/${id}`).then((b) => { setName(b.name); setRole(b.role); })
      .catch((e) => { toast(e.message); nav('/'); });
  }, [id]);

  // Setup Yjs (doc + provider + awareness + undo manager).
  useEffect(() => {
    if (!user) return;
    const doc = new Y.Doc();
    const map = doc.getMap('objects');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const provider = new WebsocketProvider(`${proto}://${location.host}/yjs`, String(id), doc, {
      params: { token: getToken() },
    });
    const um = new Y.UndoManager(map);
    ydoc.current = doc; ymap.current = map; awareness.current = provider.awareness; undoMgr.current = um;

    const sync = () => setObjects(Array.from(map.values()));
    map.observe(sync);
    sync();

    const refreshUndo = () => { setCanUndo(um.canUndo()); setCanRedo(um.canRedo()); };
    um.on('stack-item-added', refreshUndo);
    um.on('stack-item-popped', refreshUndo);

    const myColor = PALETTE[provider.awareness.clientID % PALETTE.length];
    provider.awareness.setLocalStateField('user', { name: user.displayName || user.email, color: myColor });
    const onAw = () => {
      const states = Array.from(provider.awareness.getStates().entries())
        .filter(([cid]) => cid !== provider.awareness.clientID)
        .map(([cid, s]) => ({ cid, ...s.user, cursor: s.cursor }));
      setCursors(states);
    };
    provider.awareness.on('change', onAw);

    return () => {
      provider.awareness.off('change', onAw);
      map.unobserve(sync);
      provider.destroy();
      doc.destroy();
    };
  }, [id, user]);

  const ordered = [...objects].sort((a, b) => (a.z || 0) - (b.z || 0));
  const maxZ = objects.reduce((m, o) => Math.max(m, o.z || 0), 0);
  const isOwner = role === 'owner';
  // Scene (frame) ordinate per la presentazione.
  const frames = objects.filter((o) => o.type === 'frame').sort((a, b) => (a.order || 0) - (b.order || 0));
  const maxOrder = frames.reduce((m, o) => Math.max(m, o.order || 0), 0);

  // Bounding box di un oggetto in coordinate canvas (approssimato, rotazione ignorata).
  function objectBBox(o) {
    if (o.type === 'line' || o.type === 'arrow' || o.type === 'straight' || o.type === 'cpoly') {
      const p = o.points || [];
      if (p.length < 2) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
    if (o.type === 'ellipse') return { x: o.x - o.rx, y: o.y - o.ry, width: o.rx * 2, height: o.ry * 2 };
    if (o.type === 'poly' || o.type === 'star') return { x: o.x - o.radius, y: o.y - o.radius, width: o.radius * 2, height: o.radius * 2 };
    if (o.type === 'text') { const fs = o.fontSize || 24; const lines = String(o.text || '').split('\n'); const w = Math.max(1, ...lines.map((l) => l.length)) * fs * 0.55; return { x: o.x, y: o.y, width: w, height: lines.length * fs * 1.3 }; }
    return { x: o.x, y: o.y, width: o.width || 0, height: o.height || 0 };
  }
  // Bounding box che racchiude un insieme di oggetti (null se vuoto).
  function unionBBox(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
    for (const o of list) {
      const b = objectBBox(o);
      if (!b) continue;
      any = true;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    return any ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }

  // In presentazione ogni scena è una SLIDE isolata: si mostrano solo gli oggetti il cui
  // centro cade dentro il frame corrente (niente sovrapposizioni con le altre parti del
  // canvas); i bordi/etichette dei frame vengono nascosti.
  const presentFrame = presenting ? frames[presentIdx] : null;
  const inPresentFrame = (o) => {
    if (!presentFrame) return true;
    const b = objectBBox(o);
    if (!b) return false;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    return cx >= presentFrame.x && cx <= presentFrame.x + presentFrame.width
      && cy >= presentFrame.y && cy <= presentFrame.y + presentFrame.height;
  };
  const renderList = presenting ? ordered.filter((o) => o.type !== 'frame' && inPresentFrame(o)) : ordered;

  // Mutazioni sul Y.Map (Yjs propaga sync + undo).
  function setObj(o) { ymap.current && ydoc.current.transact(() => ymap.current.set(o.id, o)); }
  function delObjs(ids) {
    const set = new Set(ids);
    ydoc.current.transact(() => {
      ids.forEach((i) => ymap.current.delete(i));
      // rimuove anche i connettori che puntavano a un oggetto eliminato
      for (const o of ymap.current.values()) if (o.type === 'connector' && (set.has(o.from) || set.has(o.to))) ymap.current.delete(o.id);
    });
  }
  function newStep() { undoMgr.current?.stopCapturing(); } // separa gli step di undo

  function addObject(obj) { newStep(); setObj({ ...obj, z: maxZ + 1 }); }
  function updateObject(o) { setObj(o); }

  function deleteSelected() {
    if (!canEdit || !selectedIds.length) return;
    newStep(); delObjs(selectedIds); setSelectedIds([]);
  }
  // Svuota la lavagna: elimina TUTTI gli oggetti in un colpo solo (con conferma, annullabile con Ctrl+Z).
  async function clearAll() {
    setOpenMenu(null);
    if (!canEdit) return;
    if (!objects.length) { toast('La lavagna è già vuota'); return; }
    if (!(await askConfirm(`Cancellare tutti gli oggetti della lavagna (${objects.length})? Puoi annullare con Ctrl+Z.`, 'Cancella tutto', 'Annulla'))) return;
    newStep(); delObjs(objects.map((o) => o.id)); setSelectedIds([]);
  }
  // Modifica del testo di una nota (doppio click). askText torna null se annullato.
  // Editing INLINE della nota: doppio clic => cursore in una textarea sopra la nota,
  // che segue pan/zoom. La qualità del testo (font/dimensione/colore/grassetto) si
  // regola dalla barra di formattazione flottante, che resta visibile.
  function editSticky(o) { openInline(o); }
  function openInline(o) {
    if (!canEdit || presenting) return;
    setSelectedIds([o.id]);
    setInlineText(o.text || '');
    setInlineEdit(o.id);
  }
  function commitInline(v) {
    setInlineText(v);
    const o = objects.find((x) => x.id === inlineEdit);
    if (o) updateObject({ ...o, text: v });
  }
  function closeInline() {
    const o = objects.find((x) => x.id === inlineEdit);
    if (o && o.type === 'text' && !(o.text || '').trim()) { newStep(); delObjs([o.id]); setSelectedIds((s) => s.filter((x) => x !== o.id)); } // testo lasciato vuoto -> rimosso
    setInlineEdit(null);
  }
  // Chiude l'editing inline quando l'oggetto non è più selezionato (clic altrove).
  useEffect(() => { if (inlineEdit && !selectedIds.includes(inlineEdit)) closeInline(); }, [selectedIds, inlineEdit]);
  function copySelected() { clipboard.current = objects.filter((o) => selectedIds.includes(o.id)); }
  function paste() {
    if (!canEdit || !clipboard.current.length) return;
    newStep();
    const copies = clipboard.current.map((o, i) => ({ ...o, id: uid(), x: (o.x || 0) + 20, y: (o.y || 0) + 20, z: maxZ + 1 + i }));
    ydoc.current.transact(() => copies.forEach((c) => ymap.current.set(c.id, c)));
    setSelectedIds(copies.map((c) => c.id));
  }
  function duplicate() { copySelected(); paste(); }

  // Scorciatoie da tastiera.
  useEffect(() => {
    function onKey(e) {
      // Non intercettare le scorciatoie (Canc/Backspace/Ctrl+…) mentre si scrive in un
      // campo di testo (es. la form di condivisione o le modali): altrimenti non si
      // riuscirebbe a cancellare il testo digitato.
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (presenting) return; // in presentazione la lavagna è immutabile (no Canc/undo/ecc.)
      if (!canEdit) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      else if (mod && e.key.toLowerCase() === 'c') copySelected();
      else if (mod && e.key.toLowerCase() === 'v') paste();
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? undoMgr.current?.redo() : undoMgr.current?.undo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [objects, selectedIds, canEdit, presenting]);

  // Transformer agganciato alla selezione. I tratti a mano libera (line) restano
  // selezionabili/cancellabili ma senza maniglie di trasformazione (rotarli attorno
  // all'origine li farebbe schizzare via).
  useEffect(() => {
    const nodes = selectedIds
      .filter((sid) => objects.find((x) => x.id === sid)?.type !== 'line')
      .map((sid) => shapeRefs.current[sid]).filter(Boolean);
    trRef.current?.nodes(nodes);
    trRef.current?.getLayer()?.batchDraw();
  }, [selectedIds, objects]);

  async function save() { await api.put(`/boards/${id}`, { doc: { version: 1, objects } }); toast('Snapshot salvato'); }
  // Crea una nuova lavagna e vi naviga (disponibile anche dall'interno di una lavagna).
  async function newBoard() {
    const name = await askText('Nome della nuova lavagna:', 'Senza titolo');
    if (name === null) return;
    try { const b = await api.post('/boards', { name }); nav(`/board/${b.id}`); }
    catch (e) { toast(e.message); }
  }

  // ⑨ Export dell'INTERO canvas (non solo la porzione visibile): attiva `exporting`
  // (che rende i link dei video/PDF e nasconde transformer/frame), poi un effetto cattura.
  function exportPNG() {
    if (!objects.some((o) => o.type !== 'frame')) { toast('Niente da esportare'); return; }
    setSelectedIds([]);
    setExporting(true);
  }
  useEffect(() => {
    if (!exporting) return;
    const raf = requestAnimationFrame(() => {
      const stage = stageRef.current;
      try {
        const bounds = unionBBox(objects.filter((o) => o.type !== 'frame'));
        if (!bounds) { setExporting(false); return; }
        const pad = 40;
        const box = { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 };
        const prev = { x: stage.x(), y: stage.y(), sx: stage.scaleX(), sy: stage.scaleY() };
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: -box.x, y: -box.y });
        stage.draw();
        const uri = stage.toDataURL({ x: 0, y: 0, width: box.width, height: box.height, pixelRatio: 2 });
        stage.scale({ x: prev.sx, y: prev.sy });
        stage.position({ x: prev.x, y: prev.y });
        stage.draw();
        const a = document.createElement('a');
        a.download = `${name || 'board'}.png`;
        a.href = uri;
        a.click();
      } catch (e) { toast('Export fallito: ' + e.message); }
      setExporting(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [exporting]);

  // Upload immagine/video/pdf da file: /api/media torna { kind, url }.
  async function onFilePicked(e) {
    setOpenMenu(null); // ⑦ chiude il popup di upload appena parte il caricamento
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { kind, url, pdfUrl } = await api.uploadMedia(file, id);
      if (kind === 'video') addObject({ id: uid(), type: 'video', x: 120, y: 120, width: 320, height: 180, src: url, embed: false, rotation: 0 });
      else if (kind === 'pdf') addObject({ id: uid(), type: 'pdf', x: 120, y: 120, width: 420, height: 560, src: url, name: file.name, rotation: 0 });
      else if (kind === 'pptx') addObject({ id: uid(), type: 'pptx', x: 140, y: 140, width: 440, height: 340, src: url, pdf: pdfUrl || undefined, name: file.name, rotation: 0 });
      else addObject({ id: uid(), type: 'image', x: 100, y: 100, width: 240, height: 180, src: url, rotation: 0 });
    } catch (err) { toast(err.message); }
    e.target.value = '';
  }
  // Apre il .pptx DIRETTAMENTE in PowerPoint desktop tramite lo schema URI di Office
  // (`ms-powerpoint:ofe|u|<url>`): niente download manuale.
  function openInPowerPoint(o) {
    const abs = /^https?:/.test(o.src) ? o.src : location.origin + o.src;
    window.open(`ms-powerpoint:ofe|u|${abs}`, '_blank');
  }

  // Immagine/video da URL: il popup compare SUBITO alla scelta dal menu (come "Carica file"),
  // senza dover prima cliccare sul canvas. L'oggetto è creato al centro della vista corrente.
  function viewportCenter() {
    const vw = window.innerWidth - (showLayers ? 220 : 0);
    return { x: (vw / 2 - view.x) / view.scale, y: (window.innerHeight / 2 - view.y) / view.scale };
  }
  async function addImageFromUrl() {
    setOpenMenu(null);
    const src = await askText('URL immagine:');
    if (!src) return;
    const c = viewportCenter();
    addObject({ id: uid(), type: 'image', x: c.x - 100, y: c.y - 75, width: 200, height: 150, src, rotation: 0 });
  }
  async function addVideoFromUrl() {
    setOpenMenu(null);
    const src = await askText('URL video (YouTube o file .mp4/.webm):');
    if (!src) return;
    const c = viewportCenter();
    addObject({ id: uid(), type: 'video', x: c.x - 160, y: c.y - 90, width: 320, height: 180, src: isYouTube(src) ? ytEmbed(src) : src, embed: isYouTube(src), rotation: 0 });
  }

  // --- Pan/zoom (canvas infinito), Stage controllato da `view` ---
  function onWheel(e) {
    if (presenting) return; // vista bloccata in presentazione (lavagna immutabile)
    e.evt.preventDefault();
    const stage = stageRef.current;
    const old = view.scale;
    const pointer = stage.getPointerPosition();
    const wp = { x: (pointer.x - view.x) / old, y: (pointer.y - view.y) / old };
    const scale = e.evt.deltaY > 0 ? old / 1.1 : old * 1.1;
    setView({ scale, x: pointer.x - wp.x * scale, y: pointer.y - wp.y * scale });
  }
  function pointerPos() {
    const p = stageRef.current.getPointerPosition();
    return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
  }

  function onMouseDown(e) {
    if (presenting) return; // in presentazione la lavagna non è editabile
    // Clic sul canvas: chiudi eventuali popup/menù aperti (barra e sotto-menù nota).
    if (openMenu) setOpenMenu(null);
    if (noteMenu) setNoteMenu(null);
    if (toolPop) setToolPop(null);
    // Se sto editando una nota/testo, un clic sullo spazio vuoto CHIUDE l'editor (perde il
    // focus) e deseleziona, SENZA creare un altro oggetto.
    if (inlineEdit && e.target === e.target.getStage()) { closeInline(); setSelectedIds([]); return; }
    // 'select' e 'pan' non creano oggetti: click sullo sfondo deseleziona (solo in select).
    if (tool === 'select' || tool === 'pan') {
      // Select su spazio vuoto: avvia la selezione ad area (marquee). La deselezione
      // avviene al rilascio se è un semplice clic (nessun trascinamento).
      if (tool === 'select' && e.target === e.target.getStage()) {
        const p = pointerPos();
        marqueeRef.current = { x: p.x, y: p.y };
        setMarqueeBox({ x: p.x, y: p.y, w: 0, h: 0 });
      }
      return;
    }
    if (!canEdit) return;
    // Connettore: il collegamento si crea cliccando gli oggetti (onSelect). Un clic sul vuoto annulla la partenza.
    if (tool === 'connector') { if (e.target === e.target.getStage()) setConnectFrom(null); return; }
    if (tool === 'eraser') { newStep(); erasing.current = true; const p = pointerPos(); setEraserPos(p); eraseAtPoint(p); return; }
    const pos = pointerPos();
    // Timbro emoji/reazione: crea un oggetto testo con l'emoji (lo strumento resta attivo).
    if (tool === 'stamp') { addObject({ id: uid(), type: 'text', x: pos.x, y: pos.y, text: stampEmoji, fontSize: 46, fill: '#212529', fontFamily: FONT, rotation: 0 }); return; }
    if (SHAPE_TOOLS.includes(tool)) { const s = makeShape(tool, pos, color); if (s) addObject(s); }
    if (tool === 'sticky') {
      const note = { id: uid(), type: 'sticky', x: pos.x, y: pos.y, width: 200, height: 200, text: '', fill: NOTE_COLORS[noteColor].fill, stroke: NOTE_COLORS[noteColor].border, fontFamily: FONTS[0].key, fontSize: 18, textColor: readable(NOTE_COLORS[noteColor].fill), author: user?.displayName || user?.email || '', rotation: 0 };
      addObject(note);
      openInline(note); // apre subito l'editing inline sulla nota nuova
    }
    if (tool === 'text') {
      const txt = { id: uid(), type: 'text', x: pos.x, y: pos.y, text: '', fontSize: 24, fill: color, fontFamily: FONTS[0].key, rotation: 0 };
      addObject(txt);
      openInline(txt); // apre lo stesso spazio di editing inline della nota
    }
    if (tool === 'pen' || tool === 'highlighter') {
      newStep();
      const hl = tool === 'highlighter';
      setDraft({ id: uid(), type: 'line', points: [pos.x, pos.y], stroke: color, strokeWidth: hl ? markerWidth : penWidth, opacity: hl ? 0.4 : 1, z: maxZ + 1 });
    }
    // Lo strumento selezionato resta attivo finché l'utente non ne sceglie un altro
    // (nessun ritorno automatico a "select"): permette usi ripetuti dello stesso strumento.
  }
  function onMouseMove() {
    if (presenting) return;
    // Mouse tornato sul canvas -> disattiva l'hover sul media (lo Stage non riceve
    // eventi mentre il puntatore è sopra il contenuto/iframe, quindi il reset scatta qui).
    if (hoveredMedia) setHoveredMedia(null);
    // Cursore condiviso (effimero).
    if (awareness.current) { const p = pointerPos(); awareness.current.setLocalStateField('cursor', p); }
    if ((tool === 'pen' || tool === 'highlighter') && draft) setDraft((d) => ({ ...d, points: d.points.concat([pointerPos().x, pointerPos().y]) }));
    if (tool === 'eraser') { const p = pointerPos(); setEraserPos(p); if (erasing.current) eraseAtPoint(p); }
    if (marqueeRef.current) { const p = pointerPos(); const s = marqueeRef.current; setMarqueeBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); }
  }
  function onMouseUp() {
    if (presenting) return;
    erasing.current = false;
    if ((tool === 'pen' || tool === 'highlighter') && draft) { setObj(draft); setDraft(null); } // lo strumento resta attivo
    // Fine selezione ad area: seleziona gli oggetti che intersecano il rettangolo (clic secco = deseleziona).
    if (marqueeRef.current) {
      const s = marqueeRef.current; marqueeRef.current = null;
      const p = pointerPos();
      const box = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) };
      setMarqueeBox(null);
      if (box.width < 4 && box.height < 4) { setSelectedIds([]); return; }
      const ids = objects.filter((o) => o.type !== 'connector' && o.type !== 'frame' && rectsIntersect(box, objectBBox(o))).map((o) => o.id);
      setSelectedIds(ids);
    }
  }

  // Gomma su una forma (rettangolo/ellisse/nota/testo/immagine/video): cancellazione
  // intera al clic o quando la si attraversa trascinando. Per i tratti a mano libera
  // (penna/evidenziatore) si usa invece eraseAtPoint, che cancella solo la parte toccata.
  function eraseObj(e, id) {
    if (e) e.cancelBubble = true;
    erasing.current = true;
    if (canEdit) { newStep(); delObjs([id]); setSelectedIds((s) => s.filter((x) => x !== id)); }
  }

  // Gomma "a pixel": cancella solo la porzione di tratto (penna/evidenziatore) sotto la
  // gomma, spezzando la linea nei segmenti superstiti. Legge i valori freschi dallo Y.Map
  // (durante un trascinamento veloce lo stato React è indietro) e applica tutto in una
  // sola transazione Yjs (sync + undo condivisi).
  function eraseAtPoint(pos) {
    if (!canEdit || !ymap.current) return;
    const r = eraserWidth / view.scale;   // raggio in coordinate canvas (indipendente dallo zoom)
    const r2 = r * r;
    const edits = [];
    for (const o of ymap.current.values()) {
      if (o.type !== 'line' || !Array.isArray(o.points)) continue;
      const segs = [];
      let cur = [];
      for (let i = 0; i < o.points.length; i += 2) {
        const dx = o.points[i] - pos.x, dy = o.points[i + 1] - pos.y;
        if (dx * dx + dy * dy <= r2) { if (cur.length >= 4) segs.push(cur); cur = []; } // punto cancellato -> chiudi il segmento
        else cur.push(o.points[i], o.points[i + 1]);
      }
      if (cur.length >= 4) segs.push(cur);
      const kept = segs.reduce((n, s) => n + s.length, 0);
      if (kept === o.points.length) continue; // nulla toccato su questa linea
      edits.push({ o, segs });
    }
    if (!edits.length) return;
    ydoc.current.transact(() => {
      for (const { o, segs } of edits) {
        if (!segs.length) { ymap.current.delete(o.id); continue; }   // tratto interamente cancellato
        ymap.current.set(o.id, { ...o, points: segs[0] });           // primo segmento: riusa l'id originale
        for (let k = 1; k < segs.length; k++) {                       // segmenti extra: nuovi oggetti linea
          const nid = uid();
          ymap.current.set(nid, { ...o, id: nid, points: segs[k] });
        }
      }
    });
  }

  // Menu contestuale (tasto destro): su un oggetto o sul canvas vuoto.
  function onStageContextMenu(e) {
    e.evt.preventDefault();
    if (!canEdit || presenting) return;
    const stage = stageRef.current;
    const p = stage.getPointerPosition();
    const target = e.target;
    const objId = target && target !== stage ? target.id() : null;
    if (objId && !selectedIds.includes(objId)) setSelectedIds([objId]);
    setCtxMenu({ x: p.x, y: p.y, objId: objId || null });
  }

  function onSelect(e, objId) {
    if (presenting) return;
    // Modalità connettore: 1° clic = oggetto di partenza, 2° = arrivo -> crea il connettore.
    if (tool === 'connector') {
      e.cancelBubble = true;
      const o = objects.find((x) => x.id === objId);
      if (!o || o.type === 'connector' || o.type === 'frame') return; // non collegabile
      if (!connectFrom) { setConnectFrom(objId); }
      else { if (connectFrom !== objId) addObject({ id: uid(), type: 'connector', from: connectFrom, to: objId }); setConnectFrom(null); }
      return;
    }
    if (tool !== 'select') return;
    e.cancelBubble = true;
    setSelectedIds((prev) => {
      if (e.evt.shiftKey) return prev.includes(objId) ? prev.filter((x) => x !== objId) : [...prev, objId];
      return [objId];
    });
  }

  // Snapping: allinea gli spigoli/centri del nodo trascinato agli altri oggetti.
  function onDragMove(e) {
    if (!canEdit) return;
    const node = e.target;
    const layer = node.getLayer();
    const box = node.getClientRect({ relativeTo: layer });
    const TH = 6;
    const others = ordered.filter((o) => o.id !== node.id() && shapeRefs.current[o.id])
      .map((o) => shapeRefs.current[o.id].getClientRect({ relativeTo: layer }));
    const g = [];
    const anchorsX = (b) => [b.x, b.x + b.width / 2, b.x + b.width];
    const anchorsY = (b) => [b.y, b.y + b.height / 2, b.y + b.height];
    let dx = null, dy = null;
    for (const ob of others) {
      for (const a of anchorsX(box)) for (const t of anchorsX(ob)) if (Math.abs(a - t) < TH && dx === null) { dx = t - a; g.push({ v: true, at: t }); }
      for (const a of anchorsY(box)) for (const t of anchorsY(ob)) if (Math.abs(a - t) < TH && dy === null) { dy = t - a; g.push({ v: false, at: t }); }
    }
    if (dx !== null) node.x(node.x() + dx);
    if (dy !== null) node.y(node.y() + dy);
    setGuides(g);
  }

  function onTransformEnd(o, node) {
    const sx = node.scaleX(), sy = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const base = { ...o, x: node.x(), y: node.y(), rotation: node.rotation() };
    if (['rect', 'image', 'video', 'pdf', 'sticky', 'frame'].includes(o.type)) updateObject({ ...base, width: Math.max(5, node.width() * sx), height: Math.max(5, node.height() * sy) });
    else if (o.type === 'ellipse') updateObject({ ...base, rx: Math.max(5, o.rx * sx), ry: Math.max(5, o.ry * sy) });
    else if (o.type === 'poly') updateObject({ ...base, radius: Math.max(5, o.radius * (sx + sy) / 2) });
    else if (o.type === 'star') updateObject({ ...base, radius: Math.max(5, o.radius * (sx + sy) / 2), innerRadius: Math.max(3, o.innerRadius * (sx + sy) / 2) });
    else if (o.type === 'text') updateObject({ ...base, fontSize: Math.max(6, o.fontSize * sy) });
    else if (o.type === 'arrow' || o.type === 'straight' || o.type === 'cpoly') {
      // Baking dello scale nei punti (i punti sono in coordinate canvas assolute, x/y del nodo = 0).
      const pts = o.points.map((v, i) => (i % 2 === 0 ? node.x() + v * sx : node.y() + v * sy));
      updateObject({ ...o, x: 0, y: 0, points: pts, rotation: node.rotation() });
    }
    else updateObject(base);
  }

  // Ridimensionamento diretto della "finestra" di un media (immagine/video/PDF) tramite
  // le maniglie sull'overlay: bordo destro = larghezza (orizzontale), bordo inferiore =
  // altezza (verticale), angolo = entrambe. L'angolo in alto a sinistra resta fisso.
  // I delta a schermo sono convertiti in coordinate canvas (/scale) e proiettati sugli
  // assi locali del media (per gestire un'eventuale rotazione).
  function startMediaResize(e, o, dir) {
    e.stopPropagation();
    if (!canEdit || presenting) return;
    setSelectedIds([o.id]);
    newStep();
    const startX = e.clientX, startY = e.clientY;
    const startW = o.width, startH = o.height;
    const scale = view.scale;
    const rad = -((o.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const ldx = dx * cos - dy * sin; // delta lungo l'asse largo (locale)
      const ldy = dx * sin + dy * cos; // delta lungo l'asse alto (locale)
      let w = startW, h = startH;
      if (dir.includes('e')) w = Math.max(40, startW + ldx);
      if (dir.includes('s')) h = Math.max(40, startH + ldy);
      updateObject({ ...o, width: w, height: h });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Spostamento diretto della "finestra" di un media (immagine/video/PDF) trascinando la
  // barra-intestazione dell'overlay: l'iframe del PDF/video intercetta i clic sul corpo,
  // quindi il trascinamento passa da un handle dedicato. Delta a schermo -> coordinate canvas (/scale).
  function startMediaMove(e, o) {
    e.stopPropagation();
    if (!canEdit || presenting) return;
    setTool('select');
    setSelectedIds([o.id]);
    newStep();
    const startX = e.clientX, startY = e.clientY;
    const ox = o.x, oy = o.y;
    const scale = view.scale;
    const onMove = (ev) => updateObject({ ...o, x: ox + (ev.clientX - startX) / scale, y: oy + (ev.clientY - startY) / scale });
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Trascinamento della toolbar in spazio-SCHERMO (nessuna divisione per view.scale): la barra
  // vive sopra il canvas. Parte dalla posizione reale (getBoundingClientRect) così funziona anche
  // dalla posizione centrata di default; delta grezzi in px; clamp dentro il viewport.
  function startToolbarMove(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOpenMenu(null); setToolPop(null); // niente menu aperti durante il drag (evita il backdrop del Popover)
    setDraggingBar(true);
    // pos è relativa al wrapper (offset parent della barra); il clamp usa le sue dimensioni,
    // così con il pannello Livelli aperto la barra non finisce clippata dietro di esso.
    const par = barRef.current.parentElement;
    const parRect = par ? par.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const startX = e.clientX, startY = e.clientY;
    const ox = rect.left - parRect.left, oy = rect.top - parRect.top, bw = rect.width, bh = rect.height;
    const onMove = (ev) => {
      const x = Math.max(0, Math.min(parRect.width - bw, ox + (ev.clientX - startX)));
      const y = Math.max(0, Math.min(parRect.height - bh, oy + (ev.clientY - startY)));
      setToolbar((tb) => ({ ...tb, pos: { x, y } }));
    };
    const onUp = () => {
      setDraggingBar(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // z-order: scambia lo z con il vicino nell'ordine.
  function reorder(o, dir) {
    const i = ordered.findIndex((x) => x.id === o.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const a = ordered[i], b = ordered[j];
    newStep();
    ydoc.current.transact(() => { ymap.current.set(a.id, { ...a, z: b.z || 0 }); ymap.current.set(b.id, { ...b, z: a.z || 0 }); });
  }

  const draggable = canEdit && tool === 'select' && !presenting;
  const setRef = (objId) => (n) => { if (n) shapeRefs.current[objId] = n; else delete shapeRefs.current[objId]; };
  const nodeProps = (o) => ({
    id: o.id,
    draggable,
    onClick: (e) => onSelect(e, o.id),
    onTap: (e) => onSelect(e, o.id),
    onMouseDown: (e) => { if (tool === 'eraser') eraseObj(e, o.id); },
    onMouseEnter: (e) => { if (tool === 'eraser' && erasing.current) eraseObj(e, o.id); },
    onDragStart: newStep,
    onDragMove,
    onDragEnd: (e) => { setGuides([]); updateObject({ ...o, x: e.target.x(), y: e.target.y() }); },
    onTransformStart: newStep,
    onTransformEnd: (e) => onTransformEnd(o, e.target),
  });

  // Posizione a schermo (dentro il wrapper dello Stage) di un punto del canvas.
  const toScreen = (x, y) => ({ x: x * view.scale + view.x, y: y * view.scale + view.y });

  const toggleMenu = (m) => setOpenMenu((cur) => (cur === m ? null : m));
  const pickTool = (tl) => { if (inlineEdit) closeInline(); setTool(tl); setOpenMenu(null); setToolPop(null); setConnectFrom(null); };
  // Clic su uno strumento con opzioni (penna/marker/gomma/nota): la 1ª volta lo seleziona,
  // se è già attivo (ri-clic) apre/chiude il popover delle opzioni ("a richiesta").
  const clickTool = (tl, pop) => { if (tool === tl) setToolPop((c) => (c === pop ? null : pop)); else pickTool(tl); };
  // Apertura dei menu della barra (Forme/Media): chiude il popover opzioni. Mentre un menu
  // della barra è aperto, l'evidenziazione dello strumento attivo è soppressa (vedi barMenuOpen)
  // così resta evidenziato solo il menu aperto (niente doppia selezione).
  const openBarMenu = (m) => { setToolPop(null); setConnectFrom(null); toggleMenu(m); };

  // Timer stile FigJam.
  useEffect(() => {
    if (!timerOn) return;
    const t = setInterval(() => setTimer((s) => (s <= 1 ? (clearInterval(t), setTimerOn(false), 0) : s - 1)), 1000);
    return () => clearInterval(t);
  }, [timerOn]);
  const mmss = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  // Zoom con i pulsanti +/- (attorno al centro del viewport).
  function zoomBy(f) {
    setView((v) => {
      const s = Math.min(4, Math.max(0.1, v.scale * f));
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      return { scale: s, x: cx - ((cx - v.x) / v.scale) * s, y: cy - ((cy - v.y) / v.scale) * s };
    });
  }

  // --- Condivisione / collaboratori (④⑤). Tutte le rotte richiedono il ruolo owner. ---
  // Invito via email: il server verifica l'esistenza dell'utente (404 se non esiste).
  async function share() {
    const email = await askText('Email della persona con cui condividere:');
    if (!email) return;
    const r = (await askConfirm('Che permesso vuoi assegnare?', 'Editor', 'Viewer')) ? 'editor' : 'viewer';
    try { await api.post(`/boards/${id}/share`, { email, role: r }); toast('Lavagna condivisa!'); loadCollabs(); }
    catch (e) { toast(e.message); } // es. "Utente non trovato" (email non registrata)
  }
  async function loadCollabs() {
    try { setCollabs(await api.get(`/boards/${id}/collaborators`)); }
    catch (e) { toast(e.message); }
  }
  function toggleCollabs() {
    setShowScenes(false); // i due pannelli laterali sono mutuamente esclusivi (stessa posizione)
    setShowCollabs((s) => { if (!s) loadCollabs(); return !s; });
  }
  async function changeRole(email, newRole) {
    try { await api.post(`/boards/${id}/share`, { email, role: newRole }); loadCollabs(); }
    catch (e) { toast(e.message); }
  }
  async function revoke(userId) {
    if (!(await askConfirm('Revocare la condivisione a questo utente?', 'Revoca', 'Annulla'))) return;
    try { await api.del(`/boards/${id}/share/${userId}`); loadCollabs(); }
    catch (e) { toast(e.message); }
  }

  // --- Scene / presentazione (⑩) ---
  // Crea una scena (frame) dal bounding box della selezione corrente.
  function addSceneFromSelection() {
    const sel = objects.filter((o) => selectedIds.includes(o.id) && o.type !== 'frame');
    const b = unionBBox(sel);
    if (!b) { toast('Seleziona prima una o più parti della lavagna'); return; }
    const pad = 24;
    addObject({ id: uid(), type: 'frame', x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2, order: maxOrder + 1, name: `Scena ${frames.length + 1}`, rotation: 0 });
  }
  // Scambia l'ordine di una scena col vicino.
  function reorderScene(o, dir) {
    const i = frames.findIndex((f) => f.id === o.id);
    const j = i + dir;
    if (j < 0 || j >= frames.length) return;
    const a = frames[i], b = frames[j];
    newStep();
    ydoc.current.transact(() => { ymap.current.set(a.id, { ...a, order: b.order || 0 }); ymap.current.set(b.id, { ...b, order: a.order || 0 }); });
  }
  async function renameScene(o) {
    const nm = await askText('Nome scena:', o.name || '');
    if (nm === null) return;
    newStep(); updateObject({ ...o, name: nm });
  }
  function deleteScene(o) { newStep(); delObjs([o.id]); }
  // Porta la vista a inquadrare un box del canvas (centrato, con margine).
  // `topInset`: fascia superiore da lasciare libera (per la barra di presentazione),
  // così la scena viene inquadrata SOTTO la barra e resta interamente visibile.
  function fitView(box, pad = 60, topInset = 0) {
    const vw = window.innerWidth - (showLayers ? 220 : 0);
    const availH = window.innerHeight - topInset;
    const scale = Math.max(0.05, Math.min(4, Math.min((vw - pad * 2) / box.width, (availH - pad * 2) / box.height)));
    animateView({ scale, x: (vw - box.width * scale) / 2 - box.x * scale, y: topInset + (availH - box.height * scale) / 2 - box.y * scale });
  }
  // Tween morbido della camera (view) dalla vista corrente a `target` con easeInOutCubic.
  // One-shot: un nuovo tween annulla quello in corso (niente accavallamenti tra cambi rapidi di scena).
  // La scala è interpolata in spazio logaritmico per uno zoom percettivamente uniforme.
  function animateView(target, ms = 450) {
    cancelAnimationFrame(camAnim.current);
    const start = view;
    const ls = Math.log(start.scale), lt = Math.log(target.scale);
    const t0 = performance.now();
    const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms), e = ease(p);
      setView({ scale: Math.exp(ls + (lt - ls) * e), x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e });
      camAnim.current = p < 1 ? requestAnimationFrame(tick) : 0;
    };
    camAnim.current = requestAnimationFrame(tick);
  }
  const jumpToFrame = (f) => fitView({ x: f.x, y: f.y, width: f.width, height: f.height }, 60, presenting ? 120 : 0);
  function startPresent() {
    if (!frames.length) { toast('Crea almeno una scena da una selezione'); return; }
    viewBeforePresent.current = view; // memorizza la vista per ripristinarla all'uscita
    setSelectedIds([]); setShowScenes(false); setShowCollabs(false); setPresentIdx(0); setPresenting(true);
  }
  // Esce dalla presentazione e torna alla lavagna ripristinando la vista precedente.
  function exitPresent() {
    cancelAnimationFrame(camAnim.current); camAnim.current = 0; // ferma un eventuale tween in corso
    setPresenting(false);
    if (viewBeforePresent.current) setView(viewBeforePresent.current);
  }
  // Navigazione presentazione: rifà il fit alla scena corrente.
  useEffect(() => { if (presenting && frames[presentIdx]) jumpToFrame(frames[presentIdx]); }, [presenting, presentIdx]);
  useEffect(() => {
    if (!presenting) return;
    function onKey(e) {
      if (['ArrowRight', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); setPresentIdx((i) => Math.min(frames.length - 1, i + 1)); }
      else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setPresentIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Escape') exitPresent();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, frames.length]);

  const help = () => toast('Scorciatoie: Canc elimina · Ctrl+Z annulla · Ctrl+Shift+Z ripristina · Ctrl+D duplica · rotellina zoom');

  // Nota selezionata singolarmente -> barra di formattazione flottante (modello nota.png).
  const selNote = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0] && o.type === 'sticky') : null;
  const patchNote = (patch) => { if (!selNote) return; newStep(); updateObject({ ...selNote, ...patch }); };
  // Oggetto testo selezionato da solo -> barra di formattazione (colore/carattere/dimensione).
  const selText = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0] && o.type === 'text') : null;
  const patchText = (patch) => { if (!selText) return; newStep(); updateObject({ ...selText, ...patch }); };
  // Chiude i sotto-menù della barra nota quando cambia la selezione.
  useEffect(() => { setNoteMenu(null); }, [selectedIds]);

  // Barra di formattazione riusabile TALE E QUALE per note e testo. Campi mappati:
  // nota  -> sfondo=fill, testo=textColor, bordo=stroke ; testo -> sfondo=bg, testo=fill, bordo=stroke.
  function formatBar(obj, patch, isNote) {
    const bgVal = isNote ? obj.fill : (obj.bg || 'transparent');
    const textVal = isNote ? (obj.textColor || readable(obj.fill)) : (obj.fill || '#212529');
    const font = FONTS.find((f) => f.key === (obj.fontFamily || FONTS[0].key)) || FONTS[0];
    const size = SIZES.find((s) => s.v === obj.fontSize) || { v: obj.fontSize, label: String(obj.fontSize || (isNote ? 18 : 24)) };
    const w = isNote ? obj.width : Math.max(60, String(obj.text || 'Testo').length * (obj.fontSize || 24) * 0.6);
    const p = toScreen(obj.x, obj.y);
    const left = p.x + (w * view.scale) / 2;
    const top = Math.max(46, p.y - 14);
    const swatch = (c, cur, onClick) => <button key={c} title={c} onClick={onClick} style={{ ...nt.sw, background: c, outline: c === cur ? '2px solid #fff' : 'none' }} />;
    const custom = (val, onChange) => (
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 4px 2px', fontSize: 12, color: '#cfcfe0' }}>
        Personalizzato
        <input type="color" value={val} onChange={(e) => onChange(e.target.value)} style={{ width: 22, height: 22, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }} />
      </label>
    );
    const setBgPreset = (c) => { if (isNote) patch({ fill: c.fill, stroke: c.border, textColor: readable(c.fill) }); else patch({ bg: c.fill, stroke: c.border, fill: readable(c.fill) }); setNoteMenu(null); };
    const setBgCustom = (hex) => isNote ? patch({ fill: hex, stroke: hex, textColor: readable(hex) }) : patch({ bg: hex, fill: readable(hex) });
    const setLink = async () => { const url = await askText('Link (URL):', obj.link || ''); if (url === null) return; setNoteMenu(null); patch({ link: url.trim() || undefined }); };
    return (
      <div style={{ ...nt.bar, left, top }}>
        <div style={{ position: 'relative' }}>
          <button style={nt.btn} title="Colore sfondo" onClick={() => setNoteMenu(noteMenu === 'bg' ? null : 'bg')}>
            <span style={{ ...nt.dot, background: bgVal === 'transparent' ? '#fff' : bgVal }} /> <ChevronDown size={12} style={{ ...nt.caret, verticalAlign: 'middle' }} />
          </button>
          {noteMenu === 'bg' && (
            <div style={nt.pop}>
              <div style={nt.swatches}>
                {NOTE_COLORS.map((c) => <button key={c.fill} title="Colore sfondo" onClick={() => setBgPreset(c)} style={{ ...nt.sw, background: c.fill, outline: c.fill === bgVal ? '2px solid #fff' : 'none' }} />)}
                {!isNote && <button title="Nessuno sfondo" onClick={() => { patch({ bg: undefined }); setNoteMenu(null); }} style={{ ...nt.sw, background: '#fff', backgroundImage: 'linear-gradient(45deg,#bbb 25%,transparent 25%,transparent 75%,#bbb 75%)', backgroundSize: '8px 8px' }} />}
              </div>
              {custom(bgVal === 'transparent' ? '#ffffff' : bgVal, setBgCustom)}
            </div>
          )}
        </div>
        <span style={nt.sep} />
        <div style={{ position: 'relative' }}>
          <button style={nt.btn} title="Colore bordo" onClick={() => setNoteMenu(noteMenu === 'border' ? null : 'border')}>
            <span style={{ ...nt.dot, background: 'transparent', border: `3px solid ${obj.stroke || NOTE_BORDER}` }} /> <ChevronDown size={12} style={{ ...nt.caret, verticalAlign: 'middle' }} />
          </button>
          {noteMenu === 'border' && (
            <div style={nt.pop}>
              <div style={nt.swatches}>{PALETTE.map((c) => swatch(c, obj.stroke, () => { patch({ stroke: c }); setNoteMenu(null); }))}</div>
              {custom(obj.stroke || '#000000', (hex) => patch({ stroke: hex }))}
            </div>
          )}
        </div>
        <span style={nt.sep} />
        <div style={{ position: 'relative' }}>
          <button style={nt.btn} title="Carattere" onClick={() => setNoteMenu(noteMenu === 'font' ? null : 'font')}>
            <span style={{ fontFamily: font.key }}>Aa</span> <ChevronDown size={12} style={{ ...nt.caret, verticalAlign: 'middle' }} />
          </button>
          {noteMenu === 'font' && (
            <div style={{ ...nt.pop, maxHeight: 240, overflowY: 'auto' }}>
              {FONTS.map((f) => <button key={f.key} style={{ ...nt.item, fontFamily: f.key }} onClick={() => { patch({ fontFamily: f.key }); setNoteMenu(null); }}>{f.label}</button>)}
            </div>
          )}
        </div>
        <span style={nt.sep} />
        <div style={{ position: 'relative' }}>
          <button style={nt.btn} title="Dimensione" onClick={() => setNoteMenu(noteMenu === 'size' ? null : 'size')}>
            {size.label} <ChevronDown size={12} style={{ ...nt.caret, verticalAlign: 'middle' }} />
          </button>
          {noteMenu === 'size' && (
            <div style={{ ...nt.pop, maxHeight: 240, overflowY: 'auto', minWidth: 70 }}>
              {SIZES.map((s) => <button key={s.v} style={nt.item} onClick={() => { patch({ fontSize: s.v }); setNoteMenu(null); }}>{s.label}</button>)}
            </div>
          )}
        </div>
        <span style={nt.sep} />
        <div style={{ position: 'relative' }}>
          <button style={nt.btn} title="Colore testo" onClick={() => setNoteMenu(noteMenu === 'tcolor' ? null : 'tcolor')}>
            <span style={{ fontWeight: 700, color: textVal }}>A</span> <ChevronDown size={12} style={{ ...nt.caret, verticalAlign: 'middle' }} />
          </button>
          {noteMenu === 'tcolor' && (
            <div style={nt.pop}>
              <div style={nt.swatches}>{PALETTE.map((c) => swatch(c, textVal, () => { patch(isNote ? { textColor: c } : { fill: c }); setNoteMenu(null); }))}</div>
              {custom(textVal, (hex) => patch(isNote ? { textColor: hex } : { fill: hex }))}
            </div>
          )}
        </div>
        <button style={{ ...nt.btn, ...(obj.bold ? nt.on : {}), fontWeight: 700 }} title="Grassetto" onClick={() => patch({ bold: !obj.bold })}>B</button>
        <button style={{ ...nt.btn, ...(obj.strike ? nt.on : {}), textDecoration: 'line-through' }} title="Barrato" onClick={() => patch({ strike: !obj.strike })}>S</button>
        <button style={{ ...nt.btn, ...(obj.link ? nt.on : {}) }} title="Link" onClick={setLink}><LinkIcon size={15} /></button>
        <button style={{ ...nt.btn, ...(obj.list ? nt.on : {}) }} title="Elenco puntato" onClick={() => patch({ list: !obj.list })}><List size={15} /></button>
      </div>
    );
  }

  // Media (immagine/video/PDF) selezionato da solo: il resize passa dalle maniglie
  // dedicate sull'overlay, quindi si disattiva quello del Transformer (resta la rotazione).
  const soleSel = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) : null;
  const selIsMedia = !!soleSel && ['image', 'video', 'pdf', 'pptx'].includes(soleSel.type);

  // La lavagna è "condivisa" se sono un collaboratore (role != owner) o se, da owner, ho
  // dei collaboratori. Carico l'elenco all'avvio per mostrare l'icona giusta (omino / 2 omini).
  useEffect(() => { api.get(`/boards/${id}/collaborators`).then(setCollabs).catch(() => {}); }, [id]);
  const isShared = role !== 'owner' || collabs.length > 0;

  return (
    <div className="fjboard" style={{ height: '100vh', display: 'flex', fontFamily: FONT, color: '#1e1b2e' }}>
      <style>{`
        .fjboard, .fjboard button, .fjboard input, .fjboard select, .fjboard textarea { font-family: ${FONT}; }
        .fjboard button { transition: transform .08s ease, box-shadow .14s ease, background .14s ease, color .14s ease, opacity .14s ease; }
        .fjboard button:not(:disabled):hover { transform: translateY(-1px); }
        .fjboard button:not(:disabled):active { transform: translateY(0) scale(.97); }
        .fjboard input, .fjboard select, .fjboard textarea { transition: border-color .14s ease, box-shadow .14s ease; }
        .fjboard textarea:focus, .fjboard input:focus, .fjboard select:focus { border-color:#9775fa; box-shadow:0 0 0 3px rgba(112,72,232,.15); }
      `}</style>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <input ref={fileInput} type="file" accept="image/*,video/*,application/pdf,.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint" hidden onChange={onFilePicked} />
        <Stage
          ref={stageRef}
          width={window.innerWidth - (showLayers ? 220 : 0)}
          height={window.innerHeight}
          x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
          draggable={!presenting && tool === 'pan'}
          onDragMove={(e) => { if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() })); }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onContextMenu={onStageContextMenu}
          onMouseLeave={() => { erasing.current = false; setEraserPos(null); marqueeRef.current = null; setMarqueeBox(null); }}
          style={{
            backgroundColor: '#f8f8fb',
            backgroundImage: 'radial-gradient(circle, #e2e2ec 1px, transparent 1px)',
            backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
            cursor: TOOL_CURSORS[tool] || 'crosshair',
          }}
        >
            <Layer>
              {/* Connettori tra oggetti (dietro a tutto): ancorati ai centri, seguono gli oggetti quando si spostano. */}
              {ordered.filter((o) => o.type === 'connector').map((o) => {
                const a = objects.find((x) => x.id === o.from);
                const b = objects.find((x) => x.id === o.to);
                const ba = a && objectBBox(a), bb = b && objectBBox(b);
                if (!ba || !bb) return null;
                const ca = [ba.x + ba.width / 2, ba.y + ba.height / 2];
                const cb = [bb.x + bb.width / 2, bb.y + bb.height / 2];
                // Punto di controllo perpendicolare al centro -> connettore CURVO (stile FigJam).
                const dx = cb[0] - ca[0], dy = cb[1] - ca[1];
                const len = Math.hypot(dx, dy) || 1;
                const off = Math.min(70, len * 0.18);
                const mid = [(ca[0] + cb[0]) / 2 - (dy / len) * off, (ca[1] + cb[1]) / 2 + (dx / len) * off];
                const sel = selectedIds.includes(o.id);
                return <Arrow key={o.id} id={o.id} points={[...ca, ...mid, ...cb]} tension={0.5} stroke="#7950f2" fill="#7950f2"
                  strokeWidth={sel ? 3.5 : 2.5} pointerLength={11} pointerWidth={11} hitStrokeWidth={16}
                  shadowColor="#7950f2" shadowBlur={10} shadowEnabled={sel}
                  onClick={(e) => onSelect(e, o.id)} onTap={(e) => onSelect(e, o.id)} />;
              })}
              {/* Evidenziazione dell'oggetto di partenza mentre si crea un connettore. */}
              {connectFrom && (() => {
                const a = objects.find((x) => x.id === connectFrom);
                const b = a && objectBBox(a);
                if (!b) return null;
                return <Rect x={b.x - 5} y={b.y - 5} width={b.width + 10} height={b.height + 10} stroke="#7950f2"
                  strokeWidth={2 / view.scale} dash={[7 / view.scale, 5 / view.scale]} cornerRadius={8} listening={false} />;
              })()}
              {renderList.map((o) => {
                if (o.type === 'rect') return <Rect key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} width={o.width} height={o.height} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} rotation={o.rotation} cornerRadius={o.cornerRadius || 0} />;
                if (o.type === 'cpoly') return <Line key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} points={o.points} closed fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} rotation={o.rotation} />;
                if (o.type === 'ellipse') return <Ellipse key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} radiusX={o.rx} radiusY={o.ry} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} rotation={o.rotation} />;
                if (o.type === 'text') {
                  const fs = o.fontSize || 24;
                  const lines = String(o.text || '').split('\n');
                  const bw = Math.max(24, Math.max(1, ...lines.map((l) => l.length)) * fs * 0.6) + 20;
                  const bh = Math.max(fs, lines.length * fs * 1.35) + 14;
                  const body = o.list ? bulletize(o.text) : o.text;
                  const deco = [o.strike && 'line-through', o.link && 'underline'].filter(Boolean).join(' ');
                  const hasBox = !!(o.bg || o.stroke);
                  return (
                    <Group key={o.id} ref={setRef(o.id)} {...nodeProps(o)} onDblClick={() => editSticky(o)} onDblTap={() => editSticky(o)} x={o.x} y={o.y} rotation={o.rotation}>
                      {hasBox && <Rect x={-10} y={-7} width={bw} height={bh} fill={o.bg || 'transparent'} stroke={o.stroke || undefined} strokeWidth={o.stroke ? 2 : 0} cornerRadius={6} />}
                      <Text x={0} y={0} text={body} fontSize={fs} fontFamily={o.fontFamily || FONTS[0].key} fill={o.fill || '#212529'}
                        fontStyle={o.bold ? 'bold' : 'normal'} textDecoration={deco} lineHeight={1.35} />
                    </Group>
                  );
                }
                if (o.type === 'sticky') {
                  const hasText = (o.text || '').trim().length > 0;
                  const ink = readable(o.fill);
                  const bodyColor = o.textColor || ink; // colore testo esplicito, altrimenti auto-contrasto
                  const body = hasText ? (o.list ? bulletize(o.text) : o.text) : NOTE_PLACEHOLDER;
                  const deco = [o.strike && 'line-through', o.link && 'underline'].filter(Boolean).join(' ');
                  // Nota come GRUPPO unico (sfondo + testo): così durante il trascinamento
                  // finestra e testo si spostano insieme, non separatamente.
                  return (
                    <Group key={o.id} ref={setRef(o.id)} {...nodeProps(o)} onDblClick={() => editSticky(o)} onDblTap={() => editSticky(o)}
                      x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation}>
                      <Rect x={0} y={0} width={o.width} height={o.height}
                        fill={o.fill} stroke={o.stroke || NOTE_BORDER} strokeWidth={2} cornerRadius={6}
                        shadowColor="rgba(0,0,0,0.14)" shadowBlur={10} shadowOffsetY={4} />
                      <Text x={0} y={0} width={o.width} height={o.height}
                        text={body} padding={18} fontSize={o.fontSize || 18} fontFamily={o.fontFamily || FONTS[0].key}
                        fontStyle={o.bold ? 'bold' : 'normal'} textDecoration={deco} lineHeight={1.35}
                        fill={hasText ? bodyColor : 'rgba(60,60,70,0.4)'} align="left" verticalAlign="top" listening={false} />
                      {o.author && <Text x={0} y={0} width={o.width} height={o.height}
                        text={o.author} padding={14} fontSize={12} fill={ink} opacity={0.6} align="left" verticalAlign="bottom" listening={false} />}
                      {o.link && <Text x={0} y={0} width={o.width} height={o.height}
                        text="🔗" padding={12} fontSize={14} align="right" verticalAlign="top"
                        onClick={() => window.open(o.link, '_blank', 'noopener')} onTap={() => window.open(o.link, '_blank', 'noopener')} />}
                    </Group>
                  );
                }
                // Poligoni regolari (triangolo/rombo/pentagono/esagono) e stella.
                if (o.type === 'poly') return <RegularPolygon key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} sides={o.sides} radius={o.radius} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} rotation={o.rotation} />;
                if (o.type === 'star') return <Star key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} numPoints={5} innerRadius={o.innerRadius} outerRadius={o.radius} fill={o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity} rotation={o.rotation} />;
                if (o.type === 'arrow') return <Arrow key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} points={o.points} stroke={o.stroke} fill={o.stroke} strokeWidth={o.strokeWidth} pointerLength={12} pointerWidth={12} rotation={o.rotation} hitStrokeWidth={Math.max(o.strokeWidth || 4, 12)} />;
                if (o.type === 'straight') return <Line key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} lineCap="round" rotation={o.rotation} hitStrokeWidth={Math.max(o.strokeWidth || 4, 12)} />;
                // Tratti a mano libera: selezionabili/cancellabili (clic con generoso
                // hitStrokeWidth + evidenziazione se selezionati). La gomma parziale resta
                // gestita a livello di Stage (eraseAtPoint), non con un delete dell'intera linea.
                if (o.type === 'line') return <Line key={o.id} ref={setRef(o.id)} id={o.id} points={o.points} stroke={o.stroke} strokeWidth={o.strokeWidth} opacity={o.opacity ?? 1} lineCap="round" lineJoin="round" tension={0.3}
                  hitStrokeWidth={Math.max(o.strokeWidth || 3, 16)}
                  shadowColor="#4c6ef5" shadowEnabled={selectedIds.includes(o.id)} shadowBlur={10}
                  draggable={draggable}
                  onClick={(e) => onSelect(e, o.id)} onTap={(e) => onSelect(e, o.id)}
                  onDragStart={newStep}
                  onDragEnd={(e) => {
                    // Baking dello spostamento nei punti (restano assoluti, x/y del nodo = 0):
                    // così gomma parziale (eraseAtPoint) e bounding box leggono ancora i punti corretti.
                    const dx = e.target.x(), dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    updateObject({ ...o, points: o.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) });
                  }} />;
                if (o.type === 'image') return <CanvasImage key={o.id} obj={o} shapeRef={setRef(o.id)} {...nodeProps(o)} />;
                // Video: cornice Konva (selezione/spostamento/resize) + overlay HTML col player.
                if (o.type === 'video') return <Rect key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation} stroke="#4c6ef5" dash={[4, 4]} fill="rgba(76,110,245,0.06)" />;
                // PDF: cornice ridimensionabile; il contenuto sfogliabile/scorrevole è nell'overlay HTML.
                if (o.type === 'pdf') return <Rect key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation} stroke="#e8590c" strokeWidth={1.5} dash={[6, 4]} fill="rgba(232,89,12,0.05)" cornerRadius={4} />;
                // PPTX (PowerPoint): cornice + card nell'overlay HTML con il tasto "Lancia presentazione".
                if (o.type === 'pptx') return <Rect key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation} stroke="#e8590c" strokeWidth={1.5} fill="rgba(232,89,12,0.05)" cornerRadius={10} />;
                // Frame (scena della presentazione): rettangolo etichettato, nascosto in export.
                if (o.type === 'frame') {
                  if (exporting) return null;
                  const fi = frames.findIndex((f) => f.id === o.id) + 1;
                  return [
                    <Rect key={o.id} ref={setRef(o.id)} {...nodeProps(o)} x={o.x} y={o.y} width={o.width} height={o.height} rotation={o.rotation}
                      stroke="#7048e8" strokeWidth={2 / view.scale} dash={[8 / view.scale, 6 / view.scale]} fill="rgba(112,72,232,0.03)" />,
                    <Text key={o.id + '_lbl'} x={o.x} y={o.y - 22 / view.scale} text={`${fi}. ${o.name || 'Scena'}`}
                      fontSize={14 / view.scale} fontStyle="bold" fill="#7048e8" listening={false} />,
                  ];
                }
                return null;
              })}
              {draft && <Line points={draft.points} stroke={draft.stroke} strokeWidth={draft.strokeWidth} opacity={draft.opacity ?? 1} lineCap="round" lineJoin="round" tension={0.3} />}
              {marqueeBox && (marqueeBox.w > 0 || marqueeBox.h > 0) && <Rect x={marqueeBox.x} y={marqueeBox.y} width={marqueeBox.w} height={marqueeBox.h} fill="rgba(76,110,245,0.10)" stroke="#4c6ef5" strokeWidth={1 / view.scale} dash={[5 / view.scale, 4 / view.scale]} listening={false} />}
              {tool === 'eraser' && eraserPos && <Circle x={eraserPos.x} y={eraserPos.y} radius={eraserWidth / view.scale}
                stroke="#e03131" strokeWidth={1 / view.scale} dash={[4 / view.scale, 4 / view.scale]} fill="rgba(224,49,49,0.08)" listening={false} />}
              {guides.map((g, i) => (g.v
                ? <Line key={i} points={[g.at, -100000, g.at, 100000]} stroke="#e8590c" strokeWidth={1 / view.scale} />
                : <Line key={i} points={[-100000, g.at, 100000, g.at]} stroke="#e8590c" strokeWidth={1 / view.scale} />))}
              {/* ⑨ In export i video/PDF (overlay HTML non catturati) sono sostituiti dal loro
                  link RELATIVO (o.src così com'è: es. /uploads/xxx.mp4); gli URL esterni
                  (YouTube) sono già assoluti e restano invariati. */}
              {exporting && ordered.filter((o) => o.type === 'video' || o.type === 'pdf' || o.type === 'pptx').map((o) => (
                <Text key={o.id + '_exp'} x={o.x + 6} y={o.y + 6} width={Math.max(20, o.width - 12)}
                  text={`${o.type === 'pdf' ? 'PDF: ' : o.type === 'pptx' ? 'Presentazione: ' : '▶ Video: '}${o.src || ''}`}
                  fontSize={13} fill="#333" listening={false} />
              ))}
              {canEdit && tool === 'select' && !exporting && <Transformer ref={trRef} rotateEnabled resizeEnabled={!selIsMedia} boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5 ? o : n)} />}
            </Layer>
          </Stage>

          {/* Overlay: video player + cursori remoti, seguono pan/zoom via toScreen(). */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {renderList.filter((o) => o.type === 'video' || o.type === 'pdf' || o.type === 'image' || o.type === 'pptx').map((o) => {
              const p = toScreen(o.x, o.y);
              const selected = selectedIds.includes(o.id);
              // Contenuto interattivo se la finestra è selezionata OPPURE se il mouse ci è sopra (hover).
              const active = selected || hoveredMedia === o.id;
              const wrap = {
                position: 'absolute', left: p.x, top: p.y,
                width: o.width * view.scale, height: o.height * view.scale,
                transform: `rotate(${o.rotation || 0}deg)`, transformOrigin: 'top left',
                pointerEvents: 'none',
              };
              // Clic sul media => se ne prende il CONTROLLO: da non-selezionato l'overlay non cattura,
              // quindi il clic passa al Rect Konva (onSelect) e lo seleziona. Una volta SELEZIONATO
              // l'overlay diventa interattivo (controlli video, scroll PDF/pptx). Spostamento dalla
              // barra-maniglia "✥"; resize dalle maniglie dedicate (sopra l'overlay).
              const media = { position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#fff', border: 'none', pointerEvents: active ? 'auto' : 'none' };
              // L'immagine è disegnata sul canvas (KImage): qui l'overlay serve solo per le
              // maniglie di resize, quindi non ha un elemento HTML che intercetti i clic.
              const inner = o.type === 'image' ? null
                : o.type === 'pptx'
                  ? <>
                      {o.pdf
                        ? <iframe src={o.pdf} style={media} title={o.name || 'Presentazione'} />
                        : <div style={{ ...media, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(160deg,#ffffff,#fff4ea)', textAlign: 'center', padding: 12, borderRadius: 10 }}>
                            <Presentation size={44} color="#e8590c" />
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', maxWidth: '92%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name || 'Presentazione'}</div>
                            <div style={{ fontSize: 11, color: '#999' }}>Anteprima non disponibile</div>
                          </div>}
                      {canEdit && !presenting && (
                        <button onClick={(e) => { e.stopPropagation(); openInPowerPoint(o); }} title="Apri in PowerPoint"
                          style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 3, pointerEvents: 'auto', border: 'none', borderRadius: 8, background: '#e8590c', color: '#fff', fontWeight: 700, fontSize: 12, padding: '7px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 3px 10px rgba(0,0,0,.3)' }}>
                          <Play size={14} /> Apri in PowerPoint
                        </button>
                      )}
                    </>
                : o.type === 'pdf'
                  ? <iframe src={o.src} style={media} title={o.name || 'PDF'} />
                  : o.embed
                    ? <iframe src={withAutoplay(o.src)} style={media} allow="autoplay; encrypted-media" frameBorder="0" />
                    : <video src={o.src} style={media} controls autoPlay muted playsInline />;
              return (
                <div key={o.id} style={wrap}>
                  {/* Sensore trasparente: al passaggio del mouse attiva l'hover, così il contenuto
                      (controlli video, scroll PDF/pptx) diventa interattivo senza selezionare prima.
                      Solo quando NON è già attivo; escluso image (nessun contenuto HTML) e in presentazione.
                      Prima di `inner` nel DOM: i figli interattivi (es. bottone pptx) restano sopra. */}
                  {!active && !presenting && o.type !== 'image' && (
                    <div onMouseEnter={() => setHoveredMedia(o.id)}
                      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }} />
                  )}
                  {inner}
                  {/* Etichetta cliccabile per selezionare video/PDF (che altrimenti catturano
                      i clic col loro player). L'immagine si seleziona direttamente sul canvas. */}
                  {canEdit && !presenting && o.type !== 'image' && (
                    <div title="Trascina per spostare"
                      onPointerDown={(e) => startMediaMove(e, o)}
                      style={{ position: 'absolute', top: -20, left: 0, right: 0, height: 18, padding: '0 8px', display: 'flex', alignItems: 'center', gap: 4, background: selected ? '#4c6ef5' : 'rgba(31,36,48,.85)', color: '#fff', fontSize: 11, borderTopLeftRadius: 6, borderTopRightRadius: 6, cursor: 'grab', pointerEvents: 'auto', whiteSpace: 'nowrap', touchAction: 'none' }}>
                      ✥ {o.type === 'pdf' ? 'PDF' : o.type === 'pptx' ? 'Presentazione' : 'Video'} — trascina per spostare
                    </div>
                  )}
                  {/* Maniglie di ridimensionamento della finestra del media: destra =
                      larghezza, sotto = altezza, angolo = entrambe. Visibili se selezionato. */}
                  {canEdit && !presenting && selected && (
                    <>
                      <div title="Larghezza (trascina in orizzontale)" style={{ ...rz.base, ...rz.e }} onPointerDown={(e) => startMediaResize(e, o, 'e')} />
                      <div title="Altezza (trascina in verticale)" style={{ ...rz.base, ...rz.s }} onPointerDown={(e) => startMediaResize(e, o, 's')} />
                      <div title="Larghezza e altezza" style={{ ...rz.base, ...rz.se }} onPointerDown={(e) => startMediaResize(e, o, 'se')} />
                    </>
                  )}
                </div>
              );
            })}
            {cursors.filter((c) => c.cursor).map((c) => {
              const p = toScreen(c.cursor.x, c.cursor.y);
              return (
                <div key={c.cid} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-2px,-2px)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 10, background: c.color || '#333' }} />
                  <span style={{ fontSize: 11, background: c.color || '#333', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>{c.name}</span>
                </div>
              );
            })}

            {/* Editing INLINE: textarea sovrapposta alla nota, segue pan/zoom. */}
            {inlineEdit && canEdit && (() => {
              const o = objects.find((x) => x.id === inlineEdit);
              if (!o) return null;
              const p = toScreen(o.x, o.y);
              const isNote = o.type === 'sticky';
              const ink = isNote ? (o.textColor || readable(o.fill)) : (o.fill || '#212529');
              const w = (isNote ? o.width : 320) * view.scale;
              const h = (isNote ? o.height : 130) * view.scale;
              // Note: riquadro pieno come la nota. Testo libero: riquadro leggero tratteggiato.
              const skin = isNote
                ? { padding: 18 * view.scale, border: `2px solid ${o.stroke || NOTE_BORDER}`, borderRadius: 6, background: o.fill, fontFamily: o.fontFamily || FONTS[0].key, fontWeight: o.bold ? 700 : 400 }
                : { padding: 6 * view.scale, border: '1px dashed #7048e8', borderRadius: 6, background: 'rgba(255,255,255,.92)', fontFamily: o.fontFamily || 'system-ui, sans-serif', fontWeight: 400 };
              return (
                <div key={o.id} style={{
                  position: 'absolute', left: p.x, top: p.y, width: w, zIndex: 20,
                  transform: `rotate(${o.rotation || 0}deg)`, transformOrigin: 'top left',
                }}>
                  {/* Maniglia per spostare la nota/testo LUNGO IL CANVAS anche mentre la si scrive
                      (la textarea intercetta i clic sul corpo, quindi lo spostamento passa da qui). */}
                  <div title="Trascina per spostare" onPointerDown={(e) => startMediaMove(e, o)}
                    style={{ position: 'absolute', bottom: -20, left: 0, right: 0, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 8px', background: '#4c6ef5', color: '#fff', fontSize: 11, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, cursor: 'grab', pointerEvents: 'auto', touchAction: 'none', whiteSpace: 'nowrap' }}>
                    <Move size={12} style={{ verticalAlign: '-2px' }} /> trascina per spostare
                  </div>
                  <textarea autoFocus value={inlineText}
                    onChange={(e) => commitInline(e.target.value)}
                    onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                    onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeInline(); } }}
                    placeholder={isNote ? '' : 'Scrivi il testo…'}
                    style={{
                      display: 'block', width: '100%', height: h,
                      boxSizing: 'border-box', color: ink, resize: 'none', outline: 'none', overflow: 'auto',
                      fontSize: (o.fontSize || 18) * view.scale, lineHeight: 1.35, pointerEvents: 'auto',
                      ...skin,
                    }} />
                </div>
              );
            })()}

            {/* Barra di formattazione (identica) per NOTA e TESTO selezionati singolarmente. */}
            {selNote && canEdit && formatBar(selNote, patchNote, true)}
            {selText && canEdit && formatBar(selText, patchText, false)}
          </div>

          {/* Card in alto a sinistra: menù principale + nome + Free (stile FigJam). */}
          <div style={t.tlCard}>
            <Dropdown label={<span style={t.logo}><Menu size={18} style={{ verticalAlign: '-4px' }} /></span>} align="left" open={openMenu === 'main'} onToggle={() => toggleMenu('main')}>
              {canEdit && <MenuItem onClick={() => { setOpenMenu(null); save(); }}><MIcon icon={Save} />Salva</MenuItem>}
              <MenuItem onClick={() => { setOpenMenu(null); exportPNG(); }}><MIcon icon={Download} />Esporta PNG</MenuItem>
              {canEdit && <MenuItem disabled={!canUndo} onClick={() => { setOpenMenu(null); undoMgr.current?.undo(); }}><MIcon icon={Undo2} />Annulla</MenuItem>}
              {canEdit && <MenuItem disabled={!canRedo} onClick={() => { setOpenMenu(null); undoMgr.current?.redo(); }}><MIcon icon={Redo2} />Ripristina</MenuItem>}
              <MenuItem onClick={() => { setOpenMenu(null); setShowLayers((s) => !s); }}><MIcon icon={showLayers ? Check : Layers} />Livelli</MenuItem>
              {canEdit && <div style={{ height: 1, background: '#ececf0', margin: '4px 2px' }} />}
              {canEdit && <MenuItem onClick={clearAll}><span style={{ display: 'inline-flex', alignItems: 'center', color: '#e03131' }}><MIcon icon={Trash2} />Svuota lavagna</span></MenuItem>}
              <div style={{ height: 1, background: '#ececf0', margin: '4px 2px' }} />
              <MenuItem onClick={() => nav('/')}><MIcon icon={ArrowLeft} />Le mie lavagne</MenuItem>
            </Dropdown>
            <strong style={{ fontSize: 14 }}>{name}</strong>
          </div>

          {/* Cluster in alto a destra: intestazione "Canvas Board AKT" sopra la barra
              (presenza, colore, livelli, scene, timer, Share). */}
          <div style={t.trStack}>
            <div style={{ ...t.brand, display: 'flex', alignItems: 'center', gap: 6 }}>
              Canvas Board
              <a href="https://www.aktsrl.com/" target="_blank" rel="noopener noreferrer" title="aktsrl.com" style={{ display: 'inline-flex' }}>
                <img src="/logo.png" alt="AKT" style={{ height: 20, display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              </a>
            </div>
            <div style={t.trRow}>
            {/* Email dell'utente connesso, a sinistra della barra e in linea con essa. */}
            <span style={t.userEmail}>{user?.email}</span>
            <div style={t.trBar}>
            {/* ④ Icona condivisione: un omino se la lavagna NON è condivisa, due omini se lo è.
                Apre l'elenco dei collaboratori. */}
            <button style={{ ...t.iconBtn, ...(showCollabs ? t.iconOn : {}) }}
              title={isShared ? 'Condivisa con altri' : 'Non condivisa'} onClick={toggleCollabs}>
              {isShared ? <Users size={16} /> : <User size={16} />}
            </button>
            {canEdit && (
              <Dropdown label="" swatch={color} open={openMenu === 'color'} onToggle={() => toggleMenu('color')}>
                <div style={t.swatches}>
                  {PALETTE.map((c) => (
                    <button key={c} title={c} onClick={() => { setColor(c); setOpenMenu(null); }}
                      style={{ ...t.swatch, background: c, outline: c === color ? '2px solid #222' : 'none' }} />
                  ))}
                </div>
                <label style={t.custom}>Personalizzato
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                </label>
              </Dropdown>
            )}
            <button style={t.iconBtn} title="Livelli" onClick={() => setShowLayers((s) => !s)}><Layers size={16} /></button>
            <button style={{ ...t.iconBtn, ...(showScenes ? t.iconOn : {}) }} title="Scene / presentazione" onClick={() => { setShowCollabs(false); setShowScenes((s) => !s); }}><Clapperboard size={16} /></button>
            <button style={t.timer} title="Timer" onClick={() => setTimerOn((o) => !o)}>{timerOn ? <Pause size={15} style={{ verticalAlign: '-2px' }} /> : <Timer size={15} style={{ verticalAlign: '-2px' }} />} {mmss}</button>
            <button style={t.barBtn} onClick={newBoard}>Nuova lavagna</button>
            <button style={{ ...t.barBtn, color: '#e03131' }} onClick={logout}>Esci</button>
            </div>
            </div>
          </div>

          {/* Popover "a richiesta" delle opzioni dello strumento: spessore (penna/marker/gomma)
              o colore nota. Si apre ri-cliccando lo strumento attivo e si chiude alla selezione. */}
          {canEdit && !presenting && toolPop && (() => {
            // Il popover opzioni segue la barra: sopra di essa (barra orizzontale) o di lato
            // (barra verticale), con flip quando la barra è vicina a un bordo dello schermo.
            const rect = barRef.current?.getBoundingClientRect();
            const vertBar = toolbar.orient === 'v';
            let anchor = null;
            if (rect) {
              if (vertBar) {
                anchor = rect.right + 260 < window.innerWidth
                  ? { left: rect.right + 10, top: rect.top, transform: 'none' }
                  : { left: rect.left - 10, top: rect.top, transform: 'translateX(-100%)' };
              } else {
                anchor = rect.top > 120
                  ? { left: rect.left + rect.width / 2, top: rect.top - 12, transform: 'translate(-50%,-100%)' }
                  : { left: rect.left + rect.width / 2, top: rect.bottom + 12, transform: 'translate(-50%,0)' };
              }
            }
            const toolPopStyle = anchor ? { ...t.toolPop, bottom: 'auto', ...anchor } : t.toolPop;
            if (toolPop === 'note') {
              return (
                <div style={toolPopStyle}>
                  <span style={{ fontSize: 12, color: '#666', marginRight: 2 }}>Colore nota</span>
                  {NOTE_COLORS.map((c, i) => (
                    <button key={c.fill} title="Colore nota" onClick={() => { setNoteColor(i); setToolPop(null); }}
                      style={{ width: 26, height: 26, borderRadius: '50%', background: c.fill, cursor: 'pointer',
                        border: i === noteColor ? '2px solid #7048e8' : `1px solid ${c.border}` }} />
                  ))}
                </div>
              );
            }
            const cfg = toolPop === 'pen' ? { val: penWidth, set: setPenWidth, label: 'Spessore penna' }
              : toolPop === 'highlighter' ? { val: markerWidth, set: setMarkerWidth, label: 'Spessore marker' }
              : { val: eraserWidth, set: setEraserWidth, label: 'Dimensione gomma' };
            const round = toolPop === 'eraser';
            return (
              <div style={toolPopStyle}>
                <span style={{ fontSize: 12, color: '#666', marginRight: 2 }}>{cfg.label}</span>
                {STROKE_PRESETS[toolPop].map((w) => {
                  const d = Math.min(26, Math.max(4, w));
                  const on = cfg.val === w;
                  return (
                    <button key={w} title={`${w}px`} onClick={() => { cfg.set(w); setToolPop(null); }}
                      style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8,
                        cursor: 'pointer', background: on ? '#efe9ff' : 'transparent', border: on ? '1px solid #7048e8' : '1px solid transparent' }}>
                      <span style={{ width: d, height: d, borderRadius: '50%',
                        background: round ? 'transparent' : color, border: round ? '2px solid #e03131' : 'none' }} />
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Toolbar flottante in basso al centro, modello FigJam (icone colorate). */}
          {canEdit && !presenting && (() => {
            const barMenuOpen = openMenu === 'shapes' || openMenu === 'media' || openMenu === 'emoji';
            const A = (tl) => tool === tl && !barMenuOpen; // evidenziato solo se nessun menu barra è aperto
            const vert = toolbar.orient === 'v';
            // Posizione: default (basso-centro) se pos===null, altrimenti ancorata a pos in px-schermo.
            const posStyle = toolbar.pos ? { left: toolbar.pos.x, top: toolbar.pos.y, right: 'auto', bottom: 'auto', transform: 'none' } : {};
            const barStyle = { ...t.figbar, ...posStyle, flexDirection: vert ? 'column' : 'row', ...(draggingBar ? { zIndex: 46 } : {}) };
            // Separatore: verticale in riga (default t.sep), orizzontale in colonna.
            const sep = vert ? { width: 34, height: 1, background: '#e5e7eb', margin: '4px 0' } : t.sep;
            return (
            <div ref={barRef} style={barStyle}>
              <div title="Trascina per spostare la barra (doppio-clic: riporta al centro-basso)" onPointerDown={startToolbarMove}
                onDoubleClick={() => setToolbar((tb) => ({ ...tb, pos: null }))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: vert ? '100%' : 20, height: vert ? 20 : 40, cursor: 'grab', color: '#adb5bd', touchAction: 'none' }}>
                {vert ? <GripHorizontal size={18} /> : <GripVertical size={18} />}
              </div>
              <button title={vert ? 'Rendi orizzontale' : 'Rendi verticale'} onClick={() => setToolbar((tb) => ({ ...tb, orient: tb.orient === 'h' ? 'v' : 'h' }))}
                style={{ ...m.tool, minWidth: 32, width: vert ? '100%' : 32, height: 32, color: '#7048e8' }}>
                {vert ? <MoveHorizontal size={18} /> : <MoveVertical size={18} />}
              </button>
              <div style={sep} />
              <ToolButton label="Seleziona" tint="#4c6ef5" active={A('select')} onClick={() => pickTool('select')} title="Seleziona">{Ic.cursor}</ToolButton>
              <ToolButton label="Mano" tint="#7048e8" active={A('pan')} onClick={() => pickTool('pan')} title="Mano (sposta la vista)">{Ic.hand}</ToolButton>
              <div style={sep} />
              <ToolButton label="Penna" tint="#e64980" active={A('pen')} caret={A('pen')} onClick={() => clickTool('pen', 'pen')} title="Penna (ri-clic per lo spessore)">{Ic.pen}</ToolButton>
              <ToolButton label="Marker" tint="#f59f00" active={A('highlighter')} caret={A('highlighter')} onClick={() => clickTool('highlighter', 'highlighter')} title="Evidenziatore (ri-clic per lo spessore)">{Ic.marker}</ToolButton>
              <ToolButton label="Gomma" tint="#20c997" active={A('eraser')} caret={A('eraser')} onClick={() => clickTool('eraser', 'eraser')} title="Gomma (ri-clic per la dimensione)">{Ic.eraser}</ToolButton>
              <div style={sep} />
              <Popover open={openMenu === 'shapes'} onToggle={() => openBarMenu('shapes')} title="Forme" label="Forme" tint="#40c057"
                orient={toolbar.orient} active={SHAPE_TOOLS.includes(tool)} trigger={Ic.square}>
                {SHAPE_CATS.map((g) => (
                  <div key={g.cat}>
                    <div style={t.catLabel}>{g.cat}</div>
                    {g.items.map((it) => (
                      <MenuItem key={it.tool} onClick={() => pickTool(it.tool)}><MIcon icon={it.icon} />{it.label}</MenuItem>
                    ))}
                  </div>
                ))}
              </Popover>
              <ToolButton label="Connetti" tint="#7950f2" active={A('connector')} onClick={() => pickTool('connector')} title="Connettore tra oggetti: clic sull'oggetto di partenza, poi su quello di arrivo"><Spline size={21} /></ToolButton>
              <div style={sep} />
              <ToolButton label="Testo" tint="#495057" active={A('text')} onClick={() => pickTool('text')} title="Testo">{Ic.text}</ToolButton>
              <ToolButton label="Nota" tint="#f2a900" active={A('sticky')} caret={A('sticky')} onClick={() => clickTool('sticky', 'note')} title="Nota adesiva (ri-clic per il colore)">{Ic.sticky}</ToolButton>
              <Popover open={openMenu === 'emoji'} onToggle={() => openBarMenu('emoji')} title="Reazioni / emoji" label="Emoji" tint="#f783ac"
                orient={toolbar.orient} active={tool === 'stamp'} trigger={<Smile size={21} />}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {EMOJIS.map((em) => (
                    <button key={em} title={`Timbra ${em}`} onClick={() => { setStampEmoji(em); setTool('stamp'); setOpenMenu(null); setToolPop(null); setConnectFrom(null); }}
                      style={{ fontSize: 22, lineHeight: 1, padding: 6, border: em === stampEmoji && tool === 'stamp' ? '2px solid #7048e8' : '1px solid transparent', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>{em}</button>
                  ))}
                </div>
              </Popover>
              <Popover open={openMenu === 'media'} onToggle={() => openBarMenu('media')} title="Aggiungi media" label="Media" tint="#22b8cf" orient={toolbar.orient} trigger={Ic.plus}>
                <MenuItem onClick={addImageFromUrl}><MIcon icon={ImageIcon} />Immagine da URL</MenuItem>
                <MenuItem onClick={addVideoFromUrl}><MIcon icon={Video} />Video da URL</MenuItem>
                <MenuItem onClick={() => { setOpenMenu(null); fileInput.current?.click(); }}><MIcon icon={Upload} />Carica file…</MenuItem>
              </Popover>
            </div>
            );
          })()}

          {/* Zoom + aiuto in basso a destra. */}
          <div style={t.zoomCard}>
            <button style={t.iconBtn} title="Riduci" onClick={() => zoomBy(1 / 1.2)}><Minus size={16} /></button>
            <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(view.scale * 100)}%</span>
            <button style={t.iconBtn} title="Ingrandisci" onClick={() => zoomBy(1.2)}><Plus size={16} /></button>
          </div>
          <button style={t.helpBtn} title="Aiuto" onClick={help}><HelpCircle size={18} /></button>

          {/* ④⑤ Pannello collaboratori: elenco degli utenti con cui è condivisa,
              cambio ruolo e revoca (solo owner). */}
          {showCollabs && (
            <div style={t.sidePanel}>
              <div style={t.panelHead}>
                <strong>Condivisa con</strong>
                <button style={t.x} onClick={() => setShowCollabs(false)}><X size={16} /></button>
              </div>
              {isOwner && <button style={t.panelBtn} onClick={share}><Plus size={15} style={{ verticalAlign: '-3px' }} /> Invita via email</button>}
              {collabs.length === 0 && <div style={{ ...t.muted, padding: '6px 2px' }}>Non ancora condivisa con nessuno.</div>}
              {collabs.map((c) => (
                <div key={c.id} style={t.panelRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.display_name}</div>
                    <div style={{ ...t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</div>
                  </div>
                  {isOwner ? (
                    <>
                      <select value={c.role} onChange={(e) => changeRole(c.email, e.target.value)} style={t.roleSel}>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button style={t.revokeBtn} title="Revoca condivisione" onClick={() => revoke(c.id)}>Revoca</button>
                    </>
                  ) : <span style={t.roleTag}>{c.role}</span>}
                </div>
              ))}
            </div>
          )}

          {/* ⑩ Pannello scene: crea/ordina scene e avvia la presentazione. */}
          {showScenes && (
            <div style={{ ...t.sidePanel, top: 84 }}>
              <div style={t.panelHead}>
                <strong>Scene</strong>
                <button style={t.x} onClick={() => setShowScenes(false)}><X size={16} /></button>
              </div>
              {canEdit && <button style={t.panelBtn} onClick={addSceneFromSelection}><Plus size={15} style={{ verticalAlign: '-3px' }} /> Scena da selezione</button>}
              {frames.length === 0 && <div style={{ ...t.muted, padding: '6px 2px' }}>Seleziona parti della lavagna, poi crea una scena.</div>}
              {frames.map((f, i) => (
                <div key={f.id} style={t.panelRow}>
                  <span style={{ width: 16, color: '#7048e8', fontWeight: 700 }}>{i + 1}</span>
                  <span style={{ flex: 1, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => jumpToFrame(f)}>{f.name || 'Scena'}</span>
                  {canEdit && <button style={t.mini} title="Su" onClick={() => reorderScene(f, -1)}><ArrowUp size={14} /></button>}
                  {canEdit && <button style={t.mini} title="Giù" onClick={() => reorderScene(f, +1)}><ArrowDown size={14} /></button>}
                  {canEdit && <button style={t.mini} title="Rinomina" onClick={() => renameScene(f)}><Pencil size={14} /></button>}
                  {canEdit && <button style={t.mini} title="Elimina" onClick={() => deleteScene(f)}><X size={14} /></button>}
                </div>
              ))}
              {frames.length > 0 && <button style={t.presentBtn} onClick={startPresent}><Play size={15} style={{ verticalAlign: '-3px' }} /> Presenta</button>}
            </div>
          )}

          {/* ⑩ Barra della modalità presentazione. */}
          {presenting && (
            <div style={t.presentBar}>
              <button style={t.presentNav} disabled={presentIdx === 0} onClick={() => setPresentIdx((i) => Math.max(0, i - 1))}><ChevronLeft size={18} /></button>
              <span style={{ fontSize: 13, minWidth: 130, textAlign: 'center' }}>{frames[presentIdx]?.name || 'Scena'} · {presentIdx + 1}/{frames.length}</span>
              <button style={t.presentNav} disabled={presentIdx >= frames.length - 1} onClick={() => setPresentIdx((i) => Math.min(frames.length - 1, i + 1))}><ChevronRight size={18} /></button>
              <button style={t.presentExit} onClick={exitPresent}><ArrowLeft size={15} style={{ verticalAlign: '-3px' }} /> Torna alla lavagna</button>
            </div>
          )}

          {/* Menu contestuale (tasto destro) su oggetto o canvas vuoto. */}
          {ctxMenu && (() => {
            const obj = ctxMenu.objId ? objects.find((o) => o.id === ctxMenu.objId) : null;
            const close = () => setCtxMenu(null);
            const item = (label, onClick, disabled) => (
              <button style={{ ...cx.item, ...(disabled ? cx.itemOff : {}) }} disabled={disabled}
                onClick={() => { if (!disabled) { onClick(); close(); } }}>{label}</button>
            );
            return (
              <>
                <div style={cx.backdrop} onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
                <div style={{ ...cx.menu, left: Math.min(ctxMenu.x, window.innerWidth - 210), top: ctxMenu.y }}>
                  {obj ? (
                    <>
                      {item(<><MIcon icon={CopyPlus} />Duplica</>, duplicate)}
                      {item(<><MIcon icon={Copy} />Copia</>, copySelected)}
                      {item(<><MIcon icon={ArrowUp} />Porta avanti</>, () => reorder(obj, +1))}
                      {item(<><MIcon icon={ArrowDown} />Porta indietro</>, () => reorder(obj, -1))}
                      {obj.type !== 'frame' && item(<><MIcon icon={Clapperboard} />Crea scena</>, addSceneFromSelection)}
                      <div style={cx.sep} />
                      {item(<><MIcon icon={Trash2} />Elimina</>, deleteSelected)}
                    </>
                  ) : (
                    <>
                      {item(<><MIcon icon={ClipboardPaste} />Incolla</>, paste, !clipboard.current.length)}
                      {item(<><MIcon icon={StickyNote} />Nuova nota qui</>, () => {
                        const pos = { x: (ctxMenu.x - view.x) / view.scale, y: (ctxMenu.y - view.y) / view.scale };
                        const note = { id: uid(), type: 'sticky', x: pos.x, y: pos.y, width: 200, height: 200, text: '', fill: NOTE_COLORS[noteColor].fill, stroke: NOTE_COLORS[noteColor].border, fontFamily: FONTS[0].key, fontSize: 18, textColor: readable(NOTE_COLORS[noteColor].fill), author: user?.displayName || user?.email || '', rotation: 0 };
                        addObject(note); openInline(note);
                      })}
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {showLayers && (
          <aside style={t.layers}>
            <div style={{ ...t.panelHead, marginBottom: 8 }}>
              <strong>Livelli</strong>
              <button style={t.x} title="Nascondi livelli" onClick={() => setShowLayers(false)}><X size={16} /></button>
            </div>
            {[...ordered].reverse().map((o) => (
              <div key={o.id} style={{ ...t.layerRow, background: selectedIds.includes(o.id) ? '#e7ecff' : 'transparent' }}>
                <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSelectedIds([o.id])}>{o.type}</span>
                {canEdit && <button style={t.mini} onClick={() => reorder(o, +1)}><ArrowUp size={14} /></button>}
                {canEdit && <button style={t.mini} onClick={() => reorder(o, -1)}><ArrowDown size={14} /></button>}
                {canEdit && <button style={t.mini} onClick={() => { newStep(); delObjs([o.id]); }}><X size={14} /></button>}
              </div>
            ))}
            {ordered.length === 0 && <span style={t.muted}>Nessun oggetto</span>}
          </aside>
        )}
      </div>
  );
}

// Barra di formattazione nota (scura, modello nota.png).
const nt = {
  bar: { position: 'absolute', transform: 'translate(-50%,-100%)', display: 'flex', alignItems: 'center', gap: 2, background: '#1f2430', border: '1px solid #2b3040', borderRadius: 12, padding: '5px 6px', boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 35, pointerEvents: 'auto', color: '#fff', fontFamily: FONT, whiteSpace: 'nowrap' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 30, padding: '4px 8px', border: 'none', borderRadius: 8, background: 'transparent', color: '#e8e8ee', cursor: 'pointer', fontSize: 14 },
  on: { background: '#7048e8', color: '#fff' },
  caret: { fontSize: 9, opacity: 0.7 },
  dot: { width: 16, height: 16, borderRadius: '50%', border: '1px solid rgba(255,255,255,.4)', display: 'inline-block' },
  sep: { width: 1, height: 20, background: '#333a4a', margin: '0 3px' },
  pop: { position: 'absolute', top: '112%', left: 0, marginTop: 4, background: '#1f2430', border: '1px solid #2b3040', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.35)', padding: 6, zIndex: 36, minWidth: 130 },
  item: { display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 6, background: 'transparent', color: '#e8e8ee', cursor: 'pointer', fontSize: 13 },
  swatches: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 },
  sw: { width: 22, height: 22, borderRadius: '50%', border: '1px solid rgba(255,255,255,.25)', cursor: 'pointer' },
};

// Maniglie di ridimensionamento della finestra dei media (overlay HTML).
const rz = {
  base: { position: 'absolute', background: '#4c6ef5', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,.35)', pointerEvents: 'auto', zIndex: 6 },
  e: { top: '50%', right: -7, width: 12, height: 30, marginTop: -15, borderRadius: 4, cursor: 'ew-resize' },
  s: { left: '50%', bottom: -7, width: 30, height: 12, marginLeft: -15, borderRadius: 4, cursor: 'ns-resize' },
  se: { right: -8, bottom: -8, width: 15, height: 15, borderRadius: 3, cursor: 'nwse-resize' },
};

// Menu contestuale (tasto destro).
const cx = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 58 },
  menu: { position: 'absolute', zIndex: 59, minWidth: 190, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 12px 34px rgba(0,0,0,.20)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, fontFamily: FONT },
  item: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#222' },
  itemOff: { color: '#bbb', cursor: 'not-allowed' },
  sep: { height: 1, background: '#ececf0', margin: '4px 2px' },
};

const GLASS = { background: 'rgba(255,255,255,.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' };
const CARD = { position: 'absolute', top: 14, display: 'flex', alignItems: 'center', gap: 8, ...GLASS, border: '1px solid rgba(229,231,235,.9)', borderRadius: 14, padding: '6px 10px', boxShadow: '0 6px 20px rgba(20,20,40,.10)', zIndex: 30 };
const t = {
  muted: { color: '#888', fontSize: 12 },
  tlCard: { ...CARD, left: 14 },
  trStack: { position: 'absolute', top: 10, right: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, zIndex: 30 },
  trRow: { display: 'flex', alignItems: 'center', gap: 10 },
  userEmail: { fontSize: 12, color: '#666', fontWeight: 500, whiteSpace: 'nowrap', background: 'rgba(255,255,255,.7)', padding: '2px 6px', borderRadius: 6 },
  brand: { fontSize: 13, fontWeight: 800, color: '#7048e8', letterSpacing: 0.4, textShadow: '0 1px 0 rgba(255,255,255,.8)' },
  trBar: { display: 'flex', alignItems: 'center', gap: 8, ...GLASS, border: '1px solid rgba(229,231,235,.9)', borderRadius: 14, padding: '6px 10px', boxShadow: '0 6px 20px rgba(20,20,40,.10)' },
  logo: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: '#7048e8', color: '#fff', fontSize: 13 },
  free: { fontSize: 11, color: '#7048e8', fontWeight: 600 },
  iconBtn: { width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 15 },
  timer: { display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, padding: '5px 8px', fontVariantNumeric: 'tabular-nums' },
  share: { border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#7048e8,#9775fa)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '7px 16px', boxShadow: '0 4px 12px rgba(112,72,232,.35)' },
  barBtn: { border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#333', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '7px 12px', whiteSpace: 'nowrap' },
  swatches: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, padding: 4 },
  swatch: { width: 26, height: 26, borderRadius: 5, border: '1px solid #ccc', cursor: 'pointer' },
  custom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', fontSize: 12, color: '#555', borderTop: '1px solid #eee', marginTop: 4 },
  figbar: { position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 2, ...GLASS, border: '1px solid rgba(229,231,235,.9)', borderRadius: 18, padding: 6, boxShadow: '0 10px 30px rgba(20,20,40,.16)', zIndex: 30 },
  toolPop: { position: 'absolute', bottom: 92, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, ...GLASS, border: '1px solid rgba(229,231,235,.9)', borderRadius: 16, padding: '8px 14px', boxShadow: '0 8px 24px rgba(20,20,40,.14)', zIndex: 31 },
  sep: { width: 1, height: 34, background: '#e5e7eb', margin: '0 4px' },
  zoomCard: { position: 'absolute', bottom: 20, right: 62, display: 'flex', alignItems: 'center', gap: 4, ...GLASS, border: '1px solid rgba(229,231,235,.9)', borderRadius: 14, padding: 5, boxShadow: '0 6px 20px rgba(20,20,40,.10)', zIndex: 30 },
  helpBtn: { position: 'absolute', bottom: 20, right: 14, width: 38, height: 38, borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 16, boxShadow: '0 4px 16px rgba(0,0,0,.10)', zIndex: 30 },
  layers: { width: 220, borderLeft: '1px solid #e5e7eb', background: '#fff', padding: 12, overflowY: 'auto' },
  layerRow: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 6, fontSize: 13 },
  mini: { border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 11, width: 22, height: 22 },
  iconOn: { background: '#7048e8', color: '#fff', borderColor: '#7048e8' },
  catLabel: { fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 10px 2px' },
  sidePanel: { position: 'absolute', top: 84, right: 14, width: 250, maxHeight: '70vh', overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)', zIndex: 32, display: 'flex', flexDirection: 'column', gap: 6 },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  x: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#888', padding: 2 },
  panelBtn: { border: '1px dashed #c9c2f0', borderRadius: 8, background: '#f6f4ff', color: '#5a3fd0', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '7px 8px' },
  panelRow: { display: 'flex', alignItems: 'center', gap: 5, padding: '5px 4px', borderRadius: 6, fontSize: 13, borderBottom: '1px solid #f2f2f5' },
  roleSel: { fontSize: 12, border: '1px solid #ddd', borderRadius: 6, padding: '2px 4px', cursor: 'pointer' },
  revokeBtn: { fontSize: 11, border: '1px solid #f1c6c6', background: '#fff5f5', color: '#e03131', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' },
  roleTag: { fontSize: 11, color: '#666', background: '#f1f1f4', borderRadius: 6, padding: '2px 6px', textTransform: 'capitalize' },
  presentBtn: { marginTop: 4, border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#7048e8,#9775fa)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: '9px 10px', boxShadow: '0 4px 12px rgba(112,72,232,.35)' },
  presentBar: { position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, background: '#1f2430', color: '#fff', border: '1px solid #2b3040', borderRadius: 12, padding: '6px 10px', boxShadow: '0 8px 24px rgba(0,0,0,.3)', zIndex: 45 },
  presentNav: { width: 30, height: 30, borderRadius: 8, border: 'none', background: '#333a4a', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 },
  presentExit: { border: 'none', borderRadius: 8, background: '#e03131', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 10px' },
};
