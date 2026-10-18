// Guida animata di ogni esercizio: un omino (ragazzo o ragazza) disegnato in SVG, animato per cinematica.
// Pochi schemi di movimento (A) coprono tutta la libreria (GMAP); l'attrezzo della variante (bilanciere, manubri, cavo, macchina...) si disegna da solo.
// Angoli in gradi, misurati dalla verticale verso il basso, positivi verso destra (davanti): 0 = giù, 90 = avanti, 180 = su. Nessuna immagine, nessun server.
// Guida animata di ogni esercizio: un omino (ragazzo o ragazza) disegnato in SVG, animato per cinematica.
// Pochi schemi di movimento (ARCH) coprono tutta la libreria (GMAP). Nessuna immagine, nessun server.
// Angoli in gradi, misurati dalla verticale verso il basso, positivi verso destra (davanti): 0 = giù, 90 = avanti, 180 = su.
const GL = {sh: 38, th: 40, to: 46, ua: 28, fa: 27, ft: 13, nk: 7, hd: 9, hn: 8};
const gv = (a, l) => { const r = a * Math.PI / 180; return [l * Math.sin(r), l * Math.cos(r)]; };
const gadd = (p, v) => [p[0] + v[0], p[1] + v[1]];
const gsub = (p, q) => [p[0] - q[0], p[1] - q[1]];
// due ossa (cosce/stinchi, braccia): dalla radice r verso il bersaglio tg; s sceglie da che parte piega l'articolazione
function gik(r, tg, l1, l2, s) {
  const dx = tg[0] - r[0], dy = tg[1] - r[1], d = Math.hypot(dx, dy) || .001, ux = dx / d, uy = dy / d;
  const dd = Math.min(l1 + l2 - .01, Math.max(Math.abs(l1 - l2) + .5, d));
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return {m: [r[0] + ux * a - s * uy * h, r[1] + uy * a + s * ux * h], e: [r[0] + ux * dd, r[1] + uy * dd]};
}
// posa → posizione di tutte le articolazioni. Campi: hip|sho (ancora), to (busto), foot/foot2 (caviglie) oppure th/sh/th2/sh2,
// hand/hand2 (mani nel mondo) | hr/hr2 (mani rispetto alla spalla, nel sistema del busto) | ua/fa/ua2/fa2, abs, sl, hd, ft/ft2
function gsolve(p) {
  const hip = p.sho ? gsub(p.sho, gv(p.to, GL.to)) : p.hip;
  const s0 = gadd(hip, gv(p.to, GL.to)), sho = [s0[0], s0[1] - (p.sl || 0)];
  const leg = (f, th, sh) => {
    if (th != null) { const k = gadd(hip, gv(th, GL.th)); return {k, a: gadd(k, gv(sh, GL.sh))}; }
    const r = gik(hip, f, GL.th, GL.sh, -1); return {k: r.m, a: r.e};
  };
  const l1 = leg(p.foot, p.th, p.sh);
  const l2 = leg(p.foot2 || p.foot, p.th2 != null ? p.th2 : p.th, p.sh2 != null ? p.sh2 : p.sh);
  const dl = p.abs === false ? p.to - 180 : 0;
  const rot = v => gv(Math.atan2(v[0], v[1]) * 180 / Math.PI + dl, Math.hypot(v[0], v[1]));
  const arm = (hand, hr, ua, fa, hs) => {
    if (ua != null) { const e = gadd(sho, gv(ua + dl, GL.ua)); return {e, w: gadd(e, gv(fa + dl, GL.fa))}; }
    const r = gik(sho, hs ? gadd(sho, hs) : hand || gadd(sho, rot(hr)), GL.ua, GL.fa, p.es || 1); return {e: r.m, w: r.e};
  };
  const a1 = arm(p.hand, p.hr, p.ua, p.fa, p.hs);
  const a2 = arm(p.hand2 || p.hand, p.hr2 || p.hr, p.ua2 != null ? p.ua2 : p.ua, p.fa2 != null ? p.fa2 : p.fa, p.hs2 || p.hs);
  const hdA = p.to + (p.hd || 0), neck = gadd(sho, gv(hdA, GL.nk)), head = gadd(sho, gv(hdA, GL.nk + GL.hd));
  const ft = p.ft == null ? 90 : p.ft, ft2 = p.ft2 == null ? ft : p.ft2;
  return {hip, sho, neck, head, k: l1.k, a: l1.a, k2: l2.k, a2: l2.a, toe: gadd(l1.a, gv(ft, GL.ft)), toe2: gadd(l2.a, gv(ft2, GL.ft)),
    e: a1.e, w: a1.w, e2: a2.e, w2: a2.w, hdA,
    h: p.hnd != null ? gadd(a1.w, gv(p.hnd, GL.hn)) : a1.w, h2: p.hnd != null ? gadd(a2.w, gv(p.hnd, GL.hn)) : a2.w};
}
const gmix = (a, b, t) => {
  const o = {};
  Object.keys({...a, ...b}).forEach(k => {
    const x = a[k] !== undefined ? a[k] : b[k], y = b[k] !== undefined ? b[k] : a[k];
    o[k] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * t) : typeof x === 'number' && k !== 'es' ? x + (y - x) * t : (t < .5 ? x : y);
  });
  return o;
};
const gease = u => u < .12 ? 0 : u > .88 ? 1 : (x => x * x * (3 - 2 * x))((u - .12) / .76);
// posa nell'istante ms: avanti e indietro (pp) o ciclo continuo (cyc)
function gpose(def, ms) {
  const P = def.poses, n = P.length, seg = def.seg || 1100, st = def.still;
  if (n === 1) return P[0];
  if (st) { const w = Math.sin(ms / 260) * st, q = P[0]; return q.sho ? {...q, sho: [q.sho[0], q.sho[1] + w]} : {...q, hip: [q.hip[0], q.hip[1] + w]}; }
  let ph;
  if (def.loop === 'cyc') { ph = (ms / seg) % n; const i = Math.floor(ph); return gmix(P[i], P[(i + 1) % n], gease(ph - i)); }
  ph = (ms / seg) % (2 * (n - 1)); if (ph > n - 1) ph = 2 * (n - 1) - ph;
  const i = Math.min(n - 2, Math.floor(ph));
  return gmix(P[i], P[i + 1], gease(ph - i));
}

