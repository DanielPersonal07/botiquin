// Service worker: la app funciona sin conexión.
// - Interfaz y datos: red primero y, sin red, la copia guardada.
// - Audio: si está guardado (caché "audio-v2"), se sirve de ahí respetando los rangos de bytes.
const SHELL = 'shell-v5';
const AUDIO = 'audio-v3'; // súbelo cuando cambien los audios para que el móvil descargue los nuevos
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'data/catalogo.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'img/inicio.jpg'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(SHELL).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith('shell-') && k !== SHELL) || (k.startsWith('audio-') && k !== AUDIO)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// El último audio usado se guarda en memoria: cada salto pide un trozo y no hay que releer todo el archivo.
let enMemoria = { url: null, buf: null, tipo: 'audio/mpeg' };
const TROZO = 1024 * 1024;

async function conRango(req, resp, url) {
  const rango = req.headers.get('range');
  if (!rango) return resp;
  if (enMemoria.url !== url) {
    enMemoria = { url, buf: await resp.arrayBuffer(), tipo: resp.headers.get('Content-Type') || 'audio/mpeg' };
  }
  const buf = enMemoria.buf, total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rango);
  let ini = m && m[1] ? +m[1] : 0;
  let fin = m && m[2] ? +m[2] : Math.min(ini + TROZO, total) - 1;
  if (m && !m[1] && m[2]) { ini = Math.max(0, total - +m[2]); fin = total - 1; }
  fin = Math.min(fin, total - 1);
  if (ini >= total) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  return new Response(buf.slice(ini, fin + 1), {
    status: 206,
    headers: {
      'Content-Type': enMemoria.tipo,
      'Content-Range': `bytes ${ini}-${fin}/${total}`,
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
      const guardado = await caches.match(url.pathname.replace(/^.*\/audio\//, 'audio/'), { cacheName: AUDIO })
        || await caches.match(req.url, { ignoreSearch: true, cacheName: AUDIO });
      return guardado ? conRango(req, guardado, url.pathname) : fetch(req);
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
