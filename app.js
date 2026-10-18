const KEY = 'gym-tracker-v1';
let db = load();
let view = {name: 'home', tab: 'today'};

function load() {
  try { return clean(JSON.parse(localStorage.getItem(KEY))) || {sessions: []}; }
  catch (e) { return {sessions: []}; }
}
// ripulisce un archivio (salvato o importato): scarta sedute, esercizi e serie malformati; null se non è un archivio
function clean(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.sessions)) return null;
  const n = v => typeof v === 'number' ? v : parseFloat(v);
  o.sessions = o.sessions.filter(s => s && typeof s === 'object' && /^\d{4}-\d\d-\d\d$/.test(s.date)).map(s => ({
    ...s, id: s.id ? String(s.id) : Math.random().toString(36).slice(2, 10), name: String(s.name || '–'),
    exercises: (Array.isArray(s.exercises) ? s.exercises : []).filter(e => e && typeof e === 'object' && e.name).map(e => ({
      ...e, id: e.id ? String(e.id) : Math.random().toString(36).slice(2, 10), name: String(e.name),
      sets: (Array.isArray(e.sets) ? e.sets : []).map(z => z && {reps: Math.round(n(z.reps)), kg: n(z.kg), ...(typeof z.at === 'number' ? {at: z.at} : {})}).filter(z => z && z.reps > 0 && z.kg >= 0)}))}));
  if (o.body != null && !Array.isArray(o.body)) delete o.body;
  if (o.body) o.body = o.body.filter(b => b && /^\d{4}-\d\d-\d\d$/.test(b.date));
  return o;
}
// doppia copia: localStorage + IndexedDB, vince la più recente
const IDB = 'gym-tracker', STORE = 'kv', PHOTOS = 'photos';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(PHOTOS)) d.createObjectStore(PHOTOS, {keyPath: 'id'});
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbGet() {
  return idb().then(d => new Promise((res, rej) => {
    const q = d.transaction(STORE).objectStore(STORE).get(KEY);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  }));
}
function idbPut(v) {
  return idb().then(d => new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(v, KEY);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  }));
}
let backupFile = null;
function save() {
  db.ts = Date.now(); backupFile = null; libByName = null;
  const json = JSON.stringify(db);
  let ok = false;
  try { localStorage.setItem(KEY, json); ok = true; } catch (e) {}
  idbPut(json).then(() => {}, () => { if (!ok) alert(t('saveFail')); });
}
// foto del fisico: solo in IndexedDB (troppo grandi per localStorage)
let photos = [];  // {id, date, pose, blob, url}
function photoTx(mode, fn) {
  return idb().then(d => new Promise((res, rej) => {
    const tx = d.transaction(PHOTOS, mode), st = tx.objectStore(PHOTOS), out = fn(st);
    tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error);
  }));
}
function loadPhotos() {
  return photoTx('readonly', st => st.getAll()).then(list => {
    photos.forEach(p => URL.revokeObjectURL(p.url));
    photos = (list || []).map(p => ({...p, url: URL.createObjectURL(p.blob)})).sort((a, b) => a.date.localeCompare(b.date));
    if (!db.badges) { checkBadges(); save(); }
    render();
  }).catch(() => {});
}
// all'avvio e al ritorno in primo piano riallinea le due copie
function restore() {
  idbGet().then(v => {
    if (!v) { if (db.sessions.length) save(); return; }
    const o = clean(JSON.parse(v));
    if (!o) return;
    if ((o.ts || 0) > (db.ts || 0)) {
      db = o; libByName = null;
      try { localStorage.setItem(KEY, v); } catch (e) {}
      setLang(); applyTheme(); render();
    } else if ((db.ts || 0) > (o.ts || 0)) idbPut(JSON.stringify(db)).catch(() => {});
  }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') restore(); });
// chiede al browser di non eliminare mai questi dati
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

// ---------- lingua ----------
const LANGS = Object.keys(I18N);
let lang = 'it', locale = 'it-IT', DEC = ',';
function setLang() {
  const pref = (db.settings && db.settings.lang) || (navigator.languages || [navigator.language || 'it']).map(l => l.slice(0, 2)).find(l => LANGS.includes(l)) || 'en';
  lang = LANGS.includes(pref) ? pref : 'en';
  const nav = (navigator.languages || []).find(l => l.slice(0, 2) === lang);
  locale = nav && nav.length > 2 ? nav : {it: 'it-IT', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE'}[lang];
  DEC = (1.5).toLocaleString(locale).charAt(1);
  document.documentElement.lang = lang;
}
// tema: automatico (segue il telefono), chiaro o scuro
function applyTheme() {
  const th = (db.settings && db.settings.theme) || 'auto', root = document.documentElement;
  if (th === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', th);
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => { m.content = dark ? '#0e0f11' : '#f2f2f7'; });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
function t(k, ...a) {
  const v = k in I18N[lang] ? I18N[lang][k] : I18N.en[k];
  return typeof v === 'function' ? v(...a) : v;
}
const BENCH = {it: 'Panca piana', en: 'Bench press', es: 'Press de banca', fr: 'Développé couché', de: 'Bankdrücken'};

// ---------- utilità ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pad2 = n => String(n).padStart(2, '0');
const isoLocal = x => `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
const today = () => isoLocal(new Date());
const dt = d => new Date(d + 'T12:00');
const fmtDate = d => dt(d).toLocaleDateString(locale, {weekday: 'long', day: 'numeric', month: 'long'});
const fmtShort = d => dt(d).toLocaleDateString(locale, {day: 'numeric', month: 'short'});
const fmtAxis = d => dt(d).toLocaleDateString(locale, {day: '2-digit', month: '2-digit'});
const fmtKg = n => String(Math.round(n * 100) / 100).replace('.', DEC);
const fmt1 = n => fmtKg(Math.round(n * 10) / 10);
const fmtInt = n => Math.round(n).toLocaleString(locale);
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
const key = n => n.trim().toLowerCase();
const addDays = (d, n) => { const x = dt(d); x.setDate(x.getDate() + Math.round(n)); return isoLocal(x); };
const daysBetween = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
function rel(d) {
  const days = daysBetween(d, today());
  if (days === 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days > 1 && days < 7) return t('daysAgo', days);
  return fmtShort(d);
}
const I = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  flip: '<path d="M4 12a8 4 0 0 0 14 2.6"/><path d="M20 12a8 4 0 0 0-14-2.6"/><path d="M15 12.5l3 2.2-.6-3.6M9 11.5l-3-2.2.6 3.6"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l4-4 4 3 6-7"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  lift: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  body: '<circle cx="12" cy="5" r="2.2"/><path d="M5 9.5c2.3.9 4.6 1.3 7 1.3s4.7-.4 7-1.3"/><path d="M12 10.8V15m0 0l-3 6m3-6l3 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  share: '<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8"/>',
  addsq: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  arrow: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  fwd: '<path d="M9 5l7 7-7 7"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

// ---------- logica di allenamento ----------
const TOP_REPS = 12, BASE_REPS = 8;         // doppia progressione 8–12 ripetizioni
const stepFor = kg => kg < 20 ? 2 : 2.5;     // incremento di carico
const e1rm = s => s.reps <= 1 ? s.kg : s.kg * (1 + s.reps / 30);  // Epley
const r05 = n => Math.round(n * 2) / 2;
const vol = sets => sets.reduce((a, s) => a + s.reps * s.kg, 0);
const bestSet = sets => sets.reduce((b, s) => !b || e1rm(s) > e1rm(b) ? s : b, null);
const setTxt = s => `${s.reps} × ${fmtKg(s.kg)}`;
const sess = id => db.sessions.find(s => s.id === id);
const MAX_REPS = 100, MAX_KG = 600;
// un carico molto più alto del solito è quasi sempre un errore di battitura (625 invece di 62,5): chiede conferma
function plausible(e, prior, kg) {
  const top = Math.max(0, ...prior.flatMap(x => x.sets.map(z => z.kg)), ...e.sets.map(z => z.kg));
  return !(top >= 10 && kg > top * 1.5 + 5) || confirm(t('bigJump', fmtKg(kg), fmtKg(top)));
}
const order = s => db.sessions.indexOf(s);

// un esercizio della libreria resta lo stesso anche se cambia nome (lingua, rinomina): lo identifica e.lib
let libByName = null;
function gk(e) {
  if (!libByName) { libByName = new Map(); db.sessions.forEach(s => s.exercises.forEach(x => { if (x.lib && !libByName.has(key(x.name))) libByName.set(key(x.name), x.lib); })); }
  const l = e.lib || libByName.get(key(e.name));
  return l ? 'L:' + l : 'N:' + key(e.name);
}
// storico di un esercizio in tutte le sedute, dalla più vecchia
function exHistory(name) {
  const g = gk({name});
  return db.sessions
    .flatMap(s => s.exercises.filter(e => gk(e) === g && e.sets.length).map(e => ({sid: s.id, date: s.date, sets: e.sets, o: order(s)})))
    .sort((a, b) => a.date.localeCompare(b.date) || a.o - b.o);
}
// sedute precedenti a quella in esame (escluse quelle con data futura)
const priorOf = (s, e) => exHistory(e.name).filter(x => x.sid !== s.id && x.date <= s.date);
const prevFor = (s, e) => priorOf(s, e).pop();
// obiettivi per la prossima serie partendo dalla stessa serie dell'ultima volta
function suggest(ps) {
  const st = stepFor(ps.kg);
  if (ps.reps >= TOP_REPS) return [{reps: BASE_REPS, kg: ps.kg + st}, {reps: ps.reps, kg: ps.kg}];
  return [{reps: ps.reps + 1, kg: ps.kg}, {reps: ps.reps, kg: ps.kg + st}];
}
function exStats(name) {
  let best = 0;
  return exHistory(name).map(x => {
    const b = bestSet(x.sets), e = r05(e1rm(b));
    const pr = best > 0 && e > best;
    best = Math.max(best, e);
    const kg = Math.max(...x.sets.map(z => z.kg));
    return {...x, b, e, vol: vol(x.sets), pr, kg, rt: Math.max(...x.sets.filter(z => z.kg === kg).map(z => z.reps)), reps: x.sets.reduce((a, z) => a + z.reps, 0)};
  });
}
const dir = (a, b) => a > b ? 'up' : a < b ? 'down' : 'eq';
const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtKg(Math.abs(v));
function deltaTag(cur, prev, f, u) {
  if (!prev) return '';
  const v = cur[f] - prev[f], d = dir(cur[f], prev[f]);
  return `<span class="tag ${d === 'up' ? 'up' : 'eq'}">${d === 'up' ? '▲' : d === 'down' ? '▼' : '='} ${sign(v)} ${u}</span>`;
}
// bozza della serie in compilazione, per esercizio
const drafts = {};
function draftFor(s, e) {
  if (drafts[e.id]) return drafts[e.id];
  const prev = prevFor(s, e), i = e.sets.length;
  let d = {reps: '', kg: ''};
  const lastSet = i ? {reps: e.sets[i - 1].reps, kg: e.sets[i - 1].kg} : null;
  if (prev && i < prev.sets.length) {
    d = {...suggest(prev.sets[i])[0]};
    // dopo una serie più pesante della proposta si riparte da quella, non dalla volta scorsa
    if (lastSet && e1rm(lastSet) > e1rm(d)) d = lastSet;
  } else if (i) d = {reps: e.sets[i - 1].reps, kg: e.sets[i - 1].kg};
  else if (prev) d = {...suggest(prev.sets[prev.sets.length - 1])[0]};
  else if (e.target) d = {reps: repsLow(e.target.reps), kg: ''};
  return drafts[e.id] = d;
}

// ---------- profilo e livello ----------
const profile = () => db.profile || {};
const body = () => (db.body || []).slice().sort((a, b) => a.date.localeCompare(b.date));
const lastWeight = () => { const w = body().filter(x => x.weight > 0); return w.length ? w[w.length - 1].weight : 0; };
const bodyWeight = () => lastWeight() || profile().weight || 0;
const profileOk = () => { const p = profile(); return (p.sex === 'm' || p.sex === 'f') && p.age > 0 && bodyWeight() > 0; };
// rapporto forza/peso corporeo minimo per ogni livello (standard di forza diffusi)
const STD = {
  bench: {m: [.5, .75, 1, 1.5, 2], f: [.25, .5, .75, 1, 1.5]},
  squat: {m: [.75, 1.25, 1.5, 2.25, 2.75], f: [.5, .75, 1.25, 1.5, 2]},
  deadlift: {m: [1, 1.5, 2, 2.5, 3], f: [.5, 1, 1.25, 1.75, 2.5]},
  ohp: {m: [.35, .55, .75, 1, 1.25], f: [.2, .35, .5, .75, 1]},
};
function liftType(name) {
  const n = key(name);
  if (/panca piana|^panca$|bench press|^bench$|press de banca|développé couché|developpe couche|bankdrück/.test(n)) return 'bench';
  if (/squat|sentadilla|kniebeuge/.test(n)) return 'squat';
  if (/stacco|deadlift|peso muerto|soulevé de terre|souleve de terre|kreuzheben/.test(n)) return 'deadlift';
  if (/lento avanti|military|overhead|shoulder press|press militar|développé militaire|schulterdrück/.test(n)) return 'ohp';
  return null;
}
function levelOf(name) {
  const lt = liftType(name), p = profile(), bw = bodyWeight();
  if (lt && (p.sex === 'm' || p.sex === 'f') && bw) {
    const thr = STD[lt][p.sex], e = Math.max(0, ...exHistory(name).flatMap(x => x.sets.map(e1rm))), ratio = e / bw;
    const i = Math.max(0, thr.filter(x => ratio >= x).length - 1);
    return {i, ratio, e, next: i < 4 ? thr[i + 1] * bw : 0, std: true};
  }
  // senza standard: livello dall'anzianità di allenamento
  const ds = doneSessions().map(s => s.date).sort(), months = ds.length ? daysBetween(ds[0], today()) / 30 : 0;
  return {i: months < 3 ? 0 : months < 8 ? 1 : months < 24 ? 2 : 3, std: false};
}
// progresso mensile atteso (% di forza) per livello ed età
function expectedPct(name) {
  const base = [6, 4, 2, 1, .5][levelOf(name).i], a = profile().age || 30;
  return base * (a < 30 ? 1 : a < 40 ? .9 : a < 50 ? .75 : a < 60 ? .6 : .5);
}

// ---------- settimane, obiettivi, traguardi, previsione ----------
const weekOf = d => { const x = dt(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return isoLocal(x); };
const weeklyTarget = () => (db.settings && db.settings.weekly) || 3;
const doneSessions = () => db.sessions.filter(s => s.exercises.some(e => e.sets.length));
function weekCounts() {
  const m = {};
  doneSessions().forEach(s => { const w = weekOf(s.date); m[w] = (m[w] || 0) + 1; });
  return m;
}
// settimane consecutive centrate; quella in corso non interrompe la serie
function streak() {
  const m = weekCounts(), tg = weeklyTarget(), cw = weekOf(today());
  let n = 0, w = addDays(cw, -7);
  if (m[cw] >= tg) n++;
  while (m[w] >= tg) { n++; w = addDays(w, -7); }
  return {n, week: m[cw] || 0, t: tg};
}
function bestStreak() {
  const m = weekCounts(), tg = weeklyTarget(), ws = Object.keys(m).sort();
  if (!ws.length) return 0;
  let best = 0, run = 0;
  for (let w = ws[0]; w <= weekOf(today()); w = addDays(w, 7)) { run = m[w] >= tg ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}
// regressione lineare sugli ultimi punti {x: giorni, y}
function fit(pts) {
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const sd = Math.sqrt(pts.reduce((s, p) => s + (p.y - a - b * p.x) ** 2, 0) / Math.max(1, n - 2));
  return {a, b, sd};
}
function forecastSeries(series, minN, minSpan, maxPerDay) {
  const pts = series.slice(-8);
  if (pts.length < minN) return {why: t('needN', minN, pts.length)};
  const d0 = pts[0].d, span = daysBetween(d0, pts[pts.length - 1].d);
  if (span < minSpan) return {why: t('needSpan', minSpan)};
  let {a, b, sd} = fit(pts.map(p => ({x: daysBetween(d0, p.d), y: p.v})));
  const now = a + b * span;
  let capped = false;
  if (maxPerDay && b > maxPerDay) { b = maxPerDay; capped = true; }
  return {b, sd, d0, last: pts[pts.length - 1].d, now, pts, capped, at: x => now + b * (x - span)};
}
function fcEx(name) {
  const st = exStats(name).filter(x => x.date !== today());
  const cur = st.length ? st[st.length - 1].e : 0;
  // con il profilo completo la tendenza non supera il doppio del ritmo atteso
  const cap = profileOk() && cur ? cur * expectedPct(name) / 100 / 30 * 2 : 0;
  return forecastSeries(st.map(x => ({d: x.date, v: x.e})), 4, 14, cap);
}
const fcBody = () => forecastSeries(body().filter(x => x.weight > 0).map(x => ({d: x.date, v: x.weight})), 4, 10, 0);
// giorni stimati (dall'ultima misura) per arrivare a y; null se la tendenza non va in quella direzione
function eta(fc, y) {
  if (!fc || fc.why) return null;
  const need = y - fc.now;
  if (Math.abs(need) < 1e-9) return 0;
  if (Math.sign(need) !== Math.sign(fc.b) || Math.abs(fc.b) < 1e-4) return null;
  return need / fc.b;
}
function etaTxt(days, from) {
  if (days == null) return '';
  days -= Math.max(0, daysBetween(from, today()));  // giorni da oggi
  if (days <= 3) return t('etaSoon');
  if (days > 365) return t('etaYear');
  const w = Math.max(1, Math.round(days / 7));
  return t('eta', w, fmtShort(addDays(today(), days)));
}

const goalList = () => db.goals || (db.goals = []);
const bestE = name => Math.max(0, ...exHistory(name).flatMap(x => x.sets.map(e1rm)));
function goalState(g) {
  if (g.type === 'lift') {
    const target = e1rm(g), cur = bestE(g.ex), span = target - g.start;
    const pct = g.done ? 1 : span > 0 ? Math.min(1, Math.max(0, (cur - g.start) / span)) : cur >= target ? 1 : 0;
    const fc = fcEx(g.ex), d = eta(fc, target);
    return {title: `${g.ex} · ${setTxt(g)} kg`, pct, cur: t('curLift', fmtKg(r05(cur)), fmtKg(r05(target))),
      eta: g.done ? '' : fc.why ? fc.why : d == null ? t('etaFlat') : etaTxt(d, fc.last)};
  }
  const cur = lastWeight(), span = g.weight - g.start;
  const pct = g.done ? 1 : span ? Math.min(1, Math.max(0, (cur - g.start) / span)) : 1;
  const fc = fcBody(), d = eta(fc, g.weight);
  return {title: t('bodyGoal', fmtKg(g.weight)), pct, cur: t('curBody', fmtKg(cur), fmtKg(g.start)),
    eta: g.done ? '' : fc.why ? fc.why : d == null ? t('etaWrong') : etaTxt(d, fc.last)};
}
// segna gli obiettivi raggiunti; restituisce quelli nuovi
function checkGoals() {
  const hit = [];
  goalList().forEach(g => {
    if (g.done) return;
    let ok = false;
    if (g.type === 'lift') ok = exHistory(g.ex).some(x => x.date >= g.created && x.sets.some(z => z.kg >= g.kg && z.reps >= g.reps));
    else { const c = lastWeight(); ok = c > 0 && (g.weight >= g.start ? c >= g.weight : c <= g.weight); }
    if (ok) { g.done = today(); hit.push(g); }
  });
  return hit;
}
function goalCard(g, tag = 'button') {
  const s = goalState(g);
  return `<${tag} class="goalc${g.done ? ' done' : ''}" data-act="goalmenu" data-id="${g.id}">
    <div class="item"><h3>${esc(s.title)}</h3><span class="${g.done ? 'up' : 'sub'}" style="font-weight:600">${g.done ? '✓ ' + fmtShort(g.done) : Math.round(s.pct * 100) + '%'}</span></div>
    <div class="meter" role="progressbar" aria-valuenow="${Math.round(s.pct * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${s.pct * 100}%"></i></div>
    <div class="sub">${g.done ? t('goalDone') : s.cur}</div>${s.eta ? `<div class="sub eta">${s.eta}</div>` : ''}</${tag}>`;
}

function badgeList() {
  const ds = doneSessions(), names = exerciseNames();
  const sets = ds.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  const tons = ds.reduce((a, s) => a + s.exercises.reduce((b, e) => b + vol(e.sets), 0), 0) / 1000;
  let prs = 0, gain = 0;
  names.forEach(x => { const st = exStats(x.name); prs += st.filter(p => p.pr).length; gain = Math.max(gain, Math.max(...st.map(p => p.kg)) - st[0].kg); });
  const gd = goalList().filter(g => g.done).length, bs = bestStreak(), wk = t('_wk');
  return [
    ['s1', t('b_s1'), ds.length, 1, '1'], ['s10', t('b_s', 10), ds.length, 10, '10'], ['s25', t('b_s', 25), ds.length, 25, '25'],
    ['s50', t('b_s', 50), ds.length, 50, '50'], ['s100', t('b_s', 100), ds.length, 100, '100'],
    ['pr1', t('b_pr1'), prs, 1, 'PR'], ['pr10', t('b_pr', 10), prs, 10, '10 PR'], ['pr25', t('b_pr', 25), prs, 25, '25 PR'],
    ['w4', t('b_w', 4), bs, 4, '4 ' + wk], ['w12', t('b_w', 12), bs, 12, '12 ' + wk], ['w26', t('b_w', 26), bs, 26, '26 ' + wk],
    ['kg10', t('b_kg', 10), gain, 10, '+10'], ['kg25', t('b_kg', 25), gain, 25, '+25'],
    ['set100', t('b_set', 100), sets, 100, '100'], ['set500', t('b_set', 500), sets, 500, '500'],
    ['t10', t('b_t', 10), tons, 10, '10 t'], ['t100', t('b_t', 100), tons, 100, '100 t'],
    ['g1', t('b_g1'), gd, 1, '★'], ['g5', t('b_g', 5), gd, 5, '5★'],
    ['ph1', t('b_ph1'), photos.length, 1, icon('camera')],
  ].map(([id, tt, v, n, g]) => ({id, t: tt, v, n, g, on: v >= n}));
}
// traguardi appena sbloccati (al primo avvio registra quelli già ottenuti senza festeggiare)
function checkBadges() {
  const on = badgeList().filter(b => b.on);
  if (!db.badges) { db.badges = {}; on.forEach(b => db.badges[b.id] = 'prima'); return []; }
  const fresh = on.filter(b => !db.badges[b.id]);
  fresh.forEach(b => db.badges[b.id] = today());
  return fresh;
}
function badgeGrid() {
  const bl = badgeList(), n = bl.filter(b => b.on).length;
  const fmtV = b => b.id[0] === 't' ? `${fmt1(b.v)}/${b.n} t` : `${Math.floor(b.v)}/${b.n}`;
  return `<div class="panel-c"><div class="hd"><div><h2>${t('badges')}</h2><p class="sub">${t('unlockedOf', n, bl.length)}</p></div></div>
    <div class="badges">${bl.map(b => `<div class="badge${b.on ? ' on' : ''}" aria-label="${esc(b.t)}${b.on ? ', ' + t('unlocked') : ', ' + fmtV(b)}">
      <span class="medal">${b.g}</span><b>${b.t}</b><span class="sub">${b.on ? (db.badges && db.badges[b.id] && db.badges[b.id] !== 'prima' ? fmtShort(db.badges[b.id]) : t('unlocked')) : fmtV(b)}</span></div>`).join('')}</div></div>`;
}
function streakCard() {
  const s = streak(), dots = Array.from({length: s.t}, (_, i) => `<i class="${i < s.week ? 'on' : ''}"></i>`).join('');
  return `<button class="streak" data-act="weekly">
    <div class="grow"><div class="dots" aria-hidden="true">${dots}</div><h3>${s.week >= s.t ? t('weekDone') : t('weekLeft', s.t - s.week)}</h3>
      <div class="sub">${t('weekSub', s.t)}</div></div>
    <div class="fire"><b>${s.n}</b><span>${t('inARow', s.n)}</span></div></button>`;
}
// festeggia obiettivi e traguardi nuovi; restituisce true se ha mostrato qualcosa
function celebrate() {
  const g = checkGoals(), b = checkBadges();
  if (g.length || b.length) save();
  if (g.length) { toast(t('goalReached', esc(goalState(g[0]).title))); return true; }
  if (b.length) { toast(t('badgeToast', b.slice(0, 2).map(x => x.t).join(', ') + (b.length > 2 ? ` +${b.length - 2}` : ''))); return true; }
  return false;
}

// ---------- navigazione ----------
function go(v) {
  const sameView = view.name === v.name;
  view = v; render();
  if (v.y != null) window.scrollTo(0, v.y);
  else if (!sameView) window.scrollTo(0, 0);
}
function render() {
  const app = document.getElementById('app');
  let tabs = false;
  if (view.name === 'session' && sess(view.id)) app.innerHTML = sessionView();
  else if (view.name === 'ex' && exHistory(view.ex).length) app.innerHTML = exView();
  else if (view.name === 'settings') app.innerHTML = settingsView();
  else if (view.name === 'plan' && plans()[view.id]) app.innerHTML = planView();
  else if (view.name === 'planedit' && plans()[view.id]) app.innerHTML = planEditView();
  else { if (view.name !== 'home') view = {name: 'home', tab: 'today'}; app.innerHTML = home(); tabs = true; }
  document.body.classList.toggle('tabs', tabs);
  document.getElementById('tabbar').innerHTML = tabs ? tabbar() : '';
  document.getElementById('tabbar').hidden = !tabs;
  document.title = t('shareTitle');
  const wk = document.getElementById('wk-wrap'); if (wk) wk.scrollLeft = wk.scrollWidth;
}
function tabbar() {
  const tab = view.tab || 'today';
  const b = (k, ic, l) => `<button role="tab" aria-selected="${tab === k}" data-act="tab" data-tab="${k}">${icon(ic)}${l}</button>`;
  return b('today', 'cal', t('tabToday')) + b('sessions', 'lift', t('tabWorkouts')) + b('progress', 'chart', t('tabProgress')) + b('body', 'body', t('tabBody'));
}


// ---------- Oggi: tutto quello che riguarda un giorno ----------
function todayView() {
  const day = view.day || today(), isToday = day === today(), mon = weekOf(day);
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  const ss = db.sessions.filter(s => s.date === day).sort((a, b) => order(a) - order(b));
  const bodyOf = d => (db.body || []).find(x => x.date === d);
  // striscia della settimana: pallino arancione = allenamento, grigio = corpo
  const strip = Array.from({length: 7}, (_, i) => {
    const d = addDays(mon, i), dd = dt(d), w = db.sessions.some(s => s.date === d && s.exercises.some(e => e.sets.length)),
      b = !!bodyOf(d) || photos.some(p => p.date === d);
    return `<button class="dstrip-d${d === day ? ' sel' : ''}${d === today() ? ' now' : ''}" data-act="day" data-d="${d}" aria-label="${fmtDate(d)}" aria-pressed="${d === day}">
      <span>${dd.toLocaleDateString(locale, {weekday: 'narrow'})}</span><b>${dd.getDate()}</b><i>${w ? '<em class="w"></em>' : ''}${b ? '<em class="b"></em>' : ''}</i></button>`;
  }).join('');
  const short = cap(dt(day).toLocaleDateString(locale, {weekday: 'short', day: 'numeric', month: 'short'}));
  let html = `<header><div class="t"><h1>${isToday ? t('tabToday') : short}</h1>${isToday ? `<p>${cap(fmtDate(day))}</p>` : ''}</div>
      ${isToday ? '' : `<button class="ib txt" data-act="day" data-d="${today()}">${t('tabToday')}</button>`}
      <button class="ib" data-act="settings" aria-label="${t('settings')}">${icon('gear')}</button></header>
    <div class="dstrip"><button class="ib" data-act="day" data-d="${addDays(mon, -7)}" aria-label="${t('prevWeekA')}">${icon('back')}</button>
      <div class="dstrip-days">${strip}</div>
      <button class="ib" data-act="day" data-d="${addDays(mon, 7)}" aria-label="${t('nextWeekA')}" ${addDays(mon, 7) > today() ? 'disabled' : ''}>${icon('fwd')}</button></div>`;

  // allenamento del giorno
  html += `<p class="glabel">${t('workoutCard')}</p>`;
  if (ss.length) html += ss.map(s => {
    const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0), v = s.exercises.reduce((a, e) => a + vol(e.sets), 0);
    const lines = s.exercises.map(e => {
      const prior = priorOf(s, e), prev = prior[prior.length - 1], best = Math.max(0, ...prior.flatMap(x => x.sets.map(e1rm)));
      const top = e.sets.length ? Math.max(...e.sets.map(e1rm)) : 0;
      const tag = !e.sets.length ? `<span class="tag eq">${t('todo')}</span>` : best > 0 && top > best + 1e-9 ? `<span class="tag pr">${t('record')}</span>`
        : prev && top > Math.max(...prev.sets.map(e1rm)) + 1e-9 ? '<span class="tag up">▲</span>' : '';
      return `<div class="dex"><div class="grow"><b>${esc(e.name)}</b><span>${e.sets.map(z => `<i>${setTxt(z)}</i>`).join(' · ') || '–'}</span></div>${tag}</div>`;
    }).join('');
    return `<button class="dcard" data-act="open" data-sid="${s.id}"><div class="item"><h3>${esc(s.name)}</h3><span class="chev">${icon('chev')}</span></div>
      <p class="sub">${t('setsDone', sets, v >= 1000 ? fmt1(v / 1000) + ' t' : fmtInt(v) + ' kg')}</p>${lines}</button>`;
  }).join('');
  else if (isToday) {
    const last = [...db.sessions].filter(s => s.exercises.length).sort((a, b) => b.date.localeCompare(a.date) || order(b) - order(a));
    // proposta: la seduta fatta l'ultima volta nello stesso giorno della settimana, altrimenti la più recente
    // proposta: la seduta che di solito segue l'ultima fatta (A → B → A…), altrimenti quella dello stesso giorno della settimana
    const wd = dt(day).getDay(), np = nextPlanDay(), lk = last[0] && key(last[0].name);
    // l'ultima volta che si è fatta la stessa seduta, cosa è venuto subito dopo?
    const k = last.findIndex((s, i) => i > 0 && key(s.name) === lk && last[i - 1] && key(last[i - 1].name) !== lk);
    const sug = (k > 0 ? last[k - 1] : null) || last.find(s => dt(s.date).getDay() === wd && key(s.name) !== lk) || last[0];
    html += programCard(np) + `<div class="dcard"><p class="sub">${t(db.sessions.length ? 'restDayTxt' : 'firstRunTxt')}</p>
      ${sug ? `<button class="btn ${np ? 's' : 'p'} wide" data-act="repeat" data-sid="${sug.id}" style="margin-top:12px${np ? ';background:var(--fill)' : ''}">${icon('plus')} ${esc(t('repeatX', sug.name))}</button>` : ''}
      <button class="btn ${np || sug ? 's' : 'p'} wide" data-act="newsession" style="margin-top:${np || sug ? '8px;background:var(--fill)' : '12px'}">${t('startWorkout')}</button></div>`;
  } else html += `<div class="dcard"><p class="sub">${t('noWorkoutDay')}</p>
      <button class="btn s wide" data-act="newsession" data-d="${day}" style="margin-top:12px;background:var(--fill)">${icon('plus')} ${t('addPastWorkout')}</button></div>`;

  if (isToday && ss.length) html += programCard(nextPlanDay());
  if (isToday) html += `<p class="glabel">${t('recTitle')}</p>` + recoveryPanel(Date.now(), {short: true});

  // corpo del giorno
  const bd = bodyOf(day), bw = bodyWeight(), ph = photos.filter(p => p.date === day);
  html += `<p class="glabel">${t('bodyCard')}</p><div class="dcard">`;
  if (bd && (bd.weight || bd.kcal || bd.protein)) {
    const lo = Math.round(bw * 1.6), hi = Math.round(bw * 2.2), pp = bd.protein && bw ? Math.min(1, bd.protein / lo) : 0;
    html += `<div class="dbody">${bd.weight ? `<div><b>${fmtKg(bd.weight)}</b><span>kg</span></div>` : ''}${bd.kcal ? `<div><b>${fmtInt(bd.kcal)}</b><span>kcal</span></div>` : ''}${bd.protein ? `<div><b>${fmtInt(bd.protein)}</b><span>${t('protein', '').trim()}</span></div>` : ''}</div>
      ${bd.protein && bw ? `<div class="meter"><i style="width:${pp * 100}%;${bd.protein >= lo ? 'background:var(--up)' : ''}"></i></div><p class="sub">${t('proteinGoal', lo, hi)}</p>` : ''}`;
  } else html += `<p class="sub">${t('noBodyDay')}</p>`;
  if (ph.length) html += `<div class="grid" style="padding:10px 0 0">${ph.map(p => `<button data-act="photo" data-id="${p.id}" aria-label="${esc(t('photoAria', poseName(p.pose), fmtShort(p.date)))}"><img src="${p.url}" alt=""><span>${poseName(p.pose)}</span></button>`).join('')}</div>`;
  html += `<button class="btn s wide" data-act="bodylog" data-d="${day}" style="margin-top:12px;background:var(--fill)">${icon('plus')} ${t('logBody')}</button></div>`;

  // settimana e obiettivi
  html += `<p class="glabel">${t('weekCard')}</p>` + streakCard();
  const close = goalList().filter(g => !g.done).map(g => [g, goalState(g).pct]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (close.length) html += `<p class="glabel">${t('goalsClose')}</p><div class="list">${close.map(([g]) => goalCard(g)).join('')}</div>`;

  // con un allenamento in corso il pulsante per riprenderlo resta a portata di pollice
  if (isToday && ss.length) html += `<div class="bar"><button class="btn p wide" data-act="open" data-sid="${ss[ss.length - 1].id}">${t('continueWorkout')}</button></div>`;
  return html;
}

// il programma dell'utente: tutti i giorni della scheda in uso, il prossimo in evidenza
function activePlan(np) {
  return np ? np.p : planList().find(p => p.own) || planList()[0] || null;
}
function programCard(np) {
  const p = activePlan(np);
  if (!p) return `<div class="dcard prog"><h3>${t('myProgram')}</h3><p class="sub" style="margin-top:4px">${t('programEmpty')}</p>
      <div class="opts" style="margin-top:12px"><button class="btn p" data-act="starterplan">${t('starterPlanBtn')}</button><button class="btn s" data-act="newplan" style="background:var(--fill)">${t('newPlan')}</button></div></div>`;
  const nextI = np && np.p === p ? np.i : p.days.findIndex(d => d.ex.length);
  const lastOf = i => [...db.sessions].filter(s => s.plan && s.plan.id === p.id && s.plan.day === i && s.exercises.some(e => e.sets.length)).sort((a, b) => b.date.localeCompare(a.date))[0];
  const rows = p.days.map((d, i) => {
    if (!d.ex.length) return '';
    const l = lastOf(i), nx = i === nextI;
    return `<button class="row${nx ? ' cur' : ''}" data-act="startday" data-id="${p.id}" data-i="${i}">
      <div class="grow"><h3>${esc(dayTitle(p, i))}</h3><div class="sub">${t('exN', d.ex.length)} · ${l ? t('lastDone', rel(l.date)) : t('neverDone')}</div></div>
      ${nx ? `<span class="tag pr" style="animation:none">${t('nextUp')}</span>` : `<span class="chev">${icon('chev')}</span>`}</button>`;
  }).join('');
  return `<div class="dcard prog"><div class="item"><h3>${t('myProgram')}</h3><button class="ib txt" data-act="plan" data-id="${p.id}">${t('edit')}</button></div>
    <p class="sub" style="margin:2px 0 10px">${esc(p.name)}${p.author && !p.own ? ' · ' + esc(t('planBy', p.author, p.role)) : ''}</p>
    ${rows ? `<div class="list">${rows}</div>` : `<p class="sub">${t('planEmptyDay')}</p>`}</div>`;
}
// scheda pronta per chi inizia: corpo intero in due giorni alternati, macchine e attrezzi semplici
const STARTER = [
  [['quads.legPress.incline45', 3, '10–12'], ['chest.chestPress.machine', 3, '10–12'], ['back.latPulldown.wideGrip', 3, '10–12'], ['hams.legCurl.seated', 2, '12–15'], ['core.plank.front', 3, '30–45 s']],
  [['quads.gobletSquat.dumbbell', 3, '10–12'], ['shoulders.machineShoulderPress.machine', 3, '10–12'], ['back.seatedCableRow.vHandle', 3, '10–12'], ['hams.gluteBridge.bodyweight', 3, '12–15'], ['core.deadBug.bodyweight', 2, '8–12']],
];
function starterPlan() {
  const p = {id: uid() + uid(), own: true, name: t('starterName'), author: nick(), role: t('roleDefault'), note: t('starterNote'), food: '', got: today(),
    days: STARTER.map((d, i) => ({name: t('starterDay', i + 1), ex: d.filter(([id]) => VAR[id]).map(([lib, sets, reps]) => ({lib, n: tx(VAR[lib].v.name), sets, reps, rest: restFor(reps), note: ''}))}))};
  plans()[p.id] = p; save(); toast(t('starterDone'));
  // dal tutorial si resta sulla stessa schermata: il resto della guida serve proprio a chi inizia
  if (!document.getElementById('tour').hidden) openTour(tourIndex()); else go({name: 'home', tab: 'today'});
}
// andamento compatto di un esercizio: forza stimata delle ultime sedute
function miniProgress(name) {
  const st = exStats(name).filter(x => x.date <= today()).slice(-8);
  if (st.length < 2) return '';
  const vs = st.map(x => x.e), lo = Math.min(...vs), hi = Math.max(...vs), W = 64, H = 22;
  const pts = vs.map((v, i) => `${(i * W / (vs.length - 1)).toFixed(1)},${(H - 3 - (hi > lo ? (v - lo) / (hi - lo) : .5) * (H - 6)).toFixed(1)}`).join(' ');
  const d = st[st.length - 1].e - st[0].e;
  return `<div class="mini"><svg viewBox="-2 0 ${W + 4} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>
    <span>${t('e1rmTitle')} <b>${fmtKg(st[st.length - 1].e)} kg</b> <em class="${d > 0 ? 'up' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${sign(d)} kg</em></span></div>`;
}

// ---------- home ----------
function home() {
  const tab = view.tab || 'today';
  if (tab === 'today') return todayView();
  const title = {sessions: t('tabWorkouts'), progress: t('tabProgress'), body: t('tabBody')}[tab];
  let html = `<header><div class="t"><h1>${title}</h1></div>
      <button class="ib" data-act="settings" aria-label="${t('settings')}">${icon('gear')}</button></header>`;
  if (tab === 'sessions') {
    const td = [...db.sessions].reverse().find(s => s.date === today());
    html += (td ? `<button class="today" data-act="open" data-sid="${td.id}"><div class="grow"><div class="sub">${t('continueToday')}</div><h3>${esc(td.name)}</h3></div><span class="chev">${icon('chev')}</span></button>` : '') +
      (doneSessions().length ? streakCard() : '') + plansSection() + sessionsList() +
      `<div class="bar"><button class="btn p wide" data-act="newsession">${icon('plus')} ${t('newSession')}</button></div>`;
  } else if (tab === 'progress') html += progressList();
  else html += bodyView() + `<div class="bar"><button class="btn p wide" data-act="bodylog">${icon('plus')} ${t('logBody')}</button></div>`;
  return html;
}
function sessionsList() {
  const list = [...db.sessions].sort((a, b) => b.date.localeCompare(a.date) || order(b) - order(a));
  if (!list.length) return `<div class="empty">${t('noSessions')}</div>`;
  return `<div class="list">` + list.map(s => {
    const n = s.exercises.reduce((a, e) => a + e.sets.length, 0), d = dt(s.date);
    return `<button class="row" data-act="open" data-sid="${s.id}">
      <div class="cal"><b>${d.getDate()}</b><span>${d.toLocaleDateString(locale, {month: 'short'})}</span></div>
      <div class="grow"><h3>${esc(s.name)}</h3><div class="sub">${t('sessMeta', s.exercises.length, n, rel(s.date))}</div></div>
      <span class="chev">${icon('chev')}</span></button>`;
  }).join('') + `</div>`;
}
function exerciseNames() {
  const m = new Map();
  [...db.sessions].sort((a, b) => a.date.localeCompare(b.date)).forEach(s => s.exercises.forEach(e => {
    if (e.sets.length) m.set(gk(e), {name: e.name, date: s.date});
  }));
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
}
// vista a settimane: righe = esercizi, colonne = settimane, celle = kg × ripetizioni
function weeksView() {
  const f = view.wf || '', pick = s => !f || key(s.name) === f;
  const ss = doneSessions().filter(pick);
  const seen = new Set(), sessNames = [...db.sessions].sort((a, b) => b.date.localeCompare(a.date))
    .map(s => s.name).filter(n => !seen.has(key(n)) && seen.add(key(n)));
  const chips = sessNames.length > 1 ? `<div class="hscroll">${[['', t('allSessions')], ...sessNames.map(n => [key(n), n])].map(([k, l]) =>
    `<button class="chip" data-act="wfilter" data-k="${esc(k)}" aria-pressed="${k === f}">${esc(l)}</button>`).join('')}</div>` : '';
  if (!ss.length) return chips + `<div class="empty">${t('weeksEmpty')}</div>`;
  const first = weekOf(ss.map(s => s.date).sort()[0]), cw = weekOf(today()), weeks = [];
  for (let w = first; w <= cw; w = addDays(w, 7)) weeks.push(w);
  // esercizi presenti nelle sedute filtrate, i più recenti in alto
  const exs = new Map();
  [...ss].sort((a, b) => a.date.localeCompare(b.date)).forEach(s => s.exercises.forEach(e => { if (e.sets.length) exs.set(gk(e), e.name); }));
  const rows = [...exs.entries()].reverse().map(([k, name]) => {
    let prevBest = 0;
    const cells = weeks.map(w => {
      const en = ss.filter(s => weekOf(s.date) === w).sort((a, b) => a.date.localeCompare(b.date))
        .flatMap(s => s.exercises.filter(e => gk(e) === k && e.sets.length).map(e => ({s, sets: e.sets})));
      if (!en.length) return `<td class="none">·</td>`;
      const all = en.flatMap(x => x.sets), best = Math.max(...all.map(e1rm)), bs = all.find(x => e1rm(x) === best);
      const cls = prevBest ? (best > prevBest + 1e-9 ? 'up' : best < prevBest - 1e-9 ? 'down' : 'eq') : 'eq';
      prevBest = best;
      const body = en.map(x => (en.length > 1 ? `<i>${dt(x.s.date).toLocaleDateString(locale, {weekday: 'short'})}</i>` : '') +
        x.sets.map(z => `<span${z === bs ? ' class="b"' : ''}>${fmtKg(z.kg)}×${z.reps}</span>`).join('')).join('<hr>');
      return `<td class="${cls}" data-act="open" data-sid="${en[en.length - 1].s.id}" tabindex="0">${body}</td>`;
    }).join('');
    return `<tr><th class="sticky" data-act="ex" data-name="${esc(name)}" tabindex="0">${esc(name)}</th>${cells}</tr>`;
  }).join('');
  return chips + `<p class="sub" style="margin:0 2px 8px">${t('weeksSub')}</p>
    <div class="wk-wrap" id="wk-wrap"><table class="wk"><thead><tr><th class="sticky"><span class="sub">${t('kgReps')}</span></th>${weeks.map(w =>
      `<th class="${w === cw ? 'cur' : ''}"><span>${w === cw ? t('thisWeek') : t('weekFrom')}</span><b>${fmtShort(w)}</b></th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="note" style="margin:8px 0 72px">${t('weeksLegend')}</p>`;
}
function progressList() {
  const seg = `<div class="seg" role="tablist"><button role="tab" aria-selected="${view.ptab !== 'weeks' && view.ptab !== 'friends'}" data-act="ptab" data-v="list">${t('progList')}</button>
    <button role="tab" aria-selected="${view.ptab === 'weeks'}" data-act="ptab" data-v="weeks">${t('progWeeks')}</button>
    <button role="tab" aria-selected="${view.ptab === 'friends'}" data-act="ptab" data-v="friends">${t('progFriends')}</button></div>`;
  if (view.ptab === 'weeks') return seg + weeksView();
  if (view.ptab === 'friends') return seg + friendsView();
  return seg + progressListBody();
}
function progressListBody() {
  const names = exerciseNames(), gl = goalList(), open = gl.filter(g => !g.done), done = gl.filter(g => g.done);
  let html = `<div class="sec"><h2>${t('goals')}</h2><button class="chip" data-act="newgoal">${icon('plus')} ${t('newBtn')}</button></div>` +
    (open.length ? `<div class="list">${open.map(g => goalCard(g)).join('')}</div>` : `<p class="sub" style="margin:0 2px 8px">${t('goalsEmpty')}</p>`) +
    (done.length ? `<div class="list" style="margin-top:10px">${done.slice(-3).reverse().map(g => goalCard(g)).join('')}</div>` : '');
  html += `<div class="sec"><h2>${t('exercises')}</h2></div>`;
  if (!names.length) html += `<div class="empty" style="padding:24px 12px">${t('exEmpty')}</div>`;
  else html += `<div class="list">` + names.map(x => {
    const st = exStats(x.name), l = st[st.length - 1], p = st[st.length - 2];
    return `<button class="row" data-act="ex" data-name="${esc(x.name)}">
      <div class="grow"><h3>${esc(x.name)}</h3><div class="sub">${t('exMeta', setTxt({reps: l.rt, kg: l.kg}), fmtKg(r05(Math.max(...st.map(z => z.e)))), st.length)}</div></div>
      <div class="tags">${p ? deltaTag(l, p, 'e', 'kg') : `<span class="sub">${t('firstSession')}</span>`}</div></button>`;
  }).join('') + `</div>`;
  return html + `<div class="gap"></div>` + badgeGrid();
}

// ---------- corpo: peso, alimentazione, foto ----------
const POSES = ['front', 'side', 'back'];
const poseName = k => t(k === 'back' ? 'backPose' : k);
function weightAt(date) {
  let best = null;
  body().filter(b => b.weight > 0).forEach(b => { if (!best || Math.abs(daysBetween(b.date, date)) < Math.abs(daysBetween(best.date, date))) best = b; });
  return best && Math.abs(daysBetween(best.date, date)) <= 7 ? best.weight : null;
}
function bodyView() {
  const b = body(), w = b.filter(x => x.weight > 0), food = b.filter(x => x.kcal > 0 || x.protein > 0);
  let html = '';
  if (w.length) {
    const l = w[w.length - 1], f = w[0];
    html += `<div class="hero"><div class="sub">${t('bodyWeight')} · ${rel(l.date)}</div>
      <div class="big">${fmtKg(l.weight)} <small>kg</small></div>
      <div class="deltas">${w.length > 1 ? `<span>${t('deltaDays', sign(Math.round((l.weight - f.weight) * 10) / 10), daysBetween(f.date, l.date))}</span>` +
        `<span>${t('deltaLast', sign(Math.round((l.weight - w[w.length - 2].weight) * 10) / 10))}</span>` : `<span>${t('firstWeigh')}</span>`}</div></div>`;
    const bg = goalList().find(g => g.type === 'body' && !g.done), fb = fcBody();
    if (w.length > 1) html += `<div class="panel-c"><div class="hd"><div><h2>${t('weightTime')}</h2><p class="sub">${t('weightTimeSub')}</p></div>
      <button class="chip" data-act="newgoal" data-t="body">${bg ? t('goalBtn') : t('addGoalBtn')}</button></div>
      ${fb.why ? lineChart(w.slice(-20).map(x => ({d: x.date, v: x.weight, dir: 'eq'})), 'kg') : forecastChart(fb, bg ? bg.weight : 0, bg ? `${fmtKg(bg.weight)} kg` : '')}
      <p class="note">${fb.why ? fb.why : t('trendBody', sign(Math.round(fb.b * 7 * 10) / 10), fmt1(fb.at(daysBetween(fb.d0, fb.last) + 42)))}
      ${bg ? `<br><b>${t('goalWLabel', fmtKg(bg.weight))}</b> ${goalState(bg).eta}` : ''}</p></div>`;
  }
  if (food.length) {
    const last7 = food.filter(x => daysBetween(x.date, today()) < 7);
    const avg = f => { const v = last7.filter(x => x[f] > 0); return v.length ? v.reduce((a, x) => a + x[f], 0) / v.length : 0; };
    const kcal = avg('kcal'), prot = avg('protein'), lw = bodyWeight(), gkg = lw && prot ? prot / lw : 0;
    const advice = !gkg ? (prot ? t('protNeedW') : '') : gkg < 1.6 ? t('protLow', Math.round(lw * 1.6), Math.round(lw * 2.2)) : gkg <= 2.2 ? t('protOk') : t('protHigh');
    const kc = food.filter(x => x.kcal > 0).slice(-14);
    html += `<div class="panel-c"><h2>${t('nutrition')}</h2><p class="sub">${t('avg7')}</p>
      <div class="deltas" style="padding:10px 4px 4px">${kcal ? `<span>${fmtInt(kcal)} kcal</span>` : ''}${prot ? `<span>${t('protein', Math.round(prot))}${gkg ? ` · ${fmt1(gkg)} g/kg` : ''}</span>` : ''}${!last7.length ? `<span>${t('noDataWeek')}</span>` : ''}</div>
      ${advice ? `<p class="note" style="padding-top:6px">${advice}</p>` : ''}
      ${kc.length > 1 ? barChart(kc.map(x => ({d: x.date, v: x.kcal, dir: 'n'})), 'kcal') : ''}</div>`;
  }
  if (!b.length && !photos.length) html = `<div class="empty">${t('bodyEmpty')}</div>`;
  const tips = planList().filter(p => p.food);
  if (tips.length) html += tips.map(p => `<div class="panel-c"><h2>${esc(t('coachTips', p.author || p.name))}</h2><p class="sub">${esc(p.name)}</p><div class="gap"></div>${bubble(p.author || p.name, p.food)}</div>`).join('');
  return html + photoPanel();
}
function photoPanel() {
  const cmp = POSES.map(k => {
    const ps = photos.filter(p => p.pose === k);
    return ps.length > 1 ? `<button class="row" data-act="compare" data-pose="${k}"><div class="grow"><h3>${t('compare', poseName(k).toLowerCase())}</h3>
      <div class="sub">${fmtShort(ps[0].date)} → ${fmtShort(ps[ps.length - 1].date)}</div></div><span class="chev">${icon('chev')}</span></button>` : '';
  }).join('');
  const recent = photos.slice(-9).reverse();
  return `<div class="panel-c"><h2>${t('photos')}</h2><p class="sub">${t('photosSub')}</p>
    <div class="chips" style="padding:12px 4px 6px">${POSES.map(k => `<button class="chip" data-act="addphoto" data-pose="${k}">${icon('plus')} ${poseName(k)}</button>`).join('')}</div>
    <input type="file" id="photo-in" accept="image/*" hidden>
    ${cmp ? `<div class="list" style="margin:8px 0">${cmp}</div>` : ''}
    ${recent.length ? `<div class="grid">${recent.map(p => `<button data-act="photo" data-id="${p.id}" aria-label="${esc(t('photoAria', poseName(p.pose), fmtShort(p.date)))}">
      <img src="${p.url}" alt=""><span>${fmtShort(p.date)}</span></button>`).join('')}</div>` : ''}</div>`;
}
function shrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const m = 1280, k = Math.min(1, m / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => b ? res(b) : rej(), 'image/jpeg', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(); };
    img.src = u;
  });
}
function addPhoto(pose) {
  const inp = document.getElementById('photo-in');
  inp.onchange = () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    shrink(f).then(blob => photoTx('readwrite', st => st.put({id: uid(), date: today(), pose, blob})))
      .then(() => { backupFile = null; return loadPhotos(); })
      .then(() => { if (!celebrate()) toast(t('photoSaved', poseName(pose).toLowerCase())); })
      .catch(() => alert(t('photoFail')));
  };
  inp.click();
}

// ---------- seduta ----------
function sessionView() {
  const s = sess(view.id);
  const open = s.exercises.some(e => e.id === view.open) ? view.open : (s.exercises[s.exercises.length - 1] || {}).id;
  return `<header>
      <button class="ib" data-act="home" aria-label="${t('back')}">${icon('back')}</button>
      <div class="t small"><h1>${esc(s.name)}</h1><p>${fmtDate(s.date)}</p></div>
      ${s.exercises.some(e => e.sets.length) ? `<button class="ib" data-act="share" data-k="session" data-a="${s.id}" aria-label="${t('shareSession')}">${icon('share')}</button>` : ''}
      <button class="ib txt" data-act="editsession">${t('edit')}</button>
    </header>` + recoveryLine(s.date === today() ? Date.now() : Math.max(...s.exercises.flatMap(e => e.sets.map(z => setTime(s, z))), dt(s.date).getTime())) +
    (s.exercises.length ? s.exercises.map(e => e.id === open ? exOpen(s, e) : exClosed(s, e)).join('') : `<div class="empty">${t('emptySession')}</div>`) +
    `<div class="bar two"><button class="btn s" data-act="addex">${icon('plus')} ${t('exerciseBtn')}</button>
      <button class="btn s" data-act="summary" ${s.exercises.some(e => e.sets.length) ? '' : 'disabled'}>${t('finish')}</button></div>`;
}
function exClosed(s, e) {
  const prev = prevFor(s, e), b = bestSet(e.sets);
  const sum = e.sets.length ? t('sumDone', e.sets.length, setTxt(b) + ' kg') : prev ? t('todoLast', prev.sets.length) : t('todo');
  return `<section class="ex closed"><div class="ex-head">
      <h2>${esc(e.name)}</h2>
      <button class="ib" data-act="toggle" data-eid="${e.id}" aria-label="${esc(t('openX', e.name))}">${icon('down')}</button></div>
      <div class="ex-body sum" data-act="toggle" data-eid="${e.id}">${e.target && !e.sets.length ? `<b>${exLine(e.target)}</b> · ` : ''}${sum}${miniProgress(e.name)}</div></section>`;
}
function exOpen(s, e) {
  const prior = priorOf(s, e), prev = prior[prior.length - 1];
  let best = Math.max(0, ...prior.flatMap(x => x.sets.map(e1rm)));
  const rows = e.sets.map((x, i) => {
    const v = e1rm(x), ref = prev && prev.sets[i];
    let tag = '';
    if (best > 0 && v > best + 1e-9) tag = `<span class="tag pr">${t('record')}</span>`;
    else if (ref && v > e1rm(ref) + 1e-9) tag = `<span class="tag up" aria-label="${t('betterAria')}">▲ ${setTxt(ref)}</span>`;
    else if (ref) tag = `<span class="tag eq">${t('vs')} ${setTxt(ref)}</span>`;
    best = Math.max(best, v);
    return `<li><button class="setrow" data-act="editset" data-eid="${e.id}" data-i="${i}" aria-label="${esc(t('setAria', i + 1, x.reps, fmtKg(x.kg)))}">
      <span class="n">${i + 1}</span><span class="f">${x.reps} <small>${t('repsShort')} ×</small> ${fmtKg(x.kg)} <small>kg</small></span>${tag}</button></li>`;
  }).join('');
  const i = e.sets.length, d = draftFor(s, e);
  const ps = prev && (prev.sets[i] || (!i && prev.sets[prev.sets.length - 1]));
  const goal = ps ? `<div class="goal"><span class="sub">${t('goalHint', i + 1, setTxt(ps) + ' kg')}</span>` +
    suggest(ps).map(g => `<button class="chip" data-act="goal" data-eid="${e.id}" data-reps="${g.reps}" data-kg="${g.kg}"
      aria-pressed="${+d.reps === g.reps && num(d.kg) === g.kg}">${setTxt(g)} kg</button>`).join('') + `</div>` : '';
  return `<section class="ex" id="ex-${e.id}"><div class="ex-head">
      <h2>${esc(e.name)}</h2>
      <button class="ib" data-act="ex" data-name="${esc(e.name)}" aria-label="${esc(t('progressX', e.name))}">${icon('chart')}</button>
      <button class="ib" data-act="exmenu" data-eid="${e.id}" aria-label="${esc(t('optionsX', e.name))}">${icon('more')}</button></div>
    <div class="ex-body">
      ${e.target ? `<p class="ptarget"><b>${t('planTarget')}:</b> ${exLine(e.target)}${e.target.note ? `<br>${e.target.by ? esc(e.target.by) + ': ' : ''}${esc(e.target.note)}` : ''}</p>` : ''}
      ${miniProgress(e.name)}
      <p class="last">${prev ? t('lastTime', fmtShort(prev.date), prev.sets.map(setTxt).join(' · ')) : e.target ? '' : t('firstTime')}</p>
      ${rows ? `<ol class="sets">${rows}</ol>` : ''}
      ${goal}${stepper(e.id)}
      <div class="err" id="err-${e.id}" aria-live="polite"></div>
      <button class="btn p wide" data-act="addset" data-eid="${e.id}">${t('logSet', i + 1)}</button>
    </div></section>`;
}
function stepper(eid) {
  const d = drafts[eid];
  const one = (f, val, u, mode, label) => `<div class="step">
      <button data-act="step" data-eid="${eid}" data-f="${f}" data-d="-1" aria-label="${t('less', label)}">${icon('minus')}</button>
      <label><input id="${f}-${eid}" data-eid="${eid}" data-f="${f}" type="text" inputmode="${mode}" autocomplete="off" value="${val === '' ? '' : f === 'kg' ? fmtKg(val) : val}" placeholder="–" aria-label="${label}"><span class="u">${u}</span></label>
      <button data-act="step" data-eid="${eid}" data-f="${f}" data-d="1" aria-label="${t('more', label)}">${icon('plus')}</button></div>`;
  return `<div class="entry" id="entry-${eid}">${one('reps', d.reps, t('repsShort'), 'numeric', t('reps'))}${one('kg', d.kg, 'kg', 'decimal', t('kgWord'))}</div>`;
}

// ---------- progressi esercizio ----------
function exView() {
  const st = exStats(view.ex), named = exerciseNames().find(x => gk(x) === gk({name: view.ex})), name = named ? named.name : view.ex;
  const f = st[0], l = st[st.length - 1], p = st[st.length - 2];
  const rec = st.reduce((a, x) => x.e >= a.e ? x : a, st[0]);
  const isLive = x => x.date === today(), rs = t('repsShort');
  const panel = (title, sub, field, u, chart) => {
    const dd = dir(l[field], f[field]);
    return `<div class="panel-c"><div class="hd"><div><h2>${title}</h2><p class="sub">${sub}</p></div>
      <div class="tags">${p ? deltaTag(l, p, field, u) : ''}</div></div>${chart}
      ${st.length > 1 ? `<p class="note">${t('fromStart')} ${fmtKg(f[field])} → ${fmtKg(l[field])} ${u} (<b class="${dd === 'up' ? 'up' : ''}" style="${dd === 'down' ? 'color:var(--danger)' : ''}">${sign(l[field] - f[field])} ${u}</b>)</p>` : ''}</div>`;
  };
  return `<header>
      <button class="ib" data-act="back" aria-label="${t('back')}">${icon('back')}</button>
      <div class="t small"><h1>${esc(name)}</h1><p>${t('sinceN', st.length, fmtShort(f.date))}</p></div>
      <button class="ib" data-act="share" data-k="progress" data-a="${esc(name)}" aria-label="${t('shareProgress')}">${icon('share')}</button></header>
    ${panel(t('e1rmTitle'), t('e1rmSub'), 'e', 'kg',
      lineChart(st.map(x => ({d: x.date, v: x.e, dir: x.pr ? 'up' : 'eq', live: isLive(x)})), 'kg'))}
    ${panel(t('weight'), t('weightSub'), 'kg', 'kg',
      lineChart(st.map((x, i) => ({d: x.date, v: x.kg, dir: i && x.kg > st[i - 1].kg ? 'up' : 'eq', live: isLive(x)})), 'kg'))}
    ${panel(t('repsTopTitle'), t('repsTopSub'), 'rt', rs,
      barChart(st.map((x, i) => ({d: x.date, v: x.rt, dir: i && x.kg === st[i - 1].kg && x.rt > st[i - 1].rt ? 'up' : 'eq', live: isLive(x)})), rs))}
    ${forecastPanel(name, st)}
    ${levelPanel(name)}
    ${(() => { const L = libFor({name}); return L ? `<div class="panel-c"><h2>${t('primaryM')}</h2><p class="sub">${esc(muscleTxt(L.b.pri))}${L.b.sec.length ? ' · ' + esc(muscleTxt(L.b.sec)) : ''}</p><div class="mm-wrap">${muscleMap(L.b.pri, L.b.sec)}</div>
      <button class="btn s wide" data-act="libguide" data-id="${L.b.id}" data-v="${L.v ? L.v.id : '-'}" style="background:var(--fill)">${t('guide')}</button><div class="gap"></div></div>` : ''; })()}
    <div class="hero">
      <div class="sub">${t('bestSet')}</div>
      <div class="big">${setTxt(rec.b)} <small>kg · ${fmtShort(rec.date)}</small></div>
      <p class="note" style="padding:0">${t('recordNote', fmtKg(rec.e))}</p>
    </div>
    <div class="hist">${[...st].reverse().map((x, i, a) => {
      const pr = a[i + 1];
      return `<div><b>${fmtShort(x.date)}</b><span>${x.sets.map(z => `<i>${setTxt(z)}</i>`).join(' · ')}</span><span class="tags">${x.pr ? `<span class="tag pr">${t('record')}</span>` : ''}${deltaTag(x, pr, 'e', 'kg')}</span></div>`;
    }).join('')}</div>
    <p class="note" style="margin-top:10px">${t('legend')}${st.some(isLive) ? ' ' + t('legendLive') : ''}</p>`;
}
function levelPanel(name) {
  const lv = levelOf(name), names = t('levels');
  if (!lv.std) return '';
  if (!profileOk()) return `<div class="panel-c"><h2>${t('levelTitle')}</h2><p class="note" style="padding-top:8px">${t('profileNeeded')}</p>
    <button class="btn s wide" data-act="profile" style="background:var(--fill)">${t('completeProfile')}</button><div class="gap"></div></div>`;
  return `<div class="panel-c"><div class="hd"><div><h2>${t('levelTitle')}</h2><p class="sub">${t('xBW', fmtKg(Math.round(lv.ratio * 100) / 100))}</p></div>
    <span class="tag pr" style="animation:none">${names[lv.i]}</span></div>
    <div class="levels">${names.map((_, i) => `<i class="${i <= lv.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="levels-l">${names.map((n, i) => i === lv.i ? `<b>${n}</b>` : `<span>${n}</span>`).join('')}</div>
    <p class="note" style="padding-top:10px">${lv.next ? t('nextLevel', names[lv.i + 1], fmtKg(r05(lv.next))) : t('topLevel')}</p></div>`;
}
function scale(vs, zero) {
  let lo = zero ? 0 : Math.min(...vs), hi = Math.max(...vs);
  const pad = (hi - lo || hi || 1) * .18;
  if (!zero) lo -= pad; hi += pad;
  return v => (v - lo) / (hi - lo || 1);
}
function xLabels(pts, X, H) {
  const n = pts.length, every = Math.ceil(n / 5);
  return pts.map((p, i) => (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every) ?
    `<text x="${X(i)}" y="${H - 4}" text-anchor="middle">${p.live ? t('today') : fmtAxis(p.d)}</text>` : '').join('');
}
const dcol = d => d === 'up' ? 'var(--up)' : d === 'down' ? 'var(--danger)' : 'var(--acc)';
function lineChart(pts, u) {
  const W = 340, H = 180, T = 24, B = 24, n = pts.length;
  const X = i => n === 1 ? W / 2 : 22 + i * (W - 44) / (n - 1);
  const s = scale(pts.map(p => p.v)), Y = v => T + (1 - s(v)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const area = n > 1 ? `<path d="${line}L${X(n - 1)},${H - B}L${X(0)},${H - B}Z" fill="var(--acc-soft)"/>` : '';
  const maxV = Math.max(...pts.map(p => p.v));
  const showV = (p, i) => n <= 6 || i === 0 || i === n - 1 || p.v === maxV;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmtKg(pts[0].v)} → ${fmtKg(pts[n - 1].v)} ${u}">
    <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
    ${area}<path d="${line}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="5.5" fill="${p.live ? 'var(--card)' : dcol(p.dir)}" stroke="${p.live ? dcol(p.dir) : 'var(--card)'}" stroke-width="2.5" ${p.live ? 'stroke-dasharray="3 2"' : ''}/>
      ${showV(p, i) ? `<text class="v" x="${X(i)}" y="${Y(p.v) - 11}" text-anchor="middle">${fmtKg(p.v)}</text>` : ''}`).join('')}
    ${xLabels(pts, X, H)}</svg>`;
}
function barChart(pts, u) {
  const W = 340, H = 160, T = 22, B = 24, n = pts.length, slot = (W - 20) / n, bw = Math.min(28, slot * .62);
  const X = i => 10 + slot * (i + .5);
  const s = scale(pts.map(p => p.v), true), Y = v => T + (1 - s(v)) * (H - T - B);
  const maxV = Math.max(...pts.map(p => p.v));
  const k = v => v >= 1000 ? fmt1(v / 1000) + 'k' : fmt1(v);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${k(pts[0].v)} → ${k(pts[n - 1].v)} ${u}">
    <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
    ${pts.map((p, i) => `<rect x="${X(i) - bw / 2}" y="${Y(p.v)}" width="${bw}" height="${Math.max(1, H - B - Y(p.v))}" rx="5"
      fill="${p.dir === 'n' ? 'var(--acc)' : i ? dcol(p.dir) : 'var(--sub)'}" fill-opacity="${i === n - 1 ? 1 : .55}" ${p.live ? 'stroke="currentColor" stroke-dasharray="3 2"' : ''}/>
      ${n <= 6 || i === n - 1 || p.v === maxV ? `<text class="v" x="${X(i)}" y="${Y(p.v) - 6}" text-anchor="middle">${k(p.v)}</text>` : ''}`).join('')}
    ${xLabels(pts, X, H)}</svg>`;
}
// grafico della previsione: storico, tendenza tratteggiata con fascia d'incertezza, linea dell'obiettivo
function forecastChart(fc, goalE, goalLabel) {
  const W = 340, H = 190, T = 22, B = 24, L = 14, R = 14, ahead = 42;
  const span = daysBetween(fc.d0, fc.last), xMax = span + ahead;
  const X = x => L + x / xMax * (W - L - R);
  const futY = fc.at(xMax), band = x => fc.sd * 1.5 + (x > span ? (x - span) / ahead * Math.max(fc.sd, Math.abs(fc.b) * 14) : 0);
  const vs = [...fc.pts.map(p => p.v), futY + band(xMax), futY - band(xMax), fc.now].concat(goalE ? [goalE] : []);
  const s = scale(vs), Y = v => T + (1 - s(v)) * (H - T - B);
  const hist = fc.pts.map((p, i) => `${i ? 'L' : 'M'}${X(daysBetween(fc.d0, p.d)).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const bandPath = `M${X(span)},${Y(fc.now + band(span))}L${X(xMax)},${Y(futY + band(xMax))}L${X(xMax)},${Y(futY - band(xMax))}L${X(span)},${Y(fc.now - band(span))}Z`;
  const gl = goalE ? `<line x1="${L}" x2="${W - R}" y1="${Y(goalE)}" y2="${Y(goalE)}" stroke="var(--up)" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${W - R}" y="${Y(goalE) - 6}" text-anchor="end" class="v" style="fill:var(--up)">${t('goalLine', goalLabel)}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${fmt1(fc.now)} → ~${fmt1(futY)} kg ${t('plus6')}">
    <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
    <path d="${bandPath}" fill="var(--acc-soft)"/>${gl}
    <path d="${hist}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="${X(span)}" y1="${Y(fc.now)}" x2="${X(xMax)}" y2="${Y(futY)}" stroke="var(--acc)" stroke-width="2.5" stroke-dasharray="2 5" stroke-linecap="round"/>
    ${fc.pts.map(p => `<circle cx="${X(daysBetween(fc.d0, p.d))}" cy="${Y(p.v)}" r="4" fill="var(--acc)" stroke="var(--card)" stroke-width="2"/>`).join('')}
    <text class="v" x="${X(xMax)}" y="${Y(futY) - 10}" text-anchor="end">~${fmt1(futY)}</text>
    <text x="${X(0)}" y="${H - 4}" text-anchor="start">${fmtAxis(fc.d0)}</text>
    <text x="${X(span)}" y="${H - 4}" text-anchor="middle">${fmtAxis(fc.last)}</text>
    <text x="${X(xMax)}" y="${H - 4}" text-anchor="end">${t('plus6')}</text></svg>`;
}
function forecastPanel(name, st) {
  const fc = fcEx(name), g = goalList().find(x => x.type === 'lift' && !x.done && key(x.ex) === key(name));
  const head = `<div class="panel-c"><div class="hd"><div><h2>${t('forecast')}</h2><p class="sub">${t('forecastSub')}</p></div>
    <button class="chip" data-act="newgoal" data-name="${esc(name)}">${g ? t('goalBtn') : t('addGoalBtn')}</button></div>`;
  if (fc.why) return head + `<p class="note" style="padding-top:10px">${fc.why} ${t('keepLogging')}</p></div>`;
  const reps = bestSet(st[st.length - 1].sets).reps, futE = fc.at(daysBetween(fc.d0, fc.last) + 42);
  const kgAt = Math.round(futE / (1 + reps / 30) / 2.5) * 2.5, perWeek = fc.b * 7;
  const msg = perWeek > .05 ? t('fcMsg', sign(Math.round(perWeek * 10) / 10), `${reps} × ${fmtKg(kgAt)} kg`) : t('fcFlat');
  const prof = profileOk() ? `<p class="note">${t('expected', fmt1(expectedPct(name)))}${fc.capped ? ' ' + t('capNote') : ''}</p>`
    : `<p class="note">${t('profileNeeded')}</p>`;
  const gt = g ? `<p class="note"><b>${esc(setTxt(g))} kg:</b> ${goalState(g).eta}</p>` : '';
  return head + forecastChart(fc, g ? e1rm(g) : 0, g ? `${setTxt(g)} kg` : '') + `<p class="note">${msg}</p>${gt}${prof}
    <p class="note">${t('fcNote', fc.pts.length)}</p></div>`;
}

// ---------- impostazioni ----------
function settingsView() {
  const p = profile(), ok = profileOk();
  return `<header><button class="ib" data-act="home" aria-label="${t('back')}">${icon('back')}</button>
      <div class="t small"><h1>${t('settings')}</h1></div></header>
    <p class="glabel">${t('profile')}</p>
    <div class="group"><button class="row" data-act="profile"><div class="grow"><h3>${t('profile')}</h3>
      <div class="sub">${ok ? t('profileSummary', t(p.sex === 'm' ? 'male' : 'female'), p.age, fmtKg(bodyWeight())) : t('profileMissing')}</div></div><span class="chev">${icon('chev')}</span></button>
    <button class="row" data-act="weekly"><div class="grow"><h3>${t('perWeek')}</h3><div class="sub">${weeklyTarget()}</div></div><span class="chev">${icon('chev')}</span></button></div>
    <p class="glabel">${t('language')}</p>
    <div class="opts">${LANGS.map(l => `<button class="chip" data-act="lang" data-l="${l}" aria-pressed="${l === lang}">${I18N[l]._name}</button>`).join('')}</div>
    <p class="glabel">${t('socialSettings')}</p>
    <div class="group"><button class="row" data-act="socialset"><div class="grow"><h3>${t('nickname')}</h3><div class="sub">${esc(nick()) || t('groupMissing')}</div></div><span class="chev">${icon('chev')}</span></button>
    <button class="row" data-act="socialset"><div class="grow"><h3>${t('groupLink')}</h3><div class="sub">${db.social && db.social.group ? 'chat.whatsapp.com' : t('groupMissing')}</div></div><span class="chev">${icon('chev')}</span></button></div>
    <p class="glabel">${t('restSetting')}</p>
    <div class="opts three">${[0, 60, 90, 120, 180, 240].map(v => `<button class="chip" data-act="restset" data-v="${v}" aria-pressed="${restDefault() === v}">${v ? mmss(v) : t('restOff')}</button>`).join('')}</div>
    <p class="note" style="padding:8px 4px 0">${t('restText')} ${t('restScreen')}</p>
    <p class="glabel">${t('theme')}</p>
    <div class="opts three">${['auto', 'light', 'dark'].map(k => `<button class="chip" data-act="theme" data-v="${k}" aria-pressed="${((db.settings && db.settings.theme) || 'auto') === k}">${t('theme' + k[0].toUpperCase() + k.slice(1))}</button>`).join('')}</div>
    <p class="glabel">${t('backup')}</p>
    <div class="group"><button class="row" data-act="backup"><div class="grow"><h3>${t('exportData')} · ${t('importData')}</h3><div class="sub">${t('backup')}</div></div><span class="chev">${icon('chev')}</span></button></div>
    <div class="gap"></div>
    <div class="group"><button class="row" data-act="tour"><div class="grow"><h3>${t('howItWorks')}</h3></div><span class="chev">${icon('chev')}</span></button>
    ${!standalone() && mobile() ? `<button class="row" data-act="install"><div class="grow"><h3>${t('installH')}</h3></div><span class="chev">${icon('chev')}</span></button>` : ''}</div>`;
}
function profileFields(p) {
  const w = bodyWeight();
  return `<div class="field">${t('sex')}<div class="opts">
      <button type="button" class="chip" data-act="sex" data-v="m" aria-pressed="${p.sex === 'm'}">${t('male')}</button>
      <button type="button" class="chip" data-act="sex" data-v="f" aria-pressed="${p.sex === 'f'}">${t('female')}</button></div></div>
    <input type="hidden" name="sex" value="${p.sex || ''}">
    <label class="field">${t('age')}<input name="age" inputmode="numeric" value="${p.age || ''}" autocomplete="off"></label>
    <label class="field">${t('bodyW')}<input name="w" inputmode="decimal" value="${w ? fmtKg(w) : ''}" autocomplete="off"></label>`;
}
function saveProfile(f) {
  const age = parseInt(f.age.value, 10), w = num(f.w.value), sex = f.sex.value;
  if ((f.age.value && !(age >= 14 && age <= 90)) || (f.w.value && !(w >= 30 && w <= 250))) { alert(t('invalidProfile')); return false; }
  db.profile = {...profile(), sex: sex || profile().sex, age: age || profile().age, weight: w || profile().weight};
  // il peso del profilo diventa anche una pesata di oggi, se è cambiato
  if (w && w !== lastWeight()) {
    const d = today(), cur = (db.body || []).find(x => x.date === d) || {};
    db.body = (db.body || []).filter(x => x.date !== d);
    db.body.push({kcal: 0, protein: 0, ...cur, date: d, weight: w});
  }
  save(); return true;
}

// ---------- fogli (bottom sheet) e avvisi ----------
function sheet(html) {
  const el = document.getElementById('sheet');
  el.innerHTML = `<div class="scrim" data-act="close"></div><div class="pane" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  el.hidden = false;
  const f = el.querySelector('[data-focus]'); if (f) f.focus();
  requestAnimationFrame(() => el.classList.add('on'));
}
function closeSheet() {
  const el = document.getElementById('sheet');
  if (el.hidden) return;
  el.classList.remove('on');
  setTimeout(() => { el.hidden = true; el.innerHTML = ''; }, 260);
}
let toastT;
function toast(msg, action, fn) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${msg}</span>${action ? `<button>${action}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('on'); fn(); };
  el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), action ? 8000 : 2600);
}
// eliminazione con possibilità di annullare
function undoable(msg, fn) {
  const snap = JSON.stringify(db);
  fn(); save(); render();
  toast(msg, t('undo'), () => { db = JSON.parse(snap); save(); render(); });
}

function sheetNewSession() {
  const seen = new Set(), past = [...db.sessions].sort((a, b) => b.date.localeCompare(a.date))
    .filter(s => s.exercises.length && !seen.has(key(s.name)) && seen.add(key(s.name))).slice(0, 6);
  // se c'è uno storico, ripetere è l'azione principale: niente tastiera aperta
  const pdays = planList().flatMap(p => p.days.map((d, i) => d.ex.length ? `<button class="row" data-act="startday" data-id="${p.id}" data-i="${i}"><span class="ava big">${esc((p.author || p.name).trim().charAt(0).toUpperCase())}</span>
    <div class="grow"><h3>${esc(dayTitle(p, i))}</h3><div class="sub">${esc(p.name)}${p.author ? ' · ' + esc(t('planBy', p.author, '')) : ''}</div></div></button>` : '')).filter(Boolean);
  sheet(`<h2>${t('newSession')}</h2>
    ${pdays.length ? `<p class="sub h" style="margin-top:0">${t('fromPlan')}</p><div class="list">${pdays.join('')}</div><p class="sub h">${t('orRepeat')}</p>` : ''}
    ${past.length ? `<div class="list">${past.map(s => `
      <button class="row" data-act="repeat" data-sid="${s.id}"><div class="grow"><h3>${esc(s.name)}</h3>
      <div class="sub">${s.exercises.map(e => esc(e.name)).join(', ')}</div></div><span class="sub">${fmtShort(s.date)}</span></button>`).join('')}</div>
      <p class="sub h">${t('orNew')}</p>` : ''}
    <form data-form="newsession"><label class="field">${t('name')}<input name="n" maxlength="60" ${past.length ? '' : 'data-focus'} placeholder="${esc(t('sessionPh'))}" autocomplete="off" enterkeyhint="done"></label>
    <button class="btn p wide">${t('createSession')}</button></form>`);
}

// ---------- libreria esercizi (lib/data.js) ----------
const LIB = window.EXDATA || [];
const VAR = {};
LIB.forEach(b => b.variants.forEach(v => { VAR[v.id] = {b, v}; }));
const BASE = Object.fromEntries(LIB.map(b => [b.id, b]));
const LBL = () => EXLIB.labels[lang] || EXLIB.labels.en;
const tx = o => o ? (o[lang] || o.en || '') : '';
const norm = x => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const libState = {g: EXLIB.groups[0], q: ''};
// collega un esercizio alla libreria: id salvato, altrimenti per nome in qualsiasi lingua
function libFor(e) {
  if (e.lib && VAR[e.lib]) return VAR[e.lib];
  const k = norm(e.name);
  for (const id in VAR) if (Object.values(VAR[id].v.name).some(n => norm(n) === k)) return VAR[id];
  const b = LIB.find(x => Object.values(x.name).some(n => norm(n) === k));
  return b ? {b, v: null} : null;
}
const muscleTxt = ks => ks.map(m => LBL().muscles[m] || m).join(', ');
function libList(s) {
  const have = new Set(s.exercises.map(e => key(e.name))), q = norm(libState.q);
  const vrow = (b, v) => {
    const inS = have.has(key(tx(v.name)));
    return `<button class="row" data-act="libadd" data-id="${v.id}" ${inS ? 'disabled' : ''}><div class="grow"><h3>${esc(tx(v.name))}</h3>
      <div class="sub">${LBL().eq[v.eq] || v.eq} · ${muscleTxt(b.pri)}${inS ? ' · ' + t('inSession') : ''}</div></div><span class="addic">${icon('plus')}</span></button>`;
  };
  if (q) {
    const hits = [];
    LIB.forEach(b => b.variants.forEach(v => {
      const hay = norm([tx(v.name), tx(b.name), LBL().eq[v.eq], LBL().groups[b.g], muscleTxt(b.pri), muscleTxt(b.sec)].join(' '));
      if (q.split(/\s+/).every(w => hay.includes(w))) hits.push(vrow(b, v));
    }));
    return hits.length ? hits.slice(0, 60).join('') : `<p class="sub" style="padding:8px 2px">${t('noResults')}</p>`;
  }
  return LIB.filter(b => b.g === libState.g).map(b => `<button class="row" data-act="libbase" data-id="${b.id}"><div class="grow"><h3>${esc(tx(b.name))}</h3>
    <div class="sub">${muscleTxt(b.pri)} · ${t('variantsN', b.variants.length)}</div></div><span class="chev">${icon('chev')}</span></button>`).join('');
}
// esercizi già presenti dove si sta aggiungendo: seduta o giorno della scheda
const libCtx = () => { const tg = libState.target; return tg ? {exercises: plans()[tg.plan].days[tg.day].ex.map(x => ({name: nameFor(x)}))} : sess(view.id); };
function sheetAddExercise() {
  const s = libCtx(), have = new Set(s.exercises.map(e => key(e.name)));
  const known = exerciseNames().filter(x => !have.has(key(x.name)));
  sheet(`<h2>${t('addExercise')}</h2>
    <label class="field"><input id="lib-q" type="search" placeholder="${esc(t('searchEx'))}" value="${esc(libState.q)}" autocomplete="off" enterkeyhint="search"></label>
    ${known.length ? `<p class="sub h">${t('yourExercises')}</p><div class="chips">${known.slice(0, 12).map(x => `<button class="chip" data-act="pickex" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${LIB.length ? `<p class="sub h">${t('library')}</p>
    <div class="hscroll" role="tablist">${EXLIB.groups.filter(g => LIB.some(b => b.g === g)).map(g => `<button class="chip" role="tab" data-act="libgroup" data-g="${g}" aria-pressed="${g === libState.g}">${LBL().groups[g]}</button>`).join('')}</div>
    <div class="list" id="lib-list">${libList(s)}</div>` : ''}
    <p class="sub h">${t('customEx')}</p>
    <form data-form="addex"><label class="field">${t('exName')}<input name="n" maxlength="60" placeholder="${esc(t('exPh'))}" autocomplete="off" enterkeyhint="done"></label>
    <button class="btn p wide">${t('add')}</button></form>`);
  const q = document.getElementById('lib-q');
  q.oninput = () => { libState.q = q.value; const l = document.getElementById('lib-list'); if (l) l.innerHTML = libList(s);
    document.querySelector('.hscroll').hidden = !!q.value.trim(); };
  document.querySelector('.hscroll') && (document.querySelector('.hscroll').hidden = !!libState.q.trim());
}

// ---------- recupero muscolare ----------
// Stima, non misura. Fasce di tempo dalla letteratura: sintesi proteica alta ~24 h e quasi normale a ~36 h
// (MacDougall 1995); multiarticolari pesanti 48–72 h; il cedimento aggiunge 24–48 h (Morán-Navarro 2017).
// [gruppo, muscoli della libreria, ore di base, lato della figura]
const RG = [
  ['chest', ['chest', 'upperChest'], 72, 'f'], ['shoulders', ['frontDelt', 'sideDelt', 'rearDelt'], 48, 'f'],
  ['triceps', ['triceps'], 48, 'b'], ['biceps', ['biceps', 'brachialis'], 48, 'f'], ['forearms', ['forearms'], 36, 'f'],
  ['lats', ['lats'], 60, 'b'], ['traps', ['traps', 'upperBack'], 48, 'b'], ['lowerBack', ['lowerBack'], 72, 'b'],
  ['abs', ['abs', 'obliques', 'hipFlexors'], 36, 'f'], ['quads', ['quads'], 72, 'f'], ['hams', ['hams'], 72, 'b'],
  ['glutes', ['glutes', 'abductors'], 72, 'b'], ['adductors', ['adductors'], 48, 'f'], ['calves', ['calves', 'tibialis'], 36, 'b'],
];
const M2G = Object.fromEntries(RG.flatMap(([g, ms]) => ms.map(m => [m, g])));
const setTime = (s, z) => z.at || dt(s.date).getTime() + 6 * 3600e3;  // serie senza orario: le 18 del giorno
// contributi di fatica per gruppo: {D0 = calo iniziale, T = ore per tornare al 100%, end = fine seduta}
function recoveryLoad(until) {
  const age = profile().age || 0, af = age > 55 ? 1.2 : age > 40 ? 1.1 : 1, best = {}, libs = new Map(), out = {};
  RG.forEach(([g]) => out[g] = []);
  [...db.sessions].sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b)).forEach(s => {
    const dose = {}, fail = {}, n = {}; let end = 0;
    s.exercises.forEach(e => {
      const lk = (e.lib || '') + '|' + key(e.name);
      if (!libs.has(lk)) libs.set(lk, libFor(e));
      const L = libs.get(lk), g = gk(e);
      e.sets.forEach(z => {
        const ts = setTime(s, z), E = best[g] || 0;
        best[g] = Math.max(E, e1rm(z));
        if (!L || ts > until) return;
        end = Math.max(end, ts);
        // ripetizioni rimaste "in canna": dalla forza stimata prima di questa serie (Epley invertita)
        const rir = z.kg > 0 && E ? 30 * (E / z.kg - 1) - z.reps : 2;
        const eff = rir <= 1 ? 1 : rir <= 3 ? .8 : rir <= 5 ? .6 : .4;
        // ogni gruppo conta una volta per serie (es. deltoide anteriore + laterale = spalle × 1)
        const gw = {};
        L.b.sec.forEach(m => { const k = M2G[m]; if (k) gw[k] = Math.max(gw[k] || 0, .5); });
        L.b.pri.forEach(m => { const k = M2G[m]; if (k) gw[k] = 1; });
        Object.entries(gw).forEach(([k, w]) => { dose[k] = (dose[k] || 0) + w * eff; n[k] = (n[k] || 0) + w; if (rir <= 1) fail[k] = (fail[k] || 0) + w; });
      });
    });
    RG.forEach(([g, , base]) => {
      const F = dose[g]; if (!F) return;
      const T = base * Math.min(1.4, Math.max(.6, .55 + .075 * F)) * (1 + .3 * (fail[g] || 0) / n[g]) * af;
      out[g].push({D0: Math.min(.8, .12 + .07 * F), T, end});
    });
  });
  return out;
}
function recAt(list, t) {
  const keep = list.reduce((a, c) => { const h = (t - c.end) / 3600e3; return h < 0 ? a : a * (1 - c.D0 * Math.pow(Math.max(0, 1 - h / c.T), 1.6)); }, 1);
  return keep;
}
// stato di ogni gruppo al momento t: % recuperata, ore per arrivare al 90%, allenato di recente
function recovery(t = Date.now()) {
  const load = recoveryLoad(t);
  return RG.map(([g, ms, , side]) => {
    const l = load[g], rec = Math.round(recAt(l, t) * 100);
    let h = 0; while (h < 240 && recAt(l, t + h * 3600e3) < .9) h++;
    const last = l.length ? l[l.length - 1].end : 0;
    return {g, ms, side, rec, h, worked: last && t - last < 7 * 86400e3 && rec < 95};
  });
}
const recCls = r => r < 50 ? 'r3' : r < 75 ? 'r2' : r < 100 ? 'r1' : '';
const recEta = h => !h ? t('recReady') : h < 24 ? t('recInH', h) : t('recInD', Math.floor(h / 24), h % 24);
// figura (fronte o retro) colorata per recupero; con only = muscoli da evidenziare (miniatura)
function bodyFig(side, clsOf, opts = {}) {
  const parts = side === 'b' ? MM_BACK : MM_FRONT, f = profile().sex === 'f';
  const half = Object.entries(parts).map(([k, d]) => `<g class="m ${clsOf(k)}">${d}</g>`).join('');
  const bd = f ? MM_BODY_F : MM_BODY;
  return `<svg class="mm ${opts.cls || ''}" viewBox="${opts.vb || '0 0 100 210'}" role="img" aria-label="${opts.label || ''}"><g class="mm-body">${bd}<g transform="translate(100 0) scale(-1 1)">${bd}</g></g>
    ${half}<g transform="translate(100 0) scale(-1 1)">${half}</g></svg>`;
}
const RG_VB = {chest: '18 24 64 50', shoulders: '14 24 72 50', triceps: '10 30 80 60', biceps: '10 36 80 54', forearms: '6 60 88 50', lats: '18 34 64 60',
  traps: '18 22 64 50', lowerBack: '24 62 52 44', abs: '22 50 56 56', quads: '20 92 60 64', hams: '20 104 60 52', glutes: '20 88 60 40', adductors: '20 96 60 50', calves: '20 140 60 50'};
function recoveryPanel(t0, opts = {}) {
  const st = recovery(t0), worked = st.filter(x => x.worked).sort((a, b) => a.rec - b.rec);
  const side = opts.side || view.recSide || (worked.length && worked.every(x => x.side === 'b') ? 'b' : 'f'), cls = {};
  st.forEach(x => x.ms.forEach(m => cls[m] = x.worked ? recCls(x.rec) : ''));
  const names = t('rgroups');
  const row = x => `<div class="rec-row"><span class="rec-th">${bodyFig(x.side, k => x.ms.includes(k) ? 'pri' : '', {vb: RG_VB[x.g]})}</span>
    <div class="grow"><div class="rec-top"><b>${names[x.g]}</b><em class="${recCls(x.rec)}">${x.rec}%</em></div><span>${recEta(x.h)}</span></div></div>`;
  const others = st.filter(x => !x.worked);
  return `<div class="panel-c rec"><div class="hd"><div><h2>${t('recTitle')}</h2><p class="sub">${opts.sub || t('recSub')}</p></div>
      ${worked.length ? `<button class="chip" data-act="recflip" data-side="${side === 'f' ? 'b' : 'f'}" aria-label="${t('recFlip')}">${icon('flip')} ${side === 'f' ? t('backPose') : t('front')}</button>` : ''}</div>
    <div class="rec-grid"><div class="rec-fig">${bodyFig(side, k => cls[k] || '', {label: t('recTitle')})}</div>
      <div class="rec-list">${worked.length ? worked.map(row).join('') : `<p class="sub">${t('recAll')}</p>`}
        ${worked.length && others.length ? `<p class="sub rec-more">${t('recOthers', others.map(x => lang === 'de' ? names[x.g] : names[x.g].toLowerCase()).slice(0, 4).join(', ') + (others.length > 4 ? '…' : ''))}</p>` : ''}</div></div>
    ${opts.short ? '' : `<p class="note">${t('recNote')} <a href="https://pubmed.ncbi.nlm.nih.gov/28965198/" target="_blank" rel="noopener">Morán-Navarro 2017</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/8563679/" target="_blank" rel="noopener">MacDougall 1995</a></p>`}</div>`;
}
// riga compatta in testa alla seduta
function recoveryLine(t0) {
  const w = recovery(t0).filter(x => x.worked).sort((a, b) => a.rec - b.rec), names = t('rgroups');
  return `<button class="recline" data-act="recovery" data-t="${t0}"><span class="sub">${t('recShort')}</span>
    <span class="grow">${w.length ? w.slice(0, 3).map(x => `${names[x.g]} <em class="${recCls(x.rec)}">${x.rec}%</em>`).join(' · ') : t('recAllShort')}</span><span class="chev">${icon('chev')}</span></button>`;
}
let recT = 0;
function sheetRecovery(t0) { recT = t0; sheet(`<h2 class="sr">${t('recTitle')}</h2>` + recoveryPanel(t0, {sub: t0 < Date.now() - 6e4 ? t('recAtEnd') : t('recSub')}).replace('panel-c rec', 'panel-c rec flat')); }

// ---------- mappa dei muscoli (fronte e retro) ----------
// metà sinistra di ogni figura, specchiata per la destra; chiavi = muscoli della libreria
const MM_BODY = `<circle cx="50" cy="16" r="10"/><path d="M45 25h10v7h-10z"/>
  <path d="M50 31c-9 0-17 2-21 6-3 3-4 8-4 13l-3 22-3 22c-1 4 0 7 2 7s3-2 4-6l4-20 2-14 2 18c-2 8-3 16-3 24l1 18-1 26c0 10 1 22 3 31 1 3 6 3 6 0l2-30 2-24 2-20h4z"/>`;
const MM_BODY_F = `<path d="M50 4c-8 0-12 6-12 13 0 6 1 12-1 17l6-3c-2-4-3-9-3-14 0-6 4-10 10-10z"/><circle cx="50" cy="16" r="9.5"/><path d="M45.5 25h9v7h-9z"/>
  <path d="M50 31c-8 0-15 2-19 6-3 3-3.5 8-3.5 13l-2.5 22-2.5 22c-1 4 0 7 2 7s3-2 4-6l3.5-20 1.5-13c1 4 1.5 9 1 14-3 7-5 14-5 23l1 20-1 24c0 10 1 22 3 31 1 3 6 3 6 0l2-30 2-24 2.5-20h4z"/>`;
const MM_FRONT = {
  traps: '<path d="M44 31l-9 6 9 2z"/>',
  sideDelt: '<ellipse cx="27.5" cy="43" rx="5" ry="7"/>',
  frontDelt: '<ellipse cx="32.5" cy="42" rx="5" ry="6.5"/>',
  chest: '<path d="M37 41c4-2 9-2 12-1v16c-4 2-9 2-12 0-2-3-2-11 0-15z"/>',
  upperChest: '<path d="M37 41c4-2 9-2 12-1v6c-4-1-8-1-12 1z"/>',
  biceps: '<ellipse cx="27" cy="61" rx="4.2" ry="9"/>',
  brachialis: '<ellipse cx="23.6" cy="66" rx="1.8" ry="4.5"/>',
  forearms: '<path d="M21 73c3-1 6 0 6 3l-2 18c-1 3-4 3-5 0l-1-14c0-3 0-6 2-7z"/>',
  abs: '<path d="M43 59h6.5v33h-5c-2-4-2-10-2-16z"/>',
  obliques: '<path d="M37 60l5 1v15c0 5 1 11 3 15l-4 2c-3-5-4-11-4-17z"/>',
  hipFlexors: '<path d="M42 93l6 2v9z"/>',
  abductors: '<ellipse cx="35" cy="102" rx="3" ry="6"/>',
  quads: '<path d="M38 104c4-3 8-2 10 1l-1 30c-1 6-6 8-9 4-2-6-3-20 0-35z"/>',
  adductors: '<path d="M47 104l2.5 2-1 22c-1-6-2-16-1.5-24z"/>',
  tibialis: '<path d="M39 152c2-1 4 0 4 2l-1 26c-1 2-2 2-3 0z"/>',
  calves: '<path d="M37 152l2 0-1 22c-2-4-2-15-1-22z"/>',
};
const MM_BACK = {
  traps: '<path d="M50 30l-14 8 10 4 4 18z"/>',
  sideDelt: '<ellipse cx="27.5" cy="43" rx="5" ry="7"/>',
  rearDelt: '<ellipse cx="32.5" cy="43" rx="5" ry="6.5"/>',
  upperBack: '<path d="M40 44l6 0 3 16-7-2z"/>',
  lats: '<path d="M37 49l5 9 7 4v14l-6 6c-4-6-6-16-6-33z"/>',
  lowerBack: '<path d="M44 80l5.5-3v17h-6z"/>',
  triceps: '<ellipse cx="26.5" cy="60" rx="4.6" ry="10"/>',
  forearms: '<path d="M21 73c3-1 6 0 6 3l-2 18c-1 3-4 3-5 0l-1-14c0-3 0-6 2-7z"/>',
  obliques: '<path d="M37 64l3 2c0 8 1 16 3 22l-4 2c-2-6-3-17-2-26z"/>',
  abductors: '<ellipse cx="37" cy="97" rx="3.5" ry="5"/>',
  glutes: '<path d="M38 99c4-4 9-4 11.5-2v15c-4 2-9 1-11-2-2-3-2-8-.5-11z"/>',
  hams: '<path d="M38 114c4-1 8-1 10 1l-1 24c-1 5-6 6-8 2-2-8-2-18-1-27z"/>',
  adductors: '<path d="M47.5 113l2 1-1 16c-1-5-1.5-11-1-17z"/>',
  calves: '<path d="M37 150c3-2 7-1 7 3l-1 16c-1 4-5 4-6 0-1-6-1-13 0-19z"/>',
};
function muscleMap(pri, sec) {
  const cls = k => pri.includes(k) ? 'm pri' : sec.includes(k) ? 'm sec' : 'm';
  const fig = (parts, x, label) => {
    const half = Object.entries(parts).map(([k, d]) => `<g class="${cls(k)}">${d}</g>`).join('');
    return `<g transform="translate(${x} 0)"><g class="mm-body">${MM_BODY}<g transform="translate(100 0) scale(-1 1)">${MM_BODY}</g></g>
      ${half}<g transform="translate(100 0) scale(-1 1)">${half}</g>
      <text x="50" y="216" text-anchor="middle">${label}</text></g>`;
  };
  return `<svg class="mm" viewBox="0 0 210 222" role="img" aria-label="${esc(muscleTxt(pri))}">${fig(MM_FRONT, 0, t('front'))}${fig(MM_BACK, 110, t('backPose'))}</svg>`;
}

// scheda di un movimento: a cosa serve, muscoli, esecuzione e varianti
function sheetLibBase(id, current) {
  const b = BASE[id], s = view.name === 'session' ? sess(view.id) : null, have = new Set(s ? s.exercises.map(e => key(e.name)) : []);
  const chips = (ks, cls) => ks.map(m => `<span class="mchip ${cls}">${LBL().muscles[m] || m}</span>`).join('');
  sheet(`<div class="item" style="justify-content:flex-start;gap:4px;margin:-6px 0 6px -10px">
      ${current ? '' : `<button class="ib" data-act="addex" data-keep="1" aria-label="${t('back')}">${icon('back')}</button>`}<h2 style="margin:0">${esc(tx(b.name))}</h2></div>
    <div class="chips"><span class="tag pr" style="animation:none">${LBL().lvl[b.lvl]}</span><span class="tag eq">${t('repsSuggested', b.reps)}</span></div>
    <div class="mm-wrap">${muscleMap(b.pri, b.sec)}</div>
    <p class="sub h">${t('whatFor')}</p><p>${esc(tx(b.why))}</p>
    <p class="sub h">${t('primaryM')}</p><div class="chips">${chips(b.pri, 'on')}</div>
    ${b.sec.length ? `<p class="sub h">${t('secondaryM')}</p><div class="chips">${chips(b.sec, '')}</div>` : ''}
    <p class="sub h">${t('howTo')}</p><p>${esc(tx(b.tip))}</p>
    <p class="sub h">${current ? t('allVariants') : t('chooseVariant')}</p>
    <div class="list">${b.variants.map(v => {
      const inS = have.has(key(tx(v.name))), cur = current === v.id;
      return `<button class="row${cur ? ' cur' : ''}" data-act="libadd" data-id="${v.id}" ${inS || current ? 'disabled' : ''}><div class="grow"><h3>${esc(tx(v.name))}</h3>
        <div class="sub">${LBL().eq[v.eq] || v.eq}${v.note ? ' · ' + esc(tx(v.note)) : ''}${inS ? ' · ' + t('inSession') : ''}</div></div>${current ? '' : `<span class="addic">${icon('plus')}</span>`}</button>`;
    }).join('')}</div>`);
}
function sheetEditSession() {
  const s = sess(view.id);
  sheet(`<h2>${t('editSession')}</h2>
    <form data-form="editsession"><label class="field">${t('name')}<input name="n" maxlength="60" value="${esc(s.name)}" autocomplete="off"></label>
    <label class="field">${t('date')}<input name="d" type="date" value="${s.date}"></label>
    <button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
    <button class="btn d wide" data-act="delsession">${t('delSession')}</button>`);
}
function sheetExMenu(eid) {
  const e = sess(view.id).exercises.find(x => x.id === eid);
  sheet(`<h2>${esc(e.name)}</h2>
    <form data-form="renameex" data-eid="${eid}"><label class="field">${t('name')}<input name="n" maxlength="60" value="${esc(e.name)}" autocomplete="off"></label>
    <p class="sub">${t('sameName')}</p>
    <button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
    ${libFor(e) ? `<button class="btn s wide" data-act="libinfo" data-eid="${eid}">${t('guide')}</button><div class="gap"></div>` : ''}
    <button class="btn d wide" data-act="delex" data-eid="${eid}">${t('delExercise')}</button>`);
}
function sheetEditSet(eid, i) {
  const x = sess(view.id).exercises.find(e => e.id === eid).sets[i];
  sheet(`<h2>${t('setN', i + 1)}</h2>
    <form data-form="editset" data-eid="${eid}" data-i="${i}">
      <label class="field">${t('repsTitle')}<input name="r" inputmode="numeric" value="${x.reps}" autocomplete="off"></label>
      <label class="field">${t('kg')}<input name="k" inputmode="decimal" value="${fmtKg(x.kg)}" autocomplete="off"></label>
      <button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
    <button class="btn d wide" data-act="delset" data-eid="${eid}" data-i="${i}">${t('delSet')}</button>`);
}
const toDataURL = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
// il file è preparato in anticipo: iOS apre il foglio Condividi solo subito dopo il tocco
function prepareBackup() {
  const name = `gym-backup-${today()}.json`;
  return Promise.all(photos.map(p => toDataURL(p.blob).then(data => ({id: p.id, date: p.date, pose: p.pose, data}))))
    .then(ph => backupFile = new File([JSON.stringify({...db, photos: ph})], name, {type: 'application/json'}));
}
function sheetBackup() {
  sheet(`<h2>${t('backup')}</h2>
    <p class="sub" style="margin-bottom:14px">${t('backupText')}</p>
    <button class="btn p wide" data-act="export" id="exp-btn" disabled>${t('preparing')}</button><div class="gap"></div>
    <button class="btn s wide" data-act="import">${t('importData')}</button>
    <input type="file" id="imp" accept=".json,application/json" hidden>`);
  document.getElementById('imp').onchange = e => importData(e.target);
  prepareBackup().then(f => { const b = document.getElementById('exp-btn');
    if (b) { b.disabled = false; b.textContent = t('exportSize', fmt1(Math.max(.1, f.size / 1e6))); } });
}
function exportData() {
  const file = backupFile;
  if (!file) return;
  if (navigator.canShare && navigator.canShare({files: [file]})) navigator.share({files: [file], title: file.name}).catch(() => {});
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
}
function importData(inp) {
  const f = inp.files[0]; inp.value = '';
  if (!f) return;
  f.text().then(txt => {
    let o;
    try { o = JSON.parse(txt); } catch (e) { throw t('importBadJson'); }
    if (!o || !Array.isArray(o.sessions)) throw t('importNoSessions');
    const had = o.sessions.length; o = clean(o);
    if (had && !o.sessions.length) throw t('importNoSessions');
    if (!confirm(t('importConfirm', o.sessions.length))) return;
    const ph = Array.isArray(o.photos) ? o.photos : []; delete o.photos;
    db = o; save(); setLang();
    return Promise.all(ph.map(p => fetch(p.data).then(r => r.blob()).then(blob => ({id: p.id, date: p.date, pose: p.pose, blob}))))
      .then(recs => photoTx('readwrite', st => { st.clear(); recs.forEach(r => st.put(r)); }))
      .then(loadPhotos).then(() => { backupFile = null; closeSheet(); go({name: 'home', tab: 'sessions'}); toast(t('importDone', o.sessions.length, ph.length)); });
  }).catch(m => alert(typeof m === 'string' ? m : t('importFail')));
}
function sheetPhoto(id) {
  const p = photos.find(x => x.id === id), w = weightAt(p.date);
  sheet(`<h2>${poseName(p.pose)} · ${fmtShort(p.date)}</h2>
    <img class="big-img" src="${p.url}" alt="">
    <p class="sub" style="margin:10px 0 6px">${fmtDate(p.date)}${w ? ` · ${t('weightOn', fmtKg(w))}` : ''}</p>
    <label class="field">${t('date')}<input id="ph-date" type="date" value="${p.date}" max="${today()}"></label><div class="gap"></div>
    <button class="btn d wide" data-act="delphoto" data-id="${id}">${t('delPhoto')}</button>`);
  document.getElementById('ph-date').onchange = ev => {
    const d = ev.target.value; if (!d || d > today()) return;
    photoTx('readwrite', st => st.put({id: p.id, date: d, pose: p.pose, blob: p.blob}))
      .then(() => { backupFile = null; return loadPhotos(); }).then(() => { closeSheet(); toast(t('saved')); }).catch(() => alert(t('photoFail')));
  };
}
function sheetCompare(pose) {
  const ps = photos.filter(p => p.pose === pose), a = ps[0], b = ps[ps.length - 1];
  const cap = p => { const w = weightAt(p.date); return `<figcaption><b>${fmtShort(p.date)}</b>${w ? ` · ${fmtKg(w)} kg` : ''}</figcaption>`; };
  sheet(`<h2>${t('compareTitle', poseName(pose).toLowerCase())}</h2>
    <div class="cmp"><figure id="cmp-a"><img src="${a.url}" alt="${t('before')}">${cap(a)}</figure><figure><img src="${b.url}" alt="${t('after')}">${cap(b)}</figure></div>
    ${ps.length > 2 ? `<label class="field" style="margin-top:12px">${t('compareWith')}<select id="cmp-sel">${ps.map((p, i) => `<option value="${i}">${fmtShort(p.date)}</option>`).join('')}</select></label>` : ''}
    <p class="note" style="padding:12px 0 0">${t('compareNote')}</p>
    <button class="btn s wide" data-act="share" data-k="compare" data-a="${pose}" style="margin-top:12px;background:var(--card)">${icon('share')} ${t('shareCompare')}</button>`);
  const sel = document.getElementById('cmp-sel');
  if (sel) sel.onchange = () => { const p = ps[+sel.value]; document.getElementById('cmp-a').innerHTML = `<img src="${p.url}" alt="${t('before')}">${cap(p)}`; };
}
function sheetBodyLog(day) {
  const d = day || today(), cur = (db.body || []).find(x => x.date === d) || {};
  const v = n => n > 0 ? fmtKg(n) : '';
  sheet(`<h2>${t('bodyTitle')}</h2>
    <form data-form="bodylog">
      <label class="field">${t('date')}<input name="d" type="date" value="${d}"></label>
      <label class="field">${t('bodyW')}<input name="w" inputmode="decimal" value="${v(cur.weight)}" placeholder="78${DEC}4" autocomplete="off" data-focus></label>
      <label class="field">${t('bodyK')}<input name="k" inputmode="numeric" value="${v(cur.kcal)}" placeholder="${t('optional')}" autocomplete="off"></label>
      <label class="field">${t('bodyP')}<input name="p" inputmode="numeric" value="${v(cur.protein)}" placeholder="${t('optional')}" autocomplete="off"></label>
      <p class="sub">${t('bodyHint')}</p>
      <button class="btn p wide">${t('save')}</button></form>`);
}
function sheetWeekly() {
  const tg = weeklyTarget();
  sheet(`<h2>${t('perWeek')}</h2><p class="sub" style="margin-bottom:12px">${t('perWeekText')}</p>
    <div class="chips">${[1, 2, 3, 4, 5, 6].map(n => `<button class="chip" data-act="setweekly" data-n="${n}" aria-pressed="${n === tg}">${n}</button>`).join('')}</div>`);
}
function sheetProfile() {
  sheet(`<h2>${t('profile')}</h2><p class="sub" style="margin-bottom:12px">${t('profileText')}</p>
    <form data-form="profile">${profileFields(profile())}<button class="btn p wide">${t('saveProfile')}</button></form>`);
}
function sheetGoal(name) {
  const names = exerciseNames(), sel = name || (names[0] && names[0].name) || '';
  const sugg = n => { const st = exStats(n), b = st.length ? bestSet(st[st.length - 1].sets) : null; return b ? {reps: b.reps, kg: b.kg + 5} : {reps: 8, kg: ''}; };
  const s0 = sel ? sugg(sel) : {reps: 8, kg: ''}, lw = lastWeight(), lift = names.length > 0;
  sheet(`<h2>${t('newGoal')}</h2>
    <div class="seg" role="tablist" style="margin-bottom:12px">
      <button role="tab" aria-selected="${lift}" data-act="goaltype" data-t="lift" ${lift ? '' : 'disabled'}>${t('typeLift')}</button>
      <button role="tab" aria-selected="${!lift}" data-act="goaltype" data-t="body">${t('typeBody')}</button></div>
    <form data-form="goal" data-t="${lift ? 'lift' : 'body'}">
      <div class="g-lift" ${lift ? '' : 'hidden'}>
        <label class="field">${t('typeLift')}<select name="ex">${names.map(x => `<option ${key(x.name) === key(sel) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="entry" style="margin-top:10px">
          <label class="field">${t('kg')}<input name="kg" inputmode="decimal" value="${s0.kg === '' ? '' : fmtKg(s0.kg)}" autocomplete="off"></label>
          <label class="field">${t('repsTitle')}<input name="reps" inputmode="numeric" value="${s0.reps}" autocomplete="off"></label></div>
        <p class="sub">${t('liftRule')}</p></div>
      <div class="g-body" ${lift ? 'hidden' : ''}>
        <label class="field">${t('targetW')}<input name="w" inputmode="decimal" placeholder="${lw ? t('nowW', fmtKg(lw)) : '80'}" autocomplete="off"></label>
        ${lw ? '' : `<p class="sub">${t('logWeightFirst')}</p>`}</div>
      <button class="btn p wide">${t('createGoal')}</button></form>`);
  const f = document.querySelector('[data-form=goal]');
  if (f.ex) f.ex.onchange = () => { const s = sugg(f.ex.value); f.kg.value = s.kg === '' ? '' : fmtKg(s.kg); f.reps.value = s.reps; };
}
function sheetGoalMenu(id) {
  const g = goalList().find(x => x.id === id);
  sheet(`<h2>${esc(goalState(g).title)}</h2>${goalCard(g, 'div')}
    <div class="gap"></div><button class="btn d wide" data-act="delgoal" data-id="${id}">${t('delGoal')}</button>`);
}
// riepilogo di fine seduta
function sheetSummary() {
  const s = sess(view.id);
  const sets = s.exercises.reduce((a, e) => a + e.sets.length, 0), v = s.exercises.reduce((a, e) => a + vol(e.sets), 0);
  const prevS = db.sessions.filter(x => x.id !== s.id && key(x.name) === key(s.name) && x.date <= s.date && x.exercises.some(e => e.sets.length))
    .sort((a, b) => a.date.localeCompare(b.date)).pop();
  const pv = prevS ? prevS.exercises.reduce((a, e) => a + vol(e.sets), 0) : 0;
  let improved = 0, compared = 0; const recs = [];
  s.exercises.forEach(e => {
    const prior = priorOf(s, e), prev = prior[prior.length - 1];
    let best = Math.max(0, ...prior.flatMap(x => x.sets.map(e1rm)));
    e.sets.forEach((x, i) => {
      const val = e1rm(x), ref = prev && prev.sets[i];
      if (best > 0 && val > best + 1e-9) recs.push(`${esc(e.name)} ${setTxt(x)} kg`);
      if (ref) { compared++; if (val > e1rm(ref) + 1e-9) improved++; }
      best = Math.max(best, val);
    });
  });
  const st = streak(), badgesToday = badgeList().filter(b => b.on && db.badges && db.badges[b.id] === today());
  const goalsToday = goalList().filter(g => g.done === today());
  const vd = pv ? Math.round((v - pv) / pv * 100) : null;
  sheet(`<h2>${t('sessionDone')}</h2>
    <div class="sumgrid">
      <div><b>${sets}</b><span>${t('sets')}</span></div>
      <div><b>${v >= 1000 ? fmt1(v / 1000) + ' t' : fmtInt(v) + ' kg'}</b><span>${t('volume')}${vd != null ? ` <em class="${vd > 0 ? 'up' : ''}">${vd > 0 ? '▲ +' : vd < 0 ? '▼ ' : '= '}${vd}%</em>` : ''}</span></div>
      <div><b>${recs.length}</b><span>${t('records')}</span></div>
      <div><b>${compared ? `${improved}/${compared}` : '–'}</b><span>${t('improved')}</span></div>
    </div>
    ${recs.length ? `<p class="sub h">${t('todayRecords')}</p><div class="chips">${recs.map(r => `<span class="tag pr">${r}</span>`).join('')}</div>` : ''}
    ${goalsToday.length ? `<p class="sub h">${t('goalsReached')}</p>${goalsToday.map(g => `<p>★ ${esc(goalState(g).title)}</p>`).join('')}` : ''}
    ${badgesToday.length ? `<p class="sub h">${t('badgesUnlocked')}</p><div class="badges">${badgesToday.map(b => `<div class="badge on"><span class="medal">${b.g}</span><b>${b.t}</b></div>`).join('')}</div>` : ''}
    ${recoveryPanel(Date.now(), {short: true})}
    <p class="sub h">${t('week')}</p><p>${t('weekStatus', st.week, st.t, st.n)}</p>
    <p class="note" style="padding:12px 0 0">${improved && compared ? t('beatNote', improved, compared) : ''}${t('nextNote')}</p>
    <div class="gap"></div><button class="btn s wide" data-act="share" data-k="session" data-a="${s.id}" style="background:var(--card)">${icon('share')} ${t('shareSession')}</button>
    <div class="gap"></div><button class="btn p wide" data-act="finish">${t('close')}</button>`);
}

// ---------- tutorial con swipe ----------
function tourSlides() {
  const bench = BENCH[lang], rs = t('repsShort');
  const mockStep = (v, u) => `<div class="step" style="height:56px"><button tabindex="-1">${icon('minus')}</button><label><input tabindex="-1" value="${v}" readonly style="font-size:24px"><span class="u">${u}</span></label><button tabindex="-1">${icon('plus')}</button></div>`;
  const demo = [{d: addDays(today(), -28), v: 70, dir: 'eq'}, {d: addDays(today(), -21), v: 70, dir: 'eq'}, {d: addDays(today(), -14), v: 72.5, dir: 'up'}, {d: addDays(today(), -7), v: 70, dir: 'down'}, {d: today(), v: 75, dir: 'up'}];
  return [
    [`<img class="logo-big" src="icons/icon-512.png" alt="">`, t('t1h'), t('t1p') +
      `<div class="chips">${LANGS.map(l => `<button class="chip" data-act="lang" data-l="${l}" aria-pressed="${l === lang}">${I18N[l]._name}</button>`).join('')}</div>`],
    ['', t('t7h'), t('t7p') + `<form data-form="profile" data-tour="1">${profileFields(profile())}<button class="btn s wide" style="background:var(--fill)">${t('saveProfile')}</button></form>`],
    [`<div class="mock"><div class="words"><div><b>3</b><span>${t('twSets')}</span></div><i>×</i><div><b>10</b><span>${t('twReps')}</span></div><i>·</i><div><b>20</b><span>kg</span></div></div>
      <p class="sub" style="text-align:center;margin-top:8px">${t('twEx')}</p></div>`, t('twH'), t('twP')],
    [`<div class="mock"><h4>${t('myProgram')}</h4><div class="row cur" style="margin-top:8px"><div class="grow"><h3>${t('starterDay', 1)}</h3><div class="sub">${t('exN', 5)}</div></div><span class="tag pr" style="animation:none">${t('nextUp')}</span></div>
      <div class="row" style="margin-top:6px"><div class="grow"><h3>${t('starterDay', 2)}</h3><div class="sub">${t('exN', 5)}</div></div></div></div>`, t('tpH'), t('tpP') +
      (planList().length ? '' : `<button class="btn s wide" data-act="starterplan" style="margin-top:12px;background:var(--fill)">${t('starterPlanBtn')}</button>`)],
    [`<div class="mock"><h4>${bench}</h4><div class="entry">${mockStep(8, t('repsShort'))}${mockStep(70, 'kg')}</div><div class="btn p wide">${t('logSet', 1)}</div></div>`, t('t2h'), t('t2p')],
    [`<div class="mock rec"><div class="rec-grid" style="grid-template-columns:40% 1fr;align-items:center">${bodyFig('f', k => k === 'chest' || k === 'upperChest' ? 'r3' : k === 'frontDelt' ? 'r2' : '')}
      <div class="rec-list"><div class="rec-row"><div class="grow"><b>${t('rgroups').chest}</b></div><em class="r3">35%</em></div><div class="rec-row"><div class="grow"><b>${t('rgroups').shoulders}</b></div><em class="r2">62%</em></div><div class="rec-row"><div class="grow"><b>${t('rgroups').quads}</b></div><em>100%</em></div></div></div></div>`, t('trH'), t('trP')],
    [`<div class="mock"><div class="words"><div><b>12</b><span>✓</span></div><div><b>12</b><span>✓</span></div><div><b>12</b><span>✓</span></div><i>→</i><div><b class="up">+2${DEC}5</b><span>kg</span></div></div></div>`, t('tsH'), t('tsP')],
    [`<div class="mock"><h4>${bench}</h4><p class="last">${t('lastTime', fmtShort(addDays(today(), -7)), `8 × 70 · 7 × 70`)}</p>
      <div class="setrow"><span class="n">1</span><span class="f">9 <small>${rs} ×</small> 70</span><span class="tag pr">${t('record')}</span></div>
      <div class="goal"><span class="chip" aria-pressed="true" style="display:inline-flex;align-items:center">8 × 70 kg</span><span class="chip" style="display:inline-flex;align-items:center">7 × 72${DEC}5 kg</span></div></div>`, t('t3h'), t('t3p')],
    [`<div class="mock" style="padding:10px">${lineChart(demo, 'kg')}</div>`, t('t4h'), t('t4p')],
    [`<div class="mock"><div class="dots" style="margin-bottom:10px"><i class="on"></i><i class="on"></i><i></i></div><div class="meter"><i style="width:68%"></i></div>
      <div class="badges" style="padding:6px 0 0"><div class="badge on"><span class="medal">10</span></div><div class="badge on"><span class="medal">PR</span></div><div class="badge"><span class="medal">★</span></div></div></div>`, t('t5h'), t('t5p')],
    [`<div class="mock"><div class="sub">${t('bodyWeight')}</div><div style="font-size:36px;font-weight:800">78${DEC}4 <small style="font-size:16px;color:var(--sub)">kg</small></div>
      <div class="chips" style="margin-top:10px"><span class="chip" style="display:inline-flex;align-items:center;gap:6px">${icon('camera')} ${t('front')}</span><span class="chip" style="display:inline-flex;align-items:center">${t('exportData')}</span></div></div>`, t('t6h'), t('t6p')],
  ];
}
function openTour(at = 0) {
  const el = document.getElementById('tour'), sl = tourSlides();
  el.innerHTML = `<div class="tour-top"><button class="ib txt" data-act="tourend">${t('skip')}</button></div>
    <div class="slides" id="slides">${sl.map(([ill, h, p], i) => `<section class="slide" aria-label="${i + 1}/${sl.length}">${ill ? `<div class="ill">${ill}</div>` : ''}<h2>${h}</h2><p>${p}</p></section>`).join('')}</div>
    <div class="tour-dots" aria-hidden="true">${sl.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-bottom"><button class="btn p wide" data-act="tournext" id="tour-next">${at === sl.length - 1 ? t('start') : t('next')}</button></div>`;
  el.hidden = false;
  const box = document.getElementById('slides');
  box.scrollLeft = at * box.clientWidth;
  box.onscroll = () => {
    const i = Math.round(box.scrollLeft / box.clientWidth);
    el.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    document.getElementById('tour-next').textContent = i === sl.length - 1 ? t('start') : t('next');
  };
}
const tourIndex = () => { const b = document.getElementById('slides'); return b ? Math.round(b.scrollLeft / b.clientWidth) : 0; };
function closeTour() {
  const f = document.querySelector('[data-tour] [name=age]');
  if (f && (f.value || document.querySelector('[data-tour] [name=sex]').value)) saveProfile(f.form);
  document.getElementById('tour').hidden = true; document.getElementById('tour').innerHTML = '';
  if (!db.tourSeen) { db.tourSeen = today(); save(); }
  render();
}

// ---------- aggiungi alla schermata Home ----------
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const mobile = () => isIOS || /Android/.test(ua);
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!document.getElementById('install').hidden) openInstall(); });
function openInstall() {
  const el = document.getElementById('install'), safari = isIOS && !/CriOS|FxiOS|EdgiOS|GSA|OPiOS/.test(ua);
  el.innerHTML = `<img class="logo-big" src="icons/icon-512.png" alt="">
    <h1>${t('installH')}</h1><p>${t('installP')}</p>
    ${isIOS ? (safari ? `<ol class="steps">
        <li><span>${t('iosStep1')}<small>${t('iosStep1b')}</small></span>${icon('share')}</li>
        <li><span>${t('iosStep2')}</span>${icon('addsq')}</li>
        <li><span>${t('iosStep3')}</span></li></ol>
        ${navigator.share ? `<button class="btn p wide" data-act="nativeshare">${icon('share')} ${t('openShare')}</button><div class="gap"></div>` : ''}`
      : `<p class="warn" style="margin-top:20px">${t('notSafari')}</p>`)
    : installEvt ? `<div class="gap"></div><button class="btn p wide" data-act="installnow">${t('installNow')}</button><div class="gap"></div>`
      : `<p class="warn" style="margin-top:20px">${t('androidSteps')}</p>`}
    <p class="warn">${t('browserWarn')}</p>
    <button class="btn s wide" data-act="installclose">${t('useInBrowser')}</button>
    ${isIOS && safari ? `<div class="point">${icon('arrow')}</div>` : ''}`;
  el.hidden = false;
}
function closeInstall() {
  document.getElementById('install').hidden = true;
  try { sessionStorage.setItem('install-skip', '1'); } catch (e) {}
  if (!db.tourSeen) openTour();
}


// ---------- timer di recupero ----------
const restDefault = () => { const v = db.settings && db.settings.rest; return v === undefined ? 90 : v; };
let rest = null, restTick = null, wake = null, actx = null;
try { rest = JSON.parse(localStorage.getItem('gym-rest')); } catch (e) {}
const keepRest = () => { try { rest ? localStorage.setItem('gym-rest', JSON.stringify(rest)) : localStorage.removeItem('gym-rest'); } catch (e) {} };
const mmss = s => `${Math.floor(s / 60)}:${pad2(s % 60)}`;
// l'audio va sbloccato durante un tocco: lo prepariamo quando parte il timer
function unlockAudio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
}
function beep() {
  if (!actx) return;
  [0, .28, .56].forEach((t0, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), t1 = actx.currentTime + t0;
    o.frequency.value = i === 2 ? 1320 : 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(.0001, t1); g.gain.exponentialRampToValueAtTime(.35, t1 + .02); g.gain.exponentialRampToValueAtTime(.0001, t1 + .22);
    o.start(t1); o.stop(t1 + .24);
  });
}
async function keepAwake(on) {
  try {
    if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) { wake = null; }
}
function startRest(name, next, planRest) {
  if (!restDefault()) return;   // spento dalle impostazioni: vale per tutti gli esercizi
  const sec = (db.rest && db.rest[key(name)]) || planRest || restDefault();
  unlockAudio();
  rest = {name, next, total: sec, end: Date.now() + sec * 1000};
  keepRest(); keepAwake(true); drawRest();
}
function adjustRest(d) {
  if (!rest || rest.done) return;
  const left = Math.max(5, Math.round((rest.end - Date.now()) / 1000) + d);
  rest.end = Date.now() + left * 1000;
  rest.total = Math.max(15, rest.total + d);
  // il tempo corretto diventa quello di questo esercizio
  db.rest = {...(db.rest || {}), [key(rest.name)]: rest.total}; save();
  keepRest(); drawRest();
  clearTimeout(adjustRest.tm); adjustRest.tm = setTimeout(() => rest && toast(t('restSaved', esc(rest.name), mmss(rest.total))), 1200);
}
function stopRest() { rest = null; keepRest(); keepAwake(false); drawRest(); }
function drawRest() {
  const el = document.getElementById('rest');
  clearInterval(restTick); restTick = null;
  if (!rest) { el.hidden = true; document.body.classList.remove('resting'); return; }
  el.hidden = false; document.body.classList.add('resting');
  const tick = () => {
    const left = Math.ceil((rest.end - Date.now()) / 1000);
    if (left <= 0 && !rest.done) {
      rest.done = Date.now(); keepRest(); beep();
      try { navigator.vibrate && navigator.vibrate([250, 120, 250]); } catch (e) {}
      keepAwake(false);
    }
    if (rest.done) {
      el.className = 'rest done';
      el.innerHTML = `<button class="rest-main" data-act="restskip"><b>${t('restDone')}</b><span>${esc(rest.name)} · ${t('restNext', rest.next)}</span></button>`;
      clearInterval(restTick); restTick = null;
      setTimeout(() => { if (rest && rest.done && Date.now() - rest.done > 7000) stopRest(); }, 8000);
      return;
    }
    el.className = 'rest';
    el.innerHTML = `<div class="rest-top"><span>${t('rest')} · ${esc(rest.name)}</span><b>${mmss(left)}</b></div>
      <div class="meter"><i style="width:${Math.min(100, (1 - left / rest.total) * 100)}%"></i></div>
      <div class="rest-btns"><button data-act="restless" aria-label="${t('restLess')}">−15</button><button data-act="restmore" aria-label="${t('restMore')}">+15</button>
      <button data-act="restskip">${t('restSkip')}</button></div>`;
  };
  tick();
  if (!rest.done) restTick = setInterval(tick, 250);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && rest) { if (!rest.done) keepAwake(true); drawRest(); } });


