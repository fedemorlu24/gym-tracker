// Isolated production-code checks. Synthetic identities; every HTTP request is
// served from this checkout and every WebSocket is intercepted before connecting.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://gym.test';
const marker = '\"><b id=reviewmark>marker</b>';
const seed = {sessions: [], tourSeen: '2026-10-18', badges: {}, settings: {lang: 'it'}};
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.wasm':'application/wasm', '.glb':'model/gltf-binary'};
const results = [];
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
async function snapshot(page) {
  return page.evaluate(async()=>{
    await Promise.all([...pendingWrites]);
    const ps=await photoTx('readonly',s=>s.getAll());
    return {db:JSON.stringify(db),ls:localStorage.getItem(KEY),idb:await idbGet(),
      photos:await Promise.all(ps.map(async p=>({...p,blob:await toDataURL(p.blob)})))};
  });
}
async function test(name,fn,initial) {
  const f=await fresh(initial);
  try {await fn(f.page,f.diag);assert.deepEqual(f.diag.pageerror,[]);assert.deepEqual(f.diag.http,[]);
    assert.deepEqual(f.diag.external,[]);assert.deepEqual(f.diag.failed,[]);assert.deepEqual(f.diag.console,[]);assert.deepEqual(f.diag.sockets,[]);
    results.push({name,status:'pass',...f.diag}); console.log('PASS '+name);
  } catch(e) {console.error(name,f.diag);throw e;} finally {await f.context.close();}
}
const password='synthetic vault passphrase';
async function fixture(page,rollback=false){
  await page.evaluate(async rollback=>{
    const nt=await nostrLoad(),sk=new Uint8Array(32).fill(11),friend=new Uint8Array(32).fill(12);
    const pk=nt.getPublicKey(sk),other=nt.getPublicKey(friend);
    const canvas=document.createElement('canvas');canvas.width=40;canvas.height=30;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#38bdf8';ctx.fillRect(0,0,40,30);
    const data=canvas.toDataURL('image/jpeg'),media=await GymMedia.decodeInlineImage(data);
    db.sessions=[{id:'vault-workout',date:'2026-10-19',name:'Workout to preserve',exercises:[]}];
    db.chat={sk:toHex(sk),pk,tok:'ab'.repeat(12),friends:{[other]:{pk:other,n:'Known friend',added:1,unread:0}},
      msgs:{[other]:[{id:'c'.repeat(64),from:'them',k:'img',d:1,w:40,h:30,t:nowSec()}]},relays:[],sync:0,seen:[],blocked:[]};
    db.chat=GymData.normalizeChat(db.chat);save();await Promise.all([...pendingWrites]);
    await photoTx('readwrite',s=>s.put({id:'c:'+'c'.repeat(64),date:'2026-10-19',pose:'chat',blob:media.blob,data}));
    if(rollback){
      const previous=structuredClone(db),old=new Uint8Array(32).fill(13);previous.chat.sk=toHex(old);previous.chat.pk=nt.getPublicKey(old);
      await storageWrite([STORE],tx=>tx.objectStore(STORE).put({json:JSON.stringify(previous),photos:[],generation:null},STORAGE_ROLLBACK));
    }
  },rollback);
}
async function fillPassword(page,value=password,confirm=value){
  const form=page.locator('#chat-vault-form');await form.waitFor();
  await form.locator('[name=password]').fill(value);
  if(await form.locator('[name=confirm]').count())await form.locator('[name=confirm]').fill(confirm);
  await form.locator('[type=submit]').click();
}
async function startUnlock(page){await page.evaluate(()=>{acts.chatvault();});}
async function unlocked(page){await page.waitForFunction(()=>ChatVault.status()==='unlocked'&&!storageBusy);await ready(page);}
async function stable(page){return page.evaluate(async()=>({sessions:db.sessions,pk:chat().pk,tok:chat().tok,friends:chat().friends,msgs:chat().msgs,
  photos:await Promise.all((await photoTx('readonly',s=>s.getAll())).map(async p=>({id:p.id,date:p.date,pose:p.pose,data:await toDataURL(p.blob)})))}));}
