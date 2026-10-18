// Check the deployed GitHub Pages release on every opening/foreground return.
// The service worker installs the complete release before we activate its page.
(() => {
  let registration, checking, available = false, announced = false, applying = false, retry;
  let lastActivity = 0;
  const workerVersion = worker => new Promise(resolve => {
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 2500);
    channel.port1.onmessage = e => { clearTimeout(timer); channel.port1.close(); resolve(String(e.data)); };
    worker.postMessage('version', [channel.port2]);
  });
  function busy() {
    return document.hidden || Date.now() - lastActivity < 1500 || pendingWrites.size > 0 ||
      document.querySelector('#sheet:not([hidden]), #tour:not([hidden]), #install:not([hidden])') ||
      document.activeElement?.matches('input, textarea, select, [contenteditable=true]') ||
      (rest && !rest.done);
  }
  async function activate() {
    clearTimeout(retry);
    if (!available || applying) return;
    if (busy()) { retry = setTimeout(activate, 1000); return; }
    applying = true;
    try {
      const version = await workerVersion(navigator.serviceWorker.controller);
      if (busy() || Number(version) <= Number(APP_VERSION)) {
        applying = false; retry = setTimeout(activate, 1000); return;
      }
      // Cache-only entry avoids a temporarily stale CDN index causing reload loops.
      // Keep the current screen; persisted sessions/plans/photos are never cleared.
      try { sessionStorage.setItem('gym-update-view', JSON.stringify(view)); } catch (_) {}
      const url = new URL(location.href);
      url.searchParams.set('app-update', version);
      location.replace(url.href);
    } catch (_) { applying = false; }
  }
  const detect = async () => {
    const version = await workerVersion(navigator.serviceWorker.controller || registration?.active);
    available = Number(version) > Number(APP_VERSION);
    if (available && !announced) { announced = true; toast(t('appUpdateReady')); }
    if (available) activate();
    return available;
  };
  const installed = worker => new Promise((resolve, reject) => {
    if (!worker || worker.state === 'activated') return resolve();
    const done = () => {
      if (!['activated', 'redundant'].includes(worker.state)) return;
      clearTimeout(timer); worker.removeEventListener('statechange', done);
      worker.state === 'activated' ? resolve() : reject(new Error('Update not installed'));
    };
    const timer = setTimeout(() => { worker.removeEventListener('statechange', done); reject(new Error('Update timed out')); }, 15000);
    worker.addEventListener('statechange', done); done();
  });
  async function check(manual = false) {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.onLine) { if (manual) toast(t('appUpdateOffline')); return; }
    if (checking) return checking;
    checking = (async () => {
      try {
        registration ||= await navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'});
        await registration.update();
        await installed(registration.installing || registration.waiting);
        const newer = await detect();
        if (manual && !newer) toast(t('appUpToDate'));
      } catch (_) { if (manual) toast(t('appUpdateRetry')); }
      finally { checking = null; }
    })();
    return checking;
  }
  // Remove the one-use update URL after the new page has loaded.
  const url = new URL(location.href);
  if (url.searchParams.has('app-update')) {
    url.searchParams.delete('app-update'); history.replaceState(null, '', url.href);
    try {
      const previous = JSON.parse(sessionStorage.getItem('gym-update-view'));
      sessionStorage.removeItem('gym-update-view');
      if (previous && typeof previous.name === 'string') { view = previous; render(); }
    } catch (_) {}
  }
  acts.appupdate = async b => {
    b.disabled = true;
    try { if (checking) await checking; await check(true); }
    finally { b.disabled = false; }
  };
  for (const event of ['pointerdown', 'keydown', 'input']) document.addEventListener(event, () => { lastActivity = Date.now(); }, {passive: true});
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', detect);
    addEventListener('load', () => check());
    addEventListener('online', () => check());
    addEventListener('pageshow', e => { if (e.persisted) check(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); activate(); } });
  }
})();
