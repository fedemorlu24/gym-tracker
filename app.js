const KEY = 'gym-tracker-v1';
let db = load();
let view = {name: 'home', tab: 'sessions'};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {sessions: []}; }
  catch (e) { return {sessions: []}; }
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
  db.ts = Date.now(); backupFile = null;
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
    const o = JSON.parse(v);
    if ((o.ts || 0) > (db.ts || 0)) {
      db = o;
      try { localStorage.setItem(KEY, v); } catch (e) {}
      setLang(); render();
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
const order = s => db.sessions.indexOf(s);

// storico di un esercizio (per nome) in tutte le sedute, dalla più vecchia
function history(name) {
  return db.sessions
    .flatMap(s => s.exercises.filter(e => key(e.name) === key(name) && e.sets.length).map(e => ({sid: s.id, date: s.date, sets: e.sets, o: order(s)})))
    .sort((a, b) => a.date.localeCompare(b.date) || a.o - b.o);
}
// sedute precedenti a quella in esame (escluse quelle con data futura)
const priorOf = (s, e) => history(e.name).filter(x => x.sid !== s.id && x.date <= s.date);
const prevFor = (s, e) => priorOf(s, e).pop();
// obiettivi per la prossima serie partendo dalla stessa serie dell'ultima volta
function suggest(ps) {
  const st = stepFor(ps.kg);
  if (ps.reps >= TOP_REPS) return [{reps: BASE_REPS, kg: ps.kg + st}, {reps: ps.reps, kg: ps.kg}];
  return [{reps: ps.reps + 1, kg: ps.kg}, {reps: ps.reps, kg: ps.kg + st}];
}
function exStats(name) {
  let best = 0;
  return history(name).map(x => {
    const b = bestSet(x.sets), e = r05(e1rm(b));
    const pr = best > 0 && e > best;
    best = Math.max(best, e);
    return {...x, b, e, vol: vol(x.sets), pr, kg: Math.max(...x.sets.map(z => z.kg)), reps: x.sets.reduce((a, z) => a + z.reps, 0)};
  });
}
const dir = (a, b) => a > b ? 'up' : a < b ? 'down' : 'eq';
const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtKg(Math.abs(v));
function deltaTag(cur, prev, f, u) {
  if (!prev) return '';
  const v = cur[f] - prev[f], d = dir(cur[f], prev[f]);
  return `<span class="tag ${d}">${d === 'up' ? '▲' : d === 'down' ? '▼' : '='} ${sign(v)} ${u}</span>`;
}
// bozza della serie in compilazione, per esercizio
const drafts = {};
function draftFor(s, e) {
  if (drafts[e.id]) return drafts[e.id];
  const prev = prevFor(s, e), i = e.sets.length;
  let d = {reps: '', kg: ''};
  if (prev && i < prev.sets.length) d = {...suggest(prev.sets[i])[0]};
  else if (i) d = {reps: e.sets[i - 1].reps, kg: e.sets[i - 1].kg};
  else if (prev) d = {...suggest(prev.sets[prev.sets.length - 1])[0]};
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
    const thr = STD[lt][p.sex], e = Math.max(0, ...history(name).flatMap(x => x.sets.map(e1rm))), ratio = e / bw;
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
const bestE = name => Math.max(0, ...history(name).flatMap(x => x.sets.map(e1rm)));
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
    if (g.type === 'lift') ok = history(g.ex).some(x => x.date >= g.created && x.sets.some(z => z.kg >= g.kg && z.reps >= g.reps));
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
  if (b.length) { toast(t('badgeToast', b.map(x => x.t).join(', '))); return true; }
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
  else if (view.name === 'ex' && history(view.ex).length) app.innerHTML = exView();
  else if (view.name === 'settings') app.innerHTML = settingsView();
  else { if (view.name !== 'home') view = {name: 'home', tab: 'sessions'}; app.innerHTML = home(); tabs = true; }
  document.body.classList.toggle('tabs', tabs);
  document.getElementById('tabbar').innerHTML = tabs ? tabbar() : '';
  document.getElementById('tabbar').hidden = !tabs;
  document.title = t('shareTitle');
}
function tabbar() {
  const tab = view.tab || 'sessions';
  const b = (k, ic, l) => `<button role="tab" aria-selected="${tab === k}" data-act="tab" data-tab="${k}">${icon(ic)}${l}</button>`;
  return b('sessions', 'lift', t('tabWorkouts')) + b('progress', 'chart', t('tabProgress')) + b('body', 'body', t('tabBody'));
}

// ---------- home ----------
function home() {
  const tab = view.tab || 'sessions';
  const title = {sessions: t('tabWorkouts'), progress: t('tabProgress'), body: t('tabBody')}[tab];
  let html = `<header><div class="t"><h1>${title}</h1></div>
      <button class="ib" data-act="settings" aria-label="${t('settings')}">${icon('gear')}</button></header>`;
  if (tab === 'sessions') {
    const td = [...db.sessions].reverse().find(s => s.date === today());
    html += (td ? `<button class="today" data-act="open" data-sid="${td.id}"><div class="grow"><div class="sub">${t('continueToday')}</div><h3>${esc(td.name)}</h3></div><span class="chev">${icon('chev')}</span></button>` : '') +
      (doneSessions().length ? streakCard() : '') + sessionsList() +
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
    if (e.sets.length) m.set(key(e.name), {name: e.name, date: s.date});
  }));
  return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
}
function progressList() {
  const names = exerciseNames(), gl = goalList(), open = gl.filter(g => !g.done), done = gl.filter(g => g.done);
  let html = `<div class="sec"><h2>${t('goals')}</h2><button class="chip" data-act="newgoal">${icon('plus')} ${t('newBtn')}</button></div>` +
    (open.length ? `<div class="list">${open.map(g => goalCard(g)).join('')}</div>` : `<p class="sub" style="margin:0 2px 8px">${t('goalsEmpty')}</p>`) +
    (done.length ? `<div class="list" style="margin-top:10px">${done.slice(-3).reverse().map(g => goalCard(g)).join('')}</div>` : '');
  html += `<div class="sec"><h2>${t('exercises')}</h2></div>`;
  if (!names.length) html += `<div class="empty" style="padding:24px 12px">${t('exEmpty')}</div>`;
  else html += `<div class="list">` + names.map(x => {
    const st = exStats(x.name), l = st[st.length - 1], p = st[st.length - 2];
    return `<button class="row" data-act="ex" data-name="${esc(x.name)}">
      <div class="grow"><h3>${esc(x.name)}</h3><div class="sub">${t('exMeta', fmtKg(l.kg), l.reps, st.length)}</div></div>
      <div class="tags">${p ? deltaTag(l, p, 'kg', 'kg') + deltaTag(l, p, 'reps', t('repsShort')) : `<span class="sub">${t('firstSession')}</span>`}</div></button>`;
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
      <button class="ib txt" data-act="editsession">${t('edit')}</button>
    </header>` +
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
      <div class="ex-body sum" data-act="toggle" data-eid="${e.id}">${sum}</div></section>`;
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
      <p class="last">${prev ? t('lastTime', fmtShort(prev.date), prev.sets.map(setTxt).join(' · ')) : t('firstTime')}</p>
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
  return `<div class="entry" id="entry-${eid}">${one('reps', d.reps, t('reps'), 'numeric', t('reps'))}${one('kg', d.kg, 'kg', 'decimal', t('kgWord'))}</div>`;
}

// ---------- progressi esercizio ----------
function exView() {
  const st = exStats(view.ex), named = exerciseNames().find(x => key(x.name) === key(view.ex)), name = named ? named.name : view.ex;
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
      <div class="t small"><h1>${esc(name)}</h1><p>${t('sinceN', st.length, fmtShort(f.date))}</p></div></header>
    ${panel(t('weight'), t('weightSub'), 'kg', 'kg',
      lineChart(st.map((x, i) => ({d: x.date, v: x.kg, dir: i ? dir(x.kg, st[i - 1].kg) : 'eq', live: isLive(x)})), 'kg'))}
    ${panel(t('repsTitle'), t('repsSub'), 'reps', rs,
      barChart(st.map((x, i) => ({d: x.date, v: x.reps, dir: i ? dir(x.reps, st[i - 1].reps) : 'eq', live: isLive(x)})), rs))}
    ${forecastPanel(name, st)}
    ${levelPanel(name)}
    <div class="hero">
      <div class="sub">${t('bestSet')}</div>
      <div class="big">${setTxt(rec.b)} <small>kg · ${fmtShort(rec.date)}</small></div>
      <p class="note" style="padding:0">${t('recordNote', fmtKg(rec.e))}</p>
    </div>
    <div class="hist">${[...st].reverse().map((x, i, a) => {
      const pr = a[i + 1];
      return `<div><b>${fmtShort(x.date)}</b><span>${x.sets.map(z => `<i>${setTxt(z)}</i>`).join(' · ')}</span><span class="tags">${x.pr ? `<span class="tag pr">${t('record')}</span>` : ''}${deltaTag(x, pr, 'kg', 'kg')}${deltaTag(x, pr, 'reps', rs)}</span></div>`;
    }).join('')}</div>
    <p class="note" style="margin-top:10px">${t('legend')}</p>`;
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
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), action ? 5000 : 2600);
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
  sheet(`<h2>${t('newSession')}</h2>
    ${past.length ? `<div class="list">${past.map(s => `
      <button class="row" data-act="repeat" data-sid="${s.id}"><div class="grow"><h3>${esc(s.name)}</h3>
      <div class="sub">${s.exercises.map(e => esc(e.name)).join(', ')}</div></div><span class="sub">${fmtShort(s.date)}</span></button>`).join('')}</div>
      <p class="sub h">${t('orNew')}</p>` : ''}
    <form data-form="newsession"><label class="field">${t('name')}<input name="n" ${past.length ? '' : 'data-focus'} placeholder="${esc(t('sessionPh'))}" autocomplete="off" enterkeyhint="done"></label>
    <button class="btn p wide">${t('createSession')}</button></form>`);
}
function sheetAddExercise() {
  const s = sess(view.id), have = new Set(s.exercises.map(e => key(e.name)));
  const known = exerciseNames().filter(x => !have.has(key(x.name)));
  sheet(`<h2>${t('addExercise')}</h2>
    ${known.length ? `<div class="chips">${known.slice(0, 16).map(x => `<button class="chip" data-act="pickex" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div><p class="sub h">${t('orNew')}</p>` : ''}
    <form data-form="addex"><label class="field">${t('exName')}<input name="n" ${known.length ? '' : 'data-focus'} placeholder="${esc(t('exPh'))}" autocomplete="off" enterkeyhint="done"></label>
    <button class="btn p wide">${t('add')}</button></form>`);
}
function sheetEditSession() {
  const s = sess(view.id);
  sheet(`<h2>${t('editSession')}</h2>
    <form data-form="editsession"><label class="field">${t('name')}<input name="n" value="${esc(s.name)}" autocomplete="off"></label>
    <label class="field">${t('date')}<input name="d" type="date" value="${s.date}"></label>
    <button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
    <button class="btn d wide" data-act="delsession">${t('delSession')}</button>`);
}
function sheetExMenu(eid) {
  const e = sess(view.id).exercises.find(x => x.id === eid);
  sheet(`<h2>${esc(e.name)}</h2>
    <form data-form="renameex" data-eid="${eid}"><label class="field">${t('name')}<input name="n" value="${esc(e.name)}" autocomplete="off"></label>
    <p class="sub">${t('sameName')}</p>
    <button class="btn p wide">${t('save')}</button></form><div class="gap"></div>
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
    <p class="sub" style="margin:10px 0 14px">${fmtDate(p.date)}${w ? ` · ${t('weightOn', fmtKg(w))}` : ''}</p>
    <button class="btn d wide" data-act="delphoto" data-id="${id}">${t('delPhoto')}</button>`);
}
function sheetCompare(pose) {
  const ps = photos.filter(p => p.pose === pose), a = ps[0], b = ps[ps.length - 1];
  const cap = p => { const w = weightAt(p.date); return `<figcaption><b>${fmtShort(p.date)}</b>${w ? ` · ${fmtKg(w)} kg` : ''}</figcaption>`; };
  sheet(`<h2>${t('compareTitle', poseName(pose).toLowerCase())}</h2>
    <div class="cmp"><figure id="cmp-a"><img src="${a.url}" alt="${t('before')}">${cap(a)}</figure><figure><img src="${b.url}" alt="${t('after')}">${cap(b)}</figure></div>
    ${ps.length > 2 ? `<label class="field" style="margin-top:12px">${t('compareWith')}<select id="cmp-sel">${ps.map((p, i) => `<option value="${i}">${fmtShort(p.date)}</option>`).join('')}</select></label>` : ''}
    <p class="note" style="padding:12px 0 0">${t('compareNote')}</p>`);
  const sel = document.getElementById('cmp-sel');
  if (sel) sel.onchange = () => { const p = ps[+sel.value]; document.getElementById('cmp-a').innerHTML = `<img src="${p.url}" alt="${t('before')}">${cap(p)}`; };
}
function sheetBodyLog() {
  const d = today(), cur = (db.body || []).find(x => x.date === d) || {};
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
      <div><b>${v >= 1000 ? fmt1(v / 1000) + ' t' : fmtInt(v) + ' kg'}</b><span>${t('volume')}${vd != null ? ` <em class="${vd > 0 ? 'up' : vd < 0 ? 'dn' : ''}">${vd > 0 ? '▲ +' : vd < 0 ? '▼ ' : '= '}${vd}%</em>` : ''}</span></div>
      <div><b>${recs.length}</b><span>${t('records')}</span></div>
      <div><b>${compared ? `${improved}/${compared}` : '–'}</b><span>${t('improved')}</span></div>
    </div>
    ${recs.length ? `<p class="sub h">${t('todayRecords')}</p><div class="chips">${recs.map(r => `<span class="tag pr">${r}</span>`).join('')}</div>` : ''}
    ${goalsToday.length ? `<p class="sub h">${t('goalsReached')}</p>${goalsToday.map(g => `<p>★ ${esc(goalState(g).title)}</p>`).join('')}` : ''}
    ${badgesToday.length ? `<p class="sub h">${t('badgesUnlocked')}</p><div class="badges">${badgesToday.map(b => `<div class="badge on"><span class="medal">${b.g}</span><b>${b.t}</b></div>`).join('')}</div>` : ''}
    <p class="sub h">${t('week')}</p><p>${t('weekStatus', st.week, st.t, st.n)}</p>
    <p class="note" style="padding:12px 0 0">${improved && compared ? t('beatNote', improved, compared) : ''}${t('nextNote')}</p>
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
    [`<div class="mock"><h4>${bench}</h4><div class="entry">${mockStep(8, t('reps'))}${mockStep(70, 'kg')}</div><div class="btn p wide">${t('logSet', 1)}</div></div>`, t('t2h'), t('t2p')],
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
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
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
    : `<div class="gap"></div><button class="btn p wide" data-act="installnow" ${installEvt ? '' : 'hidden'}>${t('installNow')}</button><div class="gap"></div>`}
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

// ---------- azioni ----------
function readEntry(eid) {
  return {reps: parseInt(document.getElementById('reps-' + eid).value, 10), kg: num(document.getElementById('kg-' + eid).value)};
}
function addSet(eid) {
  const s = sess(view.id), e = s.exercises.find(x => x.id === eid);
  const {reps, kg} = readEntry(eid);
  if (!(reps > 0) || !(kg >= 0)) {
    const box = document.getElementById('entry-' + eid);
    box.classList.remove('bad'); void box.offsetWidth; box.classList.add('bad');
    document.getElementById('err-' + eid).textContent = !(reps > 0) ? t('errReps') : t('errKg', `62${DEC}5`);
    return;
  }
  const prior = priorOf(s, e), prev = prior[prior.length - 1], i = e.sets.length;
  const best = Math.max(0, ...prior.flatMap(x => x.sets.map(e1rm)), ...e.sets.map(e1rm));
  const set = {reps, kg}, v = e1rm(set), ref = prev && prev.sets[i];
  e.sets.push(set); delete drafts[eid]; save();
  const y = window.scrollY; render(); window.scrollTo(0, y);
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
function createSession(name, from) {
  const s = {id: uid(), name, date: today(), exercises: from ? from.exercises.map(e => ({id: uid(), name: e.name, sets: []})) : []};
  db.sessions.push(s); save(); closeSheet();
  go({name: 'session', id: s.id, open: s.exercises[0] && s.exercises[0].id});
}
function addExercise(name) {
  const s = sess(view.id), e = {id: uid(), name, sets: []};
  s.exercises.push(e); save(); closeSheet(); view.open = e.id; render();
  setTimeout(() => { const el = document.getElementById('ex-' + e.id); if (el) el.scrollIntoView({block: 'start', behavior: 'smooth'}); }, 50);
}

const acts = {
  tab: b => go({name: 'home', tab: b.dataset.tab}),
  home: () => go({name: 'home', tab: view.name === 'settings' ? (view.from || 'sessions') : 'sessions'}),
  settings: () => go({name: 'settings', from: view.tab}),
  open: b => go({name: 'session', id: b.dataset.sid}),
  back: () => go(view.back || {name: 'home', tab: 'progress'}),
  ex: b => go({name: 'ex', ex: b.dataset.name, back: {...view, y: window.scrollY}}),
  backup: sheetBackup,
  export: exportData,
  import: () => document.getElementById('imp').click(),
  newsession: sheetNewSession,
  repeat: b => { const f = sess(b.dataset.sid); createSession(f.name, f); },
  addex: sheetAddExercise,
  pickex: b => addExercise(b.dataset.name),
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
  bodylog: sheetBodyLog,
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
  finish: () => { closeSheet(); go({name: 'home', tab: 'sessions'}); },
  profile: sheetProfile,
  sex: b => { const f = b.closest('form'); f.sex.value = b.dataset.v;
    f.querySelectorAll('[data-act=sex]').forEach(x => x.setAttribute('aria-pressed', x === b)); },
  lang: b => {
    db.settings = {...(db.settings || {}), lang: b.dataset.l}; save(); setLang(); render();
    if (!document.getElementById('tour').hidden) openTour(tourIndex());
  },
  tour: () => openTour(),
  tournext: () => { const box = document.getElementById('slides'), i = tourIndex();
    if (i >= box.children.length - 1) closeTour(); else box.scrollTo({left: (i + 1) * box.clientWidth, behavior: 'smooth'}); },
  tourend: closeTour,
  install: openInstall,
  installclose: closeInstall,
  installnow: () => { if (installEvt) installEvt.prompt(); },
  nativeshare: () => navigator.share({title: t('shareTitle'), url: location.href}).catch(() => {}),
};
const forms = {
  newsession: f => { const n = f.n.value.trim(); if (n) createSession(n); else f.n.focus(); },
  addex: f => { const n = f.n.value.trim(); if (!n) return f.n.focus();
    const known = exerciseNames().find(x => key(x.name) === key(n)); addExercise(known ? known.name : n); },
  editsession: f => { const s = sess(view.id), n = f.n.value.trim(); if (n) s.name = n; if (f.d.value) s.date = f.d.value;
    save(); closeSheet(); render(); },
  renameex: f => { const n = f.n.value.trim(); if (!n) return; sess(view.id).exercises.find(e => e.id === f.dataset.eid).name = n;
    save(); closeSheet(); render(); },
  editset: f => { const r = parseInt(f.r.value, 10), k = num(f.k.value); if (!(r > 0) || !(k >= 0)) return alert(t('invalidSet'));
    sess(view.id).exercises.find(e => e.id === f.dataset.eid).sets[+f.dataset.i] = {reps: r, kg: k};
    save(); closeSheet(); const y = window.scrollY; render(); window.scrollTo(0, y); },
  bodylog: f => {
    const w = num(f.w.value), k = num(f.k.value), pr = num(f.p.value), d = f.d.value || today();
    if (!(w > 0) && !(k > 0) && !(pr > 0)) return alert(t('needOne'));
    if (w > 0 && (w < 25 || w > 300)) return alert(t('weightOut'));
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
document.addEventListener('submit', ev => {
  ev.preventDefault();
  const f = ev.target; if (forms[f.dataset.form]) forms[f.dataset.form](f);
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.f && drafts[el.dataset.eid]) { drafts[el.dataset.eid][el.dataset.f] = el.value; syncChips(el.dataset.eid); }
});

setLang();
render();
restore();
loadPhotos();
let skipInstall = false;
try { skipInstall = sessionStorage.getItem('install-skip') === '1'; } catch (e) {}
if (mobile() && !standalone() && !skipInstall) openInstall();
else if (!db.tourSeen) openTour();
