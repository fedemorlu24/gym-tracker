// Import di una scheda esistente (foto o PDF letti dall'app AI dell'utente) e dello storico da altre app (CSV).
// Nessun server: l'AI gira nell'app dell'utente, qui si leggono solo il testo incollato o il file CSV.

// ---------- abbinamento alla libreria ----------
const IMP_STOP = new Set(['con', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'di', 'da', 'del', 'della', 'in', 'su', 'e', 'a', 'il', 'la', 'lo', 'le', 'gli', 'i',
  'with', 'the', 'on', 'of', 'and', 'to', 'de', 'el', 'los', 'las', 'en', 'y', 'du', 'des', 'et', 'au', 'mit', 'der', 'die', 'das', 'am', 'an', 'und', 'x']);
const impTok = x => norm(x).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w && !IMP_STOP.has(w));
let impIndex = null;
function impIdx() {
  if (impIndex) return impIndex;
  const langs = Object.keys(EXLIB.labels);
  // una voce per variante: parole del nome in ogni lingua (con l'attrezzo nella stessa lingua)
  impIndex = Object.entries(VAR).map(([id, {b, v}]) => ({id, base: b.id, first: b.variants[0] === v,
    names: new Set([...Object.values(v.name), ...Object.values(b.name)].map(norm)),
    toks: langs.filter(l => v.name[l]).map(l => [...new Set([...impTok(v.name[l]), ...impTok(EXLIB.labels[l].eq[v.eq] || '')])])}));
  return impIndex;
}
// due parole coincidono se sono uguali o hanno la stessa radice (manubrio/manubri, curls/curl)
const impSame = (a, b) => a === b || (a.length > 4 && b.length > 4 && a.slice(0, 5) === b.slice(0, 5));
// movimenti "di riferimento": a parità di nome vince la loro variante principale (squat → back squat, non front squat)
const IMP_PRIOR = new Set(['quads.backSquat', 'chest.benchPress', 'fullbody.deadlift', 'shoulders.overheadPress', 'back.bentOverRow', 'back.pullUp', 'back.latPulldown',
  'biceps.curl', 'hams.hipThrust', 'quads.legPress', 'calves.standingCalfRaise', 'triceps.pushdown', 'triceps.dip', 'quads.lunge']);
