// 模块二：高频快捷工具
import { el, uid, now, fmtDate, relTime, toast, modal, drawer, copyText, download, daysBetween, escapeHtml } from '../core/utils.js';
import { putRecord, recordsBySub, softDelete, allRecords } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, imagePicker, saveWithFiles, fileURL, listToolbar, aiItemActions, favoriteBtn, importBox, applyImport, renderImport, importInto } from '../core/lib.js';
import { startRecording, createTranscriber, hasSpeechRecognition, speak, stopSpeak } from '../core/media.js';

const MODULE='tools';

export const meta = { key:'tools', name:'快捷工具', icon:'⚡', color:'var(--orange)', desc:'录音·待办·灵感' };

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('⚡','高频快捷工具',''));
  root.appendChild(subGrid([
    { icon:'🎙', title:'全能录音转文字', sub:'实时流式·后台', key:'record', cat:'录音', onClick:()=>goSub('record') },
    { icon:'✅', title:'极简快速待办', sub:'一键勾选', key:'todo', cat:'待办', onClick:()=>goSub('todo') },
    { icon:'📌', title:'弹窗快捷备忘', sub:'瞬时捕捉', key:'quick', cat:'备忘', onClick:()=>goSub('quick') },
    { icon:'💡', title:'灵感瞬时归档', sub:'随手收藏', key:'idea', cat:'灵感', onClick:()=>goSub('idea') },
    { icon:'💝', title:'纪念日倒计时', sub:'到期提醒', key:'anniv', cat:'纪念日', onClick:()=>goSub('anniv') },
    { icon:'🔖', title:'网页收藏馆', sub:'分类合集·本地存', key:'webmark', cat:'收藏', onClick:()=>goSub('webmark') },
  ], 'tools'));
}

