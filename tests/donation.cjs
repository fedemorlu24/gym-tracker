// UI regression: optional support must never gate playback, sharing or updates.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.GUIDE_URL || 'http://127.0.0.1:8765/';
const coffeeLabels = {it: 'Offrimi un caffè', en: 'Buy me a coffee', es: 'Invítame a un café', fr: 'Offre-moi un café', de: 'Spendier mir einen Kaffee'};
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'it-IT', serviceWorkers: 'block'});
  const errors = [], failed = [], http = [], requests = [];
  context.on('page', page => {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => failed.push([r.url(), r.failure()?.errorText]));
    page.on('response', r => { if (r.status() >= 400) http.push([r.status(), r.url()]); });
    page.on('request', r => requests.push(r.url()));
  });
  // Inspect the real outbound URL in a popup without sending a request to checkout.
  await context.route('https://buymeacoffee.com/**', route => route.fulfill({contentType: 'text/html', body: '<title>Donation destination test</title>'}));
  fs.mkdirSync('artifacts/donation', {recursive: true});
  try {
    const page = await context.newPage(); await page.goto(url);
    await page.evaluate(async () => { await window.gymDataReady; });
    await page.evaluate(() => { document.getElementById('tour').hidden = true; document.getElementById('install').hidden = true; });
    assert.equal(await page.locator('a[href*="buymeacoffee.com"], .donation-card').count(), 0, 'No donation link in Today');
    await page.locator('[data-act=settings]').click();
    assert.equal(await page.locator('.donation-card').count(), 1);
    assert.equal(await page.locator('.donation-card').evaluate(el => el.nextElementSibling === null), true, 'Donation belongs at the end of Settings');
    assert.ok((await page.locator('.donation-button').boundingBox()).height >= 44);
    assert.ok((await page.locator('.donation-card').textContent()).includes('Donazione facoltativa'));
    const snapshot = await page.evaluate(() => JSON.stringify(db));
    const popupReady = context.waitForEvent('page');
    await page.locator('.donation-button').click();
    const popup = await popupReady; await popup.waitForLoadState();
    assert.equal(popup.url(), 'https://buymeacoffee.com/fedemorlu24');
    assert.equal(await popup.evaluate(() => window.opener), null);
    await popup.close();
    assert.equal(await page.evaluate(() => JSON.stringify(db)), snapshot);
    for (const lang of ['it', 'en', 'es', 'fr', 'de']) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(({lang, theme}) => { db.settings = {...db.settings, lang, theme}; setLang(); applyTheme(); }, {lang, theme});
        for (const name of ['home', 'settings']) {
          await page.evaluate(name => { view = {name, tab: 'today'}; render(); }, name);
          if (name === 'settings') {
            assert.equal((await page.locator('.donation-button').innerText()).replace(/\s+/g, ' ').trim(), `☕ ${coffeeLabels[lang]}`);
            assert.equal(await page.locator('.donation-copy p').innerText(), await page.evaluate(() => t('donateText')));
          }
          for (const width of [320, 390, 768]) {
            await page.setViewportSize({width, height: 844});
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang}/${theme}/${width}/${name}`);
            if (name === 'home') assert.equal(await page.locator('a[href*="buymeacoffee.com"], .donation-card').count(), 0, `${lang}/${theme}/${width}: no donation in Today`);
            else assert.ok(!(await page.locator('.donation-card').textContent()).includes('undefined'));
          }
        }
      }
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => { db.settings.lang = 'it'; db.settings.theme = 'dark'; setLang(); applyTheme(); view = {name: 'home', tab: 'today'}; render(); });
    await page.screenshot({path: 'artifacts/donation/home-mobile.png'});
    await page.locator('[data-act=settings]').click();
    const placement = await page.locator('.donation-card').evaluate(el => ({last: el.nextElementSibling === null, afterUpdate: !!el.previousElementSibling.querySelector('[data-act=appupdate]')}));
    assert.deepEqual(placement, {last: true, afterUpdate: true});
    await page.locator('.donation-card').scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/donation/settings-mobile.png'});
    await page.evaluate(() => sheetLibBase('fullbody.deadlift'));
    await page.waitForSelector('.gf-3d');
    assert.equal(await page.locator('#gf-seek').isEnabled(), true);
    assert.equal(await page.locator('#gf-speed').isEnabled(), true);
    await page.evaluate(() => { guidePlayback(false); gfMs = 7000; gfDraw(gfMs); });
    // The 3D container exists before its asynchronous model/decoder load finishes.
    // Wait for real playback progress, including on a busy test machine.
    await page.waitForFunction(() => !gfPaused && gfMs > 7000);
    assert.ok(await page.evaluate(() => !gfPaused && gfMs > 7000), 'No preview time limit');
    const ungated = await page.evaluate(() => Object.keys(BASE).filter(id => GMAP[id]).every(id => {
      const html = guidePanel(id, BASE[id].variants[0].eq);
      return html.includes('gf-seek') && html.includes('gfshare') && !/support|preview|unlock/.test(html);
    }));
    assert.equal(ungated, true);
    await page.evaluate(() => { window.sharedTutorial = null; Object.defineProperty(navigator, 'share', {configurable: true, value: async data => { window.sharedTutorial = data; }}); });
    await page.locator('[data-act=gfshare]').click();
    const shared = await page.evaluate(() => window.sharedTutorial);
    assert.equal(shared.url, 'https://fedemorlu24.github.io/gym-tracker/#tutorial=fullbody.deadlift&eq=barbell');
    // Desktop copy fallback. Both routes are exercised without messaging anybody.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', {configurable: true, value: undefined});
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async value => { window.copiedTutorial = value; }}});
    });
    await page.locator('[data-act=gfshare]').click();
    assert.equal(await page.evaluate(() => window.copiedTutorial), shared.url);
    // A recipient in a fresh page opens the complete tutorial immediately, even before onboarding.
    const recipient = await context.newPage(); await recipient.goto(url + new URL(shared.url).hash);
    await recipient.waitForSelector('.gf-3d');
    assert.equal(await recipient.locator('#gf').getAttribute('data-b'), 'fullbody.deadlift');
    assert.equal(await recipient.locator('#gf-seek').isEnabled(), true);
    assert.equal(await recipient.locator('#tour').isVisible(), false);
    await recipient.evaluate(() => { location.hash = 'tutorial=fullbody.sumoDeadlift&eq=not-an-equipment'; });
    await recipient.waitForFunction(() => document.getElementById('gf').dataset.b === 'fullbody.sumoDeadlift');
    assert.equal(await recipient.locator('#gf').getAttribute('data-eq'), 'barbell');
    await recipient.close();
    // Synthetic histories only: the optional invitation belongs to the third summary,
    // not the third set, an empty session, or a reopened older workout.
    async function summary(count, current = count, lang = 'it', reset = true) {
      await page.evaluate(({count, current, lang, reset}) => {
        if (reset) delete db.donationNudgeSeen;
        db.tourSeen = 1;
        db.sessions = Array.from({length: count}, (_, i) => ({id: `support-${i + 1}`, date: today(), name: `Workout ${i + 1}`,
          exercises: [{id: `ex-${i}`, name: 'Squat', sets: [{reps: 8, kg: 40}, {reps: 8, kg: 40}, {reps: 8, kg: 40}]}]}));
        db.sessions.push({id: 'empty-workout', date: today(), name: 'Empty draft', exercises: [{id: 'empty-ex', name: 'Squat', sets: []}]});
        db.settings.lang = lang; setLang(); libByName = null;
        view = {name: 'session', id: current === 'empty' ? 'empty-workout' : `support-${current}`}; render();
      }, {count, current, lang, reset});
      if (current !== 'empty') await page.locator('[data-act=summary]').click();
    }
    for (const [count, current] of [[1, 1], [2, 2], [3, 1], [3, 2], [4, 4], [4, 3]]) {
      await page.evaluate(() => closeSheet()); await page.waitForTimeout(280);
      await summary(count, current);
      assert.equal(await page.locator('.donation-summary').count(), 0, `${count} sessions / summary ${current}`);
      assert.equal(await page.evaluate(() => !!db.donationNudgeSeen), false);
    }
    await page.evaluate(() => closeSheet()); await page.waitForTimeout(280);
    await summary(2, 'empty');
    assert.equal(await page.locator('[data-act=summary]').isDisabled(), true);
    for (const lang of Object.keys(coffeeLabels)) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { closeSheet(); db.settings.theme = theme; applyTheme(); }, theme); await page.waitForTimeout(280);
        await summary(3, 3, lang);
        assert.equal(await page.locator('.donation-summary').count(), 1);
        assert.equal((await page.locator('.donation-summary a').innerText()).replace(/\s+/g, ' ').trim(), `☕ ${coffeeLabels[lang]}`);
        for (const width of [320, 390, 768]) {
          await page.setViewportSize({width, height: 844});
          assert.ok(await page.locator('#sheet .pane').evaluate(el => el.scrollWidth <= el.clientWidth), `${lang}/${theme}/${width} summary overflow`);
        }
      }
    }
    await page.evaluate(() => closeSheet()); await page.waitForTimeout(280);
    await page.setViewportSize({width: 390, height: 844});
    await summary(3);
    assert.equal(await page.locator('.donation-summary .donation-copy p').innerText(), 'Ti è utile Gym Tracker? Sostieni lo sviluppo con un piccolo contributo.');
    await page.locator('.donation-summary').scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/donation/third-workout-mobile.png'});
    await page.evaluate(async () => { await Promise.all([...pendingWrites]); });
    assert.equal(await page.evaluate(async () => JSON.parse(await idbGet()).donationNudgeSeen), true);
    const sessionsBefore = await page.evaluate(() => JSON.stringify(db.sessions));
    const coffeePopupReady = context.waitForEvent('page');
    await page.locator('.donation-summary a').click();
    const coffeePopup = await coffeePopupReady; await coffeePopup.waitForLoadState();
    assert.equal(coffeePopup.url(), 'https://buymeacoffee.com/fedemorlu24');
    assert.equal(await coffeePopup.evaluate(() => window.opener), null); await coffeePopup.close();
    await page.locator('[data-act=finish]').click();
    await page.waitForTimeout(280);
    await page.evaluate(() => { view = {name: 'session', id: 'support-3'}; render(); });
    await page.locator('[data-act=summary]').click();
    assert.equal(await page.locator('.donation-summary').count(), 0, 'No invitation on reopening');
    await page.reload();
    await page.evaluate(() => { view = {name: 'session', id: 'support-3'}; render(); });
    await page.locator('[data-act=summary]').click();
    assert.equal(await page.locator('.donation-summary').count(), 0, 'Seen state survives app restart');
    assert.equal(await page.evaluate(() => JSON.stringify(db.sessions)), sessionsBefore);
    assert.equal(await page.evaluate(() => clean(JSON.parse(JSON.stringify(db))).donationNudgeSeen), true, 'Backup import preserves seen state');
    assert.equal(requests.filter(x => /supporter|\/access\/|resend|webhooks/.test(x)).length, 0);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(http, []);
    const result = {pass: true, errors, failed, http, checks: ['no donation link in Today; optional support at the bottom of Settings', 'correct safe outbound link', 'five languages, light/dark, 320/390/768px', 'third recorded workout only, once across reopening/restart/backup', 'empty sessions excluded, earlier/later summaries unaffected', 'full playback for all 131 tutorials', 'native share and copy fallback', 'recipient link and invalid equipment fallback']};
    fs.writeFileSync('artifacts/donation/browser.json', JSON.stringify(result, null, 2)); console.log(result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
