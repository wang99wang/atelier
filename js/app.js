// ===== 主应用：初始化 / 路由 / 菜单 / 设置 =====
import { $, $$, el, toast, modal, drawer, fmtDate, relTime, download, escapeHtml, debounce, getNameOverride, setNameOverride, getIconOverride, setIconOverride, applyAppName, renameBtn } from './core/utils.js';
import { openDB, globalSearch, trashList, restore, hardDelete, allRecords, recordsByModule, kvGet, kvSet, storageInfo } from './core/db.js';
import { initSync, syncNow } from './core/sync.js';
import { initReminders, getReminders, saveReminders, requestPermission } from './core/notifications.js';
import { getWeather } from './core/data-services.js';
import { getAIConfig, saveAIConfig, testAI, hasAI } from './core/ai.js';
import { aiStatusBanner, skeleton, emptyState, enhanceTitles, secTitle } from './core/lib.js';
import * as daily from './modules/daily.js';
import * as tools from './modules/tools.js';
import * as life from './modules/life.js';
import * as finance from './modules/finance.js';
import * as growth from './modules/growth.js';
import * as creator from './modules/creator.js';
import * as aiedit from './modules/ai-edit.js';

const MODULES = [daily, tools, life, finance, growth, creator, aiedit];

// ===== 分享 / 只读模式（用于「分享给别人用，不能动」）=====
// 触发：URL 带 ?share=1，或分享版部署时 index.html 注入 window.ATELIER_READONLY=true
const READONLY = !!(window.ATELIER_READONLY || new URLSearchParams(location.search).has('share') || (new URLSearchParams(location.search).get('mode')==='share'));
if (READONLY) { document.documentElement.classList.add('readonly');
  document.addEventListener('click', (e)=>{
    const t = e.target.closest('.rename-btn,.menu-reset,.pin-del,[data-edit="1"],.edit-only,.btn-danger,.add-btn,.del-btn');
    if (t) { e.preventDefault(); e.stopPropagation(); toast('只读分享模式，不可修改','err'); }
  }, true);
}

// 从「技能审美」拎出的独立侧边栏入口（原为其子页）
// parent 决定它缩进归属在哪个一级模块下面
const DIRECT_SUBS = [
  { key:'eq', name:'高情商话术', icon:'💬', mod:'growth', sub:'eq', parent:'growth' },
  { key:'outfit', name:'衣服穿搭', icon:'👗', mod:'growth', sub:'wardrobe', parent:'growth' },
  { key:'mandarin', name:'普通话练习', icon:'🗣️', mod:'growth', sub:'mandarin', parent:'growth' },
  { key:'kin', name:'认亲戚关系图', icon:'🧬', mod:'growth', sub:'kin', parent:'tools' },
];
// 整个模块作为子项归类到别的模块下：生活锻炼 → 技能审美；资金记账 → 快捷工具
const MENU_PARENT = { life:'growth', finance:'tools' };

let menuData = []; // 用 let：buildMenu 会把自定义入口并入并过滤
MODULES.forEach((m)=>{
  menuData.push({ key:m.meta.key, name:m.meta.name, icon:m.meta.icon, parent: MENU_PARENT[m.meta.key]||null });
});
DIRECT_SUBS.forEach(d=>menuData.push(Object.assign({},d)));
menuData.push({ key:'mine', name:'我的', icon:'🏠', parent:null });

// ===== 侧边栏自定义入口（可收藏常用网页 / 内部功能）=====
const CUSTOM_ENTRIES_KEY = 'atelier_custom_entries_v1';
function loadCustomEntries(){ try{ return JSON.parse(localStorage.getItem(CUSTOM_ENTRIES_KEY)||'[]'); }catch{ return []; } }
function saveCustomEntries(a){ try{ localStorage.setItem(CUSTOM_ENTRIES_KEY, JSON.stringify(a)); }catch{} }

function goMenu(m){
  if (m.custom && m.url) { window.open(m.url, '_blank', 'noopener'); return; }
  if(m.mod && m.sub) location.hash='#/'+m.mod+'/'+m.sub; else location.hash='#/'+m.key;
}

