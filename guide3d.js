// Vista 3D della guida esercizio: modello anatomico (Z-Anatomy, CC BY-SA 4.0, vedi 3d/LICENSE.md) mosso con le stesse pose di guide.js.
// Si carica solo quando serve (three.js + modello ~2,5 MB, poi in cache). Senza WebGL o in caso di errore resta la guida SVG.
// Convenzioni: unita' 2D di guide.js (x avanti, y in basso, pavimento GF) → metri con U; il corpo guarda +Z, il fianco sinistro e' +X.
window.G3D = (() => {
  const U = 0.0114, X0 = 105, FLOOR = 149;
  // posizioni di riposo delle articolazioni (m), ricavate dalle ossa del modello (x, y su, z avanti)
  const JR = {"hip.l":[0.075,0.8614,-0.006],"knee.l":[0.0777,0.4477,-0.0329],"ankle.l":[0.0691,0.0953,-0.0388],"toe.l":[0.0707,0.0223,0.0748],"toeend.l":[0.0847,0.0141,0.1323],"shoulder.l":[0.158,1.382,-0.0224],"elbow.l":[0.2187,1.1041,-0.0352],"wrist.l":[0.2728,0.8646,0.0156],"mcp.l":[0.2729,0.7725,0.0358],"pip.l":[0.2805,0.7338,0.0622],"tip.l":[0.2864,0.7009,0.095],"cmc.l":[0.2897,0.8429,0.0307],"tmcp.l":[0.3109,0.8139,0.0448],"ttip.l":[0.3326,0.7687,0.0711],"clavs.l":[0.0163,1.4006,0.0346],"clava.l":[0.1479,1.4173,-0.036],"pelvis":[0,0.8614,-0.006],"L5":[0,0.9859,-0.0322],"T12":[0,1.1424,-0.0425],"T6":[0,1.3224,-0.0735],"C7":[0,1.4514,-0.0313],"C1":[0,1.5425,-0.0185],"headtop":[0,1.6992,0.0015]};
  ['hip', 'knee', 'ankle', 'toe', 'toeend', 'shoulder', 'elbow', 'wrist', 'mcp', 'pip', 'tip', 'cmc', 'tmcp', 'ttip', 'clavs', 'clava'].forEach(k => { const v = JR[k + '.l']; JR[k + '.r'] = [-v[0], v[1], v[2]]; });
  const BD = [['root', null, 'pelvis', 'L5'], ['spine1', 'root', 'L5', 'T12'], ['spine2', 'spine1', 'T12', 'T6'], ['spine3', 'spine2', 'T6', 'C7'], ['neck', 'spine3', 'C7', 'C1'], ['head', 'neck', 'C1', 'headtop']];
  for (const s of 'lr') BD.push(['clav.' + s, 'spine3', 'clavs.' + s, 'clava.' + s], ['uarm.' + s, 'clav.' + s, 'shoulder.' + s, 'elbow.' + s], ['farm.' + s, 'uarm.' + s, 'elbow.' + s, 'wrist.' + s],
    ['hand.' + s, 'farm.' + s, 'wrist.' + s, 'mcp.' + s], ['fing1.' + s, 'hand.' + s, 'mcp.' + s, 'pip.' + s], ['fing2.' + s, 'fing1.' + s, 'pip.' + s, 'tip.' + s],
    ['thumb1.' + s, 'hand.' + s, 'cmc.' + s, 'tmcp.' + s], ['thumb2.' + s, 'thumb1.' + s, 'tmcp.' + s, 'ttip.' + s], ['thigh.' + s, 'root', 'hip.' + s, 'knee.' + s], ['shin.' + s, 'thigh.' + s, 'knee.' + s, 'ankle.' + s],
    ['foot.' + s, 'shin.' + s, 'ankle.' + s, 'toe.' + s], ['toe.' + s, 'foot.' + s, 'toe.' + s, 'toeend.' + s]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // proporzioni del modello nelle unita' 2D, per far calcolare a gsolve pose coerenti con le ossa reali
  const GL3 = {th: dist(JR['hip.l'], JR['knee.l']) / U, sh: dist(JR['knee.l'], JR['ankle.l']) / U, ua: dist(JR['shoulder.l'], JR['elbow.l']) / U,
    fa: dist(JR['elbow.l'], JR['wrist.l']) / U, ft: dist(JR['ankle.l'], JR['toe.l']) / U, hn: dist(JR['wrist.l'], JR['tip.l']) / U,
    to: dist(JR.pelvis, [0, (JR['shoulder.l'][1] + JR['clavs.l'][1]) / 2, JR['C7'][2]]) / U, nk: 7, hd: 9};
  const FOFF = JR['ankle.l'][1] - (FLOOR - (67 + GL3.th + GL3.sh - .01)) * U;   // altezza del pavimento 2D nel mondo
  const GRP = {chest: ['chest'], upperChest: ['chest'], frontDelt: ['delt_front'], sideDelt: ['delt_side'], rearDelt: ['delt_rear'], biceps: ['biceps'], brachialis: ['brachialis'],
    triceps: ['triceps'], forearms: ['forearm', 'hand'], traps: ['traps_up', 'traps_mid'], upperBack: ['rhomboids', 'rotator', 'traps_mid'], lats: ['lats'], lowerBack: ['erector'],
    abs: ['abs'], obliques: ['obliques', 'serratus'], glutes: ['glute_max', 'glute_med'], quads: ['quads'], hams: ['hams'], adductors: ['adductors'], calves: ['calves', 'shin'],
    hipFlexors: ['hip_other'], neck: ['neck']};
  const COL = {muscle: 0xb3aca4, bone: 0xf2ebda, pri: 0xe5392b, sec: 0xf0935f, prop: 0x8e949c, pad: 0x2a2d33, plate: 0x30343b};
  let T = null, ready = null, failed = false, R = null;   // T = THREE; R = renderer condiviso

  const supported = () => {
    if (failed) return false;
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  };
  const loadScript = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  const VER = (document.currentScript && /v=(\d+)/.exec(document.currentScript.src) || [0, 0])[1];

  function load() {
    if (ready) return ready;
    ready = (async () => {
      await Promise.all([loadScript('3d/three.min.js?v=' + VER), loadScript('3d/moves.js?v=' + VER)]);
      T = window.THREE;
      const dr = new window.DRACOLoader(); dr.setDecoderPath('3d/draco/'); dr.setDecoderConfig({type: 'wasm'});
      const gltf = await new window.GLTFLoader().setDRACOLoader(dr).loadAsync('3d/man.glb?v=' + VER);
      build(gltf.scene);
    })().catch(e => { failed = true; ready = null; console.warn('guide3d', e); throw e; });
    return ready;
  }

  // ---------- scena condivisa ----------
  let scene, cam, fig, bones = {}, rest = {}, meshes = [], shadow, canvas;
  const san = n => n.replace(/\./g, '');
  // Dual-quaternion skinning preserves limb volume when the wrist/shoulder turns.
  // Linear matrix blending collapsed the forearms in close-grip presses.
  // Reference: Kavan et al., Geometric Skinning with Approximate Dual Quaternion Blending (2008).
  function volumeSkinning(mesh) {
    const glsl = `
      vec4 dqMul(vec4 a, vec4 b) { return vec4(a.w*b.xyz+b.w*a.xyz+cross(a.xyz,b.xyz),a.w*b.w-dot(a.xyz,b.xyz)); }
      vec3 dqRotate(vec4 q, vec3 p) { return p+2.0*cross(q.xyz,cross(q.xyz,p)+q.w*p); }
      vec4 dqQuat(mat4 m) {
        float tr=m[0][0]+m[1][1]+m[2][2]; vec4 q;
        if(tr>0.0){float s=sqrt(tr+1.0)*2.0;q=vec4((m[1][2]-m[2][1])/s,(m[2][0]-m[0][2])/s,(m[0][1]-m[1][0])/s,s*.25);}
        else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){float s=sqrt(1.0+m[0][0]-m[1][1]-m[2][2])*2.0;q=vec4(s*.25,(m[1][0]+m[0][1])/s,(m[2][0]+m[0][2])/s,(m[1][2]-m[2][1])/s);}
        else if(m[1][1]>m[2][2]){float s=sqrt(1.0+m[1][1]-m[0][0]-m[2][2])*2.0;q=vec4((m[1][0]+m[0][1])/s,s*.25,(m[2][1]+m[1][2])/s,(m[2][0]-m[0][2])/s);}
        else{float s=sqrt(1.0+m[2][2]-m[0][0]-m[1][1])*2.0;q=vec4((m[2][0]+m[0][2])/s,(m[2][1]+m[1][2])/s,s*.25,(m[0][1]-m[1][0])/s);}
        return normalize(q);
      }
      void dqAdd(mat4 m,float w,vec4 refq,inout vec4 qr,inout vec4 qd){vec4 q=dqQuat(m);float s=dot(q,refq)<0.0?-w:w;qr+=q*s;qd+=dqMul(vec4(m[3].xyz,0.0),q)*(.5*s);}
    `;
    mesh.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + glsl)
        .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
          #ifdef USE_SKINNING
          vec4 dqr=vec4(0.0),dqd=vec4(0.0),dqref=dqQuat(boneMatX);
          dqAdd(boneMatX,skinWeight.x,dqref,dqr,dqd);dqAdd(boneMatY,skinWeight.y,dqref,dqr,dqd);
          dqAdd(boneMatZ,skinWeight.z,dqref,dqr,dqd);dqAdd(boneMatW,skinWeight.w,dqref,dqr,dqd);
          float dql=max(length(dqr),.00001);dqr/=dql;dqd/=dql;dqd-=dqr*dot(dqr,dqd);
          vec3 dqt=2.0*dqMul(dqd,vec4(-dqr.xyz,dqr.w)).xyz;
          #endif`)
        .replace('#include <skinnormal_vertex>', `
          #ifdef USE_SKINNING
          objectNormal=(bindMatrixInverse*vec4(dqRotate(dqr,(bindMatrix*vec4(objectNormal,0.0)).xyz),0.0)).xyz;
          #ifdef USE_TANGENT
          objectTangent=(bindMatrixInverse*vec4(dqRotate(dqr,(bindMatrix*vec4(objectTangent,0.0)).xyz),0.0)).xyz;
          #endif
          #endif`)
        .replace('#include <skinning_vertex>', `
          #ifdef USE_SKINNING
          transformed=(bindMatrixInverse*vec4(dqRotate(dqr,(bindMatrix*vec4(transformed,1.0)).xyz)+dqt,1.0)).xyz;
          #endif`);
    };
    mesh.material.customProgramCacheKey = () => 'guide-dq-v1';
    // Match the GPU deformation in raycasts/bounds, so collision checks see the rendered body.
    const matrix = new T.Matrix4(), qr = new T.Vector4(), qd = new T.Vector4(), q = new T.Quaternion(), dq = new T.Quaternion(), ref = new T.Quaternion(), tr = new T.Quaternion(), inv = new T.Quaternion();
    mesh.getVertexPosition = function(index, target) {
      target.fromBufferAttribute(this.geometry.attributes.position, index).applyMatrix4(this.bindMatrix);
      const ids = this.geometry.attributes.skinIndex, weights = this.geometry.attributes.skinWeight;
      qr.set(0, 0, 0, 0); qd.set(0, 0, 0, 0);
      for (let j = 0; j < 4; j++) {
        matrix.fromArray(this.skeleton.boneMatrices, ids.getComponent(index, j) * 16); q.setFromRotationMatrix(matrix).normalize(); if (!j) ref.copy(q);
        const w = weights.getComponent(index, j) * (ref.dot(q) < 0 ? -1 : 1), e = matrix.elements;
        tr.set(e[12], e[13], e[14], 0); dq.copy(tr).multiply(q);
        qr.x += q.x*w; qr.y += q.y*w; qr.z += q.z*w; qr.w += q.w*w;
        qd.x += dq.x*w*.5; qd.y += dq.y*w*.5; qd.z += dq.z*w*.5; qd.w += dq.w*w*.5;
      }
      const len = Math.max(qr.length(), .00001); qr.divideScalar(len); qd.divideScalar(len); qd.addScaledVector(qr, -qr.dot(qd));
      q.set(qr.x, qr.y, qr.z, qr.w); inv.copy(q).conjugate(); dq.set(qd.x, qd.y, qd.z, qd.w).multiply(inv);
      target.applyQuaternion(q); target.x += 2*dq.x; target.y += 2*dq.y; target.z += 2*dq.z;
      return target.applyMatrix4(this.bindMatrixInverse);
    };
  }
  function build(model) {
    canvas = document.createElement('canvas'); canvas.className = 'gf-3d';
    R = new T.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); R.setClearColor(0x000000, 0);
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = .92;
    scene = new T.Scene(); cam = new T.PerspectiveCamera(28, 1.2, .1, 40);
    const pm = new T.PMREMGenerator(R); scene.environment = pm.fromScene(new window.RoomEnvironment(), .03).texture; pm.dispose();
    scene.add(new T.HemisphereLight(0xe6efff, 0x273747, .7));
    const key = new T.DirectionalLight(0xfff1e3, 2.6); key.position.set(2.5, 4, 3.5); scene.add(key);
    const rim = new T.DirectionalLight(0xb8d8ff, 2.1); rim.position.set(-2.5, 2.5, -3); scene.add(rim);
    const fill = new T.DirectionalLight(0xffffff, .8); fill.position.set(-3, 1.5, 2); scene.add(fill);
    fig = model; scene.add(fig);
    fig.traverse(o => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.material = new T.MeshStandardMaterial({color: {hair: 0x292c32, eyed: 0x1d1916, eyew: 0xe9e6e1, shorts: 0x263549}[o.name] || 0xffffff, roughness: o.name === 'hair' || o.name === 'shorts' ? .85 : o.name === 'skin' ? .72 : .4, metalness: 0, vertexColors: o.name === 'skin', envMapIntensity: .45, side: o.name === 'skin' || o.name === 'shorts' ? T.DoubleSide : T.FrontSide});
        if (o.isSkinnedMesh) volumeSkinning(o);
        if (o.name === 'skin') { const c = o.geometry.attributes.color, code = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { code[i * 3] = c.getX(i); code[i * 3 + 1] = c.getY(i); code[i * 3 + 2] = c.getZ(i); } o.userData.code = code; }
        meshes.push(o);
      }
    });
    fig.updateMatrixWorld(true);
    const wq = new T.Quaternion();
    for (const [n, par, h, t] of BD) {
      const b = fig.getObjectByName(san(n)); if (!b) throw new Error('osso mancante ' + n);
      b.getWorldQuaternion(wq);
      bones[n] = b;
      rest[n] = {mwi: b.matrixWorld.clone().invert(), q: wq.clone(), lq: b.quaternion.clone(), lp: b.position.clone(), dir: new T.Vector3(...JR[t]).sub(new T.Vector3(...JR[h])).normalize(), par};
    }
    bgG = new T.Group(); fgG = new T.Group(); scene.add(bgG, fgG);
    // ombra a terra
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({map: new T.CanvasTexture(c), transparent: true, depthWrite: false}));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .002; scene.add(shadow);
    const floor = new T.Mesh(new T.CircleGeometry(1.65, 80), new T.MeshBasicMaterial({color: 0x92adc5, transparent: true, opacity: .06, depthWrite: false}));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.003; scene.add(floor);
    const ring = new T.Mesh(new T.RingGeometry(1.64, 1.65, 80), new T.MeshBasicMaterial({color: 0x92adc5, transparent: true, opacity: .16, depthWrite: false, side: T.DoubleSide}));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -.002; scene.add(ring);
  }

  // ---------- posa ----------
  const V3 = (...a) => new T.Vector3(...a);
  const m3 = (p, lat = 0) => V3(lat, (FLOOR - p[1]) * U + FOFF, (p[0] - X0) * U);
  const dir2 = (a, b) => V3(0, -(b[1] - a[1]), b[0] - a[0]).normalize();      // direzione 3D di un segmento 2D
  function setWorldQ(name, q) {
    const b = bones[name], pq = new T.Quaternion(); b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(pq);
    b.quaternion.copy(pq.invert().multiply(q)); b.updateMatrixWorld(true);
  }
  function aim(name, d) {
    const q = new T.Quaternion().setFromUnitVectors(rest[name].dir, d.clone().normalize()).multiply(rest[name].q);
    setWorldQ(name, q);
  }
  function worldDelta(name, dq) { const q = new T.Quaternion(); bones[name].getWorldQuaternion(q); setWorldQ(name, dq.clone().multiply(q)); }
  const wp = name => bones[name].getWorldPosition(new T.Vector3());
  // due ossa: dalla radice a verso il bersaglio b, il gomito/ginocchio si piega verso pole
  function ik2(a, b, l1, l2, pole) {
    const d = b.clone().sub(a), len = d.length() || 1e-4, u = d.clone().divideScalar(len), L = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
    const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    let p = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
    if (p.lengthSq() < 1e-6) p = V3(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
    p.normalize();
    return {mid: a.clone().add(u.clone().multiplyScalar(x)).add(p.multiplyScalar(h)), end: a.clone().add(u.multiplyScalar(L))};
  }
  const LEN = {th: dist(JR['hip.l'], JR['knee.l']), sh: dist(JR['knee.l'], JR['ankle.l']), ua: dist(JR['shoulder.l'], JR['elbow.l']), fa: dist(JR['elbow.l'], JR['wrist.l'])};
  const RAD = Math.PI / 180;

  function reset() { clavLift.l = clavLift.r = 0; for (const n in bones) bones[n].quaternion.copy(rest[n].lq); bones.root.position.copy(rest.root.lp); fig.updateMatrixWorld(true); }
  function limbs(S, hips, opt) {
    // gambe: (S.k,S.a,S.toe) = lato sinistro, (S.k2,S.a2,S.toe2) = destro
    [['l', S.k, S.a, S.toe], ['r', S.k2, S.a2, S.toe2]].forEach(([s, k, a, toe]) => {
      const sg = s === 'l' ? 1 : -1, hip = wp('thigh.' + s), lat = sg * (Math.abs(JR['ankle.l'][0]) + opt.stance);
      const tgt = m3(a, lat), pole = m3(k, sg * Math.abs(JR['knee.l'][0])).sub(hip.clone().add(tgt).multiplyScalar(.5));
      const r = ik2(hip, tgt, LEN.th, LEN.sh, pole);
      aim('thigh.' + s, r.mid.clone().sub(hip)); aim('shin.' + s, r.end.clone().sub(r.mid));
      // piede: l'angolo ft di guide.js e' assoluto (90 = piatto); il piede del modello a riposo e' inclinato di ~33° in basso
      const ang = Math.atan2(toe[0] - a[0], toe[1] - a[1]) / RAD, th = -(ang - 90) * RAD;
      const fd = rest['foot.' + s].dir.clone().applyAxisAngle(V3(1, 0, 0), th);
      aim('foot.' + s, fd); aim('toe.' + s, fd);
    });
  }
  function arms(S, P, opt) {
    const hands = [['l', S.e, S.w, S.h], ['r', S.e2, S.w2, S.h2]];
    hands.forEach(([s, e, w, h]) => {
      const sg = s === 'l' ? 1 : -1;
      // alzare il braccio sopra l'orizzontale porta in alto anche la spalla (ritmo scapolo-omerale)
      const el = Math.atan2(w[0] - S.sho[0], w[1] - S.sho[1]) / RAD;   // 0 = giu', 180 = su
      const lift = Math.min(26, Math.max(0, (Math.abs(el) - 75) * .3)) + (P.sl || 0) * 3;
      if (lift > .5) worldDelta('clav.' + s, new T.Quaternion().setFromAxisAngle(V3(0, 0, 1), sg * lift * RAD));
      const sh = wp('uarm.' + s), lat = sg * (Math.abs(JR['shoulder.l'][0]) + opt.grip);
      const tgt = m3(w, lat), pole = m3(e, sg * Math.abs(JR['shoulder.l'][0])).sub(sh.clone().add(tgt).multiplyScalar(.5));
      const r = ik2(sh, tgt, LEN.ua, LEN.fa, pole);
      aim('uarm.' + s, r.mid.clone().sub(sh)); aim('farm.' + s, r.end.clone().sub(r.mid));
      if (P.hnd != null) aim('hand.' + s, dir2(w, h)); else if (P.wy != null) aim('hand.' + s, dir2(w, h));
    });
  }
  function pose(def, P, opt, lift = 0) {
    reset();
    if (def.front) return poseFront(P, opt);
    const save = {...GL}; Object.assign(GL, GL3);
    let S; try { S = gsolve(P); } finally { Object.assign(GL, save); }
    const hip = m3(S.hip); hip.y += lift; bones.root.position.add(hip.clone().sub(V3(...JR.pelvis)));
    // busto: il bacino segue meta' dell'inclinazione, la colonna il resto
    const sm = V3(0, (JR['shoulder.l'][1] + JR['clavs.l'][1]) / 2 - JR.pelvis[1], JR['C7'][2] - JR.pelvis[2]).normalize();
    const dq = new T.Quaternion().setFromUnitVectors(sm, dir2(S.hip, S.sho));
    worldDelta('root', new T.Quaternion().slerpQuaternions(new T.Quaternion(), dq, .5));
    const half = new T.Quaternion().slerpQuaternions(new T.Quaternion(), dq, .5);
    worldDelta('spine1', half);
    const hd = dir2(S.neck, S.head);
    aim('neck', dir2(S.sho, S.neck).lerp(hd, .5)); aim('head', hd);
    limbs(S, hip, opt); arms(S, P, opt);
    return S;
  }
  // esercizi visti di fronte (alzate laterali, aperture): braccia/gambe si aprono nel piano frontale
  function poseFront(P, opt) {
    const c = P.c || [120, 67], lean = P.lean || 0, tilt = Math.acos(Math.max(.2, 1 - lean / 46));
    bones.root.position.add(m3([X0, c[1] + (lean ? 8 : 0)]).sub(V3(...JR.pelvis)));
    if (tilt > .02) { worldDelta('root', new T.Quaternion().setFromAxisAngle(V3(1, 0, 0), tilt * .5)); worldDelta('spine1', new T.Quaternion().setFromAxisAngle(V3(1, 0, 0), tilt * .5)); }
    const fall = (a, side) => V3(side * Math.sin(a * RAD), -Math.cos(a * RAD), 0);
    [['l', 1, P.aL, P.lL], ['r', -1, P.aR, P.lR]].forEach(([s, sg, a, lg]) => {
      const sh = wp('uarm.' + s), d = fall(a, sg);
      aim('uarm.' + s, d); aim('farm.' + s, d);
      const hipw = wp('thigh.' + s), ld = fall(3 + (lg || 0), sg);
      aim('thigh.' + s, ld); aim('shin.' + s, ld);
      aim('foot.' + s, rest['foot.' + s].dir); aim('toe.' + s, rest['foot.' + s].dir);
    });
    return null;
  }

  // ---------- attrezzi ----------
  // Reuse GPU resources: moving equipment changes transforms, never geometry buffers or shaders.
  const materials = new Map(), geometries = new Map();
  const mat = (c, r = .5, mt = 0) => { const key = [c, r, mt].join(':'); if (!materials.has(key)) materials.set(key, Object.assign(new T.MeshStandardMaterial({color: c, roughness: r, metalness: mt}), {userData: {shared: true}})); return materials.get(key); };
  const geo = (key, make) => { if (!geometries.has(key)) { const g = make(); g.userData.shared = true; geometries.set(key, g); } return geometries.get(key); };
  const mProp = () => mat(COL.prop, .35, .6), mPad = () => mat(COL.pad, .8), mPlate = () => mat(COL.plate, .5, .3);
  function seg(a, b, rad, m) {   // cilindro fra due punti 3D
    const d = b.clone().sub(a), len = d.length(); if (len < 1e-4) return null;
    const o = new T.Mesh(geo('cylinder', () => new T.CylinderGeometry(1, 1, 1, 24)), m); o.scale.set(rad, len, rad);
    o.position.copy(a.clone().add(b).multiplyScalar(.5)); o.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return o;
  }
  function box(w, h, d, m, p, q) { const o = new T.Mesh(geo('box', () => new T.BoxGeometry(1, 1, 1)), m); o.scale.set(w, h, d); o.position.copy(p); if (q) o.quaternion.copy(q); return o; }
  function disc(r, th, m, p, axis) { const o = new T.Mesh(geo('disc', () => new T.CylinderGeometry(1, 1, 1, 40)), m); o.scale.set(r, th, r); o.position.copy(p); o.quaternion.setFromUnitVectors(V3(0, 1, 0), axis || V3(1, 0, 0)); return o; }
  const rod = (a, b, w, M) => seg(a, b, Math.max(.005, w * U / 2), M);
  function placePad(g, p1, p2, thick, width) {   // pad inclinato fra due punti 2D
    const a = m3(p1), b = m3(p2), d = b.clone().sub(a), len = d.length();
    const o = box(width, thick * U, len, mPad(), a.clone().add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.normalize()));
    g.add(o);
  }
  function addProp(g, d, ctx) {
    const a = d.a, M = mProp();
    switch (d.t) {
      case 'ln': { const o = rod(m3(a[0]), m3(a[1]), a[3] || 2.4, M); o && g.add(o); break; }
      case 'bar': { const o = rod(m3([a[0], a[1]]), m3([a[0], a[2]]), 2.4, M); o && g.add(o); break; }
      case 'bench': { const [x1, y, x2] = a; placePad(g, [x1, y], [x2, y], 8, .32);
        g.add(box(.05, (GF3 - y) * U, .05, M, m3([x1 + 6, (y + GF3) / 2 + 2]))); g.add(box(.05, (GF3 - y) * U, .05, M, m3([x2 - 8, (y + GF3) / 2 + 2]))); break; }
      case 'pad': { const [x1, y1, x2, y2, w = 8] = a; placePad(g, [x1, y1], [x2, y2], w, .34); break; }
      case 'seat': { const [x, y] = a; placePad(g, [x - 12, y], [x + 8, y], 8, .34); const o = rod(m3([x - 2, y + 4]), m3([x - 2, GF3]), 3, M); o && g.add(o); break; }
      case 'box': { const [x, y, w] = a; g.add(box(.55, (GF3 - y) * U, w * U, mat(0x3a3d44, .8), m3([x + w / 2, (y + GF3) / 2]))); break; }
      case 'wall': { const x = a[0], wm = new T.MeshStandardMaterial({color: 0xcfd3da, roughness: .9, transparent: true, opacity: .35, depthWrite: false}); g.add(box(.9, (GF3 + 10) * U, .03, wm, m3([x, (GF3 - 10) / 2]))); break; }
      case 'bars': { const [x, y, w = 36] = a; [-1, 1].forEach(sg => { const o = rod(m3([x - w / 2, y], sg * .25), m3([x + w / 2, y], sg * .25), 4, M); o && g.add(o);
        const p = rod(m3([x - w / 2 + 4, y], sg * .25), m3([x - w / 2 + 4, GF3], sg * .25), 3, M); p && g.add(p); }); break; }
      case 'stack': { const [x, y] = a; g.add(box(.34, 40 * U, 14 * U, mat(0x4a4e57, .6, .3), m3([x + 7, y + 20]))); break; }
      case 'belt': { const [pt, eq] = a; if (eq === 'plate' || eq === 'dumbbell') g.add(disc(.07, .04, mPlate(), m3(pt), V3(1, 0, 0))); break; }
      case 'tool': tool(g, a[0], a[1], a[2] || {}, ctx); break;
    }
  }
  const GF3 = 149;
  function tool(g, pt, eq, o, ctx) {
    const r = o.r || 10, c = m3(pt), an = o.anchor || [215, 10];
    const both = ctx.pair(pt);     // vero se le due mani sono nello stesso punto (esercizio bilaterale)
    if (eq === 'dumbbell') { (both ? [-1, 1] : [ctx.side(pt)]).forEach(sg => { const p = V3(sg * (Math.abs(JR['shoulder.l'][0]) + ctx.opt.grip), c.y, c.z);
      g.add(rodX(p, .07, .014)); g.add(disc(.05, .05, mPlate(), p.clone().add(V3(.075, 0, 0))), disc(.05, .05, mPlate(), p.clone().add(V3(-.075, 0, 0)))); }); }
    else if (eq === 'kettlebell') { const p = V3(ctx.side(pt) * .18, c.y - .08, c.z); g.add(sph(.1, p, mPlate())); }
    else if (['barbell', 'ezbar', 'trapbar', 'landmine', 'smith'].includes(eq)) {
      const half = eq === 'ezbar' ? .35 : .72, pr = Math.min(.225, Math.max(.12, r * U * 1.6));
      const a = V3(-half - .02, c.y, c.z), b = V3(half + .02, c.y, c.z); g.add(seg(a, b, .014, mProp()));
      [-1, 1].forEach(sg => { g.add(disc(pr, .05, mPlate(), V3(sg * (half - .05), c.y, c.z))); g.add(disc(pr * .96, .05, mPlate(), V3(sg * (half - .11), c.y, c.z))); });
      if (eq === 'smith') { const o = rod(m3([pt[0], -14]), m3([pt[0], FLOOR]), 1.4, mat(0x7f858d, .4, .5)); o && g.add(o); } }
    else if (eq === 'plate') g.add(disc(Math.min(.22, r * U * 1.6 * .9), .04, mPlate(), c.clone(), V3(0, 0, 1)));
    else if (eq === 'cable' || eq === 'machine') { const l = seg(m3(pt, ctx.side(pt) * (Math.abs(JR['shoulder.l'][0]) + ctx.opt.grip)), m3(an), .004, mat(0x666b73, .5, .4)); l && g.add(l);
      g.add(sph(.03, m3(an), mPlate())); }
    else if (eq === 'band') { const l = seg(m3(pt, ctx.side(pt) * .2), m3(an), .006, mat(0xe0592b, .7)); l && g.add(l); }
    else if (eq === 'suspension') { [-1, 1].forEach(sg => { const l = seg(m3(pt, sg * .2), m3([pt[0], -14], sg * .2), .006, mat(0xe0592b, .7)); l && g.add(l); }); }
  }
  const sph = (r, p, m) => { const o = new T.Mesh(geo('sphere', () => new T.SphereGeometry(1, 24, 16)), m); o.scale.setScalar(r); o.position.copy(p); return o; };
  const rodX = (p, hl, rad) => seg(p.clone().add(V3(-hl, 0, 0)), p.clone().add(V3(hl, 0, 0)), rad, mProp());

  // minuscolo lettore dei frammenti SVG rimasti dentro bg()/fg(): linee, cerchi, rettangoli, percorsi
  function parseSvg(str, g) {
    const at = (s, k) => { const m = new RegExp('\\b' + k + '="([^"]*)"').exec(s); return m ? m[1] : null; };
    const M = mProp();
    for (const s of str.match(/<(line|circle|rect|path)\b[^>]*>/g) || []) {
      const kind = /^<(\w+)/.exec(s)[1], w = +(at(s, 'stroke-width') || 2.4);
      if (kind === 'line') { const o = rod(m2(+at(s, 'x1'), +at(s, 'y1')), m2(+at(s, 'x2'), +at(s, 'y2')), w, M); o && g.add(o); }
      else if (kind === 'circle') { const r = +at(s, 'r'), cl = at(s, 'class') || '', p = m3([+at(s, 'cx'), +at(s, 'cy')]);
        if (/gf-fill/.test(cl) && r < 6) g.add(sph(Math.max(.02, r * U * .8), p, mPlate()));
        else g.add(disc(Math.max(.04, r * U * 1.4), .05, mPlate(), p, V3(1, 0, 0))); }
      else if (kind === 'rect') { const x = +at(s, 'x'), y = +at(s, 'y'), ww = +at(s, 'width'), hh = +at(s, 'height'); g.add(box(.5, hh * U, ww * U, mat(0x3a3d44, .8), m3([x + ww / 2, y + hh / 2]))); }
      else if (kind === 'path') { const d = at(s, 'd') || ''; const nums = d.replace(/[MLQa-zA-Z]/g, ' ').trim().split(/\s+/).map(Number);
        const pts = []; const cm = d.match(/[MLQ][^MLQ]*/g) || [];
        cm.forEach(c => { const n = c.slice(1).trim().split(/[\s,]+/).map(Number); if (c[0] === 'Q') pts.push([n[2], n[3]]); else pts.push([n[0], n[1]]); });
        for (let i = 1; i < pts.length; i++) { if (pts[i].some(isNaN) || pts[i - 1].some(isNaN)) continue; const o = rod(m2(...pts[i - 1]), m2(...pts[i]), w, M); o && g.add(o); } }
    }
  }
  const m2 = (x, y) => m3([x, y]);

  const collect = fn => {
    const save = {...GL}; Object.assign(GL, GL3);
    try { G3C = []; const raw = fn() || ''; return {items: G3C, raw}; } finally { G3C = null; Object.assign(GL, save); }
  };
  let bgG = null, fgG = null, bgItems = [];
  function clearGroup(g) { g.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material && !o.material.userData.shared) o.material.dispose(); }); g.clear(); }
  function buildBg(def, eq, opt) {
    clearGroup(bgG);
    const r = collect(() => def.bg ? def.bg(eq) : '');
    bgItems = r.items;
    const ctx = {opt, pair: () => false, side: () => 1};
    r.items.forEach(d => addProp(bgG, d, ctx));
    if (r.raw) parseSvg(r.raw, bgG);
  }
  // quanto alzare il bacino perche' schiena o glutei poggino sul piano di panche e sedili (nel disegno 2D il corpo non ha spessore)
  function supportLift(S) {
    let top = null;
    bgItems.forEach(d => {
      const a = d.a;
      if (d.t === 'bench' && S.hip[0] > a[0] - 6 && S.hip[0] < a[2] + 6) top = Math.max(top == null ? -9 : top, (FLOOR - (a[1] - 4)) * U + FOFF);
      if (d.t === 'seat' && Math.abs(S.hip[0] - a[0]) < 16) top = Math.max(top == null ? -9 : top, (FLOOR - (a[1] - 4)) * U + FOFF);
    });
    if (top == null) return 0;
    return Math.min(.08, Math.max(0, top + .10 - ((FLOOR - S.hip[1]) * U + FOFF)));
  }
  function drawFg(def, eq, S, P, opt) {
    clearGroup(fgG);
    const r = collect(() => def.fg && S ? def.fg(S, eq, P) : '');
    const ctx = {opt, pair: pt => !!S && Math.hypot(S.w[0] - S.w2[0], S.w[1] - S.w2[1]) < 2.5, side: pt => (S && Math.hypot(pt[0] - S.w2[0], pt[1] - S.w2[1]) < 1 && Math.hypot(pt[0] - S.w[0], pt[1] - S.w[1]) > 1) ? -1 : 1};
    r.items.forEach(d => { if (d.t === 'tool' || d.t === 'belt' || d.t === 'ln') addProp(fgG, d, ctx); else addProp(fgG, d, ctx); });
    if (r.raw) parseSvg(r.raw, fgG);
  }

  // ---------- evidenziazione dei muscoli ----------
  // la pelle porta per ogni vertice: R = gruppo del muscolo sotto, G = quanto e' vicino, B = pantaloncini
  const GIDS = ["chest", "delt_front", "delt_side", "delt_rear", "biceps", "brachialis", "triceps", "forearm", "traps_up", "traps_mid", "lats", "rotator", "rhomboids", "erector", "serratus", "abs", "obliques", "glute_max", "glute_med", "quads", "adductors", "hams", "hip_other", "calves", "shin", "neck"];
  const SKIN = [.52, .57, .62], SHORTS = [.045, .075, .12], HOT = {pri: [1, .20, .045], sec: [.95, .52, .25]};
  function paint(b) {
    const hot = {};
    (BASE[b] ? BASE[b].pri : []).forEach(k => (GRP[k] || []).forEach(g => { hot[g] = 'pri'; }));
    (BASE[b] ? BASE[b].sec : []).forEach(k => (GRP[k] || []).forEach(g => { if (!hot[g]) hot[g] = 'sec'; }));
    const sk = meshes.find(o => o.name === 'skin'); if (!sk) return;
    const code = sk.userData.code, col = sk.geometry.attributes.color;
    for (let i = 0; i < col.count; i++) {
      const g = GIDS[Math.round(code[i * 3] * 64) - 1], p = code[i * 3 + 1], sh = code[i * 3 + 2] > .5;
      let c = SKIN, k = 0;
      if (sh) c = SHORTS;
      else if (g && hot[g]) { k = Math.min(1, p * 1.6); c = HOT[hot[g]]; }
      const shade = sh ? 1 : .9 + .1 * p;   // il bordo fra un muscolo e l'altro un po' piu' scuro: si leggono le forme
      col.setXYZ(i, (SKIN[0] + (c[0] - SKIN[0]) * (sh ? 1 : k)) * shade, (SKIN[1] + (c[1] - SKIN[1]) * (sh ? 1 : k)) * shade, (SKIN[2] + (c[2] - SKIN[2]) * (sh ? 1 : k)) * shade);
    }
    col.needsUpdate = true;
  }

  // ---------- inquadratura ----------
  function frame(def, eq, opt) {
    const n = def.poses.length, pts = [];
    const save = {...GL}; Object.assign(GL, GL3);
    try {
      for (let i = 0; i < n * 3; i++) {
        const P = def.poses[i % n];
        if (def.front) { pts.push(m3([X0, 20]), m3([X0, 149]), V3(-.9, 1.2, 0), V3(.9, 1.2, 0)); continue; }
        const S = gsolve(P);
        [S.hip, S.sho, S.head, S.a, S.a2, S.w, S.w2, S.toe, S.toe2, S.k, S.k2].forEach(p => pts.push(m3(p)));
      }
    } finally { Object.assign(GL, save); }
    const bb = new T.Box3().setFromPoints(pts), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
    const rad = Math.max(.78, Math.hypot(sz.y, Math.max(sz.x, sz.z)) / 2 + .12);
    return {c, sz, rad};
  }

  // ---------- tecnica 3D per esercizio ----------
  // Pose costruite direttamente in 3D dai punti di controllo dei manuali di palestra (non dal disegno 2D):
  // squat: bilanciere sui trapezi alti e sulla verticale del centro del piede, piedi piatti, ginocchia nella direzione delle punte;
  // panca: schiena e glutei sulla panca, piedi a terra, presa piu' larga delle spalle e chiusa, bilanciere a meta' petto, avambracci verticali in basso.
  const wq = n => bones[n].getWorldQuaternion(new T.Quaternion());
  const curDir = n => rest[n].dir.clone().applyQuaternion(wq(n).multiply(rest[n].q.clone().invert()));
  const PALM0 = {};
  const palmRest = s => PALM0[s] || (PALM0[s] = (() => { const d = rest['hand.' + s].dir; return V3(0, 0, 1).sub(d.clone().multiplyScalar(d.z)).normalize(); })());
  const curPalm = s => palmRest(s).clone().applyQuaternion(wq('hand.' + s).multiply(rest['hand.' + s].q.clone().invert()));
  const flat = (v, f) => v.clone().sub(f.clone().multiplyScalar(v.dot(f))).normalize();
  function alignPalm(s, nDes) {   // ruota avambraccio (60%) e polso (40%) finche' il palmo guarda dove serve
    const f = curDir('farm.' + s), a = flat(curPalm(s), f), b = flat(nDes, f);
    let ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (a.clone().cross(b).dot(f) < 0) ang = -ang;
    worldDelta('farm.' + s, new T.Quaternion().setFromAxisAngle(f, ang * .6));
    worldDelta('hand.' + s, new T.Quaternion().setFromAxisAngle(f, ang * .4));
  }
  function grip(s, amt) {          // dita chiuse attorno all'attrezzo, pollice che si chiude dall'altra parte
    amt = Math.max(0, Math.min(1, amt));
    ['fing1.', 'fing2.', 'thumb1.', 'thumb2.'].forEach(n => bones[n + s].quaternion.copy(rest[n + s].lq));
    bones['hand.' + s].updateMatrixWorld(true);
    const ax = curDir('hand.' + s).cross(curPalm(s)).normalize();
    worldDelta('fing1.' + s, new T.Quaternion().setFromAxisAngle(ax, 72 * amt * RAD));
    worldDelta('fing2.' + s, new T.Quaternion().setFromAxisAngle(ax, 88 * amt * RAD));
    const tx = curDir('thumb1.' + s).cross(curPalm(s)).normalize();
    worldDelta('thumb1.' + s, new T.Quaternion().setFromAxisAngle(tx, 30 * amt * RAD));
    worldDelta('thumb2.' + s, new T.Quaternion().setFromAxisAngle(tx, 45 * amt * RAD));
  }
  function frameQ(u, f) { u = u.clone().normalize(); const x = u.clone().cross(f).normalize(), z = x.clone().cross(u); return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, u, z)); }
  let REST_UP0 = null;
  const restUp = () => REST_UP0 || (REST_UP0 = V3(0, (JR['shoulder.l'][1] + JR['clavs.l'][1]) / 2 - JR.pelvis[1], JR.C7[2] - JR.pelvis[2]).normalize());
  function torso(pos, up, fwd, pelvisShare) {   // busto con direzione (bacino → collo) e verso del petto
    bones.root.position.add(pos.clone().sub(V3(...JR.pelvis)));
    const R = frameQ(up, fwd).multiply(frameQ(restUp(), V3(0, 0, 1)).invert());
    const h = new T.Quaternion().slerpQuaternions(new T.Quaternion(), R, pelvisShare);
    worldDelta('root', h); worldDelta('spine1', R.clone().multiply(h.clone().invert()));
    fig.updateMatrixWorld(true);
  }
  function shift(d) { bones.root.position.add(d); fig.updateMatrixWorld(true); }
  function leg(s, ankle, pole, yaw) {
    const hip = wp('thigh.' + s), r = ik2(hip, ankle, LEN.th, LEN.sh, pole);
    aim('thigh.' + s, r.mid.clone().sub(hip)); aim('shin.' + s, r.end.clone().sub(r.mid));
    const fd = rest['foot.' + s].dir.clone().applyAxisAngle(V3(0, 1, 0), yaw * RAD);
    aim('foot.' + s, fd); aim('toe.' + s, fd);
  }
  // ritmo scapolo-omerale: oltre ~60° di elevazione del braccio la clavicola (e la scapola) salgono, fino a ~30°
  const clavLift = {};
  function scapula(s, ua) {
    const down = curDir('spine3').negate(), e = Math.acos(Math.max(-1, Math.min(1, ua.clone().normalize().dot(down)))) / RAD;
    const lift = Math.min(30, Math.max(0, (e - 60) * .33)), prev = clavLift[s] || 0;
    if (Math.abs(lift - prev) < .3) return false;
    const fwdNow = V3(0, 0, 1).applyQuaternion(wq('spine3').multiply(rest.spine3.q.clone().invert()));
    worldDelta('clav.' + s, new T.Quaternion().setFromAxisAngle(fwdNow, (s === 'l' ? 1 : -1) * (lift - prev) * RAD));
    clavLift[s] = lift; return true;
  }
  function arm(s, at, pole, palmN, wrist) {   // optional wrist extension for the front rack
    let sh = wp('uarm.' + s), tgt = at.clone();
    const planted = at.y <= .065 && palmN.y < -.65;
    { const r0 = ik2(sh, tgt, LEN.ua, LEN.fa, pole); if (scapula(s, r0.mid.clone().sub(sh))) sh = wp('uarm.' + s); }
    for (let it = 0; it < 6; it++) {
      const r = ik2(sh, tgt, LEN.ua, LEN.fa, pole);
      aim('uarm.' + s, r.mid.clone().sub(sh)); aim('farm.' + s, r.end.clone().sub(r.mid));
      const f = r.end.clone().sub(r.mid).normalize();
      if (planted || wrist) {
        // A planted palm is horizontal. The old straight wrist pointed the fingers into the floor.
        aim('hand.' + s, planted ? V3(0, 0, 1) : f.clone().lerp(wrist.dir, wrist.amount == null ? 1 : wrist.amount).normalize());
        const d = curDir('hand.' + s), a = flat(curPalm(s), d), b = flat(palmN, d);
        const angle = Math.atan2(d.dot(a.clone().cross(b)), a.dot(b));
        worldDelta('hand.' + s, new T.Quaternion().setFromAxisAngle(d, angle));
      } else { aim('hand.' + s, f); alignPalm(s, palmN); }
      const actual = wp('hand.' + s).addScaledVector(curDir('hand.' + s), .065);
      tgt.add(at.clone().sub(actual));
    }
    grip(s, planted ? 0 : 1);
  }
  // un punto del corpo a riposo (m) che segue l'osso indicato: dove sta ora
  const onBone = (n, p) => V3(...p).applyMatrix4(rest[n].mwi).applyMatrix4(bones[n].matrixWorld);
  const NIP = [0, 1.2806, .1294];          // linea dei capezzoli, sulla superficie del petto
  const headTo = d => { aim('neck', curDir('neck').lerp(d, .5)); aim('head', d); };
  function barbell(g, c, half = .7, pr = .225, ez = false) {
    const shaft = ez ? [[-half - .1, 0], [-.32, 0], [-.25, -.025], [-.12, .025], [.12, .025], [.25, -.025], [.32, 0], [half + .1, 0]] : [[-half - .1, 0], [half + .1, 0]];
    for (let i = 1; i < shaft.length; i++) g.add(seg(c.clone().add(V3(shaft[i - 1][0], shaft[i - 1][1], 0)), c.clone().add(V3(shaft[i][0], shaft[i][1], 0)), .0145, mat(0x9aa0a8, .3, .7)));
    [-1, 1].forEach(sg => {
      g.add(disc(pr, .055, mPlate(), V3(c.x + sg * (half - .03), c.y, c.z)));
      g.add(disc(pr * .97, .05, mPlate(), V3(c.x + sg * (half - .09), c.y, c.z)));
      g.add(disc(.035, .04, mat(0x9aa0a8, .3, .7), V3(c.x + sg * (half - .14), c.y, c.z)));
    });
  }
  const steel = () => mat(0xc3c8cf, .45, .4);
  // ---------- attrezzi in coordinate 3D (m) ----------
  function dumbbell(g, p, axis, hr = .062) {
    const a = axis.clone().normalize();
    g.add(seg(p.clone().addScaledVector(a, -.075), p.clone().addScaledVector(a, .075), .015, mat(0x9aa0a8, .3, .7)));
    [-1, 1].forEach(sg => { const o = disc(hr, .05, mPlate(), p.clone().addScaledVector(a, sg * .1), a); g.add(o); });
  }
  function kettlebell(g, p, down) {
    const d = down.clone().normalize(), c = p.clone().addScaledVector(d, .12);
    g.add(sph(.1, c, mPlate()));
    const h = new T.Mesh(geo('kb-handle', () => new T.TorusGeometry(.055, .012, 10, 24, Math.PI)), mPlate()); h.position.copy(p.clone().addScaledVector(d, .045));
    h.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().negate()); g.add(h);
  }
  function cableTo(g, handle, anchor, kind, grips) {
    const l = seg(handle, anchor, .004, mat(0x55595f, .5, .3)); l && g.add(l);
    g.add(sph(.035, anchor, mat(0x7c828a, .4, .5)));
    if (grips && grips.length === 2) {
      const [a, b] = grips;
      if (kind === 'rope') grips.forEach(p => { g.add(seg(handle, p, .012, mat(0x30343b, .9)), sph(.023, p, mPlate())); });
      else if (kind === 'd') { grips.forEach(p => { g.add(seg(handle, p.clone().add(V3(0, .05, 0)), .011, mProp()), seg(p.clone().add(V3(0, .05, 0)), p.clone().add(V3(0, -.05, 0)), .015, mPlate())); }); g.add(seg(a.clone().add(V3(0, -.05, 0)), b.clone().add(V3(0, -.05, 0)), .011, mProp())); }
      else { const axis = a.clone().sub(b).normalize(); g.add(seg(a.clone().addScaledVector(axis, .07), b.clone().addScaledVector(axis, -.07), .014, mProp())); grips.forEach(p => g.add(seg(p.clone().addScaledVector(axis, -.055), p.clone().addScaledVector(axis, .055), .018, mPlate()))); }
    }
    else if (kind === 'rope') [-1, 1].forEach(sg => { const o = seg(handle, handle.clone().add(V3(sg * .07, -.12, 0)), .012, mat(0x2b2b2b, .9)); o && g.add(o); });
    else if (kind === 'bar') { const o = seg(handle.clone().add(V3(-.28, 0, 0)), handle.clone().add(V3(.28, 0, 0)), .013, mat(0x9aa0a8, .3, .7)); o && g.add(o); }
    else { const a = handle.clone().add(V3(-.06, 0, 0)), b = handle.clone().add(V3(.06, 0, 0)), tip = handle.clone().addScaledVector(anchor.clone().sub(handle).normalize(), .10); g.add(seg(a, b, .014, mPlate()), seg(a, tip, .009, mProp()), seg(b, tip, .009, mProp())); }
  }
  function trapbar(g, c) {
    const points = [[-.42, -.26], [-.25, -.43], [.25, -.43], [.42, -.26], [.42, .26], [.25, .43], [-.25, .43], [-.42, .26]];
    points.forEach(([x, z], i) => { const [xx, zz] = points[(i + 1) % points.length]; g.add(seg(c.clone().add(V3(x, 0, z)), c.clone().add(V3(xx, 0, zz)), .018, steel())); });
    [-1, 1].forEach(sg => { const handle = c.clone().add(V3(sg * .28, 0, 0));
      [-1, 1].forEach(end => g.add(seg(handle.clone().add(V3(0, 0, end * .10)), c.clone().add(V3(sg * .42, 0, end * .10)), .014, steel())));
      g.add(seg(handle.clone().add(V3(0, 0, -.10)), handle.clone().add(V3(0, 0, .10)), .016, mProp()));
      g.add(seg(c.clone().add(V3(sg * .42, 0, 0)), c.clone().add(V3(sg * .85, 0, 0)), .023, steel()));
      [.64, .70].forEach(x => g.add(disc(.225, .05, mPlate(), c.clone().add(V3(sg * x, 0, 0)))));
    });
  }
  function drawTools(g, tools) {
    for (const t of tools || []) {
      if (t.t === 'bar') barbell(g, t.c, t.half, t.pr, t.ez);
      else if (t.t === 'trap') trapbar(g, t.c);
      else if (t.t === 'db') dumbbell(g, t.p, t.axis || V3(1, 0, 0));
      else if (t.t === 'kb') kettlebell(g, t.p, t.down || V3(0, -1, 0));
      else if (t.t === 'plate') g.add(disc(t.r || .2, .04, mPlate(), t.p, t.n || V3(0, 0, 1)));
      else if (t.t === 'cable') cableTo(g, t.a, t.b, t.kind, t.grips);
      else if (t.t === 'line') { const o = seg(t.a, t.b, t.r || .012, mat(t.c || 0x9aa0a8, .4, .5)); o && g.add(o); }
      else if (t.t === 'box') g.add(box(t.s[0], t.s[1], t.s[2], mat(t.c || 0x3a3d44, .7, .1), t.p, t.q));
    }
  }
  // pad imbottito fra due punti (panche, schienali, cuscini delle macchine)
  function pad(g, a, b, w = .3, th = .08, c = COL.pad) {
    const d = b.clone().sub(a), len = d.length(); if (len < 1e-3) return;
    g.add(box(w, th, len, mat(c, .8), a.clone().add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(V3(0, 0, 1), d.normalize())));
  }
  const post = (g, a, b, r = .025) => { const o = seg(a, b, r, steel()); o && g.add(o); };
  const kit = {get T() { return T; }, V3, JR, LEN, U, FLOOR, FOFF, RAD, m3, torso, shift, leg, arm, headTo, onBone, wp, curDir, aim, worldDelta, alignPalm, grip, flat,
    restDir: n => rest[n].dir.clone(), pad, post, steel, mat, box, seg, sph, disc, mPlate, mProp,
    armDir(s, ua, fa, palm, close) { scapula(s, ua); aim('uarm.' + s, ua); aim('farm.' + s, fa || ua); if (palm) alignPalm(s, palm); if (close) grip(s, close); },
    legDir(s, th, sh, foot) { aim('thigh.' + s, th); aim('shin.' + s, sh || th); const fd = foot || rest['foot.' + s].dir; aim('foot.' + s, fd); aim('toe.' + s, fd); },
    ay: JR['ankle.l'][1]};

  // ---------- montaggio nella finestra della guida ----------
  function mount(stage, baseId, eq, def) {
    const opt = {stance: .05, grip: ['barbell', 'smith', 'ezbar', 'trapbar'].includes(eq) ? .12 : .02};
    const cus = window.MOVES3D ? MOVES3D.get(baseId, eq) : null;
    let fr;
    paint(baseId);
    if (cus) {
      clearGroup(bgG); bgItems = [];
      const pts = [];
      for (let i = 0; i <= 24; i++) { reset(); const r = cus.pose(kit, i / 24) || {}; ['head', 'foot.l', 'foot.r', 'hand.l', 'hand.r', 'root', 'toe.l', 'toe.r'].forEach(n => pts.push(wp(n)));
        pts.push(wp('head').add(V3(.16, .18, .18)), wp('head').sub(V3(.16, .18, .18)));
        (r.tools || []).forEach(t => { if (t.t === 'bar' || t.t === 'trap') { const half = (t.half || .7) + .15, rad = t.pr || .225; pts.push(t.c.clone().add(V3(half, rad, .15)), t.c.clone().add(V3(-half, -rad, -.15))); } else if (t.p) { const pad = t.s ? Math.max(...t.s) / 2 : t.r || .14; pts.push(t.p.clone().add(V3(pad, pad, pad)), t.p.clone().sub(V3(pad, pad, pad))); } if (t.a) pts.push(t.a); if (t.b) pts.push(t.b); }); }
      if (cus.build) { reset(); cus.build(kit, bgG); bgG.updateMatrixWorld(true); new T.Box3().setFromObject(bgG).isEmpty() || (b3 => pts.push(b3.min, b3.max))(new T.Box3().setFromObject(bgG)); }
      const bb = new T.Box3().setFromPoints(pts.concat([V3(0, 0, 0)].map(p => p.setY(0).setZ(pts[0].z)))), c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3());
      fr = {c, sz, rad: Math.max(.75, Math.hypot(sz.y, Math.max(sz.x, sz.z)) / 2 + .08)};
    } else { fr = frame(def, eq, opt); buildBg(def, eq, opt); }
    stage.innerHTML = ''; stage.appendChild(canvas);
    const initial = cus && cus.view ? cus.view : [38, 15];
    let az = initial[0] * RAD, el = initial[1] * RAD, drag = null;
    const size = () => { const w = stage.clientWidth || 340, h = Math.min(420, Math.round(w * .94)); canvas.style.width = '100%'; canvas.style.height = h + 'px'; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    size();
    canvas.onpointerdown = e => { drag = {x: e.clientX, az}; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} };
    canvas.onpointermove = e => { if (drag) { az = drag.az - (e.clientX - drag.x) * .009; stage.closest('.gf').querySelectorAll('[data-act=gfview]').forEach(b => b.setAttribute('aria-pressed', 'false')); finish(); } };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
    const observer = new ResizeObserver(() => { if (stage.isConnected) { size(); finish(); } }); observer.observe(stage);
    const ctl = {
      clock: ms => gtimeline(cus || def, ms),
      draw(ms) {
        if (cus) {
          const u = gtimeline(cus, ms).u;
          reset(); const r = cus.pose(kit, u) || {}; clearGroup(fgG); drawTools(fgG, r.tools);
          return finish();
        }
        const P = gpose(def, ms), save = {...GL}; Object.assign(GL, GL3);
        let lift = 0; if (!def.front) { try { lift = supportLift(gsolve(P)); } finally { Object.assign(GL, save); } } else Object.assign(GL, save);
        const S = pose(def, P, opt, lift);
        drawFg(def, eq, def.front ? null : S, P, opt);
        return finish();
      },
      resize: size,
      view(a = initial[0], e = initial[1]) { az = a * RAD; el = e * RAD; finish(); },
      dispose() { observer.disconnect(); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null; },
    };
    function finish() {
      // distanza che fa stare la scena in altezza e in larghezza (la scena puo' girare: larghezza = lato maggiore in pianta)
      const tv = Math.tan(cam.fov * RAD / 2), th = tv * cam.aspect;
      const right = V3(Math.cos(az), 0, -Math.sin(az)), up = V3(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el));
      const toward = V3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      let dist = 1;
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        const p = V3(x * (fr.sz.x / 2 + .06), y * (fr.sz.y / 2 + .06), z * (fr.sz.z / 2 + .06));
        dist = Math.max(dist, Math.abs(p.dot(right)) / th + p.dot(toward), Math.abs(p.dot(up)) / tv + p.dot(toward));
      }
      cam.position.set(fr.c.x + Math.sin(az) * Math.cos(el) * dist, fr.c.y + Math.sin(el) * dist, fr.c.z + Math.cos(az) * Math.cos(el) * dist);
      cam.lookAt(fr.c);
      shadow.scale.set(2.4, 2.4, 1); shadow.position.set(fr.c.x, .002, fr.c.z);
      R.render(scene, cam);
    }
    return ctl;
  }
  // la definizione dell'esercizio va costruita con le proporzioni del modello (gdef legge GL)
  function def(baseId, eq) { const save = {...GL}; Object.assign(GL, GL3); try { return gdef(baseId, eq); } finally { Object.assign(GL, save); } }
  return {supported, load, mount, def, dbg: () => ({scene, cam, fig, bones, rest, R, meshes, T})};
})();
