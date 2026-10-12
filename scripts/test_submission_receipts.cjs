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
  const properties = new Map(), sessionCache = new Map();
  const challengeCache = new Map();
  let sessionChecks = 0;
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
    Utilities:{formatDate:(date,timezone,pattern)=>{
      const values=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
        timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
        minute:'2-digit',second:'2-digit',hourCycle:'h23'
      }).formatToParts(date).map(({type,value})=>[type,value]));
      const day=`${values.year}/${values.month}/${values.day}`;
      return pattern==='yyyy-MM-dd'?day.replaceAll('/','-'):`${day} ${values.hour}:${values.minute}:${values.second}`;
    },DigestAlgorithm:{SHA_256:'sha256'},getUuid:uuid,computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),
      base64EncodeWebSafe:bytes=>Buffer.from(bytes.map(b=>(b+256)%256)).toString('base64url')},
    CacheService:{getScriptCache:()=>({get:k=>sessionCache.get(k)??challengeCache.get(k)??null,
      put(k,v){(k.startsWith('similar-confirm:')?challengeCache:sessionCache).set(k,v);},
      remove(k){challengeCache.delete(k);}})},
    UrlFetchApp:{fetch(_,options){sessionChecks++;const token=JSON.parse(options.payload).token;
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({success:true,valid:token==='valid-token'})};}}
  });
  vm.runInContext(fs.readFileSync(path.resolve(root,file),'utf8'),context);
  context.createBackup=()=>{backups++;if(notificationFailure)throw new Error('backup');};
  context.sendBorrowerEmail_=()=>{emails++;if(notificationFailure)throw new Error('email');};
  return { rows, context, properties, clearChallenges(){challengeCache.clear();}, stats:()=>({backups,emails,locked}),
    busy(value){busy=value;}, failFlush(){failFlush=true;}, failNotifications(){notificationFailure=true;},
    sessionChecks:()=>sessionChecks,
    // 画面からの送信と同じく、既定で有効なログイントークンを添える。
    post:data=>context.doPost({postData:{contents:JSON.stringify('sessionToken' in data ? data : {...data,sessionToken:'valid-token'})}}) };
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
    const blocked=s.post(second);
    assert.equal(blocked.code,'SIMILAR_TRANSACTION');
    assert.equal(blocked.written,false);
    assert.equal(s.rows.length,2);
    const saved=s.post({...second,duplicateConfirmed:true,confirmationToken:blocked.confirmationToken});
    assert.equal(saved.status,'SUCCESS');
    assert.deepEqual(saved.notifications,{backup:'failed',email:'failed'});
    assert.equal(s.post(second).duplicate,true);
    assert.equal(s.rows.length,3);
    s.busy(true);
    assert.equal(s.post({...data,receiptId:uuid()}).status,'ERROR');
    assert.equal(s.rows.length,3);
  });
  test(file+' distinct receipts from different browsers or one batch need explicit approval',()=>{
    const s=server(file), first={...payload('A'),receiptId:uuid(),receiptVersion:1};
    const second={...first,receiptId:uuid()};
    assert.equal(s.post(first).status,'SUCCESS');
    assert.equal(s.post({...second,duplicateConfirmed:true}).code,'SIMILAR_TRANSACTION');
    const challenge=s.post(second);
    assert.equal(challenge.code,'SIMILAR_TRANSACTION');
    assert.equal(typeof challenge.confirmationToken,'string');
    assert.equal(s.rows.length,2);
    assert.equal(s.post({...second,duplicateConfirmed:true,confirmationToken:challenge.confirmationToken}).status,'SUCCESS');
    assert.equal(s.post(second).duplicate,true);
    assert.equal(s.rows.length,3);
    assert.equal(s.post({...first,item:'B',receiptId:uuid()}).status,'SUCCESS');
  });
  test(file+' similarity challenge is bound to receipt and content; expired cache stops writing',()=>{
    const s=server(file), first={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(first).status,'SUCCESS');
    const second={...first,receiptId:uuid()};
    const challenge=s.post(second);
    assert.equal(challenge.code,'SIMILAR_TRANSACTION');
    assert.equal(s.post({...second,receiptId:uuid(),duplicateConfirmed:true,confirmationToken:challenge.confirmationToken}).code,'SIMILAR_TRANSACTION');
    assert.equal(s.post({...second,name:'他の人',duplicateConfirmed:true,confirmationToken:challenge.confirmationToken}).code,'SIMILAR_TRANSACTION');
    s.clearChallenges();
    assert.equal(s.post({...second,duplicateConfirmed:true,confirmationToken:challenge.confirmationToken}).code,'SIMILAR_TRANSACTION');
    assert.equal(s.rows.length,2);
  });
  test(file+' correction flag without a real origin is rejected, not used to bypass similarity',()=>{
    const s=server(file), data={...payload('シャンティ'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const bypass=s.post({...data,receiptId:uuid(),isCorrection:true});
    assert.equal(bypass.status,'ERROR');
    assert.equal(bypass.written,false);
    assert.equal(s.rows.length,2);
  });
  test(file+' similar item spelling and full-width amount challenge a second receipt',()=>{
    const s=server(file), data={...payload('アサヒ シャンティ'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const next={...data,item:'シャンティ',amount:'１００',receiptId:uuid()};
    assert.equal(s.post(next).code,'SIMILAR_TRANSACTION');
    assert.equal(s.rows.length,2);
  });
  test(file+' correction cannot reverse the same original twice',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const reverse={...data,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2,receiptId:uuid()};
    assert.equal(s.post(reverse).status,'SUCCESS');
    const duplicate=s.post({...reverse,receiptId:uuid()});
    assert.equal(duplicate.status,'ERROR');
    assert.equal(duplicate.written,false);
    assert.equal(s.rows.length,3);
  });
  test(file+' correction marker cannot be omitted with a client-supplied alternative',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const forged=s.post({...data,lender:'B',borrower:'A',isCorrection:true,correctionMark:'other',originalRowIndex:2,receiptId:uuid()});
    assert.equal(forged.status,'ERROR');
    assert.equal(forged.written,false);
    assert.equal(s.rows.length,2);
  });
  test(file+' correction origin must match a live reverse entry',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const invalid=s.post({...data,lender:'B',borrower:'A',item:'different',isCorrection:true,originalRowIndex:2,receiptId:uuid()});
    assert.equal(invalid.status,'ERROR');
    assert.equal(invalid.written,false);
    assert.equal(s.rows.length,2);
  });
  test(file+' correction origin index must resolve to the selected live row',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const reverse={...data,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:9999,receiptId:uuid()};
    assert.equal(s.post(reverse).status,'ERROR');
    assert.equal(s.rows.length,2);
    const originalTime=s.rows[1][9];
    assert.equal(s.post({...reverse,originalCreatedAt:originalTime}).status,'SUCCESS');
    assert.equal(s.rows.length,3);
  });
  test(file+' correction origin receipt ID is checked against the matched live row',()=>{
    const s=server(file), original={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(original).status,'SUCCESS');
    assert.equal(s.post({...payload('B'),receiptId:uuid(),receiptVersion:1}).status,'SUCCESS');
    const reverse={...original,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2,
      originalRowId:uuid(),receiptId:uuid()};
    assert.equal(s.post(reverse).status,'ERROR');
    assert.equal(s.rows.length,3);
    assert.equal(s.post({...reverse,originalRowId:original.receiptId}).status,'SUCCESS');
    assert.equal(s.rows.length,4);
    assert.equal(s.rows[2][10],'✏️修正');
  });
  test(file+' blank transaction date falls back to input date for correction origin',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    s.rows[1][0]='';s.rows[1][9]='2026/09/29 11:00:00';
    const reverse={...data,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2,originalCreatedAt:s.rows[1][9],receiptId:uuid()};
    assert.equal(s.post(reverse).status,'SUCCESS');
  });
  test(file+' historical store casing must not cancel a different client-visible origin',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const correction=[data.date,'テスト','b','a',data.category,data.item,'1','100','100',s.rows[1][9],'✏️修正','',''];
    s.rows.push(correction);
    const next=s.post({...data,receiptId:uuid()});
    assert.equal(next.code,'SIMILAR_TRANSACTION');assert.equal(next.written,false);
  });
  test(file+' historical BISTRO CAVA alias challenges a second receipt and validates its correction origin',()=>{
    const s=server(file),data={...payload('A'),lender:'BISTRO CAVA,CAVA',receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const next=s.post({...data,lender:'BISTRO CAVACAVA',receiptId:uuid()});
    assert.equal(next.code,'SIMILAR_TRANSACTION');assert.equal(next.written,false);
    const correction={...data,lender:'B',borrower:'BISTRO CAVACAVA',isCorrection:true,originalRowIndex:2,receiptId:uuid()};
    assert.equal(s.post(correction).status,'SUCCESS');
  });
  test(file+' Date-valued J cells pair the chronologically older correction origin',()=>{
    const s=server(file),data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const live=s.rows[1];live[9]=new Date('2026-09-29T11:00:00+09:00');
    const correction=[...live];correction[2]='B';correction[3]='A';correction[9]=new Date('2026-09-29T10:00:00+09:00');correction[10]='✏️修正';correction[11]='';
    const canceled=[...live];canceled[9]=new Date('2026-09-29T09:00:00+09:00');canceled[11]='';
    s.rows.push(correction,canceled);
    const next=s.post({...data,receiptId:uuid()});
    assert.equal(next.code,'SIMILAR_TRANSACTION');assert.equal(next.written,false);
    const reverse={...data,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2,
      originalCreatedAt:'2026/09/29 11:00:00',receiptId:uuid()};
    assert.equal(s.post({...reverse,originalCreatedAt:'2026/09/29 12:00:00'}).status,'ERROR');
    assert.equal(s.rows.length,4);
    const result=s.post(reverse);
    assert.equal(result.status,'SUCCESS',JSON.stringify(result));
  });
  test(file+' Date-valued origin accepts its unpadded displayed timestamp',()=>{
    const s=server(file),data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    s.rows[1][9]=new Date('2026-09-29T11:00:00+09:00');
    const reverse={...data,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2,
      originalCreatedAt:'2026/9/29 11:00:00',receiptId:uuid()};
    assert.equal(s.post({...reverse,originalCreatedAt:'2026/9/29 11:01:00'}).status,'ERROR');
    assert.equal(s.rows.length,2);
    assert.equal(s.post(reverse).status,'SUCCESS');
    assert.equal(s.rows.length,3);
  });
  test(file+' BISTRO CAVA-CAVA alias challenges a second receipt and validates its correction origin',()=>{
    const s=server(file),data={...payload('A'),lender:'BISTRO CAVA-CAVA',receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const next=s.post({...data,lender:'BISTRO CAVACAVA',receiptId:uuid()});
    assert.equal(next.code,'SIMILAR_TRANSACTION');
    assert.equal(next.written,false);
    const correction={...data,lender:'B',borrower:'BISTRO CAVACAVA',isCorrection:true,
      originalRowIndex:2,receiptId:uuid()};
    assert.equal(s.post(correction).status,'SUCCESS');
  });
  test(file+' unpadded historical input dates pair corrections chronologically',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    s.rows[1][0]='2026/09/30';s.rows[1][9]='2026/9/30 09:00:00';
    const correction=['2026/10/01','テスト','B','A','飲料','A','1','100','100','2026/10/1 10:00:00','✏️修正','',''];
    s.rows.push(correction);
    assert.equal(s.post({...data,date:'2026/09/30',receiptId:uuid()}).status,'SUCCESS');
  });
  test(file+' correction cancels the original without warning on a later fresh transaction',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    assert.equal(s.post({...data,lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2,receiptId:uuid()}).status,'SUCCESS');
    assert.equal(s.post({...data,receiptId:uuid()}).status,'SUCCESS');
    assert.equal(s.rows.length,4);
  });
  test(file+' correction spelling must match the original so cancellation is real',()=>{
    const s=server(file), data={...payload('品Ａ'),receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    const wrong={...data,lender:'B',borrower:'A',item:'品A',isCorrection:true,originalRowIndex:2,receiptId:uuid()};
    assert.equal(s.post(wrong).status,'ERROR');
    assert.equal(s.rows.length,2);
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
    const correction={...data,receiptId:uuid(),lender:'B',borrower:'A',isCorrection:true,originalRowIndex:2};
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
  test(file+' registration requires a valid login token',()=>{
    const s=server(file), data={...payload('A'),receiptId:uuid(),receiptVersion:1};
    for(const sessionToken of ['', 'forged-token']) {
      const denied=s.post({...data,sessionToken});
      assert.equal(denied.code,'SESSION_REQUIRED');assert.equal(denied.written,false);
    }
    assert.equal(s.rows.length,1);
    assert.equal(s.post(data).status,'SUCCESS');
    assert.equal(s.post(data).duplicate,true);
    assert.equal(s.sessionChecks(),2); // 空は問い合わせず、有効なトークンの確認はキャッシュされる
    assert(!s.rows[1].includes('valid-token'));
  });
  test(file+' formula-like input is stored as text',()=>{
    const s=server(file);
    const data={...payload('=IMPORTXML("https://example.com","//a")'),name:'+81',receiptId:uuid(),receiptVersion:1};
    assert.equal(s.post(data).status,'SUCCESS');
    assert.equal(s.rows[1][5],'\'=IMPORTXML("https://example.com","//a")');
    assert.equal(s.rows[1][1],"'+81");
    assert.equal(s.rows[1][7],'100');
    assert.equal(s.post(data).duplicate,true);
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
    LoanSession:{get:()=>({token:'valid-token'}),clear(){}},
    navigator:{locks:{async request(key, options, callback) {
      if(locks.has(key))return callback(null);
      locks.add(key);try{return await callback({});}finally{locks.delete(key);}
    }}},fetch:async()=>({ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})}),setTimeout:resolve=>resolve()};
  const context=vm.createContext({window,console});
  vm.runInContext(fs.readFileSync(path.join(root,'js/submission-receipts.js'),'utf8'),context);
  return {api:window.LoanReceipts, window, context, storage, approve(){approve=true;}, writes:()=>writes};
}

test('server similarity challenge asks before retrying the same receipt',async()=>{
  const b=browser(), s=server('docs/gas_scripts/gas_code_complete.gs');
  const first={...payload('A'),receiptId:uuid(),receiptVersion:1};
  assert.equal(s.post(first).status,'SUCCESS');
  const [next]=b.api.prepare('gas',[payload('A')]);
  let posts=0;
  b.window.fetch=async(_,options)=>{posts++;return {ok:true,json:async()=>s.post(JSON.parse(options.body))};};
  await assert.rejects(()=>b.api.send('gas',next),error=>error.receiptOutcome==='rejected');
  assert.equal(posts,1);
  assert.equal(s.rows.length,2);
  b.approve();
  const result=await b.api.send('gas',next);
  assert.equal(result.status,'SUCCESS');
  assert.equal(posts,3); // one rejected attempt, then same ID challenge and confirmed resend
  assert.equal(s.rows.length,3);
  assert.equal(s.rows[1][11],next.receiptId);
});

test('cache eviction during approval re-prompts and only writes after renewed confirmation',async()=>{
  const b=browser(),s=server('docs/gas_scripts/gas_code_complete.gs');
  assert.equal(s.post({...payload('A'),receiptId:uuid(),receiptVersion:1}).status,'SUCCESS');
  const [next]=b.api.prepare('gas',[payload('A')]);
  let posts=0,approvals=0;
  b.window.confirm=()=>{approvals++;return true;};
  b.window.fetch=async(_,options)=>{
    posts++;
    if(posts===2)s.clearChallenges();
    return {ok:true,json:async()=>s.post(JSON.parse(options.body))};
  };
  assert.equal((await b.api.send('gas',next)).status,'SUCCESS');
  assert.equal(posts,3);assert.equal(approvals,2);assert.equal(s.rows.length,3);
});

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

test('new client rejects old receipt-only GAS before any registration',async()=>{
  const b=browser();let posts=0;
  b.window.fetch=async(_,options)=>{
    if(options?.method)posts++;
    return {ok:true,json:async()=>({status:'SUCCESS',idempotencyVersion:1,receiptColumnsReady:true})};
  };
  await assert.rejects(()=>b.api.ensureServer('gas'),error=>error.receiptOutcome==='notSent' && /類似取引|重複/.test(error.message));
  assert.equal(posts,0);
});

test('read-only readiness check creates no registration or notification',()=>{
  const s=server('docs/gas_scripts/gas_code_complete.gs');
  assert.equal(s.context.doGet().idempotencyVersion,1);
  assert.equal(s.context.doGet().similarityVersion,1);
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
    if(!options?.method)return ++gets===1?html:{ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};
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
    inputs.quantity.classList.add('quantity');inputs.amount.classList.add('amount'); // 実画面と同じクラス
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
  return {get,button,rows};
}

for(const file of ['pages/js/main.js']) {
  test(file+' actual submitData recovers partial batch without inserting its saved rows again',async()=>{
    const b=browser(),ui=formContext(b),s=server('docs/gas_scripts/gas_code_complete.gs');
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(fs.readFileSync(path.join(root,'js/duplicate-check.js'),'utf8'),b.context);
    let preflightConfirmations=0;
    b.context.confirm=()=>{preflightConfirmations++;return false;};
    b.context.callSheetsAPI=async()=>({values:s.rows.map(row=>row.slice(0,12))});
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    b.context.postToGas=data=>b.api.send('gas',data);
    const requests=[];let fail=3;
    b.window.fetch=async(_,options)=>{
      if(!options?.method)return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};
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
    assert.equal(requests.length,6);
    assert.equal(preflightConfirmations,0);
  });
}

for(const file of ['pages/js/main.js']) {
  test(file+' confirmed server rejection is shown as not registered',async()=>{
    const b=browser(),ui=formContext(b);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    b.context.postToGas=data=>b.api.send('gas',data);
    b.window.fetch=async(_,options)=>options?.method?
      {ok:true,json:async()=>({status:'ERROR',written:false,message:'他の処理が実行中'})}:
      {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};
    await b.context.submitData();
    assert.equal(ui.get('errorModal').dataset.tone,'error');
    assert.match(ui.get('errorModalBody').textContent,/登録されていません/);
  });
}

for(const file of ['pages/js/main.js']) {
  test(file+' another tab sending is shown as not sent, and retry goes through the lock again',async()=>{
    const locks=new Set(['loan-submit:gas']);
    const b=browser(new Map(),locks),ui=formContext(b);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    let posts=0;
    b.window.fetch=async(_,options)=>{if(options?.method)posts++;return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};};
    await b.context.submitData();
    assert.equal(ui.get('errorModal').dataset.tone,'error');
    assert.match(ui.get('errorModalBody').textContent,/別のタブで送信中/);
    assert.equal(posts,0);
  });
}

for(const file of ['pages/js/main.js']) {
  test(file+' blank quantity or zero amount stops before sending and keeps the button usable',async()=>{
    const b=browser(),ui=formContext(b);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    let posts=0;
    b.window.fetch=async(_,options)=>{if(options?.method)posts++;return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};};
    b.context.convertToHalfWidthNumber=v=>v==='1'?'':String(v); // 数量「1」を空欄として扱う
    await b.context.submitData();
    assert.equal(posts,0);
    assert.match(ui.get('errorModalBody').textContent,/未入力か0の行があります（2行）/);
    assert.equal(ui.button.disabled,false);
    assert.equal(b.context.submitData._isRunning,false);
  });
}