// ---------- condivisione e amici (senza server) ----------
const social = () => db.social || (db.social = {id: uid() + uid()});
const nick = () => (db.social && db.social.name) || '';
const APP_URL = location.origin + location.pathname;
// codifica compatta in base64url (anche per caratteri non latini)
const b64e = o => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));

// i miei numeri da mandare agli amici
function myChallenge() {
  const from = addDays(today(), -30), counts = {};
  db.sessions.forEach(s => s.exercises.forEach(e => { if (e.sets.length) { const k = e.lib || key(e.name); counts[k] = (counts[k] || 0) + 1; } }));
  const lifts = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => {
    const ex = db.sessions.flatMap(s => s.exercises).find(e => (e.lib || key(e.name)) === k), all = exHistory(ex.name).flatMap(x => x.sets);
    const b = bestSet(all), h = exHistory(ex.name);
    // miglioramento nell'ultimo mese rispetto al proprio meglio precedente
    const before = Math.max(0, ...h.filter(x => x.date < from).flatMap(x => x.sets.map(e1rm))), recent = Math.max(0, ...h.filter(x => x.date >= from).flatMap(x => x.sets.map(e1rm)));
    return {k, n: ex.name.slice(0, 40), e: r05(e1rm(b)), b: [b.kg, b.reps], p: before && recent ? Math.round((recent - before) / before * 1000) / 10 : null};
  });
  const ps = lifts.map(x => x.p).filter(x => x !== null);
  return {v: 1, id: social().id, n: nick().slice(0, 30), st: streak().n, wt: weeklyTarget(),
    m: doneSessions().filter(s => s.date >= from).length, pg: ps.length ? Math.round(ps.reduce((a, x) => a + x, 0) / ps.length * 10) / 10 : 0, l: lifts, d: today()};
}
const challengeLink = () => APP_URL + '#sfida=' + b64e(myChallenge());
// legge una sfida da un testo incollato o dall'indirizzo, con controlli sui campi
function parseChallenge(text) {
  const m = String(text || '').match(/sfida=([A-Za-z0-9_-]{10,4000})/);
  if (!m) return null;
  try {
    const o = b64d(m[1]), str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '', nr = v => isFinite(v) ? +v : 0;
    if (o.v !== 1 || typeof o.id !== 'string') return null;
    return {id: str(o.id, 40), n: str(o.n, 30) || '?', st: nr(o.st), wt: nr(o.wt), m: nr(o.m), pg: nr(o.pg), d: str(o.d, 10),
      l: (Array.isArray(o.l) ? o.l : []).slice(0, 10).map(x => ({k: str(x.k, 80), n: str(x.n, 40), e: nr(x.e), b: Array.isArray(x.b) ? [nr(x.b[0]), nr(x.b[1])] : [0, 0]}))};
  } catch (e) { return null; }
}
function addFriend(c) {
  if (!c) { alert(t('pasteFail')); return; }
  if (c.id === social().id) { toast(t('ownChallenge')); return; }
  const fr = db.friends || (db.friends = {}), had = !!fr[c.id];
  fr[c.id] = {...c, got: today()}; save();
  closeSheet(); go({name: 'home', tab: 'progress', ptab: 'friends'});
  toast(had ? t('friendUpdated', esc(c.n)) : t('friendAdded', esc(c.n)));
}
function friendsView() {
  const me = {...myChallenge(), n: nick() || t('you'), me: true}, fr = Object.values(db.friends || {});
  let html = `<div class="opts" style="margin-bottom:12px"><button class="btn p" data-act="sendchallenge">${t('challengeSend')}</button>
    <button class="btn s" data-act="pastechallenge">${t('challengePaste')}</button></div>`;
  if (db.social && db.social.group) html += `<button class="btn s wide" data-act="opengroup" style="margin-bottom:12px">${t('openGroup')}</button>`;
  if (!fr.length) return html + `<div class="empty" style="padding:28px 12px">${t('boardEmpty')}</div>`;
  const all = [me, ...fr];
  const board = (title, val, fmtv) => `<p class="glabel">${title}</p><div class="group">${[...all].sort((a, b) => val(b) - val(a)).map((p, i) =>
    `<button class="row board${p.me ? ' me' : ''}" ${p.me ? '' : `data-act="friend" data-id="${esc(p.id)}"`}><span class="rank">${esc(p.n.trim().charAt(0).toUpperCase() || '?')}</span><div class="grow"><h3>${esc(p.n)}</h3>
      ${p.me ? '' : `<div class="sub">${t('updated', rel(p.d || p.got))}</div>`}</div><b class="score">${fmtv(p)}</b></button>`).join('')}</div>`;
  // prima i progressi di ognuno rispetto a se stesso, poi costanza e forza
  html += board(t('progressBoard'), p => p.pg, p => `${p.pg > 0 ? '+' : ''}${fmtKg(p.pg)}%`) + board(t('streakBoard'), p => p.st, p => p.st) + board(t('monthBoard'), p => p.m, p => p.m);
  // forza: solo esercizi che almeno due persone hanno in comune
  const keys = {};
  all.forEach(p => p.l.forEach(x => { (keys[x.k] = keys[x.k] || []).push({p, x}); }));
  const shared = Object.entries(keys).filter(([, v]) => v.length > 1).slice(0, 6);
  if (shared.length) html += `<p class="glabel">${t('liftsBoard')}</p>` + shared.map(([k, v]) => {
    const mine = v.find(y => y.p.me), label = mine ? mine.x.n : VAR[k] ? tx(VAR[k].v.name) : v[0].x.n;
    return `<div class="dcard"><h3>${esc(label)}</h3>${v.sort((a, b) => b.x.e - a.x.e).map((y, i) =>
      `<div class="dex"><span class="rank">${esc(y.p.n.trim().charAt(0).toUpperCase() || '?')}</span><div class="grow"><b>${esc(y.p.n)}</b><span>${fmtKg(y.x.b[0])} kg × ${y.x.b[1]}</span></div><b class="score">${fmtKg(y.x.e)}</b></div>`).join('')}</div>`;
  }).join('');
  return html + `<p class="note" style="margin-top:8px">${t('boardHint')}</p>`;
}
function needNick(then) {
  if (nick()) return then();
  sheet(`<h2>${t('nickname')}</h2><p class="sub" style="margin-bottom:12px">${t('nicknameNeeded')}</p>
    <form data-form="nick"><label class="field"><input name="n" data-focus placeholder="${esc(t('nicknamePh'))}" maxlength="30" autocomplete="nickname"></label>
    <button class="btn p wide">${t('save')}</button></form>`);
  pendingNick = then;
}
let pendingNick = null;
function sheetSendChallenge() {
  const link = challengeLink(), msg = t('challengeMsg', nick()) + '\n' + link;
  sheet(`<h2>${t('challengeSend')}</h2><p class="sub" style="margin-bottom:12px">${esc(t('challengeMsg', nick()))}</p>
    <button class="btn p wide" data-act="sharetext">${t('shareImage').split(' ')[0]}</button><div class="gap"></div>
    <a class="btn s wide" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${t('sendWhatsApp')}</a><div class="gap"></div>
    <button class="btn s wide" data-act="copytext">${t('copyLink')}</button>`);
  shareText = msg;
}
let shareText = '';
function sheetPasteChallenge() {
  // prima prova a leggere gli appunti (iOS chiede conferma con "Incolla"), altrimenti campo di testo
  const ask = () => sheet(`<h2>${t('challengePaste')}</h2><form data-form="paste"><label class="field">${t('pastePrompt')}<textarea name="x" rows="4" data-focus></textarea></label>
    <button class="btn p wide">${t('pasteBtn')}</button></form>`);
  if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(x => { const c = parseChallenge(x); c ? addFriend(c) : ask(); }, ask);
  else ask();
}
function sheetFriend(id) {
  const f = db.friends[id];
  sheet(`<h2>${esc(f.n)}</h2><p class="sub" style="margin-bottom:12px">${t('updated', rel(f.d || f.got))} · ${t('streakBoard')}: ${f.st} · ${t('monthBoard')}: ${f.m}</p>
    <div class="list">${f.l.map(x => `<div class="row"><div class="grow"><h3>${esc(VAR[x.k] ? tx(VAR[x.k].v.name) : x.n)}</h3><div class="sub">${fmtKg(x.b[0])} kg × ${x.b[1]}</div></div><b class="score">${fmtKg(x.e)}</b></div>`).join('')}</div>
    <div class="gap"></div><button class="btn d wide" data-act="delfriend" data-id="${esc(id)}">${t('removeFriend')}</button>`);
}
// sfida aperta da un link: nell'app si aggiunge, in Safari si spiega come portarla nell'app
function handleChallengeHash() {
  const pl = parsePlan(location.hash);
  if (pl) {
    const raw = location.hash.split('scheda=')[1];
    window.history.replaceState(null, '', location.pathname + location.search);
    if (standalone() || !isIOS) { addPlan(pl); return true; }
    shareText = APP_URL + '#scheda=' + raw;
    sheet(`<h2>${esc(t('planFrom', pl.name))}</h2><p class="sub" style="margin-bottom:6px">${pl.author ? esc(t('planBy', pl.author, pl.role)) : ''}</p>
      <p class="sub" style="margin-bottom:14px">${t('inBrowserPlan')}</p><button class="btn p wide" data-act="copytext">${t('copyLink')}</button>`);
    return true;
  }
  const c = parseChallenge(location.hash);
  if (!c) return false;
  window.history.replaceState(null, '', location.pathname + location.search);
  if (standalone() || !isIOS) { addFriend(c); return true; }
  const link = APP_URL + '#sfida=' + location.hash.split('sfida=')[1];
  sheet(`<h2>${esc(t('challengeFrom', c.n))}</h2><p class="sub" style="margin-bottom:14px">${t('inBrowserChallenge')}</p>
    <button class="btn p wide" data-act="copytext">${t('copyLink')}</button>`);
  shareText = APP_URL + '#sfida=' + b64e({...c, v: 1});
  return true;
}

