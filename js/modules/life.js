// 模块三：生活锻炼
import { el, uid, now, fmtDate, relTime, toast, copyText, itemRow, itBody, itActions } from '../core/utils.js';
import { putRecord, recordsBySub, getRecord, softDelete, kvGet, kvSet } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, imagePicker, saveWithFiles, fileURL, aiItemActions, favoriteBtn, listToolbar, importInto } from '../core/lib.js';

const MODULE='life';

export const meta = { key:'life', name:'生活锻炼', icon:'🌿', color:'var(--green)', desc:'训练·护肤·护肤' };

// 预置内容（内置知识库，避免依赖外部）
const PRESET_TRAIN = [
  {title:'帕梅拉 10min 全身燃脂', tag:'帕梅拉', desc:'开合跳+深蹲+平板支撑组合，无器械', dur:'10:00'},
  {title:'欧阳春晓 体态矫正', tag:'欧阳春晓', desc:'改善圆肩驼背，每日跟练', dur:'12:00'},
  {title:'帕梅拉 蜜桃臀训练', tag:'帕梅拉', desc:'蚌式+臀桥，居家塑形', dur:'15:00'},
  {title:'欧阳春晓 天鹅臂', tag:'欧阳春晓', desc:'手臂线条雕刻', dur:'10:00'},
  {title:'帕梅拉 快乐 dance', tag:'帕梅拉', desc:'有氧舞蹈，轻松出汗', dur:'20:00'},
];
const PRESET_SKIN = [
  {title:'油痘肌早C晚A流程', desc:'早：氨基酸洁面→维C→保湿；晚：洁面→A醇→修复', type:'流程'},
  {title:'避雷：过度清洁', desc:'一天洗脸不超过2次，避免皂基过度去脂', type:'避雷'},
  {title:'避雷：手挤痘痘', desc:'易留疤感染，用含水杨酸产品点涂', type:'避雷'},
  {title:'抗炎饮食清单', desc:'深海鱼、番茄、西兰花、坚果，少吃高糖乳制品', type:'干货'},
  {title:'防晒是护肤第一步', desc:'物理+化学结合，四季都要', type:'干货'},
];
const PRESET_DIET = [
  {title:'Day1 鸡胸西兰花餐', desc:'早餐：燕麦+蛋；午餐：鸡胸+西兰花；晚餐：杂粮粥', kcal:1200},
  {title:'Day2 三文鱼沙拉', desc:'午餐：三文鱼+生菜；加餐：蓝莓', kcal:1250},
  {title:'Day3 牛肉藜麦', desc:'午餐：牛肉+藜麦；晚餐：蔬菜汤', kcal:1300},
  {title:'Day4 豆腐蔬食', desc:'全天植物蛋白，豆腐+时蔬', kcal:1100},
  {title:'Day5 虾仁冬瓜', desc:'低卡高蛋白，冬瓜利尿', kcal:1150},
];

function ensurePreset(sub, data, key){
  return (async()=>{ const has=await kvGet(key); if(has) return; const items=await recordsBySub(MODULE,sub);
    if(items.length) { await kvSet(key,1); return; }
    for(const d of data){ await putRecord({id:uid(),module:MODULE,sub,created:now(),updated:now(),title:d.title,body:d.desc,tag:d.tag,type:d.type,dur:d.dur,kcal:d.kcal,preset:true}); }
    await kvSet(key,1);
  })();
}

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('🌿','生活锻炼',''));
  root.appendChild(subGrid([
    { icon:'🏋️', title:'塑形训练合集', sub:'帕梅拉/欧阳春晓', key:'train', cat:'训练', onClick:()=>goSub('train') },
    { icon:'🧴', title:'油痘肌护肤', sub:'流程+避雷+日记', key:'skin', cat:'护肤', onClick:()=>goSub('skin') },
    { icon:'🥗', title:'抗炎饮食干货', sub:'抗炎饮食库', key:'diet', cat:'饮食', onClick:()=>goSub('diet') },
    { icon:'🍱', title:'30天减脂食谱', sub:'食材热量教程', key:'recipe30', cat:'饮食', onClick:()=>goSub('recipe30') },
    { icon:'👩‍🍳', title:'私厨菜谱库', sub:'自建收藏', key:'cook', cat:'饮食', onClick:()=>goSub('cook') },
    { icon:'💧', title:'分时段饮水', sub:'定时提醒', key:'water', cat:'健康', onClick:()=>goSub('water') },
  ], 'life'));
}

