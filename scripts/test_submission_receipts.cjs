const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const uuid = () => crypto.randomUUID();
const payload = item => ({date:'2026-09-29',name:'テスト',lender:'A',borrower:'B',
  category:'飲料',item,quantity:'1',unitPrice:'100',amount:'100',isCorrection:false});

function server(file) {
  const rows = [Array(13).fill('')];
  let locked = false, busy = false, failFlush = false;
  let backups = 0, emails = 0, notificationFailure = false;
  const properties = new Map();
  const sheet = {
    getMaxColumns: () => 13, getLastColumn: () => 13,
    getLastRow: () => rows.length, hideColumns() {},
    insertRowBefore(index) { rows.splice(index - 1, 0, Array(13).fill('')); },
    getRange(row, column, height = 1, width = 1) {
      return {
        getFormulas: () => Array.from({length:height},()=>Array(width).fill('')),
        setNumberFormat() { return this; },
        setValue(value) { this.setValues([[value]]); return this; },
        getValues: () => Array.from({length:height}, (_,i) =>
          Array.from({length:width}, (_,j) => rows[row-1+i]?.[column-1+j] ?? '')),
        setValues(values) { values.forEach((line,i) => line.forEach((v,j) => {
          rows[row-1+i] ||= Array(13).fill(''); rows[row-1+i][column-1+j] = v;
        })); },
        createTextFinder(id) { return {matchEntireCell() {return this;},findNext() {
          const index = rows.findIndex((line,i) => i >= row-1 && line[column-1] === id);
          return index < 0 ? null : {getRow:()=>index+1};
        }}; }
      };
    }
  };
  const context = vm.createContext({ console, Logger:{log(){}},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){
      if (failFlush) {failFlush=false;throw new Error('応答消失');}
    }},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)??null,
      setProperty(k,v){properties.set(k,v);},deleteProperty(k){properties.delete(k);}})},
    LockService:{getScriptLock:()=>({tryLock(){if (busy) return false;assert(!locked);locked=true;return true;},
      releaseLock(){locked=false;},hasLock:()=>locked})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest())}
  });
  vm.runInContext(fs.readFileSync(path.resolve(root,file),'utf8'),context);
  context.createBackup=()=>{backups++;if(notificationFailure)throw new Error('backup');};
  context.sendBorrowerEmail_=()=>{emails++;if(notificationFailure)throw new Error('email');};
  return { rows, context, properties, stats:()=>({backups,emails,locked}),
    busy(value){busy=value;}, failFlush(){failFlush=true;}, failNotifications(){notificationFailure=true;},
    post:data=>context.doPost({postData:{contents:JSON.stringify(data)}}) };
}

