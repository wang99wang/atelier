// 模块七：AI剪辑创作工坊
import { el, uid, now, fmtDate, relTime, toast, download, copyText, itemRow, itBody, itActions } from '../core/utils.js';
import { putRecord, recordsBySub, softDelete, kvGet, kvSet } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, aiItemActions } from '../core/lib.js';
import { callAI, hasAI, callImageAI, parseAIJson } from '../core/ai.js';
import { extractFrame, removeWatermark, resizeImage } from '../core/media.js';

const MODULE='aiedit';

export const meta = { key:'aiedit', name:'AI剪辑工坊', icon:'🎬', color:'var(--primary-deep)', desc:'去水印·成片·素材' };

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('🎬','AI剪辑创作工坊',''));
  root.appendChild(subGrid([
    { icon:'🗃', title:'素材云端库', sub:'视频/图/文/乐', key:'material', cat:'素材', onClick:()=>goSub('material') },
    { icon:'🧽', title:'去水印', sub:'图片/视频', key:'watermark', cat:'处理', onClick:()=>goSub('watermark') },
    { icon:'📝', title:'视频文案提取', sub:'转写存档', key:'extract', cat:'处理', onClick:()=>goSub('extract') },
    { icon:'🎞', title:'批量自动混剪', sub:'故事板', key:'mix', cat:'剪辑', onClick:()=>goSub('mix') },
    { icon:'🔀', title:'音视频分离', sub:'提取音频', key:'separate', cat:'处理', onClick:()=>goSub('separate') },
    { icon:'✨', title:'画质高清修复', sub:'增强导出', key:'enhance', cat:'处理', onClick:()=>goSub('enhance') },
    { icon:'🎥', title:'文字生成视频', sub:'图文成片', key:'text2video', cat:'生成', onClick:()=>goSub('text2video') },
    { icon:'🖼', title:'智能封面制作', sub:'文字叠加', key:'cover', cat:'生成', onClick:()=>goSub('cover') },
    { icon:'📜', title:'小说剧本AI生成', sub:'文章/剧本', key:'gen', cat:'生成', onClick:()=>goSub('gen') },
    { icon:'📚', title:'小说检索复制', sub:'TXT下载', key:'novel', cat:'素材', onClick:()=>goSub('novel') },
    { icon:'💡', title:'AI选题策划', sub:'爆款选题', key:'topic', cat:'策划', onClick:()=>goSub('topic') },
    { icon:'🧩', title:'自动文案拆解', sub:'分镜表', key:'breakdown', cat:'策划', onClick:()=>goSub('breakdown') },
    { icon:'🔊', title:'智能配音字幕', sub:'语音+SRT', key:'dubsub', cat:'配音', onClick:()=>goSub('dubsub') },
    { icon:'🧲', title:'素材自动匹配', sub:'B-roll推荐', key:'match', cat:'素材', onClick:()=>goSub('match') },
    { icon:'🎞', title:'片头片尾合成', sub:'品牌动效', key:'intro', cat:'生成', onClick:()=>goSub('intro') },
    { icon:'🤖', title:'全能AI机器人', sub:'对话/生图/生视频', key:'bot', cat:'生成', onClick:()=>goSub('bot') },
  ], 'aiedit'));
}

// 素材库
function materialView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🗃','素材云端库','视频/图片/文案/音乐'));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'material',icon:'🗃',title:'素材',empty:'分类收藏创作素材',
    fields:[{key:'title',label:'名称',type:'text'},{key:'type',label:'类型',type:'select',options:[{value:'视频',label:'视频'},{value:'图片',label:'图片'},{value:'文案',label:'文案'},{value:'音乐',label:'音乐'}]},{key:'body',label:'链接/说明',type:'textarea'}]});
}

// 去水印（本地上传 / 通过链接导入）
function watermarkView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🧽','无损去水印','本地图片 / 通过链接导入 · 可选水印位置'));
  const WZ_POS=[
    {k:'bc',label:'底部居中',box:{x:0.35,y:0.80,w:0.30,h:0.12}},
    {k:'br',label:'右下角',box:{x:0.62,y:0.82,w:0.34,h:0.14}},
    {k:'bl',label:'左下角',box:{x:0.04,y:0.82,w:0.34,h:0.14}},
    {k:'tr',label:'右上角',box:{x:0.62,y:0.04,w:0.34,h:0.14}},
    {k:'tl',label:'左上角',box:{x:0.04,y:0.04,w:0.34,h:0.14}},
    {k:'ctr',label:'正中',box:{x:0.25,y:0.42,w:0.50,h:0.16}}
  ];
  let curBlob=null;
  const preview=el('div',{});
  const status=el('div',{class:'muted',style:'font-size:12px;line-height:1.6;margin-top:8px'});
  const btn=el('button',{class:'btn btn-primary',style:'display:none'},'🧽 去水印并下载');
  const posSel=el('select',{class:'input'});
  WZ_POS.forEach(p=>posSel.appendChild(el('option',{value:p.k,text:p.label})));
  function setBlob(b,from){
    curBlob=b; preview.innerHTML='';
    if(!b){ btn.style.display='none'; return; }
    const u=URL.createObjectURL(b);
    preview.appendChild(el('img',{src:u,style:'max-width:100%;max-height:320px;border-radius:12px'}));
    btn.style.display='inline-flex';
    status.textContent='✅ 已载入图片（来源：'+from+'）。请选择水印所在位置后处理。';
  }
  const input=el('input',{type:'file',accept:'image/*'});
  input.onchange=()=>{ if(input.files[0]) setBlob(input.files[0],'本地上传'); };
  const urlI=el('input',{class:'input',placeholder:'https://…（图片直链，需该站点允许跨域）'});
  const urlBtn=el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{
    const u=urlI.value.trim();
    if(!u){ toast('先粘贴图片链接','err'); return; }
    if(!/^https?:\/\//i.test(u)){ toast('请输入 http/https 开头的链接','err'); return; }
    urlBtn.disabled=true; urlBtn.textContent='导入中…'; status.textContent='正在通过链接导入图片…';
    try{
      const res=await fetch(u,{mode:'cors'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const b=await res.blob();
      if(!b.type||b.type.indexOf('image/')!==0) throw new Error('该链接不是图片');
      setBlob(b,'链接导入');
    }catch(e){
      status.textContent='❌ 导入失败：'+((e&&e.message)||'跨域被拒绝')+'。多数网站禁止跨域读取，请先把图片保存到本地，再用上面的「本地上传」。';
      toast('导入失败','err');
    }finally{ urlBtn.disabled=false; urlBtn.textContent='🔗 通过链接导入'; }
  }},'🔗 通过链接导入');
  btn.onclick=async()=>{
    if(!curBlob){ toast('先载入图片','err'); return; }
    const p=WZ_POS.find(x=>x.k===posSel.value)||WZ_POS[0];
    toast('处理中…');
    const out=await removeWatermark(curBlob,[p.box]);
    if(out){ download(out,'去水印_'+fmtDate(now())+'.png'); status.textContent='✅ 已处理并下载（'+p.label+'区域已模糊处理）。'; }
    else { toast('失败','err'); status.textContent='❌ 处理失败，请换一张图片试试。'; }
  };
  root.append(
    el('div',{class:'card',style:'margin-bottom:14px'},[
      el('div',{class:'field'},[el('label',{text:'① 本地上传图片'}),input])
    ]),
    el('div',{class:'card',style:'margin-bottom:14px'},[
      el('div',{class:'field'},[el('label',{text:'② 或通过链接导入'}),urlI]),
      el('div',{class:'row',style:'gap:8px;margin-top:8px'},[urlBtn]),
      el('div',{class:'muted',style:'font-size:12px;margin-top:8px;line-height:1.6'},'说明：浏览器安全策略要求目标站点允许跨域（CORS）才能直接读取图片。若提示失败，请先把图片保存到本地，再用上面的「本地上传」。')
    ]),
    el('div',{class:'card'},[
      el('div',{class:'field'},[el('label',{text:'③ 水印位置'}),posSel]),
      preview,
      el('div',{class:'row',style:'gap:8px;margin-top:10px'},[btn]),
      status
    ])
  );
}

