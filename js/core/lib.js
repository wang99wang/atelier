// ===== 通用 UI/数据辅助 =====
import { $, el, uid, now, fmtDate, relTime, toast, download, modal, escapeHtml, debounce, getNameOverride, setNameOverride, renameBtn } from './utils.js';
import { putRecord, recordsBySub, filesByRec, getFile, putFile, getRecord, allRecords, softDelete, kvGet, kvSet } from './db.js';
import { recordChange } from './sync.js';
import { callAI, hasAI, getAIConfig } from './ai.js';

// 对象 URL 缓存
const _urlCache = {};
export const fileURL = async (recId) => {
  if (_urlCache[recId]) return _urlCache[recId];
  const files = await filesByRec(recId);
  if (!files.length) return null;
  const f = files[0];
  const url = URL.createObjectURL(f.blob);
  _urlCache[recId]=url; return url;
};
export const attachFile = async (recId, file, kind='image') => {
  await putFile({ id:uid(), recId, name:file.name, type:file.type, kind, blob:file, ts:now() });
};

// 带图片附件的通用编辑器（返回保存的数据对象，由调用方 putRecord）
export function imagePicker(label='图片', opts={}) {
  let _files = [];
  const input = el('input',{type:'file',accept:'image/*',style:'display:none', ...(opts.multiple?{multiple:true}:{})});
  const preview = el('div',{class:'row wrap',style:'gap:8px'});
  const drop = el('div',{class:'dropzone'},[el('div',{class:'dz-ico',html:'📷'}), el('div',{class:'dz-txt',text:'点击或拖拽上传 · '+label})]);
  const sync = (list)=>{ _files = Array.from(list||[]); preview.innerHTML=''; for (const f of _files){ const u=URL.createObjectURL(f); preview.appendChild(el('img',{src:u,style:'width:72px;height:72px;object-fit:cover;border-radius:12px'})); } };
  drop.onclick=()=>input.click();
  input.onchange=()=>sync(input.files);
  drop.ondragover=(e)=>{ e.preventDefault(); drop.classList.add('dz-hl'); };
  drop.ondragleave=()=>drop.classList.remove('dz-hl');
  drop.ondrop=(e)=>{ e.preventDefault(); drop.classList.remove('dz-hl'); if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length) sync(e.dataTransfer.files); };
  const box = el('div',{},[drop, input, preview]);
  box.getFiles = () => _files;
  return box;
}

// 通用：保存一条带附件的记录
export const saveWithFiles = async (rec, fileBox) => {
  const saved = await putRecord(rec);
  if (fileBox && fileBox.getFiles && fileBox.getFiles().length) {
    for (const f of fileBox.getFiles()) await attachFile(saved.id, f);
  }
  await recordChange(saved);
  return saved;
};

// ===== 通用导入工具：图片 / 视频 / 链接 / 文字 =====
// 返回一个 DOM 盒子（含「导入」按钮 + 预览），调用 box.getValue() 取 {type,files,link,text,name}
export function importBox(label='📥 导入(图/视频/链接/文字)') {
  const btn = el('button',{class:'btn btn-soft btn-sm edit-only',type:'button'}, label);
  const preview = el('div',{class:'row wrap',style:'gap:8px;margin-top:6px'});
  const state = { type:null, files:[], link:'', text:'', name:'' };
  const renderPreview = ()=>{
    preview.innerHTML='';
    if (state.files && state.files.length) {
      state.files.forEach(f=>{
        const u=URL.createObjectURL(f);
        if (f.type.startsWith('image/')) preview.appendChild(el('img',{src:u,style:'width:64px;height:64px;object-fit:cover;border-radius:10px'}));
        else preview.appendChild(el('video',{src:u,style:'width:64px;height:64px;object-fit:cover;border-radius:10px',controls:true}));
      });
    }
    if (state.link) preview.appendChild(el('div',{class:'tag',text:'🔗 '+(state.name||state.link.slice(0,22))}));
    if (state.text) preview.appendChild(el('div',{class:'tag',text:'📝 '+(state.text.slice(0,16)+(state.text.length>16?'…':''))}));
  };
  btn.onclick = ()=>{
    const imgI = el('input',{type:'file',accept:'image/*',multiple:true});
    const vidI = el('input',{type:'file',accept:'video/*',multiple:true});
    const linkI = el('input',{class:'input',placeholder:'链接 https://…'});
    const textI = el('textarea',{class:'input',rows:4,placeholder:'文字内容…'});
    imgI.onchange=()=>{ state.type='image'; state.files=[...imgI.files]; renderPreview(); };
    vidI.onchange=()=>{ state.type='video'; state.files=[...vidI.files]; renderPreview(); };
    const confirm=el('button',{class:'btn btn-primary',onclick:()=>{
      if (state.type!=='image' && state.type!=='video'){
        state.link=linkI.value.trim(); state.text=textI.value.trim();
        if (state.link){ state.type='link'; state.name=state.link; }
        else if (state.text){ state.type='text'; }
      }
      if (!state.type || (state.type==='link'&&!state.link) || (state.type==='text'&&!state.text)){ toast('请选择或填写内容','err'); return; }
      renderPreview(); modal.close();
    }},'导入');
    modal.open('📥 导入内容', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'🖼 图片（可多选）'}),imgI]),
      el('div',{class:'field'},[el('label',{text:'🎬 视频'}),vidI]),
      el('div',{class:'field'},[el('label',{text:'🔗 链接'}),linkI]),
      el('div',{class:'field'},[el('label',{text:'📝 文字'}),textI]),
      el('div',{class:'row',style:'gap:8px;margin-top:8px'},[confirm, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])
    ]));
  };
  const box = el('div',{},[btn, preview]);
  box.getValue = ()=> state;
  return box;
}

