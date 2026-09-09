// 模块六：自媒体创作中心
import { el, uid, now, fmtDate, relTime, toast, download, copyText, escapeHtml } from '../core/utils.js';
import { putRecord, recordsBySub, softDelete, kvGet, kvSet, filesByRec, getFile } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, barChart, aiItemActions, importBox, attachFile, imagePicker, fileURL } from '../core/lib.js';
import { getHotTopics } from '../core/data-services.js';

const MODULE='creator';

export const meta = { key:'creator', name:'自媒体创作', icon:'🚀', color:'var(--blue)', desc:'选题·脚本·热点' };

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('🚀','自媒体创作中心',''));
  root.appendChild(subGrid([
    { icon:'📊', title:'账号数据大盘', sub:'可视化统计', key:'dashboard', cat:'数据', onClick:()=>goSub('dashboard') },
    { icon:'👤', title:'我的账号', sub:'多平台账号管理', key:'accounts', cat:'数据', onClick:()=>goSub('accounts') },
    { icon:'🗂', title:'作品复盘存档', sub:'优化记录', key:'work', cat:'复盘', onClick:()=>goSub('work') },
    { icon:'✨', title:'文案脚本润色', sub:'智能优化', key:'polish', cat:'创作', onClick:()=>goSub('polish') },
    { icon:'🎯', title:'抖音选题库', sub:'全品类', key:'topic', cat:'选题', onClick:()=>goSub('topic') },
    { icon:'💡', title:'每日灵感', sub:'每日更新', key:'dailyinsp', cat:'灵感', onClick:()=>goSub('dailyinsp') },
    { icon:'🔥', title:'实时热门话题', sub:'信息雷达', key:'hot', cat:'热点', onClick:()=>goSub('hot') },
    { icon:'📌', title:'爆款二创参考', sub:'参考库', key:'ref', cat:'参考', onClick:()=>goSub('ref') },
    { icon:'🎬', title:'口播剧情脚本', sub:'全类型', key:'script', cat:'脚本', onClick:()=>goSub('script') },
    { icon:'🎞', title:'剪辑工坊', sub:'进度·分镜', key:'studio', cat:'剪辑', onClick:()=>goSub('studio') },
    { icon:'🗂', title:'素材库', sub:'分类管理', key:'assets', cat:'素材', onClick:()=>goSub('assets') },
  ], 'creator'));
}

// ===== 平台 / 账号 配置 =====
const DEFAULT_PLATFORMS=[{name:'抖音',icon:'🎵'},{name:'快手',icon:'🟠'},{name:'视频号',icon:'🟢'},{name:'小红书',icon:'🔴'},{name:'微博',icon:'🟡'},{name:'B站',icon:'🔵'}];
function getPlatforms(){ let c=[]; try{ c=JSON.parse(localStorage.getItem('creator_platforms')||'[]'); }catch{} return DEFAULT_PLATFORMS.concat(c); }
function getAccounts(plat){ let a=[]; try{ a=JSON.parse(localStorage.getItem('creator_accounts_'+plat)||'[]'); }catch{} return a; }
function setAccounts(plat,arr){ localStorage.setItem('creator_accounts_'+plat,JSON.stringify(arr)); }