for(const file of ['pages/js/main.js']) {
  test(file+' repeated items within a new batch prompt before the first POST',async()=>{
    const b=browser(),ui=formContext(b),source=fs.readFileSync(path.join(root,file),'utf8');
    ui.rows[1].querySelector('.item').value='A';
    vm.runInContext(fs.readFileSync(path.join(root,'js/duplicate-check.js'),'utf8'),b.context);
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    b.context.callSheetsAPI=async()=>({values:[[]]});
    let asked='',posts=0;
    b.context.confirm=message=>{asked=message;return false;};
    b.window.fetch=async(_,options)=>{if(options?.method)posts++;return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};};
    await b.context.submitData();
    assert.match(asked,/同じ送信内/);
    assert.equal(posts,0);
  });
  for (const options of [{}, { skipSimilarCheck: true }, { malformed: true }]) test(file+' unavailable sheet preflight stops before any registration (mode='+JSON.stringify(options)+')',async()=>{
    const b=browser(),ui=formContext(b);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(fs.readFileSync(path.join(root,'js/duplicate-check.js'),'utf8'),b.context);
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    b.context.callSheetsAPI=async()=>{if (options.malformed) return {error:'read unavailable'}; throw new Error('read unavailable');};
    b.context.postToGas=data=>b.api.send('gas',data);
    let posts=0;
    b.window.fetch=async(_,options)=>{if(options?.method){posts++;return {ok:true,json:async()=>({status:'SUCCESS',idempotencyVersion:1,receiptId:JSON.parse(options.body).receiptId})};}return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};};
    await b.context.submitData(options);
    assert.equal(posts,0);
    assert.equal(ui.get('errorModal').dataset.tone,'error');
    assert.match(ui.get('errorModalBody').textContent,/重複確認/);
  });
  test(file+' similar existing entry asks before sending, and cancel sends nothing',async()=>{
    const b=browser(),ui=formContext(b);
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(fs.readFileSync(path.join(root,'js/duplicate-check.js'),'utf8'),b.context);
    vm.runInContext(source.slice(source.indexOf('async function submitData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitData('))),b.context);
    const a=payload('A');
    b.context.callSheetsAPI=async()=>({values:[['›'],[a.date,'別の人',a.lender,a.borrower,a.category,a.item,'1','100','100','2026/09/29 18:00:00','']]});
    let asked='';b.context.confirm=message=>{asked=message;return false;};
    let posts=0;
    b.window.fetch=async(_,options)=>{if(options?.method)posts++;return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};};
    await b.context.submitData();
    assert.match(asked,/同じ取引がすでに登録されています/);
    assert.equal(posts,0);
    assert.equal(ui.button.disabled,false);
    assert.equal(b.context.submitData._isRunning,false);
  });
}