// ===== 菜单顺序：拖拽自定义 + 持久化 =====
const MENU_ORDER_KEY = 'atelier_menu_order_v1';
function loadMenuOrder(){ try{ return JSON.parse(localStorage.getItem(MENU_ORDER_KEY)||'[]'); }catch{ return []; } }
function saveMenuOrder(){ try{ localStorage.setItem(MENU_ORDER_KEY, JSON.stringify(menuData.map(m=>m.key))); }catch{} }
function applyMenuOrder(){
  const saved = loadMenuOrder();
  if(!saved.length) return;
  const natural = new Map(menuData.map((m,i)=>[m.key,i]));
  const idx = new Map(saved.map((k,i)=>[k,i]));
  const selfRank = m => idx.has(m.key)? idx.get(m.key) : 1e6 + (natural.get(m.key)??999);
  // 子项跟随父项排序：先看父项的排名，同级再按自身排名
  const groupRank = m => (m.parent && idx.has(m.parent)) ? idx.get(m.parent) : selfRank(m);
  menuData.sort((a,b)=>{
    const d = groupRank(a) - groupRank(b);
    if (d !== 0) return d;
    if (a.parent && b.parent) return selfRank(a) - selfRank(b);
    return 0;
  });
}
function currentActiveKey(){
  const hash = location.hash.replace(/^#\//,'')||'';
  const [mkey,sub]=hash.split('/');
  const ds = DIRECT_SUBS.find(d=>d.mod===mkey && d.sub===sub);
  return ds?ds.key:mkey;
}
let dragKey=null;
function attachDrag(item, m){
  if (READONLY) return;
  item.addEventListener('dragstart', e=>{ dragKey=m.key; item.classList.add('dragging'); e.dataTransfer.effectAllowed='copyMove'; try{e.dataTransfer.setData('text/plain',m.key);}catch(_){}
    if (m.mod && m.sub) { try { e.dataTransfer.setData('application/json', JSON.stringify({ mod:m.mod, sub:m.sub, icon:m.icon, title:getNameOverride(m.key,m.name) })); } catch(_){} }
  });
  item.addEventListener('dragend', ()=>{ item.classList.remove('dragging'); dragKey=null; $$('#menu .menu-item').forEach(it=>it.classList.remove('drag-over')); });
  item.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; if(dragKey && dragKey!==m.key) item.classList.add('drag-over'); });
  item.addEventListener('dragleave', ()=> item.classList.remove('drag-over'));
  item.addEventListener('drop', e=>{ e.preventDefault(); item.classList.remove('drag-over'); if(dragKey && dragKey!==m.key) reorderMenu(dragKey, m.key); });
}
function reorderMenu(fromKey, toKey){
  const from = menuData.findIndex(m=>m.key===fromKey);
  const to = menuData.findIndex(m=>m.key===toKey);
  if(from<0||to<0) return;
  const [moved]=menuData.splice(from,1);
  menuData.splice(to,0,moved);
  saveMenuOrder();
  buildMenu();
}

