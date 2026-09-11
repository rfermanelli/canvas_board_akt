// Pop-up interni all'app (toast + modali) al posto di alert()/prompt()/confirm()
// nativi: così i messaggi NON mostrano il prefisso d'origine "localhost:8080 dice:".

const FONT = 'system-ui, sans-serif';

// Messaggio transitorio (sostituisce alert()).
export function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
    background: '#222', color: '#fff', padding: '10px 16px', borderRadius: '8px',
    fontFamily: FONT, fontSize: '14px', zIndex: 10000, boxShadow: '0 4px 20px rgba(0,0,0,.25)',
    maxWidth: '80vw',
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Overlay modale generico; `build(box, done)` riempie il contenuto.
function modal(build) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 10000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#fff', borderRadius: '12px', padding: '20px', width: '340px',
      boxShadow: '0 10px 40px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', gap: '12px',
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const done = (val) => { overlay.remove(); resolve(val); };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(null); });
    build(box, done);
  });
}

const btn = (label, primary) => {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, {
    padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
    border: primary ? 'none' : '1px solid #ccc',
    background: primary ? '#4c6ef5' : '#fff', color: primary ? '#fff' : '#333',
  });
  return b;
};

// Richiesta di testo (sostituisce prompt()). Risolve col testo o null se annullato.
export function askText(label, def = '') {
  return modal((box, done) => {
    const l = document.createElement('div');
    l.textContent = label;
    Object.assign(l.style, { fontSize: '14px', fontWeight: 600 });
    const input = document.createElement('input');
    input.value = def;
    Object.assign(input.style, { padding: '9px', border: '1px solid #ccc', borderRadius: '8px', fontSize: '14px' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    const cancel = btn('Annulla', false);
    const ok = btn('OK', true);
    cancel.onclick = () => done(null);
    ok.onclick = () => done(input.value);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    });
    row.append(cancel, ok);
    box.append(l, input, row);
    // Focus nel tick successivo: se il modale è stato aperto da un click, il mouseup
    // di quel click cade sull'overlay e sfocherebbe l'input se lo focalizzassimo subito.
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

// Editor di testo multiriga stile "blocco note" (per le sticky note).
// Risolve col testo o null se annullato. Invio = a capo; Salva/Ctrl+Invio conferma.
export function askTextarea(label, def = '') {
  return modal((box, done) => {
    box.style.width = '540px';
    box.style.maxWidth = '92vw';
    const l = document.createElement('div');
    l.textContent = label;
    Object.assign(l.style, { fontSize: '14px', fontWeight: 600 });
    const ta = document.createElement('textarea');
    ta.value = def;
    ta.spellcheck = false;
    Object.assign(ta.style, {
      width: '100%', minHeight: '240px', resize: 'vertical', padding: '10px',
      border: '1px solid #ccc', borderRadius: '8px', fontSize: '14px', lineHeight: '1.45',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      boxSizing: 'border-box', outline: 'none', color: '#1a1a1a', background: '#fff',
    });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' });
    const hint = document.createElement('span');
    hint.textContent = 'Invio = a capo · Ctrl+Invio = salva · Esc = annulla';
    Object.assign(hint.style, { fontSize: '11px', color: '#999' });
    const btns = document.createElement('div');
    Object.assign(btns.style, { display: 'flex', gap: '8px' });
    const cancel = btn('Annulla', false);
    const ok = btn('Salva', true);
    cancel.onclick = () => done(null);
    ok.onclick = () => done(ta.value);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(null);
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(ta.value);
    });
    btns.append(cancel, ok);
    row.append(hint, btns);
    box.append(l, ta, row);
    // Focus col cursore in fondo al testo (come un editor).
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
  });
}

// Avviso d'errore: stessa modale di askText (titolo in grassetto + messaggio),
// con un solo pulsante OK. Risolve quando l'utente chiude.
export function alertError(msg, title = 'Errore') {
  return modal((box, done) => {
    const t = document.createElement('div');
    t.textContent = title;
    Object.assign(t.style, { fontSize: '14px', fontWeight: 600 });
    const l = document.createElement('div');
    l.textContent = msg;
    Object.assign(l.style, { fontSize: '14px', color: '#333' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', justifyContent: 'flex-end' });
    const ok = btn('OK', true);
    ok.onclick = () => done();
    ok.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') done(); });
    row.append(ok);
    box.append(t, l, row);
    setTimeout(() => ok.focus(), 0);
  });
}

// Conferma sì/no (sostituisce confirm()). Risolve true/false.
export function askConfirm(msg, okLabel = 'OK', cancelLabel = 'Annulla') {
  return modal((box, done) => {
    const l = document.createElement('div');
    l.textContent = msg;
    Object.assign(l.style, { fontSize: '14px' });
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
    const cancel = btn(cancelLabel, false);
    const ok = btn(okLabel, true);
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    row.append(cancel, ok);
    box.append(l, row);
    ok.focus();
  });
}