// 文案提取
function extractView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📝','视频文案提取','转写并存档'));
  const input=el('input',{type:'file',accept:'video/*'}); const ta=el('textarea',{class:'input',style:'min-height:120px',placeholder:'上传视频后，可在此粘贴/记录提取到的文案（演示环境暂不支持自动语音识别，建议边看边记）'});
  const save=el('button',{class:'btn btn-primary'},'存档文案');
  save.onclick=async()=>{ if(!ta.value.trim()){toast('先填写文案','err');return;} await putRecord({id:uid(),module:MODULE,sub:'extract',created:now(),updated:now(),title:'提取文案',body:ta.value}); await recordChange({module:MODULE,sub:'extract'}); toast('已存档','ok'); };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'field'},[el('label',{text:'上传视频(可选)'}),input]),el('div',{class:'field'},[el('label',{text:'文案'}),ta]),save]),
    secTitle('📚','已提取',''));
  const list=el('div',{class:'list'}); root.appendChild(list);
  (async()=>{ const all=await recordsBySub(MODULE,'extract'); all.sort((a,b)=>b.created-a.created);
    for(const r of all){ const acts=el('div',{class:'it-actions'},[el('button',{class:'mini-btn',onclick:()=>copyText(r.body||'')},'📋'),el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);extractView(root,back);}},'🗑')]);
      const ai=await aiItemActions({title:'提取文案',body:r.body||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?(r.body||'')+'\\n'+out:out),updated:now()};await putRecord(upd);await recordChange(upd);extractView(root,back); }});
      ai.childNodes.forEach(n=>acts.appendChild(n));
      list.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'📝'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:relTime(r.created)}),el('div',{class:'it-meta',text:(r.body||'').slice(0,50)})]),acts]));
    }
  })();
}

// 混剪故事板
function mixView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎞','批量自动混剪','故事板生成'));
  const c=el('div',{}); root.appendChild(c);
  (async()=>{ const items=await recordsBySub(MODULE,'material'); const vids=items.filter(i=>i.type==='视频'||i.type==='图片');
    if(!vids.length){ c.appendChild(el('div',{class:'card card-2'},[el('div',{class:'muted',text:'先在「素材库」添加若干视频/图片素材，再来生成混剪故事板。'})])); }
    else { const board=el('div',{class:'list'}); vids.forEach((m,i)=>board.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:String(i+1)}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:m.title}),el('div',{class:'it-meta',text:m.type+' · 建议时长 3-5s'})])])));
      c.append(el('div',{class:'card',style:'margin-bottom:12px'},[el('b',{text:'自动故事板（'+vids.length+' 段）'}),board,el('button',{class:'btn btn-primary btn-sm',style:'margin-top:10px',onclick:()=>download(new Blob([vids.map((m,i)=>`${i+1}. ${m.title} [${m.type}]`).join('\n')],{type:'text/plain'}),'混剪故事板.txt')},'⬇ 导出故事板')]));
    }
  })();
}

// 音视频分离
function separateView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🔀','音视频分离提取','提取封面/音频'));
  const input=el('input',{type:'file',accept:'video/*'}); const btn=el('button',{class:'btn btn-primary',style:'display:none'},'🖼 提取封面图');
  input.onchange=()=>{ if(input.files[0])btn.style.display='inline-flex'; };
  btn.onclick=async()=>{ toast('提取中…'); const f=await extractFrame(input.files[0]); if(f)download(f,'封面_'+fmtDate(now())+'.png'); else toast('失败','err'); };
  root.append(el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'上传视频'}),input]),el('div',{class:'muted',style:'font-size:12px;margin:8px 0'},'提取首帧作为封面；音频分离需后端支持，已记录需求。'),btn]));
}

// 画质增强
function enhanceView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('✨','画质高清修复','基础增强导出'));
  const input=el('input',{type:'file',accept:'image/*'}); const btn=el('button',{class:'btn btn-primary',style:'display:none'},'⬆ 增强并下载');
  input.onchange=()=>{ if(input.files[0])btn.style.display='inline-flex'; };
  btn.onclick=async()=>{ toast('处理中…'); const out=await resizeImage(input.files[0],1920); if(out)download(out,'增强_'+fmtDate(now())+'.jpg'); else toast('失败','err'); };
  root.append(el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'上传图片'}),input]),el('div',{class:'muted',style:'font-size:12px;margin:8px 0'},'通过超采样重绘实现基础画质增强。'),btn]));
}

