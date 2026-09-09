// 模块四：资产记账理财
import { el, uid, now, fmtDate, fmtDateTime, relTime, toast, modal, download, monthKey, escapeHtml } from '../core/utils.js';
import { putRecord, recordsBySub, softDelete, kvGet, kvSet, allRecords } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, barChart, exportRecords, listToolbar, aiItemActions, favoriteBtn, importBox, applyImport, renderImport } from '../core/lib.js';
import { getQuotes, getHotTopics } from '../core/data-services.js';

const MODULE='finance';
const DEF_CATS = { expense:['餐饮','交通','购物','居住','娱乐','医疗','学习','其他'], income:['工资','兼职','理财','红包','其他'] };

export const meta = { key:'finance', name:'资产记账', icon:'💰', color:'var(--primary)', desc:'记账·预算·行情' };

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('💰','资产记账理财',''));
  root.appendChild(subGrid([
    { icon:'🧾', title:'智能收支记账', sub:'自定义分类', key:'ledger', cat:'记账', onClick:()=>goSub('ledger') },
    { icon:'⚠️', title:'月度预算预警', sub:'超支提醒', key:'budget', cat:'预算', onClick:()=>goSub('budget') },
    { icon:'💳', title:'周期账单还款', sub:'到期提醒', key:'bill', cat:'账单', onClick:()=>goSub('bill') },
    { icon:'📊', title:'数据图表同步', sub:'云端可视化', key:'chart', cat:'统计', onClick:()=>goSub('chart') },
    { icon:'🎁', title:'份子钱人情台账', sub:'永久存档', key:'gift', cat:'人情', onClick:()=>goSub('gift') },
    { icon:'📈', title:'实时行情+总资产', sub:'黄金/基金/A股', key:'market', cat:'行情', onClick:()=>goSub('market') },
  ], 'finance'));
}

async function getCats(){ let c=await kvGet('finance_cats'); if(!c){c=DEF_CATS;await kvSet('finance_cats',c);} return c; }

// 给某条记录导入凭证（图片/视频/链接/文字），存入附件或字段
async function attachImport(rec, refresh, label){
  const box=importBox('📎 选择凭证(图/视频/链接/文字)');
  modal.open('导入凭证 · '+(label||''), el('div',{},[box, el('div',{class:'row',style:'margin-top:12px;gap:8px'},[
    el('button',{class:'btn btn-primary grow',onclick:async()=>{
      const v=box.getValue();
      if(!v||((!v.files||!v.files.length)&&!v.link&&!v.text)){toast('请选择内容','err');return;}
      await applyImport(rec.id, v);
      if(v.link) rec.link=v.link; if(v.text) rec.importedText=v.text; rec.updated=now();
      await putRecord(rec); await recordChange(rec);
      toast('已导入凭证','ok'); modal.close(); refresh&&refresh();
    }},'保存'),
    el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
  ])]));
}