// ===== 我的账号 =====
function myAccountsView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('👤','我的账号','多平台 · 多账号 · 记录每日数据'));
  let curPlat=getPlatforms()[0].name, curAcc=null;
  const platWrap=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(platWrap);
  const accWrap=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(accWrap);
  const formWrap=el('div',{}); root.appendChild(formWrap);
  function renderPlats(){
    const plats=getPlatforms(); if(!plats.find(p=>p.name===curPlat)) curPlat=plats[0].name;
    platWrap.innerHTML='';
    platWrap.appendChild(el('div',{class:'row between',style:'margin-bottom:10px'},[el('b',{text:'平台'}), el('div',{class:'row',style:'gap:6px'},[
      el('button',{class:'btn btn-ghost btn-sm del-btn',onclick:clearDemo},'🧹 清空示例数据'),
      el('button',{class:'btn btn-soft btn-sm add-btn',onclick:addPlatform},'＋ 添加平台')
    ])]));
    const chips=el('div',{class:'chips'});
    plats.forEach(p=>chips.appendChild(el('button',{class:'chip'+(p.name===curPlat?' chip-on':''),onclick:()=>{curPlat=p.name;renderPlats();}},(p.icon||'📱')+' '+p.name)));
    platWrap.appendChild(chips);
    renderAccs();
  }
  function addPlatform(){
    const i=el('input',{class:'input',placeholder:'平台名称，如 西瓜视频'});
    const save=el('button',{class:'btn btn-primary',onclick:()=>{ const n=i.value.trim(); if(!n){toast('名称不能为空','err');return;} let c=[];try{c=JSON.parse(localStorage.getItem('creator_platforms')||'[]');}catch{} if(c.find(x=>x.name===n)){toast('已存在','err');return;} c.push({name:n,icon:'📱'}); localStorage.setItem('creator_platforms',JSON.stringify(c)); modal.close(); renderPlats(); toast('已添加平台','ok'); }},'添加');
    modal.open('＋ 添加平台', el('div',{},[el('div',{class:'field'},[el('label',{text:'平台名'}),i]),el('div',{class:'row',style:'gap:8px;margin-top:8px'},[save,el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])]));
  }
  async function clearDemo(){
    if(!confirm('确定清空全部示例数据吗？\n\n将删除：所有账号数据记录 + 所有作品记录。\n此操作不可撤销，清空后录入的就是你自己的真实数据。')) return;
    const accs=await recordsBySub(MODULE,'account');
    const works=await recordsBySub(MODULE,'work');
    for(const r of accs) await softDelete(r.id);
    for(const r of works) await softDelete(r.id);
    toast('已清空 '+(accs.length+works.length)+' 条示例数据，现在可以录入真实数据了','ok');
    renderPlats();
  }
  function renderAccs(){
    const accs=getAccounts(curPlat);
    if(!accs.includes(curAcc)&&accs.length) curAcc=accs[0];
    accWrap.innerHTML='';
    accWrap.appendChild(el('div',{class:'row between',style:'margin-bottom:10px'},[el('b',{text:'账号（'+curPlat+'）'}), el('div',{class:'row',style:'gap:6px'},[
      el('button',{class:'btn btn-soft btn-sm add-btn',onclick:()=>{ const n=prompt('账号名称（如：主号 / 小号）：'); if(!n)return; let a=getAccounts(curPlat); if(a.includes(n)){toast('已存在','err');return;} a.push(n); setAccounts(curPlat,a); curAcc=n; renderAccs(); }},'＋ 添加账号'),
      el('button',{class:'btn btn-ghost btn-sm del-btn',onclick:async()=>{ if(!curAcc){toast('先选择账号','err');return;} if(!confirm('确定清空「'+curPlat+' · '+curAcc+'」的全部数据记录？此操作不可撤销。'))return; const items=await recordsBySub(MODULE,'account'); const mine=items.filter(r=>r.platform===curPlat&&r.account===curAcc); for(const r of mine) await softDelete(r.id); toast('已清空 '+mine.length+' 条','ok'); renderForm(); }},'🧹 清空数据')
    ])]));
    const chips=el('div',{class:'chips'});
    if(!accs.length) chips.appendChild(el('div',{class:'muted',text:'还没有账号，点「＋ 添加账号」'}));
    accs.forEach(a=>chips.appendChild(el('button',{class:'chip'+(a===curAcc?' chip-on':''),onclick:()=>{curAcc=a;renderAccs();}},a)));
    accWrap.appendChild(chips);
    renderForm();
  }
  function renderForm(){
    formWrap.innerHTML='';
    const s=el('div',{class:'card',style:'margin-top:4px'});
    const fans=el('input',{class:'input',type:'number',placeholder:'粉丝数'});
    const views=el('input',{class:'input',type:'number',placeholder:'总播放'});
    const likes=el('input',{class:'input',type:'number',placeholder:'总赞'});
    const dateI=el('input',{class:'input',type:'date',value:fmtDate(now())});
    const notes=el('input',{class:'input',placeholder:'备注（如：新视频爆了）'});
    s.append(el('div',{class:'row wrap',style:'gap:10px'},[
      el('div',{class:'field',style:'width:120px'},[el('label',{text:'粉丝'}),fans]),
      el('div',{class:'field',style:'width:120px'},[el('label',{text:'播放'}),views]),
      el('div',{class:'field',style:'width:110px'},[el('label',{text:'赞'}),likes]),
      el('div',{class:'field',style:'width:150px'},[el('label',{text:'日期'}),dateI])
    ]), el('div',{class:'field',style:'margin-top:6px'},[el('label',{text:'备注'}),notes]),
    el('button',{class:'btn btn-primary add-btn',style:'margin-top:10px',onclick:async()=>{
      if(!curAcc){toast('先添加账号','err');return;}
      await putRecord({id:uid(),module:MODULE,sub:'account',created:now(),updated:now(),title:curPlat+'·'+curAcc,platform:curPlat,account:curAcc,fans:parseFloat(fans.value)||0,views:parseFloat(views.value)||0,likes:parseFloat(likes.value)||0,date:dateI.value,notes:notes.value.trim()});
      await recordChange({module:MODULE,sub:'account'}); toast('已记录','ok'); renderForm();
    }},'💾 记录今日数据'));
    formWrap.appendChild(s);
    (async()=>{ const items=await recordsBySub(MODULE,'account'); const list=items.filter(r=>r.platform===curPlat&&r.account===curAcc).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
      const h=el('div',{class:'list',style:'margin-top:12px'});
      if(!list.length) h.appendChild(el('div',{class:'muted',text:'暂无历史记录'}));
      list.forEach(r=>h.appendChild(el('div',{class:'item'},[el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.date+(r.notes?' · '+r.notes:'')}),el('div',{class:'it-meta',text:'粉丝 '+(r.fans||0)+' · 播放 '+(r.views||0)+' · 赞 '+(r.likes||0)})]),el('div',{class:'it-actions'},[el('button',{class:'mini-btn del-btn',onclick:async()=>{await softDelete(r.id);renderForm();}},'🗑')])])));
      formWrap.appendChild(el('div',{class:'sec-title',style:'margin-top:14px'},[el('span',{class:'st-ico',html:'🕑'}),el('span',{text:'历史记录'})]));
      formWrap.appendChild(h);
    })();
  }
  renderPlats();
}