// 录音转文字
function recordView(root, back) {
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('🎙','全能录音转文字', hasSpeechRecognition()?'支持实时流式转写':'当前环境不支持语音识别(可录音后手动整理)'));
  const status=el('div',{class:'card card-2',style:'margin-bottom:14px'},[el('div',{class:'row'},[el('span',{html:'●',style:'color:var(--ink-faint)'}),el('b',{text:'待机'})])]);
  const transcript=el('textarea',{class:'input',style:'min-height:160px',placeholder:'转写内容将显示在这里…'});
  const livePreview=el('div',{class:'faint',style:'font-size:13px;min-height:18px;margin-top:4px'});
  let rec=null, transcriber=null, recording=false, bgMode=false;
  const startBtn=el('button',{class:'btn btn-primary'},'● 开始录音');
  const stopBtn=el('button',{class:'btn btn-danger',style:'display:none'},'■ 停止');
  const bgBtn=el('button',{class:'btn btn-soft btn-sm'},'🌙 后台录音');
  startBtn.onclick=async()=>{
    try{
      const r=await startRecording(); rec=r;
      recording=true; startBtn.style.display='none'; stopBtn.style.display='inline-flex';
      status.innerHTML=''; status.appendChild(el('div',{class:'row'},[el('span',{html:'🔴',style:'color:var(--primary-deep)'}),el('b',{text:'录音中…可切到其它页面继续'})]));
      if (hasSpeechRecognition()) {
        transcriber=createTranscriber((final)=>{ transcript.value+=final; },(inter)=>{ livePreview.textContent=inter; });
        if (transcriber) transcriber.start();
      }
      toast('开始录音','ok');
    }catch(e){ toast('无法录音：'+e.message,'err'); }
  };
  stopBtn.onclick=async()=>{
    recording=false; if(transcriber) try{transcriber.stop();}catch{} if(rec&&rec.controller) rec.controller.stop();
    startBtn.style.display='inline-flex'; stopBtn.style.display='none';
    status.innerHTML=''; status.appendChild(el('div',{class:'row'},[el('span',{html:'✅',style:'color:var(--green)'}),el('b',{text:'已停止'})]));
    if (rec){
      // 保存音频 + 文字
      const audioRec={id:uid(),module:MODULE,sub:'record',created:now(),updated:now(),title:'录音 '+fmtDate(now()),body:transcript.value};
      await putRecord(audioRec);
      // 存音频 blob 为文件
      import('../core/db.js').then(({putFile})=>putFile({id:uid(),recId:audioRec.id,name:'audio.webm',type:rec.blob.type,kind:'audio',blob:rec.blob,ts:now()}));
      await recordChange(audioRec);
      toast('录音已保存','ok');
    }
  };
  bgBtn.onclick=()=>{ bgMode=!bgMode; bgBtn.textContent=bgMode?'🌙 后台录音：开':'🌙 后台录音：关';
    bgBtn.classList.toggle('btn-primary',bgMode); bgBtn.classList.toggle('btn-soft',!bgMode);
    if ('mediaSession' in navigator){ try{ navigator.mediaSession.metadata=new MediaMetadata({title:'后台录音中',artist:'AI工作台'}); }catch{} } };

  root.append(status, transcript, livePreview,
    el('div',{class:'row wrap',style:'gap:8px;margin:10px 0'},[startBtn,stopBtn,bgBtn]),
    el('div',{class:'row wrap',style:'gap:8px'},[
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(transcript.value)},'📋 复制文字'),
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>speak(transcript.value)},'🔊 朗读'),
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>download(new Blob([transcript.value],{type:'text/plain'}),'转写_'+fmtDate(now())+'.txt')},'⬇ 导出TXT'),
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>import('../core/db.js').then(({filesByRec,getFile})=>exportLastAudio())},'⬇ 导出音频')
    ]),
    secTitle('📚','历史录音','')
  );
  async function exportLastAudio(){
    const items=await recordsBySub(MODULE,'record');
    const last=items.sort((a,b)=>b.created-a.created)[0]; if(!last)return;
    const {filesByRec,getFile}=await import('../core/db.js');
    const files=await filesByRec(last.id); if(!files.length){toast('无音频文件','err');return;}
    const f=await getFile(files[0].id); download(f.blob,'录音_'+fmtDate(now())+'.webm');
  }
  root.appendChild(listToolbar({ cats:['全部','工作','生活','学习','采访','其它'], searchPh:'搜索录音转写', render:(q,cat)=>renderRec(q,cat), importOpt:{module:MODULE,sub:'record',title:'录音转写'} }));
  const listBox=el('div',{class:'list'}); root.appendChild(listBox);
  async function renderRec(q,cat){
    listBox.innerHTML='';
    const items=(await recordsBySub(MODULE,'record')).filter(r=>{
      const hay=(r.title+' '+(r.body||'')).toLowerCase();
      return (!q||hay.includes(q.toLowerCase())) && (cat==='全部'||(r.cat||'其它')===cat);
    }).sort((a,b)=>b.created-a.created);
    if(!items.length){listBox.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🎙'}),el('div',{text:'没有匹配的录音'})]));return;}
    for(const r of items){
      const actions=el('div',{class:'it-actions'},[
        el('button',{class:'mini-btn',title:'朗读',onclick:()=>speak(r.body)},'🔊'),
        favoriteBtn(r, ()=>renderRec(q,cat)),
        el('button',{class:'mini-btn',title:'删除',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);renderRec(q,cat);}}},'🗑')
      ]);
      const ai=await aiItemActions({title:r.title||'',body:r.body||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?(r.body||'')+'\n'+out:out),updated:now()};await putRecord(upd);await recordChange(upd);renderRec(q,cat); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      listBox.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:'🎙'}),
        el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title}),el('div',{class:'it-meta',html:relTime(r.created)+' · '+(r.body?escapeHtml(r.body.slice(0,40)):'无文字')})]),
        actions
      ]));
    }
  }
  renderRec('','全部');
}

// 极简待办
function todoView(root, back) {
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('✅','极简快速待办',''));
  const input=el('input',{class:'input',placeholder:'想做点什么？回车添加'});
  const catSel=el('select',{class:'input',style:'max-width:120px'}); ['其它','工作','生活','学习','购物'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
  const add=async()=>{ if(!input.value.trim())return; await putRecord({id:uid(),module:MODULE,sub:'todo',created:now(),updated:now(),title:input.value.trim(),cat:catSel.value,done:false}); input.value=''; load(); };
  input.onkeydown=e=>{ if(e.key==='Enter')add(); };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'row wrap',style:'gap:8px'},[input,catSel,el('button',{class:'btn btn-primary',onclick:add},'＋')])]));
  root.appendChild(listToolbar({ cats:['全部','工作','生活','学习','购物','其它'], searchPh:'搜索待办', render:(q,cat)=>load(q,cat), importOpt:{module:MODULE,sub:'todo',title:'待办'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function load(q='',cat='全部'){ const items=(await recordsBySub(MODULE,'todo')).filter(r=>{ const hay=(r.title||'').toLowerCase(); return (!q||hay.includes(q.toLowerCase()))&&(cat==='全部'||(r.cat||'其它')===cat); }).sort((a,b)=>(a.done?1:0)-(b.done?1:0)||b.created-a.created);
    list.innerHTML='';
    if(!items.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'✅'}),el('div',{text:'还没有待办'})]));return;}
    for (const r of items) {
      const actions=el('div',{class:'it-actions'},[favoriteBtn(r, ()=>load(q,cat)), el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);load(q,cat);}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'待办',body:r.title||'',onApply:async(out,mode)=>{ r.title = mode==='generate'? out : (mode==='continue'? (r.title||'')+' '+out : out); r.updated=now(); await putRecord(r); await recordChange(r); load(q,cat); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      list.appendChild(el('div',{class:'item'},[
        el('button',{class:'mini-btn',style:r.done?'background:var(--green-soft);color:var(--green)':'',onclick:async()=>{r.done=!r.done;r.updated=now();await putRecord(r);await recordChange(r);load(q,cat);},html:r.done?'✓':'○'}),
        el('div',{class:'it-body'},[el('div',{class:'it-title',style:r.done?'text-decoration:line-through;color:var(--ink-faint)':'',text:r.title})]),
        actions
      ]));
    }
  }
  load();
}