// 记账
function ledgerView(root, back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🧾','智能收支记账',''));
  const cats=DEF_CATS;
  let mode='expense';
  const seg=el('div',{class:'seg',style:'margin-bottom:14px'},[
    el('button',{class:'on',text:'支出',onclick:e=>{mode='expense';e.target.classList.add('on');e.target.nextSibling.classList.remove('on');renderCat();}}),
    el('button',{text:'收入',onclick:e=>{mode='income';e.target.classList.add('on');e.target.previousSibling.classList.remove('on');renderCat();}}),
  ]);
  const amt=el('input',{class:'input',type:'number',step:'0.01',placeholder:'金额'}); amt.value=''; const amtWrap=el('div',{class:'field'},[el('label',{text:'金额'}),amt]);
  const catSel=el('select',{class:'input'});
  const noteI=el('input',{class:'input',placeholder:'备注'});
  const dateI=el('input',{class:'input',type:'date',value:fmtDate(now())});
  function renderCat(){ catSel.innerHTML=''; (mode==='expense'?cats.expense:cats.income).forEach(c=>catSel.appendChild(el('option',{value:c,text:c}))); }
  renderCat();
  const form=el('div',{class:'card',style:'margin-bottom:14px'},[
    seg, amtWrap,
    el('div',{class:'row wrap',style:'gap:10px'},[
      el('div',{class:'field grow'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field',style:'width:160px'},[el('label',{text:'日期'}),dateI])
    ]),
    el('div',{class:'field'},[el('label',{text:'备注'}),noteI]),
    el('button',{class:'btn btn-primary',onclick:async()=>{ const v=parseFloat(amt.value); if(!v||v<=0){toast('输入金额','err');return;}
      await putRecord({id:uid(),module:MODULE,sub:'ledger',created:now(),updated:now(),type:mode,amount:v,category:catSel.value,note:noteI.value,date:dateI.value});
      await recordChange({module:MODULE,sub:'ledger'}); toast('已记账','ok'); amt.value=''; noteI.value=''; ledgerView(root,back); }},'保存记账')
  ]);
  root.append(form, secTitle('📜','明细（本月）',''),
    el('div',{class:'row',style:'gap:8px;margin-bottom:10px'},[el('button',{class:'btn btn-soft btn-sm',onclick:exportRecords('ledger',MODULE)},'⬇ 导出')]));
  root.appendChild(listToolbar({ searchPh:'搜索分类/备注', render:(q)=>renderLedger(q) }));
  const list=el('div',{class:'list'}); root.appendChild(list);
  async function renderLedger(q=''){
    const items=await recordsBySub(MODULE,'ledger'); const mk=monthKey(now());
    const cur=items.filter(r=>monthKey(new Date(r.date).getTime())===mk).sort((a,b)=>b.date.localeCompare(a.date));
    const ql=q.trim().toLowerCase();
    const filtered=ql?cur.filter(r=>(r.category+' '+(r.note||'')).toLowerCase().includes(ql)):cur;
    list.innerHTML='';
    if(!filtered.length){list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'🧾'}),el('div',{text:cur.length?'本月无匹配项':'本月还没有记账'})]));return;}
    let exp=0,inc=0; cur.forEach(r=>{ if(r.type==='expense')exp+=r.amount; else inc+=r.amount; });
    list.appendChild(el('div',{class:'stat',style:'margin-bottom:10px'},[el('div',{class:'s-val',html:`结余 ¥${(inc-exp).toFixed(2)}`}),el('div',{class:'s-label',html:`收入 ¥${inc.toFixed(2)} · 支出 ¥${exp.toFixed(2)}`})]));
    for(const r of filtered){ const acts=el('div',{class:'it-actions'},[
        favoriteBtn(r,()=>renderLedger(q)),
        el('button',{class:'mini-btn',title:'导入凭证',onclick:()=>attachImport(r,()=>renderLedger(q),r.category||'记账')},'📎'),
        el('button',{class:'mini-btn',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);renderLedger(q);}}},'🗑')
      ]);
      const ai=await aiItemActions({title:r.category||'记账',body:r.note||'',onApply:async(out,mode)=>{ r.note=mode==='generate'?out:(mode==='continue'?(r.note||'')+' '+out:out); r.updated=now(); await putRecord(r); await recordChange(r); renderLedger(q); }});
      ai.childNodes.forEach(n=>acts.appendChild(n));
      const prev=await renderImport(r);
      list.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:r.type==='expense'?'💸':'💵'}),
        el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.category+(r.note?(' · '+r.note):'')}),el('div',{class:'it-meta',text:r.date}),prev||'']),
        el('div',{class:r.type==='expense'?'down':'up',style:'font-weight:800',text:(r.type==='expense'?'-':'+')+'¥'+r.amount.toFixed(2)}),
        acts
      ]));
    }
  }
  renderLedger('');
}