for (const file of ['docs/gas_scripts/gas_code_complete.gs','docs/gas_scripts/gas_code_complete_updated.gs',
    ...(process.env.GAS_TEST_SOURCE ? [process.env.GAS_TEST_SOURCE] : [])]) {
  test(file+' normal retry, conflict, legacy and notification failure',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).duplicate,false);
    assert.equal(s.post(data).duplicate,true);
    assert.equal(s.rows.length,2);
    assert.deepEqual(s.stats(),{backups:1,emails:1,locked:false});
    assert.equal(s.post({...data,amount:'200'}).status,'ERROR');
    assert.equal(s.post(payload('legacy')).status,'ERROR');
    assert.equal(s.rows.length,2);
    s.failNotifications();
    const second={...data,receiptId:uuid()};
    const saved=s.post(second);
    assert.equal(saved.status,'SUCCESS');
    assert.deepEqual(saved.notifications,{backup:'failed',email:'failed'});
    assert.equal(s.post(second).duplicate,true);
    assert.equal(s.rows.length,3);
    s.busy(true);
    assert.equal(s.post({...data,receiptId:uuid()}).status,'ERROR');
    assert.equal(s.rows.length,3);
  });
  test(file+' correction retry and lost response after write',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    s.failFlush();
    const afterWrite=s.post(data);
    assert.equal(afterWrite.status,'SUCCESS');
    assert.equal(afterWrite.duplicate,false);
    assert.deepEqual(s.stats(),{backups:1,emails:1,locked:false});
    assert.equal(s.post(data).duplicate,true);
    assert.equal(s.rows.length,2);
    assert.equal(s.properties.size,0);
    const correction={...data,receiptId:uuid(),isCorrection:true,originalRowIndex:2};
    assert.equal(s.post(correction).status,'SUCCESS');
    assert.equal(s.post(correction).duplicate,true);
    assert.equal(s.rows.length,3);
    assert.equal(s.rows[1][10],'✏️修正');
    // Insertions move rows; the original receipt still resolves by ID.
    assert.equal(s.post(data).duplicate,true);
  });
  test(file+' errors say whether the row was written',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const conflict=s.post({...data,amount:'200'});
    assert.equal(conflict.status,'ERROR');assert.equal(conflict.written,false);
    assert.equal(s.post(payload('legacy')).written,false);
    s.busy(true);
    assert.equal(s.post({...data,receiptId:uuid()}).written,false);
    s.busy(false);
    s.context.SpreadsheetApp.openById=()=>{throw new Error('Sheets unavailable');};
    assert.equal(s.post({...data,receiptId:uuid()}).written,false);
    assert.equal(s.rows.length,2);
  });
  test(file+' interrupted notifications are completed once on a later resend',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    assert.equal(s.properties.size,0);
    const key='notify_pending_'+data.receiptId;
    s.properties.set(key,String(Date.now()));
    assert.equal(s.post(data).notifications.email,'skipped');
    assert.deepEqual(s.stats(),{backups:1,emails:1,locked:false});
    s.properties.set(key,String(Date.now()-7*60*1000));
    const resumed=s.post(data);
    assert.equal(resumed.duplicate,true);
    assert.deepEqual(resumed.notifications,{backup:'completed',email:'completed'});
    assert.deepEqual(s.stats(),{backups:2,emails:2,locked:false});
    assert.equal(s.post(data).notifications.email,'skipped');
    assert.equal(s.properties.size,0);
    assert.equal(s.rows.length,2);
  });
  test(file+' occupied metadata columns fail without overwriting',()=>{
    const s=server(file);s.rows[0][11]='existing';
    assert.equal(s.context.doGet().receiptColumnsReady,false);
    assert.equal(s.post({...payload('A'),receiptId:uuid(),receiptVersion:1}).status,'ERROR');
    assert.equal(s.rows.length,1);assert.equal(s.rows[0][11],'existing');
  });
}

function browser(storage = new Map(), locks = new Set()) {
  let approve = false, writes = 0;
  const localStorage = {
    get length(){return storage.size;}, key:i=>[...storage.keys()][i],
    getItem:k=>storage.get(k) ?? null, setItem(k,v){storage.set(k,v);writes++;}
  };
  const window={localStorage,crypto:{randomUUID:uuid},confirm:()=>approve,
    navigator:{locks:{async request(key, options, callback) {
      if(locks.has(key))return callback(null);
      locks.add(key);try{return await callback({});}finally{locks.delete(key);}
    }}},fetch:async()=>({ok:true,json:async()=>({idempotencyVersion:1})}),setTimeout:resolve=>resolve()};
  const context=vm.createContext({window,console});
  vm.runInContext(fs.readFileSync(path.join(root,'js/submission-receipts.js'),'utf8'),context);
  return {api:window.LoanReceipts, window, context, storage, approve(){approve=true;}, writes:()=>writes};
}

test('receipt survives reload, reorder, partial batch retry, confirmed repeat and intentional repeat',async()=>{
  const b=browser(), p=[payload('A'),payload('B')];
  const first=b.api.prepare('gas',p);
  const s=server('docs/gas_scripts/gas_code_complete.gs');
  b.window.fetch=async(_,options)=>({ok:true,json:async()=>s.post(JSON.parse(options.body))});
  await b.api.send('gas',first[0]);
  const reload=browser(b.storage), retry=reload.api.prepare('gas',[p[1],p[0]]);
  assert.equal(retry[0].receiptId,first[1].receiptId);
  assert.equal(retry[1].receiptId,first[0].receiptId);
  reload.window.fetch=b.window.fetch;
  for(const data of retry)await reload.api.send('gas',data);
  assert.equal(s.rows.length,3);
  const unchanged=reload.api.prepare('gas',p);
  assert.equal(unchanged[0].receiptId,first[0].receiptId);
  reload.approve();
  const intentional=reload.api.prepare('gas',p);
  assert.notEqual(intentional[0].receiptId,first[0].receiptId);
  assert.notEqual(intentional[1].receiptId,first[1].receiptId);
});

test('read-only readiness check creates no registration or notification',()=>{
  const s=server('docs/gas_scripts/gas_code_complete.gs');
  assert.equal(s.context.doGet().idempotencyVersion,1);
  assert.equal(s.context.doGet().receiptColumnsReady,true);
  assert.equal(s.rows.length,1);
  assert.deepEqual(s.stats(),{backups:0,emails:0,locked:false});
});