// ===== 收藏（⭐ 置顶）按钮 =====
// rec 需为已保存记录（含 id）；点击切换 pinned 并落库刷新
export function favoriteBtn(rec, refresh) {
  const b = el('button',{class:'mini-btn',title:'收藏',html: rec.pinned?'⭐':'☆',onclick:async(e)=>{
    e.stopPropagation(); rec.pinned=!rec.pinned; await putRecord(rec); await recordChange(rec);
    b.innerHTML=rec.pinned?'⭐':'☆'; toast(rec.pinned?'已收藏':'已取消收藏','ok'); refresh&&refresh();
  }});
  return b;
}
// 将通用导入内容挂到记录：图片/视频存文件，链接/文字存字段。返回 {link, importedText}
export async function applyImport(recId, val) {
  if (!val || !val.type) return null;
  if ((val.type==='image'||val.type==='video') && val.files && val.files.length) {
    for (const f of val.files) await attachFile(recId, f, val.type);
  }
  return { link: val.type==='link'?val.link:'', importedText: val.type==='text'?val.text:'' };
}
// 渲染记录的导入内容预览（图片/视频缩略、链接、文字片段）。无内容返回 null
export async function renderImport(rec) {
  const box = el('div',{class:'row wrap',style:'gap:6px;margin-top:6px'});
  let has=false;
  if (rec.link) { has=true; box.appendChild(el('a',{href:rec.link,target:'_blank',rel:'noopener',class:'tag',text:'🔗 '+(rec.link.slice(0,30)+(rec.link.length>30?'…':''))})); }
  if (rec.importedText) { has=true; box.appendChild(el('div',{class:'tag',text:'📝 '+(rec.importedText.slice(0,20)+(rec.importedText.length>20?'…':''))})); }
  const files = await filesByRec(rec.id);
  for (const f of files) {
    const u = URL.createObjectURL(f.blob); has=true;
    if (f.type && f.type.startsWith('image/')) box.appendChild(el('img',{src:u,style:'width:60px;height:60px;object-fit:cover;border-radius:10px'}));
    else if (f.type && f.type.startsWith('video/')) box.appendChild(el('video',{src:u,style:'width:60px;height:60px;object-fit:cover;border-radius:10px'}));
    else if (f.type && f.type.startsWith('audio/')) box.appendChild(el('audio',{src:u,controls:true,style:'height:30px'}));
  }
  return has?box:null;
}