// ---------- scenario e attrezzi ----------
const GF = 149;   // linea del pavimento
const n1 = v => (+v).toFixed(1);
let gln = (a, b, cls = 'gf-prop', w = 2.4) => `<line x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" class="${cls}" stroke-width="${w}"/>`;
let gbench = (x1, y, x2) => `<g class="gf-prop"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="gf-pad" stroke-width="8"/><line x1="${x1 + 6}" y1="${y + 4}" x2="${x1 + 6}" y2="${GF}" stroke-width="3"/><line x1="${x2 - 6}" y1="${y + 4}" x2="${x2 - 6}" y2="${GF}" stroke-width="3"/></g>`;
let gpad = (x1, y1, x2, y2, w = 8) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="gf-prop gf-pad" stroke-width="${w}"/>`;
let gseat = (x, y) => `<g class="gf-prop"><line x1="${x - 12}" y1="${y}" x2="${x + 8}" y2="${y}" class="gf-pad" stroke-width="8"/><line x1="${x - 2}" y1="${y + 4}" x2="${x - 2}" y2="${GF}" stroke-width="3"/></g>`;
let gbox = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="${GF - y}" rx="3" class="gf-prop gf-box" stroke-width="2.4"/>`;
let gwall = x => `<line x1="${x}" y1="-10" x2="${x}" y2="${GF}" class="gf-prop" stroke-width="3"/>`;
let gbars = (x, y, w = 36) => `<g class="gf-prop"><line x1="${x - w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y}" stroke-width="4"/><line x1="${x - w / 2 + 4}" y1="${y}" x2="${x - w / 2 + 4}" y2="${GF}" stroke-width="3"/></g>`;
let gstack = (x, y) => `<g class="gf-prop gf-box" stroke-width="2"><rect x="${x}" y="${y}" width="14" height="40" rx="2"/><line x1="${x}" y1="${y + 10}" x2="${x + 14}" y2="${y + 10}"/><line x1="${x}" y1="${y + 20}" x2="${x + 14}" y2="${y + 20}"/><line x1="${x}" y1="${y + 30}" x2="${x + 14}" y2="${y + 30}"/></g>`;
let gbar = (x, y1, y2) => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="gf-prop" stroke-width="2.4" stroke-dasharray="1 0"/>`;
// attrezzo in mano: dipende dalla variante (eq). o.anchor = dove si aggancia cavo/elastico/macchina
function gtool(pt, eq, o = {}) {
  const [x, y] = [n1(pt[0]), n1(pt[1])], r = o.r || 10, an = o.anchor || [215, 10];
  if (eq === 'dumbbell') return `<circle cx="${x}" cy="${y}" r="${n1(r * .62)}" class="gf-prop gf-fill" stroke-width="2"/>`;
  if (eq === 'kettlebell') return `<circle cx="${x}" cy="${n1(pt[1] + 4)}" r="8" class="gf-prop gf-fill" stroke-width="2"/><path d="M${n1(pt[0] - 5)} ${n1(pt[1] - 2)}a5 5 0 0 1 10 0" class="gf-prop" stroke-width="2.4"/>`;
  if (['barbell', 'ezbar', 'trapbar', 'landmine'].includes(eq)) return `<circle cx="${x}" cy="${y}" r="${r}" class="gf-prop" stroke-width="3.2"/><circle cx="${x}" cy="${y}" r="2.6" class="gf-fill"/>`;
  if (eq === 'smith') return `<line x1="${x}" y1="-14" x2="${x}" y2="${GF}" class="gf-prop" stroke-width="1.4" opacity=".5"/><circle cx="${x}" cy="${y}" r="${r}" class="gf-prop" stroke-width="3.2"/><circle cx="${x}" cy="${y}" r="2.6" class="gf-fill"/>`;
  if (eq === 'plate') return `<circle cx="${x}" cy="${y}" r="${n1(r * .9)}" class="gf-prop gf-fill" stroke-width="2"/>`;
  if (eq === 'cable') return gln(pt, an, 'gf-prop', 1.5) + `<circle cx="${an[0]}" cy="${an[1]}" r="4" class="gf-prop" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" class="gf-fill"/>`;
  if (eq === 'band') return `<path d="M${x} ${y}L${an[0]} ${an[1]}" class="gf-prop" stroke-width="2.4" stroke-dasharray="4 3"/><circle cx="${x}" cy="${y}" r="3" class="gf-fill"/>`;
  if (eq === 'suspension') return gln(pt, [pt[0], -14], 'gf-prop', 1.6) + `<circle cx="${x}" cy="${y}" r="3.4" class="gf-prop gf-fill" stroke-width="1.6"/>`;
  if (eq === 'machine') return gln(pt, an, 'gf-prop', 1.2) + `<circle cx="${x}" cy="${y}" r="4" class="gf-prop gf-fill" stroke-width="2"/>`;
  return '';
}
// il peso a carico del corpo (cintura, caviglie, zaino): un dischetto sull'anca
let gbelt = (pt, eq) => eq === 'plate' || eq === 'dumbbell' ? `<circle cx="${n1(pt[0])}" cy="${n1(pt[1])}" r="6" class="gf-prop gf-fill" stroke-width="2"/>` : '';
// vista 3D (guide3d.js): con G3C attivo gli attrezzi non producono SVG ma vengono raccolti come {t, a: argomenti}
let G3C = null;
{
  const o = {gln, gbench, gpad, gseat, gbox, gwall, gbars, gstack, gbar, gbelt, gtool};
  const w = (n, f) => (...a) => G3C ? (G3C.push({t: n, a}), '') : f(...a);
  gln = w('ln', o.gln); gbench = w('bench', o.gbench); gpad = w('pad', o.gpad); gseat = w('seat', o.gseat); gbox = w('box', o.gbox);
  gwall = w('wall', o.gwall); gbars = w('bars', o.gbars); gstack = w('stack', o.gstack); gbar = w('bar', o.gbar); gbelt = w('belt', o.gbelt); gtool = w('tool', o.gtool);
}

// ---------- disegno ----------
const gpt = p => n1(p[0]) + ' ' + n1(p[1]);
function gfig(S, girl) {
  const far = 'gf-limb gf-far', near = 'gf-limb';
  const leg = (k, a, toe, c, w) => `<path d="M${gpt(S.hip)}L${gpt(k)}L${gpt(a)}L${gpt(toe)}" class="${c}" stroke-width="${w}"/>`;
  const arm = (e, w, c, wd) => `<path d="M${gpt(S.sho)}L${gpt(e)}L${gpt(w)}" class="${c}" stroke-width="${wd}"/>`;
  const pony = girl ? `<path d="M${gpt(gadd(S.head, gv(S.hdA + 270, 7)))}q-9 ${n1(2)} -11 ${n1(11)}" class="gf-limb" stroke-width="3.4"/>` : '';
  return leg(S.k2, S.a2, S.toe2, far, 11) + arm(S.e2, S.w2, far + ' gf-arm', 8) +
    `<path d="M${gpt(S.hip)}L${gpt(S.sho)}" class="gf-limb gf-torso" stroke-width="${girl ? 15 : 18}"/>` +
    leg(S.k, S.a, S.toe, near, 12) + `<path d="M${gpt(S.sho)}L${gpt(S.neck)}" class="gf-limb" stroke-width="5"/>` + pony +
    `<circle cx="${n1(S.head[0])}" cy="${n1(S.head[1])}" r="9.6" class="gf-head"/>` + arm(S.e, S.w, near + ' gf-arm', 9);
}
// vista frontale (alzate laterali, aperture): due braccia che si aprono ai lati
function gfront(P, girl, eq) {
  const c = P.c || [120, 67], lean = P.lean || 0, sy = c[1] - 46 + lean, hy = sy - 15 + lean * .5;
  const hands = [];
  const arm = (side, ang) => { const sx = c[0] + side * 15, e = gadd([sx, sy], gv(side * ang, GL.ua)), w = gadd(e, gv(side * ang, GL.fa)); hands.push(w); return `<path d="M${gpt([sx, sy])}L${gpt(e)}L${gpt(w)}" class="gf-limb" stroke-width="8"/>`; };
  const legs = [-1, 1].map(s => { const a = 5 + (s < 0 ? P.lL || 0 : P.lR || 0), hp = [c[0] + s * 7, c[1]], k = gadd(hp, gv(s * a, 40)), an = gadd(k, gv(s * a, 38));
    return `<path d="M${gpt(hp)}L${gpt(k)}L${gpt(an)}" class="gf-limb" stroke-width="10"/>`; }).join('');
  const body = legs + `<path d="M${gpt([c[0], c[1]])}L${gpt([c[0], sy])}" class="gf-limb gf-torso" stroke-width="${girl ? 22 : 28}"/>` +
    `<circle cx="${n1(c[0])}" cy="${n1(hy)}" r="8.8" class="gf-head"/>` + arm(-1, P.aL) + arm(1, P.aR);
  return body + hands.map((w, i) => gtool(w, eq, {r: 8, anchor: [w[0] + (i ? 40 : -40), 148]})).join('');
}

// ---------- schemi di movimento ----------
// Ogni schema restituisce {poses, bg(eq), fg(S, eq, P)}; bg disegna il banco/macchina dietro l'omino, fg ciò che tiene in mano.
const ST = {hip: [105, 67], to: 178, foot: [105, 145]};
const SUP = {hip: [120, 106], to: 270, foot: [165, 143]};            // supino su panca
const FLR = {hip: [120, 141], to: 270, foot: [160, 145]};            // supino a terra, ginocchia piegate
const HOLD = {back: {hs: [-5, 3], es: -1}, front: {hs: [13, -5], es: -1}, side: {ua: 0, fa: 0}, goblet: {hs: [15, 24], es: 1}};
const AN = {hi: [150, -14], hiBack: [40, -14], lo: [210, 146], loBack: [20, 146], mid: [215, 66], floor: [105, 148]};
const A = {};

// ---- bicipiti e avambracci ----
A.curl = o => {
  const up = o.drag ? {ua: -32, fa: 105} : {ua: 3, fa: 160};
  return {poses: [{...ST, ua: 0, fa: 0}, {...ST, ...up}], fg: (S, eq) => gtool(S.w, eq, {anchor: eq === 'band' ? AN.floor : AN.lo, r: 8})};
};
A.curlIncl = () => ({poses: [{hip: [88, 108], to: 232, foot: [128, 145], ua: 0, fa: 0}, {hip: [88, 108], to: 232, foot: [128, 145], ua: -8, fa: 150}],
  bg: () => gpad(98, 114, 44, 66, 9) + gseat(98, 116), fg: (S, eq) => gtool(S.w, eq, {r: 8})});
A.curlPreacher = () => ({poses: [{hip: [80, 108], to: 176, foot: [122, 145], ua: 42, fa: 48}, {hip: [80, 108], to: 176, foot: [122, 145], ua: 42, fa: 165}],
  bg: () => gseat(80, 112) + gpad(92, 66, 112, 98, 9) + gln([112, 98], [112, GF], 'gf-prop', 3), fg: (S, eq) => gtool(S.w, eq, {anchor: AN.lo, r: 8})});
A.curlConc = () => ({poses: [{hip: [85, 108], to: 150, foot: [122, 145], ua: 6, fa: 0}, {hip: [85, 108], to: 150, foot: [122, 145], ua: 6, fa: 150}],
  bg: () => gseat(85, 112), fg: (S, eq) => gtool(S.w, eq, {anchor: AN.lo, r: 8})});