// ===== 上传作品 =====
function addWorkModal(){
  const titleI=el('input',{class:'input',placeholder:'作品标题'});
  const platSel=el('select',{class:'input'}); getPlatforms().forEach(p=>platSel.appendChild(el('option',{value:p.name,text:p.name})));
  const dateI=el('input',{class:'input',type:'date',value:fmtDate(now())});
  const linkI=el('input',{class:'input',placeholder:'作品链接 https://…'});
  const viewsI=el('input',{class:'input',type:'number',placeholder:'播放量'});
  const likesI=el('input',{class:'input',type:'number',placeholder:'点赞'});
  const commentsI=el('input',{class:'input',type:'number',placeholder:'评论'});
  const imp=importBox('📎 封面/视频');
  const save=el('button',{class:'btn btn-primary',onclick:async()=>{
    const t=titleI.value.trim(); if(!t){toast('填标题','err');return;}
    const rec={id:uid(),module:MODULE,sub:'work',created:now(),updated:now(),title:t,platform:platSel.value,date:dateI.value,link:linkI.value.trim(),views:parseFloat(viewsI.value)||0,likes:parseFloat(likesI.value)||0,comments:parseFloat(commentsI.value)||0};
    const saved=await putRecord(rec);
    for(const f of imp.getValue().files) await attachFile(saved.id,f);
    await recordChange(saved); modal.close(); toast('作品已收录','ok'); if(window.__dashRefresh) window.__dashRefresh();
  }},'保存');
  modal.open('➕ 上传作品', el('div',{},[
    el('div',{class:'field'},[el('label',{text:'标题'}),titleI]),
    el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field grow'},[el('label',{text:'平台'}),platSel]),el('div',{class:'field',style:'width:160px'},[el('label',{text:'日期'}),dateI])]),
    el('div',{class:'field'},[el('label',{text:'作品链接'}),linkI]),
    el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field',style:'width:120px'},[el('label',{text:'播放'}),viewsI]),el('div',{class:'field',style:'width:110px'},[el('label',{text:'赞'}),likesI]),el('div',{class:'field',style:'width:110px'},[el('label',{text:'评论'}),commentsI])]),
    el('div',{class:'field'},[el('label',{text:'封面 / 视频'}),imp]),
    el('div',{class:'row',style:'gap:8px;margin-top:10px'},[save,el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])
  ]));
}

