// Offline-only integration check. All requests, including CDN, are fulfilled locally.
// NODE_PATH=<playwright node_modules> node scripts/browser-session-recovery.js <output-dir> [--red]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'dogfood-output/session-recovery');
const RED = process.argv.includes('--red');
const LOST = process.argv.includes('--lost-response');
const BASELINE_REF = process.env.BASELINE_REF;
// Reuse the same real-controller failure matrix for tablet PC mode.
const MODES = process.env.RECOVERY_MODES ? process.env.RECOVERY_MODES.split(',') : ['pc','sp'];
const WIDTH = Number(process.env.RECOVERY_WIDTH || 0);
const HEIGHT = Number(process.env.RECOVERY_HEIGHT || 900);
const baselineFiles = new Map();
function localBody(file) {
  if (!BASELINE_REF) return fs.readFileSync(file);
  if (!baselineFiles.has(file)) {
    const result = require('node:child_process').spawnSync('git', ['show', `${BASELINE_REF}:${path.relative(ROOT,file)}`], {cwd:ROOT});
    assert.equal(result.status,0,`baseline file unavailable: ${path.relative(ROOT,file)}`);
    baselineFiles.set(file,result.stdout);
  }
  return baselineFiles.get(file);
}
const BASE = 'http://127.0.0.1:18763';
fs.mkdirSync(OUT, { recursive: true });
const snapshot = page => page.evaluate(() => ({
  fields: [...document.querySelectorAll('#loanForm input, #loanForm select, #extraGroups input, #extraGroups select')]
    // Existing submit validation removes unused preset rows/groups. Compare every field
    // (including empty ones) of populated rows/groups, not disposable blank presets.
    .filter(e => {
      const group=e.closest('.full-entry-group');
      if(group && !group.querySelector('.full-name')?.value && ![...group.querySelectorAll('.item')].some(i=>i.value)) return false;
      const row=e.closest('.entry-row');
      return !row || [...row.querySelectorAll('input')].some(i=>i.value);
    })
    .map(e => ({ id: e.id, cls: e.className.replace(/\b(input-error|error-pulse)\b/g, '').trim(), value: e.value, checked: e.checked })),
  sameDOM: !window.__businessNodes || window.__businessNodes.every(e=>e.isConnected),
  receipts: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('loan-receipt-v1:')).map(k => [k, localStorage.getItem(k)])),
  error: document.querySelector('#errorModal').classList.contains('show'),
  text: document.querySelector('#errorModalBody').textContent,
  onTop: (() => { const e = document.querySelector('#errorModal .modal-card'), r = e.getBoundingClientRect(); return !!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#errorModal'); })(),
  errorWithinViewport: (() => { const r=document.querySelector('#errorModal .modal-card').getBoundingClientRect(); return r.width>0 && r.x>=0 && r.right<=innerWidth+1 && r.y>=0 && r.bottom<=innerHeight+1; })(),
  name: document.querySelector('#name').value,
  session: !!window.LoanSession.get()
}));
async function fillGroup(page, prefix, name, item, price) {
  if (prefix.includes('extraGroups')) {
    await page.locator(prefix+' .full-name').fill(name);
    await page.locator(prefix+' .full-lender').selectOption({ index: 1 });
    await page.locator(prefix+' .full-borrower').selectOption({ index: 2 });
  } else {
    await page.locator('#name').fill(name);
    await page.locator('#lender').selectOption({ index: 1 });
    await page.locator('#borrower').selectOption({ index: 2 });
  }
  const row = page.locator(prefix+' .entry-row').first();
  await row.locator('[data-value="その他"]').click();
  await row.locator('.item').fill(item);
  await row.locator('.unit-price').fill(price);
  await row.locator('.quantity').fill('2');
  await row.locator('.quantity').blur();
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  try {
    const scenarios = LOST ? ['lost-expired','lost-sheets401','missing'] : BASELINE_REF && !RED ? ['valid','extra-valid'] : ['missing', 'expired', 'sheets401', 'startup401', 'gas-session', 'partial-session', 'initial-login', 'extra-sheets401','valid','extra-valid','preview401'];
    for (const mode of MODES) for (const scenario of scenarios) {
      if (RED && !['missing','expired','sheets401'].includes(scenario)) continue;
      const context = await browser.newContext({ viewport: { width: WIDTH || (mode === 'pc' ? 1440 : 390), height: HEIGHT }, serviceWorkers: 'block' });
      await context.tracing.start({ screenshots: true, snapshots: true });
      let navs = 0, recovered = false, loginAttempts = 0;
      const posts = [], endpoints = [], errors = [];
      const writtenReceipts = new Set();
      await context.addInitScript(({mode, scenario}) => {
        localStorage.setItem('inputLayoutMode', mode);
        if (!sessionStorage.getItem('__seeded')) {
          sessionStorage.setItem('__seeded', '1');
          if (scenario !== 'initial-login') {
            sessionStorage.setItem('loanSession', JSON.stringify({ token: 'offline-fixture-session', expiresAt: Date.now()+3600000 }));
            sessionStorage.setItem('simpleAuth', JSON.stringify({ authenticated: true, timestamp: new Date().toISOString() }));
          }
        }
      }, {mode, scenario});
      await context.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (u.origin === BASE) {
          assert.equal(req.method(), 'GET');
          const file = path.resolve(ROOT, '.' + decodeURIComponent(u.pathname));
          if (!file.startsWith(ROOT+path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
          const contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
          return route.fulfill({ status: 200, contentType, body: localBody(file) });
        }
        let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
        const endpoint = u.pathname.split('/').pop();
        endpoints.push({ endpoint: u.hostname === 'script.google.com' ? 'GAS' : endpoint, method: req.method(), action: body.action || null, authenticated: !!req.headers()['x-loan-session'] });
        let status = 200, response = { success:true, status:'SUCCESS', monthly:{ total:0 }, daily:{ total:0 }, total:{ total:0 }, devices:{ count:0 }, data:[] };
        if (u.hostname === 'script.google.com') {
          if (req.method() === 'GET') response = { status:'SUCCESS', idempotencyVersion:1, similarityVersion:1, duplicateRulesVersion:2, receiptColumnsReady:true };
          else {
            // Never persist session tokens or password bodies in test evidence.
            const { sessionToken, ...business } = body;
            posts.push({ ...business, authenticated: !!sessionToken });
            const duplicate=writtenReceipts.has(body.receiptId);
            if(scenario.startsWith('lost-')) writtenReceipts.add(body.receiptId);
            if(scenario.startsWith('lost-') && posts.length<=3) return route.abort('failed');
            response = !recovered && (scenario === 'gas-session' || (scenario === 'partial-session' && posts.length === 2))
              ? { status:'ERROR', code:'SESSION_REQUIRED', written:false, message:'ログインが必要です。ログインし直してください。' }
              : { status:'SUCCESS', idempotencyVersion:1, receiptId:body.receiptId, duplicate, notifications:{backup:'completed',email:'completed'} };
          }
        } else if (endpoint === 'sheets-api') {
          response = { values:[['date','name','lender','borrower','category','item','quantity','price','amount','inputDate','correction','receipt']] };
          if ((!recovered && scenario.includes('sheets401') && (!scenario.startsWith('lost-') || posts.length>0)) || (scenario==='preview401' && posts.length>0)) { status=401; response={error:'Unauthorized'}; }
        } else if (endpoint === 'password-manager') {
          if (body.action === 'get') response={success:true,passwords:{system:{status:'設定済み'}}};
          else if (body.action === 'verify') {
            loginAttempts++;
            recovered = loginAttempts > 1 || scenario === 'initial-login';
            response = recovered ? {success:true,isValid:true,token:'offline-renewed-fixture',expiresAt:Date.now()+3600000} : {success:true,isValid:false};
          }
        } else if (scenario === 'startup401' && ['api-usage-tracker','indicator-settings'].includes(endpoint)) { status=401;response={error:'Unauthorized'}; }
        else if (!u.hostname.endsWith('supabase.co')) return route.fulfill({status:200,body:'',contentType:'text/plain'});
        return route.fulfill({status,contentType:'application/json',body:JSON.stringify(response)});
      });
      const page = await context.newPage();
      page.on('framenavigated', f => { if (f===page.mainFrame()) navs++; });
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', d => d.accept());
      try {
        await page.goto(BASE+'/index.html');
        await page.waitForTimeout(1200);
        if (scenario === 'initial-login') {
          const login=await page.locator('#password-screen .modal-card').boundingBox();
          const viewport=page.viewportSize();
          assert(login && login.x>=0 && login.x+login.width<=viewport.width+1 && login.y>=0 && login.y+login.height<=viewport.height+1);
          await page.screenshot({path:path.join(OUT,`${mode}-initial-login.png`)});
          assert.equal(endpoints.filter(e => ['api-usage-tracker','indicator-settings'].includes(e.endpoint)).length,0,'no authenticated startup API before login');
          await page.locator('#password-input').fill('synthetic-offline-only');
          await page.locator('#password-btn').click();
          await page.waitForFunction(() => window.simpleAuth.isAuthenticated());
          await page.waitForTimeout(200);
          assert(endpoints.some(e => e.endpoint==='indicator-settings' && e.authenticated));
        }
        await fillGroup(page,'#entriesContainer','OFFLINE-TEST','OFFLINE-ITEM','100');
        if (['extra-sheets401','partial-session','extra-valid'].includes(scenario)) {
          if(mode==='sp') await page.locator('#add-full-row-btn').click();
          await fillGroup(page,'#extraGroups .full-entry-group:first-child','OFFLINE-EXTRA-NAME','OFFLINE-EXTRA','200');
        }
        if(['missing','expired'].includes(scenario)) await page.evaluate(s => { if(s==='missing') LoanSession.clear(); else LoanSession.set('offline-fixture-session',Date.now()-1); },scenario);
        await page.evaluate(() => { window.__businessNodes=[document.querySelector('#name'),...document.querySelectorAll('.item')].filter(e=>e.value); });
        const before=await snapshot(page);
        await page.locator('#loanForm button[type=submit]').click();
        if(scenario.startsWith('lost-')) {
          await page.waitForFunction(() => !submitData._isRunning && document.querySelector('#errorModal').classList.contains('show') && document.querySelector('#errorModalRetryBtn') && document.querySelector('#errorModalRetryBtn').style.display !== 'none',{},{timeout:15000});
          assert.equal(posts.length,3);
          const uncertain=await snapshot(page);assert.match(uncertain.text,/登録済みの可能性/);
          if(scenario==='lost-expired') await page.evaluate(() => LoanSession.set('offline-fixture-session',Date.now()-1));
          await page.locator('#errorModalRetryBtn').click();
        }
        if(['startup401','initial-login','valid','extra-valid','preview401'].includes(scenario)) {
          await page.waitForFunction(() => !submitData._isRunning && document.querySelector('#step-complete')?.classList.contains('final-completed'),{},{timeout:15000});
          await page.waitForTimeout(500);
          assert.equal(posts.length,scenario==='extra-valid'?2:1); assert(posts.every(p=>p.authenticated));
          if(scenario==='preview401') { const preview=await snapshot(page); assert(preview.error && preview.onTop); assert.match(preview.text,/登録済み/); assert.doesNotMatch(preview.text,/未送信|登録されていません/); assert.deepEqual(preview.fields,before.fields); }
        } else {
          await page.waitForTimeout(scenario==='partial-session'?3800:1200);
          const after=await snapshot(page);
          const row={mode,scenario,navs,error:after.error,onTop:after.onTop,nameRetained:after.name===before.name,fieldsRetained:JSON.stringify(after.fields)===JSON.stringify(before.fields),postsBeforeLogin:posts.length,text:after.text};
          results.push(row); fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
          await page.screenshot({path:path.join(OUT,`${mode}-${scenario}-failure.png`)});
          if(RED) continue;
          assert.equal(navs,1); assert(after.error && after.onTop && after.sameDOM && after.errorWithinViewport); assert.deepEqual(after.fields,before.fields);
          assert.match(after.text,/ログイン/);
          assert.equal(posts.length, scenario.startsWith('lost-')?3:scenario==='gas-session'?1:scenario==='partial-session'?2:0);
          await page.locator('#errorModalLoginBtn').waitFor({state:'visible'});
          if(scenario.startsWith('lost-')) { assert.match(after.text,/今回のリクエストは未送信.*以前の送信結果は未確認/s); assert.match(after.text,/登録済みの可能性/); assert.doesNotMatch(after.text,/登録されていません/); }
          if(scenario==='partial-session') assert.match(after.text,/2件中1件は登録済み/);
          const journal=after.receipts;
          await page.locator('#errorModalLoginBtn').click();
          await page.locator('#password-cancel-btn').click();
          // Cancel must restore the same error and form; next login remains centered.
          assert.deepEqual((await snapshot(page)).fields,before.fields); assert((await snapshot(page)).error);
          await page.locator('#errorModalLoginBtn').click();
          await page.locator('#password-input').fill('synthetic-offline-wrong'); await page.locator('#password-btn').click();
          const login=await page.locator('#password-screen .modal-card').boundingBox(), viewport=page.viewportSize();
          assert(login && login.x>=0 && login.x+login.width<=viewport.width+1 && login.y>=0 && login.y+login.height<=viewport.height+1);
          await page.screenshot({path:path.join(OUT,`${mode}-${scenario}-login.png`)});
          await page.waitForFunction(() => document.querySelector('#password-error')?.style.display==='block');
          assert.deepEqual((await snapshot(page)).fields,before.fields); assert.deepEqual((await snapshot(page)).receipts,journal);
          await page.locator('#password-input').fill('synthetic-offline-only'); await page.locator('#password-btn').click();
          await page.waitForFunction(() => window.simpleAuth.isAuthenticated()); await page.waitForTimeout(200);
          const logged=await snapshot(page); assert.deepEqual(logged.fields,before.fields); assert.deepEqual(logged.receipts,journal); assert.equal(navs,1);
          assert.equal(posts.length,row.postsBeforeLogin,'login must not auto-submit');
          await page.locator('#errorModalCloseBtn').click();
          await page.locator('#loanForm button[type=submit]').click();
          const expected = row.postsBeforeLogin + (scenario==='partial-session'||scenario==='extra-sheets401'?2:1);
          await page.waitForFunction(() => !submitData._isRunning && document.querySelector('#step-complete')?.classList.contains('final-completed'),{},{timeout:15000});
          await page.waitForTimeout(500);
          assert.equal(posts.length,expected);
          const ids = Object.values(journal).flatMap(raw=>Object.values(JSON.parse(raw)).map(e=>e.receiptId));
          assert(posts.every(p=>ids.includes(p.receiptId) && p.authenticated));
          if(row.postsBeforeLogin) {
            const clean=p=>Object.fromEntries(Object.entries(p).filter(([k])=>k!=='inputDate'));
            assert.deepEqual(clean(posts.at(-1)),clean(posts[row.postsBeforeLogin-1]));
          }
          const confirmed=Object.values((await snapshot(page)).receipts).flatMap(raw=>Object.values(JSON.parse(raw)));
          assert(confirmed.every(e=>e.state==='confirmed'));
          if(scenario.startsWith('lost-')) { assert.equal(writtenReceipts.size,1); row.savedReceipts=writtenReceipts.size; }
          row.confirmed=true; row.payloads=posts; row.reloginRetained=true; row.autoSent=0; row.manualPosts=posts.length-row.postsBeforeLogin; row.sameReceipt=true; row.navs=navs;
          await page.screenshot({path:path.join(OUT,`${mode}-${scenario}-success.png`)});
        }
        if(['startup401','initial-login','valid','extra-valid','preview401'].includes(scenario)) results.push({mode,scenario,navs,posts:posts.length,payloads:posts,errors});
        assert.equal(navs,1); assert.deepEqual(errors,[]);
      } catch(error) { results.push({mode,scenario,FAILED:error.message,navs,posts:posts.length}); throw error; }
      finally { fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2)); await context.tracing.stop({path:path.join(OUT,`${mode}-${scenario}-trace.zip`)}); await context.close(); }
    }
    if(RED) { assert.equal(results.length,6); assert(results.every(r=>r.navs===2 && !r.error && !r.nameRetained)); console.log('RED reproduced',JSON.stringify(results)); }
    else { assert.equal(results.length,MODES.length*scenarios.length); console.log(BASELINE_REF?'BASELINE':'GREEN',JSON.stringify(results)); }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