// ===== 子功能宫格拖拽排序持久化 =====
let _dragTile = null;
function loadSubOrder(key){
  try { const r=localStorage.getItem('suborder_'+key); const o=r?JSON.parse(r):[]; return Array.isArray(o)?o:[]; } catch { return []; }
}
function saveSubOrder(key, titles){
  try { localStorage.setItem('suborder_'+key, JSON.stringify(titles)); } catch {}
}
function attachTileDrag(tile, grid, key, s){
  tile.addEventListener('dragstart', e=>{
    _dragTile = tile;
    setTimeout(()=>tile.classList.add('tile-dragging'), 0);
    e.dataTransfer.effectAllowed = 'copyMove';
    try { e.dataTransfer.setData('text/plain', tile.getAttribute('data-title')); } catch {}
    if (s && s.key) { try { e.dataTransfer.setData('application/json', JSON.stringify({ mod:key, sub:s.key, title:s.title, icon:s.icon })); } catch {} }
  });
  tile.addEventListener('dragend', ()=>{
    tile.classList.remove('tile-dragging');
    _dragTile = null;
    grid.querySelectorAll('.tile').forEach(t=>t.classList.remove('tile-drag-over'));
  });
  tile.addEventListener('dragover', e=>{
    e.preventDefault();
    if (_dragTile && _dragTile!==tile) tile.classList.add('tile-drag-over');
  });
  tile.addEventListener('dragleave', ()=> tile.classList.remove('tile-drag-over'));
  tile.addEventListener('drop', e=>{
    e.preventDefault();
    tile.classList.remove('tile-drag-over');
    if (!_dragTile || _dragTile===tile) return;
    const rect = tile.getBoundingClientRect();
    const after = (e.clientY - rect.top) > (rect.height/2);
    if (after) tile.parentNode.insertBefore(_dragTile, tile.nextSibling);
    else tile.parentNode.insertBefore(_dragTile, tile);
    const cur = [...grid.querySelectorAll('.tile')].map(t=>t.getAttribute('data-title'));
    saveSubOrder(key, cur);
  });
}
// 子功能宫格外壳（传入 moduleKey 可启用拖拽排序并记忆）
// 支持：搜索 / 分类筛选 / 自定义添加 / 可置顶方块拖拽到左侧「我的快捷」
export function subGrid(subs, moduleKey) {
  const wrap = el('div',{class:'subgrid-wrap'});
  const search = el('input',{class:'input',placeholder:'🔎 搜索功能…',style:'max-width:240px'});
  const addBtn = el('button',{class:'btn btn-soft btn-sm',onclick:()=>openTileAdd(moduleKey, subs, renderGrid, renderChips)},'＋ 添加');
  const toolbar = el('div',{class:'row wrap',style:'gap:8px;margin-bottom:10px'},[search, el('span',{class:'grow'}), addBtn]);
  const chips = el('div',{class:'chips',style:'margin-bottom:12px'});
  const g = el('div',{class:'grid grid-3'});
  wrap.append(toolbar, chips, g);

  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('customtiles_'+moduleKey)||'[]'); } catch {}
  const allSubs = () => subs.concat(custom.map(c=>({ ...c, custom:true })));
  const catList = () => { const s=new Set(); allSubs().forEach(x=>s.add(x.cat||'其它')); return ['全部', ...s]; };
  let curCat='全部', q='';
  function renderChips(){
    chips.innerHTML='';
    catList().forEach(c=>{
      chips.appendChild(el('button',{class:'chip'+(c===curCat?' chip-on':''),onclick:()=>{ curCat=c; renderChips(); renderGrid(); }}, c));
    });
  }
  function renderGrid(){
    g.innerHTML='';
    let list = allSubs();
    if (moduleKey) {
      const order = loadSubOrder(moduleKey);
      const byTitle = Object.fromEntries(list.map(s=>[s.title, s]));
      const ordered = order.map(t=>byTitle[t]).filter(Boolean);
      const rest = list.filter(s=>!order.includes(s.title));
      list = ordered.concat(rest);
    }
    list = list.filter(s => (curCat==='全部' || (s.cat||'其它')===curCat) &&
      (!q || (s.title+' '+(s.sub||'')+' '+(s.cat||'')).toLowerCase().includes(q.toLowerCase())));
    if (!list.length) { g.appendChild(el('div',{class:'empty',style:'grid-column:1/-1'},[el('div',{class:'e-ico',html:'🔍'}),el('div',{text:'没有匹配的功能'})])); return; }
    list.forEach(s=>{
      const onClick = s.custom
        ? () => { if (s.note){ if(/^https?:\/\//.test(s.note)) window.open(s.note,'_blank'); else modal.open(s.title, el('p',{style:'white-space:pre-wrap;line-height:1.7'}, s.note)); } else toast('自定义功能：'+s.title,'ok'); }
        : s.onClick;
      const overrideKey = (moduleKey && s.key) ? moduleKey+'_'+s.key : null;
      const displayTitle = overrideKey ? getNameOverride(overrideKey, s.title) : s.title;
      const titleEl = el('div',{class:'t-title',text:displayTitle});
      const tile = el('div',{class:'tile',draggable:true,'data-title':s.title,onclick:onClick},[
        el('div',{class:'t-ico',html:s.icon}),
        titleEl,
        el('div',{class:'t-sub',text:s.sub||(s.cat?('#'+s.cat):'')})
      ]);
      if (s.custom) {
        tile.appendChild(el('button',{class:'tile-del',title:'删除自定义功能',onclick:(e)=>{ e.stopPropagation(); if(confirm('删除自定义功能「'+s.title+'」？')){ let arr=[]; try{arr=JSON.parse(localStorage.getItem('customtiles_'+moduleKey)||'[]');}catch{} arr=arr.filter(x=>x.title!==s.title); localStorage.setItem('customtiles_'+moduleKey,JSON.stringify(arr)); renderGrid(); renderChips(); } }},'✕'));
      }
      if (overrideKey) {
        tile.appendChild(renameBtn(overrideKey, displayTitle, (newName)=>{ titleEl.textContent = newName; }, '功能名称'));
      }
      if (moduleKey) {
        attachTileDrag(tile, g, moduleKey, s);
      }
      g.appendChild(tile);
    });
  }
  search.oninput = debounce(()=>{ q=search.value; renderGrid(); }, 200);
  renderChips(); renderGrid();
  return wrap;
}

// 自定义功能方块弹窗（仅本机 localStorage）
function openTileAdd(moduleKey, subs, renderGrid, renderChips){
  if (!moduleKey) { toast('该模块暂不支持自定义添加','err'); return; }
  const titleI = el('input',{class:'input',placeholder:'功能名称，如「周末计划」'});
  const iconI = el('input',{class:'input',placeholder:'图标 emoji，如 📝'});
  const catI = el('select',{class:'input'});
  const existing = new Set(['其它','工作','生活','学习','娱乐','健康']);
  subs.forEach(s=>existing.add(s.cat||'其它'));
  [...existing].forEach(c=>catI.appendChild(el('option',{value:c,text:c})));
  const noteI = el('textarea',{class:'input',rows:3,placeholder:'点击后显示的内容 / 网页链接（可选）'});
  const body = el('div',{},[
    el('div',{class:'field'},[el('label',{text:'名称'}),titleI]),
    el('div',{class:'field'},[el('label',{text:'图标'}),iconI]),
    el('div',{class:'field'},[el('label',{text:'分类'}),catI]),
    el('div',{class:'field'},[el('label',{text:'内容 / 链接'}),noteI]),
  ]);
  const save = el('button',{class:'btn btn-primary',onclick:async()=>{
    const title=titleI.value.trim(); if(!title){toast('请填写名称','err');return;}
    let arr=[]; try{ arr=JSON.parse(localStorage.getItem('customtiles_'+moduleKey)||'[]'); }catch{}
    if (arr.some(x=>x.title===title)){ toast('已存在同名功能','err'); return; }
    arr.push({ title, icon:iconI.value.trim()||'📌', cat:catI.value, note:noteI.value.trim() });
    localStorage.setItem('customtiles_'+moduleKey, JSON.stringify(arr));
    modal.close(); toast('已添加自定义功能','ok'); renderGrid(); renderChips();
  }},'添加');
  modal.open('＋ 添加自定义功能', el('div',{},[body, el('div',{class:'row',style:'gap:8px;margin-top:8px'},[save, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])]));
}
export function backBtn(onBack, label='‹ 返回功能') {
  return el('button',{class:'btn btn-ghost btn-sm',style:'margin-bottom:14px',onclick:onBack},label);
}
export function secTitle(icon,text,extra) {
  const key = 'sec::'+(text||'');
  const shown = text ? getNameOverride(key, text) : '';
  const span = el('span',{text:shown});
  const node = el('div',{class:'sec-title'},[el('span',{class:'st-ico',html:icon}), span, extra||'']);
  const isRO = (typeof document!=='undefined' && document.documentElement && document.documentElement.classList.contains('readonly'));
  if (text && !isRO) {
    node.appendChild(renameBtn(key, shown, (v)=>{ span.textContent = (v && String(v).trim()) ? v : text; }, '标题名称'));
  }
  return node;
}
// 给容器内「还没有改名按钮」的 .sec-title 补上改名能力（覆盖手动 el('div',{class:'sec-title'}...) 构造的标题）
export function enhanceTitles(root){
  const scope = root || document;
  if (!scope || !scope.querySelectorAll) return;
  const isRO = (typeof document!=='undefined' && document.documentElement && document.documentElement.classList.contains('readonly'));
  scope.querySelectorAll('.sec-title').forEach(n=>{
    if (n.querySelector('.rename-btn')) return;
    const spans=[...n.querySelectorAll('span')];
    const sp = spans.find(s=>!s.classList.contains('st-ico'));
    if (!sp) return;
    const text = (sp.textContent||'').trim();
    if (!text) return;
    const key = 'sec::'+text;
    const shown = getNameOverride(key, text);
    if (shown !== text) sp.textContent = shown;
    if (!isRO) n.appendChild(renameBtn(key, shown, (v)=>{ sp.textContent = (v && String(v).trim()) ? v : text; }, '标题名称'));
  });
}
export function exportRecords(sub, module) {
  return async () => {
    const items = await recordsBySub(module, sub);
    download(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}), `${sub}_${fmtDate(now())}.json`);
    toast('已导出','ok');
  };
}
// 简易条形图 (数据:[{label,value,color}])
export function barChart(data, opts={}) {
  const max = Math.max(...data.map(d=>Math.abs(d.value)), 1);
  const box = el('div',{class:'list',style:'gap:8px'});
  data.forEach(d=>{
    const pct = Math.round(Math.abs(d.value)/max*100);
    box.appendChild(el('div',{},[
      el('div',{class:'row between',style:'font-size:12px;margin-bottom:3px'},[
        el('span',{text:d.label}), el('span',{class:'faint',text:opts.fmt?opts.fmt(d.value):d.value})
      ]),
      el('div',{style:'background:var(--card-2);border-radius:999px;height:12px;overflow:hidden'},[
        el('div',{style:`width:${pct}%;height:100%;background:${d.color||'var(--primary)'};border-radius:999px`})
      ])
    ]));
  });
  return box;
}

