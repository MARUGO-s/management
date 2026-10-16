const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function harness({ input = true, status = 200 } = {}) {
  const data = new Map();
  const storage = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const screen = input ? { dataset: { preserveInput: 'true' }, style: {} } : null;
  let navigations = 0;
  const location = { reload: () => navigations++, set href(_) { navigations++; }, get href() { return 'http://offline/index.html'; } };
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, sessionStorage: storage,
    localStorage: storage, Date, URL, location, setTimeout: () => 0,
    document: { getElementById: id => id === 'password-screen' ? screen : null,
      querySelector: () => null, addEventListener() {} },
    fetch: async () => ({ status, ok: status === 200, json: async () => ({ monthly: { total: 0 }, values: [['header']] }) }) });
  context.window = context; context.globalThis = context;
  vm.runInContext(source('config.js'), context);
  context.GAS_URL = 'http://offline/gas';
  vm.runInContext(source('js/submission-receipts.js'), context);
  const main = source('pages/js/main.js');
  vm.runInContext(main.slice(main.indexOf('async function confirmNoSimilarEntries('), main.indexOf('\nfunction ', main.indexOf('async function confirmNoSimilarEntries(')) > 0 ? main.indexOf('\nfunction ', main.indexOf('async function confirmNoSimilarEntries(')) : undefined), context);
  context.DuplicateCheck = { rowsFromSheetValues: () => [], findSimilarForNewEntries: () => [], findSimilarWithinBatch: () => [] };
  return { context, screen, data, navigations: () => navigations };
}
test('usage indicator does not request protected APIs before login; resumes with signed session', async () => {
  const h=harness(); h.context.setInterval=()=>0; h.context.window.addEventListener=()=>{};
  vm.runInContext(source('js/usage-indicator.js')+'\nwindow.TestIndicator = UsageIndicator;',h.context);
  const indicator=Object.create(h.context.TestIndicator.prototype);
  indicator.updateDisplay=async()=>{}; indicator.applyColorSettings=()=>{};
  let calls=0; h.context.fetch=async()=>{calls++;return {ok:true,json:async()=>({success:true,settings:{},monthly:{total:0}})};};
  await indicator.ensureColorSettings(); await indicator.loadUsageData(); assert.equal(calls,0);
  h.context.LoanSession.set('fixture',Date.now()+100000);
  await indicator.ensureColorSettings(true); await indicator.loadUsageData(); assert.equal(calls,2);
});
test('authenticated POST success followed by preview SESSION_REQUIRED stays registered, not unsent', async () => {
  const h=receiptsHarness(); h.context.delay=async()=>{};
  const code=source('pages/js/main.js');
  vm.runInContext(code.slice(code.indexOf('async function showRegisteredDataConfirmation('),code.indexOf('// 送信データと登録データの比較関数')),h.context);
  let shown;
  h.context.LoanReceipts.presentFailure=(_,__,info)=>{shown=info;};
  const modal={classList:{add(){}}}; const body={};
  const old=h.context.document.getElementById;
  h.context.document.getElementById=id=>id==='errorModal'?modal:id==='errorModalBody'?body:old(id);
  h.context.callSheetsAPI=async()=>{throw Object.assign(new Error('ログインしてください'),{code:'SESSION_REQUIRED'});};
  await h.context.showRegisteredDataConfirmation([{receiptId:'confirmed'}]);
  assert.equal(h.navigations(),0); assert(shown); assert.match(shown.body,/登録済み/); assert.doesNotMatch(shown.body,/残りは|登録されていません|未送信/); assert.equal(shown.loginRequired,true);
});
function receiptsHarness() {
  const h = harness();
  h.context.navigator = { locks: {} };
  h.context.crypto = { randomUUID: () => 'fixture-receipt' };
  vm.runInContext(source('js/submission-receipts.js'), h.context);
  return h;
}
test('receipts reject missing session before any POST', async () => {
  const h = receiptsHarness(); let posts = 0;
  h.context.fetch = async () => { posts++; return {json:async()=>({})}; };
  await assert.rejects(h.context.LoanReceipts.send('http://offline/gas', {receiptId:'fixture-receipt'}), e => e.code==='SESSION_REQUIRED' && e.receiptOutcome==='notSent');
  assert.equal(posts, 0);
});
for (const written of [false, undefined]) test(`GAS SESSION_REQUIRED written=${written} preserves auth code and accurate outcome`, async () => {
  const h = receiptsHarness(); h.context.LoanSession.set('fixture',Date.now()+100000);
  h.context.fetch = async () => ({json:async()=>({code:'SESSION_REQUIRED',message:'ログインしてください',written})});
  const [payload] = h.context.LoanReceipts.prepare('http://offline/gas',[{item:'fixture'}]);
  await assert.rejects(h.context.LoanReceipts.send('http://offline/gas',payload), e => {
    assert.equal(e.code,'SESSION_REQUIRED'); assert.equal(e.receiptOutcome,written===false?'rejected':'unknown');
    const info=h.context.LoanReceipts.describeFailure(e,1,2,true);
    assert.equal(info.loginRequired,true); assert.match(info.body,/2件中1件は登録済み/); assert.match(info.body,/ログイン/);
    return true;
  });
});
test('auth failure display provides login action without retrying or hiding error', async () => {
  const h=receiptsHarness(); const children=new Map(); let opened=0, retried=0;
  h.context.simpleAuth={showAuthScreen:()=>opened++};
  h.context.document.createElement=()=>({style:{}});
  const actions={ firstChild:null, insertBefore(e){children.set('#'+e.id,e);} };
  const modal={dataset:{},querySelector:s=>s==='.modal-actions'?actions:children.get(s),classList:{remove(){throw new Error('error hidden automatically');}}};
  h.context.LoanReceipts.presentFailure(modal,{textContent:''},{tone:'error',title:'auth',body:'login',loginRequired:true},()=>retried++);
  const login=children.get('#errorModalLoginBtn'); assert(login); assert.equal(login.style.display,''); login.onclick();
  assert.equal(opened,1); assert.equal(retried,0);
});
function authHarness(input = true) {
  const h = harness({ input });
  const elements = {
    'password-screen': input ? h.screen : { dataset: {}, style: {} },
    'password-input': { value: 'offline-synthetic-password', focus() {} },
    'password-btn': { disabled: false, textContent: '' },
    'password-cancel-btn': { disabled: false },
    'password-error': { style: {} },
    'main-app': { style: { display: 'block' } }
  };
  h.context.document.getElementById = id => elements[id] || null;
  vm.runInContext(source('js/simple-auth.js'), h.context);
  const auth = Object.create(h.context.SimpleAuth.prototype);
  auth.STORAGE_KEY = 'simpleAuth';
  return { ...h, auth, elements };
}
test('input relogin authenticates through real verifier without reload or storing password', async () => {
  const h = authHarness();
  const bodies = [];
  h.context.fetch = async (_, options) => { bodies.push(JSON.parse(options.body)); return { json: async () => ({ success: true, isValid: true, token: 'new-fixture', expiresAt: Date.now()+100000 }) }; };
  await h.auth.handlePasswordSubmit();
  assert.equal(h.navigations(), 0);
  assert.equal(h.context.LoanSession.get().token, 'new-fixture');
  assert.equal(h.elements['password-input'].value, '');
  assert.equal(h.elements['password-btn'].disabled, false);
  assert.equal(h.elements['password-screen'].style.display, 'none');
  assert.equal(bodies[0].action, 'verify');
  assert.equal(bodies[0].passwordType, 'system');
  assert(![...h.data.values()].some(v => v.includes('offline-synthetic-password')));
});
test('input auth screen leaves the business DOM visible and cancel clears only password', async () => {
  const h = authHarness();
  await h.auth.showAuthScreen();
  assert.equal(h.elements['main-app'].style.display, 'block');
  h.auth.cancelLogin();
  assert.equal(h.elements['password-screen'].style.display, 'none');
  assert.equal(h.elements['password-input'].value, '');
});
test('input password verification failure preserves session journal and offers retry', async () => {
  const h = authHarness(); h.data.set('loan-receipt-v1:fixture', 'pending-receipt');
  h.context.fetch = async () => ({ json: async () => ({success: true, isValid: false}) });
  await h.auth.handlePasswordSubmit();
  assert.equal(h.navigations(), 0);
  assert.equal(h.data.get('loan-receipt-v1:fixture'), 'pending-receipt');
  assert.equal(h.elements['password-input'].value, '');
  assert.equal(h.elements['password-error'].style.display, 'block');
});
test('other pages retain reload after successful initial login', async () => {
  const h = authHarness(false);
  h.context.fetch = async () => ({ json: async () => ({success:true,isValid:true,token:'fixture',expiresAt:Date.now()+100000}) });
  await h.auth.handlePasswordSubmit();
  assert.equal(h.navigations(), 1);
});
test('input HTML provides a cancellable login form separate from business form', () => {
  const html = source('index.html');
  assert.match(html, /id="password-screen"[^>]*data-preserve-input="true"/);
  for (const id of ['password-form','password-input','password-btn','password-error','password-cancel-btn']) assert(html.includes(`id="${id}"`));
});
for (const kind of ['missing', 'expired', 'sheets401']) test(`previous unknown survives ${kind}, relogin and same receipt confirmation`, async () => {
  const h=receiptsHarness(), api=h.context.LoanReceipts, url=vm.runInContext('GAS_URL',h.context);
  h.context.setTimeout=resolve=>resolve();
  h.context.LoanSession.set('fixture',Date.now()+100000);
  const [data]=api.prepare(url,[{item:'lost-response'}]);
  let posts=0; const ids=[];
  h.context.fetch=async(_,options)=>{posts++;ids.push(JSON.parse(options.body).receiptId);throw new Error('lost response after write');};
  await assert.rejects(api.send(url,data),e=>e.receiptOutcome==='unknown');
  if(kind==='missing') h.context.LoanSession.clear();
  if(kind==='expired') h.context.LoanSession.set('fixture',Date.now()-1);
  if(kind==='sheets401') h.context.fetch=async()=>({status:401,ok:false,json:async()=>({error:'Unauthorized'})});
  const retry=api.prepare(url,[{item:'lost-response'}]);
  await assert.rejects(h.context.confirmNoSimilarEntries(retry),e=>{
    const info=api.describeFailure(e,1,2,true);
    assert.equal(info.tone,'warning'); assert.equal(info.loginRequired,true);
    assert.match(info.body,/2件中1件は登録済み/);
    assert.match(info.body,/今回のリクエストは未送信.*以前の送信結果は未確認/s);
    assert.doesNotMatch(info.body,/登録されていません/);
    return true;
  });
  h.context.LoanSession.set('renewed',Date.now()+100000);
  assert.equal(posts,3,'no automatic resend after login');
  h.context.fetch=async(_,options)=>{posts++;ids.push(JSON.parse(options.body).receiptId);return {json:async()=>({status:'SUCCESS',idempotencyVersion:1,receiptId:data.receiptId,duplicate:true})};};
  assert.equal((await api.send(url,retry[0])).duplicate,true);
  assert.equal(new Set(ids).size,1); assert.equal(posts,4);
  assert.equal(Object.values(JSON.parse(h.data.get('loan-receipt-v1:'+url)))[0].state,'confirmed');
});