// ===== 我的快捷（从任意功能方块拖入，常驻左侧）=====
const PIN_KEY = 'atelier_pins_v1';
function loadPins(){ try { return JSON.parse(localStorage.getItem(PIN_KEY)||'[]'); } catch { return []; } }
function savePins(p){ try { localStorage.setItem(PIN_KEY, JSON.stringify(p)); } catch {} }
let _dragPin = -1;
function attachPinDrag(item, i){ if(READONLY) return;
  item.addEventListener('dragstart', e=>{ _dragPin=i; item.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain','pin'+i);}catch{} });
  item.addEventListener('dragend', ()=>{ item.classList.remove('dragging'); _dragPin=-1; });
  item.addEventListener('dragover', e=>{ e.preventDefault(); if(_dragPin>=0 && _dragPin!==i) item.classList.add('drag-over'); });
  item.addEventListener('dragleave', ()=> item.classList.remove('drag-over'));
  item.addEventListener('drop', e=>{ e.preventDefault(); item.classList.remove('drag-over');
    if (_dragPin>=0 && _dragPin!==i) { const a=loadPins(); const [m]=a.splice(_dragPin,1); a.splice(i,0,m); savePins(a); buildMenu(); }
  });
}
function buildPinZone(){
  const wrap = el('div',{class:'menu-pin-zone'});
  wrap.appendChild(el('div',{class:'menu-pin-label',text:'⭐ 我的快捷（拖功能或左侧菜单项到此）'}));
  const list = el('div',{class:'menu-pin-list'});
  loadPins().forEach((p,i)=>{
    const it = el('div',{class:'menu-item menu-pin',draggable:!READONLY,onclick:()=>{ location.hash='#/'+p.mod+'/'+p.sub; }},[
      el('div',{class:'mi-ico',html:p.icon||'📌'}),
      el('div',{class:'mi-label',text:p.title}),
      renameBtn('pin_'+i, p.title, (newName)=>{ const a=loadPins(); a[i].title=newName; savePins(a); buildMenu(); }, '快捷名称'),
      el('button',{class:'pin-del',title:'移除',onclick:(e)=>{ e.stopPropagation(); const a=loadPins(); a.splice(i,1); savePins(a); buildMenu(); }},'✕')
    ]);
    attachPinDrag(it, i);
    list.appendChild(it);
  });
  wrap.appendChild(list);
  // 接收功能方块拖入
  wrap.addEventListener('dragover', e=>{ e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='copy'; wrap.classList.add('pin-drop'); });
  wrap.addEventListener('dragleave', ()=> wrap.classList.remove('pin-drop'));
  wrap.addEventListener('drop', e=>{ if(READONLY) return; e.preventDefault(); e.stopPropagation(); wrap.classList.remove('pin-drop');
    try { const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data && data.mod && data.sub) { const a=loadPins(); if(!a.some(x=>x.mod===data.mod && x.sub===data.sub)) a.push(data); savePins(a); buildMenu(); toast('已置顶到「我的快捷」','ok'); }
    } catch(_) {}
  });
  return wrap;
}

function renderMenuItem(m, level, activeKey, parentKey){
  const name = getNameOverride(m.key, m.name);
  const icon = getIconOverride(m.key, m.icon);
  const kids = [ el('div',{class:'mi-ico',html:icon}), el('div',{class:'mi-label',text:name}) ];
  if (m.custom){
    kids.push(el('button',{class:'pin-del',title:'删除这个入口',onclick:(e)=>{
      e.stopPropagation();
      if(!confirm('删除入口「'+name+'」？')) return;
      saveCustomEntries(loadCustomEntries().filter(x=>x.key!==m.key));
      buildMenu(); toast('已删除','ok');
    }},'✕'));
  } else {
    kids.push(renameBtn(m.key, name, ()=>{ buildMenu(); renderRoute(); }, '菜单名称'));
    if(!READONLY){
      kids.push(el('button',{class:'icon-edit-btn',title:'改图标',html:'🎨',onclick:(e)=>{
        e.stopPropagation();
        openIconPicker(m.key, icon, (nv)=>{ setIconOverride(m.key, nv); buildMenu(); });
      }}));
    }
  }
  const item = el('div',{
    class:'menu-item'+(level?' menu-sub':'')+(m.key===activeKey?' active':''),
    'data-key':m.key, draggable:(!READONLY && !m.custom),
    onclick:()=>goMenu(m)
  }, kids);
  if(!READONLY) attachDrag(item, m);
  return item;
}

// ===== 图标选择器（用于自定义菜单 / 入口图标）=====
const ICON_PRESETS = ['📝','📅','💰','💡','🤝','🎨','📌','⭐','🔥','🌟','💎','🚀','📚','🎯','🍎','🏃','💪','🧘','🎵','📷','🌈','☕','🍵','🐱','🌸','❤️','✨','🔔','📦','🗂️','🧩','🛠️','📊','🗒️','🔖','🏷️','🌐','📱','💻','🎮'];
function openIconPicker(key, cur, onPick){
  const wrap = el('div',{});
  const grid = el('div',{class:'icon-picker'});
  ICON_PRESETS.forEach(ic=>{
    grid.appendChild(el('button',{class: ic===cur?'on':'', html:ic, onclick:()=>{ onPick(ic); modal.close(); toast('图标已更新','ok'); }}));
  });
  wrap.appendChild(grid);
  modal.open('🎨 选择图标', wrap);
}

function openAddEntry(){
  const nameI = el('input',{class:'input',placeholder:'名称，如：知乎 / 我的博客'});
  const iconI = el('input',{class:'input',value:'🔗',placeholder:'图标 emoji'});
  const urlI  = el('input',{class:'input',placeholder:'网址，如 https://www.zhihu.com'});
  const saveBtn = el('button',{class:'btn btn-primary',onclick:()=>{
    const n=nameI.value.trim(), u=urlI.value.trim();
    if(!n){ toast('先填名称','err'); return; }
    if(!u){ toast('先填网址','err'); return; }
    let url=u; if(!/^https?:\/\//i.test(url)) url='https://'+url;
    const a=loadCustomEntries();
    a.push({ key:'cus_'+Date.now().toString(36), name:n, icon:iconI.value.trim()||'🔗', url, custom:true, parent:'tools' });
    saveCustomEntries(a); modal.close(); buildMenu(); toast('已添加到侧边栏','ok');
  }},'添加');
  modal.open('➕ 添加入口 / 收藏网页', el('div',{},[
    el('div',{class:'field'},[el('label',{text:'名称'}),nameI]),
    el('div',{class:'field'},[el('label',{text:'图标（emoji）'}),iconI]),
    el('div',{class:'field'},[el('label',{text:'网址'}),urlI]),
    el('div',{class:'muted',style:'font-size:12px;margin-top:4px;line-height:1.6'},'添加后会出现在左侧「快捷工具」下方，点击直接打开网页；也可以在「快捷工具 → 网页收藏馆」里分类管理。'),
    el('div',{class:'row',style:'gap:8px;margin-top:8px'},[saveBtn, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])
  ]));
}

function buildMenu() {
  const menu = $('#menu'); menu.innerHTML='';
  const activeKey = currentActiveKey();
  menu.appendChild(buildPinZone());
  // 自定义入口并入 menuData（只并入尚未存在的）
  const customs = loadCustomEntries();
  customs.forEach(c=>{ if(!menuData.some(m=>m.key===c.key)) menuData.push(Object.assign({parent:'tools'},c)); });
  menuData = menuData.filter(m=>m.custom ? customs.some(c=>c.key===m.key) : true);
  // 按 parent 分组渲染：一级 + 缩进子项
  menuData.filter(m=>!m.parent).forEach(p=>{
    menu.appendChild(renderMenuItem(p, 0, activeKey));
    menuData.filter(c=>c.parent===p.key).forEach(c=> menu.appendChild(renderMenuItem(c, 1, activeKey, p.key)));
  });
  // 添加入口（在回收站上方）
  if(!READONLY){
    menu.appendChild(el('div',{class:'menu-add',onclick:openAddEntry},'➕ 添加入口 / 收藏网页'));
    menu.appendChild(el('div',{class:'menu-item',onclick:openTrash},[el('div',{class:'mi-ico',html:'🗑'}),el('div',{class:'mi-label',text:'回收站'})]));
    menu.appendChild(el('div',{class:'menu-item',onclick:openDataManage},[el('div',{class:'mi-ico',html:'📦'}),el('div',{class:'mi-label',text:'数据管理'})]));
    menu.appendChild(el('div',{class:'menu-item',onclick:openSettings},[el('div',{class:'mi-ico',html:'⚙️'}),el('div',{class:'mi-label',text:'设置'})]));
  }
  // 恢复默认顺序
  if(!READONLY) menu.appendChild(el('div',{class:'menu-reset',onclick:()=>{ localStorage.removeItem(MENU_ORDER_KEY); buildMenu(); renderRoute(); toast('已恢复默认菜单顺序','ok'); }},'↺ 恢复默认顺序'));
}

function setActive(key){
  $$('#menu .menu-item').forEach(it=>it.classList.toggle('active', it.dataset.key===key));
}
function navigate(key){ location.hash = '#/'+key; }
function navigateSub(key,sub){ location.hash = '#/'+key+'/'+sub; }

const content = () => $('#content');

// 顶部路由进度条
function startRouteProgress(){ const p=$('#routeProgress'); if(p){ p.classList.add('on'); p.style.transition='none'; p.style.width='18%'; requestAnimationFrame(()=>{ if(p){ p.style.transition=''; p.style.width='72%'; } }); } }
function endRouteProgress(){ const p=$('#routeProgress'); if(p){ p.style.width='100%'; setTimeout(()=>{ if(p){ p.classList.remove('on'); p.style.width='0'; } }, 220); } }

async function renderRoute(){
  const hash = location.hash.replace(/^#\//,'') || '';
  const [mkey, sub] = hash.split('/');
  const isMine = mkey === 'mine';
  const mod = MODULES.find(m=>m.meta.key===mkey) || MODULES[0];
  const ds = DIRECT_SUBS.find(d=>d.mod===mod.meta.key && d.sub===sub);
  setActive(isMine ? 'mine' : (ds ? ds.key : mod.meta.key));
  const root = content(); root.innerHTML='';
  // 骨架屏覆盖层：挂到 .main，避免被视图内部 root.innerHTML='' 误删
  const overlay = skeleton(); overlay.classList.add('sk-overlay');
  document.querySelector('.main')?.appendChild(overlay);
  startRouteProgress();
  try {
    if (isMine) {
      $('#pageTitle').textContent = '我的工作台';
      await mineView(root);
    } else if (sub && mod.subs && mod.subs[sub]) {
      $('#pageTitle').textContent = ds ? getNameOverride(ds.key, ds.name) : mod.meta.name;
      await mod.subs[sub](root, ()=>navigate(mod.meta.key));
    } else {
      $('#pageTitle').textContent = getNameOverride(mod.meta.key, mod.meta.name);
      await mod.render(root, (s)=>navigateSub(mod.meta.key, s));
    }
  } catch(e){ console.error('[renderRoute]', e); }
  finally {
    overlay.remove();
    endRouteProgress();
  }
  if (READONLY) root.insertBefore(el('div',{class:'readonly-banner'},'🔒 只读分享模式 · 本页仅供查看，不可修改'), root.firstChild);
  // 顶部 AI 状态提示条（替换原方块上的 🤖 入口）
  root.insertBefore(aiStatusBanner(), root.firstChild);
  // 关闭移动端抽屉
  document.getElementById('app').classList.remove('nav-open');
  window.scrollTo(0,0);
  // 给本页所有标题补上改名能力（异步渲染出来的再补扫两次）
  enhanceTitles(root);
  setTimeout(()=>enhanceTitles(root), 300);
  setTimeout(()=>enhanceTitles(root), 1200);
}

// ===== 我的首页（聚合仪表盘）=====
async function mineView(root){
  root.appendChild(secTitle('🏠','我的工作台','数据一览 · 常用入口 · 最近动态'));
  const all = await allRecords();
  const byMod = {};
  all.forEach(r=>{ const k=r.module||'other'; (byMod[k]=byMod[k]||[]).push(r); });
  const NAMES = { daily:'日常规划', tools:'快捷工具', life:'生活锻炼', finance:'资产记账', growth:'技能审美', creator:'自媒体创作', aiedit:'AI剪辑工坊', eq:'话术', phrases:'话术', outfit:'穿搭', work:'作品', account:'账号', material:'素材', memo:'备忘', mood:'心情' };
  const grid = el('div',{class:'mine-grid'});
  const keys = Object.keys(byMod).sort();
  if(!keys.length){ grid.appendChild(el('div',{class:'muted',text:'还没有数据，去各模块添加点内容吧～'})); }
  keys.forEach(k=>{
    grid.appendChild(el('div',{class:'mine-stat'},[
      el('div',{class:'ms-num',text:String(byMod[k].length)}),
      el('div',{class:'ms-label',text:NAMES[k]||k})
    ]));
  });
  root.appendChild(grid);

  root.appendChild(secTitle('⚡','快速入口','点击直达'));
  const quick = [
    {icon:'📝',label:'写笔记',mod:'daily',sub:'memo'},
    {icon:'💰',label:'记一笔',mod:'finance',sub:'ledger'},
    {icon:'💡',label:'灵感',mod:'tools',sub:'idea'},
    {icon:'🤝',label:'高情商话术',mod:'growth',sub:'eq'},
    {icon:'🎨',label:'创作中心',mod:'creator',sub:'work'}
  ];
  const qg = el('div',{class:'mine-quick'});
  quick.forEach(q=>qg.appendChild(el('button',{class:'mine-qbtn',onclick:()=>{ location.hash='#/'+q.mod+'/'+(q.sub||''); }},[
    el('div',{class:'mq-ico',html:q.icon}), el('div',{class:'mq-label',text:q.label})
  ])));
  root.appendChild(qg);

  root.appendChild(secTitle('🕑','最近更新','最近添加 / 修改的内容'));
  const recent = all.slice().sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,8);
  const list = el('div',{class:'list'});
  if(!recent.length){ list.appendChild(el('div',{class:'muted',text:'暂无记录'})); }
  recent.forEach(r=>{
    const title = r.title || (r.text? r.text.slice(0,28) : (r.body? r.body.slice(0,28) : '(无标题)'));
    list.appendChild(el('div',{class:'item'},[
      el('div',{class:'it-ico',html:moduleIcon(r.module)}),
      el('div',{class:'it-body'},[el('div',{class:'it-title',text:title}),el('div',{class:'it-meta',text:(NAMES[r.module]||r.module)+' · '+relTime(r.updated)})])
    ]));
  });
  root.appendChild(list);
}

// ===== 顶部：天气 / 通知 / 搜索 =====
async function refreshWeather(){
  try{ const w = await getWeather(); const cur = w.current;
    const codeMap={0:'☀️',1:'🌤',2:'⛅️',3:'☁️',45:'🌫',61:'🌧',80:'🌦',95:'⛈'};
    const icon = codeMap[cur.weather_code]||'🌤';
    $('#weatherBadge').textContent = icon;
    $('#weatherTitle')?.remove();
    $('#weatherBadge').title = `气温 ${cur.temperature_2m}° · 湿度 ${cur.relative_humidity_2m}%`;
    $('#weatherBadge').onclick = ()=> toast(`${icon} ${cur.temperature_2m}° · 湿度${cur.relative_humidity_2m}%`, 'ok');
  }catch{ $('#weatherBadge').textContent='🌤'; }
}

function openSearch(){
  const body = el('div',{});
  const input = el('input',{class:'input',placeholder:'搜索全部模块内容…'});
  const results = el('div',{class:'list',style:'margin-top:12px'});
  input.oninput = debounceInput(async()=>{ results.innerHTML=''; if(!input.value.trim())return;
    const items = await globalSearch(input.value.trim());
    if(!items.length){ results.appendChild(emptyState({ icon:'🔍', title:'没有找到相关内容', sub:'换个关键词试试' })); return; }
    items.forEach(r=>results.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:moduleIcon(r.module)}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:(r.title||'(无标题)')}),el('div',{class:'it-meta',html:relTime(r.updated)+' · '+escapeHtml((r.body||'').slice(0,40))})])])));
  });
  body.append(input, results);
  modal.open('🔎 全局搜索', body); input.focus();
}
function debounceInput(fn){ return debounce(fn, 250); }
function moduleIcon(m){ const f=MODULES.find(x=>x.meta.key===m); return f?f.meta.icon:'📌'; }