// ---------- immagini da condividere ----------
let shareFile = null;
const FONT = '-apple-system, system-ui, sans-serif';
function cardCanvas(draw) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, '#16171a'); bg.addColorStop(1, '#0b0c0e');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  return {c, g, draw};
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function fitText(g, s, max, size, weight = 700) {
  let f = size; g.font = `${weight} ${f}px ${FONT}`;
  while (g.measureText(s).width > max && f > 20) { f -= 2; g.font = `${weight} ${f}px ${FONT}`; }
  return s;
}
function cardFrame(g, logo, title, sub) {
  if (logo) { g.save(); rr(g, 72, 72, 104, 104, 24); g.clip(); g.drawImage(logo, 72, 72, 104, 104); g.restore(); }
  g.fillStyle = '#9a9aa3'; g.font = `600 34px ${FONT}`; g.fillText('Gym Tracker', 200, 118);
  g.fillStyle = '#f2f2f4'; g.font = `500 30px ${FONT}`; g.fillText(sub, 200, 162);
  g.fillStyle = '#f2f2f4'; fitText(g, title, 936, 76, 800); g.fillText(title, 72, 290);
  g.fillStyle = '#9a9aa3'; g.font = `500 28px ${FONT}`; g.fillText(APP_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''), 72, 1290);
}
function statBox(g, x, y, w, val, label, accent) {
  rr(g, x, y, w, 170, 28); g.fillStyle = accent ? '#ff5a1f' : '#232428'; g.fill();
  g.fillStyle = accent ? '#111114' : '#f2f2f4'; fitText(g, val, w - 48, 64, 800); g.fillText(val, x + 24, y + 92);
  g.fillStyle = accent ? '#111114' : '#9a9aa3'; g.font = `600 28px ${FONT}`; g.fillText(label, x + 24, y + 140);
}
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function sessionCard(s, logo) {
  const {c, g} = cardCanvas(), sets = s.exercises.reduce((a, e) => a + e.sets.length, 0), v = s.exercises.reduce((a, e) => a + vol(e.sets), 0);
  let recs = 0;
  const lines = s.exercises.filter(e => e.sets.length).map(e => {
    const prior = priorOf(s, e), best = Math.max(0, ...prior.flatMap(x => x.sets.map(e1rm))), top = Math.max(...e.sets.map(e1rm)), pr = best > 0 && top > best + 1e-9;
    if (pr) recs++;
    return {n: e.name, sets: e.sets.map(z => `${fmtKg(z.kg)}×${z.reps}`).join('  '), pr};
  });
  cardFrame(g, logo, s.name, fmtDate(s.date));
  const w = (936 - 32) / 3;
  statBox(g, 72, 350, w, String(sets), t('sets'));
  statBox(g, 72 + w + 16, 350, w, v >= 1000 ? fmt1(v / 1000) + ' t' : fmtInt(v), t('volume'));
  statBox(g, 72 + (w + 16) * 2, 350, w, String(recs), t('records'), recs > 0);
  let y = 610;
  lines.slice(0, 6).forEach(l => {
    g.fillStyle = '#f2f2f4'; fitText(g, l.n, l.pr ? 700 : 936, 40, 700); g.fillText(l.n, 72, y);
    if (l.pr) { rr(g, 840, y - 40, 168, 54, 27); g.fillStyle = '#ff5a1f'; g.fill(); g.fillStyle = '#111114'; g.font = `800 28px ${FONT}`; g.fillText(t('record'), 862, y - 4); }
    g.fillStyle = '#9a9aa3'; fitText(g, l.sets, 936, 32, 500); g.fillText(l.sets, 72, y + 48);
    y += 112;
  });
  const st = streak();
  if (st.n) { g.fillStyle = '#ff5a1f'; g.font = `800 40px ${FONT}`; g.fillText(`${st.n} ${t('cardWeeks')}`, 72, 1230); }
  return {c, text: t('shareTxtSession', s.name, recs)};
}
function progressCard(name, logo) {
  const {c, g} = cardCanvas(), st = exStats(name), f = st[0], l = st[st.length - 1];
  const d = l.e - f.e;
  cardFrame(g, logo, name, t('cardSince', fmtShort(f.date)));
  statBox(g, 72, 350, 452, `${sign(Math.round(d * 10) / 10)} kg`, t('forecastSub').split('(')[0].trim(), d > 0);
  statBox(g, 556, 350, 452, `${fmtKg(l.b.kg)}×${l.b.reps}`, t('bestSet'));
  // grafico della forza stimata
  const pts = st.slice(-16), X0 = 72, X1 = 1008, Y0 = 640, Y1 = 1160, vs = pts.map(p => p.e), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const X = i => pts.length === 1 ? (X0 + X1) / 2 : X0 + i * (X1 - X0) / (pts.length - 1), Y = v => Y1 - (v - lo) / sp * (Y1 - Y0);
  g.strokeStyle = '#2a2b30'; g.lineWidth = 2; g.beginPath(); g.moveTo(X0, Y1 + 30); g.lineTo(X1, Y1 + 30); g.stroke();
  g.strokeStyle = '#ff5a1f'; g.lineWidth = 10; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
  pts.forEach((p, i) => i ? g.lineTo(X(i), Y(p.e)) : g.moveTo(X(i), Y(p.e))); g.stroke();
  pts.forEach((p, i) => { g.beginPath(); g.arc(X(i), Y(p.e), 14, 0, 7); g.fillStyle = p.pr ? '#ff5a1f' : '#16171a'; g.fill(); g.lineWidth = 6; g.stroke(); });
  g.fillStyle = '#f2f2f4'; g.font = `800 40px ${FONT}`; g.textAlign = 'right'; g.fillText(fmtKg(pts[pts.length - 1].e), X1, Y(pts[pts.length - 1].e) - 32); g.textAlign = 'left';
  g.fillStyle = '#9a9aa3'; g.font = `500 28px ${FONT}`; g.fillText(fmtAxis(pts[0].date), X0, Y1 + 76); g.textAlign = 'right'; g.fillText(fmtAxis(pts[pts.length - 1].date), X1, Y1 + 76); g.textAlign = 'left';
  return {c, text: t('shareTxtProgress', name, `${sign(Math.round(d * 10) / 10)} kg`)};
}
async function compareCard(pose, logo) {
  const {c, g} = cardCanvas(), ps = photos.filter(p => p.pose === pose), a = ps[0], b = ps[ps.length - 1];
  cardFrame(g, logo, t('compareTitle', poseName(pose).toLowerCase()), `${fmtShort(a.date)} → ${fmtShort(b.date)}`);
  const [ia, ib] = await Promise.all([loadImg(a.url), loadImg(b.url)]);
  [[ia, a, 72], [ib, b, 548]].forEach(([im, p, x]) => {
    const w = 460, h = 760, y = 340;
    g.save(); rr(g, x, y, w, h, 28); g.clip();
    if (im) { const k = Math.max(w / im.width, h / im.height); g.drawImage(im, x + (w - im.width * k) / 2, y + (h - im.height * k) / 2, im.width * k, im.height * k); }
    g.restore();
    const wt = weightAt(p.date);
    g.fillStyle = '#f2f2f4'; g.font = `800 40px ${FONT}`; g.fillText(fmtShort(p.date), x, y + h + 60);
    if (wt) { g.fillStyle = '#9a9aa3'; g.font = `500 32px ${FONT}`; g.fillText(`${fmtKg(wt)} kg`, x, y + h + 104); }
  });
  return {c, text: t('compareTitle', poseName(pose).toLowerCase())};
}
// prepara l'immagine, poi la mostra: il tocco su "Condividi" la invia subito (iOS lo richiede)
async function openShare(kind, arg) {
  const logo = await loadImg('icons/icon-192.png');
  const r = kind === 'session' ? sessionCard(sess(arg), logo) : kind === 'progress' ? progressCard(arg, logo) : await compareCard(arg, logo);
  const blob = await new Promise(res => r.c.toBlob(res, 'image/jpeg', .9));
  shareFile = new File([blob], `gym-${kind}-${today()}.jpg`, {type: 'image/jpeg'});
  shareText = r.text + '\n' + APP_URL;
  const url = URL.createObjectURL(blob);
  sheet(`<h2>${t('sharePreview')}</h2>${kind === 'compare' ? `<p class="warn">${t('photoShareWarn')}</p>` : ''}
    <img class="big-img" src="${url}" alt="" style="aspect-ratio:4/5;object-fit:cover">
    <div class="gap"></div><button class="btn p wide" data-act="sharefile">${t('shareImage')}</button><div class="gap"></div>
    <a class="btn s wide" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">${t('sendWhatsApp')}</a>
    ${db.social && db.social.group ? `<div class="gap"></div><button class="btn s wide" data-act="opengroup">${t('openGroup')}</button>` : ''}`);
}
function shareNow() {
  if (shareFile && navigator.canShare && navigator.canShare({files: [shareFile]})) navigator.share({files: [shareFile], text: shareText}).catch(() => {});
  else if (shareFile) { const a = document.createElement('a'); a.href = URL.createObjectURL(shareFile); a.download = shareFile.name; a.click(); }
}
function sheetSocialSettings() {
  const so = db.social || {};
  sheet(`<h2>${t('socialSettings')}</h2>
    <form data-form="social"><label class="field">${t('nickname')}<input name="n" value="${esc(so.name || '')}" placeholder="${esc(t('nicknamePh'))}" maxlength="30" autocomplete="nickname"></label>
    <label class="field">${t('groupLink')}<input name="g" value="${esc(so.group || '')}" placeholder="https://chat.whatsapp.com/…" inputmode="url" autocomplete="off"></label>
    <p class="sub">${t('groupLinkHint')}</p>
    <button class="btn p wide">${t('save')}</button></form>`);
}


