// ===== 通用集合组件：列表/搜索/时间筛选/导出/编辑 =====
import { $, el, uid, now, fmtDate, fmtDateTime, relTime, toast, download, modal, escapeHtml } from './utils.js';
import { putRecord, recordsByModule, recordsBySub, softDelete, getRecord, allRecords } from './db.js';
import { recordChange } from './sync.js';
import { aiItemActions, imagePicker, attachFile, fileURL, buildAIContext, favoriteBtn, importBox, applyImport, renderImport } from './lib.js';

// schema: { module, sub, title:'', fields:[{key,label,type,options?,placeholder?}], itemRender?, empty? }
// types: text|textarea|number|date|select|tags|color
export function Collection(container, schema) {
  const wrap = el('div',{class:'collection'});
  let searchQ = '';
  let dateFrom = '', dateTo = '';
  let curCat = '全部';
  let list = [];
  let aiCtx = '';

  const searchBox = el('div',{class:'search-box',style:'max-width:none;margin-bottom:10px'},[
    el('span',{html:'🔎'}),
    el('input',{class:'',placeholder:'搜索本类…',oninput:e=>{ searchQ=e.target.value; renderList(); }})
  ]);
  const chips = el('div',{class:'chips',style:'margin-bottom:12px'});
  const filterRow = el('div',{class:'row wrap',style:'gap:8px;margin-bottom:14px'},[
    el('input',{class:'input',type:'date',style:'max-width:160px',onchange:e=>{dateFrom=e.target.value;renderList();},placeholder:'起始'}),
    el('input',{class:'input',type:'date',style:'max-width:160px',onchange:e=>{dateTo=e.target.value;renderList();},placeholder:'结束'}),
    el('button',{class:'btn btn-soft btn-sm',onclick:()=>exportJSON()},'⬇ 导出'),
    el('span',{class:'grow'}),
    el('button',{class:'btn btn-primary btn-sm',onclick:()=>openEditor(null)},'＋ 新建')
  ]);
  const listBox = el('div',{class:'list'});
  wrap.append(searchBox, chips, filterRow, listBox);

  async function load() {
    list = await recordsBySub(schema.module, schema.sub);
    aiCtx = await buildAIContext(schema.module, schema.sub);
    renderList();
  }
  function filtered() {
    return list.filter(r=>{
      if (curCat!=='全部' && (r.cat||'未分类')!==curCat) return false;
      if (searchQ) { const q=searchQ.toLowerCase(); const hay=(r.title+' '+(r.body||'')+' '+(r.tags||[]).join(' ')).toLowerCase(); if(!hay.includes(q)) return false; }
      if (dateFrom && r.created < new Date(dateFrom).getTime()) return false;
      if (dateTo && r.created > new Date(dateTo).getTime()+86400000) return false;
      return true;
    }).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0) || b.updated-a.updated);
  }
  function renderChips(){
    chips.innerHTML='';
    const set=new Set(['全部']); list.forEach(r=>set.add(r.cat||'未分类'));
    [...set].forEach(c=>chips.appendChild(el('button',{class:'chip'+(c===curCat?' chip-on':''),onclick:()=>{curCat=c;renderList();}} , c)));
  }
  async function renderList() {
    renderChips();
    listBox.innerHTML='';
    const items = filtered();
    if (!items.length) { listBox.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🌱'}),el('div',{text:schema.empty||'还没有内容，点「新建」开始'})])); return; }
    for (const r of items) {
      const node = schema.itemRender ? schema.itemRender(r, {edit:()=>openEditor(r), del:()=>doDelete(r)}) :
        await defaultItem(r);
      const acts = node.querySelector('.it-actions');
      if (acts) {
        const ai = await aiItemActions({ title:r.title||'', body:r.body||'', context:aiCtx, onApply:async(out,mode)=>{
          const upd={ ...r, body: mode==='generate'? out : (mode==='continue'? (r.body||'')+'\n'+out : out), updated:now() };
          await putRecord(upd); await recordChange(upd); load();
        }});
        ai.childNodes.forEach(n=>acts.appendChild(n));
      }
      listBox.appendChild(node);
    }
  }
  async function defaultItem(r) {
    const node = el('div',{class:'item'},[
      el('div',{class:'it-ico',html:schema.icon||'📌'}),
      el('div',{class:'it-body'},[
        el('div',{class:'it-title',text:r.title||'(无标题)'}),
        el('div',{class:'it-meta',html: relTime(r.updated) + (r.tags&&r.tags.length? ' · '+r.tags.map(t=>'#'+t).join(' '):'') + (r.body? ' · '+escapeHtml(r.body.slice(0,40)):'')})
      ]),
      el('div',{class:'it-actions'},[
        favoriteBtn(r, load),
        el('button',{class:'mini-btn',title:'编辑',onclick:()=>openEditor(r),html:'✏️'}),
        el('button',{class:'mini-btn',title:'删除',onclick:()=>doDelete(r),html:'🗑'})
      ])
    ]);
    const u = await fileURL(r.id);
    if (u) node.insertBefore(el('img',{src:u,class:'it-thumb'}), node.firstChild);
    const ip = await renderImport(r); if (ip) node.appendChild(ip);
    return node;
  }
  async function doDelete(r) {
    if (!confirm('确定删除「'+(r.title||'此项')+'」？将进入30天回收站')) return;
    await softDelete(r.id); await recordChange({...r,deleted:true});
    toast('已移入回收站','ok'); load();
  }
  function openEditor(rec) {
    const f = schema.fields;
    const vals = rec || {};
    const body = el('div',{});
    const inputs = {};
    f.forEach(field=>{
      const lab = el('label',{text:field.label});
      let inp;
      if (field.type==='textarea') inp = el('textarea',{class:'input',placeholder:field.placeholder||''});
      else if (field.type==='select') inp = el('select',{class:'input'});
      else if (field.type==='date') inp = el('input',{class:'input',type:'date'});
      else if (field.type==='number') inp = el('input',{class:'input',type:'number',step:field.step||'any'});
      else if (field.type==='image') inp = imagePicker(field.label||'图片');
      else inp = el('input',{class:'input',type:'text'});
      if (field.type==='select') { field.options.forEach(o=>inp.appendChild(el('option',{value:o.value,text:o.label}))); }
      if (rec) { inp.value = vals[field.key] ?? (field.type==='tags'?'':''); }
      if (field.type==='tags') {
        inp = el('input',{class:'input',placeholder:'用逗号分隔标签'});
        if (rec && vals[field.key]) inp.value = (vals[field.key]||[]).join(',');
      }
      inputs[field.key]=inp;
      body.appendChild(el('div',{class:'field'},[lab, inp]));
    });
    const catSel = el('select',{class:'input'});
    ['未分类','工作','生活','学习','娱乐','健康','灵感','其它'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
    if (rec && rec.cat) { if(![...catSel.options].some(o=>o.value===rec.cat)) catSel.appendChild(el('option',{value:rec.cat,text:rec.cat})); catSel.value=rec.cat; }
    body.appendChild(el('div',{class:'field'},[el('label',{text:'分类'}), catSel]));
    if (!rec) body.appendChild(el('div',{class:'field'},[el('label',{text:'标签(可选)'}), (()=>{ const t=el('input',{class:'input',placeholder:'逗号分隔'}); inputs._tags=t; return t; })()]));
    const impBox = importBox('📥 导入图片/视频/链接/文字(可选)');
    body.appendChild(el('div',{class:'field'},[el('label',{text:'导入内容(可选)'}), impBox]));
    body.appendChild(el('div',{class:'row',style:'margin-top:8px;gap:8px'},[
      el('button',{class:'btn btn-primary grow',      onclick:async()=>{
        const data={}; const imgBoxes=[];
        f.forEach(field=>{ const box=inputs[field.key];
          if (field.type==='image') { imgBoxes.push(box); return; }
          let v=box.value;
          if (field.type==='number') v=parseFloat(v)||0;
          if (field.type==='tags') v=(v||'').split(',').map(s=>s.trim()).filter(Boolean);
          data[field.key]=v; });
        data.cat = catSel.value || '未分类';
        if (inputs._tags && inputs._tags.value) data.tags=(inputs._tags.value||'').split(',').map(s=>s.trim()).filter(Boolean);
        const rec0 = rec || { id:uid(), module:schema.module, sub:schema.sub, created:now() };
        const saved = await putRecord({ ...rec0, ...data, updated:now() });
        await recordChange(saved);
        for (const b of imgBoxes){ if (b.getFiles && b.getFiles().length) for (const f of b.getFiles()) await attachFile(saved.id, f); }
        const imp = impBox.getValue();
        if (imp && imp.type) { const extra = await applyImport(saved.id, imp); if (extra){ if(extra.link) saved.link=extra.link; if(extra.importedText) saved.importedText=extra.importedText; await putRecord(saved); } }
        toast('已保存','ok'); modal.close(); load();
      }},'保存'),
      el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
    ]));
    modal.open(rec?'编辑':'新建 · '+(schema.title||''), body);
  }
  async function exportJSON() {
    const items = await recordsBySub(schema.module, schema.sub);
    const data = JSON.stringify(items, null, 2);
    download(new Blob([data],{type:'application/json'}), `${schema.sub}_${fmtDate(now())}.json`);
    toast('已导出 JSON','ok');
  }
  load();
  container.appendChild(wrap);
  return { reload:load, getList:()=>list };
}