// 文字生成视频（Canvas 录制为 webm）
function text2videoView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎥','文字生成视频','图文成片 · 真实生成webm'));
  const ta=el('textarea',{class:'input',style:'min-height:120px',placeholder:'每行一句，自动生成逐页视频'}); ta.value='今天也想认真生活\n喝一杯温水\n读几页书\n对自己温柔一点';
  const durI=el('input',{class:'input',type:'number',value:'3',style:'max-width:120px'}); const genBtn=el('button',{class:'btn btn-primary'},'🎬 生成视频');
  const status=el('div',{class:'muted',style:'margin:8px 0'},'');
  genBtn.onclick=async()=>{ const lines=ta.value.split('\n').filter(Boolean); if(!lines.length){toast('输入文字','err');return;}
    if(!('MediaRecorder' in window)||!canvasStreamSupported()){ toast('当前浏览器不支持录制','err'); return; }
    status.textContent='生成中…'; genBtn.disabled=true;
    try{ const blob=await renderTextVideo(lines, parseInt(durI.value)||3);
      const u=URL.createObjectURL(blob); const v=el('video',{src:u,controls:true,style:'width:100%;border-radius:12px;margin-top:10px'}); status.textContent='完成！'; const dl=el('button',{class:'btn btn-primary btn-sm',style:'margin-top:8px',onclick:()=>download(blob,'成片_'+fmtDate(now())+'.webm')},'⬇ 下载视频');
      status.appendChild(v); status.appendChild(dl);
    }catch(e){ status.textContent='生成失败：'+e.message; } finally{ genBtn.disabled=false; }
  };
  root.append(el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'台词（每行一句）'}),ta]),el('div',{class:'row',style:'gap:10px'},[el('div',{class:'field',style:'width:140px'},[el('label',{text:'每页秒数'}),durI]),genBtn]),status]));
}
function canvasStreamSupported(){ try{ const c=document.createElement('canvas'); return !!(c.captureStream&&MediaRecorder); }catch{return false;} }
async function renderTextVideo(lines, secs){
  const W=1280,H=720; const c=document.createElement('canvas'); c.width=W;c.height=H; const ctx=c.getContext('2d');
  const stream=c.captureStream(30); const mr=new MediaRecorder(stream,{mimeType:'video/webm'}); const chunks=[];
  mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise(res=>mr.onstop=()=>res(new Blob(chunks,{type:'video/webm'})));
  mr.start();
  const draw=(text,i)=>{ ctx.fillStyle='#FFE9F0'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#F4738F'; ctx.font='bold 64px sans-serif'; ctx.textAlign='center'; ctx.fillText(String(i+1).padStart(2,'0'),W/2,140);
    ctx.fillStyle='#5A4A52'; ctx.font='bold 52px sans-serif'; const words=text.split(''); let line='',y=H/2;
    // 简单自动换行
    const lines2=[]; let cur=''; words.forEach(ch=>{ if(ctx.measureText(cur+ch).width>W-200){lines2.push(cur);cur=ch;} else cur+=ch; }); if(cur)lines2.push(cur);
    lines2.forEach((l,idx)=>ctx.fillText(l,W/2,y+idx*70));
    ctx.fillStyle='#B8AAB2'; ctx.font='28px sans-serif'; ctx.fillText('AI工作台 · 图文成片',W/2,H-80);
  };
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<lines.length;i++){ draw(lines[i],i); await sleep(secs*1000); }
  mr.stop(); return done;
}