A.curlSpider = () => ({poses: [{hip: [66, 96], to: 130, foot: [60, 145], ua: 0, fa: 0}, {hip: [66, 96], to: 130, foot: [60, 145], ua: -6, fa: 150}],
  bg: () => gpad(76, 98, 110, 70, 9) + gln([110, 70], [118, GF], 'gf-prop', 3), fg: (S, eq) => gtool(S.w, eq, {r: 8})});
A.wristCurl = o => ({poses: [{hip: [85, 108], to: 150, foot: [122, 145], ua: 10, fa: 82, hnd: o.rev ? 140 : 20}, {hip: [85, 108], to: 150, foot: [122, 145], ua: 10, fa: 82, hnd: o.rev ? 20 : 150}],
  bg: () => gseat(85, 112), fg: (S, eq) => gtool(S.h, eq, {anchor: AN.lo, r: 7})});
A.wristRoller = () => ({poses: [{...ST, ua: 88, fa: 90, hnd: 40, wy: 0}, {...ST, ua: 88, fa: 90, hnd: 130, wy: 1}],
  fg: (S, eq, P) => { const y = S.h[1] + 62 - P.wy * 56; return gln(S.h, [S.h[0], y], 'gf-prop', 1.4) + `<circle cx="${n1(S.h[0])}" cy="${n1(y + 6)}" r="8" class="gf-prop gf-fill" stroke-width="2"/><circle cx="${n1(S.h[0])}" cy="${n1(S.h[1])}" r="3" class="gf-fill"/>`; }});
A.pinch = () => ({poses: [{...ST, ua: 4, fa: 6}], still: .5, fg: (S, eq) => `<circle cx="${n1(S.w[0] + 5)}" cy="${n1(S.w[1] + 5)}" r="11" class="gf-prop gf-fill" stroke-width="3"/>`});
A.gripper = () => ({poses: [{...ST, ua: 6, fa: 100, sq: 0}, {...ST, ua: 6, fa: 100, sq: 1}],
  fg: (S, eq, P) => { const [x, y] = S.w, o = 14 - P.sq * 9; return `<g class="gf-prop" stroke-width="3.4"><line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x + 16)}" y2="${n1(y - o)}"/><line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x + 16)}" y2="${n1(y + o)}"/></g>`; }});
A.hang = () => ({poses: [{sho: [106, 26], to: 182, hand: [112, -28], th: 10, sh: -26}], still: .8, bg: () => `<line x1="92" y1="-28" x2="132" y2="-28" class="gf-prop" stroke-width="4"/>`, fg: (S, eq) => gbelt(S.k, eq)});

// ---- tricipiti ----
A.dip = () => { const b = {to: 178, th: 6, sh: -34, hand: [112, 84]}; return {poses: [{...b, sho: [108, 30]}, {...b, sho: [108, 58]}],
  bg: () => gbars(112, 84, 46), fg: (S, eq) => gbelt(S.hip, eq)}; };
A.benchDip = () => { const b = {to: 184, foot: [152, 145], hand: [76, 102]}; return {poses: [{...b, sho: [80, 50]}, {...b, sho: [80, 76]}],
  bg: () => gbench(50, 108, 96), fg: (S, eq) => gbelt(gadd(S.hip, [8, -3]), eq)}; };
A.pushdown = o => { const b = o.seat ? {hip: [95, 108], to: 176, foot: [135, 145]} : {...ST, to: 172};
  const h0 = o.seat ? [124, 80] : [128, 46], h1 = o.seat ? [114, 116] : [118, 82];
  return {poses: [{...b, hand: h0}, {...b, hand: h1}], bg: o.seat ? () => gseat(95, 112) + gpad(80, 56, 82, 104, 7) : null,
    fg: (S, eq) => gtool(S.w, eq, {anchor: o.seat ? [140, 40] : [135, -14]})}; };
A.skull = () => ({poses: [{...SUP, ua: 186, fa: 186}, {...SUP, ua: 186, fa: 306}], bg: () => gbench(54, 114, 150), fg: (S, eq) => gtool(S.w, eq, {anchor: [10, 140], r: 9})});
A.overheadExt = o => { const b = o.seat ? {hip: [100, 108], to: 178, foot: [140, 145]} : ST;
  return {poses: [{...b, ua: 182, fa: 182}, {...b, ua: 182, fa: 318}], bg: o.seat ? () => gseat(100, 112) + gpad(86, 52, 88, 104, 7) : null,
    fg: (S, eq) => gtool(S.w, eq, {anchor: [60, 146], r: 8})}; };
A.kickback = () => { const b = {hip: [88, 72], to: 122, foot: [105, 145]};
  return {poses: [{...b, ua: 268, fa: 340}, {...b, ua: 268, fa: 268}], fg: (S, eq) => gtool(S.w, eq, {anchor: AN.lo, r: 7})}; };
A.machineExt = () => ({poses: [{hip: [92, 108], to: 176, foot: [134, 145], hand: [122, 70]}, {hip: [92, 108], to: 176, foot: [134, 145], hand: [118, 116]}],
  bg: () => gseat(92, 112) + gpad(77, 52, 79, 104, 7) + gstack(176, 100), fg: (S, eq) => gtool(S.w, 'machine', {anchor: [176, 108]})});

// ---- addome ----
A.crunch = o => { const b = {...FLR, hr: [-4, -14], abs: false}; return {poses: [{...b}, {...b, to: 246, hd: 12}],
  fg: (S, eq) => eq === 'plate' ? `<circle cx="${n1(S.sho[0] + 14)}" cy="${n1(S.sho[1] - 4)}" r="8" class="gf-prop gf-fill" stroke-width="2"/>` : ''}; };
A.cableCrunch = () => { const b = {hip: [95, 100], to: 176, th: 0, sh: 270, hs: [4, -22], es: -1}; return {poses: [b, {...b, to: 122, hd: 20}],
  fg: (S, eq) => gtool(gadd(S.sho, [4, -20]), eq, {anchor: [95, -14]})}; };
A.reverseCrunch = () => ({poses: [{...FLR, hand: [90, 141], th: 180, sh: 120}, {...FLR, hip: [117, 131], hand: [90, 141], th: 150, sh: 108}]});
A.bicycle = () => { const b = {...FLR, to: 250, hr: [-4, -14], abs: false}; return {poses: [{...b, th: 150, sh: 118, th2: 105, sh2: 100}, {...b, th: 105, sh: 100, th2: 150, sh2: 118}], loop: 'cyc', seg: 650}; };
A.situp = () => { const b = {...FLR, hr: [-4, -14], abs: false}; return {poses: [{...b}, {...b, to: 190, hd: 8}],
  fg: (S, eq) => eq === 'plate' ? `<circle cx="${n1(S.sho[0] + 12)}" cy="${n1(S.sho[1] - 6)}" r="8" class="gf-prop gf-fill" stroke-width="2"/>` : ''}; };
A.legRaise = () => { const b = {...FLR, ua: 270, fa: 270}; return {poses: [{...b, th: 92, sh: 92}, {...b, th: 180, sh: 180}]}; };
A.hangRaise = o => { const b = {sho: [105, 26], to: 180, hand: [108, -28]}; return {poses: [{...b, th: 0, sh: 0}, {...b, th: o.knees ? 100 : 88, sh: o.knees ? 20 : 88}],
  bg: () => `<line x1="88" y1="-28" x2="128" y2="-28" class="gf-prop" stroke-width="4"/>`}; };
A.abWheel = () => { const b = {foot: [40, 146]}; return {poses: [{...b, hip: [78, 108], to: 120, hand: [124, 140]}, {...b, hip: [92, 118], to: 98, hand: [172, 140]}],
  fg: (S, eq) => eq === 'suspension' ? gtool(S.w, eq) : `<circle cx="${n1(S.w[0])}" cy="${n1(S.w[1] + 2)}" r="${eq === 'barbell' ? 11 : 8}" class="gf-prop gf-fill" stroke-width="3"/>`}; };
A.pallof = () => { const b = {...ST, to: 176}; return {poses: [{...b, hand: [118, 42]}, {...b, hand: [158, 38]}], fg: (S, eq) => gtool(S.w, eq, {anchor: [28, 42]})}; };
A.twist = () => { const b = {hip: [100, 134], to: 214, foot: [150, 112]}; return {poses: [{...b, hand: [142, 96]}, {...b, hand: [134, 124]}], loop: 'cyc', seg: 700, fg: (S, eq) => gtool(S.w, eq, {r: 9})}; };
A.chop = o => { const hi = {...ST, to: 190, hand: [92, -6]}, lo = {...ST, to: 168, hand: [126, 84]}; return {poses: o.low ? [lo, hi] : [hi, lo],
  fg: (S, eq) => gtool(S.w, eq, {anchor: o.low ? AN.loBack : AN.hiBack, r: 8})}; };
A.landmineRot = () => { const b = {...ST, to: 176}; return {poses: [{...b, hand: [150, 28]}, {...b, hand: [146, 62]}], loop: 'cyc', seg: 650,
  fg: (S, eq) => gln(S.w, [206, 146], 'gf-prop', 3) + gtool(S.w, 'plate', {r: 10})}; };
