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
  browser=await chromium.launch();
  fs.mkdirSync(path.join(root,'artifacts/security'),{recursive:true});
  await test('stale plaintext preparation cannot replace the password-protected download',async page=>{
    await page.evaluate(async()=>{
      const nt=await nostrLoad(),sk=new Uint8Array(32).fill(7);
      db.chat={sk:toHex(sk),pk:nt.getPublicKey(sk),tok:'ab'.repeat(12),friends:{},msgs:{},relays:[],seen:[],blocked:[]};save();
      await ChatVault.setup('synthetic-vault-password');
      await Promise.all([...pendingWrites]);
    });
    await holdFirstRead(page);
    await page.locator('#bk-pwd').fill('synthetic-race-password');await waitExport(page);
    await page.evaluate(()=>{window.__current=backupFile;__release();});
    await page.waitForFunction(()=>__completed.includes(1));
    assert.equal(await page.evaluate(()=>backupFile===__current),true);
    await page.screenshot({path:path.join(root,'artifacts/security/backup-race-fixed.png')});
    const envelope=await downloadBackup(page);assert.equal(envelope.enc,'AES-GCM');
    assert.equal(await page.evaluate(async envelope=>{
      const restored=JSON.parse(await decryptBackup(envelope,'synthetic-race-password'));
      return !restored.chat.sk && restored.chat.vault.data===db.chat.vault.data && !document.getElementById('bk-pwd')?.value;
    },envelope),true);
  });
  await test('password A to B to A discards an older result even when passwords match again',async page=>{
    await page.evaluate(()=>{
      const encrypt=encryptBackup;let held=false;window.__oldDone=false;
      encryptBackup=async function(text,pwd){const value=await encrypt(text,pwd);
        if(pwd==='synthetic-A'&&!held){held=true;await new Promise(resolve=>window.__releaseA=resolve);__oldDone=true;}return value;};
      sheetBackup();
    });
    await page.locator('#bk-pwd').fill('synthetic-A');await page.waitForFunction(()=>typeof __releaseA==='function');
    await page.locator('#bk-pwd').fill('synthetic-B');await waitExport(page);
    await page.locator('#bk-pwd').fill('synthetic-A');await waitExport(page);
    await page.evaluate(()=>{window.__current=backupFile;__releaseA();});
    await page.waitForFunction(()=>__oldDone);
    assert.equal(await page.evaluate(()=>backupFile===__current),true);
    const envelope=await downloadBackup(page);
    assert.equal(await page.evaluate(async o=>JSON.parse(await decryptBackup(o,'synthetic-A')).sessions.length,envelope),0);
  });
  await test('closing and replacing the sheet invalidates old work and clears the password',async page=>{
    await holdFirstRead(page);
    await page.locator('#bk-pwd').fill('synthetic-close');
    await page.evaluate(()=>{window.__oldInput=document.getElementById('bk-pwd');closeSheet();sheetBackup();});
    await waitExport(page);
    assert.deepEqual(await page.evaluate(()=>({old:__oldInput.value,current:bkPwd})),{old:'',current:''});
    await page.evaluate(()=>{window.__current=backupFile;__release();});await page.waitForFunction(()=>__completed.includes(1));
    assert.equal(await page.evaluate(()=>backupFile===__current),true);
    assert.deepEqual(await page.evaluate(()=>__alerts),[]);
    await page.evaluate(()=>{sheet('<h2>Another sheet</h2>');});
    assert.equal(await page.evaluate(()=>backupFile===null&&backupDialog===null&&bkPwd===''),true);
  });
  await test('stale encryption failure is ignored and direct producers cannot change the ready file',async page=>{
    await page.evaluate(()=>{
      const encrypt=encryptBackup;window.__failed=false;
      encryptBackup=async function(text,pwd){if(pwd==='synthetic-fail'){
        await new Promise(resolve=>window.__fail=resolve);__failed=true;throw new Error('synthetic crypto failure');}
        return encrypt(text,pwd);};sheetBackup();
    });
    await page.locator('#bk-pwd').fill('synthetic-fail');await page.waitForFunction(()=>typeof __fail==='function');
    await page.locator('#bk-pwd').fill('synthetic-current');await waitExport(page);
    await page.evaluate(async()=>{window.__current=backupFile;await prepareBackup('');__fail();});
    await page.waitForFunction(()=>__failed);
    assert.equal(await page.evaluate(()=>backupFile===__current),true);assert.deepEqual(await page.evaluate(()=>__alerts),[]);
    const envelope=await downloadBackup(page);assert.equal(envelope.enc,'AES-GCM');
  });
  await test('save, photo writes and restore invalidate exports; final click rechecks current password',async page=>{
    await page.evaluate(()=>sheetBackup());await waitExport(page);
    assert.equal(await page.evaluate(()=>{db.profile={name:'Updated snapshot'};save();return backupFile===null&&document.getElementById('exp-btn').disabled;}),true);
    await waitExport(page);
    assert.equal(await page.evaluate(async()=>JSON.parse(await backupFile.text()).profile.name),'Updated snapshot');
    assert.equal(await page.evaluate(async()=>{
      const c=document.createElement('canvas');c.width=c.height=2;
      const blob=await new Promise(r=>c.toBlob(r,'image/png'));
      const write=photoTx('readwrite',s=>s.put({id:'backup-fixture',date:'2026-10-18',pose:'front',blob}));
      const disabled=backupFile===null&&document.getElementById('exp-btn').disabled;await write;return disabled;
    }),true);await waitExport(page);
    assert.equal(await page.evaluate(async()=>JSON.parse(await backupFile.text()).photos.length),1);
    await page.evaluate(()=>restore());await waitExport(page);
    // A value changed without an input event (e.g. autofill) must also be detected at export.
    await page.evaluate(()=>{
      window.__shares=0;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:()=>{__shares++;return Promise.reject(new Error('cancel'));}});
      document.getElementById('bk-pwd').value='synthetic-autofill';exportData();
    });
    assert.equal(await page.evaluate(()=>__shares),0);await waitExport(page);
    assert.equal(await page.evaluate(async()=>JSON.parse(await backupFile.text()).enc),'AES-GCM');
    await page.locator('#exp-btn').click();await waitExport(page);
    assert.equal(await page.evaluate(()=>__shares),1);
  });
  await test('native share receives the prepared file synchronously; cancellation and replacement remain usable',async page=>{
    await page.evaluate(()=>{
      window.__shares=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:({files})=>{
        __shares.push({file:files[0],active:navigator.userActivation.isActive});
        return new Promise((resolve,reject)=>{window.__shareDone=resolve;window.__shareCancel=reject;});}});
      sheetBackup();
    });
    await page.locator('#bk-pwd').fill('synthetic-native');await waitExport(page);await page.locator('#exp-btn').click();
    assert.equal(await page.evaluate(()=>__shares[0].active),true);
    assert.equal(await page.evaluate(async()=>JSON.parse(await __shares[0].file.text()).enc),'AES-GCM');
    await page.evaluate(()=>__shareCancel(new Error('cancel')));await waitExport(page);
    await page.locator('#exp-btn').click();await page.evaluate(()=>{sheet('<h2 id="replacement">Replacement</h2>');__shareDone();});
    assert.equal(await page.locator('#replacement').count(),1);
    await page.evaluate(()=>sheetBackup());await waitExport(page);await page.locator('#exp-btn').click();
    await page.evaluate(()=>__shareDone());await page.waitForFunction(()=>backupDialog===null&&!!db.backup?.last);
    assert.equal(await page.evaluate(()=>db.backup.enc),false);
  });
  for(const timing of ['before','during','after'])await test(`successful native share survives foreground restore: completion ${timing} restore`,async page=>{
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:()=>new Promise(resolve=>window.__shareDone=resolve)});
      const snap=storageSnapshot;storageSnapshot=async()=>{const s=await snap();await new Promise(resolve=>window.__resumeRestore=resolve);return s;};
      sheetBackup();
    });
    await page.locator('#bk-pwd').fill('synthetic-foreground');await waitExport(page);await page.locator('#exp-btn').click();
    await page.evaluate(()=>{window.__exportedAt=backupDialog.exportTicket.exportedAt;});
    if(timing==='before')await page.evaluate(()=>__shareDone());
    await page.evaluate(()=>{window.__restoring=restore();});await page.waitForFunction(()=>typeof __resumeRestore==='function');
    if(timing==='during'){
      await page.evaluate(()=>__shareDone());
      assert.equal(await page.evaluate(()=>storageBusy&&!db.backup?.last),true);
    }
    await page.evaluate(async()=>{__resumeRestore();await __restoring;});
    if(timing==='after')await page.evaluate(()=>__shareDone());
    await page.waitForFunction(()=>backupDialog===null&&db.backup?.last===__exportedAt);
    await ready(page);
    assert.deepEqual(await page.evaluate(()=>({encrypted:db.backup.enc,persisted:JSON.parse(localStorage.getItem(KEY)).backup.last===__exportedAt})),{encrypted:true,persisted:true});
  });
  await test('a share from the previous archive cannot record success on an imported archive',async page=>{
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:()=>new Promise(resolve=>window.__shareDone=resolve)});
      sheetBackup();
    });await waitExport(page);await page.locator('#exp-btn').click();
    await page.evaluate(async()=>{
      const staged=await stageBackup(new File([JSON.stringify({sessions:[],tourSeen:1,settings:{lang:'it'},badges:{}})],'synthetic-import.json'));
      await commitBackup(staged);__shareDone();
    });await waitExport(page);
    assert.equal(await page.evaluate(()=>!db.backup?.last&&backupDialog!==null),true);
  });
  await test('backup keys: nonextractable AES-256, fresh salt/IV, wrong-password and tamper rejection',async page=>{
    const result=await page.evaluate(async()=>{
      const pwd='synthetic-crypto-password',text=JSON.stringify({fixture:'private backup'});
      const a=JSON.parse(await encryptBackup(text,pwd)),b=JSON.parse(await encryptBackup(text,pwd));
      const key=await bkKey(pwd,unb64(a.salt),a.it,'encrypt');
      const rejects=async fn=>{try{await fn();return false;}catch{return true;}};
      const ct=unb64(a.data);ct[0]^=1;
      return {algorithm:key.algorithm,extractable:key.extractable,usages:key.usages,
        exportRejected:await rejects(()=>crypto.subtle.exportKey('raw',key)),
        saltBytes:unb64(a.salt).length,ivBytes:unb64(a.iv).length,iterations:a.it,
        unique:a.salt!==b.salt&&a.iv!==b.iv&&a.data!==b.data,roundtrip:await decryptBackup(a,pwd)===text,
        wrongPassword:await rejects(()=>decryptBackup(a,pwd+'wrong')),
        tamper:await rejects(async()=>decryptBackup({...a,data:await b64of(ct)},pwd))};
    });
    assert.deepEqual(result,{algorithm:{name:'AES-GCM',length:256},extractable:false,usages:['encrypt'],
      exportRejected:true,saltBytes:16,ivBytes:12,iterations:250000,unique:true,roundtrip:true,wrongPassword:true,tamper:true});
  });
  await test('chat key generation uses browser randomness; invite rotation preserves identity; protected storage preserves identity',async page=>{
    const r=await page.evaluate(async()=>{
      const nt=await nostrLoad(),random=crypto.getRandomValues.bind(crypto),weak=Math.random;let calls=0,keys;
      crypto.getRandomValues=b=>{calls++;return random(b);};Math.random=()=>{throw new Error('weak randomness');};
      try{keys=Array.from({length:4},()=>nt.generateSecretKey());}finally{crypto.getRandomValues=random;Math.random=weak;}
      db.chat={friends:{},msgs:{},relays:[],seen:[],blocked:[]};await ChatVault.setup('synthetic-vault-password');await chatInit();
      window.__identity=chat().pk;const beforeToken=chat().tok;
      const invite=JSON.parse(atob(chatLink().split('#chat=')[1].replace(/-/g,'+').replace(/_/g,'/')));
      acts.chatrotate();await new Promise(resolve=>setTimeout(resolve,0));await Promise.all([...pendingWrites]);
      return {random: calls>=4,unique:new Set(keys.map(toHex)).size===4,
        valid:keys.every(k=>k.length===32&&nt.getPublicKey(k).length===64),
        inviteFields:Object.keys(invite).sort(),noSecret:!('sk' in invite)&&!('vault' in invite),
        rotated:beforeToken!==chat().tok,identitySame:__identity===chat().pk,
        plaintextLocal:!!JSON.parse(localStorage.getItem(KEY)).chat.sk,
        plaintextIDB:!!JSON.parse(await idbGet()).chat.sk};
    });
    assert.deepEqual(r,{random:true,unique:true,valid:true,inviteFields:['k','n','t','v'],noSecret:true,
      rotated:true,identitySame:true,plaintextLocal:false,plaintextIDB:false});
    const identity=await page.evaluate(()=>chat().pk);await page.reload();await ready(page);
    assert.equal(await page.evaluate(()=>chat().pk),identity);
  });
  await test('chat envelopes contain ciphertext and valid signatures; official NIP-44 vector matches',async page=>{
    const r=await page.evaluate(async()=>{
      const nt=await nostrLoad(),mine=new Uint8Array(32).fill(9),friend=new Uint8Array(32).fill(10),pk=nt.getPublicKey(mine),other=nt.getPublicKey(friend);
      db.chat={sk:toHex(mine),pk,tok:'ab'.repeat(12),friends:{[other]:{pk:other,n:'Synthetic friend',added:1}},msgs:{},relays:[],seen:[],blocked:[]};
      await ChatVault.setup('synthetic-vault-password');
      const sent=[];relaySend=ev=>sent.push(ev);await chatInit();await chatSend(other,{k:'t',x:'private-key-test-marker'});
      const wrap=sent.find(w=>w.tags.some(t=>t[0]==='p'&&t[1]===other));
      const seal=JSON.parse(nt.nip44.decrypt(wrap.content,nt.nip44.getConversationKey(friend,wrap.pubkey)));
      const rumor=JSON.parse(nt.nip44.decrypt(seal.content,nt.nip44.getConversationKey(friend,seal.pubkey)));
      const wire=JSON.stringify(sent),one=new Uint8Array(32),two=new Uint8Array(32);one[31]=1;two[31]=2;
      const key=nt.nip44.getConversationKey(one,nt.getPublicKey(two));
      // Reference vector: https://github.com/nostr-protocol/nips/blob/master/44.md#tests-and-code
      const vector='AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABee0G5VSK0/9YypIObAtDKfYEAjD35uVkHyB0F4DwrcNaCXlCWZKaArsGrY6M9wnuTMxWfp1RTN9Xga8no+kF5Vsb';
      let wrongKey=false;try{nt.nip44.decrypt(wrap.content,nt.nip44.getConversationKey(one,wrap.pubkey));}catch{wrongKey=true;}
      return {sent:sent.length,signatures:nt.verifyEvent(wrap)&&nt.verifyEvent(seal),
        noSecret:!wire.includes(toHex(mine)),noPlaintext:!wire.includes('private-key-test-marker'),
        readable:JSON.parse(rumor.content).x==='private-key-test-marker',hash:nt.getEventHash(rumor)===rumor.id,wrongKey,
        vectorKey:toHex(key)==='c41c775356fd92eadc63ff5a0dc1da211b268cbea22316767095b2871ea1412d',
        vectorEncrypt:nt.nip44.encrypt('a',key,one)===vector,vectorDecrypt:nt.nip44.decrypt(vector,key)==='a'};
    });
    assert.deepEqual(r,{sent:1,signatures:true,noSecret:true,noPlaintext:true,readable:true,hash:true,wrongKey:true,
      vectorKey:true,vectorEncrypt:true,vectorDecrypt:true});
  });
  fs.writeFileSync(path.join(root,'artifacts/security/backup-keys-results.json'),JSON.stringify({results},null,2));
  console.log(`${results.length} backup/key groups PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