// 智能封面：AI 出图 / AI 排版 / 底图叠加
const COVER_SIZES=[
  {k:'xhs',label:'小红书 3:4',w:1080,h:1440,ai:'1024x1536'},
  {k:'dy',label:'抖音竖屏 9:16',w:1080,h:1920,ai:'1024x1792'},
  {k:'wx',label:'公众号头图 2.35:1',w:1080,h:460,ai:'1792x1024'},
  {k:'sq',label:'方图 1:1',w:1080,h:1080,ai:'1024x1024'},
  {k:'ld',label:'横版 16:9',w:1920,h:1080,ai:'1792x1024'}
];
const COVER_STYLES=[
  {k:'magazine',label:'简约杂志',hint:'大面积留白、精致衬线标题、灰白米色调、高级克制',bg:'#f4f1ec',fg:'#22201d',ac:'#b08d57'},
  {k:'guofeng',label:'国风水墨',hint:'水墨晕染、大量留白、朱红与墨黑、书法感标题',bg:'#f6f3ee',fg:'#1d1b19',ac:'#a8342a'},
  {k:'tech',label:'科技蓝紫',hint:'深蓝紫渐变、光效线条、未来科技感、无衬线标题',bg:'#101433',fg:'#ffffff',ac:'#6c8cff'},
  {k:'heal',label:'温暖治愈',hint:'奶油米黄、柔和光斑、手写感副标题、治愈温暖',bg:'#fdf3e3',fg:'#4a3a2a',ac:'#e0a06a'},
  {k:'candy',label:'可爱糖果',hint:'粉紫糖果色、圆润字体、俏皮可爱元素',bg:'#ffeef6',fg:'#5a2b45',ac:'#ff7bac'},
  {k:'luxury',label:'高级黑金',hint:'纯黑底、金色细线、衬线烫金标题、奢华质感',bg:'#0d0d0f',fg:'#f5e6c8',ac:'#c9a24a'},
  {k:'fresh',label:'清新自然',hint:'浅绿天蓝、植物光影、通透干净的排版',bg:'#eef7f2',fg:'#22392f',ac:'#5fae8c'}
];
function shadeColor(hex,amt){
  const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex||'');
  if(!m) return hex||'#f4f1ec';
  const f=v=>{ const n=parseInt(v,16); const c=Math.max(0,Math.min(255,Math.round(n+255*amt))); return c.toString(16).padStart(2,'0'); };
  return '#'+f(m[1])+f(m[2])+f(m[3]);
}
function drawWrapped(ctx,text,x,y,maxW,lh){
  const lines=[]; let line='';
  for(const ch of String(text||'')){
    if(ctx.measureText(line+ch).width>maxW && line){ lines.push(line); line=ch; }
    else line+=ch;
  }
  if(line) lines.push(line);
  const sy=y-((lines.length-1)*lh)/2;
  lines.forEach((l,i)=>ctx.fillText(l,x,sy+i*lh));
}
async function renderCoverCanvas(opts){
  const {w,h,plan,style,fallbackText}=opts||{};
  return new Promise(res=>{
    try{
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      const ctx=c.getContext('2d');
      const bg=(plan&&plan.bg)||style.bg, fg=(plan&&plan.fg)||style.fg, ac=(plan&&plan.ac)||style.ac;
      const g=ctx.createLinearGradient(0,0,w,h);
      g.addColorStop(0,bg); g.addColorStop(1,shadeColor(bg,-0.07));
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      ctx.globalAlpha=0.13; ctx.fillStyle=ac;
      ctx.beginPath(); ctx.arc(w*0.84,h*0.16,Math.min(w,h)*0.22,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(w*0.10,h*0.88,Math.min(w,h)*0.15,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
      const bandH=Math.max(6,Math.round(h*0.012));
      ctx.fillStyle=ac; ctx.fillRect(Math.round(w*0.08),Math.round(h*0.86),Math.round(w*0.84),bandH);
      const title=(plan&&plan.title)||String(fallbackText||'封面标题').slice(0,12);
      const fs=Math.round(Math.min(w,h)*0.105);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=fg;
      ctx.font='bold '+fs+'px "PingFang SC","Microsoft YaHei",sans-serif';
      drawWrapped(ctx,title,w/2,h*0.40,w*0.82,Math.round(fs*1.25));
      const sub=(plan&&plan.sub)||'';
      if(sub){
        const ss=Math.round(fs*0.42);
        ctx.font=ss+'px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.globalAlpha=0.7; ctx.fillStyle=fg;
        drawWrapped(ctx,sub,w/2,h*0.40+fs*1.15,w*0.78,Math.round(ss*1.5));
        ctx.globalAlpha=1;
      }
      const tags=(plan&&plan.tags)||[];
      if(tags.length){
        const ts=Math.round(fs*0.36);
        ctx.font=ts+'px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle=ac;
        ctx.fillText(tags.slice(0,3).map(t=>'#'+t).join('   '),w/2,h*0.68);
      }
      c.toBlob(b=>res(b),'image/png');
    }catch(e){ res(null); }
  });
}
function coverView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back));
  root.appendChild(secTitle('🖼','智能封面制作','输入文字 · 选尺寸 · 选风格 · AI 出图'));
  const textI=el('textarea',{class:'input',rows:2,placeholder:'描述封面主题，例如：周末露营治愈vlog / 3个存钱小技巧'});
  const sizeSel=el('select',{class:'input'}); COVER_SIZES.forEach(s=>sizeSel.appendChild(el('option',{value:s.k,text:s.label})));
  const styleSel=el('select',{class:'input'}); COVER_STYLES.forEach(s=>styleSel.appendChild(el('option',{value:s.k,text:s.label})));
  const outBox=el('div',{style:'margin-top:14px'});
  const status=el('div',{class:'muted',style:'font-size:12px;margin-top:8px;line-height:1.6'});
  const curSize=()=>COVER_SIZES.find(s=>s.k===sizeSel.value)||COVER_SIZES[0];
  const curStyle=()=>COVER_STYLES.find(s=>s.k===styleSel.value)||COVER_STYLES[0];
  function showResult(blob,name){
    outBox.innerHTML='';
    const u=URL.createObjectURL(blob);
    const img=el('img',{src:u,style:'max-width:100%;max-height:420px;border-radius:12px;display:block;margin:0 auto;box-shadow:0 6px 24px rgba(0,0,0,.12)'});
    const dl=el('button',{class:'btn btn-primary btn-sm',onclick:()=>download(blob,name)},'⬇ 下载封面');
    const save=el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{
      await putRecord({id:uid(),module:MODULE,sub:'material',created:now(),updated:now(),title:'封面：'+(textI.value.trim().slice(0,20)||'未命名'),type:'图片',body:name});
      await recordChange({module:MODULE,sub:'material'}); toast('已存入素材库','ok');
    }},'🗃 存入素材库');
    outBox.append(img, el('div',{class:'row wrap',style:'gap:8px;margin-top:10px;justify-content:center'},[dl,save]));
  }
  const aiImgBtn=el('button',{class:'btn btn-primary',onclick:async()=>{
    const t=textI.value.trim(); if(!t){toast('先写点主题文字','err');return;}
    const sz=curSize(), st=curStyle();
    aiImgBtn.disabled=true; aiImgBtn.textContent='🎨 生成中…'; status.textContent='正在调用图像模型生成，通常需要十几秒…';
    try{
      if(!(await hasAI())) throw new Error('请先在「设置」里绑定大模型 API');
      const shape=(sz.h>sz.w)?'竖版':'横版';
      const prompt=t+'，'+st.hint+'，高清封面构图，'+shape+'，画面干净有设计感，适合做自媒体封面，不要出现文字';
      const r=await callImageAI({prompt:prompt,size:sz.ai});
      status.textContent='✅ AI 生成成功 · 尺寸 '+sz.label+' · 风格 '+st.label;
      showResult(r.blob,'封面_'+st.k+'_'+fmtDate(now())+'.png');
    }catch(e){
      const msg=(e&&e.message==='NO_AI')?'未绑定 API，请先在设置中配置':((e&&e.message)||'生成失败');
      status.textContent='❌ '+msg+'。若接口不支持图像生成，可改用「AI 排版封面」（只需文本模型即可出图）。';
      toast('生成失败','err');
    }finally{ aiImgBtn.disabled=false; aiImgBtn.textContent='🤖 AI 生成图片'; }
  }},'🤖 AI 生成图片');
  const layoutBtn=el('button',{class:'btn btn-soft',onclick:async()=>{
    const t=textI.value.trim(); if(!t){toast('先写点主题文字','err');return;}
    const sz=curSize(), st=curStyle();
    layoutBtn.disabled=true; layoutBtn.textContent='✍️ 设计中…'; status.textContent='正在让 AI 设计文案与配色…';
    let plan=null;
    try{
      if(await hasAI()){
        const sys='你是资深自媒体封面设计师。根据用户主题与风格，产出封面文案与配色。只输出纯 JSON：{"title":"主标题(不超过12字)","sub":"副标题(不超过20字)","tags":["标签1","标签2"],"bg":"#背景色","fg":"#主文字色","ac":"#点缀色"}，不要任何多余文字。';
        const pmt='主题：'+t+'\n风格：'+st.label+'（'+st.hint+'）\n请给出封面文案与配色。';
        const raw=await callAI({system:sys,prompt:pmt,temperature:0.9,maxTokens:300});
        plan=parseAIJson(raw);
      }
    }catch(e){ plan=null; }
    if(!plan||typeof plan!=='object') plan={title:t.slice(0,12),sub:'',tags:[],bg:st.bg,fg:st.fg,ac:st.ac};
    const blob=await renderCoverCanvas({w:sz.w,h:sz.h,plan:plan,style:st,fallbackText:t});
    layoutBtn.disabled=false; layoutBtn.textContent='✍️ AI 排版封面';
    if(blob){ status.textContent='✅ 已生成排版封面「'+(plan.title||'')+'」· 尺寸 '+sz.label; showResult(blob,'封面_排版_'+fmtDate(now())+'.png'); }
    else { status.textContent='❌ 渲染失败'; toast('渲染失败','err'); }
  }},'✍️ AI 排版封面');
  const input=el('input',{type:'file',accept:'image/*'});
  const overlayBtn=el('button',{class:'btn btn-ghost',onclick:async()=>{
    if(!input.files[0]){toast('先选一张底图','err');return;}
    const blob=await makeCover(input.files[0],textI.value.trim()||'今日份治愈');
    if(blob){ status.textContent='✅ 已在底图上叠加文字'; showResult(blob,'封面_叠加_'+fmtDate(now())+'.png'); }
    else toast('失败','err');
  }},'🖼 底图叠加文字');
  root.append(
    el('div',{class:'card',style:'margin-bottom:14px'},[
      el('div',{class:'field'},[el('label',{text:'封面文字 / 主题'}),textI]),
      el('div',{class:'row',style:'gap:10px'},[
        el('div',{style:'flex:1'},[el('label',{text:'尺寸'}),sizeSel]),
        el('div',{style:'flex:1'},[el('label',{text:'风格'}),styleSel])
      ]),
      el('div',{class:'row wrap',style:'gap:8px;margin-top:12px'},[aiImgBtn,layoutBtn]),
      el('div',{class:'row wrap',style:'gap:8px;margin-top:8px;align-items:center'},[el('span',{class:'muted',style:'font-size:12px',text:'或上传底图叠加：'}),input,overlayBtn]),
      status
    ]),
    outBox
  );
}
async function makeCover(imgBlob,text){
  return new Promise(res=>{ const u=URL.createObjectURL(imgBlob); const im=new Image(); im.onload=()=>{ const c=document.createElement('canvas'); c.width=im.width;c.height=im.height; const ctx=c.getContext('2d'); ctx.drawImage(im,0,0);
    ctx.fillStyle='rgba(244,115,143,.85)'; ctx.fillRect(0,c.height-160,c.width,160); ctx.fillStyle='#fff'; ctx.font='bold '+Math.floor(c.width/14)+'px sans-serif'; ctx.textAlign='center'; ctx.fillText(text,c.width/2,c.height-160/2+20);
    c.toBlob(b=>res(b),'image/png'); URL.revokeObjectURL(u); }; im.onerror=()=>res(null); im.src=u; });
}