A.deadBug = () => { const b = {...SUP, hip: [120, 140], foot: undefined, ua: 180, fa: 180, ua2: 180, fa2: 180, th: 180, sh: 100, th2: 180, sh2: 100};
  return {poses: [b, {...b, ua2: 262, fa2: 266, th: 100, sh: 96}, b, {...b, ua: 262, fa: 266, th2: 100, sh2: 96}], loop: 'cyc', seg: 700}; };
A.hollow = () => ({poses: [{...FLR, hip: [120, 140], foot: undefined, to: 262, hd: 6, ua: 268, fa: 268, th: 94, sh: 98}], still: .6});
A.dragon = () => { const sho = [62, 100], b = {sho, hand: [52, 98]}; return {poses: [{...b, to: 2, th: 182, sh: 182}, {...b, to: 296, th: 116, sh: 116}], bg: () => gbench(30, 110, 84)}; };
A.climber = () => { const ln = (g, foot) => { const c = Math.cos(g * Math.PI / 180), s = Math.sin(g * Math.PI / 180); return {hip: [foot[0] + 78 * c, foot[1] - 78 * s], to: 90 + g, hand: [152, 146]}; };
  const a = ln(25, [34, 144]); return {poses: [{...a, foot: [112, 128], foot2: [34, 144]}, {...a, foot: [34, 144], foot2: [112, 128]}], loop: 'cyc', seg: 380}; };
A.plank = o => { const ln = (g, foot) => { const c = Math.cos(g * Math.PI / 180), s = Math.sin(g * Math.PI / 180); return {hip: [foot[0] + 78 * c, foot[1] - 78 * s], to: 90 + g, foot, ua: 0, fa: 90}; };
  const a = ln(13, [30, 144]);
  const bg = () => (o.bench ? gbox(14, 124, 34) : ''), fg = (S, eq) => (eq === 'plate' ? `<circle cx="${n1(S.hip[0] + 4)}" cy="${n1(S.hip[1] - 12)}" r="9" class="gf-prop gf-fill" stroke-width="2"/>` : eq === 'suspension' ? gln(S.a, [S.a[0], -14], 'gf-prop', 1.6) : '');
  return o.side ? {poses: [{...a, ua2: 180, fa2: 180}, {...ln(8, [30, 144]), ua2: 180, fa2: 180}], bg, fg: (S, eq) => fg(S, eq) + (eq === 'dumbbell' ? gtool(S.w2, 'dumbbell') : '')} : {poses: [a], still: .8, bg, fg}; };

// ---- schiena ----
A.pull = o => { const hang = {sho: [106, 26], to: 182, hand: [112, -28], th: 10, sh: -26}; return {poses: [hang, {...hang, sho: [108, -10], to: 190}],
  bg: eq => `<line x1="92" y1="-28" x2="132" y2="-28" class="gf-prop" stroke-width="4"/>` + (eq === 'machine' ? gstack(168, 90) + gpad(100, 100, 120, 100, 7) : ''),
  fg: (S, eq) => (eq === 'band' ? `<path d="M${n1(S.k[0])} ${n1(S.k[1] + 6)}L112 -10" class="gf-prop" stroke-width="2.4" stroke-dasharray="4 3"/>` : '') + gbelt(S.k, eq)}; };
A.lat = o => { const b = {hip: [75, 108], to: 195, foot: [118, 145]}; return {poses: [{...b, hand: [92, 16]}, {...b, hand: [96, 54], es: 1}],
  bg: () => gseat(75, 112) + gpad(92, 94, 112, 94, 7), fg: (S, eq) => gtool(S.w, eq === 'machine' ? 'cable' : eq, {anchor: [98, -14]})}; };
A.straightArm = () => { const b = {hip: [95, 70], to: 160, foot: [105, 145]}; return {poses: [{...b, ua: 150, fa: 150}, {...b, ua: 22, fa: 22}], fg: (S, eq) => gtool(S.w, eq, {anchor: [150, -14], r: 8})}; };
A.row = o => { const b = {hip: [85, 75], to: 110, foot: [105, 145]};
  return {poses: [{...b, ua: 0, fa: 0}, {...b, hand: [b.hip[0] + 28, b.hip[1] + 10], es: 1}],
    fg: (S, eq) => (eq === 'landmine' ? gln(S.w, [206, 146], 'gf-prop', 3) : '') + gtool(S.w, eq === 'landmine' ? 'barbell' : eq, {anchor: AN.lo, r: 11})}; };
A.row1 = () => { const b = {hip: [88, 72], to: 105, foot: [100, 145], foot2: [70, 145], hand2: [138, 96]}; return {poses: [{...b, ua: 0, fa: 0}, {...b, hand: [112, 88]}],
  bg: () => gbench(118, 104, 178), fg: (S, eq) => gtool(S.w, eq, {anchor: [215, 120]})}; };
A.rowChest = () => { const b = {hip: [78, 96], to: 128, foot: [60, 145]}; return {poses: [{...b, ua: 0, fa: 0}, {...b, hand: [100, 84]}],
  bg: () => gpad(86, 106, 128, 76, 10) + gln([128, 76], [136, GF], 'gf-prop', 3), fg: (S, eq) => gtool(S.w, eq, {r: 9})}; };
A.rowSeat = o => { const b = {hip: [68, 108], to: 186, foot: [124, 128]}; return {poses: [{...b, hand: [120, 66]}, {...b, hand: [92, 76], es: 1}],
  bg: () => gseat(68, 112) + gln([128, 112], [128, GF], 'gf-prop', 3) + (o.pad ? gpad(98, 50, 98, 82, 8) : ''), fg: (S, eq) => gtool(S.w, eq === 'machine' ? 'cable' : eq, {anchor: [215, 66]})}; };
A.invRow = () => { const b = {foot: [46, 144], hand: [172, 68]}; return {poses: [{...b, sho: [168, 122], to: 96}, {...b, sho: [168, 90], to: 112}],
  bg: () => `<line x1="160" y1="68" x2="186" y2="68" class="gf-prop" stroke-width="4"/><line x1="186" y1="68" x2="186" y2="${GF}" class="gf-prop" stroke-width="3"/>`, fg: (S, eq) => eq === 'suspension' ? gtool([172, 68], eq) : ''}; };
A.shrug = () => { const b = {...ST, ua: 3, fa: 2}; return {poses: [b, {...b, sl: 9}], fg: (S, eq) => gtool(S.w, eq, {r: 12, anchor: AN.floor})}; };
A.backExt = () => { const b = {hip: [105, 86], th: 315, sh: 315, ua: 40, fa: 190}; return {poses: [{...b, to: 28}, {...b, to: 132}], bg: () => gpad(72, 122, 112, 82, 9) + gln([112, 82], [118, GF], 'gf-prop', 3),
  fg: (S, eq) => eq === 'plate' ? `<circle cx="${n1(S.sho[0])}" cy="${n1(S.sho[1])}" r="8" class="gf-prop gf-fill" stroke-width="2"/>` : ''}; };
A.revHyper = () => { const b = {hip: [100, 90], to: 90, hand: [160, 110]}; return {poses: [{...b, th: 2, sh: 2}, {...b, th: 262, sh: 266}], bg: () => gbench(96, 100, 176), fg: (S, eq) => eq === 'machine' ? gstack(188, 100) : ''}; };
A.hinge = o => { const hold = o.back ? HOLD.back : {ua: 2, fa: 2}; const b = {foot: [105, 145], ...hold};
  return {poses: [{...ST, ...hold}, {...b, hip: [o.straight ? 74 : 78, o.straight ? 70 : 76], to: o.to || 104}], fg: (S, eq) => gtool(o.back ? gadd(S.sho, [-5, 3]) : S.w, eq, {r: 11, anchor: AN.lo})}; };
A.pullThrough = () => { const b = {foot: [105, 145], ua: 10, fa: 10}; return {poses: [{...ST, to: 176, hand: [118, 86]}, {...b, hip: [76, 78], to: 106, hand: [100, 100]}], fg: (S, eq) => gtool(S.w, eq, {anchor: AN.loBack})}; };
A.deadlift = o => { const lo = {hip: o.hip || [78, 112], to: o.to || 135, foot: [105, 145], ua: 0, fa: 0}; return {poses: [lo, {...ST, ua: 0, fa: 0}], fg: (S, eq) => gtool(S.w, eq, {r: 14})}; };