// ---------- schede (create da sé o ricevute da un coach) ----------
const plans = () => db.plans || (db.plans = {});
const planList = () => Object.values(plans()).sort((a, b) => (b.got || '').localeCompare(a.got || '') || a.name.localeCompare(b.name));
const dayLetter = i => String.fromCharCode(65 + i);
const dayTitle = (p, i) => p.days[i].name || `${p.name} ${dayLetter(i)}`;
const repsLow = r => { const m = String(r || '').match(/\d+/); return m ? +m[0] : ''; };
// recupero suggerito dalle ripetizioni: carichi pesanti, pause lunghe
const restFor = reps => { const lo = repsLow(reps) || 10; return lo <= 6 ? 180 : lo <= 10 ? 120 : 90; };
const exLine = x => `${x.sets} × ${x.reps}${x.rest ? ' · ' + t('restS', mmss(x.rest)) : ''}`;
const nameFor = x => { if (x.lib && VAR[x.lib]) { const used = db.sessions.flatMap(s => s.exercises).find(e => e.lib === x.lib); return used ? used.name : tx(VAR[x.lib].v.name); } return x.n; };
// fumetto del coach: nota con l'iniziale di chi l'ha scritta
const bubble = (who, text) => text ? `<div class="bubble"><span class="ava">${esc((who || '?').trim().charAt(0).toUpperCase())}</span><div><b>${esc(who || '')}</b><p>${esc(text).replace(/\n/g, '<br>')}</p></div></div>` : '';