for(const file of ['pages/js/correction.js']) {
  test(file+' actual correction accepts a Date-valued origin shown without zero padding',async()=>{
    const b=browser(),ui=formContext(b),s=server('docs/gas_scripts/gas_code_complete.gs');
    assert.equal(s.post({...payload('A'),receiptId:uuid(),receiptVersion:1}).status,'SUCCESS');
    s.rows[1][9]=new Date('2026-09-29T11:00:00+09:00');
    b.context.originalData.inputDate='2026/9/29 11:00:00';
    ui.get('lender').value='B';ui.get('borrower').value='A';
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitCorrectionData('),
      source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitCorrectionData('))),b.context);
    let posts=0;
    b.window.fetch=async(_,options)=>{
      if(!options?.method)return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};
      posts++;
      return {ok:true,json:async()=>s.post(JSON.parse(options.body))};
    };
    await b.context.submitCorrectionData();
    assert.equal(posts,1);
    assert.equal(s.rows.length,3);
    assert.match(ui.get('successMessage').textContent,/修正データの送信が完了/);
  });
  test(file+' actual correction retry uses same receipt after its original row shifts',async()=>{
    const b=browser(),ui=formContext(b),s=server('docs/gas_scripts/gas_code_complete.gs');
    assert.equal(s.post({...payload('A'),receiptId:uuid(),receiptVersion:1}).status,'SUCCESS');
    b.context.originalData.inputDate=s.rows[1][9];
    ui.get('lender').value='B';ui.get('borrower').value='A';
    const source=fs.readFileSync(path.join(root,file),'utf8');
    vm.runInContext(source.slice(source.indexOf('async function submitCorrectionData('),source.indexOf('\nfunction initializeElements()',source.indexOf('async function submitCorrectionData('))),b.context);
    const requests=[];let fail=3;
    b.window.fetch=async(_,options)=>{
      if(!options?.method)return {ok:true,json:async()=>({idempotencyVersion:1,similarityVersion:1})};
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
    assert.match(html,new RegExp(client.replace(/[.\/]/g,'\\$&')+'\\?v=\\d{10}'));
  }
});
