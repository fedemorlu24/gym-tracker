// Do not load application code or open storage inside another page. This also
// covers a first visit before a service worker can add framing response headers.
(() => {
  'use strict';
  const language = (navigator.language || 'en').slice(0, 2);
  const messages = {
    it: ['Apri Gym Tracker direttamente nel browser o dalla schermata Home.', 'Non riesco ad aprire l’app. Ricarica la pagina.'],
    en: ['Open Gym Tracker directly in your browser or from your Home Screen.', 'The app could not load. Reload this page.'],
    es: ['Abre Gym Tracker directamente en el navegador o desde la pantalla de inicio.', 'No se ha podido abrir la app. Recarga la página.'],
    fr: ['Ouvrez Gym Tracker directement dans le navigateur ou depuis l’écran d’accueil.', 'Impossible d’ouvrir l’app. Rechargez la page.'],
    de: ['Öffne Gym Tracker direkt im Browser oder über den Home-Bildschirm.', 'Die App konnte nicht geladen werden. Lade die Seite erneut.']
  };
  function message(index) {
    const heading = document.createElement('h1'), text = document.createElement('p');
    heading.textContent = 'Gym Tracker'; text.textContent = (messages[language] || messages.en)[index];
    document.body.replaceChildren(heading, text); document.body.hidden = false;
  }
  if (window.self !== window.top) { message(0); return; }
  const source = document.getElementById('gym-scripts');
  const scripts = [...source.content.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  source.remove();
  (async () => {
    for (const src of scripts) await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src; script.async = false;
      script.onload = resolve; script.onerror = () => reject(new Error('Unable to load ' + src));
      document.head.append(script);
    });
    document.body.hidden = false;
    window.gymBooted = true;
    window.dispatchEvent(new Event('gym:boot'));
  })().catch(error => { message(1); console.error('Gym Tracker startup failed', error); });
})();