// 预算
function budgetView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('⚠️','月度预算预警',''));
  const budgetI=el('input',{class:'input',type:'number',placeholder:'本月总预算'});
  (async()=>{ const b=await kvGet('finance_budget'); if(b)budgetI.value=b; })();
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'field'},[el('label',{text:'本月总预算(¥)'}),budgetI]),el('button',{class:'btn btn-primary',onclick:async()=>{await kvSet('finance_budget',parseFloat(budgetI.value)||0);toast('已设置','ok');budgetView(root,back);}},'保存')]));
  const box=el('div',{}); root.appendChild(box);
  (async()=>{ const b=await kvGet('finance_budget')||0; const items=await recordsBySub(MODULE,'ledger'); const mk=monthKey(now());
    const exp=items.filter(r=>r.type==='expense'&&monthKey(new Date(r.date).getTime())===mk).reduce((a,r)=>a+r.amount,0);
    const pct=b?Math.round(exp/b*100):0;
    box.append(el('div',{class:'stat'},[el('div',{class:'s-val',html:`已花 ¥${exp.toFixed(2)}`}),el('div',{class:'s-label',text:`预算 ¥${b.toFixed(2)} · 使用 ${pct}%`})]),
      el('div',{style:'background:var(--card-2);border-radius:999px;height:18px;overflow:hidden;margin-top:12px'},[el('div',{style:`width:${Math.min(100,pct)}%;height:100%;background:${pct>100?'#E7728A':(pct>80?'var(--yellow)':'var(--green)')}`})]),
      pct>100?el('div',{class:'tag yellow',style:'margin-top:10px',text:'⚠️ 已超支！'}):(pct>80?el('div',{class:'tag yellow',style:'margin-top:10px',text:'⏳ 预算接近上限'}):''));
  })();
}

// 账单
function billView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💳','周期账单还款日','到期自动提醒'));
  const nameI=el('input',{class:'input',placeholder:'账单名称'});
  const amtI=el('input',{class:'input',type:'number',step:'0.01',placeholder:'金额'});
  const dueI=el('input',{class:'input',type:'date'});
  const cycleI=el('select',{class:'input'});['每月','每季','每年','一次性'].forEach(c=>cycleI.appendChild(el('option',{value:c,text:c})));
  const form=el('div',{class:'card',style:'margin-bottom:14px'},[
    el('div',{class:'field'},[el('label',{text:'名称'}),nameI]),
    el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field grow'},[el('label',{text:'金额'}),amtI]),el('div',{class:'field',style:'width:150px'},[el('label',{text:'到期日'}),dueI])]),
    el('div',{class:'field'},[el('label',{text:'周期'}),cycleI]),
    el('button',{class:'btn btn-primary',onclick:async()=>{ if(!nameI.value||!dueI.value){toast('填名称和日期','err');return;}
      await putRecord({id:uid(),module:MODULE,sub:'bill',created:now(),updated:now(),title:nameI.value,amount:parseFloat(amtI.value)||0,dueDate:dueI.value,cycle:cycleI.value});
      await recordChange({module:MODULE,sub:'bill'}); toast('已添加，将到期提醒','ok'); billView(root,back); }},'保存')
  ]);
  root.append(form, secTitle('📅','账单列表',''));
  const list=el('div',{class:'list'}); root.appendChild(list);
  (async()=>{ const items=await recordsBySub(MODULE,'bill'); items.sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    const today=new Date(); today.setHours(0,0,0,0);
    for(const r of items){ const d=new Date(r.dueDate+'T00:00:00'); const diff=Math.round((d-today)/86400000);
      const acts=el('div',{class:'it-actions'},[favoriteBtn(r,()=>billView(root,back)), el('button',{class:'mini-btn',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);billView(root,back);}}},'🗑')]);
      const ai=await aiItemActions({title:r.title||'账单',body:r.cycle||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?((r.body||'')+' '+out):out),updated:now()};await putRecord(upd);await recordChange(upd);billView(root,back); }});
      ai.childNodes.forEach(n=>acts.appendChild(n));
      list.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'💳'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title}),el('div',{class:'it-meta',text:r.dueDate+' · '+r.cycle+' · ¥'+(r.amount||0).toFixed(2)})]),el('div',{class:'tag '+(diff<=3?'yellow':'')}, diff<0?`逾期${-diff}天`:diff===0?'今天到期':`${diff}天后`),acts]));
    }
  })();
}

