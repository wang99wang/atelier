// ===== 通用工具 =====
export const $ = (sel, root=document)=>root.querySelector(sel);
export const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));
export const el = (tag, attrs={}, children=[]) => {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k==='class') e.className=v;
    else if (k==='html') e.innerHTML=v;
    else if (k==='text') e.textContent=v;
    else if (k.startsWith('on') && typeof v==='function') e.addEventListener(k.slice(2), v);
    else if (v!==false && v!=null) e.setAttribute(k, v);
  }
  (Array.isArray(children)?children:[children]).forEach(c=>{
    if (c==null) return;
    e.appendChild(typeof c==='string'||typeof c==='number'?document.createTextNode(String(c)):c);
  });
  return e;
};
export const uid = () => 'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
// 列表项：图标 + 主体 + 操作区，避免深层嵌套括号
export const itemRow = (iconHtml, bodyEl, actionsEl) => el('div',{class:'item'},[
  el('div',{class:'it-ico',html:iconHtml}), bodyEl, actionsEl
]);
export const itBody = (titleNode, metaNode) => el('div',{class:'it-body'},[
  el('div',{class:'it-title'}, titleNode), el('div',{class:'it-meta'}, metaNode)
]);
export const itActions = (...btns) => el('div',{class:'it-actions'}, btns);
export const now = () => Date.now();
export const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
};
export const fmtDateTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const relTime = (ts) => {
  const diff = Date.now()-ts;
  const m = 60000, h=3600000, d=86400000;
  if (diff<m) return '刚刚';
  if (diff<h) return Math.floor(diff/m)+'分钟前';
  if (diff<d) return Math.floor(diff/h)+'小时前';
  if (diff<30*d) return Math.floor(diff/d)+'天前';
  return fmtDate(ts);
};
export const daysBetween = (a,b)=>Math.round((new Date(fmtDate(b)).getTime()-new Date(fmtDate(a)).getTime())/86400000);
export const escapeHtml = (s)=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const debounce = (fn,ms=300)=>{let t;return (...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};};
export const toast = (msg, type='') => {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show '+(type||'');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2600);
};
export const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = el('a',{href:url,download:name});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
};
export const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); toast('已复制','ok'); }
  catch { toast('复制失败','err'); }
};
// 简单模态
export const modal = {
  open(title, bodyNode){ $('#modalTitle').textContent=title; const b=$('#modalBody'); b.innerHTML=''; b.appendChild(bodyNode); $('#modal').style.display='flex'; },
  close(){ $('#modal').style.display='none'; }
};
export const drawer = {
  open(title, bodyNode){ $('#drawerTitle').textContent=title; const b=$('#drawerBody'); b.innerHTML=''; b.appendChild(bodyNode); $('#drawer').style.display='flex'; },
  close(){ $('#drawer').style.display='none'; }
};

// ===== 名称自定义（工作台名 / 菜单项 / 功能方块）=====
export const APP_NAME_KEY = 'atelier_app_name';
export const nameKey = (k)=> 'atelier_name_'+k;
export const getNameOverride = (k, fallback)=>{ try{ const v=localStorage.getItem(nameKey(k)); return v==null?fallback:v; }catch{ return fallback; } };
export const setNameOverride = (k, v)=>{ try{ if(v==null||String(v).trim()==='') localStorage.removeItem(nameKey(k)); else localStorage.setItem(nameKey(k), v); }catch{} };
// ===== 图标自定义（菜单项 / 快捷方式 / 主页方块）=====
export const iconKey = (k)=> 'atelier_icon_'+k;
export const getIconOverride = (k, fallback)=>{ try{ const v=localStorage.getItem(iconKey(k)); return v==null?fallback:v; }catch{ return fallback; } };
export const setIconOverride = (k, v)=>{ try{ if(v==null||String(v).trim()==='') localStorage.removeItem(iconKey(k)); else localStorage.setItem(iconKey(k), v); }catch{} };
// 应用工作台名称到品牌 / 浏览器标题 / 移动端标题
export function applyAppName(){
  const name = getNameOverride('app', 'AI工作台');
  const bt = document.querySelector('.brand-title'); if (bt) bt.textContent = name;
  document.title = name;
  const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]'); if (apple) apple.setAttribute('content', name);
  return name;
}
// 小铅笔改名按钮：点开弹窗输入新名，保存后回调 onSaved(newName)
export function renameBtn(k, current, onSaved, label='名称'){
  const btn = el('button',{class:'rename-btn',type:'button',title:'改名',html:'✎',onclick:(e)=>{
    e.stopPropagation(); e.preventDefault();
    const input = el('input',{class:'input',value:current||''});
    const save = el('button',{class:'btn btn-primary',onclick:()=>{ const v=input.value.trim(); setNameOverride(k, v); modal.close(); onSaved(v); }},'保存');
    const body = el('div',{},[
      el('div',{class:'field'},[el('label',{text:label}), input]),
      el('div',{class:'row',style:'gap:8px;margin-top:8px'},[save, el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])
    ]);
    modal.open('✎ 改名', body); input.focus(); input.select();
  }});
  // 阻止在按钮上发起拖拽，避免误触左侧排序 / 方块排序
  btn.addEventListener('mousedown', e=>e.stopPropagation());
  btn.addEventListener('dragstart', e=>e.stopPropagation());
  return btn;
}
export const fmtMoney = (n)=> (n<0?'-':'')+'¥'+Math.abs(n).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export const monthKey = (ts)=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
export const todayKey = ()=> fmtDate(Date.now());
export const ensureDir = async ()=>{};