// 视频链接转内嵌地址（B站/YouTube 自动转播放器，其它返回 null 交给 video 标签）
function toVideoEmbed(u){
  let m;
  if ((m=u.match(/bilibili\.com\/video\/(BV[\w]+)/i))) return 'https://player.bilibili.com/player.html?bvid='+m[1]+'&page=1&high_quality=1&danmaku=0';
  if ((m=u.match(/youtube\.com\/watch\?v=([\w-]+)/i)) || (m=u.match(/youtu\.be\/([\w-]+)/i))) return 'https://www.youtube.com/embed/'+m[1];
  return null;
}
// 根据记录渲染视频播放器（本地 blob 或 链接）
function renderTrainVideo(r){
  if (r.videoBlob) {
    const url = URL.createObjectURL(r.videoBlob);
    return el('video',{controls:true,preload:'metadata',src:url,style:'width:100%;border-radius:12px;margin-top:10px;max-height:340px;background:#000'});
  }
  if (r.videoUrl) {
    const u = r.videoUrl.trim();
    const emb = toVideoEmbed(u);
    if (emb) return el('iframe',{src:emb,style:'width:100%;height:230px;border:0;border-radius:12px;margin-top:10px',allow:'autoplay; encrypted-media; picture-in-picture; fullscreen',allowfullscreen:true});
    if (/\.(mp4|webm|ogg|mov|m3u8)(\?.*)?$/i.test(u)) return el('video',{controls:true,src:u,style:'width:100%;border-radius:12px;margin-top:10px;max-height:340px;background:#000'});
    return el('a',{href:u,target:'_blank',rel:'noopener',class:'btn btn-soft btn-sm',style:'margin-top:10px'},'▶ 打开视频链接');
  }
  return null;
}
// 导入 / 编辑 训练视频
function importTrainVideo(root, back, rec){
  const titleI = el('input',{class:'input',placeholder:'标题，如：帕梅拉 15min 腹肌训练',value:rec?rec.title:''});
  const durI = el('input',{class:'input',placeholder:'时长（可选），如 15:00',value:rec?rec.dur||'':''});
  const urlI = el('input',{class:'input',placeholder:'视频链接（mp4直链 或 B站/YouTube 链接，可选）',value:rec?rec.videoUrl||'':''});
  const fileI = el('input',{type:'file',accept:'video/*'});
  const prev = el('div',{class:'muted',style:'font-size:12px;margin-top:6px'});
  fileI.onchange = ()=>{ const f=fileI.files[0]; if(f) prev.textContent='已选择本地视频：'+f.name+'（'+(f.size/1048576).toFixed(1)+' MB）'; };
  const body = el('div',{},[
    el('div',{class:'field'},[el('label',{text:'标题'}), titleI]),
    el('div',{class:'field'},[el('label',{text:'时长（可选）'}), durI]),
    el('div',{class:'field'},[el('label',{text:'视频链接（可选）'}), urlI]),
    el('div',{class:'field'},[el('label',{text:'或上传本地视频（可选）'}), fileI]),
    prev,
    el('div',{class:'muted',style:'font-size:12px;margin-top:8px'},'本地视频仅存在你本机，不上传；链接支持 mp4 直链，或 B站/YouTube 网页链接会自动内嵌播放。'),
    el('div',{class:'row',style:'margin-top:12px;gap:8px'},[
      el('button',{class:'btn btn-primary grow',onclick:async()=>{
        const title=titleI.value.trim(); if(!title){toast('请填写标题','err');return;}
        const f=fileI.files[0];
        const data={ id:(rec&&rec.id)||uid(), module:MODULE, sub:'train', title,
          dur:durI.value.trim(), videoUrl:urlI.value.trim(), body:'', pinned:rec?!!rec.pinned:false, created:rec?rec.created:now() };
        if(f) data.videoBlob=f;            // 新上传文件
        else if(rec&&rec.videoBlob) data.videoBlob=rec.videoBlob; // 保留原文件
        await putRecord(data);
        toast('已保存训练视频','ok'); modal.close(); trainView(root,back);
      }},'保存视频'),
      rec?el('button',{class:'btn btn-ghost',onclick:async()=>{ if(!confirm('删除该训练视频？将进入30天回收站'))return; await softDelete(rec.id); toast('已移入回收站','ok'); modal.close(); trainView(root,back); }},'删除'):el('span',{},''),
      el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
    ])
  ]);
  modal.open(rec?'编辑训练视频':'导入训练视频', body);
}

