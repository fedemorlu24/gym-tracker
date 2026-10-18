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
    assert.deepEqual(f.diag.external,[]);assert.deepEqual(f.diag.failed,[]);assert.deepEqual(f.diag.console,[]);
    results.push({name,status:'pass',...f.diag}); console.log('PASS '+name);
  } catch(e) {console.error(name,f.diag);throw e;} finally {await f.context.close();}
}
(async()=>{
  browser=await chromium.launch();
  fs.mkdirSync(path.join(root,'artifacts/security'),{recursive:true});
  await test('shared and pasted plans: markup, reserved IDs, valid multilingual text',async page=>{
    for(const id of [marker,'__proto__','constructor','safe-plan']) {
      const r=await page.evaluate(({id,marker})=>{
        const payload={v:1,t:'p',id,n:"O'Brien 日本 <b>name</b>",a:'Coach',d:[{n:'A',e:[['','Squat',3,'<b>8</b>',60]]}]};
        const link=location.origin+'/#scheda='+b64e(payload),p=parsePlan(link);
        if(p)addPlan(p);
        return {accepted:!!p,html:document.querySelectorAll('#reviewmark, .dex span b, h1 b').length};
      },{id,marker});
      assert.equal(r.html,0);
      if(id==='safe-plan')assert.equal(r.accepted,true);
    }
    await page.evaluate(()=>{go({name:'home',tab:'sessions'});save();});
    await ready(page);await page.reload();await ready(page);
    await page.evaluate(()=>go({name:'home',tab:'sessions'}));
    assert.equal(await page.locator('#reviewmark').count(),0);
    assert.ok(await page.getByText("O'Brien 日本 <b>name</b>",{exact:true}).count());
    const literal=await page.evaluate(()=>{addPlan(parsePlan('#scheda='+b64e({v:1,t:'p',id:'ranges',n:'Range',d:[{n:'A',e:[['','Squat',3,'8–12',60]]}]})));return document.querySelector('.dex span').textContent;});
    assert.ok(literal.includes('8–12'));
    await page.screenshot({path:path.join(root,'artifacts/security/safe-plan.png')});
  });
  const legacy={...seed,sessions:[{id:marker,date:'2026-10-18',name:"O'Brien 日本",exercises:[{id:marker,name:'Squat',sets:[{reps:8,kg:80}]}]}],
    plans:{[marker]:{id:marker,name:'Stored plan',days:[{name:'A',ex:[{n:'Squat',sets:3,reps:'<b>8</b>',rest:60}]}]}}};
  await test('previously stored plans and sessions remain safe after reload',async page=>{
    await page.evaluate(()=>go({name:'home',tab:'sessions'}));
    assert.equal(await page.locator('#reviewmark').count(),0);
    assert.ok(await page.getByText("O'Brien 日本",{exact:true}).count());
    const before=await page.evaluate(()=>JSON.stringify(db));
    await page.evaluate(()=>{save();});await ready(page);await page.reload();await ready(page);
    await page.evaluate(()=>go({name:'plan',id:Object.keys(db.plans)[0]}));
    assert.equal(await page.locator('#reviewmark,.dex span b').count(),0);
    assert.ok((await page.locator('.dex span').textContent()).includes('<b>8</b>'));
    assert.ok(before.includes("O'Brien"));
  },legacy);
  await test('newer IndexedDB data is normalized before first render',async page=>{
    await page.evaluate(async legacy=>{await idbPut(JSON.stringify({...legacy,ts:Date.now()+10000}));},legacy);
    await page.reload();await ready(page);
    await page.evaluate(()=>go({name:'home',tab:'sessions'}));
    assert.equal(await page.locator('#reviewmark').count(),0);
    assert.ok(await page.getByText("O'Brien 日本",{exact:true}).count());
    await page.evaluate(()=>go({name:'plan',id:Object.keys(db.plans)[0]}));
    assert.equal(await page.locator('.dex span b').count(),0);
    assert.ok((await page.locator('.dex span').textContent()).includes('<b>8</b>'));
  });
  await test('real shared-link navigation, pasted form and confirmed untrusted backup',async page=>{
    const link=id=>origin+'/#scheda='+Buffer.from(JSON.stringify({v:1,t:'p',id,n:'Plan from link',d:[{n:'A',e:[['','Squat',3,'<b>8</b>',60]]}]})).toString('base64url');
    await page.goto(link(marker));await ready(page);
    assert.equal(await page.locator('#reviewmark').count(),0);
    await page.goto(link('from-link'));await ready(page);
    await page.waitForSelector('[data-act=startday]');
    assert.equal(await page.locator('.dex span b').count(),0);
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>''}});sheetPasteAny(t('pastePlan'));});
    await page.locator('form[data-form=paste] textarea').fill(link('from-paste'));
    await page.locator('form[data-form=paste] button').click();
    assert.equal(await page.evaluate(()=>view.id),'from-paste');
    const imported=await page.evaluate(async legacy=>{
      await importData({files:[new File([JSON.stringify(legacy)],'untrusted.json')],value:'x'});
      return {alerts:__alerts,markers:document.querySelectorAll('#reviewmark').length,names:db.sessions.map(s=>s.name)};
    },legacy);
    assert.deepEqual(imported,{alerts:[],markers:0,names:["O'Brien 日本"]});
    await page.reload();await ready(page);await page.evaluate(()=>go({name:'home',tab:'sessions'}));
    assert.equal(await page.locator('#reviewmark').count(),0);
  });
  await test('chat: authenticated rumors, hashes, recipients, safe reactions and no profile photos',async page=>{
    const out=await page.evaluate(async marker=>{
      const nt=await nostrLoad(),mine=new Uint8Array(32).fill(1),friend=new Uint8Array(32).fill(2);
      const pk=nt.getPublicKey(mine),other=nt.getPublicKey(friend);
      db.chat={sk:toHex(mine),pk,tok:'fixture',friends:{[other]:{pk:other,n:"O'Brien 日本",av:'data:image/jpeg;base64,AAAA',added:1}},msgs:{},relays:[],seen:[],blocked:[],av:'data:image/jpeg;base64,AAAA'};
      const event=(body,mutate)=>{
        const r=nt.nip59.createRumor({kind:14,content:JSON.stringify(body),tags:[['p',pk]],created_at:nowSec()},friend);
        if(mutate)mutate(r);
        return nt.nip59.createWrap(nt.nip59.createSeal(r,friend,pk),pk);
      };
      await chatReceive(event({k:'t',x:'valid encrypted text'}));
      await chatReceive(event({k:'t',x:'bad-id'},r=>r.id=marker));
      await chatReceive(event({k:'t',x:'wrong-hash'},r=>r.id='f'.repeat(64)));
      await chatReceive(event({k:'t',x:'wrong-recipient'},r=>{r.tags=[['p',other]];r.id=nt.getEventHash(r);}));
      await chatReceive(event({k:'img',d:'data:image/jpeg;base64,AA\"><b id=reviewmark>bad</b>',w:1,h:1}));
      const first=(chat().msgs[other]||[]).find(m=>m.x==='valid encrypted text');
      await chatReceive(event({k:'rx',to:first.id,e:'❤️'}));
      await chatReceive(event({k:'rx',to:first.id,e:'<b>x</b>'}));
      await chatReceive(event({k:'pf',av:'data:image/jpeg;base64,AAAA'}));
      go({name:'chat',id:other});sheetChatSettings();
      const controls=document.querySelectorAll('[data-act=chatavatar],[data-act=chatavatardel],#avfile').length;
      closeSheet();go({name:'chat',id:other});
      const direct=bubbleHtml(other,{id:marker,from:'them',k:'t',x:'literal',t:nowSec()},[]);
      const box=document.createElement('div');box.innerHTML=direct;
      return {texts:(chat().msgs[other]||[]).filter(m=>m.k==='t').map(m=>m.x),
        reactions:(chat().msgs[other]||[]).filter(m=>m.k==='rx').map(m=>m.e),
        imgs:document.querySelectorAll('.cava img').length,controls,marker:box.querySelectorAll('#reviewmark').length,
        photoMessages:(chat().msgs[other]||[]).filter(m=>m.k==='img').length};
    },marker);
    assert.deepEqual(out,{texts:['valid encrypted text'],reactions:['❤️'],imgs:0,controls:0,marker:0,photoMessages:0});
    await page.screenshot({path:path.join(root,'artifacts/security/chat-initials.png')});
  });
  await test('known friends: visible photos, photo upload, full-screen, backup and no legacy avatars',async page=>{
    const sent=await page.evaluate(async()=>{
      const nt=await nostrLoad(),mine=new Uint8Array(32).fill(1),friend=new Uint8Array(32).fill(2),pk=nt.getPublicKey(mine),other=nt.getPublicKey(friend);
      const c=document.createElement('canvas');c.width=4;c.height=3;c.getContext('2d').fillRect(0,0,4,3);const data=c.toDataURL('image/jpeg');
      db.chat={sk:toHex(mine),pk,tok:'ab'.repeat(12),friends:{[other]:{pk:other,n:'Test friend',added:1,unread:0}},msgs:{},relays:[],sync:0,seen:[],blocked:[]};
      const event=sender=>{const r=nt.nip59.createRumor({kind:14,content:JSON.stringify({k:'img',d:data,w:1,h:1}),tags:[['p',pk]],created_at:nowSec()},sender);
        return {r,wrap:nt.nip59.createWrap(nt.nip59.createSeal(r,sender,pk),pk)};};
      const unknown=new Uint8Array(32).fill(3),blocked=new Uint8Array(32).fill(4),blockedPk=nt.getPublicKey(blocked);
      db.chat.friends[blockedPk]={pk:blockedPk,n:'Blocked fixture',added:1,unread:0};db.chat.blocked.push(blockedPk);
      await chatReceive(event(unknown).wrap);await chatReceive(event(blocked).wrap);
      const ignored=!(db.chat.msgs[nt.getPublicKey(unknown)]||[]).length&&!(db.chat.msgs[blockedPk]||[]).length;
      delete db.chat.friends[blockedPk];
      const {r,wrap}=event(friend);await chatReceive(wrap);
      const outbound=await chatSend(other,{k:'t',x:"Local roundtrip O'Brien 日本"});
      db.chat.av=data;db.chat.friends[other].av=data;save();await Promise.all([...pendingWrites]);
      window.__friend=other;window.__mid=r.id;
      go({name:'chat',id:other});
      return {count:chat().msgs[other].length,id:outbound.id,width:chat().msgs[other][0].w,height:chat().msgs[other][0].h,data,ignored};
    });
    assert.equal(sent.count,2);assert.equal(sent.width,4);assert.equal(sent.height,3);assert.match(sent.id,/^[a-f0-9]{64}$/);assert.equal(sent.ignored,true);
    await page.waitForFunction(()=>document.querySelector('.cimg')?.naturalWidth===4);
    await page.locator('.cimg').click();await page.waitForFunction(()=>document.querySelector('#sheet .big-img')?.naturalWidth===4);
    assert.equal(await page.locator('#reviewmark').count(),0);
    await page.evaluate(()=>closeSheet());
    await page.locator('#cfile').setInputFiles({name:'friend-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(sent.data.split(',')[1],'base64')});
    await page.waitForFunction(()=>chat().msgs[__friend].filter(m=>m.k==='img'&&m.from==='me').length===1);
    await page.waitForFunction(()=>document.querySelectorAll('.cimg').length===2&&[...document.querySelectorAll('.cimg')].every(i=>i.naturalWidth===4));
    assert.deepEqual(await page.evaluate(()=>__alerts),[]);
    await page.screenshot({path:path.join(root,'artifacts/security/chat-friend-photos.png')});
    const exported=await page.evaluate(async()=>{closeSheet();const f=await prepareBackup();const o=JSON.parse(await f.text());return {photoCount:o.chatPhotos.length,photoId:o.chatPhotos[0]?.id,hasKey:!!o.chat.sk};});
    assert.equal(exported.photoCount,2);assert.equal(exported.hasKey,true);assert.match(exported.photoId,/^c:[a-f0-9]{64}$/);
    await page.reload();await ready(page);
    const legacy=await page.evaluate(()=>{const other=Object.keys(chat().friends)[0];go({name:'chat',id:other});return {self:!!chat().av,friend:!!chat().friends[other].av,avatars:document.querySelectorAll('.cava img').length};});
    assert.deepEqual(legacy,{self:false,friend:false,avatars:0});
    await page.waitForFunction(()=>document.querySelector('.cimg')?.naturalWidth===4);
  });
  await test('backup: invalid images, URL, aborted write and cancellation preserve all data',async page=>{
    await page.evaluate(async()=>{
      const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d').fillRect(0,0,2,2);
      window.__photo=c.toDataURL('image/png');
      const media=await GymMedia.decodeInlineImage(__photo);
      db.sessions=[{id:'original',date:'2026-10-18',name:'Original workout',exercises:[]}];
      const nt=await nostrLoad(),sk=new Uint8Array(32).fill(1);
      db.chat={sk:toHex(sk),pk:nt.getPublicKey(sk),tok:'ab'.repeat(12),friends:{},msgs:{},relays:[],sync:0,seen:[],blocked:[]};
      save();await Promise.all([...pendingWrites]);
      await photoTx('readwrite',s=>s.put({id:'old-photo',date:'2026-10-18',pose:'front',blob:media.blob}));await loadPhotos();
      window.__backup={sessions:[{id:'replacement',date:'2026-10-18',name:'Replacement',exercises:[]}],tourSeen:'2026-10-18',badges:{},photos:[{id:'new-photo',date:'2026-10-18',pose:'front',data:__photo}]};
    });
    const before=await snapshot(page);
    for(const data of ['https://outside.invalid/private','data:image/jpeg;base64,AAAA','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=']) {
      assert.equal(await page.evaluate(async data=>{const b=structuredClone(__backup);b.photos[0].data=data;try{await stageBackup(new File([JSON.stringify(b)],'test.json'));return false;}catch{return true;}},data),true);
      assert.deepEqual(await snapshot(page),before);
    }
    assert.equal(await page.evaluate(async()=>{const b=structuredClone(__backup);b.photos[0].date='2026-02-31';
      try{await stageBackup(new File([JSON.stringify(b)],'test.json'));return false;}catch{return true;}}),true);
    assert.deepEqual(await snapshot(page),before);
    const abort=await page.evaluate(async()=>{
      const staged=await stageBackup(new File([JSON.stringify(__backup)],'test.json'));
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(v,k){if(this.name===STORE&&k===KEY)throw new DOMException('Synthetic quota failure','QuotaExceededError');return original.apply(this,arguments);};
      try{await commitBackup(staged);return false;}catch{return true;}finally{IDBObjectStore.prototype.put=original;}
    });
    assert.equal(abort,true);assert.deepEqual(await snapshot(page),before);
    await page.evaluate(async()=>{window.confirm=()=>false;await importData({files:[new File([JSON.stringify(__backup)],'test.json')],value:'x'});window.confirm=()=>true;});
    assert.deepEqual(await snapshot(page),before);
    assert.deepEqual(await page.evaluate(()=>__alerts),[]);
  });
  await test('plain/encrypted backup and failed localStorage cache recover after reload',async page=>{
    const r=await page.evaluate(async()=>{
      const c=document.createElement('canvas');c.width=c.height=2;const photo=c.toDataURL('image/png');
      const o={...db,sessions:[{id:'restored',date:'2026-10-18',name:"O'Brien 日本",exercises:[]}],photos:[{id:'p1',date:'2026-10-18',pose:'front',data:photo}]};
      const file=new File([JSON.stringify(o)],'plain.json');
      await importData({files:[file],value:'x'});
      const plain=db.sessions[0].name,plainPhotos=photos.length;
      const encrypted=await encryptBackup(JSON.stringify(o),'synthetic-password');
      await importData({files:[new File([encrypted],'encrypted.json')],value:'x'});
      const staged=await stageBackup(file),original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k===KEY)throw new DOMException('Synthetic cache failure','QuotaExceededError');return original.apply(this,arguments);};
      try{await commitBackup(staged);}finally{Storage.prototype.setItem=original;}
      return {plain,plainPhotos,encrypted:db.sessions[0].name,alerts:__alerts};
    });
    assert.deepEqual(r,{plain:"O'Brien 日本",plainPhotos:1,encrypted:"O'Brien 日本",alerts:[]});
    await page.reload();await ready(page);
    assert.equal(await page.evaluate(()=>db.sessions[0].name),"O'Brien 日本");
    assert.equal(await page.evaluate(()=>photos.length),1);
    assert.equal(await page.evaluate(()=>localStorage.getItem(KEY)),await page.evaluate(()=>JSON.stringify(db)));
  });
  await test('a stale current-version tab cannot overwrite a completed restore',async(page,diag)=>{
    await page.evaluate(()=>{db.sessions=[{id:'before',date:'2026-10-18',name:'Before',exercises:[]}];save();});await ready(page);
    const other=await page.context().newPage();
    other.on('pageerror',e=>diag.pageerror.push(e.message));
    other.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});
    other.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));
    other.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});
    try {
      await other.goto(origin+'/');await ready(other);
      await page.evaluate(async()=>{const o={...db,sessions:[{id:'after',date:'2026-10-18',name:'After',exercises:[]}],photos:[]};await importData({files:[new File([JSON.stringify(o)],'test.json')],value:'x'});});
      assert.equal(await other.evaluate(async()=>{try{await idbPut(JSON.stringify(db));return false;}catch{return true;}}),true);
      assert.equal(await page.evaluate(async()=>JSON.parse(await idbGet()).sessions[0].name),'After');
      await other.evaluate(()=>restore());
      assert.equal(await other.evaluate(()=>db.sessions[0].name),'After');
      assert.deepEqual(await page.evaluate(()=>__alerts),[]);
    } finally {await other.close();}
  });
  // Deliberate harmless CSP probes have expected browser console diagnostics.
  const csp=await fresh();
  try {
    const state=await csp.page.evaluate(async()=>{
      window.__csp=[];window.__inline=false;window.__handler=false;
      document.addEventListener('securitypolicyviolation',e=>__csp.push(e.effectiveDirective));
      const s=document.createElement('script');s.textContent='window.__inline=true';document.head.append(s);
      const b=document.createElement('button');b.setAttribute('onclick','window.__handler=true');document.body.append(b);b.click();
      await new Promise(r=>setTimeout(r,50));
      return {inline:__inline,handler:__handler,violations:__csp};
    });
    assert.equal(state.inline,false);assert.equal(state.handler,false);
    assert.ok(state.violations.includes('script-src-elem'));assert.ok(state.violations.includes('script-src-attr'));
    assert.equal(csp.diag.external.length,0);assert.equal(csp.diag.pageerror.length,0);
    results.push({name:'CSP blocks inline scripts and event handlers',status:'pass',expectedViolations:state.violations});
  }finally{await csp.context.close();}
  fs.writeFileSync(path.join(root,'artifacts/security/results.json'),JSON.stringify({results},null,2));
  console.log(`${results.length} security groups PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