// ===== 回收站 =====
async function openTrash(){ if(READONLY){ toast('只读分享模式，不可修改','err'); return; }
  const rows = await trashList();
  const body = el('div',{});
  if(!rows.length){ body.appendChild(emptyState({ icon:'🗑️', title:'回收站是空的', sub:'被删除的内容会在 30 天后自动清除' })); }
  else {
    const list = el('div',{class:'list'});
    rows.forEach(r=>{ const d = r.purgeAt? Math.ceil((r.purgeAt-Date.now())/86400000):0;
      list.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:moduleIcon(r.module)}),
        el('div',{class:'it-body'},[el('div',{class:'it-title',text:(r.title||'(无标题)')}),el('div',{class:'it-meta',text:'删除于 '+fmtDate(r.deletedAt)+' · '+d+'天后清除'})]),
        el('div',{class:'it-actions'},[
          el('button',{class:'mini-btn',title:'恢复',onclick:async()=>{await restore(r.id);toast('已恢复','ok');openTrash();}},'♻️'),
          el('button',{class:'mini-btn',title:'彻底删除',onclick:async()=>{if(confirm('彻底删除且不可恢复？')){await hardDelete(r.id);toast('已删除');openTrash();}}},'🗑')
        ])
      ]));
    });
    body.appendChild(list);
  }
  modal.open('🗑 回收站（30天）', body);
}