// 训练合集
function trainView(root, back){
  root.innerHTML=''; root.appendChild(backBtn(back));
  root.appendChild(secTitle('🏋️','塑形训练合集','导入你的训练视频 · 可收藏笔记'));
  root.appendChild(el('button',{class:'btn btn-primary btn-sm',style:'margin-bottom:14px',onclick:()=>importTrainVideo(root,back)},'＋ 导入训练视频'));
  ensurePreset('train',PRESET_TRAIN,'preset_train');
  const list=el('div',{class:'list'}); root.appendChild(list);
  (async()=>{ await ensurePreset('train',PRESET_TRAIN,'preset_train'); const items=await recordsBySub(MODULE,'train');
    items.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
    for(const r of items){
      const hasVideo = !!(r.videoBlob||r.videoUrl);
      const starBtn = el('button',{class:'mini-btn',title:'收藏',onclick:async()=>{r.pinned=!r.pinned;await putRecord(r);toast(r.pinned?'已收藏':'已取消','ok');trainView(root,back);},html:r.pinned?'⭐':'☆'});
      const noteBtn = el('button',{class:'mini-btn',title:'笔记',onclick:()=>noteDrawer(r,()=>trainView(root,back))},'📝');
      const acts=[starBtn, noteBtn];
      const ai=await aiItemActions({title:r.title||'训练',body:r.body||'',onApply:async(out,mode)=>{ r.body= mode==='generate'? out : (mode==='continue'? (r.body||'')+'\n'+out : out); r.updated=now(); await putRecord(r); await recordChange(r); trainView(root,back); }});
      ai.childNodes.forEach(n=>acts.push(n));
      if(hasVideo){ acts.push(el('button',{class:'mini-btn',title:'编辑',onclick:()=>importTrainVideo(root,back,r),html:'✏️'})); }
      if(hasVideo){ acts.push(el('button',{class:'mini-btn',title:'删除',onclick:async()=>{ if(!confirm('删除「'+(r.title||'此项')+'」？将进入30天回收站'))return; await softDelete(r.id); toast('已移入回收站','ok'); trainView(root,back); },html:'🗑'})); }
      const meta = (r.dur?('⏱'+r.dur+' · '):'')+(r.body||(hasVideo?'可播放视频':''));
      const card = el('div',{class:'item'},[
        el('div',{class:'it-ico',html:'🏋️'}),
        itBody(r.title, meta),
        itActions(...acts)
      ]);
      const player = renderTrainVideo(r);
      if(player) card.appendChild(player);
      list.appendChild(card);
    }
  })();
}