test('lost response keeps pending ID and retry registers exactly once',async()=>{
  const b=browser(), s=server('docs/gas_scripts/gas_code_complete.gs');
  const [data]=b.api.prepare('gas',[payload('A')]);
  b.window.fetch=async(_,options)=>{s.post(JSON.parse(options.body));throw new Error('network lost');};
  await assert.rejects(()=>b.api.send('gas',data));
  b.approve();
  const [retry]=browser(b.storage).api.prepare('gas',[payload('A')]);
  assert.equal(retry.receiptId,data.receiptId);
  b.window.fetch=async(_,options)=>({ok:true,json:async()=>s.post(JSON.parse(options.body))});
  assert.equal((await b.api.send('gas',retry)).duplicate,true);
  assert.equal(s.rows.length,2);
});

test('unreadable relay response (404 HTML) is re-read with the same receipt and registers once',async()=>{
  const b=browser(), s=server('docs/gas_scripts/gas_code_complete.gs');
  const [data]=b.api.prepare('gas',[payload('A')]);
  const html={ok:false,json:async()=>{throw new SyntaxError('The string did not match the expected pattern.');}};
  let gets=0,posts=0;
  b.window.fetch=async(_,options)=>{
    if(!options?.method)return ++gets===1?html:{ok:true,json:async()=>({idempotencyVersion:1})};
    const result=s.post(JSON.parse(options.body));
    return ++posts===1?html:{ok:true,json:async()=>result};
  };
  await b.api.ensureServer('gas');
  const result=await b.api.send('gas',data);
  assert.equal(result.duplicate,true);
  assert.equal(s.rows.length,2);
  assert.deepEqual([gets,posts],[2,2]);
  b.window.fetch=async()=>html;
  await assert.rejects(()=>b.api.ensureServer('gas'),error=>
    error.receiptOutcome==='notSent' && /expected pattern/.test(error.detail));
});

test('duplicate lines have distinct durable IDs; missing storage or server protocol stops sending',async()=>{
  const b=browser(), p=payload('A');const first=b.api.prepare('gas',[p,p]);
  assert.notEqual(first[0].receiptId,first[1].receiptId);
  assert.deepEqual(Array.from(b.api.prepare('gas',[p,p]),x=>x.receiptId),Array.from(first,x=>x.receiptId));
  b.window.localStorage.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>b.api.prepare('gas',[payload('new')]),/保存/);
  b.window.fetch=async()=>({ok:true,json:async()=>({status:'SUCCESS'})});
  await assert.rejects(()=>b.api.ensureServer('gas'),/準備/);
  await assert.rejects(()=>b.api.send('gas',first[0]),/確認/);
});

test('two tabs share a lock and concurrent second submission is rejected',async()=>{
  const storage=new Map(),locks=new Set(),first=browser(storage,locks),second=browser(storage,locks);
  let release;const blocker=new Promise(resolve=>{release=resolve;});
  const pending=first.api.withLock('gas',()=>blocker);
  await assert.rejects(()=>second.api.withLock('gas',()=>{}),/別のタブ/);
  release();await pending;
  await second.api.withLock('gas',()=>{});
});

test('intentional repeat receipts change atomically; failed storage preserves the entire old batch',async()=>{
  const b=browser(), p=[payload('A'),payload('B')], first=b.api.prepare('gas',p);
  const s=server('docs/gas_scripts/gas_code_complete.gs');
  b.window.fetch=async(_,options)=>({ok:true,json:async()=>s.post(JSON.parse(options.body))});
  for(const data of first)await b.api.send('gas',data);
  const stored=JSON.stringify([...b.storage]);
  b.approve();b.window.localStorage.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>b.api.prepare('gas',p),/保存/);
  assert.equal(JSON.stringify([...b.storage]),stored);
  const retry=browser(b.storage).api.prepare('gas',p);
  assert.deepEqual(Array.from(retry,x=>x.receiptId),Array.from(first,x=>x.receiptId));
});

function element(value='') {
  const classes=new Set();
  return {value,textContent:'送信',dataset:{},style:{},disabled:false,
    classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains:x=>classes.has(x)},
    closest:()=>null,addEventListener(){},removeEventListener(){},reset(){},options:[]};
}