// 小说/剧本生成
function genView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📜','小说文章剧本AI生成',''));
  const topicI=el('input',{class:'input',placeholder:'主题/关键词'}); const typeI=el('select',{class:'input'});['小说','文章','剧本','短视频脚本'].forEach(t=>typeI.appendChild(el('option',{value:t,text:t})));
  const out=el('textarea',{class:'input',style:'min-height:160px',readonly:true}); const genBtn=el('button',{class:'btn btn-primary'},'🤖 生成');
  genBtn.onclick=async()=>{ const t=topicI.value.trim(); if(!t){toast('输入主题','err');return;} const ep=await kvGet('llm_endpoint'); let res='';
    if(ep){ try{ const d=await import('../core/network.js').then(n=>n.fetchJSON(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'请生成一篇'+typeI.value+'，主题：'+t})})); res=d.result||d.text||''; }catch{} }
    if(!res){ res=generateTemplate(typeI.value,t); }
    out.value=res;
  };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field grow'},[el('label',{text:'主题'}),topicI]),el('div',{class:'field',style:'width:150px'},[el('label',{text:'类型'}),typeI])]),genBtn]),
    el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'生成结果'}),out]),el('div',{class:'row',style:'gap:8px'},[el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(out.value)},'📋 复制'),el('button',{class:'btn btn-soft btn-sm',onclick:()=>download(new Blob([out.value],{type:'text/plain'}),'生成_'+fmtDate(now())+'.txt')},'⬇ 导出')])]));
}
function generateTemplate(type,t){
  if(type==='剧本') return `【场景】夜晚，客厅。\n【人物】小满(女)、阿哲(男)\n——\n小满：${t}？我每天都在想这件事。\n阿哲：那就从现在开始吧。\n（镜头拉近，窗外星光）`;
  if(type==='短视频脚本') return `0-3s 钩子：${t}，你真的了解吗？\n3-15s 反转：其实大多数人都不知道…\n15-30s 干货：三点讲清楚\n结尾：点赞收藏，下期见。`;
  if(type==='文章') return `标题：${t}——写给认真生活的你\n\n引言：我们总在忙碌中忘记照顾自己。\n正文：${t}其实是一种温柔的能力。从今天起，给自己一点时间。\n结尾：愿你被生活温柔以待。`;
  return `第一章 起始\n关于「${t}」，故事从一个普通的清晨开始……\n\n林溪推开窗户，风里带着${t}的气息。她不知道，这一天将改变一切。\n\n（示例生成内容，可在设置中接入大模型获得更完整创作。）`;
}

// 小说检索（六大平台 + 收藏建作品）
const NOVEL_SITES=[
  {k:'qidian',name:'起点中文网',icon:'🟠',url:q=>'https://www.qidian.com/search?kw='+encodeURIComponent(q)},
  {k:'jjwxc',name:'晋江文学城',icon:'💜',url:q=>'https://www.jjwxc.net/search.php?keyword='+encodeURIComponent(q)},
  {k:'fanqie',name:'番茄小说',icon:'🍅',url:q=>'https://fanqienovel.com/search?keyword='+encodeURIComponent(q)},
  {k:'qimao',name:'七猫小说',icon:'🐱',url:q=>'https://www.qimao.com/search?keyword='+encodeURIComponent(q)},
  {k:'qqread',name:'QQ阅读',icon:'📘',url:q=>'https://ubook.reader.qq.com/search?keyword='+encodeURIComponent(q)},
  {k:'douban',name:'豆瓣阅读',icon:'🟢',url:q=>'https://read.douban.com/search?q='+encodeURIComponent(q)}
];
function novelView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📚','全网小说检索','六大平台一键搜 · 收藏即建空作品'));
  const q=el('input',{class:'input',placeholder:'输入书名 / 作者…'});
  const btn=el('button',{class:'btn btn-primary'},'🔍 搜索');
  const results=el('div',{class:'list'});
  const favList=el('div',{class:'list'});
  async function renderFav(){
    favList.innerHTML='';
    const items=(await recordsBySub(MODULE,'novelfav')).sort((a,b)=>(b.created||0)-(a.created||0));
    if(!items.length){ favList.appendChild(el('div',{class:'muted',text:'还没有收藏，搜索后点「＋收藏」即可建一个空作品'}) ); return; }
    items.forEach(r=>{
      const acts=el('div',{class:'it-actions'});
      if(r.link) acts.appendChild(el('a',{class:'mini-btn',href:r.link,target:'_blank',rel:'noopener'},'↗'));
      acts.appendChild(el('button',{class:'mini-btn del-btn',onclick:async()=>{ await softDelete(r.id); renderFav(); }},'🗑'));
      favList.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:'📖'}),
        el('div',{class:'it-body'},[
          el('div',{class:'it-title',text:r.title||'未命名'}),
          el('div',{class:'it-meta',text:(r.source||'')+(r.author?(' · '+r.author):'')})
        ]),
        acts
      ]));
    });
  }
  async function doSearch(){
    const kw=q.value.trim();
    results.innerHTML='';
    if(!kw){ results.appendChild(el('div',{class:'muted',text:'输入书名后搜索，会列出六大平台的直达入口'}) ); return; }
    NOVEL_SITES.forEach(s=>{
      const u=s.url(kw);
      const acts=el('div',{class:'it-actions'});
      acts.appendChild(el('a',{class:'mini-btn',href:u,target:'_blank',rel:'noopener'},'↗ 去搜索'));
      acts.appendChild(el('button',{class:'mini-btn',onclick:async()=>{
        await putRecord({id:uid(),module:MODULE,sub:'novelfav',created:now(),updated:now(),title:kw,source:s.name,link:u,author:'',notes:''});
        await recordChange({module:MODULE,sub:'novelfav'}); toast('已收藏：'+kw+'（'+s.name+'）','ok'); renderFav();
      }},'＋收藏'));
      results.appendChild(el('div',{class:'item'},[
        el('div',{class:'it-ico',html:s.icon}),
        el('div',{class:'it-body'},[
          el('div',{class:'it-title',text:s.name}),
          el('div',{class:'it-meta',text:'搜索：'+kw})
        ]),
        acts
      ]));
    });
  }
  btn.onclick=doSearch; q.onkeydown=e=>{if(e.key==='Enter')doSearch();};
  root.append(
    el('div',{class:'card',style:'margin-bottom:14px'},[
      el('div',{class:'row',style:'gap:8px'},[q,btn])
    ]),
    results,
    el('div',{class:'sec-title',style:'margin-top:16px'},[el('span',{class:'st-ico',html:'⭐'}),el('span',{text:'我的小说收藏'})]),
    favList
  );
  renderFav(); doSearch();
}