// 图表
function chartView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📊','数据图表 · 云端同步',''));
  const box=el('div',{class:'grid grid-2'}); root.appendChild(box);
  (async()=>{ const items=await recordsBySub(MODULE,'ledger'); const mk=monthKey(now());
    const cur=items.filter(r=>monthKey(new Date(r.date).getTime())===mk);
    const byCat={}; cur.filter(r=>r.type==='expense').forEach(r=>byCat[r.category]=(byCat[r.category]||0)+r.amount);
    const catData=Object.entries(byCat).map(([k,v],i)=>({label:k,value:+v.toFixed(2),color:['var(--primary)','var(--blue)','var(--green)','var(--yellow)','var(--purple)','var(--orange)'][i%6]}));
    box.append(el('div',{class:'card'},[el('h4',{text:'本月支出分类',style:'margin:0 0 12px'}), catData.length?barChart(catData,{fmt:v=>'¥'+v.toFixed(2)}):el('div',{class:'muted',text:'暂无支出'})]));
    // 近6月收支
    const months=[]; for(let i=5;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); months.push(monthKey(d.getTime())); }
    const incByM={},expByM={}; items.forEach(r=>{ const m=monthKey(new Date(r.date).getTime()); if(r.type==='expense')expByM[m]=(expByM[m]||0)+r.amount; else incByM[m]=(incByM[m]||0)+r.amount; });
    const trend=months.map((m,i)=>({label:m.slice(2),value:+((incByM[m]||0)-(expByM[m]||0)).toFixed(2),color:i%2?'var(--blue)':'var(--green)'}));
    box.append(el('div',{class:'card'},[el('h4',{text:'近6月净结余',style:'margin:0 0 12px'}), barChart(trend,{fmt:v=>'¥'+v.toFixed(2)}) ]));
    box.append(el('div',{class:'card',style:'grid-column:1/-1'},[el('div',{class:'row between'},[el('b',{text:'已同步至云端(本地云镜像)'}),el('span',{class:'tag green',text:'✓ 同步'})]),el('div',{class:'muted',text:'数据写入 IndexedDB 后即时镜像，断网可用、联网自动汇总。'})]));
  })();
}

// 份子钱
function giftView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎁','份子钱人情台账',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'gift',icon:'🎁',title:'人情',empty:'记录收送礼金，永不忘',
    fields:[{key:'title',label:'对象/事件',type:'text'},{key:'type',label:'类型',type:'select',options:[{value:'收',label:'收礼金'},{value:'送',label:'送礼金'}]},{key:'amount',label:'金额',type:'number'},{key:'date',label:'日期',type:'date'},{key:'body',label:'备注',type:'textarea'}]});
}

