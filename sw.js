// Service worker: la app funciona sin conexión.
// - Interfaz y datos: red primero y, sin red, la copia guardada.
// - Audio: nunca se guarda; siempre llega del servidor (así se oye siempre la última versión).
const SHELL = 'shell-v9';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'data/catalogo.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'img/inicio.jpg'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(SHELL).then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  // borra las versiones viejas de la interfaz y todas las copias de audio que se guardaron antes
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => (k.startsWith('shell-') && k !== SHELL) || k.startsWith('audio-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // los audios no se guardan en el móvil: siempre se piden al servidor
  if (url.pathname.includes('/audio/')) return;

  ev.respondWith((async () => {
    try {
      // "no-cache": pregunta siempre al servidor si hay versión nueva (GitHub deja copias de hasta 10 min en el navegador)
      const r = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
      if (r.ok) { const c = await caches.open(SHELL); c.put(req, r.clone()); }
      return r;
    } catch {
      return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('index.html'));
    }
  })());
});