// ===================== 新增：AI剪辑 6 大功能 =====================

// 1) AI选题策划
function topicView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💡','AI选题策划','输入赛道/风格，生成爆款选题'));
  const fieldI=el('input',{class:'input',placeholder:'赛道/领域，如：职场成长、美食探店'}); const styleI=el('input',{class:'input',placeholder:'风格/受众，如：年轻化、干货向'});
  const out=el('div',{class:'list'}); const gen=el('button',{class:'btn btn-primary'},'🤖 生成选题');
  gen.onclick=async()=>{ const field=fieldI.value.trim(); if(!field){toast('输入赛道','err');return;} const style=styleI.value.trim(); gen.disabled=true;gen.textContent='⏳ 生成中…';out.innerHTML='';
    try{ const ai=await hasAI(); let items;
      if(ai){ const raw=await callAI({system:'你是短视频爆款选题策划专家，输出简洁可直接用。',prompt:`赛道：${field}；风格/受众画像：${style||'通用'}。请产出12个有爆款潜力的视频选题。每条严格一行，格式：标题｜钩子(一句吸引点击)｜角度。不要序号、不要解释。`,maxTokens:1200});
        items=(raw||'').split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{const p=line.split(/[｜|]/);return {title:p[0]||line,hook:p[1]||'',angle:p[2]||''};});
      }
      if(!items||!items.length) items=localTopics(field,style);
      items.forEach((it,i)=>{ out.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:String(i+1)}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:it.title}),it.hook&&el('div',{class:'it-meta',text:'🪝 '+it.hook}),it.angle&&el('div',{class:'it-meta',text:'🎯 '+it.angle})]),el('div',{class:'it-actions'},[el('button',{class:'mini-btn',onclick:()=>copyText(it.title+(it.hook?'｜'+it.hook:'')+(it.angle?'｜'+it.angle:''))},'📋')])])); });
    }catch(e){ toast(e.message==='NO_AI'?'未绑定大模型，已展示本地方案':'出错：'+e.message,e.message==='NO_AI'?'ok':'err'); localTopics(field,style).forEach((it,i)=>out.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:String(i+1)}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:it.title}),el('div',{class:'it-meta',text:'🪝 '+(it.hook||'')})])]))); }
    finally{ gen.disabled=false;gen.textContent='🤖 生成选题'; }
  };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field grow'},[el('label',{text:'赛道/领域'}),fieldI]),el('div',{class:'field grow'},[el('label',{text:'风格/受众'}),styleI])]),gen]),
    el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'选题结果（点击📋复制）'}),out])]));
}

// 2) 自动文案拆解
function breakdownView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🧩','自动文案拆解','把文案拆成可拍的分镜表'));
  const ta=el('textarea',{class:'input',style:'min-height:140px',placeholder:'粘贴一段视频文案/口播稿，自动拆解为分镜（画面/旁白/时长）'}); const out=el('div',{class:'list'});
  const gen=el('button',{class:'btn btn-primary'},'🤖 拆解'); let rows=[];
  gen.onclick=async()=>{ const text=ta.value.trim(); if(!text){toast('输入文案','err');return;} gen.disabled=true;gen.textContent='⏳ 拆解中…';out.innerHTML='';rows=[];
    try{ const ai=await hasAI();
      if(ai){ const raw=await callAI({system:'你是资深剪辑师，把文案拆成拍摄分镜。每条一行，格式：画面描述｜旁白/字幕｜时长(秒)。',prompt:text,maxTokens:1400});
        const r=(raw||'').split('\n').map(s=>s.trim()).filter(Boolean).map(l=>{const p=l.split(/[｜|]/);return {shot:p[0]||l,voice:p[1]||'',sec:parseInt((p[2]||'').replace(/[^\d]/g,''))||3};}); if(r.length)rows=r; }
      if(!rows.length) rows=localBreakdown(text);
      let total=0; rows.forEach((r,i)=>{ total+=r.sec; out.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:String(i+1)}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.shot}),r.voice&&el('div',{class:'it-meta',text:'🗣 '+r.voice}),el('div',{class:'it-meta',text:'⏱ '+r.sec+'s'})])])); });
      out.appendChild(el('div',{class:'muted',style:'margin-top:8px',text:'总时长约 '+total+'s'}));
    }catch(e){ toast(e.message==='NO_AI'?'未绑定大模型，已展示本地拆解':'出错：'+e.message,'ok'); rows=localBreakdown(text); rows.forEach((r,i)=>out.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:String(i+1)}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.shot}),el('div',{class:'it-meta',text:'⏱ '+r.sec+'s'})])]))); }
    finally{ gen.disabled=false;gen.textContent='🤖 拆解'; }
  };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'field'},[el('label',{text:'文案/口播稿'}),ta]),el('div',{class:'row',style:'gap:8px'},[gen,el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(rows.map((r,i)=>`${i+1}. ${r.shot}${r.voice?'｜'+r.voice:''}｜${r.sec}s`).join('\n'))},'📋 复制分镜')])]),
    el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'分镜表'}),out])]));
}