function plansSection() {
  const ps = planList();
  return `<div class="sec"><h2>${t('plans')}</h2></div>
    ${ps.length ? `<div class="list">${ps.map(p => `<button class="row" data-act="plan" data-id="${p.id}"><span class="ava big">${esc((p.author || p.name).trim().charAt(0).toUpperCase())}</span>
      <div class="grow"><h3>${esc(p.name)}</h3><div class="sub">${p.author ? esc(t('planBy', p.author, p.role)) + ' · ' : ''}${t('daysN', p.days.length)}</div></div><span class="chev">${icon('chev')}</span></button>`).join('')}</div>`
      : `<p class="sub" style="margin:0 2px 8px">${t('plansEmpty')}</p>`}
    <div class="opts" style="margin:10px 0 18px"><button class="btn s" data-act="newplan">${icon('plus')} ${t('newPlan')}</button><button class="btn s" data-act="pasteplan">${t('pastePlan')}</button></div>
    <p class="glabel">${t('tabWorkouts')}</p>`;
}
function planView() {
  const p = plans()[view.id];
  return `<header><button class="ib" data-act="home" aria-label="${t('back')}">${icon('back')}</button>
      <div class="t small"><h1>${esc(p.name)}</h1><p>${p.author ? esc(t('planBy', p.author, p.role)) : t('daysN', p.days.length)}</p></div>
      ${p.own ? `<button class="ib txt" data-act="editplan" data-id="${p.id}">${t('edit')}</button>` : ''}</header>
    ${bubble(p.author, p.note)}
    ${p.days.map((d, i) => `<div class="dcard"><div class="item"><h3>${esc(dayTitle(p, i))}</h3><span class="sub">${t('exN', d.ex.length)}</span></div>
      ${d.ex.map(x => `<div class="dex"><div class="grow"><b>${esc(nameFor(x))}</b><span>${exLine(x)}${x.note ? ' · ' + esc(x.note) : ''}</span></div></div>`).join('') || `<p class="sub">${t('planEmptyDay')}</p>`}
      ${d.ex.length ? `<button class="btn p wide" data-act="startday" data-id="${p.id}" data-i="${i}" style="margin-top:10px">${esc(t('startDay', dayTitle(p, i)))}</button>` : ''}</div>`).join('')}
    ${p.food ? `<p class="glabel">${t('foodTips')}</p>${bubble(p.author || t('you'), p.food)}` : ''}
    <div class="gap"></div>
    <button class="btn s wide" data-act="sendplan" data-id="${p.id}" style="background:var(--card)">${icon('share')} ${t('sendPlan')}</button><div class="gap"></div>
    <button class="btn d wide" data-act="delplan" data-id="${p.id}">${t('delPlan')}</button>`;
}
// editor: ogni campo si salva mentre scrivi
function planEditView() {
  const p = plans()[view.id], inp = (f, v, ph, tag = 'input') => tag === 'input'
    ? `<input data-pf="${f}" value="${esc(v || '')}" placeholder="${esc(ph || '')}" autocomplete="off">`
    : `<textarea data-pf="${f}" rows="3" placeholder="${esc(ph || '')}">${esc(v || '')}</textarea>`;
  return `<header><button class="ib" data-act="plan" data-id="${p.id}" aria-label="${t('back')}">${icon('back')}</button>
      <div class="t small"><h1>${esc(p.name) || t('newPlan')}</h1></div><button class="ib txt" data-act="plan" data-id="${p.id}">${t('save')}</button></header>
    <div class="pane-like">
      <label class="field">${t('planName')}${inp('name', p.name, t('planNamePh'))}</label>
      <div class="opts"><label class="field">${t('author')}${inp('author', p.author, t('nicknamePh'))}</label><label class="field">${t('role')}${inp('role', p.role)}</label></div>
      <label class="field">${t('planNote')}${inp('note', p.note, '', 'textarea')}</label>
    </div>
    ${p.days.map((d, i) => `<div class="dcard"><label class="field">${t('dayName')} ${dayLetter(i)}<input data-pd="${i}" value="${esc(d.name || '')}" placeholder="${esc(t('dayNamePh'))}" autocomplete="off"></label>
      ${d.ex.map((x, j) => `<button class="dex" data-act="planex" data-i="${i}" data-j="${j}" style="width:100%;text-align:left"><div class="grow"><b>${esc(nameFor(x))}</b><span>${exLine(x)}${x.note ? ' · ' + esc(x.note) : ''}</span></div><span class="chev">${icon('chev')}</span></button>`).join('')}
      <div class="opts" style="margin-top:10px"><button class="btn s" data-act="planaddex" data-i="${i}" style="background:var(--fill)">${icon('plus')} ${t('exerciseBtn')}</button>
      <button class="btn d" data-act="plandelday" data-i="${i}" style="background:var(--fill)">${t('delDay')}</button></div></div>`).join('')}
    <button class="btn s wide" data-act="planaddday" style="background:var(--card)">${icon('plus')} ${t('addDay')}</button>
    <p class="glabel">${t('foodTips')}</p>
    <div class="pane-like"><label class="field">${inp('food', p.food, t('foodPh'), 'textarea')}</label></div>`;
}
function newPlan() {
  const p = {id: uid() + uid(), own: true, name: '', author: nick(), role: t('roleDefault'), note: '', food: '', days: [{name: '', ex: []}], got: today()};
  plans()[p.id] = p; save(); go({name: 'planedit', id: p.id});
}
function addToPlan(name, lib) {
  const tg = libState.target, p = plans()[tg.plan], b = lib && VAR[lib] ? VAR[lib].b : null, reps = b ? b.reps.replace(/\s*s$/, '') : '8–12';
  p.days[tg.day].ex.push({lib: lib || '', n: lib ? tx(VAR[lib].v.name) : name, sets: 3, reps, rest: restFor(reps), note: ''});
  save(); closeSheet(); libState.target = null; render();
}
function sheetPlanEx(i, j) {
  const x = plans()[view.id].days[i].ex[j];
  sheet(`<h2>${esc(nameFor(x))}</h2><form data-form="planex" data-i="${i}" data-j="${j}">
    <div class="opts"><label class="field">${t('setsL')}<input name="s" inputmode="numeric" value="${x.sets}"></label>
    <label class="field">${t('repsRange')}<input name="r" value="${esc(x.reps)}" autocomplete="off"></label></div>
    <label class="field">${t('restL')}<input name="t" inputmode="numeric" value="${x.rest || ''}"></label>
    <label class="field">${t('noteL')}<input name="n" value="${esc(x.note || '')}" maxlength="120" autocomplete="off"></label>
    <button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
    <button class="btn d wide" data-act="planexdel" data-i="${i}" data-j="${j}">${t('delPlanEx')}</button>`);
}
// avvia un giorno della scheda: seduta con gli esercizi e gli obiettivi del coach
function startPlanDay(id, i) {
  const p = plans()[id], d = p.days[i];
  const s = {id: uid(), name: dayTitle(p, i), date: today(), plan: {id, day: i}, exercises: d.ex.map(x => ({id: uid(), name: nameFor(x), ...(x.lib ? {lib: x.lib} : {}), sets: [],
    target: {sets: x.sets, reps: x.reps, rest: x.rest, note: x.note, by: p.author || ''}}))};
  db.sessions.push(s); save(); closeSheet();
  go({name: 'session', id: s.id, open: s.exercises[0] && s.exercises[0].id, from: 'today'});
}
// prossimo giorno da fare: quello dopo l'ultimo eseguito della scheda usata più di recente
function nextPlanDay() {
  const last = [...db.sessions].filter(s => s.plan && plans()[s.plan.id]).sort((a, b) => b.date.localeCompare(a.date) || order(b) - order(a))[0];
  if (last) { const p = plans()[last.plan.id]; return {p, i: (last.plan.day + 1) % p.days.length}; }
  const p = planList().find(x => x.days.some(d => d.ex.length));
  return p ? {p, i: p.days.findIndex(d => d.ex.length)} : null;
}
// condivisione: dati compatti nel link
function planPayload(p) {
  return {v: 1, t: 'p', id: p.id, n: p.name.slice(0, 50), a: (p.author || '').slice(0, 30), r: (p.role || '').slice(0, 30), no: (p.note || '').slice(0, 600), f: (p.food || '').slice(0, 1200),
    d: p.days.slice(0, 7).map(d => ({n: (d.name || '').slice(0, 40), e: d.ex.slice(0, 15).map(x => [x.lib || '', nameFor(x).slice(0, 50), x.sets, String(x.reps).slice(0, 12), x.rest || 0, (x.note || '').slice(0, 120)])}))};
}
function parsePlan(text) {
  const m = String(text || '').match(/scheda=([A-Za-z0-9_-]{10,20000})/);
  if (!m) return null;
  try {
    const o = b64d(m[1]), str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '', nr = v => isFinite(v) ? +v : 0;
    if (o.v !== 1 || o.t !== 'p' || !Array.isArray(o.d)) return null;
    return {id: str(o.id, 40), name: str(o.n, 50) || '?', author: str(o.a, 30), role: str(o.r, 30), note: str(o.no, 600), food: str(o.f, 1200),
      days: o.d.slice(0, 7).map(d => ({name: str(d.n, 40), ex: (Array.isArray(d.e) ? d.e : []).slice(0, 15).map(x => ({lib: VAR[str(x[0], 80)] ? str(x[0], 80) : '', n: str(x[1], 50),
        sets: Math.min(20, Math.max(1, nr(x[2]) || 3)), reps: str(x[3], 12) || '8–12', rest: Math.min(900, nr(x[4])), note: str(x[5], 120)}))}))};
  } catch (e) { return null; }
}
function addPlan(p) {
  if (!p) { alert(t('pasteFailAny')); return; }
  const had = plans()[p.id];
  if (had && had.own) { toast(t('ownChallenge')); return; }
  plans()[p.id] = {...p, own: false, got: today()}; save();
  closeSheet(); go({name: 'plan', id: p.id});
  toast(had ? t('planUpdated', esc(p.name)) : t('planAdded', esc(p.name)));
}
function sheetSendPlan(id) {
  const p = plans()[id];
  if (!p.days.some(d => d.ex.length)) { alert(t('planNeedsDay')); return; }
  shareText = t('planMsg', p.author || nick() || '🙂', p.name) + '\n' + APP_URL + '#scheda=' + b64e(planPayload(p));
  sheet(`<h2>${t('sendPlan')}</h2><p class="sub" style="margin-bottom:12px">${esc(t('planMsg', p.author || nick() || '🙂', p.name))}</p>
    <button class="btn p wide" data-act="sharetext">${icon('share')} ${t('shareImage').split(' ')[0]}</button><div class="gap"></div>
    <a class="btn s wide" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">${t('sendWhatsApp')}</a><div class="gap"></div>
    <button class="btn s wide" data-act="copytext">${t('copyLink')}</button>`);
}
// incolla: riconosce sia le schede sia le sfide
function pasteAny(x) { const pl = parsePlan(x); if (pl) return addPlan(pl); const c = parseChallenge(x); if (c) return addFriend(c); alert(t('pasteFailAny')); }
function sheetPasteAny(title) {
  const ask = () => sheet(`<h2>${title}</h2><form data-form="paste"><label class="field">${t('pastePrompt')}<textarea name="x" rows="4" data-focus></textarea></label>
    <button class="btn p wide">${t('pasteBtn')}</button></form>`);
  if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(x => { (parsePlan(x) || parseChallenge(x)) ? pasteAny(x) : ask(); }, ask);
  else ask();
}

