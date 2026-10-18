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
const archivePassword='synthetic archive passphrase';
async function protect(page, ui=false){
 if(ui){
  await page.evaluate(()=>acts.archiveprotect());const form=page.locator('#archive-setup-form');
  await form.locator('[name=password]').fill(archivePassword);await form.locator('[name=confirm]').fill(archivePassword);
  await form.locator('[type=submit]').click();await page.waitForFunction(()=>archiveHeader&&!archiveLocked&&!storageBusy);
 }else await page.evaluate(p=>protectWholeArchive(p),archivePassword);
}
async function unlockApp(page,p=archivePassword){
 const form=page.locator('#archive-unlock-form');await form.waitFor();
 await form.locator('[name=password]').fill(p);await form.locator('[type=submit]').click();
}
async function raw(page){return page.evaluate(async()=>JSON.stringify(await storageRawSnapshot(true)));}
async function encrypted(page){
 const state=await page.evaluate(async archivePassword=>{
  await Promise.all([...pendingWrites]);const raw=await storageRawSnapshot(true),ls=localStorage.getItem(KEY),joined=JSON.stringify(raw)+ls;
  return {header:ArchiveVault.validate(raw.header).it,sealed:JSON.parse(raw.json).av===1,
   photos:raw.photos.every(p=>Object.keys(p).sort().join(',')==='id,sealed'&&p.sealed.av===1),
   rollback:!raw.rollback||raw.rollback.av===1,rest:localStorage.getItem('gym-rest'),
   exposed:['0b'.repeat(32),'0d'.repeat(32),'Workout to preserve','Known friend','PRIVATE-MESSAGE-CANARY',archivePassword].filter(x=>joined.includes(x))};
 },archivePassword);
 assert.deepEqual(state,{header:600000,sealed:true,photos:true,rollback:true,rest:null,exposed:[]});
}
(async()=>{
 browser=await chromium.launch();fs.mkdirSync(path.join(root,'artifacts/security'),{recursive:true});
 await test('whole archive migration, manual lock and reload preserve identity, photos and rollback without plaintext storage',async page=>{
  await fixture(page,true);await page.evaluate(async()=>{
   const ph=(await photoTx('readonly',s=>s.getAll()))[0];await photoTx('readwrite',s=>s.put({...ph,id:'progress-one',pose:POSES[0]}));
   chat().msgs[Object.keys(chat().friends)[0]].push({id:'e'.repeat(64),from:'them',k:'t',x:'PRIVATE-MESSAGE-CANARY',t:nowSec()});
   localStorage.setItem('gym-rest','PRIVATE-REST-CANARY');save();await Promise.all([...pendingWrites]);await loadPhotos();
  });const before=await stable(page);
  await protect(page,true);assert.deepEqual(await stable(page),before);await encrypted(page);
  const rb=await page.evaluate(async()=>JSON.parse((await storageSnapshot(true)).rollback.json).chat.sk);assert.equal(rb,'0d'.repeat(32));
  await page.evaluate(()=>{go({name:'chat',id:Object.keys(chat().friends)[0]});});
  await page.locator('.cimg').click();await page.waitForFunction(()=>document.querySelector('#sheet .big-img')?.naturalWidth===40);
  await page.evaluate(()=>closeSheet());await page.evaluate(()=>lockWholeArchive());
  assert.deepEqual(await page.evaluate(()=>({sessions:db.sessions.length,photos:photos.length,cache:Object.keys(imgCache).length,key:!!archiveSession,body:document.body.innerText.includes('PRIVATE-MESSAGE-CANARY'),images:document.querySelectorAll('#app img,#sheet img').length})),{sessions:0,photos:0,cache:0,key:false,body:false,images:0});
  const locked=await raw(page);await unlockApp(page,'wrong password');await page.waitForFunction(()=>document.querySelector('#archive-error').textContent.length>0);
  assert.equal(await raw(page),locked);assert.equal(await page.evaluate(()=>archiveLocked),true);
  await page.screenshot({path:path.join(root,'artifacts/security/archive-locked.png')});
  await unlockApp(page);await page.waitForFunction(()=>!archiveLocked&&!storageBusy);assert.deepEqual(await stable(page),before);
  await page.reload();await page.locator('#archive-gate').waitFor();assert.equal(await page.evaluate(()=>archiveSession===null&&db.sessions.length===0),true);
  await unlockApp(page);await ready(page);assert.deepEqual(await stable(page),before);await encrypted(page);
 });
 await test('protected writes, photo deletion and chat key migration keep storage encrypted and friends photos usable',async page=>{
  await fixture(page,true);await protect(page);const pk=await page.evaluate(()=>chat().pk);
  await page.evaluate(p=>ChatVault.setup(p),password);await unlocked(page);assert.equal(await page.evaluate(()=>chat().pk),pk);
  const state=await page.evaluate(async()=>{
   db.sessions[0].name='PRIVATE-MESSAGE-CANARY';save();await Promise.all([...pendingWrites]);
   const nt=await nostrLoad(),sk=new Uint8Array(32).fill(12),ph=(await photoTx('readonly',s=>s.getAll()))[0];
   const rumor=nt.nip59.createRumor({kind:14,content:JSON.stringify({k:'img',d:ph.data}),tags:[['p',chat().pk]],created_at:nowSec()},sk);
   await chatReceive(nt.nip59.createWrap(nt.nip59.createSeal(rumor,sk,chat().pk),chat().pk));
   const row=await photoTx('readonly',s=>s.get('c:'+rumor.id));
   await photoTx('readwrite',s=>s.put({...ph,id:'temporary-progress',pose:POSES[0]}));
   await photoTx('readwrite',s=>s.delete('temporary-progress'));
   return {photo:row?.blob?.size>0,count:(await photoTx('readonly',s=>s.getAll())).length};
  });assert.deepEqual(state,{photo:true,count:2});await encrypted(page);
  await page.evaluate(()=>{go({name:'chat',id:Object.keys(chat().friends)[0]});});
  await page.waitForFunction(()=>document.querySelectorAll('.cimg').length===2);
  await page.locator('.cimg').last().click();await page.waitForFunction(()=>document.querySelector('#sheet .big-img')?.naturalWidth===40);
  await page.evaluate(()=>closeSheet());const before=await stable(page);
  await page.evaluate(()=>lockWholeArchive());await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);assert.deepEqual(await stable(page),before);
  assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');await page.evaluate(p=>ChatVault.unlock(p),password);await unlocked(page);
 });
 await test('protected archive requires encrypted backup, and importing it preserves app protection',async page=>{
  await fixture(page);await page.evaluate(p=>ChatVault.setup(p),password);await protect(page);const before=await stable(page);
  assert.equal(await page.evaluate(async()=>{try{await prepareBackup('');return false;}catch(e){return e.code==='ARCHIVE_BACKUP_PASSWORD';}}),true);

  await page.evaluate(async()=>{window.prompt=()=> 'synthetic-backup-password';window.__backup=await prepareBackup('synthetic-backup-password');window.__stage=null;
   void stageBackup(__backup).then(s=>window.__stage=s);});
  await fillPassword(page);await page.waitForFunction(()=>!!__stage);await page.evaluate(()=>commitBackup(__stage));
  assert.deepEqual(await stable(page),before);await encrypted(page);
  const rollback=await page.evaluate(async()=>{const r=(await storageSnapshot(true)).rollback;return {pk:JSON.parse(r.json).chat.pk,photos:r.photos.length};});
  assert.equal(rollback.pk,before.pk);assert.equal(rollback.photos,1);
 });
 await test('transaction failure leaves legacy data intact; failed cache cleanup locks and remains recoverable',async page=>{
  await fixture(page,true);const before=await snapshot(page),rawBefore=await raw(page);
  const aborted=await page.evaluate(async p=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(v,k){if(this.name===STORE&&k===ARCHIVE_HEADER)throw new DOMException('Synthetic quota','QuotaExceededError');return original.apply(this,arguments);};
   try{await protectWholeArchive(p);return false;}catch{return true;}finally{IDBObjectStore.prototype.put=original;}
  },archivePassword);
  assert.equal(aborted,true);assert.deepEqual(await snapshot(page),before);assert.equal(await raw(page),rawBefore);
  const failed=await page.evaluate(async p=>{
   const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
   Storage.prototype.setItem=function(k){if(k===KEY)throw new DOMException('Synthetic quota','QuotaExceededError');return set.apply(this,arguments);};
   Storage.prototype.removeItem=function(k){if(k===KEY)throw new DOMException('Synthetic security','SecurityError');return remove.apply(this,arguments);};
   try{await protectWholeArchive(p);return false;}catch(e){return e.code==='ARCHIVE_CLEANUP'&&archiveLocked&&!archiveSession;}
   finally{Storage.prototype.setItem=set;Storage.prototype.removeItem=remove;}
  },archivePassword);assert.equal(failed,true);
  assert.equal(await page.locator('#archive-gate').isVisible(),true);await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);
  await encrypted(page);assert.deepEqual(await stable(page),{sessions:JSON.parse(before.db).sessions,pk:JSON.parse(before.db).chat.pk,tok:JSON.parse(before.db).chat.tok,friends:JSON.parse(before.db).chat.friends,msgs:JSON.parse(before.db).chat.msgs,photos:before.photos.map(p=>({id:p.id,date:p.date,pose:p.pose,data:p.blob}))});
 });
 await test('tampering fails closed; cancellation preserves data and recovery retains the previous encrypted archive',async page=>{
  await fixture(page,true);await protect(page);const good=await raw(page);
  await page.evaluate(async()=>{
   const raw=await storageRawSnapshot(true),o=JSON.parse(raw.json);o.data=(o.data[0]==='A'?'B':'A')+o.data.slice(1);
   await storageWrite([STORE],tx=>tx.objectStore(STORE).put(JSON.stringify(o),KEY));
  });const corrupted=await raw(page);
  await page.reload();await page.locator('#archive-gate').waitFor();await unlockApp(page);
  await page.waitForFunction(()=>document.querySelector('#archive-error').textContent.length>0);assert.equal(await raw(page),corrupted);
  assert.equal(await page.evaluate(()=>archiveLocked&&db.sessions.length===0&&!archiveSession),true);
  const legacy=await page.evaluate(async()=>{const nt=await nostrLoad(),sk=new Uint8Array(32).fill(9);return {sk:toHex(sk),pk:nt.getPublicKey(sk),friends:{},msgs:{},relays:[],seen:[],blocked:[]};});
  const file={name:'recover.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({sessions:[{id:'recovered',date:'2026-10-19',name:'Recovered workout',exercises:[]}],badges:{},tourSeen:1,chat:legacy}))};
  await page.locator('#archive-recovery-file').setInputFiles(file);await page.locator('#archive-recovery-cancel').click();
  await page.locator('#archive-unlock-form').waitFor();assert.equal(await raw(page),corrupted);
  await page.locator('#archive-recovery-file').setInputFiles(file);const form=page.locator('#archive-recovery-password');await form.waitFor();
  assert.equal(await form.locator('[name=password]').getAttribute('minlength'),'8');
  await form.locator('[name=password]').fill('test123');await form.locator('[name=confirm]').fill('test123');await form.locator('[type=submit]').click();
  assert.equal(await form.locator('[name=password]').evaluate(el=>el.validity.tooShort),true);
  assert.equal(await raw(page),corrupted);
  await form.locator('[name=password]').fill('test1234');await form.locator('[name=confirm]').fill('test1234');await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#archive-recovery-password [name=password]')?.minLength===12);
  await form.locator('[name=password]').fill(archivePassword);await form.locator('[name=confirm]').fill(archivePassword);await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>!archiveLocked&&!storageBusy);assert.equal(await page.evaluate(()=>db.sessions[0].id),'recovered');
  assert.equal(await page.evaluate(()=>chat().pk),legacy.pk);
  assert.equal(await page.evaluate(()=>ChatVault.verify(chat().vault,'test1234',chat().pk)),legacy.pk);
  assert.equal(await page.evaluate(async()=>JSON.stringify((await storageSnapshot(true)).rollback.opaqueArchive)),corrupted);await encrypted(page);
  await page.reload();await page.locator('#archive-gate').waitFor();await unlockApp(page);await ready(page);assert.equal(await page.evaluate(()=>db.sessions[0].id),'recovered');
 });
 await test('authenticated records reject photo swaps, archive identity changes and closed keys',async page=>{
  await fixture(page);await protect(page);
  const result=await page.evaluate(async p=>{
   const raw=await storageRawSnapshot(true),session=await ArchiveVault.unlock(raw.header,p),photo=raw.photos[0];
   const rejects=async f=>{try{await f();return false;}catch{return true;}};
   const swapped=await rejects(()=>session.open(photo.sealed,'photo','different-id'));
   const wrongKind=await rejects(()=>session.open(photo.sealed,'archive',KEY));
   const changed=await rejects(()=>ArchiveVault.unlock({...raw.header,id:crypto.randomUUID()},p));
   const weak=await rejects(()=>ArchiveVault.create('short'));session.close();
   return {swapped,wrongKind,changed,weak,closed:await rejects(()=>session.open(photo.sealed,'photo',photo.id))};
  },archivePassword);assert.deepEqual(result,{swapped:true,wrongKind:true,changed:true,weak:true,closed:true});
 });
 await test('photo writes preserve user order and a delete cannot be undone by delayed encryption',async page=>{
  await fixture(page);await protect(page);
  await page.evaluate(async()=>{
   const photo=(await photoTx('readonly',s=>s.getAll()))[0],original=SubtleCrypto.prototype.encrypt;let first=true;
   SubtleCrypto.prototype.encrypt=async function(...args){if(first){first=false;await new Promise(r=>window.__releasePhoto=r);}return original.apply(this,args);};
   window.__restoreEncrypt=()=>{SubtleCrypto.prototype.encrypt=original;};
   window.__put=photoTx('readwrite',s=>s.put({...photo,date:'2026-10-18'}));window.__deleted=false;
   window.__del=photoTx('readwrite',s=>s.delete(photo.id)).then(()=>window.__deleted=true);
  });await page.waitForFunction(()=>typeof __releasePhoto==='function');
  await page.waitForTimeout(60);assert.equal(await page.evaluate(()=>__deleted),false);
  await page.evaluate(async()=>{__releasePhoto();__restoreEncrypt();await Promise.all([__put,__del]);});
  assert.equal(await page.evaluate(async()=>(await photoTx('readonly',s=>s.getAll())).length),0);
 });
 await test('stale tab cannot restore plaintext data or rest timer after another tab protects the archive',async (page,diag)=>{
  await fixture(page);const second=await page.context().newPage();second.on('pageerror',e=>diag.pageerror.push(e.message));
  await second.goto(origin+'/');await ready(second);await protect(page);
  await second.evaluate(()=>{rest={end:Date.now()+60000,label:'PRIVATE-REST-CANARY'};keepRest();db.sessions[0].name='Stale change';save();});
  await second.waitForFunction(()=>archiveLocked);assert.equal(await second.evaluate(()=>localStorage.getItem('gym-rest')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem(KEY).includes('PRIVATE-REST-CANARY')||localStorage.getItem(KEY).includes('Stale change')),false);
  await unlockApp(second);await second.waitForFunction(()=>!archiveLocked);assert.equal(await second.evaluate(()=>db.sessions[0].name),'Workout to preserve');await second.close();
 });

 await test('page lifecycle masks immediately, drains saves, requires password and restores the rest timer',async page=>{
  await fixture(page);await protect(page);
  await page.evaluate(()=>{rest={end:Date.now()+90000,total:90,name:'PRIVATE-MESSAGE-CANARY',sid:'vault-workout',eid:'rest-ex'};keepRest();
   db.sessions[0].name='Saved before leaving';save();dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
  assert.equal(await page.evaluate(()=>document.body.hidden),true);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.waitForFunction(()=>archiveLocked&&!archiveResumePending&&!document.body.hidden);
  assert.equal(await page.evaluate(()=>!archiveSession&&db.sessions.length===0),true);await encrypted(page);
  await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);assert.equal(await page.evaluate(()=>db.sessions[0].name),'Saved before leaving');
  assert.equal(await page.evaluate(()=>rest?.name),'PRIVATE-MESSAGE-CANARY');
  await page.reload();await page.locator('#archive-gate').waitFor();await unlockApp(page);await ready(page);
  assert.equal(await page.evaluate(()=>rest?.name),'PRIVATE-MESSAGE-CANARY');
 });
 await test('an old share conversion cannot restore private previews after lock and unlock',async page=>{
  await fixture(page);await protect(page);
  await page.evaluate(()=>{
   const original=HTMLCanvasElement.prototype.toBlob;
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){return original.call(this,blob=>{window.__releaseShare=()=>callback(blob);},...args);};
   window.__restoreCanvas=()=>{HTMLCanvasElement.prototype.toBlob=original;};
   window.__shareFinished=false;void openShare('session','vault-workout').then(()=>window.__shareFinished=true);
  });await page.waitForFunction(()=>typeof __releaseShare==='function');
  await page.evaluate(()=>lockWholeArchive());assert.equal(await page.evaluate(()=>!shareFile&&!shareText&&!chatOutLink&&!chatOutImg),true);
  await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);
  await page.evaluate(()=>{__releaseShare();__restoreCanvas();});await page.waitForFunction(()=>__shareFinished);
  assert.equal(await page.evaluate(()=>!shareFile&&!shareText&&document.getElementById('sheet').hidden),true);
 });

 await test('delayed chat image reads cannot refill memory after archive lock and unlock',async page=>{
  await fixture(page);await protect(page);
  await page.evaluate(()=>{
   const original=photoTx;let first=true;gymChatClearMedia();
   photoTx=async function(...args){const value=await original(...args);if(first&&args[0]==='readonly'){first=false;await new Promise(r=>window.__releaseRead=r);}return value;};
   window.__restorePhoto=()=>{photoTx=original;};window.__imageResult=null;
   void imgGet('c'.repeat(64)).then(v=>window.__imageResult=v);
  });await page.waitForFunction(()=>typeof __releaseRead==='function');
  await page.evaluate(()=>lockWholeArchive());await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);
  await page.evaluate(()=>{__releaseRead();__restorePhoto();});await page.waitForFunction(()=>__imageResult!==null);
  assert.equal(await page.evaluate(()=>__imageResult),'');assert.equal(await page.evaluate(()=>Object.keys(imgCache).length),0);
  assert.equal(await page.evaluate(async()=>!!await imgGet('c'.repeat(64))),true);
 });

 await test('failed lifecycle save stays masked and the retry button preserves unsaved data',async page=>{
  await fixture(page);await protect(page);
  await page.evaluate(()=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(v,k){if(this.name===STORE&&k===KEY)throw new DOMException('Synthetic retry fault','QuotaExceededError');return original.apply(this,arguments);};
   const pause=gymChatPause;window.gymChatPause=async(...args)=>{await pause(...args);await new Promise(r=>setTimeout(r,70));};
   window.__restorePut=()=>{IDBObjectStore.prototype.put=original;window.gymChatPause=pause;};
   db.sessions[0].name='Pending edit must survive';dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });await page.locator('#archive-resume-guard button').waitFor();
  assert.equal(await page.evaluate(()=>db.sessions[0].name),'Pending edit must survive');
  assert.equal(await page.evaluate(()=>document.body.innerText.includes('Pending edit must survive')),false);
  await page.evaluate(()=>__restorePut());await page.locator('#archive-resume-guard button').click();
  await page.waitForFunction(()=>archiveLocked&&!archiveResumePending&&!document.body.hidden);
  await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);
  assert.equal(await page.evaluate(()=>db.sessions[0].name),'Pending edit must survive');await encrypted(page);
 });
 await test('leaving during archive setup cannot return with a newly protected archive unlocked',async page=>{
  await fixture(page);const before=await stable(page);
  await page.evaluate(p=>{
   const original=SubtleCrypto.prototype.deriveKey;let first=true;
   SubtleCrypto.prototype.deriveKey=async function(...args){if(first){first=false;await new Promise(r=>window.__releaseSetup=r);}return original.apply(this,args);};
   window.__restoreKDF=()=>{SubtleCrypto.prototype.deriveKey=original;};window.__setupDone=false;
   void protectWholeArchive(p).then(()=>window.__setupDone=true,()=>window.__setupDone=true);
  },archivePassword);await page.waitForFunction(()=>typeof __releaseSetup==='function');
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await page.evaluate(()=>{__releaseSetup();__restoreKDF();dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await page.waitForFunction(()=>__setupDone&&!archiveResumePending&&!document.body.hidden);
  const isProtected=await page.evaluate(()=>!!archiveHeader);
  if(isProtected){assert.equal(await page.evaluate(()=>archiveLocked&&!archiveSession),true);await unlockApp(page);await page.waitForFunction(()=>!archiveLocked);}
  assert.deepEqual(await stable(page),before);
 });
 await test('setup and locked UI fit mobile sizes in all five languages',async page=>{
  for(const lang of ['it','en','es','fr','de']){
   await page.evaluate(lang=>{db.settings={lang};setLang();acts.archiveprotect();},lang);
   for(const width of [320,390]){await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,lang+'/'+width);
    assert.equal(await page.locator('#archive-setup-form').evaluate(e=>e.innerText.includes('undefined')),false);
   }
   if(lang==='it')await page.screenshot({path:path.join(root,'artifacts/security/archive-setup.png')});
   await page.evaluate(()=>closeSheet());await page.waitForTimeout(220);
  }
  await fixture(page);await protect(page);await page.evaluate(()=>lockWholeArchive());
  for(const lang of ['it','en','es','fr','de']){
   await page.evaluate(l=>{lang=l;showArchiveGate();},lang);
   for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,lang+'/'+width);}
   assert.equal(await page.locator('#archive-gate').evaluate(e=>e.innerText.includes('undefined')),false);
  }
 });
 fs.writeFileSync(path.join(root,'artifacts/security/archive-vault-results.json'),JSON.stringify({results},null,2));console.log(`${results.length} archive groups PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
