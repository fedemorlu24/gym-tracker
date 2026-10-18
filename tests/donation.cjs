// UI regression: optional support must never gate playback, sharing or updates.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.GUIDE_URL || 'http://127.0.0.1:8765/';
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
    await page.evaluate(() => { document.getElementById('tour').hidden = true; document.getElementById('install').hidden = true; });
    assert.equal(await page.locator('.donation-card').count(), 1);
    const card = await page.locator('.donation-card').boundingBox();
    assert.ok(card.y + card.height < 650, 'Donation should be visible on the first phone screen');
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
        await page.evaluate(({lang, theme}) => { db.settings = {...db.settings, lang, theme}; setLang(); applyTheme(); view = {name: 'today'}; render(); }, {lang, theme});
        for (const width of [320, 390, 768]) {
          await page.setViewportSize({width, height: 844});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${lang}/${theme}/${width}`);
          assert.ok(!(await page.locator('.donation-card').textContent()).includes('undefined'));
        }
      }
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => { db.settings.lang = 'it'; db.settings.theme = 'dark'; setLang(); applyTheme(); render(); });
    await page.screenshot({path: 'artifacts/donation/home-mobile.png'});
    await page.locator('[data-act=settings]').click();
    const placement = await page.locator('.donation-card').evaluate(el => ({previous: el.previousElementSibling.tagName, y: el.getBoundingClientRect().top}));
    assert.equal(placement.previous, 'HEADER'); assert.ok(placement.y < 200);
    await page.screenshot({path: 'artifacts/donation/settings-mobile.png'});
    await page.evaluate(() => sheetLibBase('fullbody.deadlift'));
    await page.waitForSelector('.gf-3d');
    assert.equal(await page.locator('#gf-seek').isEnabled(), true);
    assert.equal(await page.locator('#gf-speed').isEnabled(), true);
    await page.evaluate(() => { guidePlayback(false); gfMs = 7000; gfDraw(gfMs); });
    await page.waitForTimeout(250);
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
    assert.equal(requests.filter(x => /supporter|\/access\/|resend|webhooks/.test(x)).length, 0);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(http, []);
    const result = {pass: true, errors, failed, http, checks: ['visible optional support', 'correct safe outbound link', 'five languages, light/dark, 320/390/768px', 'full playback for all 131 tutorials', 'native share and copy fallback', 'recipient link and invalid equipment fallback']};
    fs.writeFileSync('artifacts/donation/browser.json', JSON.stringify(result, null, 2)); console.log(result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