// ---- petto ----
A.press = o => {
  const b = o.bench || 0, to = 270 - b, hip = [120, o.floor ? 141 : 106], d = gv(to, 1), n = [-d[1], d[0]];
  const sho = gadd(hip, gv(to, GL.to)), low = gadd(gadd(sho, [-d[0] * 12, -d[1] * 12 - (o.floor ? 14 : 0)]), [n[0] * 9, n[1] * 9]);
  const top = [sho[0] + (o.close ? 0 : 2), sho[1] - 52];
  const base = {hip, to, foot: o.floor ? [160, 145] : [165, 143 - (b < 0 ? 12 : 0)]};
  return {poses: [{...base, hand: low}, {...base, hand: top}],
    bg: eq => eq === 'machine' ? gseat(hip[0] + 10, hip[1] + 8) + gpad(sho[0] - 8, sho[1] + 2, hip[0], hip[1] + 2, 12) + gstack(60, 70) : o.floor ? '' : gbench(hip[0] - 66, hip[1] + 8, hip[0] + 24),
    fg: (S, eq) => gtool(S.w, eq, {anchor: [60, 76]})};
};
A.fly = () => { const sho = gadd(SUP.hip, gv(270, GL.to)), b = {...SUP}; return {poses: [{...b, hand: [sho[0] + 3, sho[1] + 28]}, {...b, hand: [sho[0] + 3, sho[1] - 52]}],
  bg: () => gbench(54, 114, 144), fg: (S, eq) => gtool(S.w, eq, {anchor: [60, 146], r: 9})}; };
A.pullover = () => { const b = {...SUP, ua: 178, fa: 178}; return {poses: [b, {...b, ua: 248, fa: 252}], bg: () => gbench(54, 114, 144), fg: (S, eq) => gtool(S.w, eq, {anchor: [28, 146], r: 9})}; };
A.pushFwd = o => { const b = o.stand ? {...ST, to: 174} : {hip: [92, 108], to: 183, foot: [138, 145]};
  const h0 = o.stand ? [118, 44] : [112, 70], h1 = o.stand ? [160, 42] : [150, 66];
  return {poses: [{...b, hand: h0}, {...b, hand: h1}], bg: o.stand ? null : () => gseat(92, 112) + gpad(76, 56, 78, 104, 8) + gstack(60, 96),
    fg: (S, eq) => gtool(S.w, eq === 'machine' && o.stand ? 'plate' : eq, {anchor: o.stand ? [28, 44] : [215, 70], r: 8})}; };
A.cross = () => { const b = {...ST, to: 172}; return {poses: [{...b, hand: [92, 30]}, {...b, hand: [128, 78]}], fg: (S, eq) => gtool(S.w, eq, {anchor: [60, -14], r: 7})}; };
A.pecDeck = () => { const b = {hip: [92, 108], to: 182, foot: [136, 145]}; return {poses: [{...b, hand: [98, 56]}, {...b, hand: [140, 62]}], bg: () => gseat(92, 112) + gpad(76, 56, 78, 104, 8) + gstack(180, 90), fg: (S, eq) => gtool(S.w, 'machine', {anchor: [182, 76]})}; };
A.pushup = o => { const ln = (g, foot) => { const c = Math.cos(g * Math.PI / 180), s = Math.sin(g * Math.PI / 180); return {hip: [foot[0] + 78 * c, foot[1] - 78 * s], to: 90 + g, foot, hand: [152, 146]}; };
  return {poses: [ln(25, [34, 144]), ln(9, [34, 144])], fg: (S, eq) => eq === 'suspension' ? gtool([152, 146], eq) : eq === 'plate' ? `<circle cx="${n1((S.hip[0] + S.sho[0]) / 2)}" cy="${n1((S.hip[1] + S.sho[1]) / 2 - 12)}" r="9" class="gf-prop gf-fill" stroke-width="2"/>` : eq === 'band' ? `<path d="M${n1(S.sho[0])} ${n1(S.sho[1] - 6)}L${n1(S.sho[0] - 20)} 148M${n1(S.sho[0])} ${n1(S.sho[1] - 6)}L${n1(S.sho[0] + 10)} 148" class="gf-prop" stroke-width="2" stroke-dasharray="4 3"/>` : ''}; };

// ---- spalle ----
A.ohp = o => { const b = o.seat ? {hip: [100, 108], to: 178, foot: [140, 145]} : {...ST};
  const sy = o.seat ? 62 : 21, sx = o.seat ? 101 : 107, h0 = o.arnold ? [sx + 17, sy + 6] : [sx + 5, sy - 10], h1 = [sx + 2, sy - 54];
  return {poses: [{...b, hand: h0}, {...b, hand: h1}], bg: eq => o.seat ? gseat(100, 112) + gpad(85, 46, 88, 104, 8) + (eq === 'machine' ? gstack(52, 70) : '') : '',
    fg: (S, eq) => gtool(S.w, eq, {anchor: [60, 70], r: 10})}; };
A.landminePress = () => { const b = {...ST, to: 176}; return {poses: [{...b, hand: [122, 18]}, {...b, hand: [146, -12]}], fg: (S, eq) => gln(S.w, [30, 146], 'gf-prop', 3) + gtool(S.w, 'plate', {r: 9})}; };
A.frontRaise = () => { const b = {...ST}; return {poses: [{...b, ua: 3, fa: 3}, {...b, ua: 90, fa: 92}], fg: (S, eq) => gtool(S.w, eq, {anchor: AN.lo, r: 9})}; };
A.facePull = () => { const b = {...ST, to: 174}; return {poses: [{...b, hand: [150, 22]}, {...b, hand: [114, 6], es: -1}], fg: (S, eq) => gtool(S.w, eq, {anchor: [215, 14], r: 7})}; };
A.uprightRow = () => { const b = {...ST}; return {poses: [{...b, hand: [112, 76]}, {...b, hand: [114, 30], es: -1}], fg: (S, eq) => gtool(S.w, eq, {anchor: AN.lo, r: 10})}; };
A.lateral = () => ({front: true, poses: [{c: [120, 67], aL: 6, aR: 6}, {c: [120, 67], aL: 86, aR: 86}]});
A.yRaise = () => ({front: true, poses: [{c: [120, 67], aL: 8, aR: 8}, {c: [120, 67], aL: 150, aR: 150}]});
A.revFly = () => ({front: true, poses: [{c: [120, 74], lean: 16, aL: 6, aR: 6}, {c: [120, 74], lean: 16, aL: 84, aR: 84}]});
A.pike = o => { const hs = o.hand ? 1 : 0; return {poses: [{hip: [95, 62], to: 40, foot: [48, 145], hand: [138, 146]}, {hip: [95, 84], to: 62, foot: [48, 145], hand: [138, 146]}], bg: null}; };
A.hspu = () => { const b = {to: 0, th: 176, sh: 176}; return {poses: [{...b, sho: [110, 92], hand: [112, 146]}, {...b, sho: [110, 118], hand: [112, 146]}], bg: () => gwall(130)}; };

// ---- gambe ----
A.squat = o => { const hold = o.hold === 'none' ? {ua: 82, fa: 86} : HOLD[o.hold] || HOLD.back;
  const bot = o.sissy ? {hip: [112, 86], to: 206, foot: [86, 143]} : {hip: o.deep ? [78, 112] : [82, 106], to: o.torso || 140, foot: [105, 145]};
  return {poses: [{...ST, ...hold}, {...bot, ...hold}], bg: eq => eq === 'machine' ? gpad(58, 28, 98, 144, 6) + gwall(34) : '',
    fg: (S, eq) => o.hold === 'none' ? '' : eq === 'machine' ? gpad(gadd(S.sho, [-8, -2])[0], S.sho[1] - 5, S.sho[0] + 2, S.sho[1] + 5, 11) : gtool(o.hold === 'back' ? gadd(S.sho, [-5, 3]) : o.hold === 'front' ? gadd(S.sho, [13, -3]) : gadd(S.sho, [15, 24]), eq, {r: o.hold === 'goblet' ? 9 : 10})}; };
A.wallSit = () => ({poses: [{hip: [76, 108], to: 178, foot: [112, 145], ua: 80, fa: 86}], still: .5, bg: () => gwall(62)});
A.legPress = () => { const b = {hip: [58, 116], to: 226, hand: [78, 98]}; return {poses: [{...b, foot: [102, 92]}, {...b, foot: [124, 54]}],
  bg: () => gpad(26, 130, 2, 98, 12) + gseat(60, 124), fg: S => `<line x1="${n1(S.a[0] + 8)}" y1="${n1(S.a[1] - 22)}" x2="${n1(S.a[0] + 8)}" y2="${n1(S.a[1] + 22)}" class="gf-prop" stroke-width="7"/>`}; };
A.lunge = o => { const hold = o.hold === 'hands' ? {ua: 0, fa: 0} : o.hold === 'back' ? HOLD.back : {ua: 2, fa: 2}, ft = [124, 145], bk = [66, 145];
  return {poses: [{hip: [95, 70], to: 178, foot: ft, foot2: bk, ...hold}, {hip: [95, 108], to: 178, foot: ft, foot2: bk, ...hold}],
    fg: (S, eq) => gtool(o.hold === 'back' ? gadd(S.sho, [-5, 3]) : S.w, eq, {r: 10, anchor: AN.lo})}; };