test('fresh preflight is unsent but old pending journals cannot deny a previous write',async()=>{
  const h=receiptsHarness(),api=h.context.LoanReceipts,url=vm.runInContext('GAS_URL',h.context);
  const [data]=api.prepare(url,[{item:'fixture'}]);
  await assert.rejects(h.context.confirmNoSimilarEntries([data]),e=>{
    const info=api.describeFailure(e); assert.equal(info.tone,'error');
    assert.match(info.title,/未送信/);assert.match(info.body,/登録されていません/); return true;
  });
  const journal=JSON.parse(h.data.get('loan-receipt-v1:'+url));
  for(const entry of Object.values(journal))delete entry.attempted;
  h.data.set('loan-receipt-v1:'+url,JSON.stringify(journal));
  await assert.rejects(h.context.confirmNoSimilarEntries(api.prepare(url,[{item:'fixture'}])),e=>{
    const info=api.describeFailure(e);assert.match(info.body,/以前の送信結果は未確認/);
    assert.doesNotMatch(info.body,/登録されていません/);return true;
  });
  assert.equal(api.prepare(url,[{item:'fixture'}])[0].receiptId,data.receiptId);
});

test('GAS written false on an unknown receipt only rejects the current attempt',async()=>{
  const h=receiptsHarness(),api=h.context.LoanReceipts,url=vm.runInContext('GAS_URL',h.context);
  h.context.setTimeout=resolve=>resolve();h.context.LoanSession.set('fixture',Date.now()+100000);
  const [data]=api.prepare(url,[{item:'fixture'}]);
  h.context.fetch=async()=>{throw new Error('lost');};
  await assert.rejects(api.send(url,data),e=>e.receiptOutcome==='unknown');
  h.context.fetch=async()=>({json:async()=>({code:'SESSION_REQUIRED',written:false})});
  await assert.rejects(api.send(url,data),e=>{
    const info=api.describeFailure(e);assert.match(info.body,/今回.*拒否.*以前.*未確認/s);
    assert.doesNotMatch(info.body,/登録されていません/);return true;
  });
});

