// The local fixture serves a pinned v62, the candidate v63, then simulated v64/v65.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawn} = require('node:child_process');
const path = require('node:path');
let fixture;
async function fixtureURL() {
 if (process.env.UPDATE_FIXTURE_URL) return process.env.UPDATE_FIXTURE_URL;
 fixture = spawn('python3', [path.join(__dirname, 'update-server.py')], {stdio: ['ignore', 'pipe', 'inherit']});
 return new Promise((resolve, reject) => {
  let output = '';
  const timeout = setTimeout(() => reject(new Error('Update fixture did not start')), 10000);
  fixture.once('error', e => { clearTimeout(timeout); reject(e); });
  fixture.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//); if (match) { clearTimeout(timeout); resolve(match[0]); } });
 });
}
(async () => {
 const browser = await chromium.launch(); const context = await browser.newContext({locale:'it-IT'}); const page = await context.newPage(); const errors=[];const failed=[],http=[];page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)http.push({url:r.url(),status:r.status()})});
 page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const url=await fixtureURL();
 const version=()=>page.evaluate(async()=>{await navigator.serviceWorker.ready;const c=new MessageChannel();return new Promise(r=>{c.port1.onmessage=e=>r(e.data);navigator.serviceWorker.controller.postMessage('version',[c.port2])})});
 try {
  await context.request.post(url+'__version',{data:'62'});await page.goto(url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  assert.equal(await version(),'62');
  await page.evaluate(async()=>{
   document.getElementById('tour').hidden=true;document.getElementById('install').hidden=true;
   db={tourSeen:1,badges:{},settings:{lang:'it'},sessions:[{id:'update-session',date:'2026-10-18',name:'Preserve workout',exercises:[{id:'update-ex',name:'Squat',sets:[{reps:8,kg:80}]}]}],plans:[{id:'update-plan',name:'Preserve plan',days:[]}],profile:{sex:'m',age:35,weight:80},ts:Date.now()};
   save();await idbPut(JSON.stringify(db));await photoTx('readwrite',s=>s.put({id:'update-photo',date:'2026-10-18',pose:'front',blob:new Blob(['photo bytes preserved'],{type:'image/png'})}));
  });
  const snapshot=()=>page.evaluate(async()=>({local:JSON.parse(localStorage.getItem(KEY)),idb:JSON.parse(await idbGet()),photo:await (await photoTx('readonly',s=>s.get('update-photo'))).blob.text()}));
  const before=await snapshot();
  await context.request.post(url+'__version',{data:'63'});await page.reload();await page.waitForFunction(()=>typeof APP_VERSION!=='undefined'&&APP_VERSION==='63');
  for(let i=0;i<50&&await version()!=='63';i++)await page.waitForTimeout(200);
  assert.equal(await version(),'63');assert.deepEqual(await snapshot(),before);
  // A running installed app notices an update without navigating away from an open form.
  await page.evaluate(()=>{view={name:'settings'};render();sheet('<h2>Unsaved form</h2><input id=update-draft value=preserve-me>');});
  await context.request.post(url+'__version',{data:'64'});
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Nuova versione pronta'));await page.waitForTimeout(1800);assert.equal(await page.locator('#update-draft').inputValue(),'preserve-me');
  assert.equal(await page.evaluate(()=>APP_VERSION),'63');assert.deepEqual(await snapshot(),before);
  await page.evaluate(()=>closeSheet());
  await page.waitForFunction(()=>APP_VERSION==='64');assert.equal(await version(),'64');assert.deepEqual(await snapshot(),before);
  await context.request.post(url+'__version',{data:'65'});await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>APP_VERSION==='65');assert.equal(await version(),'65');assert.deepEqual(await snapshot(),before);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>APP_VERSION==='65');assert.deepEqual(await snapshot(),before);
  await page.evaluate(()=>{view={name:'settings'};render()});await page.locator('[data-act=appupdate]').click();assert.ok((await page.locator('#toast').textContent()).includes('Connettiti'));
  assert.deepEqual(errors,[]);assert.deepEqual(http,[]);assert.deepEqual(failed,[]);
  const result={versions:['62','63','64','65'],localStorage:'identical',indexedDB:'identical',photo:'identical',offline:'pass',automaticActivation:'pass',foregroundCheck:'pass',unsavedForm:'preserved',errors,http,failed};fs.writeFileSync('artifacts/tutorials/verification/update.json',JSON.stringify(result,null,2));console.log(result);
 }finally{await browser.close();fixture?.kill('SIGINT')}
})().catch(e=>{fixture?.kill('SIGINT');console.error(e);process.exitCode=1});