// 3) 智能配音字幕
function dubsubView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🔊','智能配音字幕','文字→语音 + SRT字幕'));
  const ta=el('textarea',{class:'input',style:'min-height:110px',placeholder:'输入要配音的文案，自动生成语音并导出 SRT 字幕'}); ta.value='欢迎来到我的频道，今天分享三个提升幸福感的小习惯。';
  const voiceSel=el('select',{class:'input'}); ['zh-CN','zh-TW','en-US'].forEach(v=>voiceSel.appendChild(el('option',{value:v,text:v})));
  const playBtn=el('button',{class:'btn btn-soft'},'▶ 试听'); const genBtn=el('button',{class:'btn btn-primary'},'🎙 生成并导出'); const status=el('div',{class:'muted',style:'margin:8px 0'},'');
  const pickVoice=()=>speechSynthesis.getVoices().find(x=>x.lang===voiceSel.value)||null;
  playBtn.onclick=()=>{ const t=ta.value.trim(); if(!t)return; const u=new SpeechSynthesisUtterance(t); const v=pickVoice(); if(v)u.voice=v; speechSynthesis.cancel(); speechSynthesis.speak(u); };
  genBtn.onclick=async()=>{ const t=ta.value.trim(); if(!t){toast('输入文案','err');return;} const segs=t.split(/[。！？!?\n]/).map(s=>s.trim()).filter(Boolean); const srt=buildSRT(segs.map(s=>({text:s}))); const u=new SpeechSynthesisUtterance(t); const v=pickVoice(); if(v)u.voice=v; speechSynthesis.cancel(); speechSynthesis.speak(u); status.textContent='配音播放中，'; const dl=el('button',{class:'btn btn-soft btn-sm',style:'margin-left:8px',onclick:()=>download(new Blob([srt],{type:'text/plain'}),'字幕_'+fmtDate(now())+'.srt')},'⬇ 下载SRT'); status.appendChild(dl); };
  root.append(el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'配音文案'}),ta]),el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field',style:'width:160px'},[el('label',{text:'语音'}),voiceSel]),playBtn,genBtn]),status]));
}

// 4) 素材自动匹配
function matchView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🧲','素材自动匹配','按主题推荐B-roll'));
  const q=el('input',{class:'input',placeholder:'输入场景/主题，如：咖啡馆、晨跑、雨天'}); const list=el('div',{class:'list'}); const gen=el('button',{class:'btn btn-primary'},'🔍 匹配素材');
  gen.onclick=async()=>{ const text=q.value.trim(); if(!text){toast('输入主题','err');return;} list.innerHTML=''; gen.disabled=true;gen.textContent='⏳ 匹配中…';
    const items=await recordsBySub(MODULE,'material');
    const scored=items.map(m=>({m,score:scoreMatch(text,m.title+' '+(m.body||'')+' '+(m.type||''))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(!scored.length){ list.appendChild(el('div',{class:'card card-2'},[el('div',{class:'muted',text:'素材库暂无匹配项，建议补充：'+text+'（视频/图片/B-roll）'})])); }
    else scored.slice(0,12).forEach(({m,score})=>{ list.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:m.type==='视频'?'🎬':m.type==='图片'?'🖼':'📄'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:m.title}),el('div',{class:'it-meta',text:m.type+' · 匹配度 '+(score*100).toFixed(0)+'%'})])])); });
    const ai=await hasAI(); if(ai){ try{ const raw=await callAI({system:'你是视频素材策划。给定主题和已有素材清单，推荐3条还缺的B-roll拍摄建议。',prompt:'主题：'+text+'\n已有素材：'+(items.map(i=>i.title+'('+i.type+')').join('、')||'无'),maxTokens:600}); if(raw){ list.appendChild(el('div',{class:'card',style:'margin-top:10px'},[el('b',{text:'🤖 建议补充的B-roll'}),el('div',{class:'it-meta',style:'white-space:pre-wrap',text:raw})])); } }catch{} }
    gen.disabled=false;gen.textContent='🔍 匹配素材';
  };
  root.append(el('div',{class:'card',style:'margin-bottom:14px'},[el('div',{class:'row',style:'gap:8px'},[q,gen])]),list);
}