for (const kind of ['missing', 'expired', 'sheets401']) {
  test(`input ${kind}: duplicate gate retains SESSION_REQUIRED without navigating`, async () => {
    const h = harness({ status: kind === 'sheets401' ? 401 : 200 });
    if (kind !== 'missing') h.context.LoanSession.set('fixture-session', Date.now() + (kind === 'expired' ? -1 : 100000));
    await assert.rejects(h.context.confirmNoSimilarEntries([{ receiptId: 'pending-fixture' }]), error => {
      assert.equal(error.code, 'SESSION_REQUIRED');
      assert.equal(error.receiptOutcome, 'notSent');
      assert.match(error.message, /ログイン/);
      return true;
    });
    assert.equal(h.navigations(), 0, 'business input must never reload on auth failure');
  });
}

for (const outcome of ['success', 'invalid', 'cancel', 'unrelated']) {
  test(`relogin ${outcome}: dismiss only an authenticated session warning`, async () => {
    const h = authHarness();
    let warningVisible = true, closed = 0, requests = 0;
    h.data.set('loan-receipt-v1:fixture', 'pending-receipt');
    h.elements['errorModal'] = {
      dataset: { loginRequired: outcome === 'unrelated' ? 'false' : 'true' },
      classList: { contains: () => warningVisible, remove: () => { warningVisible = false; } }
    };
    h.elements['errorModalCloseBtn'] = { click() { closed++; warningVisible = false; } };
    h.context.fetch = async () => {
      requests++;
      return { json: async () => outcome === 'invalid' ? { success: true, isValid: false } :
        { success: true, isValid: true, token: 'renewed-fixture', expiresAt: Date.now() + 100000 } };
    };
    if (outcome === 'cancel') h.auth.cancelLogin();
    else await h.auth.handlePasswordSubmit();
    assert.equal(warningVisible, outcome !== 'success');
    assert.equal(closed, outcome === 'success' ? 1 : 0);
    assert.equal(requests, outcome === 'cancel' ? 0 : 1, 'no automatic submission');
    assert.equal(h.data.get('loan-receipt-v1:fixture'), 'pending-receipt');
    assert.equal(h.elements['main-app'].style.display, 'block');
    assert.equal(h.navigations(), 0);
  });
}
