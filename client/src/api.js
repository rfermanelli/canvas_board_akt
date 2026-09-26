// Client REST minimale. Il token JWT è tenuto in localStorage.
// NOTA sicurezza (skeleton): localStorage è esposto a XSS. In produzione valutare
// cookie httpOnly. Lasciato semplice per lo scheletro.

const BASE = import.meta.env.VITE_API_BASE || '';

export function getToken() {
  return localStorage.getItem('token');
}
export function setToken(t) {
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

async function request(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Errore ${res.status}`);
    err.code = data.code;        // es. stato account: 'pending_verification', 'suspended', ...
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  uploadMedia: (file, boardId) => {
    const fd = new FormData();
    fd.append('file', file);
    if (boardId) fd.append('boardId', boardId);
    return request('POST', '/media', fd);
  },
};