// ===== AI 上下文（让 AI 更懂用户数据 / 记忆）=====
// 各模块/选项专属角色，决定 AI 的"人设"与专业度
export const AI_ROLE = {
  growth_wardrobe: '你是资深穿搭造型师，必须结合用户真实的衣橱单品（颜色/品类）给出可落地搭配，不要凭空编造不存在的衣服。',
  growth_eq: '你是高情商沟通教练，结合用户真实对话场景给话术建议。',
  growth_bookshelf: '你是阅读顾问，结合用户书架给出书单与读后感建议。',
  growth_journal: '你是写作陪练，结合用户已有的日记风格续写与润色。',
  aiedit_match: '你是视频素材策划，必须结合用户素材库里已有的内容给出 B-roll 建议。',
  aiedit_topic: '你是短视频爆款选题策划专家，输出简洁可直接用。',
  aiedit_breakdown: '你是资深剪辑师，把文案拆成可拍摄的分镜。',
  aiedit_dubsub: '你是配音导演，结合文案给出语气与节奏建议。',
  finance_ledger: '你是理财顾问，结合用户真实账目给出建议。',
  finance_bill: '你是消费分析师，结合用户真实账单做归类与省钱建议。',
  tools_todo: '你是效率管理助手，结合用户真实待办给出优先级与拆解。',
  tools_record: '你是记录整理助手，帮助用户归纳与提炼。',
  life_recipe: '你是营养师/美食助手，结合用户已有菜谱与偏好给建议。',
  life_train: '你是健身教练，结合用户训练记录给计划。',
  life_skin: '你是护肤顾问，结合用户肤质与已有护肤记录给方案。',
};