function formContext(b) {
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  for(const [id,v]of Object.entries(payload('A')))get(id).value=String(v);
  const button=element();button.querySelector=()=>get('btn-text');
  const rows=[payload('A'),payload('B')].map(p=>{
    const inputs=Object.fromEntries(Object.entries(p).map(([key,v])=>[key,element(String(v))]));
    return {querySelector(selector){return inputs[selector.slice(1).replace('unit-price','unitPrice')]||null;}};
  });
  b.context.document={getElementById:get,querySelector:selector=>selector.startsWith('.submit-btn')?button:null,
    querySelectorAll:selector=>selector==='#entriesContainer .entry-row'?rows:[]};
  Object.assign(b.context,{console:{log(){},warn(){},error(){}},GAS_URL:'gas',
    pendingErrorQueue:[],errorListenersAttached:false,hideMessages(){},resetSteps(){},
    showStep:async()=>{},delay:async()=>{},completeStep(){},setTimeout:()=>0,
    convertToHalfWidthNumber:v=>String(v),location:{reload(){}},
    showProgressStep(){},startProgress(){},addDebugLog(){},updateManualInputNotice(){},
    showCustomAlertDialog(){},showProgressError(){},progressTimer:null,
    originalData:{originalRowIndex:2,inputDate:'2026/09/29 19:00:00'},
    showRegisteredDataConfirmation:async()=>{}});
  return {get,button};
}

for(const file of ['main.js','js/main.js','pages/js/main.js']) {
  test(file+' actual submitData recovers partial batch without inserting its saved rows again',async()=>{
    const b=browser(),ui=formContext(b),s=server('docs/gas_scripts/gas_code_complete.gs');
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    b.context.postToGas=data=>b.api.send('gas',data);
    const requests=[];let fail=3;
    b.window.fetch=async(_,options)=>{
      if(!options?.method)return {ok:true,json:async()=>({idempotencyVersion:1})};
      const data=JSON.parse(options.body);requests.push(data.receiptId);
      const result=s.post(data);
      if(fail>0 && data.item==='B'){fail--;throw new Error('response lost');}
      return {ok:true,json:async()=>result};
    };
    await b.context.submitData();
    assert.equal(s.rows.length,3);assert.equal(ui.button.disabled,false);
    assert.equal(ui.get('errorModal').dataset.tone,'warning');
    assert.match(ui.get('errorModalBody').textContent,/2件中1件は登録済み.*二重登録はされません/s);
    await b.context.submitData();
    assert.equal(s.rows.length,3);
    assert.equal(new Set(requests).size,2);
  });
}

for(const file of ['main.js','js/main.js','pages/js/main.js']) {
  test(file+' confirmed server rejection is shown as not registered',async()=>{
    const b=browser(),ui=formContext(b);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    b.context.postToGas=data=>b.api.send('gas',data);
    b.window.fetch=async(_,options)=>options?.method?
      {ok:true,json:async()=>({status:'ERROR',written:false,message:'他の処理が実行中'})}:
      {ok:true,json:async()=>({idempotencyVersion:1})};
    await b.context.submitData();
    assert.equal(ui.get('errorModal').dataset.tone,'error');
    assert.match(ui.get('errorModalBody').textContent,/登録されていません/);
  });
}

for(const file of ['js/correction.js','pages/js/correction.js']) {
  test(file+' actual correction retry uses same receipt after its original row shifts',async()=>{
    const b=browser(),ui=formContext(b),s=server('docs/gas_scripts/gas_code_complete.gs');
    s.rows.push(Array(13).fill(''));
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitCorrectionData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitCorrectionData('))),b.context);
    const requests=[];let fail=3;
    b.window.fetch=async(_,options)=>{
      if(!options?.method)return {ok:true,json:async()=>({idempotencyVersion:1})};
      const data=JSON.parse(options.body);requests.push(data.receiptId);const result=s.post(data);
      if(fail>0){fail--;throw new Error('response lost');}
      return {ok:true,json:async()=>result};
    };
    await b.context.submitCorrectionData();
    assert.equal(s.rows.length,3);assert.equal(ui.button.disabled,false);
    assert.match(ui.get('errorMessage').textContent,/^⚠️ 登録を確認できていません.*もう一度送信/);
    b.context.originalData.originalRowIndex=3;
    await b.context.submitCorrectionData();
    assert.equal(s.rows.length,3);assert.equal(new Set(requests).size,1);
    assert.match(ui.get('successMessage').textContent,/行は追加していません/);
  });
}

test('entry pages load durable receipt helper before their submission client',()=>{
  for(const [file,client]of [['index.html','pages/js/main.js'],['pages/correction.html','js/correction.js']]) {
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert(html.indexOf('submission-receipts.js')<html.indexOf(client));
    assert(html.includes(client+'?v=2026093002'));
  }
});