// 弹窗快捷备忘
function quickView(root, back) {
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('📌','弹窗快捷备忘','瞬时捕捉不中断'));
  const body=el('div',{});
  const ta=el('textarea',{class:'input',style:'min-height:140px',placeholder:'有什么想法？马上记下来'});
  const save=async()=>{ if(!ta.value.trim()){toast('写点什么','err');return;} await putRecord({id:uid(),module:MODULE,sub:'quick',created:now(),updated:now(),title:'速记',body:ta.value.trim()}); toast('已速记','ok'); ta.value=''; };
  body.append(ta, el('div',{class:'row',style:'margin-top:10px;gap:8px'},[el('button',{class:'btn btn-primary grow',onclick:save},'⚡ 速记保存'),el('button',{class:'btn btn-soft',onclick:()=>copyText(ta.value)},'📋 复制')]));
  root.append(body, secTitle('🗒','速记列表',''));
  root.appendChild(listToolbar({ cats:['全部','工作','生活','灵感','其它'], searchPh:'搜索速记', render:(q,cat)=>renderQuick(q,cat), importOpt:{module:MODULE,sub:'quick',title:'速记'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function renderQuick(q,cat){
    list.innerHTML='';
    const items=(await recordsBySub(MODULE,'quick')).filter(r=>{ const hay=(r.title+' '+(r.body||'')).toLowerCase(); return (!q||hay.includes(q.toLowerCase()))&&(cat==='全部'||(r.cat||'其它')===cat); }).sort((a,b)=>b.created-a.created);
    if(!items.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'📌'}),el('div',{text:'没有匹配的速记'})]));return;}
    for(const r of items){
      const actions=el('div',{class:'it-actions'},[favoriteBtn(r, ()=>renderQuick(q,cat)), el('button',{class:'mini-btn',title:'删除',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);renderQuick(q,cat);}}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'速记',body:r.body||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?(r.body||'')+'\n'+out:out),updated:now()};await putRecord(upd);await recordChange(upd);renderQuick(q,cat); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      list.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'📌'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:relTime(r.created)}),el('div',{class:'it-meta',html:escapeHtml((r.body||'').slice(0,60))})]),actions]));
    }
  }
  renderQuick('','全部');
}

// 灵感归档
function ideaView(root, back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💡','灵感瞬时归档',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'idea',icon:'💡',title:'灵感',empty:'收藏一闪而过的灵感',
    fields:[{key:'title',label:'标题',type:'text'},{key:'body',label:'描述',type:'textarea'},{key:'tags',label:'标签',type:'tags'}]}); }