// 根据 moduleKey/sub 抓取用户真实数据，作为 AI 上下文（最多约 30 条，避免过长）
export async function buildAIContext(moduleKey, sub) {
  const parts = [];
  const grab = async (mod, sb, label, fmt) => {
    try { const items = await recordsBySub(mod, sb); if (items.length) parts.push(label+'（共'+items.length+'）：'+items.slice(0,30).map(fmt).join('；')); } catch {}
  };
  if (moduleKey==='growth' && sub==='wardrobe') await grab('growth','wardrobe','用户衣橱单品', i=>`${i.title}${i.body?('（'+(i.body||'').slice(0,30)+'）'):''}`);
  else if (moduleKey==='aiedit' && sub==='match') await grab('aiedit','material','用户素材库', i=>`${i.title}(${i.type})`);
  else if (moduleKey==='finance') await grab('finance', sub||'ledger', '用户'+ (sub||'账目'), i=>`${i.title}${i.body?('：'+(i.body||'').slice(0,30)):''}`);
  else if (moduleKey==='tools') await grab('tools', sub||'todo', '用户'+(sub||'记录'), i=>i.title||'');
  else if (moduleKey==='life') await grab('life', sub||'', '用户生活记录', i=>`${i.title}${i.body?('：'+(i.body||'').slice(0,20)):''}`);
  else { await grab(moduleKey, sub||'', '用户相关数据', i=>(i.title||i.body||'').slice(0,30)); }
  return parts.join('\n');
}

// ===== 单项 AI：生成 / 润色 / 续写 =====
// 返回按钮组（无 AI 配置时不显示）。onApply(out, mode) 由调用方落库。
// context：可传入用户数据上下文，让 AI 更个性化。
export async function aiItemActions({ title='', body='', onApply, context='' }) {
  const box = el('div',{class:'it-actions'});
  if (!(await hasAI())) return box;
  const run = async (mode, instruction) => {
    const ctxNote = context ? ('\n\n【用户已有数据，可作为个性化依据】\n'+context) : '';
    let system, prompt;
    if (mode==='generate') { system='你是一个实用内容生成助手，直接产出正文，不要解释。'+ctxNote; prompt=`主题：${title}\n补充要求：${instruction||'请生成相关内容'}\n直接输出正文。`; }
    else if (mode==='polish') { system='你是中文润色助手，让文字更通顺、得体、精炼，保持原意。'+ctxNote; prompt=`请润色下面内容：\n${body}\n${instruction?('要求：'+instruction):''}\n直接输出润色后正文。`; }
    else { system='你是续写助手，自然延续用户文字，保持风格一致。'+ctxNote; prompt=`请续写下面内容：\n${body}\n直接输出续写部分。`; }
    const out = await callAI({ system, prompt, maxTokens:1200 });
    return (out||'').trim();
  };
  const ask = (mode) => new Promise(resolve=>{
    const def = mode==='generate' ? '如：「给我写一段周末计划」' : (mode==='polish' ? '让文字更通顺得体' : '自然延续上文');
    const ta = el('textarea',{class:'input',rows:3,placeholder:def});
    const label = mode==='generate'?'AI 生成':(mode==='polish'?'AI 润色':'AI 续写');
    const ok = el('button',{class:'btn btn-primary',onclick:async()=>{ modal.close(); const instr=ta.value.trim(); const btn=ok; btn.disabled=true; btn.textContent='生成中…'; try{ const out=await run(mode,instr); if(out){ await onApply(out,mode); toast('AI 已'+label,'ok'); } else toast('AI 未返回内容','err'); }catch(e){ toast('AI 失败：'+(e.message||e),'err'); } }},'生成');
    modal.open('🤖 '+label, el('div',{},[el('p',{class:'muted',text:'可补充指令（留空用默认），点生成开始。'}), ta, el('div',{class:'row',style:'gap:8px;margin-top:8px'},[ok, el('button',{class:'btn btn-ghost',onclick:()=>{modal.close();resolve(null);}},'取消')])]));
  });
  box.append(
    el('button',{class:'mini-btn',title:'AI 生成',onclick:()=>ask('generate')},'✨'),
    el('button',{class:'mini-btn',title:'AI 润色',onclick:()=>ask('polish')},'🪄'),
    el('button',{class:'mini-btn',title:'AI 续写',onclick:()=>ask('continue')},'✍️')
  );
  return box;
}

