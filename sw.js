// Service worker: tiene sul telefono una copia dell'app per usarla senza rete.
// VERSION deve coincidere con il ?v= dei file in index.html: aggiornali insieme a ogni rilascio.
const VERSION = '45';
const CACHE = 'gym-' + VERSION;
const FILES = [
  './',
  `style.css?v=${VERSION}`, `i18n.js?v=${VERSION}`, `exlib.js?v=${VERSION}`, `lib/data.js?v=${VERSION}`, `app.js?v=${VERSION}`, `import.js?v=${VERSION}`, `plandoc.js?v=${VERSION}`, `guide.js?v=${VERSION}`, `guide3d.js?v=${VERSION}`, `chat.js?v=${VERSION}`, `nostr-tools.js?v=${VERSION}`,
  'manifest.json', 'icons/icon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
// elimina solo le copie di versioni precedenti: un worker vecchio non può mai cancellare quella nuova
const cleanup = () => caches.keys().then(keys => Promise.all(keys
  .filter(k => /^gym-\d+$/.test(k) && +k.slice(4) < +VERSION).map(k => caches.delete(k))));
self.addEventListener('activate', e => { e.waitUntil(cleanup().then(() => self.clients.claim())); });

// pagina: prima la rete (per ricevere gli aggiornamenti), copia salvata se offline o se la rete non risponde in 3 s
function page(req) {
  const fromNet = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./', copy)); }
    return r;
  });
  const timeout = new Promise(res => setTimeout(res, 3000));
  return Promise.race([fromNet, timeout]).then(r => r || caches.match('./').then(c => c || fromNet))
    .catch(() => caches.match('./'));
}
// file con versione nel nome: dalla copia salvata, altrimenti dalla rete e poi salvati
function asset(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' ? page(req) : asset(req));
  // durante un aggiornamento il vecchio worker può ricreare la sua copia: si ripulisce a ogni apertura
  if (req.mode === 'navigate') e.waitUntil(new Promise(r => setTimeout(r, 4000)).then(cleanup));
});
// risponde con la versione attiva (utile per verificare gli aggiornamenti)
self.addEventListener('message', e => { if (e.data === 'version' && e.ports[0]) e.ports[0].postMessage(VERSION); });