// ===== 数据管理（导出 / 导入）=====
async function openDataManage(){
  if(READONLY){ toast('只读分享模式，不可修改','err'); return; }
  const body = el('div',{});
  body.appendChild(el('div',{class:'muted',style:'font-size:12px;margin-bottom:12px'},'把当前设备的数据导出成 JSON 备份；换设备或清缓存后，用「导入 JSON」恢复。注意：工作台名、菜单与标题改名不随此备份迁移，需重新设置。'));
  body.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-bottom:12px'},[
    el('button',{class:'btn btn-soft btn-sm',onclick:exportAll},'⬇ 全量导出 JSON'),
    el('button',{class:'btn btn-soft btn-sm',onclick:importAll},'⬆ 导入 JSON')
  ]));
  const info = el('div',{class:'muted',style:'font-size:12px'},'存储占用计算中…');
  body.appendChild(info);
  modal.open('📦 数据管理', body);
  const s = await storageInfo(); const mb=(s.bytes/1048576).toFixed(2);
  info.textContent = `记录 ${s.records} 条 · 文件 ${s.files} 个 · 约 ${mb}MB（IndexedDB）`;
}

// ===== AI 配置卡片（设置页与全局弹窗复用）=====
async function aiConfigCard(){
  const aiCfg = await getAIConfig();
  const aiOn = el('input',{type:'checkbox',checked:aiCfg.enabled});
  const aiBase = el('input',{class:'input',value:aiCfg.base||'',placeholder:'https://api.openai.com/v1'});
  const aiKey = el('input',{class:'input',type:'password',value:aiCfg.key||'',placeholder:'sk-...（仅存本机）'});
  const aiModel = el('input',{class:'input',value:aiCfg.model||'gpt-4o-mini',placeholder:'gpt-4o-mini'});
  const aiPresets = [
    { name:'自定义 / 其它', base:'', model:'' },
    { name:'OpenAI', base:'https://api.openai.com/v1', model:'gpt-4o-mini' },
    { name:'DeepSeek 深度求索', base:'https://api.deepseek.com/v1', model:'deepseek-chat' },
    { name:'豆包 (火山方舟)', base:'https://ark.cn-beijing.volces.com/api/v3', model:'doubao-seed-1.6-250615' },
    { name:'Kimi 月之暗面', base:'https://api.moonshot.cn/v1', model:'moonshot-v1-8k' },
    { name:'通义千问 (阿里)', base:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-plus' },
    { name:'智谱 GLM', base:'https://open.bigmodel.cn/api/paas/v4', model:'glm-4-flash' },
    { name:'本地 Ollama', base:'http://localhost:11434/v1', model:'llama3' },
  ];
  const aiPreset = el('select',{class:'input'});
  aiPresets.forEach(p=>aiPreset.appendChild(el('option',{value:p.name,text:p.name})));
  aiPreset.value = aiPresets.find(p=>p.base && p.base===aiCfg.base)?.name || '自定义 / 其它';
  const customHint = el('div',{class:'muted',style:'font-size:12px;color:var(--primary);display:'+(aiPreset.value==='自定义 / 其它'?'block':'none')},'已选「自定义」：把 Base URL 填成任意 OpenAI 兼容地址（例如 https://your-proxy.example.com/v1 或本地 http://localhost:8000/v1）+ 你的 Key + 模型名，即可对接自有 / 第三方大模型。');
  aiPreset.onchange = ()=>{ const p=aiPresets.find(x=>x.name===aiPreset.value); if(p&&p.base){ aiBase.value=p.base; aiModel.value=p.model||aiModel.value; customHint.style.display='none'; } else { aiBase.value=''; aiBase.focus(); customHint.style.display='block'; } };
  const aiStatus = el('div',{class:'muted',style:'font-size:12px;margin-top:6px'}, aiCfg.enabled&&aiCfg.base&&aiCfg.key?'✅ 已启用 AI 大模型':'⚠️ 未绑定，智能功能将使用内置本地生成');
  const saveAi = async () => {
    await saveAIConfig({ enabled:aiOn.checked, base:aiBase.value.trim(), key:aiKey.value.trim(), model:aiModel.value.trim()||'gpt-4o-mini' });
    aiStatus.textContent='✅ 已保存'; toast('AI 配置已保存','ok');
  };
  const testBtn = el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{
    testBtn.disabled=true; testBtn.textContent='测试中…';
    const r = await testAI();
    testBtn.disabled=false; testBtn.textContent='测试连接';
    aiStatus.textContent = r.ok? ('✅ 连接成功：'+r.reply) : ('❌ 失败：'+r.error);
  }},'测试连接');
  return [
    el('div',{class:'field'},[el('label',{text:'启用 AI'}), el('div',{class:'row',style:'gap:8px'},[aiOn, aiStatus])]),
    el('div',{class:'field'},[el('label',{text:'服务类型（厂商）'}), aiPreset]),
    customHint,
    el('div',{class:'field'},[el('label',{text:'API 基址（Base URL）'}), aiBase]),
    el('div',{class:'field'},[el('label',{text:'API Key'}), aiKey]),
    el('div',{class:'field'},[el('label',{text:'模型名'}), aiModel]),
    el('div',{class:'row wrap',style:'gap:8px;margin-top:4px'},[
      el('button',{class:'btn btn-primary btn-sm',onclick:saveAi},'保存 AI 配置'),
      testBtn
    ]),
    tip('先选「服务类型」可自动填好基址与模型；也支持任意其它 OpenAI 兼容接口（OpenAI / DeepSeek / 通义 / 智谱 / 本地 Ollama）。Key 仅存于本机 IndexedDB，不上传。绑定后「智能穿搭」「高情商话术」等会调用真实大模型生成。'),
  ];
}