// ===== 全局 AI 状态提示条（替换原来每个方块上的 🤖 入口）=====
// 进入任意功能页/主页顶部显示：未绑定大模型时给 ⚠️ 提示 + 🤖切换/设置
export function aiStatusBanner(){
  const box = el('div',{class:'ai-banner'});
  (async()=>{
    const on = await hasAI();
    if (on) {
      box.className = 'ai-banner ai-banner-ok';
      box.appendChild(el('span',{class:'ai-banner-ico',text:'✅'}));
      box.appendChild(el('span',{text:'已启用大模型，AI 功能将调用真实模型'}));
    } else {
      box.className = 'ai-banner ai-banner-warn';
      box.appendChild(el('span',{class:'ai-banner-ico',text:'⚠️'}));
      box.appendChild(el('span',{text:'未绑定大模型，当前使用内置模板'}));
      const link = el('span',{class:'ai-banner-link',text:'🤖 切换/设置'});
      link.onclick = ()=>document.dispatchEvent(new CustomEvent('open-ai-panel'));
      box.appendChild(link);
    }
  })();
  return box;
}
export async function openOptionAI({ title='', sub='', moduleKey='', icon='🤖', note='' }={}) {
  if (!(await hasAI())) {
    toast('请先绑定 API 后使用 AI（点顶部 🤖）','err');
    document.dispatchEvent(new Event('open-ai-panel'));
    return;
  }
  const cfg = await getAIConfig();
  const role = AI_ROLE[moduleKey+'_'+(sub||'')] || AI_ROLE[moduleKey] || '';
  const ctx = await buildAIContext(moduleKey, sub);
  const sys = `你是一个全能 AI 助手，正在帮助用户使用「${title}」这个工具/功能${note?('，它的说明是：'+note):''}。${role?('你的角色定位：'+role):'请结合该功能的使用场景，针对用户的问题给出实用、具体、可执行的回答。'}${ctx?('\n\n【用户真实数据，请据此个性化回答，不要虚构用户没有的内容】\n'+ctx):''}\n使用简体中文，语气自然。`;
  const chat = el('div',{class:'ai-chat'});
  const input = el('textarea',{class:'input',rows:3,placeholder:`向 AI 提问关于「${title}」的需求，例如：帮我规划 / 给点建议 / 写一段文案…`});
  const meBubble = (q)=>{ const m=el('div',{class:'ai-bubble ai-me',text:q}); chat.appendChild(m); chat.scrollTop=chat.scrollHeight; };
  const send = el('button',{class:'btn btn-primary',onclick:async()=>{
    const q = input.value.trim(); if(!q){ toast('请输入内容','err'); return; }
    meBubble(q); input.value=''; send.disabled=true;
    const bot = el('div',{class:'ai-bubble ai-bot'},'🤖 思考中…'); chat.appendChild(bot); chat.scrollTop=chat.scrollHeight;
    try {
      const out = await callAI({ system:sys, prompt:q, maxTokens:1500 });
      bot.textContent = out || '（AI 未返回内容）';
      bot.appendChild(el('button',{class:'mini-btn',title:'复制',onclick:()=>{ navigator.clipboard?.writeText(out||''); toast('已复制','ok'); }},'📋'));
    } catch(e){ bot.textContent = '❌ '+(e.message||e); }
    send.disabled=false; chat.scrollTop=chat.scrollHeight;
  }},'发送');
  const clear = el('button',{class:'btn btn-ghost btn-sm',onclick:()=>{ input.value=''; }},'清空');
  modal.open('🤖 '+title+' · AI 助手', el('div',{},[
    el('div',{class:'muted',style:'font-size:13px;margin-bottom:8px'}, `已接入你的专属大模型（${cfg.model||cfg.base||'未命名'}）。输入需求，让 AI 帮你生成、规划或给建议。`),
    chat,
    input,
    el('div',{class:'row',style:'gap:8px;margin-top:8px;justify-content:flex-end'},[clear, send])
  ]));
}