// 行情 + 总资产
let _marketTimer=null;
function marketView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📈','实时行情 + 总资产报表','30s 自动刷新'));
  const ticker=el('div',{class:'ticker'}); const srcTag=el('span',{class:'tag',text:'连接中'});
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'row between'},[el('b',{text:'实时行情'}),srcTag]),ticker]));
  async function refresh(){ const q=await getQuotes(); srcTag.textContent=q.source==='live'?'实时':'演示数据'; srcTag.className='tag '+(q.source==='live'?'green':'yellow');
    ticker.innerHTML=''; q.list.forEach(s=>{ const up=s.pct>=0; ticker.appendChild(el('div',{class:'tk'},[el('div',{class:'tk-name',text:s.name}),el('div',{class:'tk-price '+(up?'up':'down'),text:s.price}),el('div',{class:up?'up':'down',style:'font-size:12px',text:(up?'+':'')+s.pct+'%'})])); }); }
  refresh(); _marketTimer=setInterval(refresh,30000);
  // 财经资讯
  const news=el('div',{class:'list',style:'margin-top:8px'});
  (async()=>{ const h=await getHotTopics(); root.appendChild(secTitle('📰','财经资讯',''));
    h.list.slice(0,6).forEach(t=>{
      const titleHtml=(t.tag?('<span class="tag">'+t.tag+'</span> '):'')+escapeHtml(t.title);
      const body=el('div',{class:'it-body'},[el('div',{class:'it-title',html:titleHtml}),el('div',{class:'it-meta',text:'热度 '+(t.heat||'')})]);
      news.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'📰'}),body]));
    });
    root.appendChild(news);
  })();
  // 总资产
  root.appendChild(secTitle('💼','投资资产台账','联动总资产报表'));
  const assetForm=el('div',{class:'card',style:'margin-bottom:14px'});
  const aName=el('input',{class:'input',placeholder:'名称(如 黄金积存/某基金)'}); const aType=el('select',{class:'input'});['黄金','基金','A股','现金','其他'].forEach(c=>aType.appendChild(el('option',{value:c,text:c})));
  const aVal=el('input',{class:'input',type:'number',step:'0.01',placeholder:'当前市值'}); const aCost=el('input',{class:'input',type:'number',step:'0.01',placeholder:'成本'});
  assetForm.append(el('div',{class:'field'},[el('label',{text:'名称'}),aName]),el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field',style:'width:130px'},[el('label',{text:'类型'}),aType]),el('div',{class:'field grow'},[el('label',{text:'市值'}),aVal]),el('div',{class:'field grow'},[el('label',{text:'成本'}),aCost])]),el('button',{class:'btn btn-primary',onclick:async()=>{ if(!aName.value){toast('填名称','err');return;} await putRecord({id:uid(),module:MODULE,sub:'asset',created:now(),updated:now(),title:aName.value,atype:aType.value,value:parseFloat(aVal.value)||0,cost:parseFloat(aCost.value)||0}); await recordChange({module:MODULE,sub:'asset'}); toast('已记录','ok'); renderAssets(); }},'添加资产'));
  root.appendChild(assetForm);
  const alist=el('div',{class:'list'}); root.appendChild(alist);
  async function renderAssets(){ const items=await recordsBySub(MODULE,'asset'); let total=0,profit=0;
    items.forEach(r=>{ total+=r.value||0; profit+=(r.value||0)-(r.cost||0); });
    alist.innerHTML='';
    alist.appendChild(el('div',{class:'stat',style:'margin-bottom:10px'},[el('div',{class:'s-val',html:`总资产 ¥${total.toFixed(2)}`}),el('div',{class:'s-label',html:`浮动盈亏 <span class="${profit>=0?'up':'down'}">${profit>=0?'+':''}¥${profit.toFixed(2)}</span>`})]));
    items.forEach(r=>alist.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'💼'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title+' · '+r.atype}),el('div',{class:'it-meta',text:'市值¥'+(r.value||0).toFixed(2)+' · 成本¥'+(r.cost||0).toFixed(2)})]),el('div',{class:(r.value>=r.cost?'up':'down'),style:'font-weight:800',text:(r.value-r.cost>=0?'+':'')+'¥'+((r.value||0)-(r.cost||0)).toFixed(2)}),el('div',{class:'it-actions'},[favoriteBtn(r,renderAssets), el('button',{class:'mini-btn',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);renderAssets();}}},'🗑')])])));
  }
  renderAssets();
}
// 清理定时器
window.addEventListener('hashchange',()=>{ if(_marketTimer){clearInterval(_marketTimer);_marketTimer=null;} });

export const subs = { ledger:ledgerView, budget:budgetView, bill:billView, chart:chartView, gift:giftView, market:marketView };
