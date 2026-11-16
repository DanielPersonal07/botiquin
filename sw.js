// Service worker: la app funciona sin conexión.
// - Interfaz y datos: red primero y, sin red, la copia guardada.
// - Audio: si está guardado (caché "audio-v1"), se sirve de ahí respetando los rangos de bytes.
const SHELL = 'shell-v2';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'data/catalogo.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'img/inicio.jpg'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(SHELL).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function conRango(req, resp) {
  const rango = req.headers.get('range');
  if (!rango) return resp;
  const buf = await resp.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(rango);
  let ini = m && m[1] ? +m[1] : 0;
  let fin = m && m[2] ? +m[2] : buf.byteLength - 1;
  if (m && !m[1] && m[2]) { ini = buf.byteLength - +m[2]; fin = buf.byteLength - 1; }
  fin = Math.min(fin, buf.byteLength - 1);
  return new Response(buf.slice(ini, fin + 1), {
    status: 206,
    headers: {
      'Content-Type': resp.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${ini}-${fin}/${buf.byteLength}`,
      'Content-Length': String(fin - ini + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3')) {
    ev.respondWith((async () => {
      const guardado = await caches.match(url.pathname.replace(/^.*\/audio\//, 'audio/'), { cacheName: 'audio-v1' })
        || await caches.match(req.url, { ignoreSearch: true, cacheName: 'audio-v1' });
      return guardado ? conRango(req, guardado) : fetch(req);
    })());
    return;
  }

  ev.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) { const c = await caches.open(SHELL); c.put(req, r.clone()); }
      return r;
    } catch {
      return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('index.html'));
    }
  })());
});