// ===== 智能列表：自定义添加 + 搜索 + 分类 + 单项 AI =====
// opts: { module, sub, title, empty?, catOptions?, placeholder?, getContext?(item)=>文本, onRender?(item)=>body文本 }
export async function smartList(opts) {
  const wrap = el('div',{class:'smart-list'});
  const search = el('input',{class:'input',placeholder:'🔎 搜索'+opts.title+'…',style:'max-width:240px'});
  const addBtn = el('button',{class:'btn btn-soft btn-sm',onclick:()=>openItemAdd(opts, render)},'＋ 添加');
  const batchBtn = el('button',{class:'btn btn-soft btn-sm',style:'display:none'},'✨ 批量润色');
  const toolbar = el('div',{class:'row wrap',style:'gap:8px;margin-bottom:10px'},[search, el('span',{class:'grow'}), batchBtn, addBtn]);
  const chips = el('div',{class:'chips',style:'margin-bottom:12px'});
  const listBox = el('div',{class:'list'});
  wrap.append(toolbar, chips, listBox);

  let items = [], curCat='全部', q='', ctx='';
  const cats = () => { const s=new Set(['全部']); items.forEach(r=>s.add(r.cat||'未分类')); return [...s]; };
  function renderChips(){ chips.innerHTML=''; cats().forEach(c=>chips.appendChild(el('button',{class:'chip'+(c===curCat?' chip-on':''),onclick:()=>{curCat=c;renderChips();render();}}, c))); }
  function filtered(){ return items.filter(r=>(curCat==='全部'||(r.cat||'未分类')===curCat) && (!q || ((r.title||'')+' '+(r.body||'')).toLowerCase().includes(q.toLowerCase()))); }
  async function render(){
    listBox.innerHTML='';
    const rows = filtered().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || (b.updated||0)-(a.updated||0));
    if (!rows.length) { listBox.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'📭'}),el('div',{text:opts.empty||'还没有内容，点「添加」开始'})])); return; }
    for (const r of rows) {
      const bodyText = opts.getContext ? opts.getContext(r) : (r.body||'');
      const actions = el('div',{class:'it-actions'},[
        el('button',{class:'mini-btn',title:'编辑',onclick:()=>openItemAdd(opts, render, r)},'✏️'),
        el('button',{class:'mini-btn',title:'删除',onclick:async()=>{ if(!confirm('确定删除「'+(r.title||'此项')+'」？'))return; await softDelete(r.id); await recordChange({...r,deleted:true}); toast('已移入回收站','ok'); await load(); }},'🗑')
      ]);
      const ai = await aiItemActions({ title:r.title||'', body:r.body||'', context:ctx, onApply:async(out,mode)=>{ const upd={ ...r, body: mode==='generate'? out : (mode==='continue'? (r.body||'')+'\n'+out : out), updated:now() }; await putRecord(upd); await recordChange(upd); await load(); } });
      ai.childNodes.forEach(n=>actions.appendChild(n));
      listBox.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:opts.icon||'📌'}),
        el('div',{class:'it-body'},[
          el('div',{class:'it-title',text:r.title||'(无标题)'}),
          el('div',{class:'it-meta',html: relTime(r.updated||r.created||now()) + (r.cat&&r.cat!=='未分类'? ' · #'+escapeHtml(r.cat):'') + (bodyText? ' · '+escapeHtml(bodyText.slice(0,40)):'')})
        ]),
        actions
      ]));
    }
  }
  async function load(){ items = await recordsBySub(opts.module, opts.sub); ctx = await buildAIContext(opts.module, opts.sub); renderChips(); render(); }
  search.oninput = debounce(()=>{ q=search.value; render(); }, 200);
  if (await hasAI()) { batchBtn.style.display='inline-flex'; }
  batchBtn.onclick = async () => {
    if (!items.length){ toast('没有内容可润色','err'); return; }
    batchBtn.disabled=true; batchBtn.textContent='润色中…';
    try {
      const sys = '你是中文润色助手。对用户给出的每一条内容单独润色：更通顺、得体、精炼，保持原意与编号。严格按格式逐条返回：第N条：<润色后正文>。';
      const prompt = items.map((r,i)=>`第${i+1}条：${r.body||r.title||''}`).join('\n');
      const out = await callAI({ system:sys, prompt, maxTokens:2400, temperature:0.5 });
      const map = {}; const re=/第(\d+)条[：:]\s*([\s\S]*?)(?=第\d+条[：:]|$)/g; let m;
      while ((m=re.exec(out||''))) { map[+m[1]]=(m[2]||'').trim(); }
      let n=0;
      for (let i=0;i<items.length;i++){ const txt=map[i+1]; if(txt){ const r=items[i]; const upd={...r, body:txt, updated:now()}; await putRecord(upd); await recordChange(upd); n++; } }
      toast('已批量润色 '+n+' 条','ok'); await load();
    } catch(e){ toast('批量润色失败：'+(e.message||e),'err'); }
    batchBtn.disabled=false; batchBtn.textContent='✨ 批量润色';
  };
  await load();
  return wrap;
}

