// 模块一：日常规划管理
import { el, uid, now, fmtDate, fmtDateTime, relTime, toast, modal, escapeHtml, copyText, download, itemRow, itBody, itActions } from '../core/utils.js';
import { putRecord, recordsBySub, getRecord, allRecords, softDelete } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, imagePicker, saveWithFiles, fileURL, listToolbar, aiItemActions, favoriteBtn, importBox, applyImport, renderImport } from '../core/lib.js';
import { getWeather } from '../core/data-services.js';
import { hasAI, callAI, parseAIJson, localOutfit, weatherText, detectOccasion } from '../core/ai.js';

const MODULE='daily';

export const meta = { key:'daily', name:'日常规划', icon:'🌞', color:'var(--yellow)', desc:'备忘录·心情' };

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('🌞','日常规划管理',''));
  const grid = subGrid([
    { icon:'📝', title:'云端备忘录', sub:'长期存储·可检索', key:'memo', cat:'备忘', onClick:()=>goSub('memo') },
    { icon:'💭', title:'心情随笔时间线', sub:'每日记录', key:'mood', cat:'心情', onClick:()=>goSub('mood') },
  ], 'daily');
  root.appendChild(grid);
}

// 1) 备忘录（通用集合 + 长期云端存储可检索）
function memoView(root, back) {
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('📝','云端备忘录','可检索·永久存储'));
  const c = el('div',{});
  root.appendChild(c);
  Collection(c, { module:MODULE, sub:'memo', icon:'📝', title:'备忘录',
    empty:'随手记，长期云端保存，支持搜索',
    fields:[
      {key:'title',label:'标题',type:'text',placeholder:'标题'},
      {key:'body',label:'内容',type:'textarea',placeholder:'正文…'},
      {key:'tags',label:'标签',type:'tags'}
    ]});
}

// 3) 心情随笔时间线
function moodView(root, back) {
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('💭','心情随笔时间线',''));
  const MOODS=['😀 愉悦','😌 平静','🥰 幸福','😢 低落','😡 烦躁','😴 疲惫','🤔 思考'];
  const form=el('div',{class:'card',style:'margin-bottom:16px'});
  const moodI=el('select',{class:'input'}); MOODS.forEach(m=>moodI.appendChild(el('option',{value:m,text:m})));
  const noteI=el('textarea',{class:'input',placeholder:'今天怎么了…'});
  const picker=imagePicker('随手拍');
  const impBox=importBox('📥 导入图片/视频/链接/文字(可选)');
  form.append(
    el('div',{class:'field'},[el('label',{text:'心情'}),moodI]),
    el('div',{class:'field'},[el('label',{text:'随笔'}),noteI]),
    el('div',{class:'field'},[el('label',{text:'配图（可选）'}),picker]),
    el('div',{class:'field'},[el('label',{text:'导入内容（可选）'}),impBox]),
    el('button',{class:'btn btn-primary',onclick:async()=>{
      const rec={id:uid(),module:MODULE,sub:'mood',created:now(),updated:now(),title:moodI.value,body:noteI.value};
      const saved=await saveWithFiles(rec,picker);
      const imp=impBox.getValue();
      if(imp&&imp.type){ const extra=await applyImport(saved.id,imp); if(extra){ if(extra.link)saved.link=extra.link; if(extra.importedText)saved.importedText=extra.importedText; await putRecord(saved);} }
      toast('已记录','ok'); moodView(root,back);
    }},'记一笔')
  );
  root.append(form, secTitle('📜','时间线',''));
  const moodCats = ['全部','😀 愉悦','😌 平静','🥰 幸福','😢 低落','😡 烦躁','😴 疲惫','🤔 思考'];
  root.appendChild(listToolbar({ cats:moodCats, searchPh:'搜索心情随笔', render:(q,cat)=>renderMood(q,cat) }));
  const tl=el('div',{class:'list'});
  root.appendChild(tl);
  async function renderMood(q='',cat='全部'){
    tl.innerHTML='';
    const items=(await recordsBySub(MODULE,'mood')).filter(r=>{
      const hay=(r.title+' '+(r.body||'')).toLowerCase();
      return (!q||hay.includes(q.toLowerCase())) && (cat==='全部'||(r.title||'').startsWith(cat.split(' ')[0]));
    }).sort((a,b)=>b.created-a.created);
    if(!items.length){tl.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'💭'}),el('div',{text:'没有匹配的心情记录'})]));return;}
    for(const r of items){ const url=await fileURL(r.id);
      const actions=el('div',{class:'it-actions'},[favoriteBtn(r,()=>renderMood(q,cat)),el('button',{class:'mini-btn',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);renderMood(q,cat);}}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'',body:r.body||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?(r.body||'')+'\n'+out:out),updated:now()};await putRecord(upd);await recordChange(upd);renderMood(q,cat); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      const node=el('div',{class:'item'},[
        el('div',{class:'it-ico',html:r.title.split(' ')[0]}),
        el('div',{class:'it-body'},[
          el('div',{class:'it-title',text:r.title+' · '+relTime(r.created)}),
          el('div',{class:'it-meta',html:escapeHtml(r.body||'')}),
          url?el('img',{src:url,style:'max-width:120px;border-radius:12px;margin-top:6px'}):''
        ]),
        actions
      ]);
      const ip=await renderImport(r); if(ip) node.appendChild(ip);
      tl.appendChild(node);
    }
  }
  renderMood('','全部');
}

