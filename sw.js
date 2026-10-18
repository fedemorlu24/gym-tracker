// Service worker: tiene sul telefono una copia dell'app per usarla senza rete.
// VERSION deve coincidere con il ?v= dei file in index.html: aggiornali insieme a ogni rilascio.
const VERSION = '69';
const CACHE = 'gym-' + VERSION;
const FILES = [
  './',
  `bootstrap.js?v=${VERSION}`, `chat-vault.js?v=${VERSION}`,
  `security-data.js?v=${VERSION}`, `secure-media.js?v=${VERSION}`,
  `style.css?v=${VERSION}`, `i18n.js?v=${VERSION}`, `exlib.js?v=${VERSION}`, `lib/data.js?v=${VERSION}`, `app.js?v=${VERSION}`, `import.js?v=${VERSION}`, `plandoc.js?v=${VERSION}`, `guide.js?v=${VERSION}`, `guide3d.js?v=${VERSION}`, `chat.js?v=${VERSION}`, `nostr-tools.js?v=${VERSION}`,
  `update.js?v=${VERSION}`, 'manifest.json', 'icons/icon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES.map(file => new Request(file, {cache: 'reload'})));
    const index = await c.match('./');
    if (!index || !(await index.text()).includes(`app.js?v=${VERSION}`)) throw new Error('Release index not ready');
  }).then(() => self.skipWaiting()));
});
// elimina solo le copie di versioni precedenti: un worker vecchio non può mai cancellare quella nuova
const cleanup = () => caches.keys().then(keys => Promise.all(keys
  .filter(k => /^gym-\d+$/.test(k) && +k.slice(4) < +VERSION).map(k => caches.delete(k))));
self.addEventListener('activate', e => { e.waitUntil(cleanup().then(() => self.clients.claim())); });

// pagina: prima la rete (per ricevere gli aggiornamenti), copia salvata se offline o se la rete non risponde in 3 s
function page(req) {
  // The installed release is already complete. An automatic activation must
  // load that exact index, even while GitHub's edge caches are catching up.
  if (new URL(req.url).searchParams.get('app-update') === VERSION) {
    return caches.open(CACHE).then(c => c.match('./')).then(hit => hit || fetch(req, {cache: 'reload'}));
  }
  const fromNet = fetch(req, {cache: 'no-cache'}).then(r => {
    if (r.ok) {
      const copy = r.clone();
      r.clone().text().then(html => { if (html.includes(`app.js?v=${VERSION}`)) caches.open(CACHE).then(c => c.put('./', copy)); });
    }
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
// These response headers protect navigations controlled by this worker. The
// bootstrap gate also protects first visits where the hosting response lacks them.
function protectedPage(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.append('Content-Security-Policy', "frame-ancestors 'none'");
  headers.set('X-Frame-Options', 'DENY');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' ? page(req).then(protectedPage) : asset(req));
  // durante un aggiornamento il vecchio worker può ricreare la sua copia: si ripulisce a ogni apertura
  if (req.mode === 'navigate') e.waitUntil(new Promise(r => setTimeout(r, 4000)).then(cleanup));
});
// risponde con la versione attiva (utile per verificare gli aggiornamenti)
self.addEventListener('message', e => { if (e.data === 'version' && e.ports[0]) e.ports[0].postMessage(VERSION); });