// 智能列表 / 自定义功能的「添加」弹窗（含分类）
function openItemAdd(opts, reload, rec){
  const titleI = el('input',{class:'input',value:rec?rec.title:'',placeholder:'标题'});
  const catI = el('select',{class:'input'});
  const preset=['未分类','工作','生活','学习','娱乐','健康','灵感','其它'];
  const extra = opts.catOptions||[];
  const set = new Set(preset.concat(extra));
  [...set].forEach(c=>catI.appendChild(el('option',{value:c,text:c})));
  if (rec && rec.cat) { if(![...set].includes(rec.cat)) catI.appendChild(el('option',{value:rec.cat,text:rec.cat})); catI.value=rec.cat; }
  const bodyI = el('textarea',{class:'input',rows:4,value:rec?rec.body:'',placeholder:opts.placeholder||'内容…'});
  const body = el('div',{},[
    el('div',{class:'field'},[el('label',{text:'标题'}),titleI]),
    el('div',{class:'field'},[el('label',{text:'分类'}),catI]),
    el('div',{class:'field'},[el('label',{text:'内容'}),bodyI]),
  ]);
  const save = el('button',{class:'btn btn-primary',onclick:async()=>{
    const data = { title:titleI.value.trim(), cat:catI.value, body:bodyI.value };
    if (!data.title){ toast('请填写标题','err'); return; }
    const base = rec || { id:uid(), module:opts.module, sub:opts.sub, created:now() };
    const saved = await putRecord({ ...base, ...data, updated:now() });
    await recordChange(saved);
    modal.close(); toast('已保存','ok'); reload();
  }},'保存');
  modal.open((rec?'编辑':'添加')+' · '+(opts.title||''), el('div',{},[body, el('div',{class:'row',style:'gap:8px;margin-top:8px'},[save, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])]));
}

// 给「自定义列表」补 搜索 + 分类筛选（不破坏原渲染逻辑）
// render(q, cat) 由调用方实现过滤+重渲染
export function listToolbar({ cats=[], searchPh='搜索', render, importOpt=null }) {
  const search = el('input',{class:'input',placeholder:'🔎 '+searchPh,style:'max-width:220px'});
  const chipBox = el('div',{class:'chips',style:'margin:8px 0'});
  const state = { q:'', cat:'全部' };
  const fire = ()=>render(state.q, state.cat);
  search.oninput = debounce(()=>{ state.q=search.value; fire(); }, 200);
  const rightRow = el('div',{class:'row wrap',style:'gap:8px;margin-bottom:6px'},[search]);
  if (importOpt && importOpt.module && importOpt.sub) {
    rightRow.appendChild(el('button',{class:'btn btn-soft btn-sm edit-only',onclick:()=>importInto(importOpt.module, importOpt.sub, { title:importOpt.title||'内容', cat:importOpt.cat||'未分类', onDone:()=>render('','全部') })},'📥 导入'));
  }
  ['全部', ...cats].forEach(c=>{
    const b = el('button',{class:'chip'+(c==='全部'?' chip-on':''),onclick:()=>{ state.cat=c; [...chipBox.children].forEach(x=>x.classList.toggle('chip-on', x.textContent===c)); fire(); }}, c);
    chipBox.appendChild(b);
  });
  return el('div',{},[rightRow, chipBox]);
}

// 通用导入：打开导入框，把 图片/视频/链接/文字 创建为一条记录（图片视频存附件）
export async function importInto(module, sub, { title='导入内容', cat='未分类', onDone }={}) {
  const box = importBox('📥 选择要导入的内容');
  const saveBtn = el('button',{class:'btn btn-primary grow',onclick:async()=>{
    const v = box.getValue();
    if (!v || ((!v.files || !v.files.length) && !v.link && !v.text)) { toast('请先选择或填写内容','err'); return; }
    const rec = { id:uid(), module, sub, created:now(), updated:now(), cat: cat||'未分类',
      title: (v.text? v.text.slice(0,24):'') || (v.link? v.link.slice(0,24):'') || '导入内容',
      body: v.text||'', link: v.link||'' };
    const saved = await putRecord(rec);
    if (v.files && v.files.length) for (const f of v.files) await attachFile(saved.id, f, v.type);
    await recordChange(saved);
    toast('已导入','ok'); modal.close(); onDone && onDone();
  }});
  modal.open('📥 导入到「'+title+'」', el('div',{},[box, el('div',{class:'row',style:'margin-top:12px;gap:8px'},[saveBtn, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])]));
}

// 骨架屏占位：路由切换/异步加载时覆盖内容区
// rows: 占位行数；withHead: 是否带标题+按钮占位
export function skeleton({ rows=5, withHead=true }={}){
  const wrap = el('div',{class:'sk-screen'});
  if (withHead) wrap.appendChild(el('div',{class:'sk-row sk-head'},[el('div',{class:'sk sk-title'}), el('div',{class:'sk sk-pill'})]));
  for (let i=0;i<rows;i++){
    wrap.appendChild(el('div',{class:'sk-row'},[
      el('div',{class:'sk sk-ico'}),
      el('div',{class:'sk-col'},[el('div',{class:'sk sk-line'}), el('div',{class:'sk sk-line short'})])
    ]));
  }
  return wrap;
}

// 统一空状态：柔和插画 + 标题/副标题 + 可选操作按钮
// opts: { icon, title, sub, action(一个 button 元素) }
export function emptyState({ icon='🗂️', title='这里还空空如也', sub='', action=null }={}){
  const kids = [ el('div',{class:'e-ico',text:icon}), el('div',{class:'e-title',text:title}) ];
  if (sub) kids.push(el('div',{class:'e-sub',text:sub}));
  if (action) kids.push(el('div',{class:'e-act'},[action]));
  return el('div',{class:'empty'}, kids);
}
