// Movimenti 3D della guida, costruiti dai punti di controllo dei manuali di palestra (non dal disegno 2D).
// Ogni movimento ha pose(k, u) con u = 0 posizione di partenza → 1 fine (avanti e indietro) e, se serve, build(k, g) per panche e macchine.
// k e' il kit di guide3d.js: busto, gambe, braccia con IK e presa, punti del corpo (onBone), attrezzi. Metri; il corpo guarda +Z, la sua sinistra e' +X.
window.MOVES3D = (() => {
  const L = (a, b, u) => a + (b - a) * u;
  const sides = [['l', 1], ['r', -1]];
  // orientamento del busto: lean = gradi in avanti dalla verticale (90 = prono a testa avanti, -90 = supino a testa indietro)
  const lean = (k, d) => { const r = d * k.RAD; return {up: k.V3(0, Math.cos(r), Math.sin(r)), fwd: k.V3(0, -Math.sin(r), Math.cos(r))}; };
  // punti del corpo a riposo (m), da agganciare all'osso con k.onBone
  const P = {traps: [0, 1.418, -.112], rack: [0, 1.405, .085], nip: [0, 1.2806, .1294], sternum: [0, 1.345, .12], belly: [0, 1.06, .14], hipFront: [0, .9, .13],
    chin: [0, 1.5, .085], forehead: [0, 1.63, .095]};
  const mid = (a, b) => a.clone().add(b).multiplyScalar(.5);
  const shoulders = k => mid(k.wp('uarm.l'), k.wp('uarm.r'));
  // piedi a terra: larghezza w (meta'), punte in fuori yaw, z della caviglia; le ginocchia seguono le punte
  function feet(k, w = .14, yaw = 15, z = 0, zr) {
    sides.forEach(([s, sg]) => k.leg(s, k.V3(sg * w, k.ay, s === 'r' && zr != null ? zr : z), k.V3(sg * Math.sin(yaw * k.RAD) * 1.2, 0, 1), sg * yaw));
  }
  // sposta il corpo in orizzontale finche' il punto p() sta sopra z (es. bilanciere sopra il centro del piede)
  const over = (k, p, z = .07) => { k.shift(k.V3(0, 0, z - p().z)); };
  const reach = (k, s, target) => k.wp('uarm.' + s).distanceTo(target);
  // presa: punti delle due mani su un bilanciere orizzontale di centro c, mezza larghezza w
  const barHands = (k, c, w) => sides.map(([s, sg]) => [s, k.V3(sg * w, c.y, c.z)]);
  const rackPosts = (k, g, z, y, x = .6) => sides.forEach(([s, sg]) => {
    k.post(g, k.V3(sg * x, 0, z), k.V3(sg * x, 1.25, z), .03);
    g.add(k.box(.06, .05, .12, k.steel(), k.V3(sg * x, y + .05, z + .06)));
    g.add(k.box(.07, .04, .5, k.steel(), k.V3(sg * x, .02, z)));
  });
  const smithRails = (k, g, z) => sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .78, 0, z), k.V3(sg * .78, 2.15, z), .02));
  const bar = (c, half = .7, pr = .225) => ({t: 'bar', c, half, pr});
  const db = (p, axis) => ({t: 'db', p, axis});
  // centro del pugno: dove sta l'attrezzo nella mano chiusa
  const fist = (k, s) => { const w = k.wp('hand.' + s), d = k.curDir('hand.' + s); return w.addScaledVector(d, .065); };
  // mano verso un punto con il gomito che punta in pole e il palmo che guarda palm
  const hold = (k, s, at, pole, palm) => k.arm(s, at, pole, palm);
  const neutral = k => k.headTo(k.curDir('spine3').lerp(k.V3(0, 1, 0), .35).normalize());

  const M = {};

  // ---------- squat ----------
  M.squat = o => ({seg: 1300, view: [32, 10], build(k, g) { if (o.smith) smithRails(k, g, .07); }, pose(k, u) {
    const V3 = k.V3, front = o.hold === 'front', gob = o.hold === 'goblet', none = o.hold === 'none';
    const lu = front ? L(4, 22, u) : gob ? L(4, 28, u) : none ? L(4, 36, u) : L(5, 40, u);
    const {up, fwd} = lean(k, lu), hipY = L(.845, front || gob ? .40 : .435, u);
    k.torso(V3(0, hipY, 0), up, fwd, .55);
    const load = () => front ? k.onBone('spine3', P.rack) : gob ? k.onBone('spine3', [0, 1.3, .2]) : none ? mid(k.wp('root'), shoulders(k)) : k.onBone('spine3', P.traps);
    over(k, load, none ? .02 : .07);
    feet(k, .17, 20);
    k.headTo(up.clone().lerp(V3(0, 1, 0), .6).normalize());
    const c = load(), tools = [];
    if (none) sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .12, 0, 1), V3(sg * .05, 0, 1), V3(0, -1, 0), 0));
    else if (gob) {
      sides.forEach(([s, sg]) => hold(k, s, c.clone().add(V3(sg * .045, .07, -.01)), V3(sg * .2, -1, .3), V3(-sg, .5, 0).normalize()));
      tools.push(o.kb ? {t: 'kb', p: c.clone().add(V3(0, .08, 0)), down: V3(0, -1, 0)} : db(c, V3(0, 1, 0)));
    } else if (front) {
      barHands(k, c, .21).forEach(([s, p]) => hold(k, s, p.clone().add(V3(0, -.01, -.02)), V3((s === 'l' ? 1 : -1) * .3, .25, 1), V3(0, 1, 0)));
      tools.push(o.db ? db(c.clone().add(V3(.2, 0, 0)), V3(1, 0, 0)) : bar(c));
    } else {
      barHands(k, c, .27).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .35, -1, -.7), fwd));
      tools.push(bar(c));
    }
    return {tools};
  }});

  // ---------- stacchi e cerniera dell'anca ----------
  // braccia tese, spalle appena davanti al bilanciere, bilanciere sempre sopra il centro del piede
  function pullFrom(k, barY, lu, w, palmFn, wide) {
    const V3 = k.V3, {up, fwd} = lean(k, lu), b = V3(0, barY, .07);
    k.torso(V3(0, .8, -.1), up, fwd, .6);
    const sh = shoulders(k), dy = Math.sqrt(Math.max(.01, .615 * .615 - Math.pow(w - .158, 2)));
    k.shift(V3(0, b.y + dy - sh.y, b.z + .03 - sh.z));
    return {b, up, fwd};
  }
  M.deadlift = o => ({seg: 1400, view: [40, 8], build(k, g) { if (o.rack) sides.forEach(([s, sg]) => { k.post(g, k.V3(sg * .62, 0, .07), k.V3(sg * .62, .5, .07), .03); g.add(k.box(.08, .04, .14, k.steel(), k.V3(sg * .62, .46, .07))); }); },
    pose(k, u) {
      const V3 = k.V3, sumo = o.kind === 'sumo', trap = o.kind === 'trap';
      const by = L(o.rack ? .5 : trap ? .24 : .225, trap ? .74 : .735, u), lu = L(o.rack ? 30 : sumo ? 30 : trap ? 36 : 47, 0, u), w = sumo ? .16 : trap ? .28 : .23;
      const {b, fwd} = pullFrom(k, by, lu, w);
      feet(k, sumo ? .36 : .12, sumo ? 35 : 8);
      neutral(k);
      sides.forEach(([s, sg]) => hold(k, s, V3(sg * w, b.y, b.z), V3(sg * .3, .3, -1), trap ? V3(-sg, 0, 0) : V3(0, 0, -1)));
      if (trap) return {tools: [{t: 'box', p: V3(0, b.y, b.z), s: [.62, .03, .9], c: 0x3b3f46}, {t: 'line', a: V3(.28, b.y, b.z - .07), b: V3(.28, b.y, b.z + .07), r: .016}, {t: 'line', a: V3(-.28, b.y, b.z - .07), b: V3(-.28, b.y, b.z + .07), r: .016},
        {t: 'plate', p: V3(.62, b.y, b.z), n: V3(1, 0, 0), r: .225}, {t: 'plate', p: V3(-.62, b.y, b.z), n: V3(1, 0, 0), r: .225}]};
      if (o.db) return {tools: sides.map(([s, sg]) => db(V3(sg * w, b.y, b.z), V3(1, 0, 0)))};
      return {tools: [bar(b)]};
    }});
  M.hinge = o => ({seg: 1500, view: [70, 8], pose(k, u) {
    const V3 = k.V3;
    if (o.good) {        // good morning: bilanciere sui trapezi, ginocchia morbide, anche indietro
      const {up, fwd} = lean(k, L(3, 72, u));
      k.torso(V3(0, L(.845, .80, u), 0), up, fwd, .6);
      const c = () => k.onBone('spine3', P.traps);
      k.shift(V3(0, 0, .05 - (c().z + k.wp('root').z) / 2));
      feet(k, .15, 12); neutral(k);
      barHands(k, c(), .27).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .35, -1, -.6), fwd));
      return {tools: [bar(c())]};
    }
    const by = L(.735, o.straight ? .26 : .36, u), lu = L(0, o.straight ? 82 : 72, u);
    const {b} = pullFrom(k, by, lu, .22);
    feet(k, .13, 8); neutral(k);
    const tools = [];
    sides.forEach(([s, sg]) => hold(k, s, V3(sg * .22, b.y, b.z), V3(sg * .3, .3, -1), o.db ? V3(-sg, 0, 0) : V3(0, 0, -1)));
    if (o.db) sides.forEach(([s, sg]) => tools.push(db(V3(sg * .22, b.y, b.z), V3(0, 0, 1)))); else tools.push(bar(b));
    return {tools};
  }});

  // ---------- panca ----------
  // schiena e glutei sulla panca, piedi a terra, bilanciere sopra le spalle a braccia tese → meta' petto; avambracci verticali, gomiti 45-60°
  M.bench = o => {
    const inc = o.incline || 0, top = .44, hipZ = inc > 0 ? .1 : .15;
    return {seg: 1400, view: [38, 22], build(k, g) {
      const V3 = k.V3;
      if (o.floor) return;
      if (inc > 0) {
        k.pad(g, V3(0, top, .42), V3(0, top, .02), .3, .08);
        const a = inc * k.RAD; k.pad(g, V3(0, top + .02, .03), V3(0, top + .02 + Math.sin(a) * .85, .03 - Math.cos(a) * .85), .3, .08);
        k.post(g, V3(0, 0, .2), V3(0, top - .04, .2), .03); k.post(g, V3(0, 0, -.35), V3(0, top + .2, -.35), .03);
      } else if (inc < 0) {
        const a = -inc * k.RAD, z0 = .48, y0 = top + .1; k.pad(g, V3(0, y0, z0), V3(0, y0 - Math.sin(a) * 1.05, z0 - Math.cos(a) * 1.05), .3, .08);
        k.post(g, V3(0, 0, .3), V3(0, y0 - .02, .3), .03); k.post(g, V3(0, 0, -.45), V3(0, y0 - Math.sin(a) * .95, -.45), .03);
        g.add(k.seg(V3(-.18, .6, .62), V3(.18, .6, .62), .04, k.mat(0x2a2d33, .8)));
      } else {
        k.pad(g, V3(0, top, .42), V3(0, top, -.62), .3, .08);
        k.post(g, V3(0, 0, .3), V3(0, top - .04, .3), .03); k.post(g, V3(0, 0, -.5), V3(0, top - .04, -.5), .03);
      }
      if (!o.db) {
        const hy = o.floor ? .62 : inc > 0 ? 1.45 : 1.08;
        if (o.smith) smithRails(k, g, inc > 0 ? -.2 : -.25); else rackPosts(k, g, inc > 0 ? -.45 : -.58, hy);
      }
    }, pose(k, u) {
      const V3 = k.V3, a = inc * k.RAD;
      const up = V3(0, Math.sin(a) + .04, -Math.cos(a)).normalize(), fwd = V3(0, Math.cos(a), Math.sin(a)).normalize();
      const hip = o.floor ? V3(0, .1, .15) : inc < 0 ? V3(0, top + .2, .36) : V3(0, top + .1, hipZ);
      k.torso(hip, up, fwd, .9);
      const fz = k.wp('root').z + (o.floor ? .3 : .36);
      if (inc < 0) sides.forEach(([s, sg]) => k.leg(s, V3(sg * .1, .58, .6), V3(sg * .2, 1, .2), 0));
      else sides.forEach(([s, sg]) => k.leg(s, V3(sg * (o.floor ? .14 : .25), k.ay, fz), V3(sg * .25, 1, .2), sg * 15));
      k.headTo(up.clone());
      const sh = shoulders(k), lowAt = inc > 0 ? [0, 1.34, .13] : inc < 0 ? [0, 1.23, .125] : P.nip;
      const topP = sh.clone().addScaledVector(fwd, .63), botP = k.onBone('spine3', lowAt).addScaledVector(fwd, o.floor ? .09 : o.db ? .04 : .016);
      const c = topP.lerp(botP, u), close = o.close, w = o.db ? L(.14, .29, u) : close ? .15 : .29, feetDir = up.clone().negate();
      const pole = sg => V3(sg * (close || o.jm ? .05 : .22), 0, 0).addScaledVector(fwd, -1).addScaledVector(feetDir, close || o.jm ? .5 : .28);
      const tools = [];
      sides.forEach(([s, sg]) => { const p = c.clone().add(V3(sg * w, 0, 0)); hold(k, s, p, pole(sg), feetDir); if (o.db) tools.push(db(p, V3(1, 0, 0))); });
      if (!o.db) tools.push(bar(c));
      return {tools};
    }};
  };

  // ---------- spinte sopra la testa ----------
  M.ohp = o => ({seg: 1400, view: [35, 8], build(k, g) {
    if (!o.seat) return;
    const V3 = k.V3; k.pad(g, V3(0, .46, .28), V3(0, .46, -.08), .32, .08); k.pad(g, V3(0, .5, -.14), V3(0, 1.2, -.2), .3, .07);
    k.post(g, V3(0, 0, .1), V3(0, .42, .1), .03);
    if (o.machine) sides.forEach(([s, sg]) => k.post(g, V3(sg * .45, 0, -.3), V3(sg * .45, 2, -.3), .03));
  }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, o.seat ? -4 : L(-3, 0, u));
    if (o.seat) { k.torso(V3(0, .56, .02), up, fwd, .3); sides.forEach(([s, sg]) => k.leg(s, V3(sg * .2, k.ay, .48), V3(sg * .3, .3, 1), sg * 12)); }
    else { k.torso(V3(0, .845, 0), up, fwd, .5); }
    const sh = shoulders(k), tools = [];
    if (o.seat) {        // manubri: dalle spalle alla distensione completa sopra la testa
      sides.forEach(([s, sg]) => {
        const bot = V3(sg * (o.arnold ? .12 : .3), sh.y + (o.arnold ? .02 : .03), sh.z + (o.arnold ? .12 : .02)), tp = V3(sg * .16, sh.y + .6, sh.z - .02);
        const p = bot.lerp(tp, u), palm = o.arnold ? V3(-sg * Math.sin(u * Math.PI), 0, -Math.cos(u * Math.PI)) : V3(0, 0, 1);
        hold(k, s, p, V3(sg * (o.arnold ? .3 : 1), -.6, o.arnold ? .5 : 0), palm);
        tools.push(o.machine ? {t: 'line', a: p.clone().add(V3(0, -.05, 0)), b: V3(sg * .45, p.y - .05, -.3), r: .015} : db(p, V3(1, 0, 0)));
      });
      k.headTo(up.clone());
      return {tools};
    }
    const c = () => V3(0, L(sh.y + .03, sh.y + .6, u), L(sh.z + .12, sh.z - .01, u));
    over(k, () => c(), .07);
    feet(k, .15, 12);
    const cc = c();
    barHands(k, cc, .24).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .35, -.6, .55), fwd));
    k.headTo(up.clone().addScaledVector(fwd, u < .5 ? -.15 : 0).normalize());
    return {tools: [bar(cc)]};
  }});

  // ---------- rematori e trazioni ----------
  M.row = o => ({seg: 1200, view: [70, 10], pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 68);
    k.torso(V3(0, .76, -.12), up, fwd, .6);
    const sh = shoulders(k), hang = V3(0, sh.y - .6, sh.z + .02), pulled = k.onBone('spine2', o.tbar ? [0, 1.2, .16] : [0, 1.12, .16]);
    const c = hang.lerp(pulled, u);
    over(k, () => k.onBone('root', [0, .86, 0]).lerp(sh, .5), .0);
    feet(k, .14, 10); neutral(k);
    const w = o.tbar ? .055 : o.db ? .17 : .24, tools = [];
    sides.forEach(([s, sg]) => {
      const p = V3(sg * w, c.y, c.z);
      hold(k, s, p, V3(sg * (o.tbar ? .2 : .4), .7, -1), o.db || o.tbar ? V3(-sg, 0, 0) : V3(0, 0, -1));
      if (o.db) tools.push(db(p, V3(0, 0, 1)));
    });
    if (o.tbar) tools.push({t: 'line', a: V3(0, .03, -1.35), b: V3(0, c.y, c.z + .08), r: .016}, {t: 'plate', p: V3(0, c.y - .02, c.z + .02), n: V3(0, 0, 1).sub(V3(0, c.y, 0)).normalize(), r: .2});
    else if (!o.db) tools.push(bar(c));
    return {tools};
  }});
  // trazioni: da appeso a braccia tese al mento sopra la sbarra
  M.pull = o => {
    const BY = 2.25, w = o.chin ? .18 : .33;
    return {seg: 1400, view: [30, 8], build(k, g) {
      const V3 = k.V3; sides.forEach(([s, sg]) => k.post(g, V3(sg * .7, 0, 0), V3(sg * .7, BY + .08, 0), .03));
      g.add(k.seg(V3(-.72, BY, 0), V3(.72, BY, 0), .016, k.steel()));
    }, pose(k, u) {
      const V3 = k.V3, {up, fwd} = lean(k, L(0, -12, u));
      k.torso(V3(0, 1.3, 0), up, fwd, .5);
      const sh = shoulders(k), ty = L(BY - .6, BY - .09, u);
      k.shift(V3(0, ty - sh.y, -.03 - sh.z));
      sides.forEach(([s, sg]) => { k.legDir(s, V3(0, -1, .18).normalize(), V3(0, -1, .05).normalize(), V3(0, -.7, .7).normalize()); });
      k.headTo(up.clone().lerp(V3(0, 1, 0), .5).normalize());
      sides.forEach(([s, sg]) => hold(k, s, V3(sg * w, BY, 0), V3(sg * 1, -.6, o.chin ? .5 : -.2), o.chin ? V3(0, 0, -1) : V3(0, 0, 1)));
      return {tools: o.band ? [{t: 'line', a: V3(0, BY, 0), b: k.wp('shin.l').lerp(k.wp('shin.r'), .5), r: .008, c: 0xe0592b}] : []};
    }};
  };
  M.pulldown = o => ({seg: 1300, view: [35, 10], build(k, g) {
    const V3 = k.V3; k.pad(g, V3(0, .46, .3), V3(0, .46, -.12), .34, .08); k.post(g, V3(0, 0, .1), V3(0, .42, .1), .035);
    g.add(k.seg(V3(-.2, .66, .36), V3(.2, .66, .36), .045, k.mat(0x2a2d33, .8)));
    k.post(g, V3(0, 0, -.55), V3(0, 2.4, -.55), .04); k.post(g, V3(0, 2.4, -.55), V3(0, 2.4, .05), .035);
  }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, L(-6, -14, u));
    k.torso(V3(0, .56, .02), up, fwd, .4);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .18, k.ay, .5), V3(sg * .2, .4, 1), sg * 10));
    const sh = shoulders(k), c = V3(0, sh.y + .6, sh.z + .06).lerp(k.onBone('spine3', P.sternum).add(V3(0, .04, .06)), u);
    const w = o.close ? .1 : .38;
    sides.forEach(([s, sg]) => hold(k, s, V3(sg * w, c.y, c.z), V3(sg, -.8, -.3), o.close ? V3(-sg, 0, 0) : V3(0, 0, 1)));
    k.headTo(up.clone().lerp(V3(0, 1, 0), .5).normalize());
    const tools = [{t: 'cable', a: c.clone().add(V3(0, .02, 0)), b: V3(0, 2.4, .05), kind: o.close ? 'd' : 'bar'}];
    return {tools};
  }});

  // ---------- braccia ----------
  // curl: gomiti fermi ai fianchi, si muove solo l'avambraccio (0° → ~140°)
  M.curl = o => ({seg: 1100, view: [30, 6], pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 0);
    k.torso(V3(0, .845, 0), up, fwd, .5);
    feet(k, .13, 10); neutral(k);
    const th = L(8, 138, u) * k.RAD, tools = [], ps = [];
    sides.forEach(([s, sg]) => {
      const ua = o.drag ? V3(sg * .05, -1, -L(.05, .7, u)).normalize() : V3(sg * .06, -1, .08).normalize();
      const fd = V3(0, -Math.cos(th), Math.sin(th)).normalize(), n0 = V3(0, Math.sin(th), Math.cos(th));
      const palm = o.grip === 'neu' ? V3(-sg, 0, 0) : o.grip === 'pro' ? n0.clone().negate() : n0;
      k.armDir(s, ua, o.drag ? V3(0, 1, .25).normalize().lerp(V3(0, -1, .1), 1 - u).normalize() : fd, palm, 1);
      const f = fist(k, s); ps.push(f);
      if (o.db) tools.push(db(f, k.curDir('hand.' + s).cross(palm).normalize()));
    });
    if (!o.db) { const c = mid(ps[0], ps[1]); tools.push(bar(c, o.ez ? .62 : .7, .16)); if (o.cable) tools.push({t: 'cable', a: c, b: V3(0, .12, .55), kind: 'bar'}); if (o.band) tools.push({t: 'line', a: c, b: V3(0, .02, .02), r: .006, c: 0xe0592b}); }
    return {tools};
  }});
  // pushdown al cavo alto: gomiti ai fianchi, l'avambraccio scende fino a braccio teso
  M.pushdown = o => ({seg: 1100, view: [60, 6], build(k, g) { const V3 = k.V3; k.post(g, V3(0, 0, .55), V3(0, 2.25, .55), .04); g.add(k.box(.3, .5, .2, k.mat(0x4a4e57, .6, .3), V3(0, .5, .65))); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 10);
    k.torso(V3(0, .845, -.02), up, fwd, .5);
    feet(k, .14, 10); neutral(k);
    const th = L(100, 4, u) * k.RAD, ps = [];
    sides.forEach(([s, sg]) => {
      const ua = V3(sg * .05, -1, .06).normalize(), fd = V3(sg * .05, -Math.cos(th), Math.sin(th)).normalize();
      const palm = o.rope ? V3(-sg, 0, 0) : V3(0, Math.sin(th), Math.cos(th)).negate();
      k.armDir(s, ua, fd, palm, 1); ps.push(fist(k, s));
    });
    const c = mid(ps[0], ps[1]);
    return {tools: [{t: 'cable', a: c, b: V3(0, 2.2, .45), kind: o.rope ? 'rope' : 'bar'}]};
  }});

  // ---------- spalle ----------
  // alzate: laterali (piano della scapola, gomiti appena piegati, fino all'orizzontale), frontali (fino all'altezza delle spalle)
  M.raise = o => ({seg: 1200, view: o.front ? [60, 6] : [20, 8], pose(k, u) {
    const V3 = k.V3, lu = o.rev ? 72 : 4, {up, fwd} = lean(k, lu);
    k.torso(V3(0, o.rev ? .79 : .845, o.rev ? -.12 : 0), up, fwd, .6);
    feet(k, .14, 10); neutral(k);
    const tools = [];
    sides.forEach(([s, sg]) => {
      const a = L(o.rev ? 5 : 8, o.front ? 88 : o.y ? 150 : 86, u) * k.RAD;
      let ua;
      if (o.front) ua = V3(sg * .1, -Math.cos(a), Math.sin(a));
      else if (o.rev) ua = V3(sg * Math.sin(a), -Math.cos(a), 0).addScaledVector(fwd, .05);    // busto quasi orizzontale: le braccia si aprono di lato
      else ua = V3(sg * Math.sin(a), -Math.cos(a), Math.sin(a) * (o.y ? .4 : .3));
      ua.normalize();
      const fa = ua.clone().add(V3(0, o.front || o.y ? 0 : -.18, o.front ? 0 : .05)).normalize();
      const palm = o.front ? V3(0, -Math.sin(a), -Math.cos(a)) : o.y ? V3(-sg * .3, 0, 1).normalize() : V3(-sg, 0, 0).lerp(V3(0, -1, 0), u).normalize();
      k.armDir(s, ua, fa, palm, 1);
      const f = fist(k, s); tools.push(o.cable ? {t: 'cable', a: f, b: V3(-sg * .25, .12, .1), kind: 'd'} : db(f, k.curDir('hand.' + s).cross(palm).normalize()));
    });
    return {tools};
  }});

  // ---------- piegamenti ----------
  // corpo in linea dai talloni alla testa, mani sotto le spalle, gomiti a ~45° indietro, petto vicino al pavimento in basso
  M.pushup = o => ({seg: 1100, view: [70, 14], pose(k, u) {
    const V3 = k.V3, ankZ = -.78, ay = .1, Ltot = 1.285;
    const sy = L(.58, .2, u), ph = Math.asin((sy - ay) / Ltot);
    const dir = V3(0, Math.sin(ph), Math.cos(ph)), fwd = V3(0, -Math.cos(ph), Math.sin(ph));
    const hip = V3(0, ay, ankZ).addScaledVector(dir, .765);
    k.torso(hip, dir, fwd, .9);
    sides.forEach(([s, sg]) => k.legDir(s, dir.clone().negate().add(V3(-sg * .02, 0, 0)).normalize(), dir.clone().negate(), V3(0, -.8, -.6).normalize()));
    k.headTo(dir.clone().addScaledVector(fwd, .15).normalize());
    const sh = shoulders(k), w = o.diamond ? .05 : .22;
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * w, .05, sh.z + (o.diamond ? .1 : .03)), V3(sg * (o.diamond ? .2 : .6), .5, -.7), V3(0, -1, 0)); k.grip(s, -.15); });
    return {tools: []};
  }});

  // ---------- affondi ----------
  M.lunge = o => ({seg: 1300, view: [75, 6], build(k, g) {
    const V3 = k.V3;
    if (o.bulgarian) { k.pad(g, V3(0, .45, -.48), V3(0, .45, -.82), .3, .08); k.post(g, V3(0, 0, -.65), V3(0, .41, -.65), .03); }
    if (o.step) g.add(k.box(.5, .4, .45, k.mat(0x3a3d44, .8), V3(0, .2, .32)));
  }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, o.step ? L(10, 2, u) : 3), tools = [];
    if (o.step) {
      k.torso(V3(.02, L(.88, 1.22, u), L(.02, .3, u)), up, fwd, .5);
      k.leg('l', V3(.12, .4 + k.ay, .34), V3(.2, 0, 1), 8);
      k.leg('r', V3(-.12, L(k.ay, .4 + k.ay, Math.max(0, u * 1.4 - .4)), L(-.1, .3, Math.max(0, u * 1.4 - .4))), V3(-.2, 0, 1), -8);
    } else {
      const fz = o.bulgarian ? .33 : .42;
      k.torso(V3(0, L(.85, .5, u), o.bulgarian ? -.02 : 0), up, fwd, .5);
      k.leg('l', V3(.12, k.ay, fz), V3(.2, 0, 1), 6);
      if (o.bulgarian) { k.leg('r', V3(-.12, .53, -.66), V3(-.1, -.2, 1), 0); k.aim('foot.r', V3(0, -.3, -1).normalize()); }
      else { k.leg('r', V3(-.12, .1, -.5), V3(-.1, -.3, 1), 0); k.aim('foot.r', V3(0, -.7, -.7).normalize()); }
    }
    neutral(k);
    if (o.hold === 'back') { const c = k.onBone('spine3', P.traps); barHands(k, c, .27).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .35, -1, -.7), fwd)); tools.push(bar(c)); }
    else sides.forEach(([s, sg]) => { k.armDir(s, V3(sg * .1, -1, 0).normalize(), V3(sg * .05, -1, .03).normalize(), V3(-sg, 0, 0), o.db ? 1 : .3); if (o.db) tools.push(db(fist(k, s), V3(0, 0, 1))); });
    return {tools};
  }});

  // ---------- aiuti comuni ----------
  // seduto: bacino 10 cm sopra il piano del sedile, piedi a terra davanti
  function sit(k, seatY = .46, z = 0, lu = -3, fz = .45, fw = .2) {
    const f = lean(k, lu); k.torso(k.V3(0, seatY + .1, z), f.up, f.fwd, .3);
    sides.forEach(([s, sg]) => k.leg(s, k.V3(sg * fw, k.ay, fz), k.V3(sg * .3, .4, 1), sg * 12)); return f;
  }
  // supino su panca (piana o inclinata di inc gradi), piedi a terra
  function lie(k, top = .44, hipZ = .15, inc = 0) {
    const V3 = k.V3, a = inc * k.RAD, up = V3(0, Math.sin(a) + .04, -Math.cos(a)).normalize(), fwd = V3(0, Math.cos(a), Math.sin(a)).normalize();
    k.torso(V3(0, top + .1, hipZ), up, fwd, .9);
    const fz = k.wp('root').z + .36; sides.forEach(([s, sg]) => k.leg(s, V3(sg * .25, k.ay, fz), V3(sg * .25, 1, .2), sg * 15)); k.headTo(up.clone());
    return {up, fwd};
  }
  const flatBench = (k, g, z0 = .42, z1 = -.62, top = .44) => { const V3 = k.V3; k.pad(g, V3(0, top, z0), V3(0, top, z1), .3, .08); k.post(g, V3(0, 0, z0 - .12), V3(0, top - .04, z0 - .12), .03); k.post(g, V3(0, 0, z1 + .12), V3(0, top - .04, z1 + .12), .03); };
  const inclBench = (k, g, inc, top = .44, back = .85) => { const V3 = k.V3, a = inc * k.RAD; k.pad(g, V3(0, top, .42), V3(0, top, .02), .3, .08); k.pad(g, V3(0, top + .02, .03), V3(0, top + .02 + Math.sin(a) * back, .03 - Math.cos(a) * back), .3, .08); k.post(g, V3(0, 0, .2), V3(0, top - .04, .2), .03); k.post(g, V3(0, 0, -.3), V3(0, top + .2, -.3), .03); };
  const seat = (k, g, y = .46, z = 0, back) => { const V3 = k.V3; k.pad(g, V3(0, y, z + .22), V3(0, y, z - .16), .34, .08); k.post(g, V3(0, 0, z), V3(0, y - .04, z), .035); if (back) k.pad(g, V3(0, y + .06, z - .2), V3(0, y + back, z - .26), .3, .07); };
  const stack = (k, g, z = -.6, x = 0) => { const V3 = k.V3; g.add(k.box(.32, .55, .2, k.mat(0x4a4e57, .6, .3), V3(x, .3, z))); k.post(g, V3(x - .2, 0, z), V3(x - .2, 2.2, z), .03); k.post(g, V3(x + .2, 0, z), V3(x + .2, 2.2, z), .03); };
  // gomito fermo, avambraccio che ruota nel piano del braccio: ua direzione del braccio, th angolo di flessione (0 = disteso)
  function bend(k, s, ua, th, side = k.V3(1, 0, 0)) {
    const ax = ua.clone().cross(side).normalize(), fa = ua.clone().applyAxisAngle(ax, -th * k.RAD);
    return fa;
  }
  const shrug = (k, deg) => sides.forEach(([s, sg]) => k.worldDelta('clav.' + s, new (k.T.Quaternion)().setFromAxisAngle(k.V3(0, 0, 1), sg * deg * k.RAD)));
  const tiptoe = (k, s, pitch) => { const d = k.restDir('foot.' + s).applyAxisAngle(k.V3(1, 0, 0), pitch * k.RAD); k.aim('foot.' + s, d); k.aim('toe.' + s, k.restDir('toe.' + s)); };
  const crossArms = k => sides.forEach(([s, sg]) => k.armDir(s, k.V3(sg * .2, -.6, .5).normalize(), k.V3(-sg * .9, .35, .1).normalize(), k.V3(0, 0, -1), .7));

  // ---------- curl particolari ----------
  M.curlIncl = o => ({seg: 1200, view: [55, 10], build(k, g) { inclBench(k, g, 50, .46); }, pose(k, u) {
    const V3 = k.V3; lie(k, .46, .1, 50);
    const th = L(5, 130, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * .08, -1, -.12).normalize(), fd = V3(0, -Math.cos(th), Math.sin(th)), palm = V3(0, Math.sin(th), Math.cos(th));
      k.armDir(s, ua, fd, palm, 1); tools.push(db(fist(k, s), V3(1, 0, 0))); });
    return {tools};
  }});
  M.curlPreacher = o => ({seg: 1200, view: [70, 12], build(k, g) { const V3 = k.V3; seat(k, g, .5, -.05); k.pad(g, V3(0, 1.13, .2), V3(0, .88, .47), .42, .09); k.post(g, V3(0, 0, .42), V3(0, .9, .42), .035); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .5, -.05, 12, .4); k.headTo(f.up.clone());
    const ua = V3(0, -.75, .66).normalize(), tools = [], ps = [];
    sides.forEach(([s, sg]) => { const th = L(10, 125, u), fa = ua.clone().applyAxisAngle(V3(1, 0, 0), -th * k.RAD); k.armDir(s, V3(sg * .12, -.75, .66).normalize(), fa, V3(0, 1, 0).applyAxisAngle(V3(1, 0, 0), -th * k.RAD), 1); ps.push(fist(k, s)); });
    if (o.db) ps.forEach(p => tools.push(db(p, V3(1, 0, 0)))); else tools.push(bar(mid(ps[0], ps[1]), o.ez || !o.db ? .62 : .7, .16));
    return {tools};
  }});
  M.curlConc = o => ({seg: 1100, view: [20, 12], build(k, g) { seat(k, g, .46, 0); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .46, 0, 32, .42, .3); k.headTo(f.up.clone().lerp(V3(0, 1, 0), .3).normalize());
    const th = L(8, 135, u) * k.RAD, fd = V3(.05, -Math.cos(th), Math.sin(th)).normalize();
    k.armDir('l', V3(-.05, -1, .02).normalize(), fd, V3(0, Math.sin(th), Math.cos(th)), 1);
    k.arm('r', k.wp('shin.r').add(V3(0, .05, .05)), V3(-.4, -.4, .2), V3(0, -1, 0)); k.grip('r', .4);
    return {tools: [db(fist(k, 'l'), V3(1, 0, 0))]};
  }});
  M.curlSpider = o => ({seg: 1100, view: [70, 12], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .45, -.55), V3(0, 1.0, .15), .32, .08); k.post(g, V3(0, 0, -.1), V3(0, .75, -.1), .035); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 50); k.torso(V3(0, .68, -.42), up, fwd, .6);
    feet(k, .15, 10, -.75); neutral(k);
    const th = L(5, 135, u) * k.RAD, ps = [];
    sides.forEach(([s, sg]) => { k.armDir(s, V3(sg * .1, -1, .05).normalize(), V3(0, -Math.cos(th), Math.sin(th)), V3(0, Math.sin(th), Math.cos(th)), 1); ps.push(fist(k, s)); });
    return {tools: o.db ? ps.map(p => db(p, V3(1, 0, 0))) : [bar(mid(ps[0], ps[1]), .62, .16)]};
  }});

  // ---------- tricipiti ----------
  M.dip = o => ({seg: 1200, view: [55, 6], build(k, g) { const V3 = k.V3; sides.forEach(([s, sg]) => { k.post(g, V3(sg * .27, 1.18, -.35), V3(sg * .27, 1.18, .35), .022); k.post(g, V3(sg * .27, 0, -.3), V3(sg * .27, 1.18, -.3), .03); k.post(g, V3(sg * .27, 0, .3), V3(sg * .27, 1.18, .3), .03); }); }, pose(k, u) {
    const V3 = k.V3, BY = 1.18, {up, fwd} = lean(k, L(6, 18, u)); k.torso(V3(0, 1.1, 0), up, fwd, .5);
    const sh = shoulders(k); k.shift(V3(0, L(BY + .52, BY + .2, u) - sh.y, -.02 - sh.z));
    sides.forEach(([s, sg]) => k.legDir(s, V3(0, -1, .25).normalize(), V3(0, -.6, -.8).normalize(), V3(0, -.5, -.85).normalize()));
    neutral(k);
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * .27, BY + .03, .0), V3(0, .5, -1), V3(-sg, 0, 0)));
    return {tools: o.db || o.plate ? [{t: 'plate', p: k.wp('thigh.l').lerp(k.wp('thigh.r'), .5).add(V3(0, -.15, .1)), n: V3(0, 0, 1), r: .15}] : []};
  }});
  M.benchDip = o => ({seg: 1100, view: [70, 8], build(k, g) { flatBench(k, g, .05, -1.0); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, -6); k.torso(V3(0, L(.5, .25, u), .12), up, fwd, .6);
    const sh = shoulders(k); k.shift(V3(0, 0, .02 - sh.z + .05));
    sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, k.ay, .85), V3(0, 1, 0), 0); });
    neutral(k);
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * .2, .47, -.06), V3(0, .2, -1), V3(0, -1, 0)));
    return {tools: []};
  }});
  M.skull = o => ({seg: 1200, view: [60, 18], build(k, g) { flatBench(k, g); }, pose(k, u) {
    const V3 = k.V3, f = lie(k), ua = V3(0, .97, -.25).normalize(), th = L(5, 115, u), ps = [];
    sides.forEach(([s, sg]) => { const u2 = V3(sg * .05, .97, -.25).normalize(), fa = bend(k, s, u2, th); k.armDir(s, u2, fa, f.up.clone().negate(), 1); ps.push(fist(k, s)); });
    return {tools: o.db ? ps.map(p => db(p, V3(0, 0, 1))) : [bar(mid(ps[0], ps[1]), .62, .16)]};
  }});
  M.overheadExt = o => ({seg: 1200, view: [70, 8], build(k, g) { if (o.seat) seat(k, g, .46, 0, .75); }, pose(k, u) {
    const V3 = k.V3; let f;
    if (o.seat) f = sit(k, .46, 0, -2, .42); else { f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .15, 10); }
    neutral(k);
    const th = L(8, 150, u), ps = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * .12, 1, .08).normalize(), fa = bend(k, s, ua, th); k.armDir(s, ua, fa, V3(-sg, 0, 0), 1); ps.push(fist(k, s)); });
    const c = mid(ps[0], ps[1]);
    return {tools: o.cable ? [{t: 'cable', a: c, b: V3(0, .15, -.6), kind: 'rope'}] : o.ez || o.bb ? [bar(c, .62, .16)] : [db(c, V3(0, 1, 0))]};
  }});
  M.kickback = o => ({seg: 1100, view: [80, 8], pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 62); k.torso(V3(0, .77, -.1), up, fwd, .6);
    feet(k, .14, 10, .05); neutral(k);
    const ua = up.clone().negate().add(V3(0, -.15, 0)).normalize(), th = L(95, 3, u), tools = [];
    sides.forEach(([s, sg]) => { const u2 = ua.clone().add(V3(sg * .06, 0, 0)).normalize(), fa = bend(k, s, u2, th); k.armDir(s, u2, fa, V3(-sg, 0, 0), 1); tools.push(o.cable ? {t: 'cable', a: fist(k, s), b: V3(-sg * .1, .15, .8), kind: 'd'} : db(fist(k, s), V3(0, 0, 1))); });
    return {tools};
  }});
  M.machineExt = o => ({seg: 1100, view: [65, 10], build(k, g) { const V3 = k.V3; seat(k, g, .5, -.05, .8); k.pad(g, V3(0, 1.1, .28), V3(0, .98, .42), .45, .08); stack(k, g, .75); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .5, -.05, -2, .4); k.headTo(f.up.clone());
    const th = L(100, 8, u), ps = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * .15, -.25, 1).normalize(), fa = bend(k, s, ua, -th); k.armDir(s, ua, fa, V3(-sg, 0, 0), 1); ps.push(fist(k, s)); });
    return {tools: ps.map(p => ({t: 'line', a: p.clone().add(V3(0, .05, 0)), b: p.clone().add(V3(0, -.05, 0)), r: .018}))};
  }});

  // ---------- schiena (altri) ----------
  M.straightArm = o => ({seg: 1200, view: [70, 8], build(k, g) { stack(k, g, .9); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 28); k.torso(V3(0, .82, -.12), up, fwd, .6);
    feet(k, .15, 10); neutral(k);
    const a = L(115, -8, u) * k.RAD, ps = [];
    sides.forEach(([s, sg]) => { const d = V3(sg * .12, -Math.cos(a), Math.sin(a)).normalize(); k.armDir(s, d, d.clone().add(V3(0, .05, 0)).normalize(), V3(0, Math.sin(a), Math.cos(a)).negate(), 1); ps.push(fist(k, s)); });
    const c = mid(ps[0], ps[1]); return {tools: [{t: 'cable', a: c, b: V3(0, 2.1, .85), kind: o.rope ? 'rope' : 'bar'}]};
  }});
  M.row1 = o => ({seg: 1100, view: [-25, 18], build(k, g) { flatBench(k, g, .75, -.15, .44); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 82); k.torso(V3(.02, .8, -.05), up, fwd, .7);
    k.leg('l', V3(.3, k.ay, -.2), V3(.4, 0, 1), 10); k.leg('r', V3(-.08, .52, -.32), V3(-.1, -.6, 1), 0); k.aim('foot.r', V3(0, 0, -1));
    neutral(k);
    k.arm('r', V3(-.05, .5, .55), V3(-.3, .3, -.6), V3(0, -1, 0)); k.grip('r', -.1);
    const sh = k.wp('uarm.l'), hang = V3(sh.x + .02, sh.y - .6, sh.z + .02), top = k.onBone('spine1', [.17, 1.0, .02]);
    const p = hang.lerp(top, u); k.arm('l', p, V3(.2, 1, -.7), V3(-1, 0, 0));
    return {tools: [db(p, V3(0, 0, 1))]};
  }});
  M.rowChest = o => ({seg: 1100, view: [70, 12], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .5, -.6), V3(0, 1.05, .2), .32, .08); k.post(g, V3(0, 0, -.15), V3(0, .75, -.15), .035); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 52); k.torso(V3(0, .72, -.45), up, fwd, .6);
    feet(k, .16, 10, -.78); neutral(k);
    const sh = shoulders(k), tools = [];
    sides.forEach(([s, sg]) => { const hang = V3(sg * .2, sh.y - .6, sh.z + .04), top = k.onBone('spine2', [sg * .2, 1.14, .1]); const p = hang.lerp(top, u);
      k.arm(s, p, V3(sg * .3, .8, -.6), V3(-sg, 0, 0)); tools.push(o.bb ? null : db(p, V3(0, 0, 1))); });
    return {tools: tools.filter(Boolean).concat(o.bb ? [bar(V3(0, L(sh.y - .6, sh.y - .25, u), sh.z + .04))] : [])};
  }});
  M.rowSeat = o => ({seg: 1200, view: [70, 8], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .36, .25), V3(0, .36, -.25), .34, .08); k.post(g, V3(0, 0, 0), V3(0, .32, 0), .035); g.add(k.box(.45, .3, .06, k.steel(), V3(0, .2, .75)));
    if (o.pad) k.pad(g, V3(0, .78, .38), V3(0, 1.15, .38), .3, .1); stack(k, g, 1.05); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .36, -.05, L(18, -6, u), .68, .16); k.headTo(f.up.clone());
    const sh = shoulders(k), far = V3(0, sh.y - .12, sh.z + .6), near = k.onBone('spine1', P.belly).add(V3(0, .02, .06)), c = far.lerp(near, u);
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * (o.pad ? .2 : .05), c.y, c.z), V3(sg * .3, -.4, -1), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c, b: V3(0, .3, 1.0), kind: 'd'}]};
  }});
  M.invRow = o => ({seg: 1100, view: [70, 10], build(k, g) { const V3 = k.V3; sides.forEach(([s, sg]) => k.post(g, V3(sg * .65, 0, .1), V3(sg * .65, 1.0, .1), .03)); g.add(k.seg(V3(-.67, .95, .1), V3(.67, .95, .1), .016, k.steel())); }, pose(k, u) {
    const V3 = k.V3, BY = .95, ank = V3(0, .08, -1.05), sy = L(.36, .82, u);
    const ph = Math.asin((sy - ank.y) / 1.285), dir = V3(0, Math.sin(ph), Math.cos(ph)), fwd = V3(0, Math.cos(ph), -Math.sin(ph));
    k.torso(ank.clone().addScaledVector(dir, .765), dir, fwd, .9);
    sides.forEach(([s, sg]) => k.legDir(s, dir.clone().negate(), dir.clone().negate(), V3(0, .7, -.7).normalize()));
    k.headTo(dir.clone());
    const sh = shoulders(k); sides.forEach(([s, sg]) => k.arm(s, V3(sg * .27, BY, .1), V3(sg * .5, -1, -.5), V3(0, 0, -1)));
    return {tools: []};
  }});
  M.shrug = o => ({seg: 1000, view: [30, 6], pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    shrug(k, L(0, 14, u));
    const tools = [], ps = [];
    sides.forEach(([s, sg]) => { k.armDir(s, V3(sg * .1, -1, .02).normalize(), V3(sg * .05, -1, .03).normalize(), o.db ? V3(-sg, 0, 0) : V3(0, 0, -1), 1); ps.push(fist(k, s)); });
    if (o.db) ps.forEach(p => tools.push(db(p, V3(0, 0, 1)))); else tools.push(o.trap ? bar(mid(ps[0], ps[1])) : bar(mid(ps[0], ps[1])));
    return {tools};
  }});
  M.backExt = o => ({seg: 1300, view: [80, 8], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .9, .12), V3(0, .72, -.08), .36, .1); k.post(g, V3(0, 0, -.2), V3(0, .85, -.2), .04); g.add(k.box(.35, .04, .3, k.steel(), V3(0, .22, -.75))); }, pose(k, u) {
    const V3 = k.V3, legDir = V3(0, -.7, -.71).normalize();
    const {up, fwd} = lean(k, L(150, 45, u)); k.torso(V3(0, .92, -.05), up, fwd, .3);
    sides.forEach(([s, sg]) => k.legDir(s, legDir.clone().add(V3(sg * .05, 0, 0)).normalize(), legDir, V3(0, -.6, .8).normalize()));
    k.headTo(up.clone()); crossArms(k);
    return {tools: o.plate ? [{t: 'plate', p: k.onBone('spine3', P.sternum).addScaledVector(fwd, .06), n: fwd, r: .16}] : []};
  }});
  M.revHyper = o => ({seg: 1200, view: [80, 10], build(k, g) { flatBench(k, g, .5, -.35, 1.0); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 90); k.torso(V3(0, 1.12, -.25), up, fwd, .95);
    const a = L(0, 85, u) * k.RAD, ld = V3(0, -Math.cos(a), -Math.sin(a));
    sides.forEach(([s, sg]) => k.legDir(s, ld.clone().add(V3(sg * .04, 0, 0)).normalize(), ld, V3(0, -Math.sin(a), Math.cos(a)).negate()));
    k.headTo(up.clone());
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * .22, 1.04, .45), V3(sg * .4, -.5, -.6), V3(0, -1, 0)));
    return {tools: []};
  }});

  // ---------- spalle (altri) ----------
  M.facePull = o => ({seg: 1200, view: [50, 8], build(k, g) { stack(k, g, 1.0); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -4); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .15, 10, 0, -.05); neutral(k);
    const sh = shoulders(k), far = V3(0, sh.y + .12, sh.z + .55), near = k.onBone('head', P.forehead).add(V3(0, 0, .1)), c = far.lerp(near, u);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * L(.06, .2, u), 0, 0)), V3(sg, .7, -.2), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c, b: V3(0, sh.y + .15, 1.0), kind: 'rope'}]};
  }});
  M.uprightRow = o => ({seg: 1100, view: [30, 6], pose(k, u) {
    const V3 = k.V3, f = lean(k, 2); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    const sh = shoulders(k), c = V3(0, L(sh.y - .58, sh.y - .06, u), sh.z + .12);
    const w = o.db ? .14 : .14, tools = [];
    sides.forEach(([s, sg]) => { const p = V3(sg * w, c.y, c.z); k.arm(s, p, V3(sg, .5, -.2), V3(0, 0, -1)); if (o.db) tools.push(db(p, V3(1, 0, 0))); });
    if (!o.db) tools.push(o.cable ? {t: 'cable', a: c, b: V3(0, .12, .45), kind: 'bar'} : bar(c));
    return {tools};
  }});
  M.pike = o => ({seg: 1200, view: [75, 12], pose(k, u) {
    const V3 = k.V3, hip = V3(0, L(1.05, .95, u), -.15), {up, fwd} = lean(k, 135);
    k.torso(hip, up.clone().negate().negate(), fwd, .8);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .14, .09, -.75), V3(0, 1, -.2), 0)); sides.forEach(([s]) => tiptoe(k, s, 35));
    k.headTo(up.clone());
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .25, .05, .5), V3(sg * .6, .4, .4), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: []};
  }});
  M.hspu = o => ({seg: 1300, view: [70, 8], build(k, g) { const V3 = k.V3; g.add(k.box(1.2, 2.3, .06, k.mat(0xd5d8de, .9), V3(0, 1.15, -.36))); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 180); k.torso(V3(0, 1.4, -.25), up, V3(0, 0, 1), .7);
    const sh = shoulders(k); k.shift(V3(0, L(.62, .3, u) - sh.y, -.12 - sh.z));
    sides.forEach(([s, sg]) => k.legDir(s, V3(sg * .03, 1, -.12).normalize(), V3(0, 1, -.05).normalize(), V3(0, .5, .85).normalize()));
    k.headTo(V3(0, -1, 0));
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .27, .05, .02), V3(sg * .7, .2, .5), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: []};
  }});
  M.landminePress = o => ({seg: 1200, view: [55, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 12); k.torso(V3(0, .82, -.05), f.up, f.fwd, .5); feet(k, .15, 10, .15, -.3); neutral(k);
    const sh = shoulders(k), start = sh.clone().add(V3(0, -.06, .14)), end = sh.clone().add(V3(0, .42, .46)), c = start.lerp(end, u);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .03, 0, 0)), V3(sg * .5, -.7, .3), V3(0, 0, 1)));
    const anchor = V3(0, .04, -1.0).addScaledVector(c.clone().sub(V3(0, .04, -1.0)).normalize(), 0);
    return {tools: [{t: 'line', a: V3(0, .04, -1.15), b: c.clone().add(V3(0, .03, .06)), r: .016}, {t: 'plate', p: c.clone().add(V3(0, .05, .12)), n: c.clone().sub(V3(0, .04, -1.15)).normalize(), r: .18}]};
  }});

  // ---------- petto (altri) ----------
  M.pushFwd = o => ({seg: 1200, view: [55, 10], build(k, g) { if (!o.stand) { seat(k, g, .46, -.05, .8); stack(k, g, -.6, .55); } }, pose(k, u) {
    const V3 = k.V3; let f;
    if (o.stand) { f = lean(k, 4); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); } else f = sit(k, .46, -.05, -6, .42);
    neutral(k);
    const sh = shoulders(k), c = sh.clone().add(V3(0, -.12, .16)).lerp(sh.clone().add(V3(0, -.08, .6)), u), tools = [];
    sides.forEach(([s, sg]) => { const p = c.clone().add(V3(sg * (o.stand ? .03 : L(.24, .14, u)), 0, 0)); k.arm(s, p, V3(sg, -.5, -.5), o.stand ? V3(-sg, 0, 0) : V3(0, 0, 1)); if (!o.stand) tools.push({t: 'line', a: p.clone().add(V3(0, .05, 0)), b: p.clone().add(V3(0, -.05, 0)), r: .018}); });
    if (o.stand) tools.push({t: 'plate', p: c, n: V3(1, 0, 0), r: .14});
    return {tools};
  }});
  M.fly = o => ({seg: 1300, view: [38, 22], build(k, g) { flatBench(k, g); }, pose(k, u) {
    const V3 = k.V3, f = lie(k), a = L(5, 80, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * Math.sin(a), Math.cos(a), 0).addScaledVector(f.up, -.12).normalize(), fa = ua.clone().add(V3(-sg * .25, 0, 0)).normalize();
      k.armDir(s, ua, fa, V3(-sg, 0, 0).applyAxisAngle(f.up, 0), 1); tools.push(o.cable ? {t: 'cable', a: fist(k, s), b: V3(sg * .9, .1, -.1), kind: 'd'} : db(fist(k, s), f.up.clone())); });
    return {tools};
  }});
  M.cross = o => ({seg: 1200, view: [25, 10], build(k, g) { sides.forEach(([s, sg]) => k.post(k && g, k.V3(sg * 1.0, 0, -.25), k.V3(sg * 1.0, 2.2, -.25), .035)); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, 16); k.torso(V3(0, .83, 0), f.up, f.fwd, .5); feet(k, .15, 10, .25, -.15); neutral(k);
    const a = L(70, 5, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * Math.sin(a), -.35, Math.cos(a) * .9).normalize(), fa = ua.clone().add(V3(-sg * .3, 0, .1)).normalize();
      k.armDir(s, ua, fa, V3(-sg, 0, 0), 1); tools.push({t: 'cable', a: fist(k, s), b: V3(sg * 1.0, 2.1, -.25), kind: 'd'}); });
    return {tools};
  }});
  M.pecDeck = o => ({seg: 1200, view: [30, 14], build(k, g) { seat(k, g, .46, -.05, .85); stack(k, g, -.55, 0); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .46, -.05, -4, .42); k.headTo(f.up.clone());
    const a = L(80, 8, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * Math.sin(a), 0, Math.cos(a)).normalize(), fa = ua.clone().add(V3(-sg * .15, 0, .1)).normalize();
      k.armDir(s, ua, fa, V3(-sg, 0, 0), 1); const p = fist(k, s); tools.push({t: 'line', a: p.clone().add(V3(0, .07, 0)), b: p.clone().add(V3(0, -.07, 0)), r: .02}); });
    return {tools};
  }});
  M.pullover = o => ({seg: 1400, view: [70, 18], build(k, g) { flatBench(k, g); }, pose(k, u) {
    const V3 = k.V3, f = lie(k), a = L(0, 105, u) * k.RAD;
    const ua = V3(0, Math.cos(a), -Math.sin(a)).normalize(), ps = [];
    sides.forEach(([s, sg]) => { const u2 = ua.clone().add(V3(sg * .08, 0, 0)).normalize(); k.armDir(s, u2, bend(k, s, u2, 20), f.up.clone().negate(), 1); ps.push(fist(k, s)); });
    return {tools: [db(mid(ps[0], ps[1]).addScaledVector(ua, .05), ua.clone())]};
  }});

  // ---------- gambe (macchine, glutei, polpacci) ----------
  M.sissy = o => ({seg: 1300, view: [80, 6], pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, L(0, -24, u)); k.torso(V3(0, L(.845, .55, u), L(0, .12, u)), up, fwd, .8);
    sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, L(k.ay, .16, u), 0), V3(0, 0, 1), sg * 6); tiptoe(k, s, L(0, 45, u)); });
    k.headTo(up.clone());
    sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, 0, 1), V3(sg * .05, 0, 1), V3(0, -1, 0), 0));
    return {tools: []};
  }});
  M.legPress = o => {
    const dir = (deg => [0, Math.sin(deg), Math.cos(deg)])(45 * Math.PI / 180);
    return {seg: 1400, view: [70, 14], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .32, .05), V3(0, .32, -.32), .38, .08); k.pad(g, V3(0, .38, -.32), V3(0, .95, -.68), .38, .08);
      k.post(g, V3(-.35, .2, .1), V3(-.35, 1.5, 1.2), .03); k.post(g, V3(.35, .2, .1), V3(.35, 1.5, 1.2), .03); k.post(g, V3(0, 0, -.2), V3(0, .3, -.2), .05); }, pose(k, u) {
      const V3 = k.V3, f = lean(k, -42); k.torso(V3(0, .45, -.25), f.up, f.fwd, .6); k.headTo(f.up.clone());
      const d = V3(...dir), plat = V3(0, .55, .38).addScaledVector(d, L(0, .42, u)), tools = [];
      sides.forEach(([s, sg]) => { k.leg(s, plat.clone().add(V3(sg * .17, 0, 0)).addScaledVector(d, -.05), V3(sg * .35, .5, .2), sg * 12); k.aim('foot.' + s, d.clone().applyAxisAngle(V3(1, 0, 0), -Math.PI / 2 + .25)); });
      sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .2, -.9, .2).normalize(), V3(sg * .1, -.5, .8).normalize(), V3(-sg, 0, 0), .8));
      if (o.calf) sides.forEach(([s]) => tiptoe(k, s, L(-10, 35, u)));
      tools.push({t: 'box', p: plat.clone().addScaledVector(d, .06).add(V3(0, .05, 0)), s: [.62, .55, .04], c: 0x5a5f68, q: new (k.T.Quaternion)().setFromUnitVectors(V3(0, 0, 1), d)});
      return {tools};
    }};
  };
  M.legExt = o => ({seg: 1200, view: [75, 10], build(k, g) { seat(k, g, .5, -.08, .8); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -8); k.torso(V3(0, .6, -.08), f.up, f.fwd, .4); k.headTo(f.up.clone());
    const a = L(8, 85, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const th = V3(sg * .03, -.1, 1).normalize(), sh = V3(0, -Math.cos(a), Math.sin(a)); k.legDir(s, th, sh, V3(0, Math.sin(a) * .5, Math.cos(a)).add(V3(0, .3, .6)).normalize());
      k.arm(s, V3(sg * .3, .52, -.05), V3(sg, 0, 0), V3(-sg, 0, 0)); });
    const an = k.wp('foot.l').lerp(k.wp('foot.r'), .5).add(V3(0, .02, .08));
    tools.push({t: 'line', a: an.clone().add(V3(-.2, 0, 0)), b: an.clone().add(V3(.2, 0, 0)), r: .04, c: 0x2a2d33});
    return {tools};
  }});
  M.hipAb = o => ({seg: 1200, view: [10, 16], build(k, g) { seat(k, g, .5, -.05, .8); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -6); k.torso(V3(0, .6, -.05), f.up, f.fwd, .4); k.headTo(f.up.clone());
    const a = (o.adduct ? L(32, 4, u) : L(4, 32, u)) * k.RAD;
    sides.forEach(([s, sg]) => { const th = V3(sg * Math.sin(a), -.08, Math.cos(a)).normalize(); k.legDir(s, th, V3(sg * Math.sin(a) * .6, -1, .1).normalize());
      k.arm(s, V3(sg * .34, .55, -.08), V3(sg, 0, 0), V3(-sg, 0, 0)); });
    const tools = sides.map(([s, sg]) => ({t: 'line', a: k.wp('shin.' + s).add(V3(sg * .07, .04, -.08)), b: k.wp('shin.' + s).add(V3(sg * .07, .04, .12)), r: .035, c: 0x2a2d33}));
    return {tools};
  }});
  M.wallSit = o => ({seg: 2000, view: [70, 8], build(k, g) { const V3 = k.V3; g.add(k.box(1.4, 2.2, .06, k.mat(0xd5d8de, .9), V3(0, 1.1, -.26))); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .45 + Math.sin(u * Math.PI) * .005, -.08), f.up, f.fwd, .5);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .16, k.ay, .36), V3(sg * .1, .5, 1), sg * 10)); k.headTo(f.up.clone());
    sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, -.25, 1).normalize(), V3(sg * .05, -.15, 1).normalize(), V3(0, -1, 0), 0));
    return {tools: []};
  }});
  M.legCurl = o => ({seg: 1200, view: [80, 12], build(k, g) { flatBench(k, g, .55, -.9, .6); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, -90).up ? lean(k, 90) : lean(k, 90);
    k.torso(V3(0, .7, .05), V3(0, 0, -1), V3(0, -1, 0), .95);
    const a = L(5, 115, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { k.legDir(s, V3(sg * .03, 0, 1).normalize(), V3(0, Math.sin(a), Math.cos(a)).normalize(), V3(0, 1, 0)); k.arm(s, V3(sg * .2, .6, -.75), V3(sg, .2, 0), V3(0, -1, 0)); });
    k.headTo(V3(0, .2, -1).normalize());
    const an = k.wp('foot.l').lerp(k.wp('foot.r'), .5).add(V3(0, .05, -.04));
    tools.push({t: 'line', a: an.clone().add(V3(-.2, 0, 0)), b: an.clone().add(V3(.2, 0, 0)), r: .04, c: 0x2a2d33});
    return {tools};
  }});
  M.nordic = o => ({seg: 1600, view: [80, 8], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .05, -.35), V3(0, .05, .1), .4, .06); g.add(k.seg(V3(-.2, .22, -.55), V3(.2, .22, -.55), .04, k.mat(0x2a2d33, .8))); }, pose(k, u) {
    const V3 = k.V3, a = L(0, 62, u), r = a * k.RAD, kn = V3(0, .1, 0), body = V3(0, Math.cos(r), Math.sin(r));
    k.torso(kn.clone().addScaledVector(body, .45), body, V3(0, -Math.sin(r), Math.cos(r)), .9);
    sides.forEach(([s, sg]) => k.legDir(s, body.clone().negate(), V3(0, -.05, -1).normalize(), V3(0, .4, -1).normalize()));
    k.headTo(body.clone());
    sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .15, -.4, .9).normalize(), V3(sg * .1, -.2, 1).normalize(), V3(0, -1, 0), 0));
    return {tools: []};
  }});
  M.floorCurl = o => ({seg: 1300, view: [75, 14], pose(k, u) {
    const V3 = k.V3, f = lean(k, -90); k.torso(V3(0, .2, .05), V3(0, .15, -1).normalize(), V3(0, 1, .15).normalize(), .95);
    const fz = L(1.0, .55, u);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .12, .05, fz), V3(0, 1, 0), 0)); k.headTo(V3(0, 0, -1));
    sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .2, -.3, .8).normalize(), V3(sg * .2, -.3, .8).normalize(), V3(0, -1, 0), 0));
    return {tools: []};
  }});
  // hip thrust e ponte: spalle sulla panca (o a terra), piedi piatti, anche fino alla linea spalle-ginocchia, ginocchia a 90° in alto
  M.thrust = o => ({seg: 1300, view: [70, 12], build(k, g) { if (!o.floor) { const V3 = k.V3; k.pad(g, V3(0, .42, -.12), V3(0, .42, -.6), .9, .1); k.post(g, V3(0, 0, -.35), V3(0, .38, -.35), .05); } }, pose(k, u) {
    const V3 = k.V3, shY = o.floor ? .1 : .5, hipY = L(o.floor ? .12 : .3, shY + (o.floor ? .3 : .02), u);
    const shp = V3(0, shY, -.25), hip = V3(0, hipY, .25), up = shp.clone().sub(hip).normalize(), fwd = V3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
    k.torso(hip, up, fwd, .95);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .18, k.ay, .62), V3(sg * .2, 1, .2), sg * 12));
    k.headTo(up.clone().addScaledVector(fwd, .6).normalize());
    const c = k.onBone('root', P.hipFront).add(V3(0, .1, 0)), tools = [];
    if (o.db) tools.push(db(c, V3(1, 0, 0))); else if (!o.bw) tools.push(bar(c));
    if (o.bw) sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .3, .05, k.wp('root').z - .1), V3(sg, .3, .2), V3(0, -1, 0)); k.grip(s, -.1); });
    else sides.forEach(([s, sg]) => k.arm(s, V3(sg * .3, c.y + .02, c.z), V3(sg, .3, -.5), V3(0, -1, 0)));
    return {tools: o.bw ? [] : tools};
  }});
  M.pullThrough = o => ({seg: 1300, view: [75, 8], build(k, g) { stack(k, g, -1.1); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, L(70, 0, u)); k.torso(V3(0, L(.78, .845, u), L(-.15, 0, u)), up, fwd, .6); feet(k, .26, 20); neutral(k);
    const c = k.wp('thigh.l').lerp(k.wp('thigh.r'), .5).add(V3(0, -.22, -.1).lerp(V3(0, -.12, .12), u));
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .04, 0, 0)), V3(sg * .3, .2, 1), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c, b: V3(0, .15, -1.05), kind: 'rope'}]};
  }});
  // a quattro zampe: mani sotto le spalle, ginocchia sotto le anche; la gamba di lavoro spinge indietro e in alto, ginocchio a 90°
  M.kickBack = o => ({seg: 1200, view: [-70, 12], pose(k, u) {
    const V3 = k.V3; k.torso(V3(0, .52, -.12), V3(0, -.02, 1).normalize(), V3(0, -1, 0), .95);
    k.leg('r', V3(-.12, .1, -.55), V3(0, -1, .2), 0); k.aim('foot.r', V3(0, -.2, -1).normalize());
    const a = L(-80, 10, u) * k.RAD; k.legDir('l', V3(.05, Math.sin(a), -Math.cos(a)).normalize(), V3(0, 1, -.15).normalize(), V3(0, .3, -1).normalize());
    k.headTo(V3(0, -.1, 1).normalize());
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .2, .04, .42), V3(sg * .2, .3, -.6), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: o.cable ? [{t: 'cable', a: k.wp('foot.l'), b: V3(.1, .15, -1.1), kind: 'd'}] : []};
  }});
  // polpacci: talloni sotto il livello del gradino → in punta di piedi, ginocchia ferme
  M.calf = o => ({seg: 1100, view: [70, 8], build(k, g) { const V3 = k.V3; g.add(k.box(.6, .08, .25, k.mat(0x3a3d44, .8), V3(0, .04, .1))); if (o.seat) { seat(k, g, .45, -.3); } if (o.donkey) { k.pad(g, V3(0, 1.0, .5), V3(0, 1.0, .9), .5, .08); k.post(g, V3(0, 0, .7), V3(0, .96, .7), .04); } }, pose(k, u) {
    const V3 = k.V3, rise = L(-.025, .08, u), pitch = L(-15, 38, u), tools = [];
    if (o.seat) { const f = sit(k, .45, -.3, -2, .1, .14); sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .14, k.ay + .08 + rise, .1), V3(0, .3, 1), 0); tiptoe(k, s, pitch); }); k.headTo(f.up.clone());
      const kn = k.wp('shin.l').lerp(k.wp('shin.r'), .5).add(V3(0, .06, 0)); tools.push({t: 'line', a: kn.clone().add(V3(-.25, 0, 0)), b: kn.clone().add(V3(.25, 0, 0)), r: .04, c: 0x2a2d33});
      sides.forEach(([s, sg]) => k.arm(s, kn.clone().add(V3(sg * .26, .02, 0)), V3(sg, 0, -.3), V3(0, -1, 0))); return {tools}; }
    const lu = o.donkey ? 85 : 0, f = lean(k, lu); k.torso(V3(0, .845 + rise + .08, o.donkey ? -.1 : .08), f.up, f.fwd, o.donkey ? .6 : .5);
    sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, k.ay + .08 + rise, .1), V3(0, 0, 1), sg * 5); tiptoe(k, s, pitch); });
    neutral(k);
    if (o.donkey) sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .22, 1.04, .62), V3(sg, .2, -.3), V3(0, -1, 0)); });
    else { sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, -1, .02).normalize(), V3(sg * .05, -1, .03).normalize(), V3(-sg, 0, 0), o.db ? 1 : .3)); if (o.db) sides.forEach(([s]) => tools.push(db(fist(k, s), V3(0, 0, 1)))); }
    return {tools};
  }});
  M.tibialis = o => ({seg: 1000, view: [80, 8], build(k, g) { const V3 = k.V3; g.add(k.box(1.2, 2.2, .06, k.mat(0xd5d8de, .9), V3(0, 1.1, -.34))); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -12); k.torso(V3(0, .82, -.12), f.up, f.fwd, .5);
    sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, k.ay, .25), V3(0, 0, 1), sg * 5); tiptoe(k, s, L(0, -28, u)); });
    neutral(k); sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, -1, -.05).normalize(), V3(sg * .05, -1, 0).normalize(), V3(-sg, 0, 0), .3));
    return {tools: []};
  }});

  // ---------- aiuti per terra, ginocchio, fasi ----------
  const ease = t => t * t * (3 - 2 * t);
  // u in [0,1) diviso in n fasi uguali: [indice, t locale addolcito]
  const phase = (u, n) => { const x = Math.min(n - 1e-6, u * n), i = Math.floor(x); return [i, ease(x - i)]; };
  const Q = (k, axis, deg) => new (k.T.Quaternion)().setFromAxisAngle(axis, deg * k.RAD);
  // supino a terra: bacino a 10 cm, testa verso -z
  function floorBack(k, z = .1, knees = true, fz = .42) {
    const V3 = k.V3; k.torso(V3(0, .115, z), V3(0, .02, -1).normalize(), V3(0, 1, .02).normalize(), 1);
    if (knees) sides.forEach(([s, sg]) => k.leg(s, V3(sg * .14, k.ay, k.wp('root').z + fz), V3(sg * .15, 1, 0), sg * 5));
  }
  const curlUp = (k, deg) => { const ax = k.V3(1, 0, 0); k.worldDelta('spine2', Q(k, ax, deg * .55)); k.worldDelta('spine3', Q(k, ax, deg * .45)); };
  const handsOnHead = k => sides.forEach(([s, sg]) => { k.arm(s, k.onBone('head', [sg * .075, 1.6, -.03]), k.V3(sg, 0, 0).add(k.curDir('spine3').multiplyScalar(.3)), k.V3(-sg, 0, 0)); k.grip(s, .3); });
  const armsDown = (k, z) => sides.forEach(([s, sg]) => { k.arm(s, k.V3(sg * .3, .05, z), k.V3(sg, .4, 0), k.V3(0, -1, 0)); k.grip(s, -.1); });
  // plancia: dal punto d'appoggio dei piedi (ankZ) alle spalle all'altezza sy
  function plankLine(k, sy, ankZ = -.85, ay = .1) {
    const V3 = k.V3, ph = Math.asin(Math.max(-.9, Math.min(.9, (sy - ay) / 1.285))), dir = V3(0, Math.sin(ph), Math.cos(ph)), fwd = V3(0, -Math.cos(ph), Math.sin(ph));
    k.torso(V3(0, ay, ankZ).addScaledVector(dir, .765), dir, fwd, .95);
    sides.forEach(([s, sg]) => k.legDir(s, dir.clone().negate().add(V3(-sg * .015, 0, 0)).normalize(), dir.clone().negate(), V3(0, -.8, -.6).normalize()));
    return {dir, fwd};
  }
  // passo per camminare/spingere: fase c in [0,1)
  function walk(k, c, stride = .32, lift = .07, base = .14) {
    const V3 = k.V3;
    sides.forEach(([s, sg], i) => { const a = (c + i * .5) % 1, sw = a < .5, t = sw ? a * 2 : (a - .5) * 2;
      const z = sw ? L(-stride / 2, stride / 2, ease(t)) : L(stride / 2, -stride / 2, t), y = k.ay + (sw ? Math.sin(t * Math.PI) * lift : 0);
      k.leg(s, V3(sg * base, y, z), V3(sg * .1, 0, 1), sg * 8); });
  }

  // ---------- core ----------
  M.plank = o => ({seg: 1600, view: o.side ? [75, 14] : [62, 14], build(k, g) { if (o.bench) { const V3 = k.V3; k.pad(g, V3(0, .42, -1.05), V3(0, .42, -.7), .45, .08); k.post(g, V3(0, 0, -.88), V3(0, .38, -.88), .03); } }, pose(k, u) {
    const V3 = k.V3, br = Math.sin(u * Math.PI) * .006;
    if (o.side) {         // sul fianco destro: avambraccio a terra sotto la spalla, corpo in linea, petto verso +x
      const ay = o.bench ? .45 : .1, sy = .42 + br, ph = Math.asin((sy - ay) / 1.3), up = V3(0, Math.sin(ph), Math.cos(ph)), f = V3(1, 0, 0);
      k.torso(V3(-.05, ay, o.bench ? -.9 : -.85).addScaledVector(up, .78), up, f, .95);
      sides.forEach(([s, sg]) => k.legDir(s, up.clone().negate(), up.clone().negate(), V3(.6, -.2, -.6).normalize()));
      k.headTo(up.clone());
      const sh = k.wp('uarm.r'); k.arm('r', V3(sh.x + .22, .05, sh.z + .2), V3(0, -1, -.2), V3(0, -1, 0)); k.grip('r', .2);
      k.armDir('l', V3(0, 1, 0), V3(0, 1, 0), V3(1, 0, 0), .1);
      return {tools: []};
    }
    plankLine(k, .33 + br); k.headTo(V3(0, .3, 1).normalize());
    const sh = shoulders(k); sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .1, .05, sh.z + .28), V3(sg * .2, -1, -.3), V3(-sg * .5, -1, 0).normalize()); k.grip(s, .4); });
    return {tools: []};
  }});
  M.crunch = o => ({seg: 1100, view: [70, 16], pose(k, u) {
    const V3 = k.V3; floorBack(k); curlUp(k, L(0, 32, u));
    k.headTo(k.curDir('spine3').clone()); handsOnHead(k);
    return {tools: []};
  }});
  M.situp = o => ({seg: 1300, view: [70, 12], pose(k, u) {
    const V3 = k.V3, a = L(-88, 0, u), {up, fwd} = lean(k, a); k.torso(V3(0, .1, .1), up, fwd, .5);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .14, k.ay, .52), V3(sg * .15, 1, 0), sg * 5));
    k.headTo(up.clone()); crossArmsOn(k);
    return {tools: o.plate ? [{t: 'plate', p: k.onBone('spine3', P.sternum).addScaledVector(fwd, .07), n: fwd, r: .15}] : []};
  }});
  const crossArmsOn = k => sides.forEach(([s, sg]) => { const p = k.onBone('spine3', [-sg * .1, 1.33, .15]); k.arm(s, p, k.V3(sg, -.5, .3), k.curDir('spine3').clone()); k.grip(s, .5); });
  M.cableCrunch = o => ({seg: 1200, view: [70, 8], build(k, g) { stack(k, g, .75); }, pose(k, u) {
    const V3 = k.V3, kn = V3(0, .09, 0);
    k.torso(V3(0, .55, -.08), V3(0, 1, 0), V3(0, 0, 1), .3);
    sides.forEach(([s, sg]) => k.legDir(s, V3(sg * .1, -1, .15).normalize(), V3(0, -.05, -1).normalize(), V3(0, -.3, -1).normalize()));
    curlUp(k, -L(5, 70, u)); k.worldDelta('spine1', Q(k, V3(1, 0, 0), L(5, 25, u)));
    k.headTo(k.curDir('spine3').clone());
    const c = k.onBone('head', [0, 1.62, .1]); sides.forEach(([s, sg]) => { k.arm(s, c.clone().add(V3(sg * .07, -.04, .03)), V3(sg, -.5, .3), V3(-sg, 0, 0)); });
    return {tools: [{t: 'cable', a: c, b: V3(0, 2.2, .75), kind: 'rope'}]};
  }});
  M.reverseCrunch = o => ({seg: 1200, view: [70, 14], pose(k, u) {
    const V3 = k.V3; floorBack(k, .1, false); k.worldDelta('root', Q(k, V3(1, 0, 0), -L(0, 16, u))); k.shift(V3(0, L(0, .05, u), 0));
    const a = L(88, 122, u) * k.RAD; sides.forEach(([s, sg]) => k.legDir(s, V3(sg * .05, Math.sin(a), Math.cos(a)).normalize(), V3(0, -.2, 1).normalize().applyAxisAngle(V3(1, 0, 0), -(a - Math.PI / 2))));
    k.headTo(V3(0, .1, -1).normalize()); armsDown(k, -.05);
    return {tools: []};
  }});
  M.bicycle = o => ({seg: 1400, cyc: true, view: [60, 16], pose(k, u) {
    const V3 = k.V3, c = Math.sin(u * 2 * Math.PI); floorBack(k, .1, false); curlUp(k, 30);
    k.worldDelta('spine3', Q(k, k.curDir('spine3'), c * 28));
    sides.forEach(([s, sg], i) => { const t = (i ? -c : c) * .5 + .5, a = L(30, 110, t) * k.RAD;
      k.legDir(s, V3(sg * .05, Math.sin(a), Math.cos(a)).normalize(), V3(0, Math.sin(a) - .9, Math.cos(a) + .4).normalize()); });
    k.headTo(k.curDir('spine3').clone()); handsOnHead(k);
    return {tools: []};
  }});
  M.legRaise = o => ({seg: 1300, view: [70, 14], pose(k, u) {
    const V3 = k.V3; floorBack(k, .1, false);
    const a = L(8, 88, u) * k.RAD, d = V3(0, Math.sin(a), Math.cos(a));
    sides.forEach(([s, sg]) => k.legDir(s, d.clone().add(V3(sg * .02, 0, 0)).normalize(), d, V3(0, Math.cos(a), -Math.sin(a)).negate().normalize()));
    k.headTo(V3(0, .05, -1).normalize()); armsDown(k, .05);
    return {tools: []};
  }});
  M.hangRaise = o => {
    const BY = 2.25;
    return {seg: 1400, view: [70, 8], build(k, g) { const V3 = k.V3; sides.forEach(([s, sg]) => k.post(g, V3(sg * .7, 0, 0), V3(sg * .7, BY + .08, 0), .03)); g.add(k.seg(V3(-.72, BY, 0), V3(.72, BY, 0), .016, k.steel())); }, pose(k, u) {
      const V3 = k.V3, f = lean(k, L(0, -10, u)); k.torso(V3(0, 1.3, 0), f.up, f.fwd, .5);
      const sh = shoulders(k); k.shift(V3(0, BY - .6 - sh.y, -.03 - sh.z));
      const a = L(5, o.knees ? 95 : 88, u) * k.RAD, th = V3(0, -Math.cos(a), Math.sin(a));
      sides.forEach(([s, sg]) => k.legDir(s, th.clone().add(V3(sg * .03, 0, 0)).normalize(), o.knees ? V3(0, -1, -.1).normalize() : th, V3(0, -.6, .8).normalize()));
      k.headTo(f.up.clone()); sides.forEach(([s, sg]) => k.arm(s, V3(sg * .3, BY, 0), V3(sg, -.6, -.2), V3(0, 0, 1)));
      return {tools: []};
    }};
  };
  M.abWheel = o => ({seg: 1600, view: [70, 12], pose(k, u) {
    const V3 = k.V3, kn = V3(0, .09, -.1), ta = L(25, 75, u) * k.RAD, td = V3(0, Math.cos(ta), Math.sin(ta));
    const hip = kn.clone().addScaledVector(td, LEN(k).th), {up, fwd} = lean(k, L(62, 95, u));
    k.torso(hip, up, fwd, .5);
    sides.forEach(([s, sg]) => k.legDir(s, td.clone().negate().add(V3(sg * .03, 0, 0)).normalize(), V3(0, -.05, -1).normalize(), V3(0, -.4, -1).normalize()));
    k.headTo(up.clone().addScaledVector(fwd, .2).normalize());
    const sh = shoulders(k), wz = L(sh.z + .1, sh.z + .7, u), w = V3(0, .1, wz);
    sides.forEach(([s, sg]) => k.arm(s, w.clone().add(V3(sg * .1, .02, 0)), V3(sg * .2, -.3, -1), V3(0, -.3, -1).normalize()));
    return {tools: [{t: 'plate', p: w, n: V3(1, 0, 0), r: .1}, {t: 'line', a: w.clone().add(V3(-.13, 0, 0)), b: w.clone().add(V3(.13, 0, 0)), r: .012}]};
  }});
  const LEN = k => k.LEN;
  M.pallof = o => ({seg: 1300, view: [20, 8], build(k, g) { stack(k, g, 0, 1.2); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, 2); k.torso(V3(0, .82, 0), f.up, f.fwd, .5); feet(k, .2, 15); neutral(k);
    const sh = shoulders(k), c = sh.clone().add(V3(0, -.18, .14)).lerp(sh.clone().add(V3(0, -.12, .58)), u);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .025, 0, 0)), V3(sg * .4, -1, -.2), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c, b: V3(1.2, c.y, 0), kind: 'd'}]};
  }});
  M.twist = o => ({seg: 1600, cyc: true, view: [10, 16], pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, -40); k.torso(V3(0, .12, -.05), up, fwd, .8);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .12, .18, .55), V3(sg * .2, 1, 0), sg * 5));
    const r = Math.sin(u * 2 * Math.PI) * 38; k.worldDelta('spine2', Q(k, k.curDir('spine2'), r * .6)); k.worldDelta('spine3', Q(k, k.curDir('spine3'), r * .4));
    k.headTo(k.curDir('spine3').clone());
    const sh = shoulders(k), f2 = k.curDir('spine3').clone().cross(V3(1, 0, 0)).negate(), c = k.onBone('spine3', [0, 1.15, .42]);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .03, 0, 0)), V3(sg, -.8, 0), V3(-sg, 0, 0)));
    return {tools: [o.db ? db(c, V3(1, 0, 0)) : {t: 'plate', p: c, n: V3(1, 0, 0).applyAxisAngle(V3(0, 1, 0), r * k.RAD), r: .14}]};
  }});
  M.chop = o => ({seg: 1300, view: [25, 8], build(k, g) { stack(k, g, -.1, 1.1); }, pose(k, u) {
    const V3 = k.V3, hi = V3(.75, 1.75, .2), lo = V3(-.45, .5, .45), a = o.low ? lo : hi, b = o.low ? hi : lo, c = a.clone().lerp(b, u);
    const f = lean(k, L(o.low ? 25 : 0, o.low ? 0 : 25, u)); k.torso(V3(0, L(o.low ? .76 : .84, o.low ? .84 : .76, u), 0), f.up, f.fwd, .5);
    const rot = (c.x > 0 ? 1 : -1) * Math.min(40, Math.abs(c.x) * 55); k.worldDelta('spine2', Q(k, k.curDir('spine2'), rot * .5)); k.worldDelta('spine3', Q(k, k.curDir('spine3'), rot * .5));
    feet(k, .22, 15); neutral(k);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(0, sg * .03, 0)), V3(sg, -.5, -.3), V3(0, 0, 1)));
    return {tools: [{t: 'cable', a: c, b: o.low ? V3(1.1, .15, -.1) : V3(1.1, 2.1, -.1), kind: 'd'}]};
  }});
  M.landmineRot = o => ({seg: 1500, cyc: true, view: [15, 10], pose(k, u) {
    const V3 = k.V3, f = lean(k, 8); k.torso(V3(0, .8, 0), f.up, f.fwd, .5); feet(k, .22, 15); neutral(k);
    const a = Math.sin(u * 2 * Math.PI), sh = shoulders(k), c = V3(a * .45, sh.y + .12 - Math.abs(a) * .3, sh.z + .45);
    k.worldDelta('spine2', Q(k, k.curDir('spine2'), a * 22)); k.worldDelta('spine3', Q(k, k.curDir('spine3'), a * 18));
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .03, 0, 0)), V3(sg, -.6, 0), V3(-sg, 0, 0)));
    return {tools: [{t: 'line', a: V3(0, .04, 1.6), b: c, r: .016}, {t: 'plate', p: c.clone().add(V3(0, .06, -.1)), n: c.clone().sub(V3(0, .04, 1.6)).normalize(), r: .16}]};
  }});
  // dead bug: schiena a terra, braccia verso il soffitto, anche e ginocchia a 90° (tibie parallele al pavimento);
  // si allungano braccio e gamba opposti fin quasi a terra, si torna e si cambia lato
  M.deadBug = o => ({seg: 1500, cyc: true, view: [60, 22], pose(k, u) {
    const V3 = k.V3; floorBack(k, .1, false);
    const [i, t] = phase(u, 4), e = [t, 1 - t, 0, 0][i], e2 = [0, 0, t, 1 - t][i];     // e: braccio sx + gamba dx, e2: braccio dx + gamba sx
    const legOf = x => ({th: V3(0, 1, 0).lerp(V3(0, .22, 1).normalize(), x).normalize(), sh: V3(0, 0, 1).lerp(V3(0, .2, 1).normalize(), x).normalize()});
    const armOf = x => V3(0, 1, 0).lerp(V3(0, .15, -1).normalize(), x).normalize();
    [['l', 1, e2], ['r', -1, e]].forEach(([s, sg, x]) => { const L2 = legOf(x); k.legDir(s, L2.th.clone().add(V3(sg * .03, 0, 0)).normalize(), L2.sh, V3(0, .3, 1).normalize()); });
    [['l', 1, e], ['r', -1, e2]].forEach(([s, sg, x]) => { const d = armOf(x).add(V3(sg * .06, 0, 0)).normalize(); k.armDir(s, d, d, V3(-sg, 0, 0), .3); });
    k.headTo(V3(0, .1, -1).normalize());
    return {tools: []};
  }});
  M.hollow = o => ({seg: 1800, view: [70, 14], pose(k, u) {
    const V3 = k.V3, br = Math.sin(u * Math.PI) * 2; floorBack(k, .1, false); curlUp(k, 22 + br);
    sides.forEach(([s, sg]) => k.legDir(s, V3(sg * .02, .3, 1).normalize(), V3(0, .25, 1).normalize(), V3(0, .2, 1).normalize()));
    k.headTo(k.curDir('spine3').clone());
    sides.forEach(([s, sg]) => { const d = k.curDir('spine3').clone().add(V3(sg * .1, .05, 0)).normalize(); k.armDir(s, d, d, V3(-sg, 0, 0), .2); });
    return {tools: []};
  }});
  M.dragon = o => ({seg: 1700, view: [75, 12], build(k, g) { flatBench(k, g, .5, -.9, .44); }, pose(k, u) {
    const V3 = k.V3, a = L(80, 12, u) * k.RAD, sh = V3(0, .56, -.55), d = V3(0, Math.sin(a), Math.cos(a));
    k.torso(sh.clone().addScaledVector(d, .5), d.clone().negate(), V3(0, Math.cos(a), -Math.sin(a)), .95);
    sides.forEach(([s, sg]) => k.legDir(s, d, d, d.clone().applyAxisAngle(V3(1, 0, 0), .4)));
    k.headTo(V3(0, .05, -1).normalize());
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * .14, .5, -.82), V3(sg, .6, .2), V3(0, 0, 1)));
    return {tools: []};
  }});
  // scalatori: dalla plancia alta, un ginocchio verso il petto e poi l'altro; nel cambio le anche salgono un po' (piccolo salto)
  M.climber = o => ({seg: 900, cyc: true, view: [70, 14], pose(k, u) {
    const V3 = k.V3, ts = sides.map((x, i) => (Math.sin((u + i * .5) * 2 * Math.PI) + 1) / 2), bump = Math.max(...ts.map(t => Math.sin(t * Math.PI))) * .15;
    const {dir} = plankLine(k, .58); k.shift(V3(0, bump, 0)); k.headTo(dir.clone().add(V3(0, -.2, .2)).normalize());
    const sh = shoulders(k); sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .22, .05, sh.z + .04), V3(sg * .5, .5, -.6), V3(0, -1, 0)); k.grip(s, -.1); });
    const ext = dir.clone().negate(), te = Math.atan2(ext.y, ext.z), td = Math.atan2(-.5, .86);
    sides.forEach(([s, sg], i) => { const t = ts[i], hy = k.wp('thigh.' + s).y, lim = Math.max(-1, (.12 - hy) / k.LEN.th);
      let th = L(te, td, t); if (Math.sin(th) < lim) th = Math.cos(th) >= 0 ? Math.asin(lim) : Math.PI - Math.asin(lim) - 2 * Math.PI;   // il ginocchio resta sopra il pavimento
      const td2 = V3(sg * .04 * t, Math.sin(th), Math.cos(th)).normalize(), kn = k.wp('thigh.' + s).addScaledVector(td2, k.LEN.th);
      let sd = ext.clone().lerp(V3(0, -.35, -.94).normalize(), t).normalize();
      if (kn.y + sd.y * k.LEN.sh < .1) { const dy = (.1 - kn.y) / k.LEN.sh; sd = V3(0, dy, -Math.sqrt(Math.max(0, 1 - dy * dy))); }   // anche la caviglia resta sopra il pavimento
      k.legDir(s, td2, sd, V3(0, -.8, -.6).lerp(V3(0, -.15, -1), t).normalize()); });
    return {tools: []};
  }});

  // ---------- avambracci ----------
  M.wristCurl = o => ({seg: 1000, view: [65, 14], build(k, g) { seat(k, g, .46, 0); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .46, 0, 30, .42, .14); k.headTo(f.up.clone().lerp(V3(0, 1, 0), .3).normalize());
    const tools = [], ps = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * .05, -1, .55).normalize(), fa = V3(sg * .02, -.12, 1).normalize(), up = o.rev ? -1 : 1;
      const palm = o.twist ? V3(-sg * Math.cos(u * Math.PI), Math.sin(u * Math.PI) * up, 0).normalize() : V3(0, up, 0);
      k.armDir(s, ua, fa, palm, 1);
      if (!o.twist) k.worldDelta('hand.' + s, Q(k, V3(sg, 0, 0), up * L(-45, 45, u) * sg));
      ps.push(fist(k, s)); });
    if (o.db || o.twist) ps.forEach((p, i) => tools.push(db(p, k.curDir('hand.' + ['l', 'r'][i]).cross(V3(0, 1, 0)).normalize()))); else tools.push(bar(mid(ps[0], ps[1]), .7, .16));
    return {tools};
  }});
  M.wristRoller = o => ({seg: 1200, cyc: true, view: [40, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    const sh = shoulders(k), c = V3(0, sh.y - .02, sh.z + .5), w = Math.sin(u * 2 * Math.PI) * 35;
    sides.forEach(([s, sg]) => { k.arm(s, c.clone().add(V3(sg * .15, 0, 0)), V3(sg * .3, -1, 0), V3(0, -1, 0)); k.worldDelta('hand.' + s, Q(k, V3(1, 0, 0), (s === 'l' ? w : -w))); });
    const rope = L(.7, .35, u);
    return {tools: [{t: 'line', a: c.clone().add(V3(-.22, 0, 0)), b: c.clone().add(V3(.22, 0, 0)), r: .016}, {t: 'line', a: c, b: c.clone().add(V3(0, -rope, 0)), r: .003, c: 0x444444}, {t: 'plate', p: c.clone().add(V3(0, -rope - .1, 0)), n: V3(0, 0, 1), r: .1}]};
  }});
  M.pinch = o => ({seg: 2000, view: [30, 6], pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    const tools = [];
    sides.forEach(([s, sg]) => { k.armDir(s, V3(sg * .12, -1, .02).normalize(), V3(sg * .08, -1, .03).normalize(), V3(-sg, 0, 0), .55); tools.push({t: 'plate', p: fist(k, s).add(V3(sg * .0, -.08, 0)), n: V3(1, 0, 0), r: .12}); });
    return {tools};
  }});
  M.hang = o => {
    const BY = 2.25;
    return {seg: 2000, view: [30, 8], build(k, g) { const V3 = k.V3; sides.forEach(([s, sg]) => k.post(g, V3(sg * .7, 0, 0), V3(sg * .7, BY + .08, 0), .03)); g.add(k.seg(V3(-.72, BY, 0), V3(.72, BY, 0), .016, k.steel())); }, pose(k, u) {
      const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, 1.3, 0), f.up, f.fwd, .5);
      const sh = shoulders(k); k.shift(V3(0, BY - .6 - sh.y + Math.sin(u * Math.PI) * .01, -.03 - sh.z));
      sides.forEach(([s, sg]) => k.legDir(s, V3(0, -1, .05).normalize(), V3(0, -1, 0), V3(0, -.7, .7).normalize()));
      neutral(k); sides.forEach(([s, sg]) => k.arm(s, V3(sg * .3, BY, 0), V3(sg, -.6, -.2), V3(0, 0, 1)));
      return {tools: []};
    }};
  };
  M.gripper = o => ({seg: 900, view: [30, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    k.armDir('l', V3(.08, -1, .1).normalize(), V3(.02, -.1, 1).normalize(), V3(-1, 0, 0), L(.3, 1, u));
    k.armDir('r', V3(-.1, -1, 0).normalize(), V3(-.05, -1, .03).normalize(), V3(1, 0, 0), .3);
    const p = fist(k, 'l'), d = k.curDir('hand.l');
    return {tools: [{t: 'line', a: p.clone().add(V3(0, .04, 0)), b: p.clone().add(V3(0, .04, 0)).addScaledVector(d, .08), r: .008}, {t: 'line', a: p.clone().add(V3(0, -.04 + L(.0, .03, u), 0)), b: p.clone().add(V3(0, -.04, 0)).addScaledVector(d, .08), r: .008}]};
  }});

  // ---------- tutto il corpo ----------
  // posa di "rack" frontale: bilanciere sulle spalle davanti, gomiti alti
  function rackHold(k, c, fwd) { barHands(k, c, .21).forEach(([s, p]) => hold(k, s, p.clone().add(k.V3(0, -.01, -.02)), k.V3((s === 'l' ? 1 : -1) * .3, .25, 1), k.V3(0, 1, 0))); }
  function overhead(k, w = .26) { const sh = shoulders(k), c = k.V3(0, sh.y + .6, sh.z - .03); barHands(k, c, w).forEach(([s, p]) => hold(k, s, p, k.V3((s === 'l' ? 1 : -1) * .3, -.6, .3), k.V3(0, 0, 1))); return c; }
  M.clean = o => ({seg: 1000, cyc: true, view: [40, 8], pose(k, u) {
    const V3 = k.V3, n = o.press ? 5 : 4, [i, t] = phase(u, n);
    const pull = (by, lu) => { const r = pullFrom(k, by, lu, .23); feet(k, .14, 10); neutral(k); sides.forEach(([s, sg]) => hold(k, s, V3(sg * .23, r.b.y, r.b.z), V3(sg * .3, .3, -1), V3(0, 0, -1))); return {tools: [bar(r.b)]}; };
    const stand = (hy, lu, barFn) => { const f = lean(k, lu); k.torso(V3(0, hy, 0), f.up, f.fwd, .55); feet(k, .16, 15); neutral(k); return f; };
    if (i === 0) return pull(L(.225, .62, t), L(47, 12, t));                    // tirata da terra a meta' coscia, bilanciere sopra il centro del piede
    if (i === 1) {                                                              // estensione e incastro: gomiti avanti, mezzo squat
      const f = stand(L(.8, .64, t), L(12, 10, t)), rack = k.onBone('spine3', P.rack);
      if (t < .45) { const sh = shoulders(k), c = V3(0, L(sh.y - .5, sh.y - .12, t / .45), sh.z + .1); barHands(k, c, .23).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .6, .7, -.2), V3(0, 0, -1))); return {tools: [bar(c)]}; }
      rackHold(k, rack, f.fwd); return {tools: [bar(rack)]};
    }
    if (i === 2) { const f = stand(L(.64, .845, t), L(10, 3, t)), rack = k.onBone('spine3', P.rack); rackHold(k, rack, f.fwd); return {tools: [bar(rack)]}; }
    if (o.press && i === 3) {
      const f = stand(.845, 0), sh = shoulders(k), c = k.onBone('spine3', P.rack).lerp(V3(0, sh.y + .6, sh.z - .03), t);
      barHands(k, c, .23).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .4, -.5, .5), V3(0, .4, .6).normalize())); return {tools: [bar(c)]};
    }
    return pull(L(.735, .225, t), L(0, 47, t));                                  // ritorno a terra
  }});
  M.pushPress = o => ({seg: 1000, cyc: true, view: [40, 8], pose(k, u) {
    const V3 = k.V3, [i, t] = phase(u, 3);
    let hy, c, lu = 3;
    if (o.thruster) { hy = [L(.42, .845, t), L(.845, .845, t), L(.845, .42, t)][i]; lu = [L(22, 3, t), 3, L(3, 22, t)][i]; }
    else hy = [L(.845, .75, t), L(.75, .845, t), .845][i];
    const f = lean(k, lu); k.torso(V3(0, hy, 0), f.up, f.fwd, .55); feet(k, .16, 15); neutral(k);
    const rack = k.onBone('spine3', P.rack), sh = shoulders(k), top = V3(0, sh.y + .6, sh.z - .03);
    const p = o.thruster ? [rack.clone().lerp(top, Math.max(0, t * 1.4 - .4)), top, top.clone().lerp(rack, ease(Math.min(1, t * 1.5)))][i] : [rack, rack.clone().lerp(top, t), top.clone().lerp(rack, t)][i];
    over(k, () => p, .07);
    const pp = o.thruster ? p : p;
    barHands(k, pp, .23).forEach(([s, q]) => hold(k, s, q, V3((s === 'l' ? 1 : -1) * .35, -.3, .7), V3(0, .5, .5).normalize()));
    return {tools: [bar(pp)]};
  }});
  M.snatch = o => ({seg: 1100, cyc: true, view: [40, 8], pose(k, u) {
    const V3 = k.V3, [i, t] = phase(u, 4), w = .42;
    if (i === 0 || i === 3) { const tt = i === 0 ? t : 1 - t, r = pullFrom(k, L(.225, .66, tt), L(52, 8, tt), w); feet(k, .15, 12); neutral(k); sides.forEach(([s, sg]) => hold(k, s, V3(sg * w, r.b.y, r.b.z), V3(sg * .3, .3, -1), V3(0, 0, -1))); return {tools: [bar(r.b)]}; }
    const f = lean(k, i === 1 ? L(8, 14, t) : L(14, 3, t)); k.torso(V3(0, i === 1 ? L(.8, .6, t) : L(.6, .845, t), 0), f.up, f.fwd, .55); feet(k, .2, 20); neutral(k);
    const c = overhead(k, w); return {tools: [bar(c)]};
  }});
  M.swing = o => ({seg: 900, view: [80, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, L(62, -2, u)); k.torso(V3(0, L(.76, .845, u), L(-.16, 0, u)), f.up, f.fwd, .6); feet(k, .22, 18); neutral(k);
    const sh = shoulders(k), a = L(-25, 92, u) * k.RAD, c = sh.clone().add(V3(0, -Math.cos(a) * .64, Math.sin(a) * .64));
    sides.forEach(([s, sg]) => hold(k, s, c.clone().add(V3(sg * .035, 0, 0)), V3(sg * .2, -.3, -1), V3(-sg, 0, 0)));
    return {tools: [o.db ? db(c.clone().addScaledVector(V3(0, -Math.cos(a), Math.sin(a)), .06), V3(0, -Math.cos(a), Math.sin(a))) : {t: 'kb', p: c, down: V3(0, -Math.cos(a), Math.sin(a))}]};
  }});
  M.getUp = o => ({seg: 1300, cyc: true, view: [30, 14], pose(k, u) {
    const V3 = k.V3, [i, t] = phase(u, 6), up = V3(0, 1, 0);
    // a terra → sul gomito → sulla mano → ponte alto → affondo in ginocchio → in piedi (poi a ritroso)
    const key = [0, .25, .45, .62, .8, 1, 0][i] + ([.25, .2, .17, .18, .2, -1][i]) * t;
    const e = Math.max(0, Math.min(1, key));
    const lu = L(-88, 0, Math.min(1, e * 1.6)), f = lean(k, lu);
    k.torso(V3(0, L(.1, .845, Math.max(0, e * 1.6 - .6)), L(.05, .05, e)), f.up, f.fwd, .6);
    if (e < .7) { k.leg('l', V3(.15, k.ay, k.wp('root').z + .45), V3(.2, 1, 0), 8); k.legDir('r', V3(-.25, Math.max(-.08, -e * .3), 1).normalize(), V3(-.25, -.02, 1).normalize()); }
    else feet(k, .15, 12, e > .9 ? 0 : .3, e > .9 ? 0 : -.35);
    neutral(k);
    const sh = k.wp('uarm.l'); hold(k, 'l', sh.clone().add(V3(.02, .62, 0)), V3(1, -.3, 0), V3(0, 0, 1));
    if (e < .6) { k.arm('r', V3(-.45, .04, k.wp('root').z - .1), V3(-1, .3, 0), V3(0, -1, 0)); k.grip('r', -.1); }
    else k.armDir('r', V3(-.2, -1, 0).normalize(), V3(-.1, -1, .05).normalize(), V3(1, 0, 0), .3);
    return {tools: [{t: 'kb', p: fist(k, 'l'), down: V3(0, -.3, -1).normalize()}]};
  }});
  M.carry = o => ({seg: 1100, cyc: true, view: [40, 6], pose(k, u) {
    const V3 = k.V3, f = lean(k, 2), bob = Math.abs(Math.sin(u * 2 * Math.PI)) * .015;
    k.torso(V3(0, .835 + bob, 0), f.up, f.fwd, .5); walk(k, u); neutral(k);
    const tools = [];
    sides.forEach(([s, sg]) => { const w = o.both || s === 'l'; k.armDir(s, V3(sg * (w ? .1 : .14), -1, Math.sin((u + (s === 'l' ? .5 : 0)) * 2 * Math.PI) * (w ? .02 : .2)).normalize(), V3(sg * .06, -1, .03).normalize(), V3(-sg, 0, 0), w ? 1 : .3); if (w) tools.push(o.trap ? {t: 'box', p: fist(k, s), s: [.05, .05, .25]} : o.kb ? {t: 'kb', p: fist(k, s), down: V3(0, -1, 0)} : db(fist(k, s), V3(0, 0, 1))); });
    if (!o.both) shrug(k, -2);
    return {tools};
  }});
  M.burpee = o => ({seg: 900, cyc: true, view: [70, 10], pose(k, u) {
    const V3 = k.V3, [i, t] = phase(u, 5);
    if (i === 0 || i === 4) {   // in piedi → accosciata con le mani a terra (e ritorno con salto)
      const tt = i === 0 ? t : 1 - t, f = lean(k, L(3, 40, tt)); k.torso(V3(0, L(.845, .42, tt) + (i === 4 ? Math.sin(t * Math.PI) * .15 : 0), L(0, -.05, tt)), f.up, f.fwd, .55); feet(k, .16, 12, 0);
      if (i === 4 && t > .5) sides.forEach(([s]) => tiptoe(k, s, 30));
      neutral(k); sides.forEach(([s, sg]) => { if (tt > .6) { k.arm(s, V3(sg * .22, .04, .32), V3(sg, .3, -.2), V3(0, -1, 0)); k.grip(s, -.1); } else k.armDir(s, V3(sg * .1, i === 4 && t > .5 ? 1 : -1, .1).normalize(), V3(sg * .05, i === 4 && t > .5 ? 1 : -1, .1).normalize(), V3(-sg, 0, 0), .3); });
      return {tools: []};
    }
    const sy = [L(.5, .58, t), L(.58, .2, t), L(.2, .58, t)][i - 1], {dir} = plankLine(k, sy, L(-.1, -.85, i === 1 ? t : 1)); k.headTo(dir.clone());
    const sh = shoulders(k); sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .22, .05, sh.z + .03), V3(sg * .6, .5, -.6), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: []};
  }});
  M.sled = o => ({seg: 1000, cyc: true, view: [60, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 50); k.torso(V3(0, .72, -.15), f.up, f.fwd, .6); walk(k, u, .5, .09, .13); k.headTo(f.up.clone().lerp(V3(0, 0, 1), .5).normalize());
    const sh = shoulders(k); sides.forEach(([s, sg]) => k.arm(s, V3(sg * .25, sh.y - .08, sh.z + .48), V3(sg, -.5, -.2), V3(0, 0, 1)));
    return {tools: [{t: 'box', p: V3(0, .2, sh.z + .85), s: [.7, .4, .5], c: 0x3a3d44}, {t: 'line', a: V3(.25, .35, sh.z + .7), b: V3(.25, sh.y - .08, sh.z + .5), r: .018}, {t: 'line', a: V3(-.25, .35, sh.z + .7), b: V3(-.25, sh.y - .08, sh.z + .5), r: .018}]};
  }});
  M.ropes = o => ({seg: 500, cyc: true, view: [35, 10], pose(k, u) {
    const V3 = k.V3, f = lean(k, 20); k.torso(V3(0, .7, -.05), f.up, f.fwd, .55); feet(k, .24, 18); neutral(k);
    const tools = [];
    sides.forEach(([s, sg], i) => { const t = Math.sin((u + i * .5) * 2 * Math.PI), sh = k.wp('uarm.' + s), p = V3(sg * .2, sh.y - .3 + t * .22, sh.z + .4);
      k.arm(s, p, V3(sg * .3, -1, -.3), V3(-sg, 0, 0));
      tools.push({t: 'line', a: p, b: V3(sg * .2, .2 - t * .12, p.z + 1.2), r: .02, c: 0x2b2b2b}, {t: 'line', a: V3(sg * .2, .2 - t * .12, p.z + 1.2), b: V3(sg * .2, .05, p.z + 3), r: .02, c: 0x2b2b2b}); });
    return {tools};
  }});

  // ---------- da movimento della libreria a schema 3D ----------
  // [schema, opzioni, attrezzi supportati]
  const MAP = {
    'quads.backSquat': ['squat', {hold: 'back'}, ['barbell']], 'quads.frontSquat': ['squat', {hold: 'front'}, ['barbell']], 'quads.gobletSquat': ['squat', {hold: 'goblet'}, ['dumbbell', 'kettlebell']],
    'quads.machineSquat': ['squat', {hold: 'back', smith: 1}, ['smith', 'machine']], 'quads.bodyweightSquat': ['squat', {hold: 'none'}, ['bodyweight']],
    'quads.lunge': ['lunge', {}, ['dumbbell', 'bodyweight', 'barbell']], 'quads.bulgarianSplitSquat': ['lunge', {bulgarian: 1}, ['dumbbell', 'bodyweight', 'barbell']], 'quads.stepUp': ['lunge', {step: 1}, ['dumbbell', 'bodyweight']],
    'fullbody.deadlift': ['deadlift', {}, ['barbell']], 'fullbody.sumoDeadlift': ['deadlift', {kind: 'sumo'}, ['barbell']], 'fullbody.trapBarDeadlift': ['deadlift', {kind: 'trap'}, ['trapbar']],
    'back.rackPull': ['deadlift', {rack: 1}, ['barbell']], 'hams.romanianDeadlift': ['hinge', {}, ['barbell', 'dumbbell']], 'hams.stiffLegDeadlift': ['hinge', {straight: 1}, ['barbell', 'dumbbell']],
    'back.goodMorning': ['hinge', {good: 1}, ['barbell']],
    'chest.benchPress': ['bench', {}, ['barbell', 'dumbbell', 'smith']], 'chest.inclineBenchPress': ['bench', {incline: 30}, ['barbell', 'dumbbell', 'smith']],
    'chest.declineBenchPress': ['bench', {incline: -18}, ['barbell', 'dumbbell', 'smith']], 'chest.floorPress': ['bench', {floor: 1}, ['barbell', 'dumbbell']],
    'triceps.closeGripBench': ['bench', {close: 1}, ['barbell', 'smith']], 'triceps.jmPress': ['bench', {close: 1, jm: 1}, ['barbell', 'smith']],
    'shoulders.overheadPress': ['ohp', {}, ['barbell']], 'shoulders.dumbbellShoulderPress': ['ohp', {seat: 1}, ['dumbbell']], 'shoulders.machineShoulderPress': ['ohp', {seat: 1, machine: 1}, ['machine']],
    'shoulders.arnoldPress': ['ohp', {seat: 1, arnold: 1}, ['dumbbell']],
    'back.bentOverRow': ['row', {}, ['barbell', 'dumbbell']], 'back.tBarRow': ['row', {tbar: 1}, ['landmine', 'barbell', 'machine']],
    'back.pullUp': ['pull', {}, ['bodyweight', 'band', 'machine']], 'back.chinUp': ['pull', {chin: 1}, ['bodyweight', 'band', 'machine']], 'back.latPulldown': ['pulldown', {}, ['cable', 'machine']],
    'biceps.curl': ['curl', {}, ['barbell', 'dumbbell', 'ezbar', 'cable', 'band']], 'biceps.hammerCurl': ['curl', {grip: 'neu'}, ['dumbbell', 'cable']], 'biceps.cableCurl': ['curl', {cable: 1}, ['cable']],
    'biceps.zottmanCurl': ['curl', {}, ['dumbbell']], 'biceps.dragCurl': ['curl', {drag: 1}, ['barbell', 'ezbar']], 'forearms.reverseCurl': ['curl', {grip: 'pro'}, ['barbell', 'ezbar', 'dumbbell', 'cable']],
    'triceps.pushdown': ['pushdown', {}, ['cable']],
    'shoulders.lateralRaise': ['raise', {}, ['dumbbell', 'cable', 'band']], 'shoulders.frontRaise': ['raise', {front: 1}, ['dumbbell', 'barbell', 'plate', 'cable']],
    'shoulders.reverseFly': ['raise', {rev: 1}, ['dumbbell', 'cable', 'machine']], 'shoulders.yRaise': ['raise', {y: 1}, ['dumbbell', 'cable', 'band']],
    'chest.pushUp': ['pushup', {}, ['bodyweight']], 'triceps.diamondPushUp': ['pushup', {diamond: 1}, ['bodyweight']],
    'biceps.inclineCurl': ['curlIncl'], 'biceps.preacherCurl': ['curlPreacher'], 'biceps.concentrationCurl': ['curlConc'], 'biceps.spiderCurl': ['curlSpider'],
    'triceps.dip': ['dip'], 'triceps.benchDip': ['benchDip'], 'triceps.skullCrusher': ['skull'], 'triceps.overheadExtension': ['overheadExt'], 'triceps.kickback': ['kickback'], 'triceps.machineExtension': ['machineExt'],
    'back.straightArmPulldown': ['straightArm'], 'back.oneArmRow': ['row1'], 'back.chestSupportedRow': ['rowChest'], 'back.seatedCableRow': ['rowSeat'], 'back.machineRow': ['rowSeat', {pad: 1}],
    'back.invertedRow': ['invRow'], 'back.shrug': ['shrug'], 'back.backExtension': ['backExt'], 'back.reverseHyper': ['revHyper'],
    'shoulders.facePull': ['facePull'], 'shoulders.uprightRow': ['uprightRow'], 'shoulders.cubanPress': ['uprightRow'], 'shoulders.pikePushUp': ['pike'], 'shoulders.handstandPushUp': ['hspu'],
    'shoulders.landminePress': ['landminePress'], 'chest.landmineChestPress': ['landminePress'],
    'chest.chestPress': ['pushFwd'], 'chest.svendPress': ['pushFwd', {stand: 1}], 'chest.dumbbellFly': ['fly'], 'chest.cableCrossover': ['cross'], 'chest.pecDeck': ['pecDeck'], 'chest.pullover': ['pullover'],
    'quads.sissySquat': ['sissy'], 'quads.legPress': ['legPress'], 'quads.legExtension': ['legExt'], 'quads.hipAdduction': ['hipAb', {adduct: 1}], 'hams.hipAbduction': ['hipAb'], 'quads.wallSit': ['wallSit'],
    'hams.legCurl': ['legCurl'], 'hams.nordicCurl': ['nordic'], 'hams.floorLegCurl': ['floorCurl'], 'hams.hipThrust': ['thrust'], 'hams.gluteBridge': ['thrust', {floor: 1}], 'hams.pullThrough': ['pullThrough'],
    'hams.gluteKickback': ['kickBack'], 'calves.standingCalfRaise': ['calf'], 'calves.seatedCalfRaise': ['calf', {seat: 1}], 'calves.legPressCalfRaise': ['legPress', {calf: 1}], 'calves.donkeyCalfRaise': ['calf', {donkey: 1}],
    'calves.tibialisRaise': ['tibialis'],
    'core.plank': ['plank'], 'core.sidePlank': ['plank', {side: 1}], 'quads.copenhagenPlank': ['plank', {side: 1, bench: 1}], 'core.crunch': ['crunch'], 'core.cableCrunch': ['cableCrunch'],
    'core.reverseCrunch': ['reverseCrunch'], 'core.bicycleCrunch': ['bicycle'], 'core.situp': ['situp'], 'core.lyingLegRaise': ['legRaise'], 'core.hangingRaise': ['hangRaise'],
    'core.abWheel': ['abWheel'], 'core.pallofPress': ['pallof'], 'core.russianTwist': ['twist'], 'core.woodchopper': ['chop'], 'core.landmineRotation': ['landmineRot'], 'core.deadBug': ['deadBug'],
    'core.hollowHold': ['hollow'], 'core.dragonFlag': ['dragon'], 'core.mountainClimber': ['climber'],
    'forearms.wristCurl': ['wristCurl'], 'forearms.reverseWristCurl': ['wristCurl', {rev: 1}], 'forearms.pronationSupination': ['wristCurl', {twist: 1}], 'forearms.wristRoller': ['wristRoller'],
    'forearms.platePinch': ['pinch'], 'forearms.deadHang': ['hang'], 'forearms.gripper': ['gripper'],
    'fullbody.powerClean': ['clean'], 'fullbody.cleanAndPress': ['clean', {press: 1}], 'fullbody.pushPress': ['pushPress'], 'fullbody.thruster': ['pushPress', {thruster: 1}], 'fullbody.snatch': ['snatch'],
    'fullbody.kettlebellSwing': ['swing'], 'fullbody.turkishGetUp': ['getUp'], 'fullbody.farmersWalk': ['carry', {both: 1}], 'fullbody.suitcaseCarry': ['carry'], 'fullbody.burpee': ['burpee'],
    'fullbody.sledPush': ['sled'], 'fullbody.battleRopes': ['ropes'],
  };
  function get(baseId, eq) {
    const m = MAP[baseId]; if (!m || !M[m[0]]) return null;
    const o = {...(m[1] || {})};
    if (eq === 'bodyweight') o.bw = 1;
    if (eq === 'barbell') o.bb = 1;
    if (eq === 'plate') o.plate = 1;
    if (eq === 'trapbar') o.trap = 1;
    if (eq === 'dumbbell') o.db = 1;
    if (eq === 'kettlebell') o.kb = 1;
    if (eq === 'smith') o.smith = 1;
    if (eq === 'ezbar') o.ez = 1;
    if (eq === 'cable') o.cable = 1;
    if (eq === 'band') o.band = 1;
    if (baseId === 'triceps.pushdown') o.rope = 1;
    if (baseId === 'core.hangingRaise' && eq === 'machine') o.knees = 1;
    if (baseId === 'core.woodchopper' && eq === 'dumbbell') o.low = 1;
    if (baseId === 'quads.lunge' && eq === 'barbell') o.hold = 'back';
    if (baseId === 'quads.bulgarianSplitSquat' && eq === 'barbell') o.hold = 'back';
    const mv = M[m[0]](o);
    // se l'attrezzo scelto e' un manubrio o un kettlebell ma lo schema disegna un bilanciere: uno per mano
    if ((o.db || o.kb) && mv.pose) {
      const p0 = mv.pose;
      mv.pose = (k, u) => {
        const r = p0(k, u) || {};
        if (r.tools && r.tools.some(t => t.t === 'bar')) {
          r.tools = r.tools.filter(t => t.t !== 'bar').concat(sides.map(([s]) => o.kb ? {t: 'kb', p: fist(k, s), down: k.curDir('hand.' + s)} : db(fist(k, s), k.V3(1, 0, 0))));
        }
        return r;
      };
    }
    return mv;
  }
  return {get, MAP};
})();