export const PHRASE_SEED = {
  '礼貌用语':['不好意思，打扰一下','麻烦您了，谢谢','您先请','不客气，应该的','请问一下…'],
  '客套寒暄':['最近忙什么呢？','好久不见，挺想你的','您气色真好','今天天气真不错','吃饭了吗？'],
  '拒绝不尴尬':['这次真去不了，下次一定','我手头有点紧，先不啦','抱歉啊，时间对不上','我帮不了这个忙，别见怪','先记着，以后补上'],
  '夸奖别人':['你这眼光真毒','也太厉害了吧','靠谱，交给你就放心了','你今天状态真好','这想法绝了'],
  '接话茬':['是吧，我也这么觉得','然后呢？','确实如此','哈哈哈太对了','说得有道理'],
  '职场沟通':['收到，马上处理','我同步一下进度','这个问题我来跟进','辛苦了，辛苦了','咱们对齐一下目标'],
};
// 日常话术库面板：既可独立成页，也可嵌入其它页面（如「高情商话术」页顶部的独立版块）
export async function phrasesPanel(){
  const all = await recordsBySub(MODULE,'phrases');
  if(!all.length){ for(const [cat, list] of Object.entries(PHRASE_SEED)){ for(const t of list){ await putRecord({id:uid(),module:MODULE,sub:'phrases',created:now(),updated:now(),cat,text:t,seed:1}); } } }
  let cat='全部'; let q='';
  const cats=['全部',...Object.keys(PHRASE_SEED)];
  const catBar=el('div',{class:'ph-cats'});
  const listBox=el('div',{class:'list',style:'margin-top:10px'});
  const searchI=el('input',{class:'input',style:'flex:1;min-width:160px',placeholder:'搜索话术…'});
  searchI.oninput=()=>{ q=searchI.value.trim().toLowerCase(); renderList(); };
  function openAdd(){ const catSel=el('select',{class:'input'}); Object.keys(PHRASE_SEED).forEach(c=>catSel.appendChild(el('option',{value:c,text:c}))); const tI=el('input',{class:'input',placeholder:'话术内容'}); modal.open('添加话术', el('div',{},[el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),el('div',{class:'field'},[el('label',{text:'内容'}),tI]),el('div',{class:'row',style:'gap:8px'},[el('button',{class:'btn btn-primary',onclick:async()=>{ if(!tI.value.trim()){toast('写点内容吧','err');return;} await putRecord({id:uid(),module:MODULE,sub:'phrases',created:now(),updated:now(),cat:catSel.value,text:tI.value.trim()}); await recordChange({id:uid(),module:MODULE,sub:'phrases',op:'put',ts:now()}); modal.close(); renderList(); toast('已添加','ok'); }},'保存'),el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])])); tI.focus(); }
  catBar.append(...cats.map(c=>{ const b=el('button',{class:'chip'+(c==='全部'?' chip-on':''),onclick:()=>{ cat=c; catBar.querySelectorAll('.chip').forEach(x=>x.classList.remove('chip-on')); b.classList.add('chip-on'); renderList(); }},c); return b; }));
  async function renderList(){
    listBox.innerHTML='';
    const items=(await recordsBySub(MODULE,'phrases')).filter(r=>{ const hay=(r.text||'').toLowerCase(); return (cat==='全部'||r.cat===cat) && (!q||hay.includes(q)); });
    if(!items.length){ listBox.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'💬'}),el('div',{text:'没有话术，点右上角添加'})])); return; }
    items.forEach(r=>{ listBox.appendChild(el('div',{class:'item'},[
      el('div',{class:'it-ico',html:'💬'}),
      el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.text}), el('div',{class:'it-meta',text:r.cat||''})]),
      el('div',{class:'it-actions'},[
        el('button',{class:'mini-btn',title:'复制',onclick:()=>copyText(r.text)},'📋'),
        el('button',{class:'mini-btn',title:'删除',onclick:async()=>{ if(confirm('删除该话术？')){ await softDelete(r.id); renderList(); } }},'🗑')
      ])
    ])); });
  }
  const wrap=el('div',{});
  wrap.append(el('div',{class:'row wrap',style:'gap:8px;margin-bottom:10px'},[searchI, el('button',{class:'btn btn-primary btn-sm',onclick:openAdd},'➕ 添加话术')]), catBar, listBox);
  await renderList();
  return wrap;
}

async function phrasesView(root, back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💬','日常话术库','常见话术一键复制，也能自己添加'));
  root.appendChild(await phrasesPanel());
}

export const subs = {
  memo: memoView, mood: moodView, phrases: phrasesView
};