A.bulgarian = o => { const hold = o.hold === 'back' ? HOLD.back : {ua: 2, fa: 2}, ft = [124, 145], bk = [52, 122];
  return {poses: [{hip: [96, 70], to: 178, foot: ft, foot2: bk, ...hold}, {hip: [96, 106], to: 172, foot: ft, foot2: bk, ...hold}], bg: () => gbox(36, 126, 30),
    fg: (S, eq) => gtool(o.hold === 'back' ? gadd(S.sho, [-5, 3]) : S.w, eq, {r: 10})}; };
A.stepUp = () => { const lead = [130, 114]; return {poses: [{hip: [112, 62], to: 176, foot: lead, foot2: [96, 145], ua: 2, fa: 2}, {hip: [130, 36], to: 178, foot: lead, foot2: [140, 76], ua: 2, fa: 2}], bg: () => gbox(112, 118, 40), fg: (S, eq) => gtool(S.w, eq, {r: 9})}; };
A.legExt = () => { const b = {hip: [75, 108], to: 190, hand: [92, 116]}; return {poses: [{...b, foot: [104, 145]}, {...b, foot: [150, 110]}], bg: () => gseat(75, 112) + gpad(60, 54, 62, 104, 8),
  fg: S => gpad(S.a[0] - 4, S.a[1] - 3, S.a[0] + 2, S.a[1] + 2, 9)}; };
A.legCurl = () => { const b = {hip: [95, 118], to: 270, th: 90, hand: [40, 128]}; return {poses: [{...b, sh: 92}, {...b, sh: 156}], bg: () => gbench(44, 126, 140),
  fg: (S, eq) => gtool(S.a, eq === 'machine' ? 'plate' : eq, {anchor: [215, 126], r: 8})}; };
A.floorCurl = () => { const sho = [66, 141], to = 290, hip = gsub(sho, gv(to, GL.to)); return {poses: [{sho, to, foot: [182, 144], hand: [sho[0] + 18, 144]}, {sho, to, foot: [142, 144], hand: [sho[0] + 18, 144]}]}; };
A.nordic = () => ({poses: [{hip: [60, 100], to: 180, th: 0, sh: 270, ua: 40, fa: 80}, {hip: [96, 123], to: 115, th: 295, sh: 270, ua: 92, fa: 96}], bg: () => gbox(8, 126, 26)});
A.thrust = o => { const sho = [62, 100], P = to => { const hip = gsub(sho, gv(to, GL.to)); return {sho, to, foot: [136, 145], hand: gadd(hip, [0, -8])}; };
  return {poses: [P(228), P(266)], bg: () => gbench(32, 106, 80), fg: (S, eq) => eq === 'barbell' || eq === 'smith' ? gtool(gadd(S.hip, [2, -6]), eq, {r: 11}) + `<line x1="${n1(S.hip[0])}" y1="${n1(S.hip[1] - 6)}" x2="${n1(S.hip[0])}" y2="${n1(S.hip[1] - 6)}"/>` : eq === 'machine' ? gpad(S.hip[0] - 3, S.hip[1] - 12, S.hip[0] + 3, S.hip[1] - 2, 11) + gstack(190, 100) : eq === 'band' ? `<path d="M${n1(S.hip[0])} ${n1(S.hip[1] - 6)}L${n1(S.hip[0] - 8)} 148M${n1(S.hip[0])} ${n1(S.hip[1] - 6)}L${n1(S.hip[0] + 30)} 148" class="gf-prop" stroke-width="2" stroke-dasharray="4 3"/>` : gbelt(gadd(S.hip, [0, -9]), eq)}; };
A.bridge = () => { const sho = [62, 141], P = to => { const hip = gsub(sho, gv(to, GL.to)); return {sho, to, foot: [128, 145], hand: gadd(hip, [0, -4])}; };
  return {poses: [P(262), P(276)], fg: (S, eq) => eq === 'barbell' ? gtool(gadd(S.hip, [2, -6]), eq, {r: 11}) : eq === 'band' ? `<path d="M${n1(S.hip[0])} ${n1(S.hip[1] - 6)}L${n1(S.hip[0] - 8)} 148M${n1(S.hip[0])} ${n1(S.hip[1] - 6)}L${n1(S.hip[0] + 30)} 148" class="gf-prop" stroke-width="2" stroke-dasharray="4 3"/>` : gbelt(gadd(S.hip, [0, -9]), eq)}; };
A.bridge2 = A.bridge;
A.kickBack = () => { const b = {hip: [92, 100], to: 90, th: 0, sh: 270, th2: 0, sh2: 270, hand: [138, 146]}; return {poses: [b, {...b, th: 252, sh: 252}], fg: (S, eq) => gtool(S.a, eq === 'machine' ? 'plate' : eq, {anchor: AN.lo})}; };
A.hipAb = o => ({front: true, notool: true, poses: o.adduct ? [{c: [120, 67], aL: 4, aR: 4, lR: 34}, {c: [120, 67], aL: 4, aR: 4, lR: 0}] : [{c: [120, 67], aL: 4, aR: 4, lR: 0}, {c: [120, 67], aL: 4, aR: 4, lR: 34}]});
A.calf = o => { const b = o.seat ? {hip: [90, 108], to: 178, foot: [128, 145], ua: 2, fa: 2} : {...ST, ua: 2, fa: 2};
  const up = o.seat ? {...b, foot: [128, 138], ft: 38} : o.donkey ? {...b, foot: [95, 138], ft: 38} : {...b, hip: [105, 59], foot: [105, 138], ft: 38};
  const b0 = o.donkey ? {hip: [95, 67], to: 94, foot: [95, 145], hand: [160, 98]} : b, u0 = o.donkey ? {...b0, foot: [95, 138], ft: 38} : up;
  return {poses: [b0, u0], bg: o.donkey ? () => gbox(150, 100, 34) : o.seat ? () => gseat(90, 112) : null,
    fg: (S, eq) => o.seat ? gpad(S.k[0] - 6, S.k[1] - 8, S.k[0] + 4, S.k[1] - 4, 9) + (eq === 'dumbbell' ? gtool(gadd(S.k, [0, -10]), eq) : '') : o.donkey ? gtool(gadd(S.hip, [0, -12]), eq === 'machine' ? 'plate' : eq, {r: 10}) : eq === 'machine' ? gpad(S.sho[0] - 8, S.sho[1] - 6, S.sho[0] + 2, S.sho[1] + 4, 12) : eq === 'smith' || eq === 'barbell' ? gtool(gadd(S.sho, [-5, 3]), eq, {r: 10}) : gtool(S.w, eq, {r: 8})}; };
A.calfPress = () => { const b = {hip: [58, 116], to: 226, hand: [78, 98], foot: [126, 56]}; return {poses: [{...b, ft: 70}, {...b, foot: [128, 50], ft: 28}], bg: () => gpad(26, 130, 2, 98, 12) + gseat(60, 124), fg: S => `<line x1="${n1(S.a[0] + 10)}" y1="${n1(S.a[1] - 22)}" x2="${n1(S.a[0] + 10)}" y2="${n1(S.a[1] + 22)}" class="gf-prop" stroke-width="7"/>`}; };
A.tibialis = () => ({poses: [{hip: [88, 62], to: 191, foot: [118, 143], ua: 8, fa: 8, ft: 92}, {hip: [88, 62], to: 191, foot: [118, 143], ua: 8, fa: 8, ft: 150}], bg: () => gwall(64)});

// ---- tutto il corpo ----
A.pull2 = null;
A.clean = o => { const flr = {hip: [78, 112], to: 135, foot: [105, 145], ua: 0, fa: 0}, hi = {...ST, ua: 2, fa: 2}, rack = {hip: [100, 94], to: 170, foot: [105, 145], hs: [13, -4], es: -1}, top = {...ST, hand: [109, -33]};
  const seq = o.press ? [flr, hi, rack, top] : [flr, hi, rack]; return {poses: seq, seg: 900, fg: (S, eq) => gtool(S.w, eq, {r: 12})}; };
A.pushPress = o => { const rack = {...ST, hs: [13, -4], es: -1}, dip = {...ST, hip: [105, 80], hs: [13, -4], es: -1}, top = {...ST, hand: [109, -33]};
  const seq = o.thruster ? [{hip: [82, 108], to: 142, foot: [105, 145], hs: [13, -4], es: -1}, rack, top] : [rack, dip, top]; return {poses: seq, seg: 900, fg: (S, eq) => gtool(S.w, eq, {r: 11})}; };
