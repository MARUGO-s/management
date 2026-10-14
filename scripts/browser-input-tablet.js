// Offline Chrome layout regression: no request may reach a real service (CDN included).
// NODE_PATH=<playwright node_modules> node scripts/browser-input-tablet.js <out> [--baseline]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:18764';
const OUT = path.resolve(process.argv[2]);
const baseline = process.argv.includes('--baseline');
const REF = process.env.BASELINE_REF || '40354805251987c92ae68b8a01dfed4e80277988';
const sizes = [[1440,900],[1280,800],[1180,820],[1024,768],[820,1180],[768,1024],[600,960],[390,844]];
fs.mkdirSync(OUT, {recursive:true});
const bodies = new Map();
function read(file) {
  if (!baseline) return fs.readFileSync(file);
  if (!bodies.has(file)) bodies.set(file, execFileSync('git',['show',`${REF}:${path.relative(ROOT,file)}`],{cwd:ROOT}));
  return bodies.get(file);
}
const values = page => page.locator('#loanForm').evaluate(f => [...f.querySelectorAll('input,select')].map(e=>[e.id,e.className,e.value]));
async function measure(page) {
  return page.evaluate(() => {
    const rect = e => {const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
    const controls=[...document.querySelectorAll('#loanForm input:not([type=hidden]), #loanForm select, #loanForm button, .category-option, #layoutToggleBtn')].filter(e=>e.getClientRects().length);
    return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,rows:document.querySelectorAll('.entry-row').length,
      bad:controls.filter(e=>{const r=rect(e);return r.left < -1 || r.right > innerWidth+1 || r.width<1;}).map(e=>({id:e.id,cls:e.className,...rect(e)})),
      categoryClipped:[...document.querySelectorAll('.category-option')].filter(e=>e.scrollWidth>e.clientWidth+1).length,
      labels:[...document.querySelectorAll('.entry-row label')].map(e=>getComputedStyle(e).display),
      row:rect(document.querySelector('.entry-row')),category:rect(document.querySelector('.category-grid')),item:rect(document.querySelector('.item')),price:rect(document.querySelector('.unit-price'))};
  });
}
function check(m) {
  assert(m.scroll<=m.viewport+1,`horizontal overflow ${JSON.stringify(m)}`);
  assert.deepEqual(m.bad,[], 'every visible business control has safe horizontal bounds');
  assert.equal(m.categoryClipped,0,'all four category captions fit');
  if(m.viewport<1280) assert(m.labels.every(l=>l!=='none'),'wrapped cards label each field');
  else assert(Math.abs(m.price.bottom-m.item.bottom)<2,'wide desktop keeps one item per line');
}
async function safeCard(page, selector) {
  const r=await page.locator(selector).boundingBox();
  const v=page.viewportSize(); assert(r && r.width>0 && r.x>=0 && r.x+r.width<=v.width+1 && r.y>=0 && r.y+r.height<=v.height+1,`${selector} viewport bounds ${JSON.stringify(r)}`);
  assert(await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${selector} on top`);
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const results=[];
  try {
    for(const [width,height] of sizes) for(const mode of (width===390?['pc','sp']:['pc'])) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:!baseline && width<1280,serviceWorkers:'block'});
      const posts=[],remote=[],errors=[];
      await context.addInitScript(({mode})=>{
        if(mode==='pc') localStorage.setItem('inputLayoutMode','pc');
        sessionStorage.setItem('loanSession',JSON.stringify({token:'offline-fixture-session',expiresAt:Date.now()+3600000}));
        sessionStorage.setItem('simpleAuth',JSON.stringify({authenticated:true,timestamp:new Date().toISOString()}));
      },{mode});
      await context.route('**/*',async route=>{
        const req=route.request(),u=new URL(req.url());
        if(u.origin===BASE) {
          assert.equal(req.method(),'GET');
          const file=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname));
          if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)) return route.fulfill({status:404,body:''});
          return route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':'application/octet-stream',body:read(file)});
        }
        remote.push({host:u.hostname,method:req.method()});
        let body={};try{body=JSON.parse(req.postData()||'{}');}catch{}
        let response={success:true,status:'SUCCESS',monthly:{total:0},daily:{total:0},total:{total:0},devices:{count:0},data:[]};
        if(u.hostname==='script.google.com') {
          if(req.method()==='GET') response={status:'SUCCESS',idempotencyVersion:1,similarityVersion:1,duplicateRulesVersion:2,receiptColumnsReady:true};
          else {const {sessionToken,...business}=body; posts.push({...business,authenticated:!!sessionToken}); response={status:'SUCCESS',idempotencyVersion:1,receiptId:body.receiptId,notifications:{backup:'completed',email:'completed'}};}
        } else if(u.pathname.endsWith('sheets-api')) response={values:[['date','name','lender','borrower','category','item','quantity','price','amount','inputDate','correction','receipt']]};
        else if(u.pathname.endsWith('password-manager')) response={success:true,passwords:{system:{status:'設定済み'}}};
        else if(!u.hostname.endsWith('supabase.co')) return route.fulfill({status:200,body:'',contentType:'text/plain'});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
      });
      const page=await context.newPage(); let navs=0;
      page.on('framenavigated',f=>{if(f===page.mainFrame())navs++;});
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      try {
        await page.goto(BASE+'/index.html');await page.waitForTimeout(1300);
        await page.addStyleTag({content:'*,*::before,*::after {animation:none !important;transition:none !important;} .container {opacity:1 !important;transform:none !important;}'});
        const initial=await measure(page);assert.equal(initial.rows,mode==='pc'?5:1,'unchanged presets');
        if(baseline && width===390 && mode==='pc') { results.push({mode,width,height,initial,errors,navs});continue; }
        if(mode==='sp') {
          assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('pc-mode')),false);
          await page.locator('#date').fill('2026-10-14');
          await page.screenshot({path:path.join(OUT,'sp-390-primary.png')});
          await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
          await page.screenshot({path:path.join(OUT,'sp-390-bottom.png')});
          results.push({mode,width,height,initial,errors,navs});continue;
        }
        if(!baseline)check(initial);
        await page.locator('#date').fill('2026-10-14');await page.locator('#name').fill('OFFLINE-TEST');
        await page.locator('#lender').selectOption({index:1});await page.locator('#borrower').selectOption({index:2});
        const extra=page.locator('.full-entry-group').first();
        await extra.locator('.full-date').fill('2026-10-14');await extra.locator('.full-name').fill('OFFLINE-EXTRA');
        await extra.locator('.full-lender').selectOption({index:1});await extra.locator('.full-borrower').selectOption({index:2});
        const rows=page.locator('.entry-row');
        for(let i=0;i<await rows.count();i++) {
          const row=rows.nth(i),category=row.locator('[data-value="その他"]');
          if(!baseline && width<1280) await category.tap(); else await category.click();
          await row.locator('.item').fill(`OFFLINE-${i} 非常に長い品目名称（タブレット縦横の入力幅検証専用）`);
          await row.locator('.unit-price').fill('123456');await row.locator('.quantity').fill('123');await row.locator('.quantity').blur();
        }
        await page.evaluate(()=>scrollTo(0,0));
        const populated=await measure(page);if(!baseline)check(populated);
        await page.screenshot({path:path.join(OUT,`pc-${width}-primary.png`)});
        await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
        await page.screenshot({path:path.join(OUT,`pc-${width}-bottom.png`)});
        if(!baseline) {
          const last=await rows.last().boundingBox(),bar=await page.locator('#loanForm > .button-group').boundingBox();
          assert(last.y+last.height<=bar.y+1,'bottom item is reachable above sticky submit bar');
          await safeCard(page,'#loanForm > .button-group');
          const before=await values(page);
          await page.evaluate(()=>window.__testNodes=[...document.querySelectorAll('#loanForm input,#loanForm select')]);
          await page.setViewportSize({width:height,height:width});check(await measure(page));
          await page.setViewportSize({width,height});
          await page.locator('#layoutToggleBtn').click();await page.locator('#layoutToggleBtn').click();
          assert.deepEqual(await values(page),before,'orientation and toggle retain every value');
          assert(await page.evaluate(()=>__testNodes.every(e=>e.isConnected)),'business DOM retained');
          await page.locator('#add-row-btn').click();assert.equal(await rows.count(),6);
          await page.locator('#entriesContainer .entry-row').last().locator('.remove-row-btn').click();assert.equal(await rows.count(),5);
          await page.locator('#name').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'name-list-btn');
          await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'lender');
          await page.locator('#name-list-btn').click();await page.locator('#selectModal').waitFor({state:'visible'});await safeCard(page,'#selectModal .select-card');
          await page.screenshot({path:path.join(OUT,`pc-${width}-selection.png`)});await page.keyboard.press('Escape');
          // The existing selection modal closes by clicking its overlay.
          if(await page.locator('#selectModal').isVisible()) await page.locator('#selectModal').click({position:{x:2,y:2}});
        }
        await page.locator('#loanForm button[type=submit]').click();
        await page.waitForFunction(()=>!submitData._isRunning&&document.querySelector('#step-complete')?.classList.contains('final-completed'),{},{timeout:20000});
        assert.equal(posts.length,5);assert(posts.every(p=>p.authenticated));assert.equal(navs,1);assert.deepEqual(errors,[]);
        if(!baseline && [1024,768].includes(width)) {
          const validation=await context.newPage();validation.on('dialog',d=>d.accept());
          await validation.goto(BASE+'/index.html');await validation.waitForTimeout(1300);
          await validation.locator('#loanForm button[type=submit]').click();await validation.waitForTimeout(1000);
          assert.equal(posts.length,5,'blank form makes no additional write');
          assert(await validation.locator('.input-error').count()>0,'blank form marks validation errors');
          await validation.screenshot({path:path.join(OUT,`pc-${width}-blank-validation.png`)});
          await validation.reload();await validation.waitForTimeout(1300);
          await validation.locator('#name').fill('OFFLINE-PARTIAL');
          await validation.locator('#extraGroups .full-name').fill('OFFLINE-PARTIAL-EXTRA');
          await validation.locator('#extraGroups .item').first().fill('部分入力は破棄しない');
          const partial=await values(validation);
          await validation.locator('#loanForm button[type=submit]').click();await validation.waitForTimeout(1000);
          assert.equal(posts.length,5,'partial group makes no additional write');
          assert.equal(await validation.locator('#extraGroups .item').first().inputValue(),'部分入力は破棄しない');
          assert.equal(await validation.locator('#extraGroups .full-name').inputValue(),'OFFLINE-PARTIAL-EXTRA');
          assert(await validation.locator('.input-error').count()>0,'partial group marks validation errors');
          await validation.screenshot({path:path.join(OUT,`pc-${width}-partial-validation.png`)});
          await validation.close();
        }
        results.push({mode,width,height,initial,populated,posts,remoteIntercepted:remote.length,errors,navs});
      } finally {fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));await context.close();}
    }
    console.log(`${baseline?'BASELINE':'GREEN'} ${results.length} viewport/mode cases`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
