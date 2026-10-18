// Scheda in PDF da inviare agli amici: pagine A4 con il logo di Gym Tracker, una tabella per ogni giorno.
// Le pagine si disegnano su canvas e si impacchettano in un PDF minimale (nessuna libreria, tutto sul telefono).
const PD = {W: 1240, H: 1754, M: 64, ink: '#14151a', sub: '#6b6c75', line: '#e3e3e8', acc: '#ff5a1f', band: '#0e0f11'};

function pdWrap(g, text, max) {
  const out = [];
  String(text || '').split('\n').forEach(par => {
    let cur = '';
    par.split(/\s+/).filter(Boolean).forEach(w => {
      const t2 = cur ? cur + ' ' + w : w;
      if (g.measureText(t2).width > max && cur) { out.push(cur); cur = w; } else cur = t2;
    });
    out.push(cur);
  });
  return out;
}
// ogni ostacolo di impaginazione passa da qui: nuova pagina con testata e piè di pagina di marca
function pdPages(logo, plan) {
  const pages = [];
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = PD.W; c.height = PD.H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, PD.W, PD.H);
    g.fillStyle = PD.band; g.fillRect(0, 0, PD.W, 92);
    if (logo) { g.save(); rr(g, PD.M, 14, 64, 64, 15); g.clip(); g.drawImage(logo, PD.M, 14, 64, 64); g.restore(); }
    g.fillStyle = '#fff'; g.font = `800 34px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText('GYM TRACKER', PD.M + 82, 60);
    g.fillStyle = '#9a9aa3'; g.font = `500 26px ${FONT}`; g.textAlign = 'right';
    g.fillText([plan.author, plan.name].filter(Boolean).join(' · ').slice(0, 46), PD.W - PD.M, 58);
    g.textAlign = 'left';
    g.fillStyle = PD.band; g.fillRect(0, PD.H - 70, PD.W, 70);
    g.fillStyle = '#9a9aa3'; g.font = `500 24px ${FONT}`; g.fillText('Gym Tracker · fedemorlu24.github.io/gym-tracker', PD.M, PD.H - 26);
    pages.push({c, g, y: 150});
    return pages[pages.length - 1];
  };
  return {pages, newPage};
}
async function planPdf(p) {
  const logo = await loadImg('icons/icon-192.png');
  const {pages, newPage} = pdPages(logo, p);
  let pg = newPage(), g = pg.g;
  const maxY = () => PD.H - 70 - 40, inner = PD.W - 2 * PD.M;
  const hasRir = p.days.some(d => d.ex.some(x => x.rir)), hasTempo = p.days.some(d => d.ex.some(x => x.tempo));
  // colonne: blocco, esercizio, serie × rip., [buffer], recupero, [tempo]
  const cols = [{k: 'b', w: 120, h: t('pdBlock')}, {k: 'e', w: 0, h: t('pdExercise')}, {k: 's', w: 190, h: t('pdSetsReps')}];
  if (hasRir) cols.push({k: 'r', w: 120, h: t('pdBuffer')});
  cols.push({k: 't', w: 140, h: t('pdRest')});
  if (hasTempo) cols.push({k: 'p', w: 130, h: t('pdTempo')});
  cols[1].w = inner - cols.reduce((a, c) => a + c.w, 0);
  const colX = []; cols.reduce((x, c) => { colX.push(x); return x + c.w; }, PD.M);
  const head = () => {
    g.fillStyle = PD.band; g.fillRect(PD.M, pg.y, inner, 58);
    g.fillStyle = '#fff'; g.font = `800 22px ${FONT}`;
    cols.forEach((c, i) => g.fillText(c.h.toUpperCase(), colX[i] + 18, pg.y + 37));
    pg.y += 58;
  };
  const room = h => { if (pg.y + h > maxY()) { pg = newPage(); g = pg.g; return true; } return false; };
  // altezza di una riga della tabella (serve prima di disegnarla, per non lasciare intestazioni orfane)
  const capOf = x => { const L = libFor({lib: x.lib, name: nameFor(x)}); return L ? muscleTxt(L.b.pri.slice(0, 1)).toUpperCase() : ''; };
  const rowH = x => {
    g.font = `700 30px ${FONT}`; const nl = pdWrap(g, nameFor(x), cols[1].w - 36);
    g.font = `500 22px ${FONT}`; const nt = x.note ? pdWrap(g, x.note, cols[1].w - 36) : [];
    const al = x.alt ? pdWrap(g, `${t('pdAlt').toUpperCase()}  ${x.alt}`, cols[1].w - 36) : [];
    return {h: Math.max(118, 22 + nl.length * 38 + nt.length * 30 + al.length * 30 + 18), nl, nt, al};
  };

  // titolo
  g.fillStyle = PD.sub; g.font = `700 26px ${FONT}`; g.fillText(t('pdPlan').toUpperCase(), PD.M, pg.y + 8);
  g.fillStyle = PD.ink; fitText(g, p.name, inner, 76, 800); g.fillText(p.name, PD.M, pg.y + 90);
  pg.y += 134;
  if (p.author) { g.fillStyle = PD.sub; g.font = `500 28px ${FONT}`; g.fillText(`${p.author}${p.role ? ' · ' + p.role : ''}`, PD.M, pg.y); pg.y += 20; }
  if (p.note) {
    g.font = `500 28px ${FONT}`; const ls = pdWrap(g, p.note, inner - 60), h = ls.length * 40 + 40;
    pg.y += 24; g.fillStyle = '#f3f3f6'; rr(g, PD.M, pg.y, inner, h, 22); g.fill();
    g.fillStyle = PD.ink; ls.forEach((l, i) => g.fillText(l, PD.M + 30, pg.y + 48 + i * 40));
    pg.y += h;
  }
  pg.y += 30;

  p.days.forEach((d, di) => {
    if (!d.ex.length) return;
    let warmLines = [], warmH = 0;
    if (d.warm) { g.font = `500 25px ${FONT}`; warmLines = pdWrap(g, d.warm, inner - 250); warmH = Math.max(70, warmLines.length * 36 + 34) + 22; }
    room(130 + warmH + 58 + rowH(d.ex[0]).h);
    g.fillStyle = PD.sub; g.font = `700 24px ${FONT}`;
    g.fillText(`${t('pdDay').toUpperCase()} ${dayLetter(di)}${d.min ? ' · ' + t('pdAbout', d.min).toUpperCase() : ''}`, PD.M, pg.y + 20);
    g.fillStyle = PD.ink; fitText(g, dayTitle(p, di), inner, 60, 800); g.fillText(dayTitle(p, di), PD.M, pg.y + 80);
    g.fillStyle = PD.acc; g.fillRect(PD.M, pg.y + 98, 260, 5);
    pg.y += 130;
    if (d.warm) {
      const ls = warmLines, h = warmH - 22;
      g.fillStyle = '#f3f3f6'; rr(g, PD.M, pg.y, inner, h, 18); g.fill();
      g.fillStyle = PD.ink; g.font = `800 24px ${FONT}`; g.fillText(t('pdWarm'), PD.M + 26, pg.y + 44);
      g.font = `500 25px ${FONT}`; ls.forEach((l, i) => g.fillText(l, PD.M + 220, pg.y + 44 + i * 36));
      pg.y += h + 22;
    }
    head();
    d.ex.forEach((x, j) => {
      const grp = capOf(x), {h, nl, nt, al} = rowH(x);
      if (room(h + 60)) {   // pagina nuova: si ripete il nome del giorno e l'intestazione
        g.fillStyle = PD.sub; g.font = `700 24px ${FONT}`; g.fillText(`${dayTitle(p, di)} · ${t('pdCont')}`.toUpperCase(), PD.M, pg.y + 24); pg.y += 44; head();
      }
      const y = pg.y;
      g.fillStyle = PD.ink; rr(g, colX[0] + 18, y + 24, 62, 38, 8); g.fill();
      g.fillStyle = '#fff'; g.font = `800 22px ${FONT}`; g.fillText('B' + (j + 1), colX[0] + 18 + (62 - g.measureText('B' + (j + 1)).width) / 2, y + 51);
      g.fillStyle = PD.sub; g.font = `600 16px ${FONT}`;
      pdWrap(g, grp, 100).slice(0, 2).forEach((l, i) => g.fillText(l, colX[0] + 18, y + 88 + i * 20));
      let ty = y + 40;
      g.fillStyle = PD.ink; g.font = `700 30px ${FONT}`; nl.forEach(l => { g.fillText(l, colX[1] + 18, ty); ty += 38; });
      g.fillStyle = PD.sub; g.font = `500 22px ${FONT}`; nt.forEach(l => { g.fillText(l, colX[1] + 18, ty - 4); ty += 30; });
      g.fillStyle = PD.ink; g.font = `800 22px ${FONT}`; al.forEach((l, i) => { const k = t('pdAlt').toUpperCase(); if (i === 0 && l.startsWith(k)) { g.fillText(k, colX[1] + 18, ty); const w = g.measureText(k + '  ').width; g.fillStyle = PD.sub; g.font = `500 22px ${FONT}`; g.fillText(l.slice(k.length).trim(), colX[1] + 18 + w, ty); } else { g.fillStyle = PD.sub; g.font = `500 22px ${FONT}`; g.fillText(l, colX[1] + 18, ty); } ty += 30; });
      const cell = (k, v, bold) => { const i = cols.findIndex(c => c.k === k); if (i < 0) return; g.fillStyle = PD.ink; g.font = `${bold ? 800 : 500} 28px ${FONT}`; g.fillText(v, colX[i] + 18, y + 52); };
      cell('s', `${x.sets} × ${x.reps}`, true); cell('r', x.rir || '–'); cell('t', x.rest ? mmss(x.rest) : '–'); cell('p', x.tempo || '–');
      g.fillStyle = PD.line; g.fillRect(PD.M, y + h - 1, inner, 2);
      pg.y += h;
    });
    pg.y += 44;
  });
  if (p.food) {
    g.font = `500 27px ${FONT}`; const ls = pdWrap(g, p.food, inner - 60);
    room(70 + Math.min(ls.length, 12) * 40); g.fillStyle = PD.ink; g.font = `800 40px ${FONT}`; g.fillText(t('foodTips'), PD.M, pg.y + 40); pg.y += 70;
    g.font = `500 27px ${FONT}`;
    ls.forEach((l, i) => { if (ls.length - i === 2 && pg.y + 80 > maxY()) room(1e6); else room(40); g.fillStyle = PD.ink; g.font = `500 27px ${FONT}`; g.fillText(l, PD.M, pg.y + 28); pg.y += 40; });
  }
  const n = pages.length;
  pages.forEach((q, i) => { q.g.fillStyle = PD.acc; q.g.font = `800 26px ${FONT}`; q.g.textAlign = 'right'; q.g.fillText(`${i + 1} / ${n}`, PD.W - PD.M, PD.H - 26); q.g.textAlign = 'left'; });
  const jpgs = await Promise.all(pages.map(q => new Promise(res => q.c.toBlob(b => b.arrayBuffer().then(res), 'image/jpeg', .88))));
  return pdfFromJpegs(jpgs, PD.W, PD.H, p.name);
}
// PDF minimo: una pagina A4 per ogni immagine JPEG (DCTDecode)
function pdfFromJpegs(jpgs, w, h, title) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const N = jpgs.length, kids = jpgs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${N} >>`));
  jpgs.forEach((j, i) => {
    const pn = 3 + i * 3, cn = pn + 1, im = pn + 2, cs = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
    obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${cn} 0 R >>`));
    obj(cn, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.byteLength} >>\nstream\n`); push(new Uint8Array(j)); push('\nendstream'); });
  });
  const total = 3 + N * 3, xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len); let o = 0;
  parts.forEach(b => { out.set(b, o); o += b.length; });
  return new File([out], `${(title || 'scheda').replace(/[^\w\-]+/g, '-').slice(0, 40)}.pdf`, {type: 'application/pdf'});
}