// 全局弹窗：任意界面顶部点 🤖 即可打开
function openAiPanel(){ if(READONLY){ toast('只读分享模式，不可修改','err'); return; }
  (async()=>{ const card = await aiConfigCard(); modal.open('🤖 AI 大模型 · 选择服务', el('div',{}, card)); })();
}

// ===== 设置 =====
async function openSettings(){ if(READONLY){ toast('只读分享模式，不可修改','err'); return; }
  const reminders = await getReminders();
  const body = el('div',{});
  // 工作台名称
  const appNameI = el('input',{class:'input',value:getNameOverride('app','AI工作台'),placeholder:'我的智能工作台'});
  appNameI.onchange = async()=>{ setNameOverride('app', appNameI.value.trim()); applyAppName(); toast('工作台名称已更新','ok'); };
  body.appendChild(sec('🏷️ 工作台名称', [
    el('div',{class:'field'},[el('label',{text:'显示名称（侧边栏 / 浏览器标签）'}), appNameI]),
    tip('改名后侧边栏品牌、浏览器标签标题会立即更新；已安装到主屏的 PWA 需重装才能改主屏上的名字。'),
  ]));
  // 云端端点
  const cloudEp = await kvGet('cloud_endpoints')||{base:'',token:''};
  const stockEp = await kvGet('stock_endpoint')||'';
  const hotEp = await kvGet('hot_endpoint')||'';
  const novelEp = await kvGet('novel_endpoint')||'';
  body.appendChild(sec('☁️ 云端同步（双存储）', [
    tip('默认使用「本地云镜像」实现断网可用+联网汇总的双存储。如需自建 MySQL+OSS 后端，填写同步接口：'),
    field('同步接口 Base URL', cloudEp.base, 'cloud_base'),
    field('Token', cloudEp.token, 'cloud_token'),
  ]));
  body.appendChild(sec('🔌 数据接口', [
    field('股票行情接口', stockEp, 'stock_ep'),
    field('热点话题接口', hotEp, 'hot_ep'),
    field('小说检索接口', novelEp, 'novel_ep'),
    tip('留空则使用内置演示数据（已标注来源）。所有接口需支持 CORS。'),
  ]));
  // AI 大模型绑定（驱动智能穿搭 / 话术 / 创作）—— 复用全局配置卡片
  body.appendChild(sec('🤖 AI 大模型（智能穿搭 / 话术 / 创作）', await aiConfigCard()));
  body.appendChild(sec('🔔 全局提醒', [
    ...Object.entries(reminders).map(([k,cfg])=>{
      const on = el('input',{type:'checkbox',checked:cfg.on}); on.onchange=()=>{ reminders[k].on=on.checked; };
      const times = el('input',{class:'input',value:cfg.times.join(', '),style:'max-width:240px'});
      times.onchange=()=>{ reminders[k].times=times.value.split(',').map(s=>s.trim()).filter(Boolean); };
      return el('div',{class:'reminder-row',style:'margin-bottom:8px'},[ el('div',{class:'rr-ico',html:cfg.icon}), el('div',{class:'it-body grow'},[el('div',{class:'it-title',text:cfg.label}),times]), on ]);
    }),
    el('button',{class:'btn btn-primary btn-sm',onclick:async()=>{ await saveReminders(reminders); await requestPermission(); toast('提醒设置已保存','ok'); }},'保存提醒')
  ]));
  body.appendChild(sec('📦 数据管理', [
    el('div',{class:'row wrap',style:'gap:8px'},[
      el('button',{class:'btn btn-soft btn-sm',onclick:exportAll},'⬇ 全量导出 JSON'),
      el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{ if(confirm('将执行一次每日快照')){await import('./core/sync.js').then(s=>s.dailySnapshot());toast('快照完成','ok');} }},'📸 立即快照'),
      el('button',{class:'btn btn-soft btn-sm',onclick:syncNow},'🔄 立即同步'),
      el('button',{class:'btn btn-soft btn-sm',onclick:importAll},'⬆ 导入 JSON'),
    ]),
    el('div',{class:'muted',style:'font-size:12px;margin-top:8px',id:'storageInfo'},'存储占用计算中…')
  ]));
  modal.open('⚙️ 设置', body);
  updateStorage();
}
function sec(title, children){ return el('div',{class:'card',style:'margin-bottom:14px'},[el('h4',{text:title,style:'margin:0 0 10px'}), ...children]); }
function field(label,val,id){ return el('div',{class:'field'},[el('label',{text:label}), (()=>{ const i=el('input',{class:'input',value:val||'',id}); i.onchange=async()=>{ await saveField(id,i.value); }; return i; })()]); }
async function saveField(id,val){
  const map={'cloud_base':async v=>{const e=await kvGet('cloud_endpoints')||{};e.base=v;await kvSet('cloud_endpoints',e);},'cloud_token':async v=>{const e=await kvGet('cloud_endpoints')||{};e.token=v;await kvSet('cloud_endpoints',e);},'stock_ep':v=>kvSet('stock_endpoint',v),'hot_ep':v=>kvSet('hot_endpoint',v),'novel_ep':v=>kvSet('novel_endpoint',v),'llm_ep':v=>kvSet('llm_endpoint',v)};
  await map[id](val); toast('已保存','ok');
}
function tip(t){ return el('div',{class:'muted',style:'font-size:13px;margin-bottom:8px',text:t}); }
async function exportAll(){ const recs=await allRecords(); download(new Blob([JSON.stringify(recs,null,2)],{type:'application/json'}),'工作台全量备份_'+fmtDate(Date.now())+'.json'); toast('已导出','ok'); }
async function importAll(){ const i=el('input',{type:'file',accept:'.json'}); i.onchange=async()=>{ const txt=await i.files[0].text(); try{ const arr=JSON.parse(txt); for(const r of arr){ await import('./core/db.js').then(d=>d.putRecord(r)); } toast('导入 '+arr.length+' 条','ok'); }catch(e){ toast('导入失败','err'); } }; i.click(); }
async function updateStorage(){ const s=await storageInfo(); const mb=(s.bytes/1048576).toFixed(2); $('#storageInfo').textContent=`记录 ${s.records} 条 · 文件 ${s.files} 个 · 约 ${mb}MB（IndexedDB）`; }

