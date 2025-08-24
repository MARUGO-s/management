(function(){ if(!('RBX' in window)) window.RBX = {}; })();

/* ==== BEGIN supabase.init.js ==== */
(function(window, document){
// supabase.init.js — create global client `window.sb`
(function(){ 
  if (window.supabase && !window.sb) {
    window.sb = window.supabase.createClient("https://ctxyawinblwcbkovfsyj.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q");
    console.log("[Supabase] client initialized");
  } else if (!window.supabase) {
    console.warn("[Supabase] CDN not found. Add @supabase/supabase-js@2 before this script.");
  }
})();

})(window, document);
/* ==== END supabase.init.js ==== */

/* ==== BEGIN app.supabase.js ==== */
(function(window, document){
// app.supabase.js (favorites対応版)
(function(){
  const sb = window.sb;
  if(!sb){ console.error("[Supabase] client not found"); return; }

  const $ = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
  const fmtDate = (s)=> new Date(s).toLocaleString('ja-JP',{hour12:false});
  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
  const escapeHtml = (s)=> (s??"").toString().replace(/[&<>\"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

  // identity（Auth未導入でも favorites を端末紐付けできるよう client_id を使う）
  const identity = { uid: null, client_id: null };
  (async () => {
    try{
      const { data: { user } } = await sb.auth.getUser();
      identity.uid = user?.id || null;
    }catch(e){}
    identity.client_id = localStorage.getItem("client_id") || (crypto?.randomUUID?.() ? crypto.randomUUID() : String(Math.random()).slice(2));
    localStorage.setItem("client_id", identity.client_id);
  })();

  const views = {
    home:    $("#view-home"),
    recipes: $("#view-recipes"),
    fav:     $("#view-fav"),
    settings:$("#view-settings")
  };
  function show(view){
    Object.values(views).forEach(v=> v && (v.style.display="none"));
    const el = views[view] || views.recipes;
    if(el) el.style.display = "";
    const map = {home:"#btnNavHome", recipes:"#btnNavRecipes", fav:"#btnNavFav", settings:"#btnNavSettings"};
    Object.entries(map).forEach(([k,sel])=>{
      const b=$(sel); if(!b) return;
      const on=(k===view); b.classList.toggle("active", on);
      if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
    });
    location.hash = "#"+view;
    if(view==="recipes"){ loadAndRender(); }
    if(view==="fav"){ loadAndRenderFav(); }
  }
  $("#btnNavHome")?.addEventListener("click", ()=>show("home"));
  $("#btnNavRecipes")?.addEventListener("click", ()=>show("recipes"));
  $("#btnNavFav")?.addEventListener("click", ()=>show("fav"));
  $("#btnNavSettings")?.addEventListener("click", ()=>show("settings"));
  window.addEventListener("hashchange", ()=>{
    const v=(location.hash||"#recipes").slice(1);
    show(["home","recipes","fav","settings"].includes(v)?v:"recipes");
  });

  // ===== list/detail shared nodes =====
  const listEl   = $("#list");
  const detailEl = $("#detail");
  const searchEl = $("#search");
  const btnNew   = $("#btnNew");

  async function fetchList(){
    const { data, error } = await sb.from("recipes").select("id,title,tags,updated_at").order("updated_at",{ascending:false}).limit(200);
    if(error){ console.error(error); return []; }
    return data;
  }
  function renderList(items){
    listEl.innerHTML = "";
    if(!items.length){
      const div=document.createElement("div"); div.className="empty"; div.textContent="レシピがありません。";
      listEl.appendChild(div); return;
    }
    const q=(state.search||"").trim().toLowerCase();
    const filtered=q? items.filter(r=>{
      const tgt=[r.title,...(r.tags||[])].join(" ").toLowerCase();
      return q.split(/\s+/).every(w=>tgt.includes(w));
    }): items;
    filtered.forEach(r=>{
      const card=document.createElement("div"); card.className="card";
      card.innerHTML=`<div class="t">${escapeHtml(r.title)}</div>
        <div class="meta">${r.tags?.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join(" ")||""}</div>
        <div class="meta">${r.updated_at? "更新: "+fmtDate(r.updated_at):""}</div>`;
      card.addEventListener("click", ()=> openRecipe(r.id));
      listEl.appendChild(card);
    });
  }

  const state = { list:[], current:null, search:"" };

  async function openRecipe(id){
    const { data: recipe, error: e1 } = await sb.from("recipes").select("*").eq("id",id).single();
    if(e1){ console.error(e1); return; }
    const { data: ings }  = await sb.from("recipe_ingredients").select("*").eq("recipe_id",id).order("position",{ascending:true});
    const { data: steps } = await sb.from("recipe_steps").select("*").eq("recipe_id",id).order("position",{ascending:true});
    state.current = { recipe, ings:ings||[], steps:steps||[] };
    renderDetail();
  }

  // === favorites helpers ===
  async function isFav(recipe_id){
    let q = sb.from("favorites").select("id").eq("recipe_id", recipe_id).limit(1);
    if(identity.uid) q = q.eq("user_id", identity.uid);
    else q = q.eq("client_id", identity.client_id);
    const { data, error } = await q;
    if(error){ console.error(error); return null; }
    return data?.[0] || null;
  }
  async function setFav(recipe_id, on){
    if(on){
      const payload = identity.uid
        ? { recipe_id, user_id: identity.uid }
        : { recipe_id, client_id: identity.client_id };
      const { error } = await sb.from("favorites").insert(payload);
      if(error && error.code!=="23505"){ throw error; } // 23505: unique violation -> OK
    }else{
      let q = sb.from("favorites").delete().eq("recipe_id", recipe_id);
      q = identity.uid ? q.eq("user_id", identity.uid) : q.eq("client_id", identity.client_id);
      const { error } = await q;
      if(error) throw error;
    }
  }
  async function fetchFavList(){
    let q = sb.from("favorites")
      .select("recipe_id, created_at, recipes!inner(id,title,tags,updated_at)")
      .order("created_at",{ascending:false});
    q = identity.uid ? q.eq("user_id", identity.uid) : q.eq("client_id", identity.client_id);
    const { data, error } = await q;
    if(error){ console.error(error); return []; }
    return (data||[]).map(x=>x.recipes);
  }

  function heart(on){ return on ? "♥" : "♡"; }

  function renderDetail(){
    const r=state.current?.recipe;
    const ings=state.current?.ings||[]; const steps=state.current?.steps||[];
    if(!r){ detailEl.innerHTML = `<div class="empty">左の一覧から選ぶか「＋ 新規レシピ」を押してください。</div>`; return; }
    detailEl.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:center;">
        <div class="field" style="flex:1"><label>タイトル</label><input id="fTitle" type="text" value="${escapeHtml(r.title||"")}" /></div>
        <button id="favToggle" class="btn" title="お気に入り">♡</button>
      </div>
      <div class="twocol">
        <div class="field"><label>分量</label><input id="fYield" type="text" value="${r.yield??""}" /></div>
        <div class="field"><label>単位</label><input id="fYieldUnit" type="text" value="${escapeHtml(r.yield_unit||"")}" /></div>
      </div>
      <div class="field"><label>タグ（カンマ区切り）</label><input id="fTags" type="text" value="${(r.tags||[]).join(", ")}" /></div>
      <div class="field"><label>メモ</label><textarea id="fNote">${escapeHtml(r.meta?.note||"")}</textarea></div>

      <div class="field"><label>材料</label><div id="ingList" class="inglist"></div><button id="addIng" class="btn small">＋ 材料行</button></div>
      <div class="field"><label>手順</label><div id="stepList" class="inglist"></div><button id="addStep" class="btn small">＋ 手順行</button></div>

      <div class="row"><button id="save" class="btn primary">保存</button><button id="del" class="btn danger">削除</button></div>
    `;

    const ingList=$("#ingList",detailEl); const stepList=$("#stepList",detailEl);
    function addIngRow(v={}){
      const wrap=document.createElement("div"); wrap.className="ingrow";
      wrap.innerHTML=`<input data-k="item" placeholder="材料名 *" value="${escapeHtml(v.item||"")}" />
        <input data-k="quantity" placeholder="数量" value="${v.quantity??""}" />
        <div class="row"><input data-k="unit" class="small" placeholder="単位" value="${escapeHtml(v.unit||"")}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      wrap.querySelector('[data-act="rm"]').addEventListener("click",()=>wrap.remove());
      ingList.appendChild(wrap);
    }
    function addStepRow(v={}){
      const wrap=document.createElement("div"); wrap.className="ingrow";
      wrap.innerHTML=`<input data-k="instruction" placeholder="手順 *" value="${escapeHtml(v.instruction||"")}" />
        <input data-k="timer_sec" placeholder="秒" value="${v.timer_sec??""}" />
        <div class="row"><input data-k="temp_c" class="small" placeholder="℃" value="${v.temp_c??""}" /><button class="btn small danger" data-act="rm">－</button></div>`;
      wrap.querySelector('[data-act="rm"]').addEventListener("click",()=>wrap.remove());
      stepList.appendChild(wrap);
    }
    ings.forEach(addIngRow); steps.forEach(addStepRow);
    $("#addIng",detailEl).addEventListener("click",()=>addIngRow({}));
    $("#addStep",detailEl).addEventListener("click",()=>addStepRow({}));
    $("#save",detailEl).addEventListener("click",saveCurrent);
    $("#del",detailEl).addEventListener("click",delCurrent);

    // fav initial state + handler
    (async ()=>{
      const f = await isFav(r.id);
      const btn = $("#favToggle", detailEl);
      let on = !!f; btn.textContent = heart(on);
      btn.addEventListener("click", async ()=>{
        on = !on;
        try{
          await setFav(r.id, on);
          btn.textContent = heart(on);
          // if we are in fav view, refresh the list
          if((location.hash||"#").slice(1)==="fav") await loadAndRenderFav();
        }catch(err){
          alert("お気に入り更新に失敗: "+(err?.message||err));
        }
      });
    })();
  }

  async function saveCurrent(){
    const r=state.current?.recipe || { title:"" };
    const id=r.id;
    const payload={
      title: $("#fTitle").value.trim(),
      yield: num($("#fYield").value),
      yield_unit: $("#fYieldUnit").value.trim() || null,
      tags: $("#fTags").value.split(",").map(s=>s.trim()).filter(Boolean),
      meta: { note: $("#fNote").value }
    };
    if(!payload.title){ alert("タイトルは必須です"); return; }

    let res;
    if(id){ res = await sb.from("recipes").update(payload).eq("id",id).select("*").single(); }
    else  { res = await sb.from("recipes").insert(payload).select("*").single(); }
    if(res.error){ alert("保存失敗: "+res.error.message); return; }
    const recipe_id = res.data.id;

    const ingRows = $$("#ingList .ingrow").map((row,i)=>{
      const get=k=> $('[data-k="'+k+'"]',row)?.value || "";
      const qty=num(get("quantity"));
      return { recipe_id, position:i+1, item:get("item").trim(), quantity:(qty==null?null:qty), unit:(get("unit").trim()||null) };
    }).filter(x=>x.item);
    const stepRows = $$("#stepList .ingrow").map((row,i)=>{
      const get=k=> $('[data-k="'+k+'"]',row)?.value || "";
      const tsec=parseInt(get("timer_sec")); const temp=num(get("temp_c"));
      return { recipe_id, position:i+1, instruction:get("instruction").trim(), timer_sec:isFinite(tsec)?tsec:null, temp_c:temp };
    }).filter(x=>x.instruction);

    await sb.from("recipe_ingredients").delete().eq("recipe_id",recipe_id);
    await sb.from("recipe_steps").delete().eq("recipe_id",recipe_id);
    if(ingRows.length){ const {error:e1}=await sb.from("recipe_ingredients").insert(ingRows); if(e1){ alert("材料の保存に失敗: "+e1.message); return; } }
    if(stepRows.length){ const {error:e2}=await sb.from("recipe_steps").insert(stepRows); if(e2){ alert("手順の保存に失敗: "+e2.message); return; } }

    await loadAndRender();
    await openRecipe(recipe_id);
  }

  async function delCurrent(){
    if(!state.current?.recipe?.id) return;
    if(!confirm("このレシピを削除しますか？")) return;
    const id=state.current.recipe.id;
    const { error } = await sb.from("recipes").delete().eq("id", id);
    if(error){ alert("削除失敗: "+error.message); return; }
    state.current=null;
    await loadAndRender();
    renderDetail();
    // お気に入り側にも影響するのでfavリスト更新
    await loadAndRenderFav();
  }

  function num(s){ const v=parseFloat(String(s||"").replace(/[, \t]/g,'')); return isFinite(v) ? v : null; }

  const stateFav = { list: [] };
  async function loadAndRenderFav(){
    const items = await fetchFavList();
    stateFav.list = items;
    renderList(items);
  }

  // search
  const state = window.__app_state || { search:"" };
  searchEl?.addEventListener("input", e=>{ state.search=e.target.value; renderList((location.hash||"#").slice(1)==="fav"?stateFav.list:state.list); });

  // New
  btnNew?.addEventListener("click", ()=>{ state.current={ recipe:{ title:"" }, ings:[], steps:[] }; renderDetail(); show("recipes"); });

  async function loadAndRender(){
    state.list = await fetchList();
    renderList(state.list);
  }

  // Settings export/import same as before (omitted for brevity) ... keep previous implementation if present

  // Kick
  show((location.hash||"#recipes").slice(1));
  loadAndRender();
})();
})(window, document);
/* ==== END app.supabase.js ==== */

/* ==== BEGIN page.nav.bridge.js ==== */
(function(window, document){
// assets/js/page.nav.bridge.js
// 既存の一覧クリックや新規作成を「別ページ」遷移にするブリッジ
(function(){
  const $ = (sel, el=document)=> el.querySelector(sel);
  // 新規レシピ → 編集ページへ
  window.addEventListener('DOMContentLoaded', ()=>{
    const newBtn = document.getElementById('btnNew');
    if(newBtn){
      newBtn.addEventListener('click', (e)=>{
        e.preventDefault(); e.stopImmediatePropagation();
        location.href = 'recipe.edit.html';
      }, {capture:true, once:false});
    }
  });

  // 一覧クリック → 表示ページへ（data-id を優先）
  document.addEventListener('click', async (e)=>{
    const card = e.target.closest('[data-id], [data-recipe-id], .card');
    if(!card) return;
    // 既存の詳細描画ハンドラを止める
    e.preventDefault(); e.stopImmediatePropagation();
    let id = card.dataset.id || card.dataset.recipeId;
    if(!id){
      const title = (card.querySelector('.t')?.textContent || card.textContent || '').trim();
      if(!title || !window.sb) return;
      try{
        const { data } = await sb.from('recipes').select('id,updated_at').ilike('title', title).order('updated_at',{ascending:false}).limit(1);
        id = data?.[0]?.id;
      }catch(_){}
    }
    if(id) location.href = `recipe.view.html?id=${encodeURIComponent(id)}`;
  }, true);
})();
})(window, document);
/* ==== END page.nav.bridge.js ==== */

/* ==== BEGIN recipe.view.js ==== */
(function(window, document){
(function(){
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const $ = (sel, el=document)=> el.querySelector(sel);

  const titleEl = $('#title');
  const metaEl  = $('#meta');
  const ingEl   = $('#ing');
  const stepsEl = $('#steps');
  const notesEl = $('#notes');
  const tagsEl  = $('#tags');
  const btnEdit = $('#btnEdit');

  if(!window.sb){ alert('Supabase not initialized'); return; }
  if(!id){ alert('レシピIDがありません'); location.href='index.html#recipes'; return; }
  btnEdit.href = `recipe.edit.html?id=${encodeURIComponent(id)}`;

  function esc(s){ return String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  async function load(){
    const { data: recs, error } = await sb.from('recipes').select('*').eq('id', id).limit(1);
    if(error){ console.error(error); alert('レシピの取得に失敗しました'); return; }
    const r = recs?.[0];
    if(!r){ alert('レシピが見つかりません'); return; }

    titleEl.textContent = r.title || '無題のレシピ';
    metaEl.textContent  = r.updated_at ? `更新: ${new Date(r.updated_at).toLocaleString()}` : '';
    if(r.notes) notesEl.textContent = r.notes;
    const tags = Array.isArray(r.tags) ? r.tags : (r.tags ? String(r.tags).split(/[,\s]+/).filter(Boolean) : []);
    if(tags.length){ tagsEl.innerHTML = tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(''); }

    try{
      const { data: ings, error: e1 } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position', {ascending:true}).order('id', {ascending:true});
      if(!e1 && ings?.length){
        const cols = Object.keys(ings[0]).filter(k=>!['id','recipe_id','created_at','updated_at'].includes(k));
        const html = [`<table class="table"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`,
                      ...ings.map(row=>`<tr>${cols.map(c=>`<td>${esc(row[c])}</td>`).join('')}</tr>`),
                      `</tbody></table>`].join('');
        ingEl.innerHTML = html;
      }else{ ingEl.innerHTML = '<div class="empty">未登録</div>'; }
    }catch(_){ ingEl.innerHTML = '<div class="empty">未登録</div>'; }

    try{
      const { data: steps, error: e2 } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position', {ascending:true}).order('id', {ascending:true});
      if(!e2 && steps?.length){
        stepsEl.innerHTML = steps.map(s=>`<li>${esc(s.instruction || s.step || s.description || s.body || '')}</li>`).join('');
      }else{ stepsEl.innerHTML = '<li class="empty">未登録</li>'; }
    }catch(_){ stepsEl.innerHTML = '<li class="empty">未登録</li>'; }
  }
  load();
})();
})(window, document);
/* ==== END recipe.view.js ==== */

/* ==== BEGIN recipe.edit.js ==== */
(function(window, document){
(function(){
  const params = new URLSearchParams(location.search);
  let id = params.get('id');
  const $ = (sel, el=document)=> el.querySelector(sel);

  const titleEl = $('#title');
  const tagsEl  = $('#tags');
  const notesEl = $('#notes');
  const btnSave = $('#btnSave');
  const btnNew  = $('#btnNew');
  const btnView = $('#btnView');
  const statusEl= $('#status');

  if(!window.sb){ alert('Supabase not initialized'); return; }
  btnView.addEventListener('click', ()=>{
    if(!id){ alert('先に保存してください'); return; }
    location.href = `recipe.view.html?id=${encodeURIComponent(id)}`;
  });

  async function load(){
    if(!id) return;
    const { data: recs, error } = await sb.from('recipes').select('*').eq('id', id).limit(1);
    if(error){ console.error(error); return; }
    const r = recs?.[0]; if(!r) return;
    titleEl.value = r.title || '';
    const tags = Array.isArray(r.tags) ? r.tags : (r.tags ? String(r.tags).split(/[,\s]+/).filter(Boolean) : []);
    tagsEl.value = tags.join(', ');
    notesEl.value = r.notes || '';
  }

  function toTags(v){
    const arr = String(v||'').split(/[,\s]+/).map(s=>s.trim()).filter(Boolean);
    return arr;
  }

  async function save({asNew=false}={}){
    const payload = { title: titleEl.value?.trim()||'無題のレシピ' };
    const tags = toTags(tagsEl.value);
    if(tags.length) payload.tags = tags;
    if(notesEl.value?.trim()) payload.notes = notesEl.value.trim();

    let res;
    if(asNew || !id){
      res = await sb.from('recipes').insert(payload).select('id').single();
    }else{
      res = await sb.from('recipes').update(payload).eq('id', id).select('id').single();
    }
    if(res.error){ console.error(res.error); statusEl.textContent = '保存に失敗しました'; return; }
    id = res.data.id;
    statusEl.textContent = '保存しました';
    btnView.href = `recipe.view.html?id=${encodeURIComponent(id)}`;
  }

  btnSave.addEventListener('click', ()=>save({asNew:false}));
  btnNew.addEventListener('click', ()=>save({asNew:true}));

  load();
})();
})(window, document);
/* ==== END recipe.edit.js ==== */
