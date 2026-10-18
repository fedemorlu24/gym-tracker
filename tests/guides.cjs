// Run against a local http.server with npm run test:guides.
// GUIDE_URL can target a preview or the deployed app. No user data is imported.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.GUIDE_URL || 'http://127.0.0.1:8765/';
const out = path.resolve('artifacts/tutorials/verification');
fs.mkdirSync(out, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const errors = [], failures = [], responses = [], checks = [];
  const context = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'it-IT', serviceWorkers: 'block'});
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failures.push({url: r.url(), error: r.failure()?.errorText}));
  page.on('response', r => { if (r.status() >= 400) responses.push({url: r.url(), status: r.status()}); });
  try {
    await page.goto(url);
    await page.evaluate(() => { document.getElementById('tour').hidden = true; document.getElementById('install').hidden = true; sheetLibBase('fullbody.deadlift'); });
    await page.waitForSelector('.gf-3d');
    const manifest = await page.evaluate(async () => {
      const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
      return {name: m.name, short: m.short_name, apple: document.querySelector('meta[name=apple-mobile-web-app-title]').content};
    });
    assert.deepEqual(manifest, {name: 'Gym-Tracker', short: 'Gym-Tracker', apple: 'Gym-Tracker'});
    checks.push('installation name');
    await page.locator('#gf-play').click();
    assert.equal(await page.evaluate(() => gfPaused), true);
    await page.locator('#gf-seek').evaluate(el => { el.value = '250'; el.dispatchEvent(new Event('input', {bubbles: true})); });
    const paused = await page.evaluate(() => gfMs);
    await sleep(250);
    assert.equal(await page.evaluate(() => gfMs), paused);
    await page.locator('[data-view=side]').click();
    assert.equal(await page.locator('[data-view=side]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => gfMs), paused);
    await page.locator('#gf-speed').selectOption('0.5');
    await page.locator('[data-act=gfrestart]').click();
    assert.equal(await page.evaluate(() => gfMs), 0);
    await page.locator('#gf-play').click();
    const elapsed = await page.evaluate(async () => { const start = performance.now(), ms = gfMs; await new Promise(r => setTimeout(r, 700)); return [(gfMs - ms) / (performance.now() - start), gfSpeed]; });
    assert.ok(elapsed[0] > .2 && elapsed[0] < .65, JSON.stringify(elapsed));
    await page.locator('#gf-play').click();
    checks.push('pause, seek, camera while paused, restart, half speed');
    await page.evaluate(() => { sheetLibBase('biceps.curl'); guidePlayback(true); });
    await page.waitForSelector('.gf-3d');
    await page.locator('#gf-speed').selectOption('0.75');
    await page.locator('[data-act=gfeq][data-eq=dumbbell]').click();
    await page.waitForSelector('.gf-3d');
    assert.deepEqual(await page.evaluate(() => [gfPaused, gfSpeed, document.getElementById('gf').dataset.eq]), [true, .75, 'dumbbell']);
    checks.push('equipment switch preserves pause and speed');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({width, height: 900});
      await sleep(100);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
      await page.locator('#gf').screenshot({path: path.join(out, `player-${width}.png`)});
    }
    checks.push('responsive layout at 320, 390, 768, 1280 pixels');
    await page.evaluate(() => closeSheet());
    assert.equal(await page.evaluate(() => gf3 === null && gfDraw === null), true);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.evaluate(() => sheetLibBase('fullbody.powerClean'));
    await page.waitForSelector('.gf-3d');
    assert.equal(await page.evaluate(() => gfPaused), true);
    checks.push('close cleanup and reduced motion');

    // Sample the actual skeleton and attached tool targets, including cyclical extrema.
    const audit = await page.evaluate(() => {
      guidePlayback(true);
      const original = MOVES3D.get, rows = [], joints = ['root', 'head', 'uarm.l', 'uarm.r', 'farm.l', 'farm.r', 'hand.l', 'hand.r', 'thigh.l', 'thigh.r', 'shin.l', 'shin.r', 'foot.l', 'foot.r'];
      // Numeric sampling needs the actual pose/IK and props, not 20,000 GPU draws.
      // Rendering and interactions are exercised above and in visual reviews.
      const renderer = G3D.dbg().R, render = renderer.render;
      renderer.render = () => {};
      let sampleU, captures, current;
      MOVES3D.get = (id, eq) => {
        const m = original(id, eq), pose = m.pose;
        m.pose = (k, u) => {
          const targets = [];
          const kit = {...k, arm(s, at, pole, palm, wrist) { k.arm(s, at, pole, palm, wrist); targets.push({side: s, error: k.wp('hand.' + s).addScaledVector(k.curDir('hand.' + s), .065).distanceTo(at)}); }};
          const result = pose(kit, sampleU ?? u);
          captures = {joints: joints.map(n => k.wp(n).toArray()), targets, tools: result?.tools || []};
          return result;
        }; return m;
      };
      try {
        gf3.dispose();
        for (const [id, base] of Object.entries(BASE)) {
          if (!MOVES3D.MAP[id]) continue;
          for (const eq of [...new Set(base.variants.map(v => v.eq))].filter(eq => gdef(id, eq))) {
            sampleU = undefined;
            current = G3D.mount(document.getElementById('gf-stage'), id, eq, G3D.def(id, eq));
            let previous, jump = 0, jumpAt = 0, jumpJoint = 0, grip = 0, finite = true, toolCount = 0;
            for (let i = 0; i <= 60; i++) {
              sampleU = i / 60; current.draw(0);
              finite &&= captures.joints.flat().every(Number.isFinite);
              grip = Math.max(grip, ...captures.targets.map(t => t.error));
              toolCount = Math.max(toolCount, captures.tools.length);
              if (previous) captures.joints.forEach((p, j) => { const d = Math.hypot(...p.map((v, n) => v - previous[j][n])); if (d > jump) { jump = d; jumpAt = i / 60; jumpJoint = j; } });
              previous = captures.joints;
            }
            // A fast continuous phase is valid; zoom into the largest step to detect teleports.
            let discontinuity = 0;
            if (jump > .20) {
              let last;
              for (let i = 0; i <= 120; i++) {
                sampleU = jumpAt - 1 / 60 + i / 7200; current.draw(0);
                const point = captures.joints[jumpJoint];
                if (last) discontinuity = Math.max(discontinuity, Math.hypot(...point.map((v, n) => v - last[n])));
                last = point;
              }
            }
            rows.push({id, eq, finite, grip, jump, discontinuity, toolCount}); current.dispose(); current = null;
          }
        }
      } finally { current?.dispose(); MOVES3D.get = original; renderer.render = render; }
      return rows;
    });
    fs.writeFileSync(path.join(out, 'poses.json'), JSON.stringify(audit, null, 2));
    assert.equal(new Set(audit.map(r => r.id)).size, 131);
    assert.ok(audit.every(r => r.finite), 'nonfinite pose');
    const badGrips = audit.filter(r => r.grip > .09), jumps = audit.filter(r => r.discontinuity > .025);
    assert.deepEqual(badGrips, [], 'hand target outside reach');
    assert.deepEqual(jumps, [], 'discontinuous movement');
    checks.push(`131 movements, ${audit.length} equipment combinations, 61 poses each`);
    const fallback = await page.evaluate(() => {
      const invalid = [];
      for (const [id, base] of Object.entries(BASE)) for (const eq of new Set(base.variants.map(v => v.eq))) {
        const d = gdef(id, eq);
        for (let i = 0; i < 24; i++) if (/NaN|undefined|Infinity/.test(gsvg(d, gpose(d, gtimeline(d, 0).duration * i / 24), eq, false))) invalid.push({id, eq, i});
      }
      const wristRise = id => { const d = gdef(id, 'barbell'); return gsolve(d.poses[0]).w[1] - gsolve(d.poses.at(-1)).w[1]; };
      const d = gdef('fullbody.pushPress', 'barbell'), top = gsolve(d.poses.at(-1));
      return {invalid, rowRise: wristRise('back.bentOverRow'), cleanRise: wristRise('fullbody.powerClean'), pressAboveHead: top.w[1] < top.head[1]};
    });
    assert.deepEqual(fallback.invalid, []);
    assert.ok(fallback.rowRise > 15 && fallback.cleanRise > 60 && fallback.pressAboveHead, JSON.stringify(fallback));
    checks.push('SVG fallback: all equipment combinations finite; row, clean rack and overhead lockout regressions');
    assert.deepEqual(errors, []); assert.deepEqual(failures, []); assert.deepEqual(responses, []);
    console.log(JSON.stringify({checks, errors, failures, responses}, null, 2));
  } finally {
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify({checks, errors, failures, responses}, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