// 纪念日
function annivView(root, back) {
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('💝','纪念日倒计时','到期自动提醒'));
  const nameI=el('input',{class:'input',placeholder:'名称（生日/纪念日/还款…）'});
  const dateI=el('input',{class:'input',type:'date'});
  const catI=el('select',{class:'input'}); ['生日','恋爱纪念日','结婚纪念日','节日','自定义'].forEach(c=>catI.appendChild(el('option',{value:c,text:c})));
  const warnI=el('input',{class:'input',type:'number',value:'7',style:'max-width:120px'}); warnI.previousSibling;
  const form=el('div',{class:'card',style:'margin-bottom:14px'},[
    el('div',{class:'field'},[el('label',{text:'名称'}),nameI]),
    el('div',{class:'row wrap',style:'gap:10px'},[
      el('div',{class:'field grow'},[el('label',{text:'日期'}),dateI]),
      el('div',{class:'field',style:'width:140px'},[el('label',{text:'类别'}),catI]),
      el('div',{class:'field',style:'width:120px'},[el('label',{text:'提前提醒(天)'}),warnI])
    ]),
    el('button',{class:'btn btn-primary',onclick:async()=>{ if(!nameI.value||!dateI.value){toast('填名称和日期','err');return;}
      await putRecord({id:uid(),module:MODULE,sub:'anniversary',created:now(),updated:now(),title:nameI.value,date:dateI.value,category:catI.value,warnDays:parseInt(warnI.value)||7}); await recordChange({module:MODULE,sub:'anniversary'}); toast('已添加','ok'); annivView(root,back); }},'保存')
  ]);
  root.append(form, secTitle('⏳','倒计时',''));
  root.appendChild(listToolbar({ cats:['全部','生日','恋爱纪念日','结婚纪念日','节日','自定义'], searchPh:'搜索纪念日', render:(q,cat)=>renderAnniv(q,cat), importOpt:{module:MODULE,sub:'anniversary',title:'纪念日'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function renderAnniv(q,cat){
    list.innerHTML='';
    const items=(await recordsBySub(MODULE,'anniversary')).filter(r=>{ const hay=(r.title+' '+(r.category||'')).toLowerCase(); return (!q||hay.includes(q.toLowerCase()))&&(cat==='全部'||(r.category||'')===cat); }).sort((a,b)=>a.date.localeCompare(b.date));
    const today=new Date(); today.setHours(0,0,0,0);
    if(!items.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'💝'}),el('div',{text:'没有匹配的纪念日'})]));return;}
    for (const r of items) { const d=new Date(r.date+'T00:00:00'); const diff=daysBetween(fmtDate(today.getTime()),r.date);
      const txt= diff<0?`已过 ${Math.abs(diff)} 天`: diff===0?'就是今天！':'还有 '+diff+' 天';
      const actions=el('div',{class:'it-actions'},[favoriteBtn(r, ()=>renderAnniv(q,cat)), el('button',{class:'mini-btn',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);renderAnniv(q,cat);}}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'纪念日',body:r.title||'',onApply:async(out,mode)=>{ r.title = mode==='generate'? out : (mode==='continue'? (r.title||'')+' '+out : out); r.updated=now(); await putRecord(r); await recordChange(r); renderAnniv(q,cat); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      list.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:'💝'}),
        el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title+' · '+r.date}),el('div',{class:'it-meta',text:r.category||''})]),
        el('div',{class:'tag '+(diff<=r.warnDays?'yellow':'')},txt),
        actions
      ]));
    }
  }
  renderAnniv('','全部');
}