// ===== 安装 PWA =====
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').style.display='inline-flex'; });
$('#installBtn')?.addEventListener('click',async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').style.display='none'; } });
window.addEventListener('appinstalled',()=>{ $('#installBtn').style.display='none'; toast('已安装到主屏 🎉','ok'); });

// ===== 顶部事件 =====
$('#menuToggle')?.addEventListener('click',()=>document.getElementById('app').classList.toggle('nav-open'));
$('#overlay')?.addEventListener('click',()=>document.getElementById('app').classList.remove('nav-open'));
$('#globalSearch')?.addEventListener('focus', openSearch);
$('#globalSearch')?.addEventListener('click', openSearch);
$('#notifBadge')?.addEventListener('click', async()=>{ await requestPermission(); toast('提醒已开启','ok'); });
$('#settingsBtn')?.addEventListener('click', openSettings);
$('#aiBtn')?.addEventListener('click', openAiPanel);
$('#brandRename')?.addEventListener('click', ()=>{
  const input = el('input',{class:'input',value:getNameOverride('app','AI工作台')});
  const save = el('button',{class:'btn btn-primary',onclick:()=>{ const v=input.value.trim(); if(v){ setNameOverride('app', v); applyAppName(); } modal.close(); toast('工作台名称已更新','ok'); }},'保存');
  modal.open('✎ 重命名工作台', el('div',{},[ el('div',{class:'field'},[el('label',{text:'新名称'}), input]), el('div',{class:'row',style:'gap:8px;margin-top:8px'},[save, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')]) ]));
  input.focus(); input.select();
});
document.addEventListener('open-ai-panel', openAiPanel);
$('.modal-close')?.addEventListener('click',()=>modal.close());
$('.modal-backdrop')?.addEventListener('click',()=>modal.close());
$('.drawer-close')?.addEventListener('click',()=>drawer.close());
$('.drawer-backdrop')?.addEventListener('click',()=>drawer.close());
window.addEventListener('hashchange', renderRoute);

// 侧边栏工作台名「✎」改名
$('#brandRename')?.addEventListener('click', ()=>{ if(READONLY){ toast('只读分享模式，不可修改','err'); return; } const input=el('input',{class:'input',value:getNameOverride('app','AI工作台')}); const save=el('button',{class:'btn btn-primary',onclick:()=>{ const v=input.value.trim(); if(!v){toast('名称不能为空','err');return;} setNameOverride('app', v); applyAppName(); modal.close(); toast('工作台名称已更新','ok'); }},'保存'); modal.open('🏷️ 重命名工作台', el('div',{},[el('div',{class:'field'},[el('label',{text:'新名称'}),input]),el('div',{class:'row',style:'gap:8px;margin-top:8px'},[save, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])])); input.focus(); input.select(); });

// 同步状态条
import { onSyncStatus } from './core/sync.js';
onSyncStatus((txt)=>{ const s=$('#syncStatus'); if(s) s.textContent=txt; });

// ===== 全局错误兜底（避免静默白屏）=====
window.addEventListener('error', (e)=>{ console.error('[error]', e.error||e.message); toast('出错了：'+(e.message||'未知错误'),'err'); });
window.addEventListener('unhandledrejection', (e)=>{ console.error('[unhandled]', e.reason); toast('操作失败：'+((e.reason&&e.reason.message)||'未知错误'),'err'); });

// ===== 新版本提示（部署后用户可一键刷新到最新版）=====
function showUpdateToast(){
  const t = $('#toast');
  t.innerHTML = '';
  t.appendChild(el('span',{},'🎉 发现新版本，已就绪'));
  t.appendChild(el('button',{class:'toast-btn',onclick:()=>{
    const c = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (c) c.postMessage('skipWaiting'); else location.reload();
  }},'立即刷新'));
  t.className = 'toast show update';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 9000);
}

// ===== 离线状态横幅 =====
function setOffline(on){
  let bar = document.getElementById('offlineBar');
  if (on && !bar){
    bar = el('div',{id:'offlineBar',class:'offline-bar'},'📴 当前离线 · 正在使用本地缓存');
    document.body.prepend(bar);
  } else if (!on && bar){ bar.remove(); }
}
window.addEventListener('offline', ()=>setOffline(true));
window.addEventListener('online', ()=>{ setOffline(false); toast('已恢复联网','ok'); });
setOffline(!navigator.onLine);

// ===== 坏图兜底（任何图片加载失败自动换成占位图，避免裂图）=====
document.addEventListener('error',(e)=>{
  const t = e.target;
  if (t && t.tagName === 'IMG' && !t.dataset.bf){
    t.dataset.bf = '1';
    t.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#ffe3ec"/><text x="30" y="38" font-size="28" text-anchor="middle">🖼️</text></svg>');
  }
}, true);

// ===== 快捷键：/ 唤起全局搜索，Esc 关闭弹窗/抽屉 =====
document.addEventListener('keydown',(e)=>{
  if (e.key === 'Escape'){
    if ($('#modal').style.display === 'flex') modal.close();
    if ($('#drawer').style.display === 'flex') drawer.close();
    return;
  }
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'') && !document.activeElement?.isContentEditable){
    e.preventDefault();
    const s = $('#globalSearch'); if (s){ s.focus(); }
  }
});

// ===== 主题（深色 / 浅色）=====
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  const b = document.getElementById('themeToggle');
  if (b) b.textContent = t==='dark' ? '☀️' : '🌙';
  try { localStorage.setItem('atelier_theme', t); } catch(_){}
}
function toggleTheme(){
  const cur = document.documentElement.dataset.theme==='dark' ? 'light' : 'dark';
  applyTheme(cur);
}
function initTheme(){
  let t; try { t = localStorage.getItem('atelier_theme'); } catch(_){}
  if (!t) { try { t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch(_){ t='light'; } }
  applyTheme(t);
  const btn = document.getElementById('themeToggle');
  if (btn && !btn._themed) { btn._themed = true; btn.addEventListener('click', toggleTheme); }
}

// ===== 启动 =====
(async()=>{
  await openDB();
  applyMenuOrder();
  buildMenu();
  applyAppName();
  initTheme();
  initSync();
  initReminders();
  refreshWeather();
  setInterval(refreshWeather, 600000); // 天气 10min
  renderRoute();
  toast('欢迎回来 🌸 数据已本地加载','ok');
  // 注册 Service Worker（离线缓存 / 类原生体验 + 新版本提示）
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js');
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return; refreshing = true; location.reload();
      });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast();
        });
      });
    } catch(e){}
  }
})();