// 护肤
function skinView(root, back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🧴','油痘肌护肤','流程 · 避雷 · 干货'));
  const b1=el('button',{class:'on',text:'流程/避雷'}); const b2=el('button',{text:'肤质日记'});
  b1.onclick=()=>{ b1.classList.add('on'); b2.classList.remove('on'); skinList(root,back); };
  b2.onclick=()=>{ b2.classList.add('on'); b1.classList.remove('on'); skinDiary(root,back); };
  root.append(el('div',{class:'seg',style:'margin-bottom:14px'},[b1,b2]));
  skinList(root,back);
}
function skinList(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🧴','油痘肌护肤','流程 · 避雷 · 干货 · 可收藏'));
  root.appendChild(listToolbar({ searchPh:'搜索护肤知识', render:(q)=>skinRender(q), importOpt:{module:MODULE,sub:'skincare',title:'护肤知识'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function skinRender(q=''){
    await ensurePreset('skincare',PRESET_SKIN,'preset_skin');
    const items=(await recordsBySub(MODULE,'skincare')).filter(r=>!q||(r.title+' '+(r.body||'')).toLowerCase().includes(q.toLowerCase()));
    list.innerHTML='';
    if(!items.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🧴'}),el('div',{text:'没有匹配内容，点右上「导入」添加'})]));return;}
    for(const r of items){ const actions=el('div',{class:'it-actions'},[favoriteBtn(r,()=>skinRender(q)),el('button',{class:'mini-btn',onclick:()=>noteDrawer(r,()=>skinRender(q))},'📝')]);
      const ai=await aiItemActions({title:r.title||'护肤',body:r.body||'',onApply:async(out,mode)=>{ r.body= mode==='generate'? out : (mode==='continue'? (r.body||'')+'\n'+out : out); r.updated=now(); await putRecord(r); await recordChange(r); skinRender(q); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      list.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:'🧴'}),
        el('div',{class:'it-body'},[el('div',{class:'it-title'},[r.title, r.type?el('span',{class:'tag '+(r.type==='避雷'?'yellow':'green'),text:r.type}):'']),el('div',{class:'it-meta',text:r.body||''})]),
        actions
      ]));
    }
  }
  skinRender('');
}
function skinDiary(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📓','肤质日记','可收藏 · 可导入'));
  const dateI=el('input',{class:'input',type:'date',value:fmtDate(now())});
  const condI=el('select',{class:'input'});['好','一般','差','爆痘'].forEach(c=>condI.appendChild(el('option',{value:c,text:c})));
  const noteI=el('textarea',{class:'input',style:'min-height:80px'},'今日护肤/状态');
  const form=el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'field'},[el('label',{text:'日期'}),dateI]),el('div',{class:'field'},[el('label',{text:'状态'}),condI]),el('div',{class:'field'},[el('label',{text:'记录'}),noteI]),el('button',{class:'btn btn-primary',onclick:async()=>{await putRecord({id:uid(),module:MODULE,sub:'skindiary',created:now(),updated:now(),title:'肤质 '+condI.value,date:dateI.value,body:noteI.value,condition:condI.value});toast('已记录','ok');skinDiary(root,back);}},'保存')]);
  root.append(form, secTitle('📅','历史',''));
  root.appendChild(listToolbar({ searchPh:'搜索日记', render:(q)=>renderDiary(q), importOpt:{module:MODULE,sub:'skindiary',title:'肤质日记'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function renderDiary(q=''){
    const items=(await recordsBySub(MODULE,'skindiary')).filter(r=>!q||(r.title+' '+(r.body||'')).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date));
    list.innerHTML='';
    if(!items.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'📓'}),el('div',{text:'还没有记录'})]));return;}
    for(const r of items){ const delBtn = el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);renderDiary(q);}},'🗑'); const body = itBody(r.date+' · '+r.condition, r.body||''); list.appendChild(itemRow('📓', body, itActions(favoriteBtn(r,()=>renderDiary(q)), delBtn))); }
  }
  renderDiary('');
}

// 抗炎饮食 / 30天食谱
function dietView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🥗','抗炎饮食生活干货','可收藏 · 可导入'));
  root.appendChild(listToolbar({ searchPh:'搜索饮食干货', render:(q)=>dietRender(q), importOpt:{module:MODULE,sub:'diet',title:'饮食干货'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function dietRender(q=''){
    await ensurePreset('diet',PRESET_DIET,'preset_diet');
    const items=(await recordsBySub(MODULE,'diet')).filter(r=>!q||(r.title+' '+(r.body||'')).toLowerCase().includes(q.toLowerCase()));
    list.innerHTML='';
    if(!items.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🥗'}),el('div',{text:'没有匹配内容，点右上「导入」添加'})]));return;}
    for(const r of items){ const actions=el('div',{class:'it-actions'},[favoriteBtn(r,()=>dietRender(q)), el('button',{class:'mini-btn',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);dietRender(q);}}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'饮食',body:r.body||'',onApply:async(out,mode)=>{ r.body= mode==='generate'? out : (mode==='continue'? (r.body||'')+'\n'+out : out); r.updated=now(); await putRecord(r); await recordChange(r); dietRender(q); }});
      ai.childNodes.forEach(n=>actions.appendChild(n));
      list.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'🥗'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title}),el('div',{class:'it-meta',text:r.body||''})]),actions]));
    }
  }
  dietRender('');
}
function recipe30View(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🍱','30天循环减脂餐','食材·热量·教程'));
  root.appendChild(listToolbar({ searchPh:'搜索食谱/食材', render:(q)=>renderRecipe30(q), importOpt:{module:MODULE,sub:'recipe30',title:'减脂食谱'} }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function renderRecipe30(q=''){ await ensurePreset('recipe30',PRESET_DIET,'preset_recipe30'); const items=(await recordsBySub(MODULE,'recipe30')).filter(r=>!q||(r.title+' '+(r.body||'')).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
    for(const r of items){ const acts=el('div',{class:'it-actions'},[favoriteBtn(r,()=>renderRecipe30(q)), el('button',{class:'mini-btn',onclick:()=>copyText(r.body||'')},'📋'),el('button',{class:'mini-btn',onclick:()=>exportOne(r)},'⬇')]);
      const ai=await aiItemActions({title:r.title||'食谱',body:r.body||'',onApply:async(out,mode)=>{ r.body=mode==='generate'?out:(mode==='continue'?(r.body||'')+'\\n'+out:out); r.updated=now(); await putRecord(r); await recordChange(r); renderRecipe30(q); }});
      ai.childNodes.forEach(n=>acts.appendChild(n));
      list.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'🍱'}),el('div',{class:'it-body'},[el('div',{class:'it-title'},[r.title, r.kcal?el('span',{class:'tag green',text:r.kcal+'kcal'}):'']),el('div',{class:'it-meta',text:r.body||''})]),acts]));
    }
  }
  renderRecipe30('');
  function exportOne(r){ const blob=new Blob([`${r.title}\n热量:${r.kcal||'-'}\n${r.body||''}`],{type:'text/plain'}); const a=el('a',{href:URL.createObjectURL(blob),download:r.title+'.txt'}); a.click(); }
}