// ---------- azioni ----------
function readEntry(eid) {
  return {reps: parseInt(document.getElementById('reps-' + eid).value, 10), kg: num(document.getElementById('kg-' + eid).value)};
}
function addSet(eid) {
  const s = sess(view.id), e = s.exercises.find(x => x.id === eid);
  const {reps, kg} = readEntry(eid);
  if (!(reps > 0 && reps <= MAX_REPS) || !(kg >= 0 && kg <= MAX_KG)) {
    const box = document.getElementById('entry-' + eid);
    box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad');
    document.getElementById('err-' + eid).textContent = !(reps > 0 && reps <= MAX_REPS) ? t('errReps') : t('errKg', `62${DEC}5`);
    return;
  }
  const prior = priorOf(s, e), prev = prior[prior.length - 1], i = e.sets.length;
  if (!plausible(e, prior, kg)) return;
  const best = Math.max(0, ...prior.flatMap(x => x.sets.map(e1rm)), ...e.sets.map(e1rm));
  const set = {reps, kg, at: Date.now()}, v = e1rm(set), ref = prev && prev.sets[i];
  e.sets.push(set); delete drafts[eid]; save();
  const y = window.scrollY; render(); window.scrollTo(0, y);
  startRest(e.name, e.sets.length + 1, e.target && e.target.rest);
  if (celebrate()) return;
  if (best > 0 && v > best + 1e-9) toast(t('toastRecord', esc(e.name), fmtKg(r05(v))));
  else if (ref && v > e1rm(ref) + 1e-9) toast(t('toastBetter', setTxt(ref) + ' kg'));
}
function stepVal(eid, f, d) {
  const inp = document.getElementById(f + '-' + eid);
  let v = num(inp.value);
  if (f === 'reps') v = Math.max(1, (isNaN(v) ? 0 : Math.round(v)) + d);
  else v = Math.max(0, Math.round(((isNaN(v) ? 0 : v) + d * (isNaN(v) ? 2.5 : stepFor(v))) * 100) / 100);
  inp.value = f === 'kg' ? fmtKg(v) : v;
  drafts[eid][f] = v;
  syncChips(eid);
}
function syncChips(eid) {
  const d = drafts[eid];
  document.querySelectorAll(`.chip[data-eid="${eid}"]`).forEach(c =>
    c.setAttribute('aria-pressed', +c.dataset.reps === +d.reps && +c.dataset.kg === num(d.kg)));
  const err = document.getElementById('err-' + eid); if (err) err.textContent = '';
}
let newDay = null;  // giorno passato scelto in Oggi per una seduta dimenticata
function createSession(name, from) {
  const s = {id: uid(), name, date: newDay || today(), exercises: from ? from.exercises.map(e => ({id: uid(), name: e.name, ...(e.lib ? {lib: e.lib} : {}), sets: []})) : []};
  newDay = null;
  db.sessions.push(s); save(); closeSheet();
  go({name: 'session', id: s.id, open: s.exercises[0] && s.exercises[0].id});
}
function addExercise(name, lib) {
  if (libState.target) return addToPlan(name, lib);
  if (lib) {
    const used = db.sessions.flatMap(x => x.exercises).find(x => x.lib === lib);
    name = used ? used.name : tx(VAR[lib].v.name);
  }
  const s = sess(view.id), e = {id: uid(), name, sets: []};
  if (lib) e.lib = lib;
  s.exercises.push(e); save(); closeSheet(); view.open = e.id; render();
  const p = s.plan && plans()[s.plan.id], day = p && p.own && p.days[s.plan.day];
  if (day && !day.ex.some(x => (lib && x.lib === lib) || key(nameFor(x)) === key(name)))
    setTimeout(() => toast(t('addToPlanQ', esc(name)), t('addToPlanBtn'), () => {
      const reps = lib && VAR[lib] ? VAR[lib].b.reps.replace(/\s*s$/, '') : '8–12';
      day.ex.push({lib: lib || '', n: name, sets: 3, reps, rest: restFor(reps), note: ''}); save(); toast(t('addedToPlan', esc(dayTitle(p, s.plan.day))));
    }), 0);
  setTimeout(() => { const el = document.getElementById('ex-' + e.id); if (el) el.scrollIntoView({block: 'start', behavior: 'smooth'}); }, 50);
}