// ===== 网页收藏馆：分类合集，存本地 IndexedDB =====
function webmarkView(root, back){
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('🔖','网页收藏馆','把好用的网页收进来，分类管理'));

  let items=[], q='', cat='全部', favOnly=false;
  const CATS_KEY='atelier_webmark_cats';
  function loadCats(){ try{ return JSON.parse(localStorage.getItem(CATS_KEY)||'[]'); }catch{ return []; } }
  function saveCats(a){ try{ localStorage.setItem(CATS_KEY, JSON.stringify(a)); }catch{} }
  if(!loadCats().length) saveCats(['常用工具','学习教程','设计素材','AI 工具','影音娱乐','其它']);

  const list=el('div',{class:'list'});
  const catBar=el('div',{class:'chips',style:'margin:10px 0'});
  const searchI=el('input',{class:'input',placeholder:'🔎 搜索名称 / 网址 / 备注 / 分类…',style:'max-width:300px'});
  searchI.addEventListener('input',()=>{ q=searchI.value.trim().toLowerCase(); renderList(); });
  const favBtn=el('button',{class:'btn btn-soft btn-sm',onclick:()=>{ favOnly=!favOnly; favBtn.classList.toggle('on',favOnly); renderList(); }},'⭐ 只看收藏');

  const bar=el('div',{class:'row',style:'gap:8px;flex-wrap:wrap;margin-bottom:10px'},[
    el('button',{class:'btn btn-primary btn-sm',onclick:()=>openEdit(null)},'➕ 收藏网页'),
    el('button',{class:'btn btn-soft btn-sm',onclick:addCat},'🗂 添加分类'),
    favBtn
  ]);
  root.append(el('div',{class:'card',style:'margin-bottom:12px'},[bar, searchI]), catBar, list);

  async function load(){ items=await recordsBySub(MODULE,'webmark'); }
  function cats(){ return ['全部', ...loadCats()]; }

  function renderCatBar(){
    catBar.innerHTML='';
    cats().forEach(c=>{
      catBar.appendChild(el('button',{
        class:'chip'+(c===cat?' chip-on':''),
        onclick:()=>{ cat=c; renderCatBar(); renderList(); }
      }, c));
    });
  }
  function renderList(){
    list.innerHTML='';
    let arr=items.slice().sort((a,b)=>(b.created||0)-(a.created||0));
    if(cat!=='全部') arr=arr.filter(r=>(r.cat||'其它')===cat);
    if(favOnly) arr=arr.filter(r=>r.fav);
    if(q) arr=arr.filter(r=>[r.name,r.url,r.note,r.cat].filter(Boolean).join(' ').toLowerCase().includes(q));
    if(!arr.length){ list.appendChild(el('div',{class:'empty'},'没有匹配的网页')); return; }
    arr.forEach(r=>{
      const card=el('div',{class:'item'},[
        el('div',{class:'it-ico',html:r.icon||'🔗'}),
        el('div',{class:'it-body'},[
          el('div',{class:'it-title',text:r.name||'(未命名)'}),
          el('div',{class:'it-meta',text:(r.cat||'其它')+(r.note?' · '+r.note:'')}),
          el('div',{class:'it-meta',style:'font-size:12px;word-break:break-all',text:r.url||''}),
        ]),
        el('div',{class:'it-actions'},[
          el('button',{class:'mini-btn',title:'打开网页',onclick:()=>{ if(r.url) window.open(r.url,'_blank','noopener'); }},'↗'),
          favoriteBtn(r,()=>{ load().then(renderList); }),
          el('button',{class:'mini-btn',onclick:()=>openEdit(r)},'✏'),
          el('button',{class:'mini-btn',onclick:async()=>{ if(confirm('删除「'+(r.name||'')+'」？')){ await softDelete(r.id); await load(); renderList(); } }},'🗑')
        ])
      ]);
      list.appendChild(card);
    });
  }

  function addCat(){
    const i=el('input',{class:'input',placeholder:'分类名，如：工作必备'});
    modal.open('🗂 添加分类', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'分类名'}),i]),
      el('div',{class:'row',style:'gap:8px;margin-top:8px'},[
        el('button',{class:'btn btn-primary',onclick:()=>{ const v=i.value.trim(); if(!v){toast('先填分类名','err');return;} const a=loadCats(); if(!a.includes(v)) a.push(v); saveCats(a); modal.close(); renderCatBar(); toast('已添加','ok'); }},'添加'),
        el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
      ])
    ]));
    i.focus();
  }

  function openEdit(r){
    const isNew=!r;
    const rec=r||{id:uid(),module:MODULE,sub:'webmark',created:now(),updated:now(),name:'',url:'',note:'',icon:'🔗',cat:cat!=='全部'?cat:'常用工具'};
    const nameI=el('input',{class:'input',value:rec.name||'',placeholder:'名称，如：知乎'});
    const urlI=el('input',{class:'input',value:rec.url||'',placeholder:'https://www.zhihu.com'});
    const noteI=el('input',{class:'input',value:rec.note||'',placeholder:'备注（可选）'});
    const iconI=el('input',{class:'input',value:rec.icon||'🔗',placeholder:'图标 emoji'});
    const catSel=el('select',{class:'input'});
    loadCats().forEach(c=>catSel.appendChild(el('option',{value:c,text:c,selected:(c===rec.cat)})));
    // 从剪贴板预填网址，省得手动粘贴
    if(isNew && navigator.clipboard){ navigator.clipboard.readText().then(t=>{ if(t&&/^https?:\/\//i.test(t.trim())&&!urlI.value) urlI.value=t.trim(); }).catch(()=>{}); }
    modal.open(isNew?'收藏网页':'编辑网页', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'名称'}),nameI]),
      el('div',{class:'field'},[el('label',{text:'网址'}),urlI]),
      el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field'},[el('label',{text:'备注'}),noteI]),
      el('div',{class:'field'},[el('label',{text:'图标'}),iconI]),
      el('div',{class:'row',style:'gap:8px;margin-top:8px'},[
        el('button',{class:'btn btn-primary',onclick:async()=>{
          const n=nameI.value.trim(); if(!n){toast('先填名称','err');return;}
          let u=urlI.value.trim(); if(u&&!/^https?:\/\//i.test(u)) u='https://'+u;
          rec.name=n; rec.url=u; rec.note=noteI.value.trim(); rec.icon=iconI.value.trim()||'🔗'; rec.cat=catSel.value; rec.updated=now();
          await putRecord(rec); try{ await recordChange(rec); }catch{}
          modal.close(); await load(); renderList(); toast('已保存','ok');
        }},'保存'),
        el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
      ])
    ]));
  }

  (async()=>{ await load(); renderCatBar(); renderList(); })();
}

export const subs = { record:recordView, todo:todoView, quick:quickView, idea:ideaView, anniv:annivView, webmark:webmarkView };