A.snatch = () => { const flr = {hip: [78, 112], to: 135, foot: [105, 145], ua: 0, fa: 0}; return {poses: [flr, {...ST, ua: 2, fa: 2}, {...ST, hand: [109, -33]}], seg: 900, fg: (S, eq) => gtool(S.w, eq, {r: 11})}; };
A.swing = () => { const b = {foot: [105, 145]}; return {poses: [{...b, hip: [76, 78], to: 104, hand: [104, 98]}, {...ST, hand: [156, 30]}], seg: 650, fg: (S, eq) => gtool(S.w, eq === 'dumbbell' ? 'dumbbell' : 'kettlebell')}; };
A.getUp = () => { const lie = {hip: [120, 141], to: 270, foot: [152, 145], foot2: [196, 143], hand: [74, 84], hand2: [98, 141]};
  return {poses: [lie, {...lie, to: 232, hand: [90, 52], hand2: [90, 141]}, {hip: [118, 138], to: 196, foot: [152, 145], foot2: [196, 143], hand: [100, 36], hand2: [104, 141]},
    {hip: [112, 108], to: 178, foot: [140, 145], th2: 332, sh2: 270, hand: [108, 8], hand2: undefined, ua2: 0, fa2: 0}, {...ST, hand: [108, -33]}], seg: 1000, fg: (S, eq) => gtool(S.w, eq === 'dumbbell' ? 'dumbbell' : 'kettlebell')}; };
A.carry = o => { const b = {hip: [105, 66], to: 178, ua: 0, fa: 0}; return {poses: [{...b, foot: [122, 145], foot2: [90, 138]}, {...b, hip: [105, 68], foot: [90, 138], foot2: [122, 145]}], loop: 'cyc', seg: 520,
  fg: (S, eq) => gtool(S.w, eq === 'trapbar' ? 'plate' : eq, {r: 10}) + (o.both ? gtool(S.w2, eq === 'trapbar' ? 'plate' : eq, {r: 10}) : '')}; };
A.burpee = () => { const hp = (g, foot) => { const c = Math.cos(g * Math.PI / 180), s = Math.sin(g * Math.PI / 180); return {hip: [foot[0] + 78 * c, foot[1] - 78 * s], to: 90 + g, foot, hand: [152, 146]}; };
  return {poses: [{...ST, ua: 2, fa: 2}, {hip: [92, 104], to: 126, foot: [105, 145], hand: [130, 146]}, hp(22, [34, 144]), hp(10, [34, 144]), hp(22, [34, 144]), {hip: [92, 104], to: 126, foot: [105, 145], hand: [130, 146]}, {hip: [105, 52], to: 178, foot: [105, 128], hand: [109, -26]}], loop: 'cyc', seg: 620}; };
A.sled = () => { const b = {hip: [86, 80], to: 124, hand: [152, 90]}; return {poses: [{...b, foot: [112, 145], foot2: [58, 138]}, {...b, foot: [58, 138], foot2: [112, 145]}], loop: 'cyc', seg: 480,
  bg: () => `<rect x="156" y="104" width="36" height="42" rx="3" class="gf-prop gf-box" stroke-width="2.4"/><line x1="156" y1="96" x2="156" y2="104" class="gf-prop" stroke-width="3"/><line x1="150" y1="96" x2="162" y2="96" class="gf-prop" stroke-width="4"/>`}; };
A.ropes = () => { const b = {hip: [100, 88], to: 168, th: 38, sh: 352}; return {poses: [{...b, hand: [140, 36], hand2: [140, 78]}, {...b, hand: [140, 78], hand2: [140, 36]}], loop: 'cyc', seg: 260,
  fg: (S) => `<path d="M${n1(S.w[0])} ${n1(S.w[1])}Q170 ${n1(S.w[1] + (S.w[1] < 56 ? 22 : -22))} 214 ${n1(S.w2[1])}" class="gf-prop" stroke-width="3" fill="none"/><path d="M${n1(S.w2[0])} ${n1(S.w2[1])}Q170 ${n1(S.w2[1] + (S.w2[1] < 56 ? 22 : -22))} 214 ${n1(S.w[1])}" class="gf-prop" stroke-width="3" fill="none" opacity=".6"/>`}; };

// ---------- da movimento della libreria a schema ----------
const GMAP = {
  'biceps.curl': ['curl'], 'biceps.inclineCurl': ['curlIncl'], 'biceps.hammerCurl': ['curl'], 'biceps.preacherCurl': ['curlPreacher'], 'biceps.concentrationCurl': ['curlConc'],
  'biceps.spiderCurl': ['curlSpider'], 'biceps.cableCurl': ['curl'], 'biceps.zottmanCurl': ['curl'], 'biceps.dragCurl': ['curl', {drag: 1}],
  'triceps.dip': ['dip'], 'triceps.benchDip': ['benchDip'], 'triceps.pushdown': ['pushdown', {}], 'triceps.skullCrusher': ['skull'], 'triceps.overheadExtension': ['overheadExt', {}],
  'triceps.closeGripBench': ['press', {close: 1}], 'triceps.kickback': ['kickback'], 'triceps.jmPress': ['press', {close: 1}], 'triceps.diamondPushUp': ['pushup'], 'triceps.machineExtension': ['machineExt'],
  'core.plank': ['plank', {}], 'core.sidePlank': ['plank', {side: 1}], 'core.crunch': ['crunch'], 'core.cableCrunch': ['cableCrunch'], 'core.reverseCrunch': ['reverseCrunch'], 'core.bicycleCrunch': ['bicycle'],
  'core.situp': ['situp'], 'core.lyingLegRaise': ['legRaise'], 'core.hangingRaise': ['hangRaise', {}], 'core.abWheel': ['abWheel'], 'core.pallofPress': ['pallof'], 'core.russianTwist': ['twist'],
  'core.woodchopper': ['chop', {}], 'core.landmineRotation': ['landmineRot'], 'core.deadBug': ['deadBug'], 'core.hollowHold': ['hollow'], 'core.dragonFlag': ['dragon'], 'core.mountainClimber': ['climber'],
  'back.pullUp': ['pull', {}], 'back.chinUp': ['pull', {}], 'back.latPulldown': ['lat', {}], 'back.straightArmPulldown': ['straightArm'], 'back.bentOverRow': ['row', {}], 'back.oneArmRow': ['row1'],
  'back.chestSupportedRow': ['rowChest'], 'back.tBarRow': ['row', {}], 'back.seatedCableRow': ['rowSeat', {}], 'back.machineRow': ['rowSeat', {pad: 1}], 'back.invertedRow': ['invRow'], 'back.shrug': ['shrug'],
  'back.backExtension': ['backExt'], 'back.reverseHyper': ['revHyper'], 'back.goodMorning': ['hinge', {back: 1, to: 98}], 'back.rackPull': ['deadlift', {hip: [84, 100], to: 150}],
  'forearms.wristCurl': ['wristCurl', {}], 'forearms.reverseWristCurl': ['wristCurl', {rev: 1}], 'forearms.reverseCurl': ['curl'], 'forearms.pronationSupination': ['wristCurl', {}], 'forearms.wristRoller': ['wristRoller'],
  'forearms.platePinch': ['pinch'], 'forearms.deadHang': ['hang'], 'forearms.gripper': ['gripper'],
  'chest.benchPress': ['press', {}], 'chest.inclineBenchPress': ['press', {bench: 30}], 'chest.declineBenchPress': ['press', {bench: -18}], 'chest.chestPress': ['pushFwd', {}], 'chest.floorPress': ['press', {floor: 1}],
  'chest.dumbbellFly': ['fly'], 'chest.cableCrossover': ['cross'], 'chest.pecDeck': ['pecDeck'], 'chest.pushUp': ['pushup'], 'chest.svendPress': ['pushFwd', {stand: 1}], 'chest.landmineChestPress': ['landminePress'], 'chest.pullover': ['pullover'],
  'shoulders.overheadPress': ['ohp', {}], 'shoulders.dumbbellShoulderPress': ['ohp', {seat: 1}], 'shoulders.machineShoulderPress': ['ohp', {seat: 1}], 'shoulders.arnoldPress': ['ohp', {seat: 1, arnold: 1}],
  'shoulders.landminePress': ['landminePress'], 'shoulders.lateralRaise': ['lateral'], 'shoulders.frontRaise': ['frontRaise'], 'shoulders.reverseFly': ['revFly'], 'shoulders.facePull': ['facePull'],
  'shoulders.uprightRow': ['uprightRow'], 'shoulders.cubanPress': ['uprightRow'], 'shoulders.yRaise': ['yRaise'], 'shoulders.pikePushUp': ['pike', {}], 'shoulders.handstandPushUp': ['hspu'],
  'quads.backSquat': ['squat', {hold: 'back'}], 'quads.frontSquat': ['squat', {hold: 'front'}], 'quads.gobletSquat': ['squat', {hold: 'goblet'}], 'quads.machineSquat': ['squat', {hold: 'back'}],
  'quads.bodyweightSquat': ['squat', {hold: 'none'}], 'quads.sissySquat': ['squat', {hold: 'none', sissy: 1}], 'quads.legPress': ['legPress'], 'quads.lunge': ['lunge', {}], 'quads.bulgarianSplitSquat': ['bulgarian', {}],
  'quads.stepUp': ['stepUp'], 'quads.legExtension': ['legExt'], 'quads.hipAdduction': ['hipAb', {adduct: 1}], 'quads.copenhagenPlank': ['plank', {side: 1, bench: 1}], 'quads.wallSit': ['wallSit'],
  'hams.romanianDeadlift': ['hinge', {}], 'hams.stiffLegDeadlift': ['hinge', {straight: 1}], 'hams.legCurl': ['legCurl'], 'hams.nordicCurl': ['nordic'], 'hams.floorLegCurl': ['floorCurl'], 'hams.hipThrust': ['thrust'],
  'hams.gluteBridge': ['bridge'], 'hams.pullThrough': ['pullThrough'], 'hams.gluteKickback': ['kickBack'], 'hams.hipAbduction': ['hipAb', {}],
  'calves.standingCalfRaise': ['calf', {}], 'calves.seatedCalfRaise': ['calf', {seat: 1}], 'calves.legPressCalfRaise': ['calfPress'], 'calves.donkeyCalfRaise': ['calf', {donkey: 1}], 'calves.tibialisRaise': ['tibialis'],
  'fullbody.deadlift': ['deadlift', {}], 'fullbody.sumoDeadlift': ['deadlift', {hip: [92, 104], to: 150}], 'fullbody.trapBarDeadlift': ['deadlift', {hip: [92, 104], to: 150}], 'fullbody.powerClean': ['clean', {}],
  'fullbody.cleanAndPress': ['clean', {press: 1}], 'fullbody.pushPress': ['pushPress', {}], 'fullbody.snatch': ['snatch'], 'fullbody.thruster': ['pushPress', {thruster: 1}], 'fullbody.kettlebellSwing': ['swing'],
  'fullbody.turkishGetUp': ['getUp'], 'fullbody.farmersWalk': ['carry', {both: 1}], 'fullbody.suitcaseCarry': ['carry', {}], 'fullbody.burpee': ['burpee'], 'fullbody.sledPush': ['sled'], 'fullbody.battleRopes': ['ropes'],
};
// l'attrezzo cambia il gesto per pochi movimenti
function gdef(baseId, eq) {
  const m = GMAP[baseId]; if (!m || !A[m[0]]) return null;
  const o = {...(m[1] || {})};
  if (baseId === 'triceps.pushdown' && eq === 'machine') o.seat = 1;
  if (baseId === 'core.hangingRaise' && eq === 'machine') o.knees = 1;
  if (baseId === 'core.woodchopper' && eq === 'dumbbell') o.low = 1;
  return A[m[0]](o);
}
// una immagine dell'omino: ragazzo o ragazza, con l'attrezzo della variante
function gsvg(def, P, eq, girl) {
  const bg = def.bg ? def.bg(eq) : '';
  if (def.front) return bg + gfront(P, girl, def.notool ? '' : eq);
  const S = gsolve(P);
  return bg + gfig(S, girl) + (def.fg ? def.fg(S, eq, P) : '');
}
const GBOX = '-6 -52 252 210';
const gfloor = `<line x1="-6" y1="${GF}" x2="246" y2="${GF}" class="gf-floor"/>`;
function gstill(baseId, eq, end, girl) {
  const def = gdef(baseId, eq); if (!def) return '';
  const P = def.poses[end ? def.poses.length - 1 : 0];
  return `<svg class="gf-svg" viewBox="${GBOX}" aria-hidden="true">${gfloor}${gsvg(def, P, eq, girl)}</svg>`;
}