const acts = {
  tab: b => go({name: 'home', tab: b.dataset.tab, ptab: view.ptab, wf: view.wf}),
  ptab: b => go({name: 'home', tab: 'progress', ptab: b.dataset.v, wf: view.wf}),
  wfilter: b => go({name: 'home', tab: 'progress', ptab: 'weeks', wf: b.dataset.k}),
  home: () => go({name: 'home', tab: view.from || 'today', day: view.fromDay}),
  day: b => go({name: 'home', tab: 'today', day: b.dataset.d === today() ? undefined : b.dataset.d}),
  settings: () => go({name: 'settings', from: view.tab, fromDay: view.day}),
  open: b => go({name: 'session', id: b.dataset.sid, from: view.name === 'home' ? view.tab : 'today', fromDay: view.day}),
  back: () => go(view.back || {name: 'home', tab: 'progress'}),
  ex: b => go({name: 'ex', ex: b.dataset.name, back: {...view, y: window.scrollY}}),
  backup: sheetBackup,
  export: exportData,
  import: () => document.getElementById('imp').click(),
  newsession: b => { newDay = b.dataset.d && b.dataset.d < today() ? b.dataset.d : null; sheetNewSession(); },
  repeat: b => { if (!document.getElementById('sheet').contains(b)) newDay = null; const f = sess(b.dataset.sid); createSession(f.name, f); },
  addex: b => { if (!b.dataset.keep) { libState.q = ''; libState.target = null; } sheetAddExercise(); },
  pickex: b => addExercise(b.dataset.name),
  libgroup: b => { libState.g = b.dataset.g; const s = libCtx();
    document.querySelectorAll('[data-act=libgroup]').forEach(x => x.setAttribute('aria-pressed', x === b));
    document.getElementById('lib-list').innerHTML = libList(s); },
  libbase: b => sheetLibBase(b.dataset.id),
  libadd: b => { const inPlan = !!libState.target; addExercise(null, b.dataset.id); if (!inPlan) toast(t('addedX', esc(tx(VAR[b.dataset.id].v.name)))); },
  libguide: b => sheetLibBase(b.dataset.id, b.dataset.v),
  libinfo: b => { const e = sess(view.id).exercises.find(x => x.id === b.dataset.eid), L = libFor(e); sheetLibBase(L.b.id, L.v ? L.v.id : '-'); },
  editsession: sheetEditSession,
  delsession: () => { const id = view.id, n = sess(id).name; closeSheet(); go({name: 'home', tab: 'sessions'});
    undoable(t('delSessDone', esc(n)), () => { db.sessions = db.sessions.filter(s => s.id !== id); }); },
  toggle: b => { const y = window.scrollY; view.open = b.dataset.eid; render(); window.scrollTo(0, y);
    const el = document.getElementById('ex-' + b.dataset.eid); if (el) el.scrollIntoView({block: 'nearest', behavior: 'smooth'}); },
  exmenu: b => sheetExMenu(b.dataset.eid),
  delex: b => { const s = sess(view.id), eid = b.dataset.eid, n = s.exercises.find(e => e.id === eid).name; closeSheet();
    undoable(t('delExDone', esc(n)), () => { s.exercises = s.exercises.filter(e => e.id !== eid); }); },
  editset: b => sheetEditSet(b.dataset.eid, +b.dataset.i),
  delset: b => { const e = sess(view.id).exercises.find(x => x.id === b.dataset.eid); closeSheet();
    undoable(t('delSetDone', +b.dataset.i + 1), () => { e.sets.splice(+b.dataset.i, 1); delete drafts[e.id]; }); },
  goal: b => { drafts[b.dataset.eid] = {reps: +b.dataset.reps, kg: +b.dataset.kg};
    document.getElementById('reps-' + b.dataset.eid).value = b.dataset.reps;
    document.getElementById('kg-' + b.dataset.eid).value = fmtKg(+b.dataset.kg); syncChips(b.dataset.eid); },
  step: b => stepVal(b.dataset.eid, b.dataset.f, +b.dataset.d),
  addset: b => addSet(b.dataset.eid),
  close: closeSheet,
  bodylog: b => sheetBodyLog(b.dataset.d),
  addphoto: b => addPhoto(b.dataset.pose),
  photo: b => sheetPhoto(b.dataset.id),
  compare: b => sheetCompare(b.dataset.pose),
  delphoto: b => { const id = b.dataset.id; if (!confirm(t('delPhotoConfirm'))) return;
    photoTx('readwrite', st => st.delete(id)).then(() => { backupFile = null; closeSheet(); return loadPhotos(); }); },
  weekly: sheetWeekly,
  setweekly: b => { db.settings = {...(db.settings || {}), weekly: +b.dataset.n}; save(); closeSheet(); render(); celebrate(); },
  newgoal: b => { sheetGoal(b.dataset.name); if (b.dataset.t === 'body') acts.goaltype(document.querySelector('[data-act=goaltype][data-t=body]')); },
  goaltype: b => { const f = document.querySelector('[data-form=goal]'); f.dataset.t = b.dataset.t;
    document.querySelectorAll('[data-act=goaltype]').forEach(x => x.setAttribute('aria-selected', x === b));
    f.querySelector('.g-lift').hidden = b.dataset.t !== 'lift'; f.querySelector('.g-body').hidden = b.dataset.t !== 'body'; },
  goalmenu: b => sheetGoalMenu(b.dataset.id),
  delgoal: b => { const id = b.dataset.id; closeSheet(); undoable(t('delGoalDone'), () => { db.goals = goalList().filter(g => g.id !== id); }); },
  summary: () => { celebrate(); sheetSummary(); },
  finish: () => { closeSheet(); go({name: 'home', tab: 'today'}); },
  profile: sheetProfile,
  sex: b => { const f = b.closest('form'); f.sex.value = b.dataset.v;
    f.querySelectorAll('[data-act=sex]').forEach(x => x.setAttribute('aria-pressed', x === b)); },
  lang: b => {
    db.settings = {...(db.settings || {}), lang: b.dataset.l}; save(); setLang(); render();
    if (!document.getElementById('tour').hidden) openTour(tourIndex());
  },
  tour: () => openTour(),
  theme: b => { db.settings = {...(db.settings || {}), theme: b.dataset.v}; save(); applyTheme(); render(); },
  tournext: () => { const box = document.getElementById('slides'), i = tourIndex();
    if (i >= box.children.length - 1) closeTour(); else box.scrollTo({left: (i + 1) * box.clientWidth, behavior: 'smooth'}); },
  tourend: closeTour,
  install: openInstall,
  installclose: closeInstall,
  installnow: () => { if (installEvt) installEvt.prompt(); },
  share: b => openShare(b.dataset.k, b.dataset.a),
  sharefile: shareNow,
  sharetext: () => { if (navigator.share) navigator.share({text: shareText}).catch(() => {}); else acts.copytext(); },
  copytext: () => { (navigator.clipboard ? navigator.clipboard.writeText(shareText) : Promise.reject()).then(() => toast(t('copied')), () => prompt('', shareText)); },
  sendchallenge: () => needNick(sheetSendChallenge),
  pastechallenge: () => sheetPasteAny(t('challengePaste')),
  pasteplan: () => sheetPasteAny(t('pastePlan')),
  plan: b => go({name: 'plan', id: b.dataset.id, from: view.name === 'home' ? view.tab : 'sessions'}),
  newplan: newPlan,
  starterplan: starterPlan,
  recovery: b => sheetRecovery(+b.dataset.t),
  recflip: b => { view.recSide = b.dataset.side; const sh = document.getElementById('sheet'); if (sh.contains(b)) sheetRecovery(recT || Date.now()); else { const y = window.scrollY; render(); window.scrollTo(0, y); } },
  editplan: b => go({name: 'planedit', id: b.dataset.id}),
  startday: b => startPlanDay(b.dataset.id, +b.dataset.i),
  sendplan: b => needNick(() => sheetSendPlan(b.dataset.id)),
  delplan: b => { const id = b.dataset.id, n = plans()[id].name; go({name: 'home', tab: 'sessions'}); undoable(t('planDeleted', esc(n)), () => { delete db.plans[id]; }); },
  planaddex: b => { libState.target = {plan: view.id, day: +b.dataset.i}; libState.q = ''; sheetAddExercise(); },
  planaddday: () => { plans()[view.id].days.push({name: '', ex: []}); save(); render(); },
  plandelday: b => { const p = plans()[view.id]; if (p.days.length > 1) { p.days.splice(+b.dataset.i, 1); save(); render(); } },
  planex: b => sheetPlanEx(+b.dataset.i, +b.dataset.j),
  planexdel: b => { plans()[view.id].days[+b.dataset.i].ex.splice(+b.dataset.j, 1); save(); closeSheet(); render(); },
  friend: b => sheetFriend(b.dataset.id),
  delfriend: b => { const id = b.dataset.id, n = db.friends[id].n; closeSheet(); undoable(t('friendRemoved', esc(n)), () => { delete db.friends[id]; }); },
  opengroup: () => { if (db.social && db.social.group) window.open(db.social.group, '_blank'); },
  socialset: sheetSocialSettings,
  restless: () => adjustRest(-15),
  restmore: () => adjustRest(15),
  restskip: stopRest,
  restset: b => { db.settings = {...(db.settings || {}), rest: +b.dataset.v}; save(); render(); },
  nativeshare: () => navigator.share({title: t('shareTitle'), url: location.href}).catch(() => {}),
};
const forms = {
  nick: f => { const n = f.n.value.trim(); if (!n) return f.n.focus(); social().name = n.slice(0, 30); save(); closeSheet();
    const then = pendingNick; pendingNick = null; if (then) setTimeout(then, 280); },
  paste: f => pasteAny(f.x.value),
  planex: f => { const x = plans()[view.id].days[+f.dataset.i].ex[+f.dataset.j];
    x.sets = Math.min(20, Math.max(1, parseInt(f.s.value, 10) || 3)); x.reps = f.r.value.trim().slice(0, 12) || x.reps;
    x.rest = Math.min(900, Math.max(0, parseInt(f.t.value, 10) || 0)); x.note = f.n.value.trim().slice(0, 120); save(); closeSheet(); render(); },
  social: f => {
    const n = f.n.value.trim(), g = f.g.value.trim();
    if (g && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(g)) return alert(t('groupInvalid'));
    social().name = n.slice(0, 30); social().group = g; save(); closeSheet(); render(); toast(t('saved'));
  },
  newsession: f => { const n = f.n.value.trim(); if (n) createSession(n); else f.n.focus(); },
  addex: f => { const n = f.n.value.trim(); if (!n) return f.n.focus();
    const known = exerciseNames().find(x => key(x.name) === key(n)); addExercise(known ? known.name : n); },
  editsession: f => { const s = sess(view.id), n = f.n.value.trim(); if (n) s.name = n; if (f.d.value) s.date = f.d.value;
    save(); closeSheet(); render(); },
  renameex: f => { const n = f.n.value.trim(); if (!n) return; sess(view.id).exercises.find(e => e.id === f.dataset.eid).name = n;
    save(); closeSheet(); render(); },
  editset: f => { const r = parseInt(f.r.value, 10), k = num(f.k.value); if (!(r > 0 && r <= MAX_REPS) || !(k >= 0 && k <= MAX_KG)) return alert(t('invalidSet'));
    { const s = sess(view.id), e = s.exercises.find(x => x.id === f.dataset.eid); if (!plausible(e, priorOf(s, e), k)) return; }
    { const z = sess(view.id).exercises.find(e => e.id === f.dataset.eid).sets; z[+f.dataset.i] = {...z[+f.dataset.i], reps: r, kg: k}; }
    save(); closeSheet(); const y = window.scrollY; render(); window.scrollTo(0, y); },
  bodylog: f => {
    const w = num(f.w.value), k = num(f.k.value), pr = num(f.p.value), d = f.d.value || today();
    if (!(w > 0) && !(k > 0) && !(pr > 0)) return alert(t('needOne'));
    // un valore scritto ma non valido non deve cancellare quello già salvato
    if (f.w.value.trim() && !(w >= 25 && w <= 300)) return alert(t('weightOut'));
    if ((f.k.value.trim() && !(k > 0 && k < 20000)) || (f.p.value.trim() && !(pr > 0 && pr < 1000))) return alert(t('invalidNum'));
    db.body = (db.body || []).filter(x => x.date !== d);
    db.body.push({date: d, weight: w > 0 ? w : 0, kcal: k > 0 ? k : 0, protein: pr > 0 ? pr : 0});
    save(); closeSheet(); render(); if (!celebrate()) toast(t('saved'));
  },
  goal: f => {
    if (f.dataset.t === 'lift') {
      const ex = f.ex && f.ex.value, kg = num(f.kg.value), reps = parseInt(f.reps.value, 10);
      if (!ex || !(kg > 0) || !(reps > 0)) return alert(t('invalidGoal'));
      goalList().push({id: uid(), type: 'lift', ex, kg, reps, start: bestE(ex), created: today()});
    } else {
      const w = num(f.w.value), lw = lastWeight();
      if (!lw) return alert(t('logWeightFirst'));
      if (!(w > 25 && w < 300)) return alert(t('invalidWGoal'));
      goalList().push({id: uid(), type: 'body', weight: w, start: lw, created: today()});
    }
    save(); closeSheet(); render(); if (!celebrate()) toast(t('goalCreated'));
  },
  profile: f => {
    if (!saveProfile(f)) return;
    if (f.dataset.tour) { toast(t('profileSaved')); acts.tournext(); return; }
    closeSheet(); render(); toast(t('profileSaved'));
  },
};
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (b && !b.disabled && acts[b.dataset.act]) acts[b.dataset.act](b);
});
// celle della tabella Settimane: attivabili anche da tastiera
document.addEventListener('keydown', ev => {
  const b = ev.target.closest && ev.target.closest('[data-act][tabindex]');
  if (b && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); b.click(); }
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target; if (forms[f.dataset.form]) forms[f.dataset.form](f);
});
let planSaveT;
document.addEventListener('input', ev => {
  const el = ev.target;
  if ((el.dataset.pf || el.dataset.pd) && view.name === 'planedit') {
    const p = plans()[view.id];
    if (el.dataset.pf) p[el.dataset.pf] = el.value.slice(0, el.dataset.pf === 'food' ? 1200 : el.dataset.pf === 'note' ? 600 : 50);
    else p.days[+el.dataset.pd].name = el.value.slice(0, 40);
    clearTimeout(planSaveT); planSaveT = setTimeout(save, 400); return;
  }
  if (el.dataset.f && drafts[el.dataset.eid]) { drafts[el.dataset.eid][el.dataset.f] = el.value; syncChips(el.dataset.eid); }
});

setLang();
applyTheme();
render();
if (rest) drawRest();
restore();
loadPhotos();
let skipInstall = false;
try { skipInstall = sessionStorage.getItem('install-skip') === '1'; } catch (e) {}
if (handleChallengeHash()) {}
else if (mobile() && !standalone() && !skipInstall) openInstall();
else if (!db.tourSeen) openTour();
window.addEventListener('hashchange', handleChallengeHash);
// copia offline dell'app (sw.js)
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
