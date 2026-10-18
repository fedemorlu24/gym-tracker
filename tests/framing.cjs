// Real local HTTP origins, no users' profiles or remote services.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts/security');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.wasm':'application/wasm'};
let appURL,otherURL,browser;const results=[],servers=[];
async function serve(){
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local.test');
    if(url.pathname==='/test-host'){
      const sandbox=url.searchParams.get('sandbox');
      res.setHeader('Content-Type','text/html');
      return res.end(`<!doctype html><link rel="icon" href="data:,"><iframe id="target" ${sandbox!==null?'sandbox="'+sandbox+'"':''} src="${appURL}"></iframe>`);
    }
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
  return `http://127.0.0.1:${server.address().port}/`;
}
async function fresh(options={}){
  const context=await browser.newContext({locale:'it-IT',viewport:{width:390,height:844},...options});
  const diag={console:[],pageerror:[],failed:[],http:[],sockets:[],external:[]},requests=[];
  await context.routeWebSocket('**',socket=>{diag.sockets.push(socket.url());socket.close();});
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')diag.console.push(m.text());});
  page.on('pageerror',e=>diag.pageerror.push(e.message));
  page.on('request',r=>{requests.push(r.url());if(![new URL(appURL).origin,new URL(otherURL).origin].includes(new URL(r.url()).origin))diag.external.push(r.url());});
  page.on('requestfailed',r=>diag.failed.push({url:r.url(),error:r.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)diag.http.push({url:r.url(),status:r.status()});});
  return {context,page,diag,requests};
}
function clean(diag){for(const key of Object.keys(diag))assert.deepEqual(diag[key],[],key);}
(async()=>{
  fs.mkdirSync(out,{recursive:true});appURL=await serve();otherURL=await serve();browser=await chromium.launch();
  for(const [name,base,sandbox] of [['cross-origin first visit',otherURL,null],['same-origin first visit',appURL,null],['sandbox permits scripts only',otherURL,'allow-scripts'],['sandbox disables scripts',otherURL,'']]){
    const f=await fresh();
    try{
      await f.page.goto(base+'test-host'+(sandbox!==null?'?sandbox='+encodeURIComponent(sandbox):''));
      const frame=f.page.frames().find(frame=>frame.url()===appURL);assert.ok(frame,'App frame exists');
      if(sandbox!=='')await frame.getByText('Apri Gym Tracker direttamente nel browser o dalla schermata Home.',{exact:true}).waitFor();
      const state=await frame.evaluate(()=>({started:typeof db!=='undefined'||!!window.gymDataReady||!!window.gymBooted,controls:document.querySelectorAll('button,input,textarea').length,hidden:document.body.hidden}));
      assert.equal(state.started,false);assert.equal(state.controls,0);
      if(sandbox==='')assert.equal(state.hidden,true);
      const sensitive=f.requests.filter(u=>/\/(app|chat|chat-vault|security-data|nostr-tools|update)\.js/.test(u));
      assert.deepEqual(sensitive,[]);
      // Sandboxed script blocking is the intended browser policy, not an app error.
      if(sandbox===''){
        assert.ok(f.diag.console.every(m=>m.includes('sandboxed')&&m.includes('allow-scripts')));
        f.diag.console=[];
      }
      clean(f.diag);results.push({name,status:'pass',sensitiveRequests:0,...f.diag});console.log('PASS '+name);
    }finally{await f.context.close();}
  }
  const f=await fresh();
  try{
    await f.page.goto(appURL);await f.page.waitForFunction(()=>window.gymBooted&&window.gymDataReady);
    await f.page.evaluate(async()=>{await gymDataReady;document.getElementById('tour').hidden=true;document.getElementById('install').hidden=true;});
    assert.equal(await f.page.evaluate(()=>document.body.hidden),false);
    await f.page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    let response=await f.page.reload();await f.page.waitForFunction(()=>window.gymBooted);
    let headers=await response.allHeaders();assert.equal(headers['x-frame-options'],'DENY');assert.ok(headers['content-security-policy'].includes("frame-ancestors 'none'"));
    await f.context.setOffline(true);response=await f.page.reload();await f.page.waitForFunction(()=>window.gymBooted);
    headers=await response.allHeaders();assert.equal(headers['x-frame-options'],'DENY');assert.ok(headers['content-security-policy'].includes("frame-ancestors 'none'"));
    await f.context.setOffline(false);clean(f.diag);
    results.push({name:'top-level online/offline startup; controlled navigation supplies framing headers',status:'pass',...f.diag});
    console.log('PASS top-level online/offline and response headers');
    const navigation=f.page.waitForResponse(r=>r.url()===appURL);
    await f.page.goto(appURL+'test-host');const framedResponse=await navigation;
    assert.equal((await framedResponse.allHeaders())['x-frame-options'],'DENY');
    await f.page.waitForFunction(()=>document.getElementById('target')!==null);
    assert.ok(f.diag.console.some(m=>m.includes('frame-ancestors')||m.includes('X-Frame-Options')));
    assert.deepEqual(f.diag.pageerror,[]);assert.deepEqual(f.diag.http,[]);assert.deepEqual(f.diag.external,[]);assert.deepEqual(f.diag.sockets,[]);
    assert.ok(f.diag.failed.every(r=>r.url===appURL&&r.error.includes('BLOCKED')));
    results.push({name:'controlled frame rejected by browser policy',status:'pass',expectedConsole:f.diag.console,expectedFailed:f.diag.failed});
    console.log('PASS controlled frame rejected');
  }finally{await f.context.close();}
  fs.writeFileSync(path.join(out,'framing-results.json'),JSON.stringify({results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();for(const server of servers)await new Promise(resolve=>server.close(resolve));});
