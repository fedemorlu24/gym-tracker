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
(async()=>{
  browser=await chromium.launch();fs.mkdirSync(path.join(root,'artifacts/security'),{recursive:true});
  await test('UI migration preserves identity/data and encrypts both current and different rollback keys',async page=>{
    await fixture(page,true);const before=await stable(page);
    await page.evaluate(()=>{go({name:'home',tab:'chat'});sheetChatSettings();});
    await page.locator('#sheet [data-act=chatvault]').click();
    await fillPassword(page,password,'different confirmation');
    await page.locator('#chat-vault-error').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>!!chat().sk),true);
    await page.screenshot({path:path.join(root,'artifacts/security/vault-setup.png')});
    await fillPassword(page);await unlocked(page);
    assert.deepEqual(await stable(page),before);
    const state=await page.evaluate(async password=>{
      const d=await idb(),tx=d.transaction(STORE),request=tx.objectStore(STORE).get(STORAGE_ROLLBACK);
      const rollback=await new Promise((resolve,reject)=>{tx.oncomplete=()=>{d.close();resolve(request.result);};tx.onerror=()=>reject(tx.error);});
      const previous=JSON.parse(rollback.json),raw=JSON.stringify(db)+localStorage.getItem(KEY)+(await idbGet())+rollback.json;
      return {secretPresent:raw.includes('0b'.repeat(32))||raw.includes('0d'.repeat(32))||raw.includes(password),
        primary:await ChatVault.verify(chat().vault,password,chat().pk)===chat().pk,
        rollback:await ChatVault.verify(previous.chat.vault,password,previous.chat.pk)===previous.chat.pk,
        sameKey:previous.chat.pk===chat().pk,vault:!!chat().vault,rawKey:!!chat().sk};
    },password);
    assert.deepEqual(state,{secretPresent:false,primary:true,rollback:true,sameKey:false,vault:true,rawKey:false});
    await page.evaluate(()=>{go({name:'chat',id:Object.keys(chat().friends)[0]});});
    await page.locator('#cinput').fill('Draft to preserve');await page.evaluate(()=>{ChatVault.lock();});
    assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');
    await page.locator('.cimg').click();await page.waitForFunction(()=>document.querySelector('#sheet .big-img')?.naturalWidth===40);
    await page.evaluate(()=>closeSheet());await startUnlock(page);await fillPassword(page,'wrong password');
    await page.locator('#chat-vault-error').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');
    await fillPassword(page);await unlocked(page);assert.equal(await page.locator('#cinput').inputValue(),'Draft to preserve');
    await page.locator('#sheet').waitFor({state:'hidden'});
    await page.screenshot({path:path.join(root,'artifacts/security/vault-unlocked-chat.png')});
    await page.reload();await ready(page);assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');
    assert.deepEqual(await stable(page),before);
  });
  await test('new identity is created only after setup; cancel and wrong-password leave state recoverable',async page=>{
    await page.evaluate(()=>{db.chat={friends:{},msgs:{},relays:[],seen:[],blocked:[]};save();});await ready(page);
    await startUnlock(page);await page.locator('#chat-vault-cancel').click();
    assert.equal(await page.evaluate(()=>!chat().sk&&!chat().pk&&!chat().vault),true);
    await startUnlock(page);await fillPassword(page);await unlocked(page);
    assert.equal(await page.evaluate(()=>/^[a-f0-9]{64}$/.test(chat().pk)&&/^[a-f0-9]{24}$/.test(chat().tok)&&!chat().sk),true);
    const pk=await page.evaluate(()=>chat().pk);await page.reload();await ready(page);
    assert.equal(await page.evaluate(()=>chat().pk),pk);assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');
  });
  await test('locked chat does not consume messages; unlock resumes text/photos without exposing the key',async page=>{
    await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);
    const state=await page.evaluate(async()=>{
      const nt=await nostrLoad(),friend=new Uint8Array(32).fill(12),other=nt.getPublicKey(friend);
      const r=nt.nip59.createRumor({kind:14,content:JSON.stringify({k:'t',x:'Message waiting for unlock'}),tags:[['p',chat().pk]],created_at:nowSec()},friend);
      window.__pendingWrap=nt.nip59.createWrap(nt.nip59.createSeal(r,friend,chat().pk),chat().pk);
      ChatVault.lock();const before=JSON.stringify(chat());await chatReceive(__pendingWrap);
      let denied=false;try{ChatVault.createMessage({kind:14,content:'x',tags:[['p',other]],created_at:nowSec()},other);}catch{denied=true;}
      return {unchanged:before===JSON.stringify(chat()),denied};
    });assert.deepEqual(state,{unchanged:true,denied:true});
    await page.evaluate(password=>ChatVault.unlock(password),password);await unlocked(page);
    assert.equal(await page.evaluate(async()=>{await chatReceive(__pendingWrap);return Object.values(chat().msgs).flat().some(m=>m.x==='Message waiting for unlock');}),true);
    assert.equal(await page.evaluate(()=>!chat().sk),true);
  });
  await test('vault ciphertext, identity binding and malformed imported/stored envelopes fail closed',async page=>{
    await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);
    const before=await stable(page);
    const state=await page.evaluate(async password=>{
      const original=structuredClone(chat().vault),rejects=async fn=>{try{await fn();return false;}catch{return true;}};
      const tampered={...original,data:(original.data[0]==='A'?'B':'A')+original.data.slice(1)};
      const other=await nostrLoad().then(nt=>nt.getPublicKey(new Uint8Array(32).fill(14)));
      const a=await rejects(()=>ChatVault.verify(tampered,password,original.pk));
      const b=await rejects(()=>ChatVault.verify({...original,pk:other},password,other));
      const imported={...db,chat:{...chat(),vault:{...original,it:1}}};
      const c=await rejects(()=>stageBackup(new File([JSON.stringify(imported)],'malformed.json')));
      const invalid=clean(imported);return {tamper:a,binding:b,import:c,marked:invalid.chat.vaultInvalid===true,keptSessions:invalid.sessions.length,keptPk:invalid.chat.pk===chat().pk};
    },password);
    assert.deepEqual(state,{tamper:true,binding:true,import:true,marked:true,keptSessions:1,keptPk:true});assert.deepEqual(await stable(page),before);
    await page.evaluate(async()=>{const invalid=structuredClone(db);invalid.chat.vault.it=1;await idbPut(JSON.stringify(invalid));localStorage.setItem(KEY,JSON.stringify(invalid));});
    await page.reload();await ready(page);assert.equal(await page.evaluate(()=>ChatVault.status()),'error');assert.deepEqual(await stable(page),before);
  });
  await test('exported unwrapped backup contains only the vault; legacy plaintext export is refused',async page=>{
    await fixture(page);
    assert.equal(await page.evaluate(async()=>{try{await prepareBackup('');return false;}catch{return true;}}),true);
    await page.evaluate(password=>ChatVault.setup(password),password);
    const state=await page.evaluate(async password=>{
      const file=await prepareBackup(''),text=await file.text(),b=JSON.parse(text);
      return {vault:!!b.chat.vault,privateKey:!!b.chat.sk,noSecret:!text.includes('0b'.repeat(32)),verified:await ChatVault.verify(b.chat.vault,password,b.chat.pk)===b.chat.pk};
    },password);assert.deepEqual(state,{vault:true,privateKey:false,noSecret:true,verified:true});
  });
  await test('legacy backup import asks for protection before replacing data; cancellation preserves current archive',async page=>{
    await fixture(page);const before=await stable(page);
    await page.evaluate(()=>{window.__imported=false;const candidate=structuredClone(db);candidate.sessions[0].name='Imported workout';
      void importData({files:[new File([JSON.stringify(candidate)],'legacy.json')],value:'fixture'}).then(()=>window.__imported=true);});
    await page.locator('#chat-vault-cancel').click();await page.waitForFunction(()=>__imported);assert.deepEqual(await stable(page),before);
    await page.evaluate(()=>{window.__imported=false;const candidate=structuredClone(db);candidate.sessions[0].name='Imported workout';
      void importData({files:[new File([JSON.stringify(candidate)],'legacy.json')],value:'fixture'}).then(()=>window.__imported=true);});
    await fillPassword(page);await page.waitForFunction(()=>__imported);await ready(page);
    assert.equal(await page.evaluate(()=>db.sessions[0].name),'Imported workout');
    assert.equal(await page.evaluate(()=>!!chat().vault&&!chat().sk&&ChatVault.status()==='locked'),true);
    assert.equal(await page.evaluate(()=>chat().pk),before.pk);assert.deepEqual(await page.evaluate(()=>__alerts),[]);
  });
  await test('aborted migration preserves original data and a retry succeeds',async page=>{
    await fixture(page,true);const before=await snapshot(page);
    const result=await page.evaluate(async password=>{
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(value,key){if(this.name===STORE&&key===KEY&&JSON.parse(value).chat.vault)throw new DOMException('Synthetic failure','QuotaExceededError');return original.apply(this,arguments);};
      try{await ChatVault.setup(password);return false;}catch{return true;}finally{IDBObjectStore.prototype.put=original;}
    },password);assert.equal(result,true);assert.deepEqual(await snapshot(page),before);
    await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);
  });
  await test('failed local cache cleanup is explicit and retry removes the legacy key',async page=>{
    await fixture(page);
    const state=await page.evaluate(async password=>{
      const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
      Storage.prototype.setItem=function(k){if(k===KEY)throw new DOMException('Synthetic cache write failure','QuotaExceededError');return set.apply(this,arguments);};
      Storage.prototype.removeItem=function(k){if(k===KEY)throw new DOMException('Synthetic cache removal failure','SecurityError');return remove.apply(this,arguments);};
      try{await ChatVault.setup(password);return {failed:false};}catch(e){return {failed:true,code:e.code,status:ChatVault.status(),unlocked:ChatVault.isUnlocked()};}
      finally{Storage.prototype.setItem=set;Storage.prototype.removeItem=remove;}
    },password);assert.deepEqual(state,{failed:true,code:'VAULT_CLEANUP',status:'cleanup',unlocked:false});
    await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);
    assert.equal(await page.evaluate(()=>localStorage.getItem(KEY).includes('0b'.repeat(32))),false);
  });
  await test('cancelling setup or unlock during key derivation never unlocks later',async page=>{
    await fixture(page);const before=await snapshot(page);
    async function hold(){await page.evaluate(()=>{
      const original=SubtleCrypto.prototype.deriveKey;let first=true;
      SubtleCrypto.prototype.deriveKey=async function(...args){
        if(first){first=false;await new Promise(resolve=>window.__releaseDerivation=resolve);}
        return original.apply(this,args);
      };window.__restoreDerivation=()=>{SubtleCrypto.prototype.deriveKey=original;};
    });}
    await hold();await startUnlock(page);await fillPassword(page);
    await page.waitForFunction(()=>typeof __releaseDerivation==='function');
    await page.locator('#chat-vault-cancel').click();
    await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('on'));
    await page.evaluate(()=>{__releaseDerivation();__restoreDerivation();});
    await page.waitForFunction(()=>!storageBusy&&!chatVaultPrompt);assert.equal(await page.evaluate(()=>ChatVault.status()),'setup');
    assert.deepEqual(await snapshot(page),before);
    await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);await page.evaluate(()=>ChatVault.lock());
    await hold();await startUnlock(page);await fillPassword(page);
    await page.locator('#chat-vault-cancel').click();
    await page.evaluate(()=>{__releaseDerivation();__restoreDerivation();});
    await page.waitForFunction(()=>!chatVaultPrompt);
    assert.equal(await page.evaluate(()=>ChatVault.status()),'locked');
  });
  await test('an older tab cannot restore a plaintext identity after migration',async (page,diag)=>{
    await fixture(page);
    // Same origin and database, but retain a pre-migration in-memory archive.
    const second=await page.context().newPage();
    second.on('pageerror',e=>diag.pageerror.push(e.message));second.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});
    second.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));
    second.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});
    await second.goto(origin+'/');await ready(second);
    assert.equal(await second.evaluate(()=>!!chat().sk),true);
    await page.evaluate(password=>ChatVault.setup(password),password);await unlocked(page);
    await second.evaluate(()=>{db.sessions[0].name='Stale edit';save();});
    await second.waitForFunction(()=>!storageBusy&&!chat().sk&&!!chat().vault);
    assert.equal(await second.evaluate(()=>ChatVault.status()),'locked');
    assert.equal(await second.evaluate(()=>db.sessions[0].name),'Workout to preserve');
    assert.equal(await page.evaluate(async()=>!(localStorage.getItem(KEY)+(await idbGet())).includes('0b'.repeat(32))),true);
    assert.equal((await second.evaluate(()=>__alerts)).length,1);await second.close();
  });
  await test('protected backup import verifies its password before replacing the archive',async page=>{
    await fixture(page);await page.evaluate(password=>ChatVault.setup(password),password);const before=await snapshot(page);
    await page.evaluate(()=>{window.__incoming=structuredClone(db);__incoming.sessions[0].name='Protected imported workout';});
    async function begin(){await page.evaluate(()=>{window.__imported=false;void importData({files:[new File([JSON.stringify(__incoming)],'vault.json')],value:'fixture'}).then(()=>__imported=true);});}
    await begin();await fillPassword(page,'wrong password');await page.waitForFunction(()=>__imported);
    assert.deepEqual(await snapshot(page),before);assert.equal((await page.evaluate(()=>__alerts)).length,1);
    await begin();await fillPassword(page);await page.waitForFunction(()=>__imported);await ready(page);
    assert.equal(await page.evaluate(()=>db.sessions[0].name),'Protected imported workout');
    // The same authenticated envelope may retain the current unlocked session.
    assert.equal(await page.evaluate(()=>ChatVault.status()),'unlocked');
    await page.evaluate(()=>ChatVault.lock());
    await page.evaluate(password=>ChatVault.unlock(password),password);await unlocked(page);
  });
  await test('invalid legacy key stays an error after repeated normalization; setup is readable in five languages',async page=>{
    const state=await page.evaluate(()=>{let invalid={sessions:[{id:'preserve',date:'2026-10-19',exercises:[]}],chat:{sk:'0'.repeat(64)}};
      for(let i=0;i<3;i++)invalid=clean(JSON.parse(JSON.stringify(invalid)));
      db=invalid;return {invalid:chat().keyInvalid,status:ChatVault.status(),sessions:db.sessions.length};});
    assert.deepEqual(state,{invalid:true,status:'error',sessions:1});
    await page.evaluate(async()=>{
      save();await Promise.all([...pendingWrites]);
      const staged=await stageBackup(new File([JSON.stringify({sessions:[{id:'recovered',date:'2026-10-19',exercises:[]}],badges:{},tourSeen:1})],'recovery.json'));
      await commitBackup(staged);
    });
    assert.equal(await page.evaluate(()=>db.sessions[0].id),'recovered');
    await page.evaluate(()=>{db.chat={friends:{},msgs:{},relays:[],seen:[],blocked:[]};});
    for(const lang of ['it','en','es','fr','de']){
      await page.evaluate(lang=>{db.settings={lang};setLang();},lang);await startUnlock(page);
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,lang+'/'+width);
        assert.equal(await page.locator('#chat-vault-form').evaluate(el=>el.textContent.includes('undefined')),false);
        await page.locator('#chat-vault-cancel').scrollIntoViewIfNeeded();assert.equal(await page.locator('#chat-vault-cancel').isVisible(),true);
      }
      await page.locator('#chat-vault-cancel').click();
    }
  });
  fs.writeFileSync(path.join(root,'artifacts/security/vault-results.json'),JSON.stringify({results},null,2));console.log(`${results.length} vault groups PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
