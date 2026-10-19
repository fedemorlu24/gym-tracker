const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 const context=await browser.newContext({locale:'it-IT',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),diag={console:[],pageerror:[],failed:[],http:[],external:[],sockets:[]};
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://fedemorlu24.github.io'){diag.external.push(u.href);return route.abort();}return route.continue();});
 await context.routeWebSocket('**',socket=>{diag.sockets.push(socket.url());socket.close();});
 page.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});page.on('pageerror',e=>diag.pageerror.push(e.message));page.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});
 try{
  await page.goto('https://fedemorlu24.github.io/gym-tracker/');
  await page.waitForFunction(()=>window.gymBooted===true&&!document.body.hidden&&APP_VERSION==='75',{},{timeout:90000});
  const welcome=page.locator('#install [data-act=installclose]');if(await welcome.isVisible().catch(()=>false))await welcome.tap();
  const tour=page.locator('#tour [data-act=tourend]');if(await tour.isVisible().catch(()=>false))await tour.tap();
  await page.locator('[data-tab=chat]').tap();
  await page.waitForFunction(()=>ChatVault.status()==='setup');
  await page.evaluate(()=>acts.chatvault());
  const skip=page.locator('#chat-vault-skip');await skip.waitFor({state:'visible'});
  const visible=await skip.isVisible(),beforeFocus=await page.evaluate(()=>document.activeElement?.id);
  assert.equal(visible,true);assert.notEqual(beforeFocus,'chat-vault-password');
  await skip.tap();
  await page.waitForFunction(()=>ChatVault.status()==='unlocked'&&/^[a-f0-9]{64}$/.test(chat().pk));
  const identity=await page.evaluate(()=>({version:APP_VERSION,pk:chat().pk,hasRawKey:!!chat().sk,hasVault:!!chat().vault,status:ChatVault.status()}));
  await page.reload();await page.waitForFunction(()=>window.gymBooted===true&&APP_VERSION==='75'&&ChatVault.status()==='unlocked');
  assert.equal(await page.evaluate(()=>chat().pk),identity.pk);
  await page.locator('[data-tab=chat]').tap();
  diag.result={version:identity.version,hasRawKey:identity.hasRawKey,hasVault:identity.hasVault,status:identity.status,reloadPreservedIdentity:true,chatTab:await page.locator('[data-tab=chat]').getAttribute('aria-selected'),chatInviteReady:await page.locator('[data-act=chatinvite]').count()===1};
  assert.equal(diag.result.chatTab,'true');assert.equal(diag.result.chatInviteReady,true);
  assert.deepEqual(diag.console,[]);assert.deepEqual(diag.pageerror,[]);assert.deepEqual(diag.failed,[]);assert.deepEqual(diag.http,[]);assert.deepEqual(diag.external,[]);assert.ok(diag.sockets.length>0);diag.socketNote='Public Nostr relay sockets were intercepted and closed by the test; no real chat connection was made.';
  const fs=require('node:fs');fs.writeFileSync(__dirname+'/live-smoke.json',JSON.stringify(diag,null,2));console.log(JSON.stringify(diag,null,2));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