async function wraps(page,count=1,image=false){
 return page.evaluate(async({count,image})=>{
  const nt=await nostrLoad(),friend=new Uint8Array(32).fill(12),canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ea580c';ctx.fillRect(0,0,32,32);const data=canvas.toDataURL('image/jpeg');
  return Array.from({length:count},(_,i)=>{
   const rumor=nt.nip59.createRumor({kind:14,content:JSON.stringify(image?{k:'img',d:data}:{k:'t',x:'Unique queue message '+i}),tags:[['p',chat().pk]],created_at:nowSec()},friend);
   const seal=nt.nip59.createSeal(rumor,friend,chat().pk);
   return {wrap:nt.nip59.createWrap(seal,chat().pk),rewrap:nt.nip59.createWrap(seal,chat().pk),id:rumor.id};
  });
 },{count,image});
}
(async()=>{
 browser=await chromium.launch();fs.mkdirSync(path.join(root,'artifacts/security'),{recursive:true});
 await test('concurrent replay and different wraps of the same photo produce one stored attachment',async page=>{
   await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);
   const [event]=await wraps(page,1,true);
   const state=await page.evaluate(async event=>{
     const put=imgPut;let writes=0;imgPut=async(...args)=>{writes++;return put(...args);};
     const before=(await photoTx('readonly',s=>s.getAll())).length;
     await Promise.all([...Array(20).fill(event.wrap),...Array(10).fill(event.rewrap)].map(w=>chatReceive(w)));
     await chatReceive(event.rewrap);await Promise.all([...pendingWrites]);
     return {writes,added:(await photoTx('readonly',s=>s.getAll())).length-before,messages:Object.values(chat().msgs).flat().filter(m=>m.id===event.id).length,unread:Object.values(chat().friends)[0].unread,active:chatReceiveActive,pending:chatWrapsInFlight.size};
   },event);assert.deepEqual(state,{writes:1,added:1,messages:1,unread:1,active:0,pending:0});
 });
 await test('queue stays bounded, overloaded relay backs off, cursor cannot skip rejected messages',async page=>{
   await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);const events=await wraps(page,80);
   await page.evaluate(events=>{
     window.__events=events;window.__sockets=[];
     window.WebSocket=class {constructor(url){this.url=url;this.readyState=0;this.sent=[];__sockets.push(this);}send(value){this.sent.push(value);}close(){this.readyState=3;this.onclose?.();}open(){this.readyState=1;this.onopen?.();}};
     chat().relays=['wss://queue-one.test','wss://queue-two.test'];chat().sync=123;chatConnect();__sockets.forEach(s=>s.open());
     const load=nostrLoad;const hold=new Promise(resolve=>window.__releaseReceive=resolve);nostrLoad=async()=>{await hold;return load();};window.__restoreLoad=()=>{nostrLoad=load;};
     __events.forEach(({wrap})=>__sockets[0].onmessage?.({data:JSON.stringify(['EVENT','gt',wrap])}));
     __sockets[1].onmessage({data:JSON.stringify(['EOSE','gt'])});
   },events);
   await page.waitForFunction(()=>__sockets[0].readyState===3);
   const bounded=await page.evaluate(()=>{
     relayConnect('wss://queue-one.test');return {active:chatReceiveActive,pending:chatWrapsInFlight.size,queued:chatReceiveQueue.length,bytes:chatReceiveChars<=CHAT_RECEIVE_MAX_CHARS,blocked:chatSyncBlocked,sync:chat().sync,sockets:__sockets.length,retry:relays['wss://queue-one.test'].receiveRetryAt>Date.now()};
   });assert.deepEqual(bounded,{active:2,pending:64,queued:62,bytes:true,blocked:true,sync:123,sockets:2,retry:true});
   await page.evaluate(async()=>{__releaseReceive();__restoreLoad();await Promise.allSettled([...chatOperations]);await Promise.all([...pendingWrites]);});
   await page.waitForFunction(()=>chatReceiveActive===0);
   assert.equal(await page.evaluate(()=>chat().sync),123);
   assert.equal(await page.evaluate(()=>Object.values(chat().msgs).flat().filter(m=>m.x?.startsWith('Unique queue message')).length),64);
   await page.evaluate(async()=>{await Promise.all(__events.slice(64).map(({wrap})=>chatReceive(wrap)));chatDisconnect();chat().relays=[];});
   assert.equal(await page.evaluate(()=>Object.values(chat().msgs).flat().filter(m=>m.x?.startsWith('Unique queue message')).length),80);
 });
 await test('lock cancels queued messages and forged wrap IDs cannot suppress an authentic event',async page=>{
   await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);const [event]=await wraps(page,1);
   const state=await page.evaluate(async event=>{
     const forged={...event.wrap,sig:'0'.repeat(128)};await Promise.all([chatReceive(forged),chatReceive(event.wrap)]);
     return {messages:Object.values(chat().msgs).flat().filter(m=>m.id===event.id).length};
   },event);assert.equal(state.messages,1);
   const events=await wraps(page,8,true);await page.evaluate(events=>{
     const load=nostrLoad;const hold=new Promise(resolve=>window.__releaseReceive=resolve);nostrLoad=async()=>{await hold;return load();};window.__restoreLoad=()=>{nostrLoad=load;};
     window.__prior=JSON.stringify(chat());window.__jobs=Promise.all(events.map(({wrap})=>chatReceive(wrap)));ChatVault.lock();
   },events);
   await page.evaluate(async()=>{__releaseReceive();__restoreLoad();await __jobs;});await page.waitForFunction(()=>chatReceiveActive===0);
   assert.equal(await page.evaluate(()=>JSON.stringify(chat())===__prior),true);assert.equal(await page.evaluate(()=>chatWrapsInFlight.size),0);
 });
 await test('only the subscribed stream and boolean relay acknowledgement are accepted',async page=>{
   await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);const [event]=await wraps(page,1);
   const state=await page.evaluate(async event=>{
     window.__socket=null;window.WebSocket=class{constructor(){this.readyState=0;__socket=this;}send(){}close(){this.readyState=3;}};
     chat().relays=['wss://protocol.test'];chat().sync=42;chatConnect();__socket.readyState=1;__socket.onopen();
     __socket.onmessage({data:JSON.stringify(['EVENT','other',event.wrap])});__socket.onmessage({data:JSON.stringify(['EOSE','other'])});
     const friend=Object.keys(chat().friends)[0],id='d'.repeat(64),wid='e'.repeat(64);chat().msgs[friend].push({id,from:'me',k:'t',x:'outgoing',ok:0,t:nowSec()});pending[wid]=id;
     for(const value of ['true',1,{},false])__socket.onmessage({data:JSON.stringify(['OK',wid,value,'accepted'])});
     const invalidAck=chat().msgs[friend].find(m=>m.id===id).ok,wrongStream=Object.values(chat().msgs).flat().some(m=>m.id===event.id),sync=chat().sync;
     __socket.onmessage({data:JSON.stringify(['OK',wid,true,'accepted'])});
     const accepted=chat().msgs[friend].find(m=>m.id===id).ok;chatDisconnect();chat().relays=[];return {invalidAck,wrongStream,sync,accepted};
   },event);assert.deepEqual(state,{invalidAck:0,wrongStream:false,sync:42,accepted:1});
 });
 fs.writeFileSync(path.join(root,'artifacts/security/chat-queue-results.json'),JSON.stringify({results},null,2));console.log(`${results.length} chat queue groups PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