// ---------- finestra animata ----------
const guideGirl = () => db.settings && db.settings.guideGirl != null ? !!db.settings.guideGirl : (db.profile && db.profile.sex === 'f');
const guideOff = () => !!(db.guide && db.guide.off);
let gfRaf = 0, gfPaused = false, gfMs = 0, gfLast = 0, gf3 = null;
function guidePanel(baseId, eq) {
  if (!GMAP[baseId] || !BASE[baseId]) return '';
  const eqs = [...new Set(BASE[baseId].variants.map(v => v.eq))].filter(e => gdef(baseId, e));
  if (!eqs.includes(eq)) eq = eqs[0];
  return `<div class="gf" id="gf" data-b="${baseId}" data-eq="${eq}"><div class="gf-stage" id="gf-stage" aria-hidden="true"></div>
    <div class="gf-ctl"><button class="ib" data-act="gfplay" id="gf-play" aria-label="${t('gfPause')}">${icon('pause')}</button>
      <div class="gf-eq">${eqs.length > 1 ? eqs.map(e => `<button class="chip" data-act="gfeq" data-eq="${e}" aria-pressed="${e === eq}">${LBL().eq[e] || e}</button>`).join('') : `<span class="sub">${LBL().eq[eq] || eq}</span>`}</div>
      <button class="ib txt" data-act="gfgirl" id="gf-girl" aria-label="${t(guideGirl() ? 'gfBoy' : 'gfGirl')}">${guideGirl() ? '♀' : '♂'}</button></div></div>`;
}
function guideStart() {
  cancelAnimationFrame(gfRaf);
  const el = document.getElementById('gf'); if (!el) return;
  const eq = el.dataset.eq, def = gdef(el.dataset.b, eq), st = document.getElementById('gf-stage'); if (!def || !st) return;
  const girl = guideGirl(); gf3 = null; el.classList.remove('gf3');
  gfPaused = matchMedia('(prefers-reduced-motion: reduce)').matches; gfMs = 0; gfLast = 0;
  const pb = document.getElementById('gf-play'); if (pb) { pb.innerHTML = icon(gfPaused ? 'play' : 'pause'); pb.setAttribute('aria-label', t(gfPaused ? 'gfPlay' : 'gfPause')); }
  // con WebGL si aspetta il modello 3D (nessun omino stilizzato nel frattempo); senza, o se il 3D non si carica, resta l'SVG
  let wait3d = !!(window.G3D && G3D.supported());
  const draw = ms => { if (gf3) gf3.draw(ms); else if (!wait3d) st.innerHTML = `<svg class="gf-svg" viewBox="${GBOX}">${gfloor}${gsvg(def, gpose(def, ms), eq, girl)}</svg>`; };
  if (wait3d) { st.innerHTML = '<div class="gf-load" aria-hidden="true"><i></i></div>'; el.classList.add('gf3'); }
  const tick = ts => {
    if (!document.getElementById('gf-stage')) return;
    if (!gfPaused) { gfMs += gfLast ? Math.min(60, ts - gfLast) : 0; draw(gfMs); }
    gfLast = ts; gfRaf = requestAnimationFrame(tick);
  };
  draw(0); gfRaf = requestAnimationFrame(tick);
  // modello anatomico 3D: si carica in un secondo momento e prende il posto dell'omino SVG
  if (wait3d) G3D.load().then(() => {
    if (document.getElementById('gf-stage') !== st || el.dataset.eq !== eq) return;
    gf3 = G3D.mount(st, el.dataset.b, eq, G3D.def(el.dataset.b, eq)); el.classList.add('gf3'); draw(gfMs);
    if (!el.querySelector('.gf-cred')) el.insertAdjacentHTML('beforeend', '<a class="gf-cred" href="3d/LICENSE.md" target="_blank" rel="noopener">3D: Z-Anatomy · CC BY-SA 4.0</a>');
  }).catch(() => { if (document.getElementById('gf-stage') !== st) return; wait3d = false; el.classList.remove('gf3'); draw(gfMs); });
}
// la prima volta che si aggiunge un movimento dalla libreria
function guideFirst(varId) {
  const v = VAR[varId]; if (!v || !GMAP[v.b.id] || guideOff()) return;
  const g = db.guide || (db.guide = {seen: {}}); g.seen = g.seen || {};
  if (g.seen[v.b.id]) return;
  g.seen[v.b.id] = 1; save(); sheetLibBase(v.b.id, varId, true);
}
Object.assign(acts, {
  gfplay: () => { gfPaused = !gfPaused; const pb = document.getElementById('gf-play'); if (pb) { pb.innerHTML = icon(gfPaused ? 'play' : 'pause'); pb.setAttribute('aria-label', t(gfPaused ? 'gfPlay' : 'gfPause')); } },
  gfeq: b => { const el = document.getElementById('gf'); el.dataset.eq = b.dataset.eq; el.querySelectorAll('[data-act=gfeq]').forEach(x => x.setAttribute('aria-pressed', x === b)); const p = gfPaused; guideStart(); if (p) acts.gfplay(); },
  gfgirl: () => { (db.settings = db.settings || {}).guideGirl = !guideGirl(); save(); const g = document.getElementById('gf-girl'); g.textContent = guideGirl() ? '♀' : '♂'; g.setAttribute('aria-label', t(guideGirl() ? 'gfBoy' : 'gfGirl')); guideStart(); },
  gfskip: () => closeSheet(),
  gfnever: () => { (db.guide = db.guide || {seen: {}}).off = true; save(); closeSheet(); toast(t('guideOffDone')); },
  guideset: b => { (db.guide = db.guide || {seen: {}}).off = b.dataset.on !== '1'; save(); render(); },
});
