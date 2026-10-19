const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),origin='https://gym.test',releaseDir=path.join(root,'artifacts/release-v76');fs.mkdirSync(releaseDir,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.wasm':'application/wasm','.glb':'model/gltf-binary'};
(async()=>{
 const browser=await chromium.launch(),context=await browser.newContext({locale:'it-IT',viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 const diag={console:[],pageerror:[],failed:[],http:[],external:[],sockets:[]};
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){diag.external.push(u.href);return route.abort();}const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'missing'});return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});});
 await context.routeWebSocket('**',socket=>{diag.sockets.push(socket.url());socket.close();});
 await context.addInitScript(()=>{window.__confirmAnswer=false;window.confirm=()=>window.__confirmAnswer;window.alert=()=>{};});
 page.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});page.on('pageerror',e=>diag.pageerror.push(e.message));page.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});
 try{
  await page.goto(origin+'/');await page.waitForFunction(()=>gymBooted===true);await page.evaluate(async()=>{await gymDataReady;await Promise.all([...pendingWrites]);document.getElementById('tour').hidden=true;document.getElementById('install').hidden=true;});
  const seed=await page.evaluate(async()=>{
   const nt=await nostrLoad(),sk=new Uint8Array(32).fill(21),friend=new Uint8Array(32).fill(22),pk=nt.getPublicKey(sk),other=nt.getPublicKey(friend),mid='d'.repeat(64),vault=await ChatVault.sealLegacy(toHex(sk),'oldpass123',pk);
   db.sessions=[{id:'keep-workout',date:'2026-10-19',name:'Workout to preserve',exercises:[]}];db.chat={pk,vault,tok:'ab'.repeat(12),friends:{[other]:{pk:other,n:'Old friend',added:1,unread:0}},msgs:{[other]:[{id:mid,from:'them',k:'img',d:1,w:1,h:1,t:1}]},relays:['wss://nos.lol'],sync:0,seen:[],blocked:[]};save();await Promise.all([...pendingWrites]);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
   await photoTx('readwrite',s=>{s.put({id:'c:'+mid,date:'2026-10-19',pose:'chat',blob});s.put({id:'workout-photo',date:'2026-10-19',pose:'front',blob});});ChatVault.refresh();go({name:'home',tab:'chat'});return {pk,mid};
  });
  if(process.env.PROTECT_ARCHIVE==='1')await page.evaluate(()=>protectWholeArchive('synthetic archive passphrase'));
  assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');
  assert.equal(await page.locator('[data-act=chatvault]').count(),0);assert.equal((await page.locator('#app').innerText()).includes('Sblocca la chat'),false);
  assert.equal(await page.locator('[data-act=chatresetidentity]').innerText(),'Crea una nuova chat senza password');
  await page.locator('[data-act=chatresetidentity]').locator('xpath=..').screenshot({path:path.join(releaseDir,'locked-chat-mobile.png')});
  await page.locator('[data-act=chatresetidentity]').click();await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');assert.equal(await page.evaluate(()=>chat().pk),seed.pk);
  await page.evaluate(()=>window.__confirmAnswer=true);await page.locator('[data-act=chatresetidentity]').click();
  await page.waitForFunction(()=>ChatVault.status()==='unlocked'&&!storageBusy&&chat().pk!==undefined&&chat().pk!=='' );
  const result=await page.evaluate(async()=>({pk:chat().pk,sk:chat().sk,vault:chat().vault,friends:Object.keys(chat().friends),messages:Object.keys(chat().msgs),status:ChatVault.status(),sessions:db.sessions,photos:(await photoTx('readonly',s=>s.getAll())).map(p=>p.id),tab:document.querySelector('[data-tab=chat]')?.getAttribute('aria-selected')}));
  assert.notEqual(result.pk,seed.pk);assert.ok(result.sk);assert.equal(result.vault,undefined);assert.deepEqual(result.friends,[]);assert.deepEqual(result.messages,[]);assert.equal(result.status,'unlocked');assert.equal(result.sessions[0].name,'Workout to preserve');assert.deepEqual(result.photos,['workout-photo']);assert.equal(result.tab,'true');
  await page.reload();if(process.env.PROTECT_ARCHIVE==='1'){const f=page.locator('#archive-unlock-form');await f.waitFor();await f.locator('[name=password]').fill('synthetic archive passphrase');await f.locator('[type=submit]').click();}await page.waitForFunction(()=>gymBooted===true&&ChatVault.status()==='unlocked');assert.equal(await page.evaluate(()=>chat().pk),result.pk);assert.equal(await page.evaluate(()=>ChatVault.isProtected()),false);
  for(const k of ['console','pageerror','failed','http','external'])assert.deepEqual(diag[k],[],k);assert.ok(diag.sockets.length>0);diag.socketNote='Nostr WebSockets intercepted and closed; no real messages sent.';
  diag.result={version:await page.evaluate(()=>APP_VERSION),wholeArchiveProtected:process.env.PROTECT_ARCHIVE==='1',confirmationCanCancelWithoutChanges:true,newIdentityWithoutPassword:true,workoutPreserved:true,chatMessagesAndPhotosCleared:true,reloadPreservedIdentity:true};console.log(JSON.stringify(diag,null,2));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