// SVG 折线趋势图（时间序列：播放量 / 粉丝增长等）
function lineChartSVG(data,{color='#7c9cf5',height=190}={}){
  const W=560,H=height,pl=46,pr=12,pt=14,pb=26;
  const arr=data||[];
  const vals=arr.map(d=>Number(d.value)||0);
  const max=Math.max(...vals,1), min=Math.min(...vals,0);
  const span=(max-min)||1;
  const iw=W-pl-pr, ih=H-pt-pb, n=vals.length;
  const X=i=>n<=1?pl+iw/2:pl+iw*i/(n-1);
  const Y=v=>pt+ih-(v-min)/span*ih;
  const grid='rgba(140,140,160,.22)', axis='#9a94ad';
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" style="display:block">`;
  for(let g=0;g<=3;g++){
    const y=pt+ih*g/3, v=Math.round(max-(max-min)*g/3);
    s+=`<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W-pr}" y2="${y.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`;
    s+=`<text x="${pl-6}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10" fill="${axis}">${v}</text>`;
  }
  if(n>0){
    const pts=vals.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' ');
    if(n>1){
      s+=`<polygon points="${pl},${pt+ih} ${pts} ${X(n-1).toFixed(1)},${pt+ih}" fill="${color}" opacity="0.10"/>`;
      s+=`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    const step=Math.max(1,Math.ceil(n/8));
    arr.forEach((d,i)=>{
      s+=`<circle cx="${X(i).toFixed(1)}" cy="${Y(vals[i]).toFixed(1)}" r="3" fill="#fff" stroke="${color}" stroke-width="2"/>`;
      if(i%step===0||i===n-1) s+=`<text x="${X(i).toFixed(1)}" y="${H-8}" text-anchor="middle" font-size="10" fill="${axis}">${d.label}</text>`;
    });
  } else {
    s+=`<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="12" fill="${axis}">暂无数据</text>`;
  }
  s+=`</svg>`;
  const box=el('div',{class:'card',style:'padding:12px 8px;margin:0'});
  box.innerHTML=s;
  return box;
}

// ===== 数据大盘 =====
function dashboardView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📊','账号数据大盘','我的账号 · 每日数据 · 作品表现 · 多维度分析'));
  root.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-bottom:14px'},[
    el('button',{class:'btn btn-soft btn-sm',onclick:()=>myAccountsView(root,back)},'👤 我的账号 / 记录数据'),
    el('button',{class:'btn btn-soft btn-sm add-btn',onclick:addWorkModal},'➕ 上传作品链接')
  ]));
  let range=7;
  const rangeWrap=el('div',{class:'chips',style:'margin-bottom:14px'});
  function updateRangeChips(){ rangeWrap.innerHTML=''; [[7,'近7天'],[30,'近30天'],[90,'近90天']].forEach(([n,l])=>rangeWrap.appendChild(el('button',{class:'chip'+(range===n?' chip-on':''),onclick:()=>{range=n;updateRangeChips();dashboardView(root,back);}},l))); }
  root.appendChild(rangeWrap); updateRangeChips();
  const ov=el('div',{class:'grid grid-2',style:'margin-bottom:14px'}); root.appendChild(ov);
  const sec1=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(sec1);
  const secFans=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(secFans);
  const sec2=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(sec2);
  const sec3=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(sec3);
  const sec4=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(sec4);
  const sec5=el('div',{class:'card',style:'margin-bottom:14px'}); root.appendChild(sec5);
  window.__dashRefresh=()=>dashboardView(root,back);
  (async()=>{
    const accs=await recordsBySub(MODULE,'account');
    const works=await recordsBySub(MODULE,'work');
    const latest={}; accs.forEach(r=>{ if(!latest[r.platform]||r.date>latest[r.platform].date) latest[r.platform]=r; });
    const arr=Object.values(latest);
    const tf=arr.reduce((a,r)=>a+(r.fans||0),0), tv=arr.reduce((a,r)=>a+(r.views||0),0), tl=arr.reduce((a,r)=>a+(r.likes||0),0);
    const rate = tv>0 ? (tl/tv*100) : 0;
    ov.innerHTML='';
    ov.append(
      el('div',{class:'stat'},[el('div',{class:'s-val',text:tf.toLocaleString()}),el('div',{class:'s-label',text:'总粉丝'})]),
      el('div',{class:'stat'},[el('div',{class:'s-val',text:tv.toLocaleString()}),el('div',{class:'s-label',text:'总播放'})]),
      el('div',{class:'stat'},[el('div',{class:'s-val',text:tl.toLocaleString()}),el('div',{class:'s-label',text:'总赞'})]),
      el('div',{class:'stat'},[el('div',{class:'s-val',text:works.length.toString()}),el('div',{class:'s-label',text:'作品数'})]),
      el('div',{class:'stat'},[el('div',{class:'s-val',text:rate.toFixed(1)+'%'}),el('div',{class:'s-label',text:'平均赞播比'})])
    );
    const days=[]; const base=new Date(); for(let i=range-1;i>=0;i--){ const d=new Date(base); d.setDate(base.getDate()-i); days.push(fmtDate(d)); }
    const byDay={}; days.forEach(d=>byDay[d]=0); accs.forEach(r=>{ if(byDay[r.date]!==undefined) byDay[r.date]+=(r.views||0); });
    // 粉丝按天聚合：每天取各平台最新粉丝之和（前向填充缺口）
    const fansByDay={}; days.forEach(d=>fansByDay[d]=undefined);
    const byPlat={}; accs.forEach(r=>{ (byPlat[r.platform]=byPlat[r.platform]||[]).push(r); });
    Object.keys(byPlat).forEach(p=>{ const rs=byPlat[p].sort((a,b)=>a.date.localeCompare(b.date)); const cum={}; rs.forEach(r=>{ cum[r.date]=r.fans||0; }); let last; days.forEach(d=>{ if(cum[d]!==undefined) last=cum[d]; if(last!==undefined) fansByDay[d]=(fansByDay[d]||0)+last; }); });
    const rngLabel = range===7?'近7天':range===30?'近30天':'近90天';
    sec1.innerHTML=''; sec1.append(el('h4',{text:'📈 '+rngLabel+' 播放趋势',style:'margin:0 0 12px'}), lineChartSVG(days.map((d)=>({label:d.slice(5),value:byDay[d]||0})),{color:'#7c9cf5'}));
    secFans.innerHTML=''; secFans.append(el('h4',{text:'👥 粉丝增长趋势',style:'margin:0 0 12px'}), lineChartSVG(days.map((d)=>({label:d.slice(5),value:fansByDay[d]||0})),{color:'#f4738f'}));
    sec2.innerHTML=''; sec2.append(el('h4',{text:'🌐 各平台粉丝对比',style:'margin:0 0 12px'}), barChart(arr.map((r,i)=>({label:r.platform,value:r.fans||0,color:['var(--blue)','var(--primary)','var(--green)','var(--purple)','var(--orange)','var(--pink)'][i%6]})),{fmt:v=>v.toLocaleString()}));
    sec3.innerHTML=''; sec3.appendChild(el('h4',{text:'🏆 作品 Top 榜',style:'margin:0 0 12px'}));
    const top=works.slice().sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,8);
    const wlist=el('div',{class:'list'}); sec3.appendChild(wlist);
    if(!top.length) wlist.appendChild(el('div',{class:'muted',text:'还没有作品，点「上传作品链接」添加'}));
    top.forEach(r=>{ const ir=(r.views||0)>0?((r.likes||0)/(r.views||0)*100).toFixed(1)+'%':'-'; const acts=el('div',{class:'it-actions'}); if(r.link) acts.appendChild(el('a',{class:'mini-btn',href:r.link,target:'_blank',rel:'noopener'},'🔗')); acts.appendChild(el('button',{class:'mini-btn del-btn',onclick:async()=>{await softDelete(r.id);dashboardView(root,back);}},'🗑')); wlist.appendChild(el('div',{class:'item'},[el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title+(r.platform?(' · '+r.platform):'')}),el('div',{class:'it-meta',text:'播放 '+(r.views||0).toLocaleString()+' · 赞 '+(r.likes||0).toLocaleString()+' · 赞播比 '+ir})]),acts])); });
    sec4.innerHTML='';
    const goalKey='creator_goal_fans'; let goal=parseInt(await kvGet(goalKey)||'0',10);
    const goalIn=el('input',{class:'input',type:'number',value:goal||'',placeholder:'本月粉丝目标',style:'width:160px'});
    const setGoal=el('button',{class:'btn btn-soft btn-sm add-btn',onclick:async()=>{ await kvSet(goalKey,(parseInt(goalIn.value,10)||0).toString()); dashboardView(root,back); toast('目标已更新','ok'); }},'设定');
    const pct=goal>0?Math.min(100,Math.round(tf/goal*100)):0;
    sec4.append(el('h4',{text:'🎯 本月粉丝目标',style:'margin:0 0 10px'}), el('div',{class:'row',style:'gap:8px;margin-bottom:10px'},[goalIn,setGoal]), el('div',{style:'background:var(--card-2);height:14px;border-radius:999px;overflow:hidden'},[el('div',{style:`width:${pct}%;height:100%;background:var(--primary);border-radius:999px`})]), el('div',{class:'muted',style:'margin-top:6px',text:'当前 '+tf.toLocaleString()+' / 目标 '+(goal?goal.toLocaleString():'未设')+'（'+pct+'%）'}));
    sec5.innerHTML=''; const cnt={}; days.forEach(d=>cnt[d]=0); accs.concat(works).forEach(r=>{ if(cnt[r.date]!==undefined) cnt[r.date]++; });
    sec5.append(el('h4',{text:'🔥 创作节奏（'+rngLabel+'记录）',style:'margin:0 0 12px'}), barChart(days.map((d)=>({label:d.slice(5),value:cnt[d],color:'var(--purple)'})),{fmt:v=>v+'条'}));
  })();
}

// 作品复盘
function workView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🗂','作品复盘优化存档',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'work',icon:'🗂',title:'作品',empty:'记录每支作品的数据与复盘',
    fields:[{key:'title',label:'作品标题',type:'text'},{key:'body',label:'复盘/优化点',type:'textarea'},{key:'tags',label:'标签',type:'tags'}]});
}

// 文案润色
function polishView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('✨','文案脚本智能润色',''));
  const input=el('textarea',{class:'input',style:'min-height:120px',placeholder:'粘贴你的文案…'});
  const out=el('textarea',{class:'input',style:'min-height:120px',placeholder:'润色结果…'}); out.readOnly=true;
  const tips=el('div',{class:'card card-2',style:'margin-top:10px'});
  const polish=async()=>{ const txt=input.value; if(!txt.trim()){toast('先输入文案','err');return;}
    const ep=await kvGet('llm_endpoint'); let res=txt, tps=[];
    if(ep){ try{ const d=await import('../core/network.js').then(n=>n.fetchJSON(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'润色以下文案，使其更吸引人、更具网感：\n'+txt})})); res=d.result||d.text||txt; }catch{} }
    else { // 本地基础润色
      res = txt.replace(/。/g,'。\n').replace(/，/g,'，').trim();
      if(!/[!?？！]/.test(res)) res+=' ✨';
      res = '✨'+res;
      tps=['建议：开头加钩子(悬念/痛点)','建议：多用短句与 emoji 增强节奏','建议：结尾加互动引导(评论/收藏)'];
    }
    out.value=res; tips.innerHTML=''; tips.appendChild(el('b',{text:'优化建议'})); tps.forEach(t=>tips.appendChild(el('div',{class:'muted',text:'· '+t})));
  };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'field'},[el('label',{text:'原文案'}),input]),el('button',{class:'btn btn-primary',onclick:polish},'✨ 智能润色')]),
    el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'润色后'}),out]),el('div',{class:'row',style:'gap:8px'},[el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(out.value)},'📋 复制'),el('button',{class:'btn btn-soft btn-sm',onclick:()=>download(new Blob([out.value],{type:'text/plain'}),'润色文案.txt')},'⬇ 导出')])]),
    tips);
}

// 选题库
function topicView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎯','全品类抖音选题库',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'topic',icon:'🎯',title:'选题',empty:'按品类收集爆款选题',
    fields:[{key:'title',label:'选题',type:'text'},{key:'category',label:'品类',type:'select',options:[{value:'美食',label:'美食'},{value:'知识',label:'知识'},{value:'情感',label:'情感'},{value:'搞笑',label:'搞笑'},{value:'颜值',label:'颜值'},{value:'生活',label:'生活'},{value:'测评',label:'测评'}]},{key:'body',label:'角度/说明',type:'textarea'}]});
}

// 每日灵感
function dailyInspView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💡','每日灵感',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'dailyinsp',icon:'💡',title:'灵感',empty:'随手收集创作灵感',
    fields:[{key:'title',label:'主题',type:'text'},{key:'body',label:'想法',type:'textarea'}]});
}

// 热门话题
let _hotTimer=null;
function hotView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🔥','实时热门话题','信息雷达 · 自动刷新')); const srcTag=el('span',{class:'tag',text:'连接中'});
  const radar=el('div',{class:'list'}); root.appendChild(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'row between'},[el('b',{text:'全网热点雷达'}),srcTag]),radar]));
  async function refresh(){ const h=await getHotTopics(); srcTag.textContent=h.source==='live'?'实时':'演示'; srcTag.className='tag '+(h.source==='live'?'green':'yellow'); radar.innerHTML=''; h.list.forEach(t=>radar.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'🔥'}),el('div',{class:'it-body'},[el('div',{class:'it-title',html:(t.tag?`<span class="tag">${t.tag}</span> `:'')+escapeHtml(t.title)}),el('div',{class:'it-meta',text:'热度 '+(t.heat||'')})]),el('div',{class:'it-actions'},[el('button',{class:'mini-btn',onclick:()=>copyText(t.title)},'📋'),el('button',{class:'mini-btn',onclick:async()=>{await putRecord({id:uid(),module:MODULE,sub:'hot',created:now(),updated:now(),title:t.title,body:t.title});await recordChange({module:MODULE,sub:'hot'});toast('已收藏','ok');}},'⭐')])]))); }
  refresh(); _hotTimer=setInterval(refresh,30000);
  // 收藏
  root.appendChild(secTitle('⭐','我的热点收藏',''));
  const fav=el('div',{class:'list'}); root.appendChild(fav);
  (async()=>{ const items=await recordsBySub(MODULE,'hot'); items.sort((a,b)=>b.created-a.created);
    for(const r of items){ const acts=el('div',{class:'it-actions'},[el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);hotView(root,back);}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'热点',body:r.body||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?(r.body||'')+'\\n'+out:out),updated:now()};await putRecord(upd);await recordChange(upd);hotView(root,back); }});
      ai.childNodes.forEach(n=>acts.appendChild(n));
      fav.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'⭐'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title})]),acts]));
    }
  })();
}
window.addEventListener('hashchange',()=>{ if(_hotTimer){clearInterval(_hotTimer);_hotTimer=null;} });

// 爆款二创参考
function refView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📌','爆款二创参考库',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'ref',icon:'📌',title:'参考',empty:'收集爆款二创灵感',
    fields:[{key:'title',label:'来源/标题',type:'text'},{key:'body',label:'二创角度',type:'textarea'},{key:'tags',label:'标签',type:'tags'}]});
}

// 口播脚本
function scriptView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎬','短视频口播剧情脚本库','全类型'));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'script',icon:'🎬',title:'脚本',empty:'保存各类口播/剧情脚本',
    fields:[{key:'title',label:'标题',type:'text'},{key:'type',label:'类型',type:'select',options:[{value:'口播',label:'口播'},{value:'剧情',label:'剧情'},{value:'vlog',label:'vlog'},{value:'种草',label:'种草'}]},{key:'body',label:'脚本正文',type:'textarea'}]});
}

// ===== 剪辑工坊 =====
function studioView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎬','剪辑工坊','项目进度 · 分镜要点 · 交付清单'));
  const STATES=['待剪辑','剪辑中','待审核','已发布'];
  const titleI=el('input',{class:'input',placeholder:'项目名称，如：露营vlog第3期'});
  const platI=el('input',{class:'input',placeholder:'平台，如 抖音'});
  const shotI=el('textarea',{class:'input',rows:2,placeholder:'分镜要点（每行一条）'});
  const dueI=el('input',{class:'input',type:'date',value:fmtDate(now())});
  const addBtn=el('button',{class:'btn btn-primary add-btn',onclick:async()=>{
    const t=titleI.value.trim(); if(!t){toast('先填项目名称','err');return;}
    await putRecord({id:uid(),module:MODULE,sub:'studio',created:now(),updated:now(),title:t,platform:platI.value.trim(),state:'待剪辑',shots:shotI.value.trim(),due:dueI.value});
    await recordChange({module:MODULE,sub:'studio'}); toast('已创建','ok');
    titleI.value=''; platI.value=''; shotI.value=''; render();
  }},'＋ 新建剪辑项目');
  const list=el('div',{class:'list'});
  root.append(
    el('div',{class:'card',style:'margin-bottom:14px'},[
      el('div',{class:'row wrap',style:'gap:10px'},[
        el('div',{class:'field grow'},[el('label',{text:'项目名称'}),titleI]),
        el('div',{class:'field',style:'width:130px'},[el('label',{text:'平台'}),platI]),
        el('div',{class:'field',style:'width:150px'},[el('label',{text:'截止'}),dueI])
      ]),
      el('div',{class:'field',style:'margin-top:8px'},[el('label',{text:'分镜要点'}),shotI]),
      el('div',{class:'row',style:'margin-top:10px'},[addBtn])
    ]),
    list
  );
  async function render(){
    list.innerHTML='';
    const items=(await recordsBySub(MODULE,'studio')).sort((a,b)=>(b.created||0)-(a.created||0));
    if(!items.length){ list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🎬'}),el('div',{text:'还没有剪辑项目，在上面新建一个'})])); return; }
    for(const r of items){
      const si=Math.max(0,STATES.indexOf(r.state||'待剪辑'));
      const pct=Math.round((si+1)/STATES.length*100);
      const acts=el('div',{class:'it-actions'});
      acts.appendChild(el('button',{class:'mini-btn',onclick:async()=>{ const nx=STATES[(si+1)%STATES.length]; r.state=nx; r.updated=now(); await putRecord(r); await recordChange(r); render(); toast('状态：'+nx,'ok'); }},'▶ 推进'));
      acts.appendChild(el('button',{class:'mini-btn del-btn',onclick:async()=>{ await softDelete(r.id); render(); }},'🗑'));
      const card=el('div',{class:'item'});
      const body=el('div',{class:'it-body'});
      body.appendChild(el('div',{class:'it-title',text:(r.title||'未命名')+(r.platform?(' · '+r.platform):'')}));
      body.appendChild(el('div',{class:'it-meta',text:'状态 '+(r.state||'待剪辑')+(r.due?(' · 截止 '+r.due):'')}));
      body.appendChild(el('div',{style:'background:var(--card-2);height:8px;border-radius:999px;overflow:hidden;margin-top:6px'},[el('div',{style:'width:'+pct+'%;height:100%;background:var(--primary);border-radius:999px'})]));
      if(r.shots) body.appendChild(el('div',{class:'it-meta',style:'white-space:pre-wrap;margin-top:6px',text:r.shots.slice(0,120)}));
      card.append(el('div',{class:'it-ico',html:'🎬'}), body, acts);
      list.appendChild(card);
    }
  }
  render();
}

// ===== 素材库 =====
function assetsView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🗂','素材库','视频/图片/音乐/文案/链接 分类管理'));
  const TYPES=['视频','图片','音乐','文案','模板','字体','链接'];
  const ICONS={视频:'🎞',图片:'🖼',音乐:'🎵',文案:'📝',模板:'🧩',字体:'🔤',链接:'🔗'};
  const nameI=el('input',{class:'input',placeholder:'素材名称'});
  const typeSel=el('select',{class:'input'}); TYPES.forEach(t=>typeSel.appendChild(el('option',{value:t,text:t})));
  const tagI=el('input',{class:'input',placeholder:'标签，逗号分隔'});
  const linkI=el('input',{class:'input',placeholder:'链接（可选）'});
  const noteI=el('input',{class:'input',placeholder:'备注（可选）'});
  const picker=imagePicker('素材文件（可选）',{multiple:false});
  const addBtn=el('button',{class:'btn btn-primary add-btn',onclick:async()=>{
    const t=nameI.value.trim(); if(!t){toast('先填素材名称','err');return;}
    const rec={id:uid(),module:MODULE,sub:'asset',created:now(),updated:now(),title:t,type:typeSel.value,tags:tagI.value.split(',').map(s=>s.trim()).filter(Boolean),link:linkI.value.trim(),note:noteI.value.trim()};
    await putRecord(rec);
    const fs=(typeof picker.getFiles==='function')?(picker.getFiles()||[]):[];
    if(fs.length) await attachFile(rec.id, fs[0]);
    await recordChange(rec); toast('已添加','ok');
    nameI.value=''; tagI.value=''; linkI.value=''; noteI.value=''; render();
  }},'＋ 添加素材');
  const searchI=el('input',{class:'input',placeholder:'🔍 搜索名称 / 标签 / 备注'});
  const filterWrap=el('div',{class:'chips'});
  let curType='全部';
  const list=el('div',{class:'list'});
  function renderFilters(){
    filterWrap.innerHTML='';
    ['全部'].concat(TYPES).forEach(t=>filterWrap.appendChild(el('button',{class:'chip'+(curType===t?' chip-on':''),onclick:()=>{curType=t;renderFilters();render();}},t)));
  }
  searchI.oninput=()=>render();
  root.append(
    el('div',{class:'card',style:'margin-bottom:14px'},[
      el('div',{class:'row wrap',style:'gap:10px'},[
        el('div',{class:'field grow'},[el('label',{text:'名称'}),nameI]),
        el('div',{class:'field',style:'width:120px'},[el('label',{text:'类型'}),typeSel])
      ]),
      el('div',{class:'row wrap',style:'gap:10px;margin-top:8px'},[
        el('div',{class:'field grow'},[el('label',{text:'标签'}),tagI]),
        el('div',{class:'field grow'},[el('label',{text:'链接'}),linkI])
      ]),
      el('div',{class:'field',style:'margin-top:8px'},[el('label',{text:'备注'}),noteI]),
      el('div',{style:'margin-top:8px'},[picker]),
      el('div',{class:'row',style:'margin-top:10px'},[addBtn])
    ]),
    el('div',{class:'card',style:'margin-bottom:14px'},[filterWrap, el('div',{style:'margin-top:8px'},[searchI])]),
    list
  );
  async function render(){
    list.innerHTML='';
    const items=(await recordsBySub(MODULE,'asset')).sort((a,b)=>(b.created||0)-(a.created||0));
    const q=searchI.value.trim().toLowerCase();
    const arr=items.filter(r=>(curType==='全部'||r.type===curType) && (!q||(r.title||'').toLowerCase().includes(q)||(r.note||'').toLowerCase().includes(q)||(r.tags||[]).join(' ').toLowerCase().includes(q)));
    if(!arr.length){ list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🗂'}),el('div',{text:'没有匹配的素材'})])); return; }
    for(const r of arr){
      const files=await filesByRec(r.id);
      const u=await fileURL(r.id);
      const acts=el('div',{class:'it-actions'});
      if(r.link) acts.appendChild(el('a',{class:'mini-btn',href:r.link,target:'_blank',rel:'noopener'},'🔗'));
      if(files.length) acts.appendChild(el('button',{class:'mini-btn',onclick:async()=>{ const f=await getFile(files[0].id); if(f&&f.blob) download(f.blob,(r.title||'素材')); }},'⬇'));
      acts.appendChild(el('button',{class:'mini-btn del-btn',onclick:async()=>{ await softDelete(r.id); render(); }},'🗑'));
      const card=el('div',{class:'item'});
      const body=el('div',{class:'it-body'});
      body.appendChild(el('div',{class:'it-title',text:(r.title||'未命名')}));
      body.appendChild(el('div',{class:'it-meta',text:(r.type||'')+(r.note?(' · '+r.note):'')}));
      if((r.tags||[]).length) body.appendChild(el('div',{class:'it-meta',style:'font-size:12px',text:'# '+r.tags.join(' # ')}));
      if(u&&r.type==='图片') card.append(el('img',{src:u,style:'width:56px;height:56px;object-fit:cover;border-radius:10px'}), body, acts);
      else card.append(el('div',{class:'it-ico',html:ICONS[r.type]||'🗂'}), body, acts);
      list.appendChild(card);
    }
  }
  renderFilters(); render();
}

export const subs = { dashboard:dashboardView, accounts:myAccountsView, work:workView, polish:polishView, topic:topicView, dailyinsp:dailyInspView, hot:hotView, ref:refView, script:scriptView, studio:studioView, assets:assetsView };