// migliori candidati della libreria per un nome scritto a mano, in qualunque delle 5 lingue
function impMatch(name, n = 5) {
  const q = impTok(name), nn = norm(name);
  if (!q.length) return [];
  return impIdx().map(x => {
    if (x.names.has(nn)) return {id: x.id, s: x.first ? 1 : .99};
    const s = Math.max(...x.toks.map(tk => { const hit = q.filter(w => tk.some(v => impSame(w, v))).length; return hit ? .7 * hit / q.length + .3 * hit / tk.length : 0; }));
    return {id: x.id, s: s ? Math.min(.99, s + (x.first ? (IMP_PRIOR.has(x.base) ? .12 : .01) : 0)) : 0};
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n);
}
const impAuto = name => { const m = impMatch(name, 1)[0]; return m && m.s >= .8 ? m.id : ''; };
const impNameOf = (lib, orig) => {
  if (!lib || !VAR[lib]) return orig;
  const used = db.sessions.flatMap(s => s.exercises).find(e => e.lib === lib);
  return used ? used.name : tx(VAR[lib].v.name);
};

// ---------- 1. scheda letta dall'AI ----------
const IMP_PROMPT = `Read the attached workout plan (photo, screenshot or PDF). Reply ONLY with one JSON code block, no other text, in exactly this format:
{"name": "plan name", "days": [{"name": "1 - Chest and shoulders", "exercises": [{"name": "exercise name exactly as written", "sets": 4, "reps": "8-10", "rest": 90, "kg": 60, "note": ""}]}],
 "history": [{"date": "YYYY-MM-DD", "week": 1, "day": 1, "exercises": [{"name": "exercise name exactly as written", "sets": [{"reps": 8, "kg": 60}]}]}]}
Rules:
- One item in "days" for every training day, in the order of the plan. Keep day names and exercise names exactly as written (same language).
- "reps" as written ("8-10", "12", "30 s"). "rest" in seconds. "kg" = the starting weight if written. Use null for anything not written: never invent values.
- If the plan already contains workouts that were done (weights or reps filled in per week or per date), add each done workout to "history": "day" = its number in "days" (1 = first), "week" = week number, "date" = the real date if written, otherwise null. One item in "sets" for every set done.
- If nothing has been done yet, "history" is [].`;

function sheetImportPlan() {
  sheet(`<h2>${t('impTitle')}</h2>
    <ol class="impsteps"><li>${t('impStep1')}</li><li>${t('impStep2')}</li><li>${t('impStep3')}</li></ol>
    <button class="btn p wide" data-act="impcopy">${icon('share')} ${t('impCopy')}</button><div class="gap"></div>
    <form data-form="impaste"><label class="field">${t('impPaste')}<textarea name="x" rows="5" placeholder='{"name": …}'></textarea></label>
    <button class="btn s wide" style="background:var(--fill)">${t('impRead')}</button></form>
    <p class="note" style="padding-top:12px">${t('impPrivacy')}</p>`);
}
function impCopy() {
  const done = () => toast(t('impCopied'));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(IMP_PROMPT).then(done, () => impShowPrompt());
  else impShowPrompt();
}
function impShowPrompt() {
  sheet(`<h2>${t('impCopy')}</h2><p class="sub" style="margin-bottom:8px">${t('impSelectAll')}</p>
    <textarea class="impprompt" rows="12" readonly>${esc(IMP_PROMPT)}</textarea><div class="gap"></div>
    <button class="btn s wide" data-act="impplan" style="background:var(--fill)">${t('back')}</button>`);
  const ta = document.querySelector('.impprompt'); ta.focus(); ta.select();
}
// legge la risposta dell'AI: accetta testo intorno, blocchi ```json, virgole finali
function impParse(txt) {
  const s = String(txt || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o;
  try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) {
    try { o = JSON.parse(s.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch (e2) { return null; }
  }
  if (!o || !Array.isArray(o.days) || !o.days.length) return null;
  const n = v => { const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : null; };
  const days = o.days.filter(d => d && Array.isArray(d.exercises)).map((d, i) => ({
    name: String(d.name || t('starterDay', i + 1)).slice(0, 40),
    ex: d.exercises.filter(e => e && e.name).map(e => ({orig: String(e.name).slice(0, 60), sets: Math.max(1, Math.min(10, Math.round(n(e.sets) || 3))),
      reps: String(e.reps == null ? '8–12' : e.reps).replace(/\s*-\s*/, '–').slice(0, 12), rest: n(e.rest) ? Math.round(n(e.rest)) : 0, kg: n(e.kg), note: String(e.note || '').slice(0, 120)}))}))
    .filter(d => d.ex.length);
  if (!days.length) return null;
  const hist = (Array.isArray(o.history) ? o.history : []).filter(h => h && Array.isArray(h.exercises)).map(h => ({
    date: /^\d{4}-\d\d-\d\d$/.test(h.date || '') ? h.date : null, week: Math.max(1, Math.round(n(h.week) || 1)), day: Math.max(1, Math.round(n(h.day) || 1)),
    ex: h.exercises.filter(e => e && e.name && Array.isArray(e.sets)).map(e => ({orig: String(e.name).slice(0, 60),
      sets: e.sets.map(z => z && {reps: Math.round(n(z.reps) || 0), kg: n(z.kg) || 0}).filter(z => z && z.reps > 0 && z.reps <= MAX_REPS && z.kg >= 0 && z.kg <= MAX_KG)})).filter(e => e.sets.length)}))
    .filter(h => h.ex.length && !(h.date && h.date > today()));
  return {name: String(o.name || t('impDefaultName')).slice(0, 50), days, hist};
}
let imp = null;  // import in corso: {name, days, hist, map: {nome scritto → id libreria o ''}}
function impStart(txt) {
  const r = impParse(txt);
  if (!r) return alert(t('impBad'));
  const map = {};
  [...r.days.flatMap(d => d.ex), ...r.hist.flatMap(h => h.ex)].forEach(e => { const k = norm(e.orig); if (!(k in map)) map[k] = impAuto(e.orig); });
  imp = {...r, map};
  sheetImportPreview();
}
// select con i candidati della libreria per un nome
function impSelect(orig, cur, attr) {
  const opts = impMatch(orig, 6).filter(m => m.s > .15);
  if (cur && !opts.some(m => m.id === cur)) opts.unshift({id: cur});
  return `<select ${attr}><option value="">${esc(t('impAsWritten'))}</option>${opts.map(m =>
    `<option value="${m.id}" ${m.id === cur ? 'selected' : ''}>${esc(tx(VAR[m.id].v.name))}</option>`).join('')}</select>`;
}
function sheetImportPreview() {
  const r = imp, undated = r.hist.filter(h => !h.date), weeks = Math.max(1, ...r.hist.map(h => h.week));
  const start = addDays(weekOf(today()), -7 * weeks);
  const exRow = (e, i, j) => `<div class="improw"><div class="sub">${esc(e.orig)}</div>
    ${impSelect(e.orig, r.map[norm(e.orig)], `data-impmap="${esc(norm(e.orig))}"`)}
    <div class="opts three"><label class="field">${t('setsL')}<input data-imp="sets" data-i="${i}" data-j="${j}" inputmode="numeric" value="${e.sets}"></label>
      <label class="field">${t('repsRange')}<input data-imp="reps" data-i="${i}" data-j="${j}" value="${esc(e.reps)}"></label>
      <label class="field">${t('restL')}<input data-imp="rest" data-i="${i}" data-j="${j}" inputmode="numeric" value="${e.rest || ''}"></label></div></div>`;
  const histOnly = [...new Set(r.hist.flatMap(h => h.ex.map(e => norm(e.orig))))].filter(k => !r.days.some(d => d.ex.some(e => norm(e.orig) === k)));
  const nSets = r.hist.reduce((a, h) => a + h.ex.reduce((b, e) => b + e.sets.length, 0), 0);
  sheet(`<h2>${t('impCheck')}</h2><p class="sub" style="margin-bottom:10px">${t('impCheckSub')}</p>
    <form data-form="impsave">
    <label class="field">${t('planName')}<input name="pn" value="${esc(r.name)}" maxlength="50"></label>
    ${r.days.map((d, i) => `<div class="dcard"><label class="field">${t('dayName')} ${i + 1}<input data-impday="${i}" value="${esc(d.name)}" maxlength="40"></label>
      ${d.ex.map((e, j) => exRow(e, i, j)).join('')}</div>`).join('')}
    ${r.hist.length ? `<p class="glabel">${t('impHistory')}</p><div class="dcard"><p>${t('impHistN', r.hist.length, nSets)}</p>
      ${undated.length ? `<p class="sub" style="margin:6px 0 8px">${t('impNoDates', undated.length)}</p>
        <div class="opts"><label class="field">${t('impStartDate')}<input type="date" name="sd" value="${start}" max="${today()}"></label>
        <label class="field">${t('impPerWeek')}<select name="pw">${[2, 3, 4, 5, 6].map(k => `<option ${k === Math.min(6, Math.max(2, r.days.length)) ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>` : ''}
      ${histOnly.map(k => { const e = r.hist.flatMap(h => h.ex).find(x => norm(x.orig) === k);
        return `<div class="improw"><div class="sub">${esc(e.orig)}</div>${impSelect(e.orig, r.map[k], `data-impmap="${esc(k)}"`)}</div>`; }).join('')}</div>` : ''}
    <button class="btn p wide" style="margin-top:6px">${r.hist.length ? t('impSaveBoth', r.hist.length) : t('impSave')}</button></form>`);
}
// giorni della settimana per k allenamenti, distribuiti (3 → lun, mer, ven)
const impOffsets = k => ({2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5]})[k] || [0, 2, 4];
// una seduta con stessa data e stessi esercizi c'è già: non la duplica
const impDup = s => db.sessions.some(x => x.date === s.date && x.exercises.length === s.exercises.length &&
  x.exercises.every((e, i) => gk(e) === gk(s.exercises[i]) && e.sets.length === s.exercises[i].sets.length));
function impSave(f) {
  const r = imp; if (!r) return;
  document.querySelectorAll('[data-impmap]').forEach(el => { r.map[el.dataset.impmap] = el.value; });
  document.querySelectorAll('[data-impday]').forEach(el => { r.days[+el.dataset.impday].name = el.value.trim() || r.days[+el.dataset.impday].name; });
  document.querySelectorAll('[data-imp]').forEach(el => {
    const e = r.days[+el.dataset.i].ex[+el.dataset.j], v = el.value.trim();
    if (el.dataset.imp === 'sets') e.sets = Math.max(1, Math.min(10, parseInt(v, 10) || e.sets));
    else if (el.dataset.imp === 'reps') e.reps = v ? v.replace(/\s*[-–—]\s*/, '–') : e.reps;
    else e.rest = parseInt(v, 10) || 0;
  });
  const lib = o => r.map[norm(o)] || '';
  const p = {id: uid() + uid(), own: true, name: (f.pn.value.trim() || r.name).slice(0, 50), author: nick(), role: t('roleDefault'), note: '', food: '', got: today(),
    days: r.days.map(d => ({name: d.name, ex: d.ex.map(e => ({lib: lib(e.orig), n: impNameOf(lib(e.orig), e.orig), sets: e.sets, reps: e.reps,
      rest: e.rest || restFor(e.reps), note: [e.note, e.kg ? t('impStartKg', fmtKg(e.kg)) : ''].filter(Boolean).join(' · ')}))}))};
  // stesso nome di una scheda tua già presente: la aggiorna (stesso id, così le sedute restano collegate)
  const same = planList().find(x => x.own && key(x.name) === key(p.name));
  if (same) { p.id = same.id; p.got = same.got || p.got; p.note = same.note || p.note; p.food = same.food || p.food; }
  // storico: date reali o distribuite dalla data d'inizio
  const sd = f.sd && f.sd.value, pw = f.pw ? +f.pw.value : 3, off = impOffsets(pw);
  let added = 0, skipped = 0;
  r.hist.forEach((h, k) => {
    let date = h.date;
    if (!date) { const n = r.hist.filter(x => !x.date).indexOf(h); date = addDays(sd || today(), Math.floor(n / off.length) * 7 + off[n % off.length]); }
    if (date > today()) return;
    const di = Math.min(r.days.length, h.day) - 1, s = {id: uid(), name: r.days[di] ? r.days[di].name : p.name, date, plan: {id: p.id, day: Math.max(0, di)},
      exercises: h.ex.map(e => ({id: uid(), name: impNameOf(lib(e.orig), e.orig), ...(lib(e.orig) ? {lib: lib(e.orig)} : {}), sets: e.sets.map(z => ({...z}))}))};
    if (impDup(s)) { skipped++; return; }
    db.sessions.push(s); added++;
  });
  plans()[p.id] = p; imp = null; save(); closeSheet();
  go({name: 'home', tab: 'today'});
  toast((added ? t('impDoneHist', esc(p.name), added) : t('impDone', esc(p.name))) + (skipped ? ' ' + t('impSkipped', skipped) : ''));
}

// ---------- 3. storico da altre app (CSV di Strong, Hevy, FitNotes…) ----------
function csvRows(txt) {
  // separatore: virgola, punto e virgola o tabulazione (Hevy a volte esporta .tsv)
  const first = txt.split(/\r?\n/, 1)[0], cnt = c => first.split(c).length, sep = [',', ';', '\t'].sort((x, y) => cnt(y) - cnt(x))[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const IMP_MON = {jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, gen: 1, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, dic: 12};
// date nei formati delle app più diffuse → {date: 'YYYY-MM-DD', at: ms}
function csvDate(v) {
  const s = String(v || '').trim(), p2 = x => String(x).padStart(2, '0');
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/), y, mo, d, h = 18, mi = 0;
  if (m) [, y, mo, d] = m, m[4] && (h = +m[4], mi = +m[5]);
  else if ((m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})(?:,? (\d{1,2}):(\d{2}))?/))) { d = m[1]; mo = IMP_MON[m[2].toLowerCase()]; y = m[3]; if (m[4]) { h = +m[4]; mi = +m[5]; } }
  else if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:,? (\d{1,2}):(\d{2}))?/))) { d = m[1]; mo = m[2]; y = m[3]; if (m[4]) { h = +m[4]; mi = +m[5]; } }
  else return null;
  if (!mo || +mo > 12 || +d > 31) return null;
  const date = `${y}-${p2(mo)}-${p2(d)}`;
  return {date, at: new Date(`${date}T${p2(h)}:${p2(mi)}`).getTime()};
}
function csvParse(txt) {
  const rows = csvRows(String(txt).replace(/^﻿/, ''));
  if (rows.length < 2) return null;
  const head = rows[0].map(h => norm(h)), col = (...ks) => head.findIndex(h => ks.some(k => h === k || h.startsWith(k)));
  const cDate = col('date', 'start_time', 'data', 'fecha'), cEx = col('exercise name', 'exercise_title', 'exercise', 'esercizio', 'ejercicio');
  const cKg = col('weight_kg', 'weight (kg', 'weight', 'peso', 'kg'), cLb = col('weight_lbs', 'weight (lb'), cReps = col('reps', 'ripetizioni', 'repeticiones');
  const cName = col('workout name', 'title', 'workout', 'routine'), cType = col('set_type'), cUnit = col('weight unit', 'unit');
  if (cDate < 0 || cEx < 0 || cReps < 0 || (cKg < 0 && cLb < 0)) return null;
  const lbHead = cKg < 0 || /lb/.test(head[cKg]);
  const sess = new Map(); let bad = 0;
  rows.slice(1).forEach(r => {
    const dd = csvDate(r[cDate]), ex = (r[cEx] || '').trim(), reps = Math.round(parseFloat(String(r[cReps] || '').replace(',', '.')));
    let kg = parseFloat(String(r[cKg >= 0 ? cKg : cLb] || '0').replace(',', '.')) || 0;
    if (cType >= 0 && /warm/i.test(r[cType] || '')) return;  // riscaldamento: non è una serie allenante
    if (!dd || !ex || !(reps > 0)) { bad++; return; }
    const lb = cUnit >= 0 ? /lb/i.test(r[cUnit] || '') : lbHead;
    const name = cName >= 0 && r[cName] ? r[cName].trim() : t('impCsvWorkout');
    const k = dd.date + '|' + name;
    if (!sess.has(k)) sess.set(k, {date: dd.date, name, at: dd.at, ex: new Map()});
    const s = sess.get(k);
    if (!s.ex.has(ex)) s.ex.set(ex, []);
    s.ex.get(ex).push({reps, kg, lb, at: dd.at + s.ex.get(ex).length * 120e3});
  });
  if (!sess.size) return null;
  return {sessions: [...sess.values()].sort((a, b) => a.date.localeCompare(b.date)), bad, lb: [...sess.values()].some(s => [...s.ex.values()].some(z => z.some(x => x.lb)))};
}
let csvImp = null;
function csvStart(inp) {
  const f = inp.files[0]; inp.value = ''; if (!f) return;
  f.text().then(txt => {
    const r = csvParse(txt);
    if (!r) return alert(t('impCsvBad'));
    const map = {};
    r.sessions.forEach(s => s.ex.forEach((_, n) => { const k = norm(n); if (!(k in map)) map[k] = impAuto(n); }));
    csvImp = {...r, map}; sheetCsvPreview();
  }).catch(() => alert(t('impCsvBad')));
}
function sheetCsvPreview() {
  const r = csvImp, names = [...new Map(r.sessions.flatMap(s => [...s.ex.keys()]).map(n => [norm(n), n])).values()];
  const sets = r.sessions.reduce((a, s) => a + [...s.ex.values()].reduce((b, z) => b + z.length, 0), 0);
  sheet(`<h2>${t('impCsvTitle')}</h2>
    <p>${t('impCsvFound', r.sessions.length, sets, fmtShort(r.sessions[0].date).replace(/\.$/, ''), fmtShort(r.sessions[r.sessions.length - 1].date).replace(/\.$/, ''))}</p>
    ${r.bad ? `<p class="sub">${t('impCsvBadRows', r.bad)}</p>` : ''}
    <form data-form="csvsave">
    ${r.lb ? `<label class="field">${t('impUnit')}<select name="u"><option value="lb" selected>lb → kg</option><option value="kg">kg</option></select></label>` : ''}
    <p class="glabel">${t('impMatchEx', names.length)}</p>
    <div class="dcard">${names.map(n => `<div class="improw"><div class="sub">${esc(n)}</div>${impSelect(n, r.map[norm(n)], `data-impmap="${esc(norm(n))}"`)}</div>`).join('')}</div>
    <button class="btn p wide">${t('impCsvSave', r.sessions.length)}</button></form>`);
}
function csvSave(f) {
  const r = csvImp; if (!r) return;
  document.querySelectorAll('[data-impmap]').forEach(el => { r.map[el.dataset.impmap] = el.value; });
  const toKg = f.u && f.u.value === 'lb', lib = n => r.map[norm(n)] || '';
  let added = 0, skipped = 0;
  r.sessions.forEach(x => {
    const s = {id: uid(), name: x.name, date: x.date, exercises: [...x.ex.entries()].map(([n, z]) => ({id: uid(), name: impNameOf(lib(n), n), ...(lib(n) ? {lib: lib(n)} : {}),
      sets: z.map(y => ({reps: Math.min(MAX_REPS, y.reps), kg: Math.min(MAX_KG, Math.round((y.lb && toKg ? y.kg * .45359237 : y.kg) * 4) / 4), at: y.at}))}))};
    if (impDup(s)) { skipped++; return; }
    db.sessions.push(s); added++;
  });
  csvImp = null; save(); closeSheet(); go({name: 'home', tab: 'progress'});
  toast(t('impCsvDone', added) + (skipped ? ' ' + t('impSkipped', skipped) : ''));
}
function sheetImportCsv() {
  sheet(`<h2>${t('impCsvTitle')}</h2><p class="sub" style="margin-bottom:12px">${t('impCsvHow')}</p>
    <button class="btn p wide" data-act="csvpick">${t('impCsvPick')}</button>
    <input type="file" id="csv-in" accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain" hidden>`);
  document.getElementById('csv-in').onchange = e => csvStart(e.target);
}

// azioni e moduli si registrano quando app.js (caricato dopo) ha creato acts e forms
addEventListener('DOMContentLoaded', () => {
Object.assign(acts, {
  impplan: sheetImportPlan,
  impcopy: impCopy,
  impcsv: sheetImportCsv,
  csvpick: () => document.getElementById('csv-in').click(),
});
Object.assign(forms, {
  impaste: f => impStart(f.x.value),
  impsave: impSave,
  csvsave: csvSave,
});
});

// testi dell'import, uniti al dizionario principale (i18n.js è già caricato)
const IMP_TXT = {
  it: {impPlanBtn: 'Importa da foto o PDF', impCsvBtn: 'Importa storico da altre app (CSV)', impTitle: 'Importa la tua scheda',
    impStep1: 'Tocca <b>Copia le istruzioni</b>.', impStep2: 'Apri la versione gratuita di ChatGPT, Gemini o Claude, allega la foto o il PDF della scheda e incolla le istruzioni.', impStep3: 'Copia la risposta e incollala qui sotto.',
    impCopy: 'Copia le istruzioni', impCopied: 'Istruzioni copiate: incollale nell’app AI insieme alla foto', impSelectAll: 'Seleziona tutto il testo e copialo.', impPaste: 'Risposta dell’AI', impRead: 'Leggi la scheda',
    impPrivacy: 'Gratis: basta la versione gratuita dell’app AI, senza abbonamento. Questa app non invia nulla: la foto la carichi tu nell’app AI che preferisci.',
    impBad: 'Non trovo una scheda in questo testo. Incolla tutta la risposta dell’AI (il blocco tra parentesi graffe).', impDefaultName: 'La mia scheda', impAsWritten: 'Nome così com’è (non conta per recupero e libreria)',
    impCheck: 'Controlla la scheda', impCheckSub: 'Correggi se serve: scegli l’esercizio giusto della libreria, così progressi e recupero funzionano al meglio.', impHistory: 'Allenamenti già fatti',
    impHistN: (n, s) => `${n} ${n === 1 ? 'seduta' : 'sedute'} con ${s} serie da aggiungere allo storico.`, impNoDates: n => `${n} senza data: scegli quando hai iniziato e quante volte a settimana ti alleni.`,
    impStartDate: 'Inizio', impPerWeek: 'Volte a settimana', impSaveBoth: n => `Salva programma e ${n} ${n === 1 ? 'seduta' : 'sedute'}`, impSave: 'Salva programma', impStartKg: k => `partenza ${k} kg`,
    impDone: p => `Programma «${p}» salvato: lo trovi in Oggi`, impDoneHist: (p, n) => `Programma «${p}» salvato con ${n} ${n === 1 ? 'seduta' : 'sedute'} nello storico`, impSkipped: n => `(${n} già presenti, saltate)`,
    impCsvTitle: 'Storico da altre app', impCsvHow: 'Esporta i tuoi allenamenti in CSV dall’app che usavi (Strong, Hevy, FitNotes…: di solito in Impostazioni → Esporta dati; Hevy lo invia per email), poi scegli il file qui. Tutto avviene sul telefono, gratis.',
    impCsvPick: 'Scegli il file CSV', impCsvBad: 'Non riesco a leggere questo file: servono almeno le colonne data, esercizio, peso e ripetizioni.', impCsvWorkout: 'Allenamento',
    impCsvFound: (n, s, a, b) => `${n} ${n === 1 ? 'seduta' : 'sedute'} e ${s} serie, dal ${a} al ${b}.`, impCsvBadRows: n => `${n} righe senza dati validi saranno saltate.`, impUnit: 'Unità dei pesi nel file',
    impMatchEx: n => `Abbina gli esercizi (${n})`, impCsvSave: n => `Importa ${n} ${n === 1 ? 'seduta' : 'sedute'}`, impCsvDone: n => `${n} ${n === 1 ? 'seduta importata' : 'sedute importate'} nello storico`},
  en: {impPlanBtn: 'Import from photo or PDF', impCsvBtn: 'Import history from other apps (CSV)', impTitle: 'Import your plan',
    impStep1: 'Tap <b>Copy instructions</b>.', impStep2: 'Open the free version of ChatGPT, Gemini or Claude, attach the photo or PDF of your plan and paste the instructions.', impStep3: 'Copy the answer and paste it below.',
    impCopy: 'Copy instructions', impCopied: 'Instructions copied: paste them in the AI app together with the photo', impSelectAll: 'Select all the text and copy it.', impPaste: 'AI answer', impRead: 'Read the plan',
    impPrivacy: 'Free: the free version of the AI app is enough, no subscription. This app sends nothing: you upload the photo to the AI app you prefer.',
    impBad: 'I can’t find a plan in this text. Paste the whole AI answer (the block in curly braces).', impDefaultName: 'My plan', impAsWritten: 'Name as written (not used for recovery and library)',
    impCheck: 'Check the plan', impCheckSub: 'Fix anything if needed: pick the right library exercise so progress and recovery work best.', impHistory: 'Workouts already done',
    impHistN: (n, s) => `${n} ${n === 1 ? 'workout' : 'workouts'} with ${s} sets to add to your history.`, impNoDates: n => `${n} without a date: choose when you started and how many times a week you train.`,
    impStartDate: 'Start', impPerWeek: 'Times a week', impSaveBoth: n => `Save program and ${n} ${n === 1 ? 'workout' : 'workouts'}`, impSave: 'Save program', impStartKg: k => `start ${k} kg`,
    impDone: p => `Program “${p}” saved: you’ll find it in Today`, impDoneHist: (p, n) => `Program “${p}” saved with ${n} ${n === 1 ? 'workout' : 'workouts'} in your history`, impSkipped: n => `(${n} already there, skipped)`,
    impCsvTitle: 'History from other apps', impCsvHow: 'Export your workouts as CSV from the app you used (Strong, Hevy, FitNotes…: usually Settings → Export data; Hevy emails it to you), then pick the file here. Everything happens on your phone, for free.',
    impCsvPick: 'Choose the CSV file', impCsvBad: 'I can’t read this file: it needs at least date, exercise, weight and reps columns.', impCsvWorkout: 'Workout',
    impCsvFound: (n, s, a, b) => `${n} ${n === 1 ? 'workout' : 'workouts'} and ${s} ${s === 1 ? 'set' : 'sets'}, from ${a} to ${b}.`, impCsvBadRows: n => `${n} rows without valid data will be skipped.`, impUnit: 'Weight unit in the file',
    impMatchEx: n => `Match the exercises (${n})`, impCsvSave: n => `Import ${n} ${n === 1 ? 'workout' : 'workouts'}`, impCsvDone: n => `${n} ${n === 1 ? 'workout' : 'workouts'} imported into your history`},
  es: {impPlanBtn: 'Importar desde foto o PDF', impCsvBtn: 'Importar historial de otras apps (CSV)', impTitle: 'Importa tu rutina',
    impStep1: 'Toca <b>Copiar instrucciones</b>.', impStep2: 'Abre la versión gratuita de ChatGPT, Gemini o Claude, adjunta la foto o el PDF de la rutina y pega las instrucciones.', impStep3: 'Copia la respuesta y pégala abajo.',
    impCopy: 'Copiar instrucciones', impCopied: 'Instrucciones copiadas: pégalas en la app de IA junto con la foto', impSelectAll: 'Selecciona todo el texto y cópialo.', impPaste: 'Respuesta de la IA', impRead: 'Leer la rutina',
    impPrivacy: 'Gratis: basta con la versión gratuita de la app de IA, sin suscripción. Esta app no envía nada: tú subes la foto a la app de IA que prefieras.',
    impBad: 'No encuentro una rutina en este texto. Pega toda la respuesta de la IA (el bloque entre llaves).', impDefaultName: 'Mi rutina', impAsWritten: 'Nombre tal cual (no cuenta para recuperación y biblioteca)',
    impCheck: 'Revisa la rutina', impCheckSub: 'Corrige si hace falta: elige el ejercicio correcto de la biblioteca para que progresos y recuperación funcionen mejor.', impHistory: 'Entrenos ya hechos',
    impHistN: (n, s) => `${n} ${n === 1 ? 'entreno' : 'entrenos'} con ${s} series para añadir al historial.`, impNoDates: n => `${n} sin fecha: elige cuándo empezaste y cuántas veces por semana entrenas.`,
    impStartDate: 'Inicio', impPerWeek: 'Veces por semana', impSaveBoth: n => `Guardar programa y ${n} ${n === 1 ? 'entreno' : 'entrenos'}`, impSave: 'Guardar programa', impStartKg: k => `inicio ${k} kg`,
    impDone: p => `Programa «${p}» guardado: lo encontrarás en Hoy`, impDoneHist: (p, n) => `Programa «${p}» guardado con ${n} ${n === 1 ? 'entreno' : 'entrenos'} en el historial`, impSkipped: n => `(${n} ya existentes, omitidos)`,
    impCsvTitle: 'Historial de otras apps', impCsvHow: 'Exporta tus entrenos en CSV desde la app que usabas (Strong, Hevy, FitNotes…: normalmente Ajustes → Exportar datos; Hevy lo envía por email) y elige el archivo aquí. Todo ocurre en tu teléfono, gratis.',
    impCsvPick: 'Elegir el archivo CSV', impCsvBad: 'No puedo leer este archivo: necesita al menos columnas de fecha, ejercicio, peso y repeticiones.', impCsvWorkout: 'Entreno',
    impCsvFound: (n, s, a, b) => `${n} ${n === 1 ? 'entreno' : 'entrenos'} y ${s} ${s === 1 ? 'serie' : 'series'}, del ${a} al ${b}.`, impCsvBadRows: n => `Se omitirán ${n} filas sin datos válidos.`, impUnit: 'Unidad de peso del archivo',
    impMatchEx: n => `Asocia los ejercicios (${n})`, impCsvSave: n => `Importar ${n} ${n === 1 ? 'entreno' : 'entrenos'}`, impCsvDone: n => `${n} ${n === 1 ? 'entreno importado' : 'entrenos importados'} al historial`},
  fr: {impPlanBtn: 'Importer depuis une photo ou un PDF', impCsvBtn: 'Importer l’historique d’autres apps (CSV)', impTitle: 'Importer votre programme',
    impStep1: 'Touchez <b>Copier les instructions</b>.', impStep2: 'Ouvrez la version gratuite de ChatGPT, Gemini ou Claude, joignez la photo ou le PDF du programme et collez les instructions.', impStep3: 'Copiez la réponse et collez-la ci-dessous.',
    impCopy: 'Copier les instructions', impCopied: 'Instructions copiées : collez-les dans l’app d’IA avec la photo', impSelectAll: 'Sélectionnez tout le texte et copiez-le.', impPaste: 'Réponse de l’IA', impRead: 'Lire le programme',
    impPrivacy: 'Gratuit : la version gratuite de l’app d’IA suffit, sans abonnement. Cette app n’envoie rien : c’est vous qui chargez la photo dans l’app d’IA de votre choix.',
    impBad: 'Je ne trouve pas de programme dans ce texte. Collez toute la réponse de l’IA (le bloc entre accolades).', impDefaultName: 'Mon programme', impAsWritten: 'Nom tel quel (non utilisé pour la récupération et la bibliothèque)',
    impCheck: 'Vérifiez le programme', impCheckSub: 'Corrigez si besoin : choisissez le bon exercice de la bibliothèque pour que progrès et récupération fonctionnent au mieux.', impHistory: 'Séances déjà faites',
    impHistN: (n, s) => `${n} ${n === 1 ? 'séance' : 'séances'} avec ${s} séries à ajouter à l’historique.`, impNoDates: n => `${n} sans date : choisissez quand vous avez commencé et combien de fois par semaine vous vous entraînez.`,
    impStartDate: 'Début', impPerWeek: 'Fois par semaine', impSaveBoth: n => `Enregistrer le programme et ${n} ${n === 1 ? 'séance' : 'séances'}`, impSave: 'Enregistrer le programme', impStartKg: k => `départ ${k} kg`,
    impDone: p => `Programme « ${p} » enregistré : il est dans Aujourd’hui`, impDoneHist: (p, n) => `Programme « ${p} » enregistré avec ${n} ${n === 1 ? 'séance' : 'séances'} dans l’historique`, impSkipped: n => `(${n} déjà présentes, ignorées)`,
    impCsvTitle: 'Historique d’autres apps', impCsvHow: 'Exportez vos séances en CSV depuis l’app que vous utilisiez (Strong, Hevy, FitNotes… : en général Réglages → Exporter les données ; Hevy l’envoie par e-mail), puis choisissez le fichier ici. Tout se passe sur votre téléphone, gratuitement.',
    impCsvPick: 'Choisir le fichier CSV', impCsvBad: 'Je ne peux pas lire ce fichier : il faut au moins les colonnes date, exercice, poids et répétitions.', impCsvWorkout: 'Séance',
    impCsvFound: (n, s, a, b) => `${n} ${n === 1 ? 'séance' : 'séances'} et ${s} ${s === 1 ? 'série' : 'séries'}, du ${a} au ${b}.`, impCsvBadRows: n => `${n} lignes sans données valides seront ignorées.`, impUnit: 'Unité de poids du fichier',
    impMatchEx: n => `Associez les exercices (${n})`, impCsvSave: n => `Importer ${n} ${n === 1 ? 'séance' : 'séances'}`, impCsvDone: n => `${n} ${n === 1 ? 'séance importée' : 'séances importées'} dans l’historique`},
  de: {impPlanBtn: 'Aus Foto oder PDF importieren', impCsvBtn: 'Verlauf aus anderen Apps importieren (CSV)', impTitle: 'Deinen Plan importieren',
    impStep1: 'Tippe auf <b>Anleitung kopieren</b>.', impStep2: 'Öffne die kostenlose Version von ChatGPT, Gemini oder Claude, hänge Foto oder PDF deines Plans an und füge die Anleitung ein.', impStep3: 'Kopiere die Antwort und füge sie unten ein.',
    impCopy: 'Anleitung kopieren', impCopied: 'Anleitung kopiert: Füge sie zusammen mit dem Foto in die KI-App ein', impSelectAll: 'Markiere den ganzen Text und kopiere ihn.', impPaste: 'Antwort der KI', impRead: 'Plan lesen',
    impPrivacy: 'Kostenlos: Die Gratisversion der KI-App reicht, kein Abo. Diese App sendet nichts: Du lädst das Foto selbst in die KI-App deiner Wahl.',
    impBad: 'In diesem Text finde ich keinen Plan. Füge die ganze Antwort der KI ein (den Block in geschweiften Klammern).', impDefaultName: 'Mein Plan', impAsWritten: 'Name wie geschrieben (zählt nicht für Erholung und Bibliothek)',
    impCheck: 'Plan prüfen', impCheckSub: 'Korrigiere bei Bedarf: Wähle die passende Übung aus der Bibliothek, damit Fortschritt und Erholung am besten funktionieren.', impHistory: 'Bereits gemachte Trainings',
    impHistN: (n, s) => `${n} ${n === 1 ? 'Training' : 'Trainings'} mit ${s} Sätzen für deinen Verlauf.`, impNoDates: n => `${n} ohne Datum: Wähle, wann du angefangen hast und wie oft pro Woche du trainierst.`,
    impStartDate: 'Beginn', impPerWeek: 'Mal pro Woche', impSaveBoth: n => `Programm und ${n} ${n === 1 ? 'Training' : 'Trainings'} speichern`, impSave: 'Programm speichern', impStartKg: k => `Start ${k} kg`,
    impDone: p => `Programm „${p}“ gespeichert: Du findest es unter Heute`, impDoneHist: (p, n) => `Programm „${p}“ mit ${n} ${n === 1 ? 'Training' : 'Trainings'} im Verlauf gespeichert`, impSkipped: n => `(${n} schon vorhanden, übersprungen)`,
    impCsvTitle: 'Verlauf aus anderen Apps', impCsvHow: 'Exportiere deine Trainings als CSV aus der App, die du genutzt hast (Strong, Hevy, FitNotes…: meist Einstellungen → Daten exportieren; Hevy schickt sie per E-Mail), und wähle die Datei hier. Alles passiert auf deinem Handy, kostenlos.',
    impCsvPick: 'CSV-Datei wählen', impCsvBad: 'Diese Datei kann ich nicht lesen: Es braucht mindestens Spalten für Datum, Übung, Gewicht und Wiederholungen.', impCsvWorkout: 'Training',
    impCsvFound: (n, s, a, b) => `${n} ${n === 1 ? 'Training' : 'Trainings'} und ${s} ${s === 1 ? 'Satz' : 'Sätze'}, vom ${a} bis ${b}.`, impCsvBadRows: n => `${n} Zeilen ohne gültige Daten werden übersprungen.`, impUnit: 'Gewichtseinheit in der Datei',
    impMatchEx: n => `Übungen zuordnen (${n})`, impCsvSave: n => `${n} ${n === 1 ? 'Training' : 'Trainings'} importieren`, impCsvDone: n => `${n} ${n === 1 ? 'Training' : 'Trainings'} in den Verlauf importiert`},
};
Object.keys(IMP_TXT).forEach(l => I18N[l] && Object.assign(I18N[l], IMP_TXT[l]));
