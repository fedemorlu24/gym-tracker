// Isolated production-code checks. Synthetic identities; every HTTP request is
// served from this checkout and every WebSocket is intercepted before connecting.
const {chromium,webkit} = require('playwright');
let engine='chromium';
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
  const context = await browser.newContext({locale:'it-IT', viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
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
    results.push({engine,name,status:'pass',...f.diag}); console.log('PASS '+name);
  } catch(e) {console.error(name,f.diag);throw e;} finally {await f.context.close();}
}
async function begin(page,settings=false){
 await page.evaluate(settings=>{if(settings)sheetChatSettings();else go({name:'home',tab:'chat'});},settings);
 if(settings)await page.locator('#sheet [data-act=chatvault]').click();else await page.locator('#app [data-act=chatvault]').first().click();
 await page.locator('#chat-vault-form').waitFor();await page.waitForTimeout(350);
}
async function cancel(page){await page.locator('#chat-vault-cancel').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.waitForFunction(()=>!chatVaultPrompt);}
async function geometry(page,name='password'){
 return page.evaluate(name=>{const el=document.querySelector('#chat-vault-form [name='+name+']'),pane=document.querySelector('#sheet .pane'),r=el.getBoundingClientRect(),p=pane.getBoundingClientRect(),v=visualViewport;
 return {name,active:document.activeElement===el,visible:r.top>=Math.max(v.offsetTop,p.top)-1&&r.bottom<=Math.min(v.offsetTop+v.height,p.bottom)+1,
  top:r.top,bottom:r.bottom,viewportTop:v.offsetTop,viewportHeight:v.height,paneTop:p.top,paneBottom:p.bottom,sheetScroll:document.getElementById('sheet').scrollTop,windowY:scrollY};},name);
}
async function swipe(page,selector,dx,dy,cancel=false){
 await page.evaluate(({selector,dx,dy,cancel})=>{
  const target=document.querySelector(selector),r=target.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  for(const [type,f]of [['touchstart',0],['touchmove',.5],['touchmove',1],[cancel?'touchcancel':'touchend',1]]){
   const event=new Event(type,{bubbles:true,cancelable:true}),touch={identifier:1,target,clientX:x+dx*f,clientY:y+dy*f};
   Object.defineProperties(event,{touches:{value:type==='touchend'||type==='touchcancel'?[]:[touch]},changedTouches:{value:[touch]}});target.dispatchEvent(event);
  }
 },{selector,dx,dy,cancel});await page.waitForTimeout(300);
}
(async()=>{
 fs.mkdirSync(path.join(root,'artifacts/modal-v72'),{recursive:true});
 for(engine of ['chromium','webkit']){
  browser=await ({chromium,webkit}[engine]).launch();
  await test('password focus is visible before any scrolling automation in five languages and three mobile sizes',async page=>{
   await page.evaluate(()=>{window.__focusGeometry=[];const focus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(...args){
    if(this.name==='password'){const r=this.getBoundingClientRect();__focusGeometry.push({top:r.top,bottom:r.bottom,height:visualViewport.height,offset:visualViewport.offsetTop});}return focus.apply(this,args);};});
   for(const language of ['it','en','es','fr','de'])for(const size of [{width:390,height:844},{width:320,height:568},{width:390,height:420}]){
    await page.setViewportSize(size);await page.evaluate(l=>{db.settings={lang:l};setLang();},language);
    for(const settings of [false,true]){
     await begin(page,settings);const g=await geometry(page);assert.equal(g.active,true);assert.equal(g.visible,true,JSON.stringify({language,size,settings,g}));assert.equal(g.sheetScroll,0);
     const before=await page.evaluate(()=>__focusGeometry.at(-1));assert.ok(before.top>=before.offset&&before.bottom<=before.offset+before.height,JSON.stringify(before));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     if(language==='it'&&size.height===844&&!settings)await page.screenshot({path:path.join(root,`artifacts/modal-v72/${engine}-password.png`)});
     await cancel(page);
    }
   }
  });
  await test('keyboard viewport changes keep password and confirmation reachable without shifting the page',async page=>{
   await page.evaluate(()=>{window.__vh=844;window.__vy=0;Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>__vh});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,get:()=>__vy});});
   await begin(page);
   for(const scenario of [{height:390,top:0},{height:240,top:80},{height:440,top:0}]){
    await page.evaluate(s=>{__vh=s.height;__vy=s.top;visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));},scenario);await page.waitForTimeout(70);
    let g=await geometry(page);assert.equal(g.visible,true,JSON.stringify(g));assert.equal(g.active,true);
    await page.locator('#chat-vault-form [name=password]').fill('synthetic-modal-password');
    await page.locator('#chat-vault-form [name=confirm]').focus();await page.waitForTimeout(70);
    g=await geometry(page,'confirm');assert.equal(g.visible,true,JSON.stringify(g));await page.locator('#chat-vault-form [name=confirm]').fill('synthetic-modal-password');
    await page.locator('#chat-vault-form [name=password]').focus();await page.waitForTimeout(70);
   }
   await page.screenshot({path:path.join(root,`artifacts/modal-v72/${engine}-keyboard-viewport.png`)});
   await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});await cancel(page);
  });
  await test('scrolling form content never dismisses it; only a downward handle drag closes it',async page=>{
   await page.setViewportSize({width:320,height:568});await begin(page);
   await page.locator('#chat-vault-form [name=password]').fill('preserve-this-draft');
   await swipe(page,'#chat-vault-form .note',0,120);
   assert.equal(await page.locator('#sheet').isVisible(),true);assert.equal(await page.locator('#chat-vault-form [name=password]').inputValue(),'preserve-this-draft');
   await page.evaluate(()=>{document.querySelector('#sheet .pane').scrollTop=0;});
   await swipe(page,'#sheet h2',0,120);assert.equal(await page.locator('#sheet').isVisible(),true);
   await swipe(page,'#sheet .grab',0,120,true);assert.equal(await page.locator('#sheet').isVisible(),true);
   assert.equal(await page.locator('#sheet .pane').evaluate(el=>el.style.transform),'');
   await swipe(page,'#sheet .grab',130,20);assert.equal(await page.locator('#sheet').isVisible(),true);
   await swipe(page,'#sheet .grab',0,120);assert.equal(await page.locator('#sheet').isHidden(),true);assert.equal(await page.evaluate(()=>chatVaultPrompt),null);
  });
  await test('scroll, entry and cancellation work for archive and backup forms too',async page=>{
   await page.setViewportSize({width:320,height:568});await page.evaluate(()=>acts.archiveprotect());await page.waitForTimeout(350);
   await swipe(page,'#archive-setup-form .note',0,120);assert.equal(await page.locator('#archive-setup-form').isVisible(),true);
   await page.locator('#archive-setup-form [name=password]').fill('synthetic-modal-password');await page.locator('#archive-setup-form [name=confirm]').fill('synthetic-modal-password');
   await page.locator('#sheet .sheetx').click();await page.locator('#sheet').waitFor({state:'hidden'});
   await page.evaluate(()=>sheetBackup());await page.waitForTimeout(350);await page.locator('#bk-pwd').fill('synthetic-modal-password');
   await page.waitForFunction(()=>backupFile&&!document.getElementById('exp-btn').disabled);assert.equal(await page.evaluate(()=>bkPwd),'synthetic-modal-password');
   await page.locator('#sheet .sheetx').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>backupDialog),null);
  });
  if(engine==='chromium')await test('real touch scrolling moves only the content; handle drag intentionally dismisses',async page=>{
   await page.setViewportSize({width:320,height:568});await begin(page);const cdp=await page.context().newCDPSession(page);
   async function gesture(x,y,dy){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/8}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(350);}
   await gesture(160,460,-170);assert.equal(await page.locator('#sheet').isVisible(),true);assert.ok(await page.locator('#sheet .pane').evaluate(e=>e.scrollTop)>80);
   await gesture(160,240,170);assert.equal(await page.locator('#sheet').isVisible(),true);
   await page.evaluate(()=>{document.querySelector('#sheet .pane').scrollTop=0;});await page.waitForTimeout(80);
   const grab=await page.locator('#sheet .grab').boundingBox();await gesture(grab.x+grab.width/2,grab.y+grab.height/2,120);
   assert.equal(await page.locator('#sheet').isHidden(),true);
  });
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(root,'artifacts/modal-v72/results.json'),JSON.stringify({results},null,2));console.log(`${results.length} modal groups PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