// 5) 片头片尾合成
function introView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎞','片头片尾合成','生成品牌动效视频'));
  const titleI=el('input',{class:'input',placeholder:'主标题'}); titleI.value='AI工作台'; const subI=el('input',{class:'input',placeholder:'副标题/出品方'}); subI.value='出品';
  const durI=el('input',{class:'input',type:'number',value:'3',style:'max-width:100px'}); const modeSel=el('select',{class:'input'}); [['intro','片头'],['outro','片尾']].forEach(([v,t])=>modeSel.appendChild(el('option',{value:v,text:t})));
  const gen=el('button',{class:'btn btn-primary'},'🎬 生成视频'); const status=el('div',{class:'muted',style:'margin:8px 0'},'');
  gen.onclick=async()=>{ if(!('MediaRecorder' in window)||!canvasStreamSupported()){toast('当前浏览器不支持录制','err');return;} gen.disabled=true;gen.textContent='⏳ 生成中…';status.textContent='合成中…';
    try{ const blob=await renderIntroOutro({title:titleI.value.trim()||'AI工作台',sub:subI.value.trim(),sec:parseInt(durI.value)||3,mode:modeSel.value}); const u=URL.createObjectURL(blob); const v=el('video',{src:u,controls:true,style:'width:100%;border-radius:12px;margin-top:10px'}); const dl=el('button',{class:'btn btn-primary btn-sm',style:'margin-top:8px',onclick:()=>download(blob,(modeSel.value==='outro'?'片尾':'片头')+'_'+fmtDate(now())+'.webm')},'⬇ 下载'); status.textContent='完成！'; status.appendChild(v); status.appendChild(dl); }
    catch(e){ status.textContent='失败：'+e.message; } finally{ gen.disabled=false;gen.textContent='🎬 生成视频'; }
  };
  root.append(el('div',{class:'card'},[el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field grow'},[el('label',{text:'主标题'}),titleI]),el('div',{class:'field grow'},[el('label',{text:'副标题'}),subI])]),el('div',{class:'row wrap',style:'gap:10px'},[el('div',{class:'field',style:'width:120px'},[el('label',{text:'类型'}),modeSel]),el('div',{class:'field',style:'width:120px'},[el('label',{text:'秒数'}),durI]),gen]),status]));
}

// 6) 全能AI机器人（对话 / 生图 / 生视频）
function botView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🤖','全能AI机器人','对话 / 生图 / 生视频'));
  const ta=el('textarea',{class:'input',style:'min-height:90px',placeholder:'说点什么吧～ 例如：帮我写一个周末露营的短视频脚本，并配一张封面图'});
  const sendBtn=el('button',{class:'btn btn-primary'},'💬 发送'); const imgBtn=el('button',{class:'btn btn-soft'},'🖼 生成图片'); const vidBtn=el('button',{class:'btn btn-soft'},'🎬 生成视频');
  const out=el('div',{class:'card',style:'margin-top:12px;min-height:60px;white-space:pre-wrap'},''); const status=el('div',{class:'muted',style:'margin:6px 0'},'');
  let lastText='';
  sendBtn.onclick=async()=>{ const q=ta.value.trim(); if(!q){toast('输入内容','err');return;} out.textContent='…'; sendBtn.disabled=true;
    try{ const ai=await hasAI();
      if(ai){ const r=await callAI({system:'你是全能AI助手，回答要简洁有用。',prompt:q,maxTokens:1000}); out.textContent=r||'(空)'; lastText=r||q; }
      else { out.textContent='[本地模式，未绑定大模型] '+localBot(q); lastText=q; }
    }catch(e){ if(e.message==='NO_AI'){ out.textContent='[本地模式] '+localBot(q); } else { out.textContent='出错：'+e.message; } lastText=q; }
    sendBtn.disabled=false;
  };
  imgBtn.onclick=async()=>{ status.textContent='生成图片中…'; const blob=await genPoster(ta.value.trim()||'AI工作台','AI 生成'); if(blob){ const u=URL.createObjectURL(blob); out.textContent=''; out.appendChild(el('img',{src:u,style:'max-width:100%;border-radius:12px;margin-top:8px'})); out.appendChild(el('button',{class:'btn btn-primary btn-sm',style:'margin-top:8px;display:block',onclick:()=>download(blob,'AI图片_'+fmtDate(now())+'.png')},'⬇ 下载')); } status.textContent=''; };
  vidBtn.onclick=async()=>{ if(!('MediaRecorder' in window)||!canvasStreamSupported()){toast('当前浏览器不支持录制','err');return;} status.textContent='生成视频中…'; const lines=(ta.value.trim()||'AI工作台 生成视频').split(/[。！？!?\n]/).map(s=>s.trim()).filter(Boolean); const blob=await renderTextVideo(lines.slice(0,12),3); const u=URL.createObjectURL(blob); out.textContent=''; out.appendChild(el('video',{src:u,controls:true,style:'width:100%;border-radius:12px;margin-top:8px'})); out.appendChild(el('button',{class:'btn btn-primary btn-sm',style:'margin-top:8px;display:block',onclick:()=>download(blob,'AI视频_'+fmtDate(now())+'.webm')},'⬇ 下载')); status.textContent=''; };
  root.append(el('div',{class:'card'},[el('div',{class:'field'},[el('label',{text:'你的输入'}),ta]),el('div',{class:'row wrap',style:'gap:8px'},[sendBtn,imgBtn,vidBtn]),status,out]));
}

// ---- 本地兜底与工具 ----
function localTopics(field,style){ const base=[field+'的3个冷门但高赞选题','我做'+field+'踩过的坑（避坑指南）','普通人做'+field+'能赚钱吗？真实测评','一条视频讲透'+field+'的核心逻辑',field+'新手最常问的5个问题','把'+field+'做成副业，我做到了…',field+'背后的隐藏规则',field+'×'+(style||'生活')+'的反差玩法','别再盲目'+field+'了，先看这3点',field+'的极简入门路线']; return base.map(t=>({title:t,hook:'前3秒抛出悬念',angle:'实用干货向'})); }
function localBreakdown(text){ const lines=text.split(/[。！？!?\n]/).map(s=>s.trim()).filter(Boolean); return lines.map(l=>({shot:'镜头：'+l.slice(0,12)+(l.length>12?'…':''),voice:l,sec:Math.max(2,Math.round(l.length*0.25))})); }
function localBot(q){ const ans=['关于「'+q+'」：建议先拆解目标，再分步骤执行，过程中记录关键节点。','「'+q+'」是不错的方向，可以先做最小可行版本，快速验证后再迭代。','针对「'+q+'」，核心是明确受众与价值点，然后用最短路径跑通一次。','关于「'+q+'」：把大问题拆成每天能做的小动作，坚持比完美更重要。']; return ans[Math.floor(Math.random()*ans.length)]; }
function scoreMatch(text,hay){ const k=text.toLowerCase().split(/\s+/).filter(Boolean); if(!k.length)return 0; let s=0; for(const w of k){ if(hay.toLowerCase().includes(w)) s+=1; } return s/k.length; }
function buildSRT(segs){ const fmt=t=>{const m=String(Math.floor(t/60)).padStart(2,'0');const s=String(Math.floor(t%60)).padStart(2,'0');const ms=String(Math.floor((t%1)*1000)).padStart(3,'0');return m+':'+s+','+ms;}; let t=0; return segs.map((s,i)=>{ const dur=Math.max(2,(s.text||'').length*0.25); const block=(i+1)+'\n'+fmt(t)+' --> '+fmt(t+dur)+'\n'+s.text+'\n'; t+=dur; return block;}).join('\n'); }
async function genPoster(text,sub){ return new Promise(res=>{ const c=document.createElement('canvas');c.width=1080;c.height=1080;const ctx=c.getContext('2d'); const g=ctx.createLinearGradient(0,0,1080,1080); g.addColorStop(0,'#7C5CFC'); g.addColorStop(1,'#F4738F'); ctx.fillStyle=g; ctx.fillRect(0,0,1080,1080); ctx.fillStyle='rgba(255,255,255,.95)'; ctx.textAlign='center'; ctx.font='bold 76px sans-serif'; wrapText(ctx,text||'AI 生成',540,520,920,96); if(sub){ ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='34px sans-serif'; ctx.fillText(sub,540,520+60);} c.toBlob(b=>res(b),'image/png'); }); }
function wrapText(ctx,text,x,y,maxW,lh){ const words=String(text).split(''); let line='',lines=[]; for(const ch of words){ if(ctx.measureText(line+ch).width>maxW){lines.push(line);line=ch;} else line+=ch; } if(line)lines.push(line); const startY=y-(lines.length-1)*lh/2; lines.forEach((l,i)=>ctx.fillText(l,x,startY+i*lh)); }
async function renderIntroOutro({title,sub,sec,mode}){ const W=1280,H=720; const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d'); const stream=c.captureStream(30); const mr=new MediaRecorder(stream,{mimeType:'video/webm'}); const chunks=[]; mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);}; const done=new Promise(r=>mr.onstop=()=>r(new Blob(chunks,{type:'video/webm'}))); mr.start(); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<sec*30;i++){ const p=i/(sec*30); ctx.fillStyle='#1a1030'; ctx.fillRect(0,0,W,H); const g=ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'rgba(124,92,252,'+(0.3+0.3*p)+')'); g.addColorStop(1,'rgba(244,115,143,'+(0.3+0.3*p)+')'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); const cx=W/2,cy=H/2-20; const r=160+30*Math.sin(p*Math.PI); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.strokeStyle='rgba(255,255,255,'+(0.5+0.5*p)+')'; ctx.lineWidth=6; ctx.stroke(); ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.font='bold 64px sans-serif'; ctx.globalAlpha=Math.min(1,p*2); ctx.fillText(title,cx,cy+22); ctx.globalAlpha=1; if(p>0.5){ ctx.fillStyle='rgba(255,255,255,.8)'; ctx.font='32px sans-serif'; ctx.fillText(sub,cx,cy+r+50); } await sleep(1000/30); }
  mr.stop(); return done;
}

export const subs = { material:materialView, watermark:watermarkView, extract:extractView, mix:mixView, separate:separateView, enhance:enhanceView, text2video:text2videoView, cover:coverView, gen:genView, novel:novelView, topic:topicView, breakdown:breakdownView, dubsub:dubsubView, match:matchView, intro:introView, bot:botView };
