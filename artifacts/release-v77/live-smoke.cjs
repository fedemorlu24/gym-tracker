const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url='https://fedemorlu24.github.io/gym-tracker/',out=__dirname;
(async()=>{
 const browser=await chromium.launch(),context=await browser.newContext({locale:'it-IT',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),diag={console:[],pageerror:[],failed:[],http:[],external:[],sockets:[],dialogs:[]};
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==new URL(url).origin){diag.external.push(r.request().url());return r.abort();}return r.continue();});
 await context.routeWebSocket('**',s=>{diag.sockets.push(s.url());s.close();});
 page.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});page.on('pageerror',e=>diag.pageerror.push(e.message));page.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});page.on('dialog',async d=>{diag.dialogs.push(d.message());await d.accept();});
 try{
  await page.goto(url);await page.waitForFunction(()=>gymBooted===true&&!document.body.hidden&&APP_VERSION==='77',{},{timeout:90000});
  const install=page.locator('#install [data-act=installclose]');if(await install.isVisible().catch(()=>false))await install.tap();const tour=page.locator('#tour [data-act=tourend]');if(await tour.isVisible().catch(()=>false))await tour.tap();
  await page.locator('[data-tab=chat]').tap();
  const old=await page.evaluate(async()=>{await gymDataReady;await Promise.all([...pendingWrites]);const nt=await nostrLoad(),sk=new Uint8Array(32).fill(21),friend=new Uint8Array(32).fill(22),pk=nt.getPublicKey(sk),other=nt.getPublicKey(friend),mid='d'.repeat(64),vault=await ChatVault.sealLegacy(toHex(sk),'forgotten-synthetic8',pk);db.sessions=[{id:'keep-workout',date:'2026-10-19',name:'Workout to preserve',exercises:[]}];db.chat={pk,vault,tok:'ab'.repeat(12),friends:{[other]:{pk:other,n:'Synthetic friend',added:1,unread:0}},msgs:{[other]:[{id:mid,from:'them',k:'img',d:1,w:1,h:1,t:1}]},relays:['wss://nos.lol'],sync:0,seen:[],blocked:[]};save();await Promise.all([...pendingWrites]);const canvas=document.createElement('canvas');canvas.width=canvas.height=2;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));await photoTx('readwrite',s=>{s.put({id:'c:'+mid,date:'2026-10-19',pose:'chat',blob});s.put({id:'workout-photo',date:'2026-10-19',pose:'front',blob});});ChatVault.refresh();return {pk};});
  await page.reload();await page.waitForFunction(()=>gymBooted===true&&ChatVault.status()==='locked');await page.locator('[data-tab=chat]').tap();
  const lockedText=await page.locator('#app').innerText();assert.ok(!lockedText.includes('Sblocca la chat'));assert.equal(await page.locator('[data-act=chatvault]').count(),0);assert.equal(await page.locator('[data-act=chatresetidentity]').innerText(),'Crea una nuova chat');await page.locator('[data-act=chatresetidentity]').screenshot({path:path.join(out,'live-locked-button.png')});
  await page.locator('[data-act=chatresetidentity]').tap();await page.waitForFunction(()=>ChatVault.status()==='unlocked'&&!storageBusy&&chat().pk!==undefined);const state=await page.evaluate(async()=>({pk:chat().pk,raw:!!chat().sk,vault:!!chat().vault,friends:Object.keys(chat().friends).length,msgs:Object.keys(chat().msgs).length,sessions:db.sessions.map(s=>s.name),photos:(await photoTx('readonly',s=>s.getAll())).map(p=>p.id)}));
  assert.notEqual(state.pk,old.pk);assert.equal(state.raw,true);assert.equal(state.vault,false);assert.equal(state.friends,0);assert.equal(state.msgs,0);assert.deepEqual(state.sessions,['Workout to preserve']);assert.deepEqual(state.photos,['workout-photo']);
  await page.reload();await page.waitForFunction(()=>gymBooted===true&&APP_VERSION==='77'&&ChatVault.status()==='unlocked');assert.equal(await page.evaluate(()=>chat().pk),state.pk);
  assert.ok(diag.dialogs.some(x=>x.includes('perderai contatti')));for(const k of ['console','pageerror','failed','http','external'])assert.deepEqual(diag[k],[],k);assert.ok(diag.sockets.length>0);
  diag.result={version:77,lockedButtonRemoved:true,confirmedResetCreatedNewPasswordlessIdentity:true,workoutPreserved:true,chatPhotosRemoved:true,reloadPreservedNewIdentity:true};diag.socketNote='Nostr WebSockets intercepted and closed; no real messages sent.';
  fs.writeFileSync(path.join(out,'live-smoke.json'),JSON.stringify(diag,null,2)+'\n');console.log(JSON.stringify(diag,null,2));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
