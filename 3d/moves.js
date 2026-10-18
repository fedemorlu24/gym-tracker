// Movimenti 3D della guida, costruiti dai punti di controllo dei manuali di palestra (non dal disegno 2D).
// Ogni movimento ha pose(k, u) con u = 0 posizione di partenza → 1 fine (avanti e indietro) e, se serve, build(k, g) per panche e macchine.
// k e' il kit di guide3d.js: busto, gambe, braccia con IK e presa, punti del corpo (onBone), attrezzi. Metri; il corpo guarda +Z, la sua sinistra e' +X.
window.MOVES3D = (() => {
  const L = (a, b, u) => a + (b - a) * u;
  const sides = [['l', 1], ['r', -1]];
  // orientamento del busto: lean = gradi in avanti dalla verticale (90 = prono a testa avanti, -90 = supino a testa indietro)
  const lean = (k, d) => { const r = d * k.RAD; return {up: k.V3(0, Math.cos(r), Math.sin(r)), fwd: k.V3(0, -Math.sin(r), Math.cos(r))}; };
  // punti del corpo a riposo (m), da agganciare all'osso con k.onBone
  const P = {traps: [0, 1.418, -.112], rack: [0, 1.44, .095], nip: [0, 1.2806, .1294], sternum: [0, 1.345, .12], belly: [0, 1.06, .14], hipFront: [0, .9, .13],
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
    k.post(g, k.V3(sg * x, 0, z), k.V3(sg * x, y + .15, z), .03);
    g.add(k.box(.06, .05, .12, k.steel(), k.V3(sg * x, y + .05, z + .06)));
    g.add(k.box(.07, .04, .5, k.steel(), k.V3(sg * x, .02, z)));
  });
  const smithRails = (k, g, z) => sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .78, 0, z), k.V3(sg * .78, 2.15, z), .02));
  const bar = (c, half = .7, pr = .225) => ({t: 'bar', c, half, pr});
  const db = (p, axis) => ({t: 'db', p, axis});
  // centro del pugno: dove sta l'attrezzo nella mano chiusa
  const fist = (k, s) => { const w = k.wp('hand.' + s), d = k.curDir('hand.' + s); return w.addScaledVector(d, .065); };
  // mano verso un punto con il gomito che punta in pole e il palmo che guarda palm
  const hold = (k, s, at, pole, palm, wrist) => k.arm(s, at, pole, palm, wrist);
  const neutral = k => k.headTo(k.curDir('spine3').lerp(k.V3(0, 1, 0), .35).normalize());

  const M = {};

  // ---------- squat ----------
  M.squat = o => ({seg: 1300, view: [32, 10], build(k, g) {
    if (o.machine) {
      const V3 = k.V3; g.add(k.box(.8, .10, .55, k.mat(0x354352, .8), V3(0, .05, .32)));
      sides.forEach(([s, sg]) => k.post(g, V3(sg * .5, .05, .85), V3(sg * .5, 1.75, -.85), .035)); return;
    }
    if (o.smith) smithRails(k, g, .07);
  }, pose(k, u) {
    if (o.machine) {
      const V3 = k.V3, f = lean(k, -35); k.torso(V3(0, L(.85, .55, u), L(-.1, .2, u)), f.up, f.fwd, .9);
      sides.forEach(([s, sg]) => k.leg(s, V3(sg * .18, k.ay + .1, .22), V3(sg * .2, .2, 1), sg * 12)); k.headTo(f.up.clone());
      const c = k.onBone('spine3', P.traps), back = k.onBone('spine2', [0, 1.18, -.15]), tools = [
        {t: 'box', p: back, s: [.36, .72, .08], c: 0x263549, q: new k.T.Quaternion().setFromUnitVectors(V3(0, 1, 0), f.up)}];
      sides.forEach(([s, sg]) => {
        const pad = c.clone().add(V3(sg * .16, .045, .04)), hand = k.wp('uarm.' + s).add(V3(sg * .08, -.18, .22));
        k.arm(s, hand, V3(sg * .4, -.6, .3), V3(-sg, 0, 0));
        tools.push({t: 'box', p: pad, s: [.16, .09, .22], c: 0x263549}, {t: 'line', a: pad, b: pad.clone().setX(sg * .62), r: .03},
          {t: 'line', a: pad, b: hand, r: .018}, {t: 'plate', p: pad.clone().setX(sg * .58), n: V3(1, 0, 0), r: .19});
      }); return {tools};
    }
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
      barHands(k, c, .21).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .25, 0, 1), V3(0, 1, 0), {dir: V3(0, -.55, .83).normalize()}));
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
    // At lockout the bar is IN FRONT of the thighs. Keeping the shoulders ahead
    // of the bar throughout the lift used to translate the pelvis through it.
    const dz = L(-.14, .03, Math.min(1, lu / 60)), sh = shoulders(k);
    const reach = k.LEN.ua + k.LEN.fa + .055;
    const dy = Math.sqrt(Math.max(.01, reach * reach - Math.pow(w - .158, 2) - dz * dz));
    k.shift(V3(0, b.y + dy - sh.y, b.z + dz - sh.z));
    return {b, up, fwd};
  }
  M.deadlift = o => ({seg: 1400, view: [40, 8], build(k, g) { if (o.rack) sides.forEach(([s, sg]) => { k.post(g, k.V3(sg * .62, 0, .07), k.V3(sg * .62, .5, .07), .03); g.add(k.box(.08, .04, .14, k.steel(), k.V3(sg * .62, .46, .07))); }); },
    pose(k, u) {
      const V3 = k.V3, sumo = o.kind === 'sumo', trap = o.kind === 'trap';
      const by = L(o.rack ? .5 : trap ? .24 : .225, sumo ? .755 : trap ? .79 : .805, u), lu = (o.rack ? 38 : sumo ? 58 : trap ? 50 : 68) * (1 - gease(Math.max(0, (u - .12) / .88))), w = sumo ? .16 : trap ? .28 : .23;
      const {b, fwd} = pullFrom(k, by, lu, w);
      // Let the knees clear the shaft before opening the torso. Derive bar height
      // from a steadily rising pelvis, rather than making the pelvis dip mid-pull.
      const startHip = o.rack ? .70 : sumo ? .514 : trap ? .51 : .579;
      const hipY = L(startHip, sumo ? .808 : trap ? .84 : .854, Math.sqrt(u));
      const dy = hipY - k.wp('root').y; k.shift(V3(0, dy, 0)); b.y += dy;
      feet(k, sumo ? .36 : .12, sumo ? 35 : 8, -.025);
      neutral(k);
      sides.forEach(([s, sg]) => hold(k, s, V3(sg * w, b.y, b.z), V3(sg * .3, .3, -1), trap ? V3(-sg, 0, 0) : V3(0, 0, -1)));
      if (trap) return {tools: [{t: 'trap', c: b}]};
      if (o.db) return {tools: sides.map(([s, sg]) => db(V3(sg * w, b.y, b.z), V3(1, 0, 0)))};
      return {tools: [bar(b)]};
    }});
  M.hinge = o => ({seg: 1500, view: [70, 8], build(k, g) { if (o.smith) smithRails(k, g, .07); }, pose(k, u) {
    const V3 = k.V3;
    if (o.good) {        // good morning: bilanciere sui trapezi, ginocchia morbide, anche indietro
      const {up, fwd} = lean(k, L(3, 72, u));
      k.torso(V3(0, L(.845, .80, u), 0), up, fwd, .6);
      const c = () => k.onBone('spine3', P.traps);
      k.shift(V3(0, 0, .05 - (c().z + k.wp('root').z) / 2));
      feet(k, .15, 12); neutral(k);
      barHands(k, c(), .27).forEach(([s, p]) => hold(k, s, p, V3((s === 'l' ? 1 : -1) * .35, -1, -.6), fwd));
      if (o.band) return {tools: sides.flatMap(([s, sg]) => {
        const shoulder = c().clone().setX(sg * .15), hand = fist(k, s), foot = V3(sg * .15, .025, .03);
        return [{t: 'line', a: foot, b: hand, r: .008, c: 0xe68842}, {t: 'line', a: hand, b: shoulder, r: .008, c: 0xe68842},
          {t: 'line', a: shoulder, b: c(), r: .008, c: 0xe68842}];
      })};
      return {tools: [bar(c())]};
    }
    // Keep a small knee bend throughout the hinge; height is not a squat curve.
    const lu = L(0, o.straight ? 78 : 68, u), f = lean(k, lu);
    k.torso(V3(0, L(.845, o.straight ? .81 : .79, u), 0), f.up, f.fwd, .6);
    const dz = L(-.14, .03, u), sh = shoulders(k);
    k.shift(V3(0, 0, .07 + dz - sh.z));
    const reach = k.LEN.ua + k.LEN.fa + .055;
    const b = V3(0, sh.y - Math.sqrt(reach * reach - .062 * .062 - dz * dz), .07);
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
      if (o.machine) {
        stack(k, g, -.75, -.7);
        sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .48, 0, -.55), k.V3(sg * .48, inc > 0 ? 1.45 : 1.08, -.55), .035));
      } else if (!o.db) {
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
      if (o.jm) {
        // Elbows stay above the torso as the bar folds towards the upper chest.
        const ps = [], angle = L(0, 42, u) * k.RAD;
        sides.forEach(([s, sg]) => {
          const ua = V3(sg * .04, Math.cos(angle), Math.sin(angle)).normalize();
          const fa = bend(k, s, ua, L(5, 125, u));
          k.armDir(s, ua, fa, up.clone().negate(), 1); ps.push(fist(k, s));
        });
        return {tools: [bar(mid(ps[0], ps[1]), .7, .16)]};
      }
      const sh = shoulders(k), lowAt = inc > 0 ? [0, 1.34, .13] : inc < 0 ? [0, 1.23, .125] : P.nip;
      const topP = sh.clone().addScaledVector(fwd, .63), botP = k.onBone('spine3', lowAt).addScaledVector(fwd, o.floor ? .15 : o.db ? .04 : .016);
      const c = topP.lerp(botP, u), close = o.close, w = o.db ? L(.14, .29, u) : close ? .15 : .29, feetDir = up.clone().negate();
      const pole = sg => V3(sg * (close || o.jm ? .05 : .22), 0, 0).addScaledVector(fwd, -1).addScaledVector(feetDir, close || o.jm ? .5 : .28);
      const tools = [];
      sides.forEach(([s, sg]) => { const p = c.clone().add(V3(sg * w, 0, 0)); hold(k, s, p, pole(sg), feetDir);
        if (o.machine) tools.push({t: 'line', a: p.clone().add(V3(-.07, 0, 0)), b: p.clone().add(V3(.07, 0, 0)), r: .018, c: 0x263549},
          {t: 'line', a: p, b: V3(sg * .48, inc > 0 ? 1.45 : 1.08, -.55), r: .03});
        else if (o.db) tools.push(db(p, V3(1, 0, 0))); });
      if (!o.db && !o.machine) tools.push(bar(c));
      return {tools};
    }};
  };

  // ---------- spinte sopra la testa ----------
  M.ohp = o => ({seg: 1400, view: [35, 8], build(k, g) {
    if (!o.seat) return;
    const V3 = k.V3; k.pad(g, V3(0, .46, .28), V3(0, .46, -.08), .32, .08); k.pad(g, V3(0, .5, -.14), V3(0, 1.2, -.2), .3, .07);
    k.post(g, V3(0, 0, .1), V3(0, .42, .1), .03);
    if (o.machine) {
      sides.forEach(([s, sg]) => {
        k.post(g, V3(sg * .45, .02, -.3), V3(sg * .45, 2, -.3), .03);
        k.post(g, V3(sg * .45, .02, -.5), V3(sg * .45, .02, .4), .04);
      });
      k.post(g, V3(-.45, 2, -.3), V3(.45, 2, -.3), .035); stack(k, g, -.55, .65);
    }
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
        if (o.machine) tools.push(
          {t: 'line', a: p.clone().add(V3(-.07, 0, 0)), b: p.clone().add(V3(.07, 0, 0)), r: .018, c: 0x202c3a},
          {t: 'line', a: p, b: V3(sg * .45, p.y, -.3), r: .028},
          {t: 'box', p: V3(sg * .45, p.y, -.3), s: [.08, .12, .08]},
          {t: 'line', a: V3(sg * .45, p.y, -.3), b: V3(sg * .45, 2, -.3), r: .004});
        else tools.push(db(p, V3(1, 0, 0)));
      });
      k.headTo(up.clone());
      return {tools};
    }
    // Clear the face first, then bring the bar over the shoulder at lockout.
    const c = () => V3(0, L(sh.y + .03, sh.y + .6, u), sh.z + L(.16, -.01, u) + .14 * Math.sin(Math.PI * u));
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
    const tools = [{t: 'cable', a: c, b: V3(0, 2.4, .05), kind: o.close ? 'd' : 'bar', grips: sides.map(([s, sg]) => V3(sg * w, c.y, c.z))}];
    return {tools};
  }});

  // ---------- braccia ----------
  // curl: gomiti fermi ai fianchi, si muove solo l'avambraccio (0° → ~140°)
  M.curl = o => ({seg: 1100, cyc: !!o.zottman, duration: o.zottman ? 6500 : undefined, view: [30, 6], build(k, g) { if (o.cable) stack(k, g, .85); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 0);
    const rotation = o.zottman ? sampleKeys([[0, 0, 0], [.36, 1, 0], [.48, 1, 1], [.86, 0, 1], [1, 0, 0]], u) : [u, 0];
    u = rotation[0];
    k.torso(V3(0, .845, 0), up, fwd, .5);
    feet(k, .13, 10); neutral(k);
    const th = L(8, 138, u) * k.RAD, tools = [], ps = [];
    sides.forEach(([s, sg]) => {
      const ua = o.drag ? V3(sg * .05, -1, -L(.05, .45, u)).normalize() : V3(sg * .06, -1, .20).normalize();
      const fd = V3(0, -Math.cos(th), Math.sin(th)).normalize(), n0 = V3(0, Math.sin(th), Math.cos(th));
      const palm = o.zottman ? n0.applyAxisAngle(fd, sg * rotation[1] * Math.PI) : o.grip === 'neu' ? V3(-sg, 0, 0) : o.grip === 'pro' ? n0.clone().negate() : n0;
      k.armDir(s, ua, o.drag ? V3(0, 1, .25).normalize().lerp(V3(0, -1, .1), 1 - u).normalize() : fd, palm, 1);
      const f = fist(k, s); ps.push(f);
      if (o.db) tools.push(db(f, k.curDir('hand.' + s).cross(palm).normalize()));
    });
    if (!o.db) { const c = mid(ps[0], ps[1]);
      if (o.cable) tools.push({t: 'cable', a: c, b: V3(0, .12, .85), kind: 'bar', grips: ps});
      else if (o.band) ps.forEach(p => tools.push({t: 'line', a: p, b: V3(p.x, .02, .02), r: .006, c: 0xe0592b}));
      else tools.push(bar(c, o.ez ? .62 : .7, .16)); }
    return {tools};
  }});
  // Raise the elbows, externally rotate the shoulders, then press; reverse these phases.
  M.cuban = o => ({seg: 2700, view: [30, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    const [raise, rotation, press] = sampleKeys([[0, 0, 0, 0], [.32, 1, 0, 0], [.65, 1, 1, 0], [1, 1, 1, 1]], u), tools = [];
    sides.forEach(([s, sg]) => {
      const a = L(6, 90, raise) * k.RAD, r = rotation * Math.PI;
      const upper = V3(sg * Math.sin(a), -Math.cos(a), .08).normalize().lerp(V3(sg * .06, 1, 0), press).normalize();
      const fore = V3(0, -Math.cos(r), Math.sin(r)).lerp(V3(0, 1, 0), press).normalize();
      k.armDir(s, upper, fore, V3(0, Math.sin(r), Math.cos(r)), 1);
      tools.push(o.band ? {t: 'line', a: fist(k, s), b: V3(sg * .14, .03, 0), r: .006, c: 0xe0592b} : db(fist(k, s), V3(1, 0, 0)));
    });
    if (o.bb) {
      const c = mid(fist(k, 'l'), fist(k, 'r'));
      sides.forEach(([s, sg]) => hold(k, s, c.clone().setX(sg * .34), V3(sg, -.3, .5), V3(0, -Math.sin(rotation * Math.PI), Math.cos(rotation * Math.PI))));
      return {tools: [bar(c, .6, .12)]};
    }
    return {tools};
  }});
  // pushdown al cavo alto: gomiti ai fianchi, l'avambraccio scende fino a braccio teso
  M.pushdown = o => ({seg: 1100, view: [60, 6], build(k, g) { stack(k, g, .55); }, pose(k, u) {
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
    return {tools: [{t: 'cable', a: o.rope ? c.clone().add(V3(0, .18, .03)) : c, b: V3(0, 2.2, .45), kind: o.rope ? 'rope' : 'bar', grips: ps}]};
  }});

  // ---------- spalle ----------
  // alzate: laterali (piano della scapola, gomiti appena piegati, fino all'orizzontale), frontali (fino all'altezza delle spalle)
  M.raise = o => ({seg: 1200, view: o.front ? [60, 6] : [20, 8], build(k, g) {
    if (!o.machine) return;
    seat(k, g, .46, 0, o.rev ? undefined : .8); stack(k, g, -.45, -.7);
    if (o.rev) k.pad(g, k.V3(0, .8, .18), k.V3(0, 1.2, .18), .28, .08);
    sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .42, .02, -.3), k.V3(sg * .42, 1.8, -.3), .035));
  }, pose(k, u) {
    const V3 = k.V3, lu = o.rev ? 72 : 4, {up, fwd} = lean(k, lu);
    if (o.machine) sit(k, .46, 0, o.rev ? 5 : 0, .46);
    else { k.torso(V3(0, o.rev ? .79 : .845, o.rev ? -.12 : 0), up, fwd, .6); feet(k, .14, 10); }
    neutral(k);
    const tools = [];
    sides.forEach(([s, sg]) => {
      const a = L(o.rev ? 5 : 8, o.front ? 88 : o.y ? 150 : 86, u) * k.RAD;
      let ua;
      if (o.front) ua = V3(sg * .1, -Math.cos(a), Math.sin(a));
      else if (o.rev) ua = o.machine ? V3(sg * Math.sin(a), -.04, Math.cos(a)) : V3(sg * Math.sin(a), -Math.cos(a), 0).addScaledVector(fwd, .05);
      else ua = V3(sg * Math.sin(a), -Math.cos(a), Math.sin(a) * (o.y ? .4 : .3));
      ua.normalize();
      const fa = o.machine && !o.rev ? V3(0, .1, 1).normalize() : ua.clone().add(V3(0, o.front || o.y ? 0 : -.18, o.front ? 0 : .05)).normalize();
      const palm = o.front ? V3(0, -Math.sin(a), -Math.cos(a)) : o.y ? V3(-sg * .3, 0, 1).normalize() : V3(-sg, 0, 0).lerp(V3(0, -1, 0), u).normalize();
      k.armDir(s, ua, fa, palm, 1);
      const f = fist(k, s);
      if (o.machine) {
        const contact = o.rev ? f : k.wp('farm.' + s).add(V3(sg * .045, .01, 0)), pivot = V3(sg * .42, o.rev ? 1.8 : 1.16, -.3);
        tools.push({t: 'line', a: contact.clone().add(V3(0, 0, -.06)), b: contact.clone().add(V3(0, 0, .08)), r: o.rev ? .018 : .055, c: 0x263549},
          {t: 'line', a: contact, b: pivot, r: .025});
      } else tools.push(o.cable ? {t: 'cable', a: f, b: V3(-sg * .25, .12, .1), kind: 'd'} : db(f, k.curDir('hand.' + s).cross(palm).normalize()));
    });
    if (o.front && (o.bb || o.ez || o.plate)) {
      const c = mid(fist(k, 'l'), fist(k, 'r')); c.z = Math.max(.16, c.z);
      const w = o.plate ? .14 : .22;
      sides.forEach(([s, sg]) => k.arm(s, c.clone().setX(sg * w), V3(sg * .3, -.8, .4), o.plate ? V3(-sg, 0, 0) : V3(0, -Math.sin(u * 1.5), -Math.cos(u * 1.5))));
      return {tools: [o.plate ? {t: 'plate', p: c, n: V3(0, 0, 1), r: .15} : bar(c, .65, .13)]};
    }
    return {tools};
  }});

  // Suspended shoulder work: the body pivots at planted feet and straps stay
  // the same length. Do not reuse a bent-over dumbbell pose with elastic straps.
  M.suspensionUpper = o => ({seg: 1500, view: [55, 12], anchorZ: 1, pose(k, u) {
    const V3 = k.V3, anchor = V3(.2, 2.25, 1);
    const poseAt = (tilt, progress) => {
      k.reset();
      const f = lean(k, tilt), hip = V3(0, k.ay, 0).addScaledVector(f.up, .75);
      k.torso(hip, f.up, f.fwd, .9); feet(k, .12, 0); k.headTo(f.up.clone());
      const world = p => V3(p.x, 0, 0).addScaledVector(f.up, p.y).addScaledVector(f.fwd, p.z).normalize();
      sides.forEach(([s, sg]) => {
        let ua, fa;
        if (o.mode === 'facePull') {
          ua = world(V3(sg * .05, 0, 1).lerp(V3(sg * .85, .1, .3), progress));
          fa = world(V3(0, 0, 1).lerp(V3(0, 1, .12), progress));
        } else {
          const a = L(5, o.y ? 55 : 80, progress) * k.RAD;
          ua = world(o.y ? V3(sg * Math.sin(a) * .65, Math.sin(a), Math.cos(a)) : V3(sg * Math.sin(a), .05, Math.cos(a)));
          fa = ua.clone();
        }
        k.armDir(s, ua, fa, V3(-sg, 0, 0), 1);
      });
      return fist(k, 'l').distanceTo(anchor);
    };
    const length = poseAt(-38, 0);
    let lo = -65, hi = 25, flo = poseAt(lo, u) - length;
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) / 2, fm = poseAt(m, u) - length;
      if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; }
    }
    poseAt((lo + hi) / 2, u);
    return {tools: [], strapLength: length};
  }});

  // ---------- piegamenti ----------
  // corpo in linea dai talloni alla testa, mani sotto le spalle, gomiti a ~45° indietro, petto vicino al pavimento in basso
  M.pushup = o => ({seg: 1100, view: [70, 14], pose(k, u) {
    if (o.suspension) {
      const V3 = k.V3, sy = L(1.18, .96, u), ankle = V3(0, .1, -.6), ph = Math.asin((sy - ankle.y) / 1.285), up = V3(0, Math.sin(ph), Math.cos(ph));
      k.torso(ankle.clone().addScaledVector(up, .765), up, V3(0, -Math.cos(ph), Math.sin(ph)), .9);
      sides.forEach(([s, sg]) => k.leg(s, V3(sg * .12, k.ay, -.6), V3(0, 0, 1), 0)); k.headTo(up.clone());
      sides.forEach(([s, sg]) => k.arm(s, V3(sg * .25, 1.04, .68), V3(sg * .65, -.1, -.6), V3(0, -1, 0)));
      return {tools: []};
    }
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
  const stack = (k, g, z = -.6, x = 0) => { const V3 = k.V3; for (let i = 0; i < 8; i++) g.add(k.box(.30, .047, .18, k.mat(0x354352, .6, .2), V3(x, .13 + i * .055, z))); [-1, 1].forEach(sg => { k.post(g, V3(x + sg * .2, .04, z), V3(x + sg * .2, 2.2, z), .026); k.post(g, V3(x + sg * .2, .04, z - .2), V3(x + sg * .2, .04, z + .2), .03); }); k.post(g, V3(x - .24, 2.2, z), V3(x + .24, 2.2, z), .035); };
  // gomito fermo, avambraccio che ruota nel piano del braccio: ua direzione del braccio, th angolo di flessione (0 = disteso)
  function bend(k, s, ua, th, side = k.V3(1, 0, 0)) {
    const ax = side.clone().addScaledVector(ua, -side.dot(ua)).normalize(), fa = ua.clone().applyAxisAngle(ax, -th * k.RAD);
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
  M.curlPreacher = o => ({seg: 1200, view: [70, 12], build(k, g) { const V3 = k.V3; seat(k, g, .5, -.05); k.pad(g, V3(0, 1.13, .2), V3(0, .88, .47), .42, .09); k.post(g, V3(0, 0, .42), V3(0, .9, .42), .035); if (o.machine || o.cable) stack(k, g, .9, .55); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .5, -.05, 12, .4); k.headTo(f.up.clone());
    const ua = V3(0, -.75, .66).normalize(), tools = [], ps = [];
    sides.forEach(([s, sg]) => { const th = L(10, 125, u), fa = ua.clone().applyAxisAngle(V3(1, 0, 0), -th * k.RAD); k.armDir(s, V3(sg * .12, -.75, .66).normalize(), fa, V3(0, 1, 0).applyAxisAngle(V3(1, 0, 0), -th * k.RAD), 1); ps.push(fist(k, s)); });
    if (o.machine) ps.forEach((p, i) => { const sg = i ? -1 : 1, pivot = k.wp('farm.' + (i ? 'r' : 'l')).setX(sg * .30);
      tools.push({t: 'line', a: p.clone().add(V3(-.06, 0, 0)), b: p.clone().add(V3(.06, 0, 0)), r: .018}, {t: 'line', a: p, b: pivot, r: .025}, {t: 'line', a: pivot, b: V3(sg * .30, .9, .42), r: .025});
    }); else if (o.db) ps.forEach(p => tools.push(db(p, V3(1, 0, 0)))); else tools.push(bar(mid(ps[0], ps[1]), .62, .16));
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
  M.overheadExt = o => ({seg: 1200, view: [70, 8], build(k, g) { if (o.seat) seat(k, g, .46, 0, .75); if (o.machine) { stack(k, g, -.6); sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .4, 0, -.3), k.V3(sg * .4, 1.5, -.3), .03)); } }, pose(k, u) {
    const V3 = k.V3; let f;
    if (o.seat) f = sit(k, .46, 0, -2, .42); else { f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .15, 10); }
    neutral(k);
    const th = L(8, 150, u), ps = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * .12, 1, .08).normalize(), fa = bend(k, s, ua, th); k.armDir(s, ua, fa, V3(-sg, 0, 0), 1); ps.push(fist(k, s)); });
    const c = mid(ps[0], ps[1]);
    if (o.machine) return {tools: ps.flatMap((p, i) => {
      const sg = i ? -1 : 1, pivot = k.wp('farm.' + (i ? 'r' : 'l')).setX(sg * .4);
      return [{t: 'line', a: p.clone().add(V3(-.06, 0, 0)), b: p.clone().add(V3(.06, 0, 0)), r: .017},
        {t: 'line', a: p, b: pivot, r: .025}, {t: 'line', a: pivot, b: V3(sg * .4, 1.5, -.3), r: .025}];
    })};
    if (o.db) {
      sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .04, 0, 0)), V3(sg * .35, .6, .1), V3(0, 1, 0)));
      return {tools: [db(c.clone().add(V3(0, -.08, 0)), V3(0, 1, 0))]};
    }
    return {tools: o.cable ? [{t: 'cable', a: c.clone().add(V3(0, 0, -.1)), b: V3(0, .15, -.6), kind: 'rope', grips: ps}] : [bar(c, .62, .16)]};
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
    return {tools: ps.flatMap((p, i) => [{t: 'line', a: p.clone().add(V3(0, .05, 0)), b: p.clone().add(V3(0, -.05, 0)), r: .018}, {t: 'line', a: p, b: V3((i ? -1 : 1) * .30, .98, .42), r: .025}])};
  }});

  // ---------- schiena (altri) ----------
  M.straightArm = o => ({seg: 1200, view: [70, 8], build(k, g) { stack(k, g, .9); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 28); k.torso(V3(0, .82, -.12), up, fwd, .6);
    feet(k, .15, 10); neutral(k);
    const a = L(115, -8, u) * k.RAD, ps = [];
    sides.forEach(([s, sg]) => { const d = V3(sg * .12, -Math.cos(a), Math.sin(a)).normalize(); k.armDir(s, d, d.clone().add(V3(0, .05, 0)).normalize(), V3(0, Math.sin(a), Math.cos(a)).negate(), 1); ps.push(fist(k, s)); });
    const c = mid(ps[0], ps[1]); return {tools: [{t: 'cable', a: c, b: V3(0, 2.1, .85), kind: o.rope ? 'rope' : 'bar', grips: ps}]};
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
  M.rowChest = o => ({seg: 1100, view: [70, 12], build(k, g) {
    const V3 = k.V3;
    if (o.bb) { flatBench(k, g, .3, -.9, .9); return; }
    k.pad(g, V3(0, .5, -.6), V3(0, 1.05, .2), .32, .08); k.post(g, V3(0, 0, -.15), V3(0, .75, -.15), .035);
    if (o.machine) { stack(k, g, .85, .6); sides.forEach(([s, sg]) => k.post(g, V3(sg * .45, 0, .7), V3(sg * .45, .45, .7), .035)); }
  }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, o.bb ? 90 : 52); k.torso(V3(0, o.bb ? 1.01 : .72, -.45), up, fwd, .7);
    if (o.bb) sides.forEach(([s, sg]) => k.legDir(s, V3(sg * .02, 0, -1).normalize(), V3(0, 0, -1), V3(0, -1, 0)));
    else feet(k, .16, 10, -.78); neutral(k);
    const sh = shoulders(k), tools = [], ps = [];
    sides.forEach(([s, sg]) => {
      const hang = V3(sg * .24, sh.y - .59, sh.z + .04), top = o.bb ? V3(sg * .24, .81, sh.z - .08) : k.onBone('spine2', [sg * .24, 1.14, .16]), p = hang.lerp(top, u);
      k.arm(s, p, V3(sg * .3, .8, -.6), o.bb ? V3(0, 0, -1) : V3(-sg, 0, 0)); ps.push(p);
      if (o.machine) tools.push({t: 'line', a: p.clone().add(V3(0, 0, -.07)), b: p.clone().add(V3(0, 0, .07)), r: .018},
        {t: 'line', a: p, b: p.clone().setX(sg * .45), r: .025}, {t: 'line', a: p.clone().setX(sg * .45), b: V3(sg * .45, .45, .7), r: .03});
      else if (!o.bb) tools.push(db(p, V3(0, 0, 1)));
    });
    if (o.bb) tools.push(bar(mid(ps[0], ps[1]))); return {tools};
  }});
  M.rowSeat = o => ({seg: 1200, view: [70, 8], build(k, g) { const V3 = k.V3; k.pad(g, V3(0, .36, .25), V3(0, .36, -.25), .34, .08); k.post(g, V3(0, 0, 0), V3(0, .32, 0), .035); g.add(k.box(.45, .3, .06, k.steel(), V3(0, .2, .75)));
    if (o.pad) { k.pad(g, V3(0, .78, .20), V3(0, 1.15, .20), .3, .1); k.post(g, V3(0, .04, .20), V3(0, 1, .20), .03); } stack(k, g, 1.05); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .36, -.05, o.pad ? 10 : L(10, -4, u), .68, .16); k.headTo(f.up.clone());
    const sh = shoulders(k), far = V3(0, sh.y - .12, sh.z + .6), near = k.onBone('spine1', P.belly).add(V3(0, .02, .06)), c = far.lerp(near, u);
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * (o.pad ? .2 : .05), c.y, c.z), V3(sg * .3, -.4, -1), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c.clone().add(V3(0, 0, .08)), b: V3(0, .3, 1.0), kind: 'd', grips: sides.map(([s, sg]) => V3(sg * (o.pad ? .2 : .05), c.y, c.z))}]};
  }});
  M.invRow = o => ({seg: 1100, view: [70, 10], build(k, g) { const V3 = k.V3; sides.forEach(([s, sg]) => k.post(g, V3(sg * .65, 0, .1), V3(sg * .65, 1.0, .1), .03)); g.add(k.seg(V3(-.67, .90, .1), V3(.67, .90, .1), .016, k.steel())); }, pose(k, u) {
    const V3 = k.V3, BY = .90, ank = V3(0, .08, -1.05), sy = L(.45, .78, u);
    const ph = Math.asin((sy - ank.y) / 1.285), dir = V3(0, Math.sin(ph), Math.cos(ph)), fwd = V3(0, Math.cos(ph), -Math.sin(ph));
    k.torso(ank.clone().addScaledVector(dir, .765), dir, fwd, .9);
    sides.forEach(([s, sg]) => k.legDir(s, dir.clone().negate(), dir.clone().negate(), V3(0, .7, -.7).normalize()));
    k.headTo(dir.clone());
    const sh = shoulders(k); sides.forEach(([s, sg]) => k.arm(s, V3(sg * .27, BY, .1), V3(sg * .5, -1, -.5), o.suspension ? V3(-sg, 0, 0) : V3(0, 0, -1)));
    return {tools: []};
  }});
  M.shrug = o => ({seg: 1000, view: [30, 6], build(k, g) {
    if (o.smith) smithRails(k, g, .14);
    if (o.machine) sides.forEach(([s, sg]) => { k.post(g, k.V3(sg * .48, 0, -.5), k.V3(sg * .48, .55, -.5), .04); k.post(g, k.V3(sg * .48, .03, -.65), k.V3(sg * .48, .03, .35), .04); });
  }, pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    shrug(k, L(0, 14, u));
    const tools = [], ps = [];
    sides.forEach(([s, sg]) => { k.armDir(s, V3(sg * .1, -1, .02).normalize(), V3(sg * .05, -1, .03).normalize(), o.db ? V3(-sg, 0, 0) : V3(0, 0, -1), 1); ps.push(fist(k, s)); });
    if (o.machine) ps.forEach((p, i) => { const sg = i ? -1 : 1;
      tools.push({t: 'line', a: p.clone().add(V3(0, 0, -.07)), b: p.clone().add(V3(0, 0, .07)), r: .018},
        {t: 'line', a: p, b: p.clone().setX(sg * .48), r: .025}, {t: 'line', a: p.clone().setX(sg * .48), b: V3(sg * .48, .55, -.5), r: .03},
        {t: 'plate', p: p.clone().setX(sg * .52), n: V3(1, 0, 0), r: .16});
    });
    else if (o.db) ps.forEach(p => tools.push(db(p, V3(0, 0, 1))));
    else {
      const c = mid(ps[0], ps[1]); if (!o.trap) c.z = Math.max(c.z, .14);
      sides.forEach(([s, sg]) => k.arm(s, c.clone().setX(sg * (o.trap ? .28 : .22)), V3(sg * .3, .2, -1), o.trap ? V3(-sg, 0, 0) : V3(0, 0, -1)));
      tools.push(o.trap ? {t: 'trap', c} : bar(c));
    }
    return {tools};
  }});
  M.backExt = o => ({seg: 1300, view: [80, 8], build(k, g) { const V3 = k.V3;
    if (o.machine) { seat(k, g, .46, 0); stack(k, g, -.7, .5); k.post(g, V3(.4, 0, -.25), V3(.4, .65, -.25), .035); return; } k.pad(g, V3(0, .9, .12), V3(0, .72, -.08), .36, .1); k.post(g, V3(0, 0, -.2), V3(0, .85, -.2), .04); g.add(k.box(.35, .04, .3, k.steel(), V3(0, .22, -.75))); }, pose(k, u) {
    const V3 = k.V3;
    if (o.machine) {
      const f = sit(k, .46, 0, L(30, -5, u), .45); k.headTo(f.up.clone()); crossArms(k);
      const pad = k.onBone('spine3', [0, 1.3, -.15]);
      return {tools: [{t: 'box', p: pad, s: [.38, .22, .10], c: 0x263549, q: new k.T.Quaternion().setFromUnitVectors(V3(0, 1, 0), f.up)},
        {t: 'line', a: pad, b: pad.clone().setX(.4), r: .025}, {t: 'line', a: pad.clone().setX(.4), b: V3(.4, .65, -.25), r: .03}]};
    }
    const legDir = V3(0, -.7, -.71).normalize();
    const {up, fwd} = lean(k, L(150, 45, u)); k.torso(V3(0, .92, -.05), up, fwd, .3);
    sides.forEach(([s, sg]) => k.legDir(s, legDir.clone().add(V3(sg * .05, 0, 0)).normalize(), legDir, V3(0, -.6, .8).normalize()));
    k.headTo(up.clone()); crossArms(k);
    return {tools: o.plate ? [{t: 'plate', p: k.onBone('spine3', P.sternum).addScaledVector(fwd, .06), n: fwd, r: .16}] : []};
  }});
  M.revHyper = o => ({seg: 1200, view: [65, 12], build(k, g) {
    flatBench(k, g, .5, -.35, 1.0);
    sides.forEach(([s, sg]) => { k.post(g, k.V3(sg * .22, .99, .25), k.V3(sg * .22, 1.04, .5), .018);
      k.post(g, k.V3(sg * .4, .03, -.5), k.V3(sg * .4, .03, .6), .035);
      k.post(g, k.V3(sg * .4, .03, -.25), k.V3(sg * .4, .98, -.25), .035); });
  }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 90); k.torso(V3(0, 1.12, -.25), up, fwd, .95);
    const a = L(0, 85, u) * k.RAD, ld = V3(0, -Math.cos(a), -Math.sin(a));
    sides.forEach(([s, sg]) => k.legDir(s, ld.clone().add(V3(sg * .04, 0, 0)).normalize(), ld, V3(0, -Math.sin(a), Math.cos(a)).negate()));
    k.headTo(up.clone());
    sides.forEach(([s, sg]) => k.arm(s, V3(sg * .22, 1.04, .45), V3(sg * .4, -.5, -.6), V3(0, -1, 0)));
    if (!o.machine) return {tools: []};
    const ankle = mid(k.wp('foot.l'), k.wp('foot.r')), axle = ankle.clone().add(V3(0, -.12, 0));
    return {tools: [{t: 'line', a: V3(0, .96, -.25), b: axle, r: .035},
      {t: 'line', a: axle.clone().setX(-.42), b: axle.clone().setX(.42), r: .025},
      ...sides.flatMap(([s, sg]) => [{t: 'plate', p: axle.clone().setX(sg * .34), n: V3(1, 0, 0), r: .18},
        {t: 'line', a: axle, b: k.wp('foot.' + s), r: .015, c: 0xe68842},
        {t: 'box', p: k.wp('foot.' + s), s: [.10, .08, .10], c: 0x263549}])]};
  }});

  // ---------- spalle (altri) ----------
  M.facePull = o => ({seg: 1200, view: [50, 8], build(k, g) { stack(k, g, 1.0); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -4); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .15, 10, 0, -.05); neutral(k);
    const sh = shoulders(k), far = V3(0, sh.y + .12, sh.z + .55), near = k.onBone('head', P.forehead).add(V3(0, 0, .1)), c = far.lerp(near, u);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * L(.06, .2, u), 0, 0)), V3(sg, .7, -.2), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c.clone().add(V3(0, 0, .18)), b: V3(0, 1.52, 1.0), kind: 'rope', grips: sides.map(([s, sg]) => c.clone().add(V3(sg * L(.06, .2, u), 0, 0)))}]};
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
    const V3 = k.V3, hip = V3(0, L(.80, .75, u), -.15), {up, fwd} = lean(k, L(125, 150, u));
    k.torso(hip, up.clone().negate().negate(), fwd, .8);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .14, .09, -.5), V3(0, 1, -.2), 0)); sides.forEach(([s]) => tiptoe(k, s, 35));
    k.headTo(up.clone());
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .25, .05, .36), V3(sg * .6, .4, .4), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: []};
  }});
  M.hspu = o => ({seg: 1300, view: [70, 8], build(k, g) { const V3 = k.V3; g.add(k.box(1.2, 2.3, .06, k.mat(0xd5d8de, .9), V3(0, 1.15, -.36))); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, 180); k.torso(V3(0, 1.4, -.25), up, V3(0, 0, 1), .7);
    const sh = shoulders(k); k.shift(V3(0, L(.38, .22, u) - sh.y, -.12 - sh.z));
    sides.forEach(([s, sg]) => k.legDir(s, V3(sg * .03, 1, -.12).normalize(), V3(0, 1, -.05).normalize(), V3(0, .5, .85).normalize()));
    k.headTo(V3(0, -1, 0));
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .27, .05, .02), V3(sg * .7, .2, .5), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: []};
  }});
  M.landminePress = o => ({seg: 1200, view: [55, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 12); k.torso(V3(0, .82, -.05), f.up, f.fwd, .5); feet(k, .15, 10, .15, -.3); neutral(k);
    const sh = shoulders(k), start = sh.clone().add(V3(0, -.06, .14)), end = sh.clone().add(V3(0, .42, .46)), c = start.lerp(end, u);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .03, 0, 0)), V3(sg * .5, -.7, .3), V3(0, 0, 1)));
    const anchor = V3(0, .04, 1.65), axis = c.clone().sub(anchor).normalize();
    return {tools: [{t: 'line', a: anchor, b: c.clone().addScaledVector(axis, .06), r: .016}, {t: 'plate', p: c.clone().addScaledVector(axis, -.16), n: axis, r: .18}, {t: 'box', p: anchor, s: [.3, .06, .3]}]};
  }});

  // ---------- petto (altri) ----------
  M.pushFwd = o => ({seg: 1200, view: [55, 10], build(k, g) { if (!o.stand && !o.cable && !o.band) { seat(k, g, .46, -.05, .8); stack(k, g, -.6, .55); sides.forEach(([s, sg]) => { k.post(g, k.V3(sg * .48, 0, -.35), k.V3(sg * .48, 1.75, -.35), .035); k.post(g, k.V3(sg * .48, 1.75, -.35), k.V3(sg * .48, 1.75, .05), .035); }); } }, pose(k, u) {
    const V3 = k.V3; let f;
    if (o.stand || o.cable || o.band) { f = lean(k, 4); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); } else f = sit(k, .46, -.05, -6, .42);
    neutral(k);
    const sh = shoulders(k), angle = L(10, 40, u) * k.RAD, c = o.stand || o.cable || o.band ? sh.clone().add(V3(0, -.12, .16)).lerp(sh.clone().add(V3(0, -.08, .6)), u) : V3(0, 1.75 - .8 * Math.cos(angle), .05 + .8 * Math.sin(angle)), tools = [];
    sides.forEach(([s, sg]) => { const p = c.clone().add(V3(sg * (o.stand ? .03 : L(.24, .14, u)), 0, 0)); k.arm(s, p, V3(sg, -.5, -.5), o.stand ? V3(-sg, 0, 0) : V3(0, 0, 1)); if (o.cable || o.band) tools.push({t: 'cable', a: p, b: V3(sg * .7, 1.2, -.65), kind: 'd'}); else if (!o.stand) tools.push({t: 'line', a: p.clone().add(V3(0, .08, 0)), b: p.clone().add(V3(0, -.08, 0)), r: .018, c: 0x202c3a}, {t: 'line', a: p, b: V3(sg * .48, p.y, p.z), r: .026}, {t: 'line', a: V3(sg * .48, p.y, p.z), b: V3(sg * .48, 1.75, .05), r: .03}); });
    if (o.stand) tools.push(o.db ? db(c, V3(0, 1, 0)) : {t: 'plate', p: c, n: V3(1, 0, 0), r: .14});
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
  M.pecDeck = o => ({seg: 1200, view: [30, 14], build(k, g) { seat(k, g, .46, -.05, .85); stack(k, g, -.55, 0); k.post(g, k.V3(-.48, 1.8, -.3), k.V3(.48, 1.8, -.3), .035); }, pose(k, u) {
    const V3 = k.V3, f = sit(k, .46, -.05, -4, .42); k.headTo(f.up.clone());
    const a = L(80, 8, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const ua = V3(sg * Math.sin(a), 0, Math.cos(a)).normalize(), fa = ua.clone().add(V3(-sg * .15, 0, .1)).normalize();
      k.armDir(s, ua, fa, V3(-sg, 0, 0), 1); const p = fist(k, s); tools.push({t: 'line', a: p.clone().add(V3(0, .20, 0)), b: p.clone().add(V3(0, -.07, 0)), r: .02, c: 0x202c3a}, {t: 'line', a: p.clone().add(V3(0, .20, 0)), b: V3(sg * .48, 1.8, -.3), r: .03}); });
    return {tools};
  }});
  M.pullover = o => ({seg: 1400, view: [65, 18], build(k, g) {
    if (!o.machine) return flatBench(k, g);
    seat(k, g, .46, 0, .8); stack(k, g, -.4, -.65);
    sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .42, 0, -.2), k.V3(sg * .42, 1.18, -.2), .035));
  }, pose(k, u) {
    if (o.machine) {
      const V3 = k.V3, f = sit(k, .46, 0, -5, .45), a = L(155, 25, u) * k.RAD, tools = [];
      k.headTo(f.up.clone());
      sides.forEach(([s, sg]) => {
        const ua = V3(sg * .12, -Math.cos(a), Math.sin(a)).normalize();
        k.armDir(s, ua, bend(k, s, ua, 85), V3(-sg, 0, 0), 1);
        const elbow = k.wp('farm.' + s).add(V3(sg * .055, 0, 0)), p = fist(k, s), pivot = V3(sg * .42, 1.18, -.2);
        tools.push({t: 'line', a: elbow.clone().add(V3(0, -.06, 0)), b: elbow.clone().add(V3(0, .06, 0)), r: .055, c: 0x263549},
          {t: 'line', a: elbow, b: pivot, r: .025}, {t: 'line', a: elbow, b: p, r: .018},
          {t: 'line', a: p.clone().add(V3(-.07, 0, 0)), b: p.clone().add(V3(.07, 0, 0)), r: .016, c: 0x263549});
      });
      return {tools};
    }
    const V3 = k.V3, f = lie(k), a = L(0, 105, u) * k.RAD;
    const ua = V3(0, Math.cos(a), -Math.sin(a)).normalize(), ps = [];
    sides.forEach(([s, sg]) => { const u2 = ua.clone().add(V3(sg * .08, 0, 0)).normalize(); k.armDir(s, u2, bend(k, s, u2, 20), f.up.clone().negate(), 1); ps.push(fist(k, s)); });
    const c = mid(ps[0], ps[1]);
    if (o.db) {
      sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .045, 0, 0)), V3(sg * .4, -.4, -.1), V3(0, 1, 0)));
      return {tools: [db(c.clone().add(V3(0, -.08, 0)), V3(0, 1, 0))]};
    }
    return {tools: [bar(c, .6, .14)]};
  }});

  // ---------- gambe (macchine, glutei, polpacci) ----------
  M.sissy = o => ({seg: 1300, view: [80, 6], build(k, g) {
    if (!o.machine) return;
    const V3 = k.V3; g.add(k.box(.6, .04, .65, k.steel(), V3(0, .02, .05)));
    k.post(g, V3(.30, .04, -.05), V3(.30, .38, -.05), .035);
    g.add(k.seg(V3(-.24, .35, -.05), V3(.24, .35, -.05), .065, k.mat(0x263549, .8)));
    g.add(k.seg(V3(-.24, .14, .13), V3(.24, .14, .13), .045, k.mat(0x263549, .8)));
  }, pose(k, u) {
    if (o.machine) {
      const V3 = k.V3, a = L(0, 55, u) * k.RAD, kn = V3(0, .46, 0), up = V3(0, Math.cos(a), -Math.sin(a)), fwd = V3(0, Math.sin(a), Math.cos(a));
      k.torso(kn.clone().addScaledVector(up, .39), up, fwd, .9);
      sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, k.ay + .04, 0), V3(0, 0, 1), 0); k.armDir(s, fwd.clone().add(V3(sg * .1, 0, 0)), fwd, V3(0, -1, 0), .2); }); k.headTo(up.clone()); return {tools: []};
    }
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
      const d = V3(...dir), plat = V3(0, .55, .38).addScaledVector(d, o.calf ? .40 : L(0, .42, u)), tools = [];
      sides.forEach(([s, sg]) => { k.leg(s, plat.clone().add(V3(sg * .17, 0, 0)).addScaledVector(d, -.05), V3(sg * .35, .5, .2), sg * 12); k.aim('foot.' + s, d.clone().applyAxisAngle(V3(1, 0, 0), -Math.PI / 2 + .25)); });
      sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .2, -.9, .2).normalize(), V3(sg * .1, -.5, .8).normalize(), V3(-sg, 0, 0), .8));
      if (o.calf) { sides.forEach(([s]) => tiptoe(k, s, L(-10, 30, u))); plat.addScaledVector(d, L(-.025, .065, u)); }
      tools.push({t: 'box', p: plat.clone().addScaledVector(d, .06).add(V3(0, .05, 0)), s: [.62, .55, .04], c: 0x5a5f68, q: new (k.T.Quaternion)().setFromUnitVectors(V3(0, 0, 1), d)});
      sides.forEach(([s, sg]) => tools.push({t: 'line', a: plat.clone().add(V3(sg * .3, 0, 0)), b: plat.clone().add(V3(sg * .65, 0, 0)), r: .025}, {t: 'plate', p: plat.clone().add(V3(sg * .5, 0, 0)), n: V3(1, 0, 0), r: .2}));
      return {tools};
    }};
  };
  M.legExt = o => ({seg: 1200, view: [75, 10], build(k, g) { seat(k, g, .5, -.08, .8); k.post(g, k.V3(.34, 0, .34), k.V3(.34, .55, .34), .035); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -8); k.torso(V3(0, .6, -.08), f.up, f.fwd, .4); k.headTo(f.up.clone());
    const a = L(8, 85, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { const th = V3(sg * .03, -.1, 1).normalize(), sh = V3(0, -Math.cos(a), Math.sin(a)); k.legDir(s, th, sh, V3(0, Math.sin(a) * .5, Math.cos(a)).add(V3(0, .3, .6)).normalize());
      k.arm(s, V3(sg * .3, .52, -.05), V3(sg, 0, 0), V3(-sg, 0, 0)); });
    const an = k.wp('foot.l').lerp(k.wp('foot.r'), .5).add(V3(0, .02, .08));
    tools.push({t: 'line', a: an.clone().add(V3(-.2, 0, 0)), b: an.clone().add(V3(.2, 0, 0)), r: .04, c: 0x2a2d33});
    const pivot = k.wp('shin.l').setX(.34), tip = an.clone().setX(.34);
    tools.push({t: 'line', a: pivot, b: tip, r: .025}, {t: 'line', a: tip, b: an, r: .02}, {t: 'plate', p: tip, n: V3(1, 0, 0), r: .12});
    return {tools};
  }});
  M.hipAb = o => ({seg: 1200, view: [25, 16], build(k, g) {
    if (o.cable || o.band) {
      if (!o.band) stack(k, g, -.15, o.adduct ? .95 : -.95);
      k.post(g, k.V3(-.45, 0, .22), k.V3(-.45, 1.12, .22), .025); return;
    }
    seat(k, g, .5, -.05, .8); stack(k, g, -.5, .5); sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .4, .03, -.3), k.V3(sg * .4, .03, .65), .035));
  }, pose(k, u) {
    if (o.cable || o.band) {
      const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .6); neutral(k);
      k.leg('r', V3(-.12, k.ay, 0), V3(0, 0, 1), -5);
      const a = (o.adduct ? L(30, -4, u) : L(4, 32, u)) * k.RAD, dir = V3(Math.sin(a), -Math.cos(a), -.02).normalize();
      k.legDir('l', dir, dir, k.restDir('foot.l'));
      k.arm('r', V3(-.45, 1.10, .22), V3(-1, -.3, 0), V3(0, -1, 0));
      k.armDir('l', V3(.18, -.95, .15).normalize(), V3(-.2, -.9, .2).normalize(), V3(-1, 0, 0), .3);
      const ankle = k.wp('foot.l'), anchor = o.band ? k.wp('foot.r') : V3(o.adduct ? .95 : -.95, .12, -.15);
      return {tools: [{t: 'box', p: ankle, s: [.09, .07, .10], c: 0x263549},
        {t: 'line', a: ankle, b: anchor, r: o.band ? .008 : .004, c: o.band ? 0xe68842 : 0x7c828a}]};
    }
    const V3 = k.V3, f = lean(k, -6); k.torso(V3(0, .6, -.05), f.up, f.fwd, .4); k.headTo(f.up.clone());
    const a = (o.adduct ? L(32, 4, u) : L(4, 32, u)) * k.RAD;
    sides.forEach(([s, sg]) => { const th = V3(sg * Math.sin(a), -.08, Math.cos(a)).normalize(); k.legDir(s, th, V3(sg * Math.sin(a) * .6, -1, .1).normalize());
      k.arm(s, V3(sg * .34, .55, -.08), V3(sg, 0, 0), V3(-sg, 0, 0)); });
    const tools = [];
    sides.forEach(([s, sg]) => {
      const pad = k.wp('shin.' + s).add(V3(sg * (o.adduct ? -.07 : .07), .02, 0)), foot = k.wp('foot.' + s).add(V3(0, -.05, .08));
      tools.push({t: 'line', a: pad.clone().add(V3(0, 0, -.08)), b: pad.clone().add(V3(0, 0, .12)), r: .045, c: 0x2a2d33},
        {t: 'line', a: pad, b: foot, r: .025}, {t: 'line', a: pad, b: V3(sg * .12, .45, -.05), r: .025},
        {t: 'box', p: foot, s: [.16, .04, .22]}, {t: 'line', a: V3(sg * .34, .55, -.14), b: V3(sg * .34, .55, .04), r: .018});
    });
    return {tools};
  }});
  M.wallSit = o => ({seg: 2000, view: [70, 8], build(k, g) { const V3 = k.V3; g.add(k.box(1.4, 2.2, .06, k.mat(0xd5d8de, .9), V3(0, 1.1, -.26))); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .45 + Math.sin(u * Math.PI) * .005, -.08), f.up, f.fwd, .5);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .16, k.ay, .36), V3(sg * .1, .5, 1), sg * 10)); k.headTo(f.up.clone());
    sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, -.25, 1).normalize(), V3(sg * .05, -.15, 1).normalize(), V3(0, -1, 0), 0));
    return {tools: []};
  }});
  M.legCurl = o => ({seg: 1200, view: [80, 12], build(k, g) {
    if (o.cable) { stack(k, g, .9); k.post(g, k.V3(-.3, 0, .45), k.V3(-.3, 1.1, .45), .025); return; }
    flatBench(k, g, .4, -.9, .6); k.post(g, k.V3(.34, 0, .46), k.V3(.34, .7, .46), .035); }, pose(k, u) {
    const V3 = k.V3;
    if (o.cable) {
      const f = lean(k, 4); k.torso(V3(0, .845, 0), f.up, f.fwd, .8); feet(k, .12, 5); neutral(k);
      const a = L(8, 100, u) * k.RAD; k.legDir('l', V3(0, -1, -.06).normalize(), V3(0, -Math.cos(a), -Math.sin(a)), V3(0, Math.sin(a), Math.cos(a)));
      k.arm('r', V3(-.3, 1.08, .45), V3(-1, -.4, 0), V3(0, -1, 0)); k.armDir('l', V3(.1, -1, 0).normalize(), V3(0, -1, .1).normalize(), V3(-1, 0, 0), .3);
      const p = k.wp('foot.l'); return {tools: [{t: 'box', p, s: [.10, .07, .10], c: 0x263549}, {t: 'line', a: p, b: V3(0, .12, .9), r: .004}]};
    }
    k.torso(V3(0, .7, .05), V3(0, 0, -1), V3(0, -1, 0), .95);
    const a = L(5, 115, u) * k.RAD, tools = [];
    sides.forEach(([s, sg]) => { k.legDir(s, V3(sg * .03, 0, 1).normalize(), V3(0, Math.sin(a), Math.cos(a)).normalize(), V3(0, 1, 0)); k.arm(s, V3(sg * .2, .6, -.75), V3(sg, .2, 0), V3(0, -1, 0)); });
    k.headTo(V3(0, .2, -1).normalize());
    const an = k.wp('foot.l').lerp(k.wp('foot.r'), .5).add(V3(0, .05, -.04));
    if (o.db) return {tools: [db(an, V3(0, 1, 0))]};
    tools.push({t: 'line', a: an.clone().add(V3(-.2, 0, 0)), b: an.clone().add(V3(.2, 0, 0)), r: .04, c: 0x2a2d33});
    const pivot = k.wp('shin.l').setX(.34), tip = an.clone().setX(.34);
    tools.push({t: 'line', a: pivot, b: tip, r: .025}, {t: 'line', a: tip, b: an, r: .02}, {t: 'plate', p: tip, n: V3(1, 0, 0), r: .12});
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
  M.thrust = o => ({seg: 1300, view: [70, 12], build(k, g) { if (o.smith) smithRails(k, g, .25); if (o.machine || o.band) sides.forEach(([s, sg]) => k.post(g, k.V3(sg * .55, .04, -.4), k.V3(sg * .55, .04, .8), .04)); if (!o.floor) { const V3 = k.V3; k.pad(g, V3(0, .42, -.12), V3(0, .42, -.6), .9, .1); k.post(g, V3(0, 0, -.35), V3(0, .38, -.35), .05); } }, pose(k, u) {
    const V3 = k.V3, shY = o.floor ? .1 : .5, hipY = L(o.floor ? .12 : .3, shY + (o.floor ? .3 : .02), u);
    const shp = V3(0, shY, -.25), hip = V3(0, hipY, .25), up = shp.clone().sub(hip).normalize(), fwd = V3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
    k.torso(hip, up, fwd, .95);
    sides.forEach(([s, sg]) => k.leg(s, V3(sg * .18, k.ay, .62), V3(sg * .2, 1, .2), sg * 12));
    k.headTo(up.clone().addScaledVector(fwd, .6).normalize());
    const c = k.onBone('root', P.hipFront).addScaledVector(fwd, .025), tools = [];
    if (o.machine) {
      tools.push({t: 'box', p: c, s: [.50, .09, .24], c: 0x263549});
      sides.forEach(([s, sg]) => tools.push({t: 'line', a: c.clone().setX(sg * .30), b: V3(sg * .55, .10, -.15), r: .035},
        {t: 'line', a: c.clone().setX(sg * .30), b: c.clone().setX(sg * .70), r: .025}, {t: 'plate', p: c.clone().setX(sg * .62), n: V3(1, 0, 0), r: .19}));
    } else if (o.db) tools.push(db(c, V3(1, 0, 0))); else if (!o.bw) tools.push(bar(c), {t: 'line', a: c.clone().add(V3(-.15, 0, 0)), b: c.clone().add(V3(.15, 0, 0)), r: .04, c: 0x202c3a});
    if (o.bw) sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .3, .05, k.wp('root').z - .1), V3(sg, .3, .2), V3(0, -1, 0)); k.grip(s, -.1); });
    else sides.forEach(([s, sg]) => k.arm(s, V3(sg * .3, c.y + .02, c.z), V3(sg, .3, -.5), V3(0, -1, 0)));
    return {tools: o.bw ? [] : tools};
  }});
  M.pullThrough = o => ({seg: 1300, view: [75, 8], build(k, g) { stack(k, g, -1.1); }, pose(k, u) {
    const V3 = k.V3, {up, fwd} = lean(k, L(70, 0, u)); k.torso(V3(0, L(.78, .845, u), L(-.15, 0, u)), up, fwd, .6); feet(k, .26, 20); neutral(k);
    const c = shoulders(k).add(V3(0, -.54, L(-.06, .12, u)));
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .04, 0, 0)), V3(sg * .3, .2, 1), V3(-sg, 0, 0)));
    return {tools: [{t: 'cable', a: c, b: V3(0, .15, -1.05), kind: 'rope'}]};
  }});
  // a quattro zampe: mani sotto le spalle, ginocchia sotto le anche; la gamba di lavoro spinge indietro e in alto, ginocchio a 90°
  M.kickBack = o => ({seg: 1200, view: [-60, 14], build(k, g) {
    const V3 = k.V3;
    if (!o.band) stack(k, g, .95, .55);
    sides.forEach(([s, sg]) => { k.post(g, V3(sg * .28, 0, .55), V3(sg * .28, 1.15, .55), .025);
      k.post(g, V3(sg * .28, 1.15, .42), V3(sg * .28, 1.15, .66), .018); });
  }, pose(k, u) {
    if (o.cable || o.band || o.machine) {
      const V3 = k.V3, f = lean(k, 18); k.torso(V3(0, .83, -.08), f.up, f.fwd, .6); neutral(k);
      k.leg('r', V3(-.14, k.ay, -.02), V3(0, 0, 1), -5);
      const a = L(-5, 25, u) * k.RAD, dir = V3(.04, -Math.cos(a), -Math.sin(a)).normalize();
      k.legDir('l', dir, dir.clone().add(V3(0, 0, -.08)).normalize(), k.restDir('foot.l'));
      sides.forEach(([s, sg]) => k.arm(s, V3(sg * .28, 1.15, .55), V3(sg * .5, -.7, -.2), V3(0, -1, 0)));
      const ankle = k.wp('foot.l');
      if (o.machine) {
        const plate = ankle.clone().add(V3(0, -.015, -.08));
        return {tools: [{t: 'box', p: plate, s: [.18, .22, .04], c: 0x263549}, {t: 'line', a: plate, b: V3(.42, .12, .1), r: .03},
          {t: 'plate', p: plate.clone().setX(.4), n: V3(1, 0, 0), r: .13}, {t: 'line', a: plate, b: plate.clone().setX(.45), r: .025}]};
      }
      return {tools: [{t: 'box', p: ankle, s: [.09, .07, .10], c: 0x263549},
        {t: 'line', a: ankle, b: o.band ? k.wp('foot.r') : V3(.55, .12, .95), r: o.band ? .008 : .004, c: o.band ? 0xe68842 : 0x7c828a}]};
    }
    const V3 = k.V3; k.torso(V3(0, .52, -.12), V3(0, -.02, 1).normalize(), V3(0, -1, 0), .95);
    k.leg('r', V3(-.12, .1, -.55), V3(0, -1, .2), 0); k.aim('foot.r', V3(0, -.2, -1).normalize());
    const a = L(-80, 10, u) * k.RAD; k.legDir('l', V3(.05, Math.sin(a), -Math.cos(a)).normalize(), V3(0, 1, -.15).normalize(), V3(0, .3, -1).normalize());
    k.headTo(V3(0, -.1, 1).normalize());
    sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .2, .04, .42), V3(sg * .2, .3, -.6), V3(0, -1, 0)); k.grip(s, -.1); });
    return {tools: o.cable ? [{t: 'cable', a: k.wp('foot.l'), b: V3(.1, .15, -1.1), kind: 'd'}] : []};
  }});
  // polpacci: talloni sotto il livello del gradino → in punta di piedi, ginocchia ferme
  M.calf = o => ({seg: 1100, view: [70, 8], build(k, g) { const V3 = k.V3; if (o.smith) smithRails(k, g, o.donkey ? -.1 : -.03); g.add(k.box(.6, .08, .25, k.mat(0x3a3d44, .8), V3(0, .04, .1))); if (o.seat) { seat(k, g, .45, -.3); k.post(g, V3(.38, 0, .25), V3(.38, .55, .25), .035); } if (o.machine && !o.seat) { sides.forEach(([s, sg]) => { k.post(g, V3(sg * .45, 0, -.2), V3(sg * .45, 1.95, -.2), .035); k.post(g, V3(sg * .45, .03, -.35), V3(sg * .45, .03, .35), .04); }); k.post(g, V3(-.45, 1.95, -.2), V3(.45, 1.95, -.2), .03); } if (o.donkey) { k.pad(g, V3(0, 1.0, .5), V3(0, 1.0, .9), .5, .08); k.post(g, V3(0, 0, .7), V3(0, .96, .7), .04); } }, pose(k, u) {
    const V3 = k.V3, pitch = L(-15, 38, u), toeOffset = V3(...k.JR['toe.l']).sub(V3(...k.JR['ankle.l'])).applyAxisAngle(V3(1, 0, 0), pitch * k.RAD), ankleY = .10 - toeOffset.y, footZ = .21 - toeOffset.z, rise = ankleY - k.ay - .08, tools = [];
    if (o.seat) { const f = sit(k, .45, -.3, -2, .1, .14); sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .14, ankleY, footZ), V3(0, .3, 1), 0); tiptoe(k, s, pitch); }); k.headTo(f.up.clone());
      const kn = k.wp('shin.l').lerp(k.wp('shin.r'), .5).add(V3(0, .06, 0));
      if (o.db) { sides.forEach(([side, sg]) => { const p = k.wp('shin.' + side).add(V3(0, .09, -.02)); k.arm(side, p, V3(sg, -.2, .3), V3(0, -1, 0)); tools.push(db(p, V3(1, 0, 0))); }); return {tools}; }
      tools.push({t: 'line', a: kn.clone().add(V3(-.25, 0, 0)), b: kn.clone().add(V3(.25, 0, 0)), r: .04, c: 0x2a2d33});
      tools.push({t: 'line', a: kn.clone().setX(.38), b: V3(.38, .55, .25), r: .025}, {t: 'line', a: kn, b: kn.clone().setX(.48), r: .02}, {t: 'plate', p: kn.clone().setX(.42), n: V3(1, 0, 0), r: .15}); sides.forEach(([s, sg]) => k.arm(s, kn.clone().add(V3(sg * .26, .02, 0)), V3(sg, 0, -.3), V3(0, -1, 0))); return {tools}; }
    const lu = o.donkey ? 85 : 0, f = lean(k, lu); k.torso(V3(0, .845 + rise + .08, o.donkey ? -.1 : .08), f.up, f.fwd, o.donkey ? .6 : .5);
    sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, ankleY, footZ), V3(0, 0, 1), sg * 5); tiptoe(k, s, pitch); });
    neutral(k);
    if (o.donkey) sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .22, 1.04, .62), V3(sg, .2, -.3), V3(0, -1, 0)); });
    else { sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, -1, .02).normalize(), V3(sg * .05, -1, .03).normalize(), V3(-sg, 0, 0), o.db ? 1 : .3)); if (o.db) sides.forEach(([s]) => tools.push(db(fist(k, s), V3(0, 0, 1)))); }
    if (o.smith) {
      const c = o.donkey ? k.wp('root').add(V3(0, .13, 0)) : k.onBone('spine3', P.traps);
      if (!o.donkey) sides.forEach(([s, sg]) => k.arm(s, c.clone().setX(sg * .29), V3(sg * .4, -1, -.5), V3(0, 0, 1)));
      tools.push(bar(c), ...(o.donkey ? [{t: 'line', a: c.clone().setX(-.16), b: c.clone().setX(.16), r: .05, c: 0x263549}] : []));
    }
    if (o.machine && !o.seat) {
      const c = o.donkey ? k.onBone('root', [0, .94, -.12]) : k.onBone('spine3', P.traps);
      sides.forEach(([s, sg]) => tools.push({t: 'box', p: c.clone().add(V3(sg * .18, .04, 0)), s: [.16, .08, .25], c: 0x263549}, {t: 'line', a: c.clone().add(V3(sg * .18, .09, 0)), b: V3(sg * .45, c.y + .09, -.2), r: .025}, {t: 'plate', p: V3(sg * .50, c.y + .09, -.2), n: V3(1, 0, 0), r: .16}));
    }
    return {tools};
  }});
  M.tibialis = o => ({seg: 1000, view: [80, 8], build(k, g) { const V3 = k.V3; g.add(k.box(1.2, 2.2, .06, k.mat(0xd5d8de, .9), V3(0, 1.1, -.34))); }, pose(k, u) {
    const V3 = k.V3, f = lean(k, -12); k.torso(V3(0, .82, -.12), f.up, f.fwd, .5);
    sides.forEach(([s, sg]) => { k.leg(s, V3(sg * .12, k.ay, .25), V3(0, 0, 1), sg * 5); tiptoe(k, s, L(0, -28, u)); });
    neutral(k); sides.forEach(([s, sg]) => k.armDir(s, V3(sg * .1, -1, -.05).normalize(), V3(sg * .05, -1, 0).normalize(), V3(-sg, 0, 0), .3));
    return {tools: []};
  }});

  // ---------- aiuti per terra, ginocchio, fasi ----------
  const ease = t => gease(t);
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
    plankLine(k, .33 + br, -.85, o.suspension ? .3 : .1); k.headTo(V3(0, .3, 1).normalize());
    const sh = shoulders(k); sides.forEach(([s, sg]) => { k.arm(s, V3(sg * .1, .05, sh.z + .28), V3(sg * .2, -1, -.3), V3(-sg * .5, -1, 0).normalize()); k.grip(s, .4); });
    return {tools: []};
  }});
  M.crunch = o => ({seg: 1100, view: [70, 16], build(k, g) {
    if (o.machine) { seat(k, g, .46, 0, .55); stack(k, g, -.35, -.65); k.post(g, k.V3(.4, 0, 0), k.V3(.4, .9, 0), .035); }
  }, pose(k, u) {
    if (o.machine) {
      const V3 = k.V3; sit(k, .46, 0, L(-5, 15, u), .48); curlUp(k, L(0, 28, u)); neutral(k);
      const c = k.onBone('spine3', P.sternum).add(V3(0, 0, .07));
      sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .2, .04, .02)), V3(sg * .4, -.5, .4), V3(0, -1, 0)));
      return {tools: [{t: 'line', a: c.clone().setX(-.28), b: c.clone().setX(.28), r: .06, c: 0x263549},
        {t: 'line', a: c.clone().setX(.28), b: V3(.4, .9, 0), r: .03}]};
    }
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
    curlUp(k, L(5, 55, u)); k.worldDelta('spine1', Q(k, V3(1, 0, 0), L(5, 20, u)));
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
    const sh = shoulders(k), wz = sh.z + Math.sqrt(Math.max(.01, .56 * .56 - (sh.y - .12) ** 2)), w = V3(0, .1, wz);
    if (o.suspension) {
      // Intersect a fixed-length strap with the arm's reach circle.
      const anchor = V3(0, 2.25, 1.1), delta = anchor.clone().sub(sh).setX(0), d = delta.length(), axis = delta.divideScalar(d);
      const r = .56, length = 1.95, along = (r * r - length * length + d * d) / (2 * d), height = Math.sqrt(Math.max(0, r * r - along * along));
      w.copy(sh).addScaledVector(axis, along).addScaledVector(V3(0, -axis.z, axis.y), height);
      sides.forEach(([s, sg]) => k.arm(s, w.clone().setX(sg * .12), V3(sg * .3, -.5, -.3), V3(0, -1, 0)));
      return {tools: [], strapLength: Math.sqrt(length * length + .08 * .08)};
    }
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
    return {tools: o.bw ? [] : [o.db ? db(c, V3(1, 0, 0)) : o.kb ? {t: 'kb', p: c, down: V3(0, -1, 0)} : {t: 'plate', p: c, n: V3(1, 0, 0).applyAxisAngle(V3(0, 1, 0), r * k.RAD), r: .14}]};
  }});
  M.chop = o => ({seg: 1300, view: [25, 8], build(k, g) { stack(k, g, -.1, 1.1); }, pose(k, u) {
    const V3 = k.V3, hi = V3(.32, 1.57, .38), lo = V3(-.28, .90, .40), a = o.low ? lo : hi, b = o.low ? hi : lo, c = a.clone().lerp(b, u);
    const f = lean(k, L(o.low ? 25 : 0, o.low ? 0 : 25, u)); k.torso(V3(0, L(o.low ? .76 : .84, o.low ? .84 : .76, u), 0), f.up, f.fwd, .5);
    const rot = (c.x > 0 ? 1 : -1) * Math.min(40, Math.abs(c.x) * 55); k.worldDelta('spine2', Q(k, k.curDir('spine2'), rot * .5)); k.worldDelta('spine3', Q(k, k.curDir('spine3'), rot * .5));
    feet(k, .22, 15); neutral(k);
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(0, sg * .03, 0)), V3(sg, -.5, -.3), V3(0, 0, 1)));
    return {tools: o.db ? [db(c, V3(0, 1, 0))] : [{t: o.band ? 'line' : 'cable', a: c, b: o.low ? V3(1.1, .15, -.1) : V3(1.1, 2.1, -.1), kind: 'd', r: .007, c: 0xe0592b}]};
  }});
  M.landmineRot = o => ({seg: 1500, cyc: true, view: [45, 10], pose(k, u) {
    const V3 = k.V3, f = lean(k, 8); k.torso(V3(0, .8, 0), f.up, f.fwd, .5); feet(k, .22, 15); neutral(k);
    const a = Math.sin(u * 2 * Math.PI), sh = shoulders(k), c = V3(a * .45, sh.y + .12 - Math.abs(a) * .3, sh.z + .45);
    k.worldDelta('spine2', Q(k, k.curDir('spine2'), a * 22)); k.worldDelta('spine3', Q(k, k.curDir('spine3'), a * 18));
    sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .03, 0, 0)), V3(sg, -.6, 0), V3(-sg, 0, 0)));
    return {tools: [{t: 'line', a: V3(0, .04, 1.6), b: c, r: .016}, {t: 'plate', p: c.clone().add(V3(0, .06, -.1)), n: c.clone().sub(V3(0, .04, 1.6)).normalize(), r: .16}]};
  }});
  // dead bug: schiena a terra, braccia verso il soffitto, anche e ginocchia a 90° (tibie parallele al pavimento);
  // si allungano braccio e gamba opposti fin quasi a terra, si torna e si cambia lato
  M.deadBug = o => ({seg: 1500, cyc: true, view: [60, 22], build(k, g) {
    if (o.band) { k.post(g, k.V3(-.4, .05, -1.2), k.V3(.4, .05, -1.2), .04); k.post(g, k.V3(0, .05, -1.2), k.V3(0, .5, -1.2), .03); }
  }, pose(k, u) {
    const V3 = k.V3; floorBack(k, .1, false);
    const [i, t] = phase(u, 4), e = [t, 1 - t, 0, 0][i], e2 = [0, 0, t, 1 - t][i];     // e: braccio sx + gamba dx, e2: braccio dx + gamba sx
    const legOf = x => ({th: V3(0, 1, 0).lerp(V3(0, .22, 1).normalize(), x).normalize(), sh: V3(0, 0, 1).lerp(V3(0, .2, 1).normalize(), x).normalize()});
    const armOf = x => V3(0, 1, 0).lerp(V3(0, .15, -1).normalize(), x).normalize();
    [['l', 1, e2], ['r', -1, e]].forEach(([s, sg, x]) => { const L2 = legOf(x); k.legDir(s, L2.th.clone().add(V3(sg * .03, 0, 0)).normalize(), L2.sh, V3(0, .3, 1).normalize()); });
    [['l', 1, e], ['r', -1, e2]].forEach(([s, sg, x]) => { const d = armOf(x).add(V3(sg * .06, 0, 0)).normalize(); k.armDir(s, d, d, V3(-sg, 0, 0), .3); });
    k.headTo(V3(0, .1, -1).normalize());
    if (o.kb || o.band) {
      const c = shoulders(k).add(V3(0, .59, .02));
      sides.forEach(([s, sg]) => k.arm(s, c.clone().add(V3(sg * .06, 0, 0)), V3(sg, .3, 0), V3(-sg, 0, 0)));
      return {tools: o.kb ? [{t: 'kb', p: c, down: V3(0, 1, 0)}] : sides.map(([s]) => ({t: 'line', a: fist(k, s), b: V3(0, .5, -1.2), r: .008, c: 0xe68842}))};
    }
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
  M.climber = o => ({seg: 1400, cyc: true, view: [70, 14], pose(k, u) {
    const V3 = k.V3, {dir} = plankLine(k, o.suspension ? .56 : .51, -.85, o.suspension ? .3 : .1); k.headTo(dir.clone().add(V3(0, -.2, .2)).normalize());
    const sh = shoulders(k);
    sides.forEach(([s, sg], i) => {
      k.arm(s, V3(sg * .22, .05, sh.z + .04), V3(sg * .5, .5, -.6), V3(0, -1, 0)); k.grip(s, 0);
      const t = (1 - Math.cos((u + i * .5) * Math.PI * 2)) / 2;
      const ankle = V3(sg * .14, L(.10, .16, t), L(-.85, -.10, t));
      if (o.suspension) ankle.y = 2.25 - Math.sqrt(1.96 * 1.96 - (ankle.z + 1) ** 2);
      // Solve from a fixed floor anchor to the tucked foot, with one knee bend plane.
      k.leg(s, ankle, V3(sg * .15, -1, .7), sg * 5);
      k.aim('foot.' + s, V3(0, -.8, -.6).lerp(V3(0, -.2, -1), t).normalize());
    }); return {tools: []};
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
    if (o.db || o.twist) ps.forEach((p, i) => tools.push(db(p, k.curDir('hand.' + ['l', 'r'][i]).cross(o.twist ? V3((i ? 1 : -1) * Math.cos(u * Math.PI), Math.sin(u * Math.PI), 0) : V3(0, 1, 0)).normalize()))); else tools.push(bar(mid(ps[0], ps[1]), .7, .16));
    return {tools};
  }});
  M.wristRoller = o => ({seg: 1200, cyc: true, view: [40, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 0); k.torso(V3(0, .845, 0), f.up, f.fwd, .5); feet(k, .14, 10); neutral(k);
    const sh = shoulders(k), c = V3(0, sh.y - .02, sh.z + .5), w = Math.sin(u * 2 * Math.PI) * 35;
    sides.forEach(([s, sg]) => { k.arm(s, c.clone().add(V3(sg * .15, 0, 0)), V3(sg * .3, -1, 0), V3(0, -1, 0)); k.worldDelta('hand.' + s, Q(k, V3(1, 0, 0), (s === 'l' ? w : -w))); });
    const rope = L(.7, .35, (1 - Math.cos(u * Math.PI * 2)) / 2);
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
  // Continuous checkpoints: the hands stay on the same bar through pull, turnover and rack.
  function sampleKeys(keys, u) {
    const x = Math.max(0, Math.min(1, u));
    let i = 0; while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], t = gease((x - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((v, j) => L(v, b[j + 1], t));
  }
  // columns: time, shoulder height/z, torso lean, bar height/z, elbow pole x/y/z, palm rotation, stance
  function olympicPose(k, values, width) {
    const [sy, sz, lu, by, bz, px, py, pz, palm, stance] = values, V3 = k.V3, f = lean(k, lu);
    k.torso(V3(0, .8, 0), f.up, f.fwd, .6);
    const sh = shoulders(k); k.shift(V3(0, sy - sh.y, sz - sh.z));
    feet(k, stance, 15); neutral(k);
    const c = V3(0, by, bz), pn = V3(0, Math.sin(palm), -Math.cos(palm));
    // Explicit wrist checkpoints keep IK on one solution through the turnover.
    // Blending the wrist against the solved forearm created an unstable feedback loop.
    const wristAngle = palm <= Math.PI / 2 ? palm * .63 : L(Math.PI * .315, Math.PI, (palm - Math.PI / 2) / (Math.PI / 2));
    sides.forEach(([side, sg]) => hold(k, side, c.clone().add(V3(sg * width, 0, 0)), V3(sg * px, py, pz), pn, {dir: V3(0, -Math.cos(wristAngle), Math.sin(wristAngle))}));
    return {tools: [bar(c)]};
  }
  M.clean = o => ({seg: 1400, cyc: true, view: [45, 10], pose(k, u) {
    if (u <= .22) return M.deadlift({}).pose(k, gease(u / .22));
    const downStart = o.press ? .91 : .86;
    if (u >= downStart) return M.deadlift({}).pose(k, 1 - gease((u - downStart) / (1 - downStart)));
    const reach = k.LEN.ua + k.LEN.fa + .055, dy = dz => Math.sqrt(reach * reach - .072 * .072 - dz * dz);
    const floor = [.225 + dy(.03), .10, 60, .225, .07, .3, .3, -1, 0, .14];
    const hang = [.805 + dy(-.14), -.07, 0, .805, .07, .3, .3, -1, 0, .12];
    const rack = [1.37, -.04, 3, 1.435, .07, .35, -.4, 1, Math.PI / 2, .17];
    const keys = [[0, ...floor], [.22, ...hang],
      [.32, 1.42, -.05, -2, .94, .15, .9, .5, -.15, .15, .15],
      [.43, 1.32, -.04, 5, 1.27, .17, .7, -.4, 1, 1.1, .17],
      [.52, 1.21, -.04, 8, 1.275, .07, .35, -.4, 1, Math.PI / 2, .17],
      [.64, ...rack]];
    if (o.press) keys.push([.70, ...rack], [.78, 1.37, .08, 0, 1.98, .07, .5, -.5, .3, Math.PI, .17], [.84, ...rack]);
    else keys.push([.72, ...rack]);
    keys.push([o.press ? .86 : .75, 1.37, -.04, 3, 1.47, .20, .5, -.2, .7, 1.1, .17],
      [o.press ? .885 : .80, 1.37, -.04, 3, 1.20, .20, .5, -.5, .4, .3, .15]);
    keys.push([o.press ? .91 : .86, ...hang], [1, ...floor]);
    return olympicPose(k, sampleKeys(keys, u), .23);
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
  M.snatch = o => ({seg: 1500, cyc: true, view: [45, 10], pose(k, u) {
    const reach = k.LEN.ua + k.LEN.fa + .055, dy = dz => Math.sqrt(reach * reach - .072 * .072 - dz * dz);
    const floor = [.12 + dy(.03), .10, 68, .12, .14, .6, .2, -.6, 0, .18];
    const hang = [.805 + dy(-.14), -.07, 0, .805, .14, .6, .2, -.6, 0, .18];
    const top = [1.37, .02, 0, 1.98, .04, 1, -.3, .1, Math.PI, .20];
    olympicPose(k, sampleKeys([[0, ...floor], [.23, ...hang],
      [.34, 1.40, -.04, -2, 1.12, .20, 1, .6, .2, .3, .18],
      [.48, 1.16, .02, 10, 1.77, .10, 1, -.3, .1, Math.PI, .20],
      [.63, ...top], [.71, ...top], [.79, 1.37, -.04, 3, 1.25, .25, .6, -.3, .5, .3, .18], [.86, ...hang], [1, ...floor]], u), .23);
    // Both library variants are a ONE-arm snatch, not a wide two-arm barbell snatch.
    const V3 = k.V3; k.armDir('r', V3(-.3, -1, .1).normalize(), V3(-.15, -1, .1).normalize(), V3(1, 0, 0), .2);
    return {tools: [o.kb ? {t: 'kb', p: fist(k, 'l'), down: V3(0, -1, -.4).normalize()} : db(fist(k, 'l'), V3(1, 0, 0))]};
  }});
  M.swing = o => ({seg: 900, view: [80, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, L(62, -2, u)); k.torso(V3(0, L(.76, .845, u), L(-.16, 0, u)), f.up, f.fwd, .6); feet(k, .22, 18); neutral(k);
    const sh = shoulders(k), a = L(-25, 92, u) * k.RAD, c = sh.clone().add(V3(0, -Math.cos(a) * .64, Math.sin(a) * .64));
    sides.forEach(([s, sg]) => hold(k, s, c.clone().add(V3(sg * .035, 0, 0)), V3(sg * .2, -.3, -1), V3(-sg, 0, 0)));
    return {tools: [o.db ? db(c.clone().addScaledVector(V3(0, -Math.cos(a), Math.sin(a)), .06), V3(0, -Math.cos(a), Math.sin(a))) : {t: 'kb', p: c, down: V3(0, -Math.cos(a), Math.sin(a))}]};
  }});
  M.getUp = o => ({seg: 1300, duration: 18000, view: [45, 18], pose(k, u) {
    // Supine → elbow → palm → bridge → leg sweep → half kneeling → standing.
    // The ordinary forward/return timeline retraces the same supported checkpoints.
    const V3 = k.V3;
    const [hy, hz, lu, roll, hx, rightZ, rightY, handY, handZ, sweep] = sampleKeys([
      [0, .12, .05, -88, 0, 0, .74, .09, .045, -.30, 0],
      [.15, .16, .05, -65, 22, -.04, .74, .09, .045, -.30, 0],
      [.30, .23, .05, -40, 25, -.07, .74, .09, .045, -.30, 0],
      [.43, .38, .02, -48, 26, -.06, .68, .16, .045, -.30, 0],
      [.57, .40, .02, -64, 30, -.06, -.40, .095, .045, -.30, 1],
      [.72, .48, .02, 0, 0, 0, -.40, .095, .43, -.02, 1],
      [.88, .84, .02, 0, 0, 0, -.35, .15, .80, .02, 1],
      [1, .845, .02, 0, 0, 0, .02, .095, .80, .02, 1]], u);
    const f = lean(k, lu), q = Q(k, V3(0, 0, 1), roll);
    f.up.applyQuaternion(q); f.fwd.applyQuaternion(q);
    k.torso(V3(hx, hy, hz), f.up, f.fwd, .8);
    k.leg('l', V3(.16, k.ay, L(.45, .02, gease(Math.max(0, (u - .88) / .12)))), V3(.1, 1, .6), 8);
    const rightX = L(-.32, -.14, sweep);
    k.leg('r', V3(rightX, rightY, rightZ), V3(-.05, L(1, -3, sweep), .5), -10);
    if (sweep > .9 && u < .82) k.aim('foot.r', V3(0, -.15, -1).normalize());
    const sh = k.wp('uarm.l');
    k.armDir('l', V3(0, 1, 0), V3(0, 1, 0), V3(0, 0, 1), 1);
    const support = V3(L(-.43, -.25, gease(Math.max(0, (u - .57) / .15))), handY, handZ);
    k.arm('r', support, V3(-1, -.2, .1), V3(0, -1, 0)); k.grip('r', 0);
    k.headTo(f.up.clone().lerp(V3(.3, 1, 0), .3).normalize());
    return {tools: [o.db ? db(fist(k, 'l'), V3(1, 0, 0)) : {t: 'kb', p: fist(k, 'l'), down: V3(0, -.3, -1).normalize()}]};
  }});
  M.carry = o => ({seg: 1100, cyc: true, view: [40, 6], pose(k, u) {
    const V3 = k.V3, f = lean(k, 2), bob = Math.abs(Math.sin(u * 2 * Math.PI)) * .015;
    k.torso(V3(0, .835 + bob, 0), f.up, f.fwd, .5); walk(k, u); neutral(k);
    const tools = [];
    sides.forEach(([s, sg]) => { const w = o.both || s === 'l'; k.armDir(s, V3(sg * (w ? .1 : .14), -1, Math.sin((u + (s === 'l' ? .5 : 0)) * 2 * Math.PI) * (w ? .02 : .2)).normalize(), V3(sg * .06, -1, .03).normalize(), V3(-sg, 0, 0), w ? 1 : .3); if (w) tools.push(o.trap ? {t: 'box', p: fist(k, s), s: [.05, .05, .25]} : o.kb ? {t: 'kb', p: fist(k, s), down: V3(0, -1, 0)} : db(fist(k, s), V3(0, 0, 1))); });
    if (o.trap) {
      const c = mid(fist(k, 'l'), fist(k, 'r'));
      sides.forEach(([s, sg]) => k.arm(s, c.clone().setX(sg * .28), V3(sg * .5, .1, -1), V3(-sg, 0, 0)));
      tools.length = 0; tools.push({t: 'trap', c});
    }
    if (!o.both) shrug(k, -2);
    return {tools};
  }});
  M.burpee = o => ({seg: 1400, cyc: true, view: [70, 12], pose(k, u) {
    // hip height/z, torso lean, foot height/z, hand height/z: no branch can teleport a limb.
    const V3 = k.V3, values = sampleKeys([
      [0, .845, 0, 3, k.ay, 0, .74, .08],
      [.16, .36, -.12, 65, k.ay, 0, .05, .42],
      [.28, .385, -.14, 68, k.ay, -.85, .05, .42],
      [.40, .16, -.09, 85, k.ay, -.85, .05, .42],
      [.52, .385, -.14, 68, k.ay, -.85, .05, .42],
      [.65, .36, -.12, 65, k.ay, 0, .05, .42],
      [.78, .82, 0, 6, k.ay, 0, 1.2, .40],
      [.88, 1.0, 0, 0, k.ay + .16, 0, 1.98, .08],
      [1, .845, 0, 3, k.ay, 0, .74, .08]], u);
    const [hy, hz, lu, ay, az, wy, wz] = values, f = lean(k, lu);
    k.torso(V3(0, hy, hz), f.up, f.fwd, .8);
    sides.forEach(([side, sg]) => { k.leg(side, V3(sg * .15, ay, az), V3(sg * .15, 0, 1), sg * 10);
      k.arm(side, V3(sg * .22, wy, wz), V3(sg * .6, .3, -.6), wy < .1 ? V3(0, -1, 0) : V3(-sg, 0, 0)); k.grip(side, 0); });
    neutral(k); return {tools: []};
  }});
  M.sled = o => ({seg: 1000, cyc: true, view: [60, 8], pose(k, u) {
    const V3 = k.V3, f = lean(k, 50); k.torso(V3(0, .72, -.15), f.up, f.fwd, .6); walk(k, u, .5, .09, .13); k.headTo(f.up.clone().lerp(V3(0, 0, 1), .5).normalize());
    const sh = shoulders(k); sides.forEach(([s, sg]) => k.arm(s, V3(sg * .25, sh.y - .08, sh.z + .48), V3(sg, -.5, -.2), V3(0, 0, 1)));
    const c = V3(0, .12, sh.z + .75), tools = [{t: 'box', p: c, s: [.65, .08, .65], c: 0x354252}, {t: 'line', a: c, b: c.clone().add(V3(0, .5, 0)), r: .025}];
    [.18, .24, .30].forEach(y => tools.push({t: 'plate', p: c.clone().setY(y), n: V3(0, 1, 0), r: .22}));
    sides.forEach(([s, sg]) => tools.push({t: 'box', p: c.clone().add(V3(sg * .28, -.07, 0)), s: [.10, .10, .8]}, {t: 'line', a: c.clone().add(V3(sg * .25, 0, -.2)), b: V3(sg * .25, sh.y - .08, sh.z + .48), r: .025}));
    return {tools};
  }});
  M.ropes = o => ({seg: 500, cyc: true, view: [35, 10], pose(k, u) {
    const V3 = k.V3, f = lean(k, 20); k.torso(V3(0, .7, -.05), f.up, f.fwd, .55); feet(k, .24, 18); neutral(k);
    const tools = [];
    sides.forEach(([s, sg], i) => { const t = Math.sin((u + i * .5) * 2 * Math.PI), sh = k.wp('uarm.' + s), p = V3(sg * .2, sh.y - .3 + t * .22, sh.z + .4);
      k.arm(s, p, V3(sg * .3, -1, -.3), V3(-sg, 0, 0));
      let previous = p;
      for (let j = 1; j <= 24; j++) { const v = j / 24, next = V3(sg * .2, Math.max(.035, L(p.y, .045, v) + .16 * Math.sin(v * Math.PI * 4 - u * Math.PI * 2 + i * Math.PI) * Math.sin(v * Math.PI)), p.z + v * 1.8); tools.push({t: 'line', a: previous, b: next, r: .018, c: 0x485461}); previous = next; } });
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
    'biceps.zottmanCurl': ['curl', {zottman: 1}, ['dumbbell']], 'biceps.dragCurl': ['curl', {drag: 1}, ['barbell', 'ezbar']], 'forearms.reverseCurl': ['curl', {grip: 'pro'}, ['barbell', 'ezbar', 'dumbbell', 'cable']],
    'triceps.pushdown': ['pushdown', {}, ['cable']],
    'shoulders.lateralRaise': ['raise', {}, ['dumbbell', 'cable', 'band']], 'shoulders.frontRaise': ['raise', {front: 1}, ['dumbbell', 'barbell', 'plate', 'cable']],
    'shoulders.reverseFly': ['raise', {rev: 1}, ['dumbbell', 'cable', 'machine']], 'shoulders.yRaise': ['raise', {y: 1}, ['dumbbell', 'cable', 'band']],
    'chest.pushUp': ['pushup', {}, ['bodyweight']], 'triceps.diamondPushUp': ['pushup', {diamond: 1}, ['bodyweight']],
    'biceps.inclineCurl': ['curlIncl'], 'biceps.preacherCurl': ['curlPreacher'], 'biceps.concentrationCurl': ['curlConc'], 'biceps.spiderCurl': ['curlSpider'],
    'triceps.dip': ['dip'], 'triceps.benchDip': ['benchDip'], 'triceps.skullCrusher': ['skull'], 'triceps.overheadExtension': ['overheadExt'], 'triceps.kickback': ['kickback'], 'triceps.machineExtension': ['machineExt'],
    'back.straightArmPulldown': ['straightArm'], 'back.oneArmRow': ['row1'], 'back.chestSupportedRow': ['rowChest'], 'back.seatedCableRow': ['rowSeat'], 'back.machineRow': ['rowSeat', {pad: 1}],
    'back.invertedRow': ['invRow'], 'back.shrug': ['shrug'], 'back.backExtension': ['backExt'], 'back.reverseHyper': ['revHyper'],
    'shoulders.facePull': ['facePull'], 'shoulders.uprightRow': ['uprightRow'], 'shoulders.cubanPress': ['cuban'], 'shoulders.pikePushUp': ['pike'], 'shoulders.handstandPushUp': ['hspu'],
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
    if (eq === 'band') { o.band = 1; o.cable = 1; }
    if (eq === 'machine') o.machine = 1;
    if (eq === 'suspension') o.suspension = 1;
    if ((o.cable || o.band) && m[0] === 'ohp') o.machine = 0;
    if (baseId === 'triceps.pushdown') o.rope = 1;
    if (m[0] === 'overheadExt' && (o.machine || o.ez)) o.seat = 1;
    if (baseId === 'core.hangingRaise' && eq === 'machine') o.knees = 1;
    if (baseId === 'core.woodchopper' && eq === 'dumbbell') o.low = 1;
    if (baseId === 'quads.lunge' && eq === 'barbell') o.hold = 'back';
    if (['quads.lunge', 'quads.bulgarianSplitSquat', 'quads.stepUp'].includes(baseId) && ['barbell', 'smith'].includes(eq)) o.hold = 'back';
    if (baseId === 'back.rackPull' && o.trap) o.kind = 'trap';
    const mv = o.suspension && ['raise', 'facePull'].includes(m[0]) ? M.suspensionUpper({...o, mode: m[0]}) : M[m[0]](o);
    if (o.suspension && m[0] === 'pushup') mv.anchorZ = -.9;
    if (o.suspension && m[0] === 'abWheel') mv.anchorZ = 1.1;
    // Complex sequences need time for every phase, not the duration of a single repetition.
    const steps = {clean: o.press ? 5 : 4, pushPress: 3, snatch: 4, burpee: 5, deadBug: 4};
    if (steps[m[0]]) mv.duration = mv.seg * steps[m[0]] * 1.35;
    if (['plank', 'hollow', 'hang', 'pinch', 'wallSit'].includes(m[0])) mv.hold = true;
    // se l'attrezzo scelto e' un manubrio o un kettlebell ma lo schema disegna un bilanciere: uno per mano
    if ((o.db || o.kb) && mv.pose) {
      const p0 = mv.pose;
      mv.pose = (k, u) => {
        const r = p0(k, u) || {};
        if (r.tools && r.tools.some(t => t.t === 'bar')) {
          r.tools = r.tools.filter(t => t.t !== 'bar').concat(sides.map(([s]) => o.kb ? {t: 'kb', p: fist(k, s), down: k.curDir('hand.' + s)} : db(fist(k, s), k.V3(1, 0, 0))));
        }
        if (o.kb && r.tools) r.tools = r.tools.map(t => t.t === 'db' ? {t: 'kb', p: t.p, down: k.V3(0, -1, -.25).normalize()} : t);
        return r;
      };
    }
    const originalPose = mv.pose, originalBuild = mv.build;
    mv.pose = (k, u) => {
      const V3 = k.V3, result = originalPose(k, u) || {}, tools = result.tools || [];
      let gear = tools;
      if (o.band && m[0] === 'pushup') {
        const back = sides.map(([s, sg]) => k.onBone('spine3', [sg * .18, 1.35, -.15]));
        gear.push({t: 'line', a: back[0], b: back[1], r: .012, c: 0xe68842});
        sides.forEach(([s], i) => gear.push({t: 'line', a: back[i], b: fist(k, s), r: .012, c: 0xe68842}));
      }
      if (o.band && m[0] === 'thrust') {
        gear = gear.filter(t => !['bar', 'db', 'line'].includes(t.t));
        const hip = k.onBone('root', P.hipFront);
        gear.push({t: 'line', a: hip.clone().setX(-.24), b: hip.clone().setX(.24), r: .02, c: 0xe68842});
        sides.forEach(([s, sg]) => gear.push({t: 'line', a: hip.clone().setX(sg * .24), b: V3(sg * .60, .04, hip.z), r: .012, c: 0xe68842}));
      }
      if (o.band && m[0] === 'nordic') {
        const c = k.onBone('spine3', P.sternum).add(V3(0, 0, .04));
        sides.forEach(([s, sg]) => gear.push({t: 'line', a: c.clone().setX(sg * .12), b: V3(0, 1.5, -.75), r: .012, c: 0xe68842}));
      }
      // Some older variants shared a pose but accidentally kept the wrong prop.
      if ((o.cable || o.band) && !gear.some(t => t.t === 'cable') && gear.some(t => ['bar', 'db'].includes(t.t))) {
        let anchor = V3(0, .12, .85);
        if (m[0] === 'pullover' || m[0] === 'skull') anchor = V3(0, .25, -1.15);
        if (m[0] === 'ohp' || m[0] === 'overheadExt') anchor = V3(0, .12, -.6);
        if (m[0] === 'row1') anchor = V3(.2, .4, 1);
        const one = ['row1', 'curlConc'].includes(m[0]);
        const ps = (one ? ['l'] : ['l', 'r']).map(side => fist(k, side));
        gear = gear.filter(t => !['bar', 'db'].includes(t.t));
        const c = one ? ps[0] : mid(ps[0], ps[1]);
        if (m[0] === 'ohp') ps.forEach(p => gear.push({t: 'cable', a: p, b: V3(p.x > 0 ? .45 : -.45, .12, -.35), kind: 'd'}));
        else gear.push({t: 'cable', a: c, b: anchor, kind: o.grip === 'neu' || m[0] === 'overheadExt' ? 'rope' : one ? 'd' : 'bar', grips: one ? undefined : ps});
      }
      if (o.band) gear = gear.flatMap(t => {
        if (t.t !== 'cable') return [t];
        const anchorsUnderFeet = ['curl', 'raise', 'ohp', 'cuban', 'uprightRow'].includes(m[0]);
        return (t.grips || [t.a]).map(p => ({t: 'line', a: p, b: anchorsUnderFeet ? V3(p.x > 0 ? .14 : -.14, .03, .02) : t.b, r: .007, c: 0xe68842}));
      });
      if (o.ez) gear = gear.map(t => t.t === 'bar' ? {...t, ez: true} : t);
      if (o.plate && !gear.some(t => t.t === 'plate')) {
        const back = ['pushup', 'plank'].includes(m[0]), hanging = ['pull', 'hang', 'dip'].includes(m[0]);
        const p = hanging ? mid(k.wp('thigh.l'), k.wp('thigh.r')).add(V3(0, -.18, .12)) :
          back ? k.onBone('spine2', [0, 1.22, -.14]) : k.onBone('spine3', [0, 1.33, .18]);
        const normal = k.onBone('spine3', [0, 1.33, .3]).sub(k.onBone('spine3', [0, 1.33, 0])).normalize();
        gear.push({t: 'plate', p, n: hanging ? V3(0, 0, 1) : back ? normal.clone().negate() : normal, r: .15});
        if (!back && !hanging) sides.forEach(([side, sg]) => k.arm(side, p.clone().add(V3(sg * .14, 0, 0)), V3(sg, -.5, 0), V3(-sg, 0, 0)));
        if (hanging) sides.forEach(([side, sg]) => gear.push({t: 'line', a: k.wp('root').add(V3(sg * .1, 0, .12)), b: p, r: .008, c: 0x202c3a}));
      }
      if (o.db && m[0] === 'plank' && o.side) gear.push(db(fist(k, 'l'), V3(1, 0, 0)));
      if (o.suspension) {
        gear = gear.filter(t => !['bar', 'db', 'cable'].includes(t.t));
        const feetInStraps = ['plank', 'climber'].includes(m[0]);
        sides.forEach(([side, sg]) => {
          const p = feetInStraps ? k.wp('foot.' + side) : fist(k, side), anchor = V3(sg * .2, 2.25, feetInStraps ? -1 : mv.anchorZ ?? .45);
          gear.push({t: 'line', a: p, b: anchor, r: .009, c: 0xe68842},
            {t: 'line', a: p.clone().add(V3(-.06, 0, 0)), b: p.clone().add(V3(.06, 0, 0)), r: .018, c: 0x202c3a});
        });
      }
      return {...result, tools: gear};
    };
    mv.build = (k, g) => {
      const onlyCableFrame = ['curl', 'pushdown', 'straightArm', 'facePull', 'cross', 'cableCrunch', 'pallof', 'chop', 'pullThrough'].includes(m[0]);
      if (originalBuild && !(o.band && onlyCableFrame) && !(o.suspension && m[0] === 'invRow')) originalBuild(k, g);
      // Complete low/high pulley variants whose old pose contained a floating cable.
      if (o.cable && !o.band && ['raise', 'fly', 'kickback', 'overheadExt', 'pullover', 'skull', 'row1', 'curlConc', 'curlPreacher', 'wristCurl', 'uprightRow', 'shrug', 'pushFwd', 'ohp'].includes(m[0])) {
        const result = mv.pose(k, 0), anchors = new Map();
        (result.tools || []).filter(t => t.t === 'cable').forEach(t => anchors.set(t.b.toArray().join(','), t.b));
        anchors.forEach(p => stack(k, g, p.z, p.x));
      }
      if (o.band && m[0] === 'nordic') {
        k.post(g, k.V3(0, .02, -.75), k.V3(0, 1.6, -.75), .035); k.post(g, k.V3(-.4, .02, -.75), k.V3(.4, .02, -.75), .04);
      }
      if (o.suspension) {
        const z = ['plank', 'climber'].includes(m[0]) ? -1 : mv.anchorZ ?? .45;
        k.post(g, k.V3(-.8, 2.25, z), k.V3(.8, 2.25, z), .035);
        sides.forEach(([s, sg]) => { k.post(g, k.V3(sg * .8, .02, z), k.V3(sg * .8, 2.25, z), .035);
          k.post(g, k.V3(sg * .8, .02, z - .35), k.V3(sg * .8, .02, z + .35), .035); });
      }
    };
    return mv;
  }
  return {get, MAP};
})();