// 私厨菜谱
function cookView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('👩‍🍳','私厨菜谱库','自建收藏'));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'cook',icon:'👩‍🍳',title:'菜谱',empty:'记下你的拿手菜',
    fields:[{key:'title',label:'菜名',type:'text'},{key:'body',label:'食材与做法',type:'textarea'},{key:'tags',label:'标签',type:'tags'}]});
}

// 分时段饮水
function waterView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💧','分时段饮水提醒',''));
  const times=el('div',{class:'card card-2',style:'margin-bottom:14px'},[el('div',{class:'muted',text:'提醒时间可在「设置-全局提醒」中配置；此处记录每日饮水。'})]);
  root.appendChild(times);
  const cups=el('div',{class:'card',style:'margin-bottom:14px'});
  const now2=new Date(); const key='water_'+fmtDate(now2.getTime());
  (async()=>{ let count=await kvGet(key)||0; const render=()=>{ cups.innerHTML=''; const row=el('div',{class:'row',style:'gap:8px;flex-wrap:wrap;justify-content:center'});
    for(let i=0;i<8;i++){ row.appendChild(el('button',{class:'btn '+(i<count?'btn-primary':'btn-soft'),style:'width:54px;height:54px;border-radius:50%;font-size:22px',onclick:async()=>{ if(count===i){count++;} else {count=i;} await kvSet(key,count); render(); }}, count>i?'💧':'○')); }
    cups.append(el('div',{class:'center',style:'margin-bottom:10px'},[el('b',{text:`今日已喝 ${count}/8 杯`})]), row, el('div',{class:'center',style:'margin-top:10px'},[el('button',{class:'btn btn-ghost btn-sm',onclick:async()=>{count=0;await kvSet(key,0);render();}},'重置')]));
  }; render(); })();
  root.appendChild(cups);
}

function noteDrawer(rec, refresh){
  import('../core/utils.js').then(({drawer,el})=>{
    const ta=el('textarea',{class:'input',style:'min-height:120px',placeholder:'我的笔记…',value:rec.note||''});
    const box=el('div',{},[ta, el('div',{class:'row',style:'margin-top:10px;gap:8px'},[el('button',{class:'btn btn-primary grow',onclick:async()=>{rec.note=ta.value;rec.updated=now();await putRecord(rec);await recordChange(rec);import('../core/utils.js').then(u=>u.toast('笔记已存','ok'));drawer.close();refresh&&refresh();}},'保存笔记'),el('button',{class:'btn btn-ghost',onclick:()=>drawer.close()},'取消')])]);
    drawer.open('笔记 · '+(rec.title||''), box);
  });
}

export const subs = { train:trainView, skin:skinView, diet:dietView, recipe30:recipe30View, cook:cookView, water:waterView };
