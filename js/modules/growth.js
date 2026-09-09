// 模块五：技能审美提升
import { el, uid, now, fmtDate, relTime, toast, modal, drawer, copyText, download, itemRow, itBody, itActions, escapeHtml } from '../core/utils.js';
import { putRecord, recordsBySub, softDelete, kvGet, kvSet, filesByRec, getFile } from '../core/db.js';
import { recordChange } from '../core/sync.js';
import { Collection } from '../core/crud.js';
import { subGrid, backBtn, secTitle, imagePicker, saveWithFiles, fileURL, attachFile, aiItemActions, favoriteBtn } from '../core/lib.js';
import { startRecording, hasSpeechRecognition, createTranscriber } from '../core/media.js';
import { searchAudio, getWeather } from '../core/data-services.js';
import { hasAI, callAI, parseAIJson, localSpeech, localOutfit, weatherText, detectOccasion } from '../core/ai.js';
import { deriveKey, hasKey, isRemembered, encryptText, decryptPayload } from '../core/crypto.js';
import { phrasesPanel } from './daily.js';

const MODULE='growth';
const TWISTERS=[
  '红鲤鱼与绿鲤鱼与驴，红鲤鱼与绿鲤鱼与驴，绿鲤鱼与驴与红鲤鱼。',
  '四是四，十是十，十四是十四，四十是四十。',
  '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮。',
  '扁担长，板凳宽，扁担绑在板凳上。',
  '牛郎恋刘娘，刘娘念牛郎。',
];

export const meta = { key:'growth', name:'技能审美', icon:'🎨', color:'var(--purple)', desc:'话术·衣橱·播客' };

export function render(root, goSub) {
  root.innerHTML='';
  root.appendChild(secTitle('🎨','技能审美提升',''));
  root.appendChild(subGrid([
    { icon:'🗣', title:'普通话练习', sub:'绕口令·散文', key:'mandarin', cat:'学习', onClick:()=>goSub('mandarin') },
    { icon:'💬', title:'高情商话术库', sub:'全场景', key:'eq', cat:'话术', onClick:()=>goSub('eq') },
    { icon:'👚', title:'AI衣橱管理', sub:'天气穿搭', key:'wardrobe', cat:'衣橱', onClick:()=>goSub('wardrobe') },
    { icon:'💄', title:'美妆发型笔记', sub:'学习记录', key:'beauty', cat:'美妆', onClick:()=>goSub('beauty') },
    { icon:'🎧', title:'精品播客播放', sub:'进度记忆', key:'podcast', cat:'音频', onClick:()=>goSub('podcast') },
    { icon:'📚', title:'小说阅读书架', sub:'检索存档', key:'novel', cat:'阅读', onClick:()=>goSub('novel') },
    { icon:'📷', title:'摄影构图光影', sub:'学习库', key:'photo', cat:'摄影', onClick:()=>goSub('photo') },
    { icon:'🎨', title:'设计配色灵感', sub:'排版素材', key:'design', cat:'设计', onClick:()=>goSub('design') },
    { icon:'🌱', title:'情绪随笔疏导', sub:'私密加密', key:'journal', cat:'心情', onClick:()=>goSub('journal') },
    { icon:'🧬', title:'认亲戚计算器', sub:'姐姐的姐姐', key:'kin', cat:'实用', onClick:()=>goSub('kin') },
    { icon:'👨‍👩‍👧', title:'亲戚关系图', sub:'我方/男方·连线', key:'family', cat:'实用', onClick:()=>goSub('family') },
  ], 'growth'));
}

// 绕口令
function twisterView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🗣','普通话绕口令跟读','录音存档'));
  const list=el('div',{class:'list'}); root.appendChild(list);
  TWISTERS.forEach((t,i)=>{ const card=el('div',{class:'card',style:'margin-bottom:12px'},[el('div',{class:'row between'},[el('b',{text:'第'+(i+1)+'条'}),el('button',{class:'mini-btn',onclick:()=>copyText(t)},'📋')]),el('p',{text:t,style:'margin:8px 0'}),el('button',{class:'btn btn-soft btn-sm',onclick:()=>recordFollow(t,()=>twisterView(root,back))},'🎙 跟读录音')]);
    list.appendChild(card); });
}
// 字符级 diff：标出读错 / 漏读的字
function normZh(s){ return (s||'').replace(/[\s，。！？、；：""''（）()…—,.!?;:'"\-~～·]/g,''); }
function diffChars(target, recog){
  const t=Array.from(normZh(target)); const r=Array.from(normZh(recog));
  const n=t.length, m=r.length;
  const dp=Array.from({length:n+1},()=>new Int16Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]= t[i]===r[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
  const tmark=new Array(n).fill('miss'); let i=0,j=0;
  while(i<n&&j<m){ if(t[i]===r[j]){ tmark[i]='ok'; i++; j++; } else if(dp[i+1][j]>=dp[i][j+1]) i++; else j++; }
  return {t,tmark};
}
function diffScore(target, recog){
  const {t,tmark}=diffChars(target,recog); let ok=0;
  const html=t.map((ch,k)=>{ if(tmark[k]==='ok'){ok++; return escapeHtml(ch);} return '<span class="rec-wrong">'+escapeHtml(ch)+'</span>'; }).join('');
  const score=t.length?Math.round(ok/t.length*100):0;
  return {html, score, total:t.length, ok};
}
function recordFollow(text, refresh){
  const status=el('div',{class:'card card-2',style:'margin-bottom:10px'},'点击开始，读完点停止保存');
  const live=el('div',{class:'rec-live',style:'min-height:20px;color:var(--ink-soft);white-space:pre-wrap'});
  const result=el('div',{class:'rec-diff',style:'margin-top:10px;display:none'});
  const tnode=el('div',{class:'card',style:'margin-bottom:10px;white-space:pre-wrap;line-height:1.9;font-size:15px'},text);
  const btn=el('button',{class:'btn btn-primary'},'● 开始录音');
  let rec=null, sr=null, recognized='', finalText='';
  btn.onclick=async()=>{
    if(btn.dataset.on==='1'){
      try{ if(rec&&rec.controller)rec.controller.stop(); }catch(e){}
      try{ if(sr&&sr.stop)sr.stop(); }catch(e){}
      btn.dataset.on='0'; btn.disabled=true; btn.textContent='● 开始录音'; status.textContent='已停止，保存中…';
      const {html,score,total,ok}=diffScore(text, recognized||finalText);
      const r={id:uid(),module:MODULE,sub:'twister',created:now(),updated:now(),title:'跟读',body:text,recognized:recognized||'(无语音识别)',score};
      await putRecord(r);
      if(rec&&rec.blob){ const {putFile}=await import('../core/db.js'); await putFile({id:uid(),recId:r.id,name:'rec.webm',type:rec.blob.type,kind:'audio',blob:rec.blob,ts:now()}); }
      await recordChange(r);
      result.style.display='block';
      result.innerHTML='<div class="rec-score">识别准确率：<b>'+score+'%</b>　（读准 '+ok+' / 共 '+total+' 字）</div>'
        + '<div class="rec-row"><span class="rec-k">原文</span><span class="rec-line">'+escapeHtml(text)+'</span></div>'
        + '<div class="rec-row"><span class="rec-k">你读</span><span class="rec-line">'+escapeHtml(recognized||'(无识别)')+'</span></div>'
        + '<div class="rec-row"><span class="rec-k">红字</span><span class="rec-line">'+html+'</span></div>'
        + '<div class="rec-tip">🔴 标红 = 没读准或漏读的字，多练几次就好～</div>';
      status.textContent='已保存 ✓ 准确率 '+score+'%';
      btn.disabled=false; btn.textContent='🔄 再录一次';
      return;
    }
    try{
      rec=await startRecording(); status.textContent='录音中…（读完点停止）';
      if(hasSpeechRecognition()){ sr=createTranscriber((f)=>{ finalText+=f; recognized=finalText; live.textContent=recognized; },(it)=>{ live.textContent=recognized+it; }); if(sr) sr.start(); }
      else { toast('当前浏览器无语音识别，仅保存录音','ok'); }
      btn.dataset.on='1'; btn.textContent='■ 停止并保存';
    }catch(e){ toast('无法录音：'+(e.message||e),'err'); }
  };
  modal.open('跟读录音', el('div',{},[tnode,status,live,btn,result]));
}

// 话术库（输入情境/一句话 → 生成多个合适回复）
async function eqView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💬','高情商话术库','左：输入情境生成回复 · 右：生成结果 + 人情世故话术 + 日常话术'));
  // ===== 最上方：日常话术库（单独一行 · 独立版块置顶）=====
  const phraseCard=el('div',{class:'card',style:'margin-bottom:14px'});
  phraseCard.appendChild(secTitle('💭','日常话术库','常用话术一键复制 · 也能自己添加'));
  const phraseBody=el('div',{});
  phraseCard.appendChild(phraseBody);
  root.appendChild(phraseCard);
  try{ phraseBody.appendChild(await phrasesPanel()); }catch(e){ phraseBody.appendChild(el('div',{class:'muted',text:'话术库加载失败：'+((e&&e.message)||e)})); }
  const cols=el('div',{class:'eq-cols'});
  const leftCol=el('div',{class:'eq-left'});
  const rightCol=el('div',{class:'eq-col'});
  const resultBox=el('div',{style:'margin-top:4px'});
  const genCard=el('div',{class:'card',style:'margin-bottom:0'});
  const inI=el('textarea',{class:'input',placeholder:'例如：对方说「我想你了」；或「怎么拒绝聚餐又不尴尬」'});
  const sceneSel=el('select',{class:'input'});
  ['暧昧','恋爱','朋友','职场','家人','陌生人'].forEach(s=>sceneSel.appendChild(el('option',{value:s,text:s})));
  const toneSel=el('select',{class:'input'});
  ['温柔','幽默','真诚','撩人','克制'].forEach(t=>toneSel.appendChild(el('option',{value:t,text:t})));
  const resultHead=el('h4',{text:'✨ 生成结果',style:'margin:0 0 10px'}); rightCol.appendChild(resultHead); rightCol.appendChild(resultBox);
  const genBtn=el('button',{class:'btn btn-primary',onclick:async()=>{
    if(!inI.value.trim()){toast('先描述一下情境吧','err');return;}
    genBtn.disabled=true; genBtn.textContent='生成中…'; resultBox.innerHTML='';
    const sk=el('div',{class:'skeleton-wrap'});
    for(let i=0;i<4;i++) sk.appendChild(el('div',{class:'skeleton-card'},[el('div',{class:'sk-line sk-title'}),el('div',{class:'sk-line'}),el('div',{class:'sk-line short'})]));
    resultBox.appendChild(sk);
    const input=inI.value.trim(), scene=sceneSel.value, tone=toneSel.value;
    const usingAI = await hasAI();
    let replies, src;
    try {
      if (usingAI) {
        const sys='你是高情商沟通专家。根据「对方的话/情境」「关系场景」「想要的语气」，生成 4 条得体、自然、像真人随口说出的中文回复，避免说教和书面腔。只输出 JSON 数组，每项 {"text":"回复内容","tip":"为什么合适 / 适合什么时候说"}，不要多余文字。';
        const pmt=`对方的话/情境：${input}\n关系场景：${scene}\n语气风格：${tone}\n请给 4 条。`;
        const raw=await callAI({system:sys,prompt:pmt,temperature:0.9,maxTokens:900});
        const arr=parseAIJson(raw);
        if(Array.isArray(arr)&&arr.length){replies=arr;src='AI 大模型';}
        else { const f=localSpeech({input,scene,tone}); replies=f.replies; src='本地生成（AI 返回无法解析）'; }
      } else {
        const f=localSpeech({input,scene,tone}); replies=f.replies; src='本地生成（未绑定大模型）';
      }
    } catch(e){
      const f=localSpeech({input,scene,tone}); replies=f.replies; src='本地生成（AI 调用失败：'+(e.message||e)+'）';
    }
    genBtn.disabled=false; genBtn.textContent='✨ 生成回复';
    renderReplies(resultBox, replies, {input,scene,tone}, src, renderEqLib);
  }},'✨ 生成回复');
  genCard.append(
    el('h4',{text:'💡 输入情境，生成高情商回复',style:'margin:0 0 12px'}),
    el('div',{class:'field'},[el('label',{text:'情境 / 对方说了什么'}), inI]),
    el('div',{class:'field'},[el('label',{text:'关系场景'}), sceneSel]),
    el('div',{class:'field'},[el('label',{text:'语气风格'}), toneSel]),
    genBtn
  );
  leftCol.appendChild(genCard);
  // ===== 上：高情商话术（人情世故场景：怎么说 + 怎么做）=====
  const worldSection=el('div',{class:'eq-section',style:'margin-bottom:26px'});
  worldSection.appendChild(secTitle('🤝','高情商话术','看病人、贺喜、慰问…教你怎么说、怎么做，每条可 ✎ 改名 / 编辑，可自定义 + 收藏'));
  const worldAddBtn=el('button',{class:'btn btn-primary btn-sm',onclick:openWorldAdd},'➕ 添加场景');
  worldSection.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-bottom:10px'},[worldAddBtn]));
  // 内置场景库
  const WORLD = [
    { cat:'探病', title:'去医院 / 家里看病人', say:[
      '听说你住院了，特意来看看你。别惦记工作家里，都安排好了，你就安心养病。',
      '气色比我想的好多了，医生说恢复得不错，再坚持几天就能出院啦。',
      '有什么需要的随时喊我，别客气。你好好休息，我不吵你，改天再来陪你。'
    ], do:[
      '带实用礼物：水果、营养品、鲜花（先问家属是否宜鲜花，重症/呼吸道慎送）。',
      '控制探视时间 15–30 分钟，别久坐打扰休息。',
      '话题避开"病得有多重""会不会留后遗症"，多说鼓励、轻松的。',
      '不在病房大声说笑或拍视频，注意其他病人。',
      '若刚手术/重症，先问家属能否探视再前往。'
    ]},
    { cat:'贺喜', title:'朋友结婚', say:[
      '恭喜恭喜！终于修成正果啦，真替你开心🎉',
      '新婚快乐！往后日子甜甜蜜蜜，有啥需要帮忙的尽管说。'
    ], do:[
      '红包金额按关系与当地习俗，双数吉利；备注写"新婚快乐+名字"。',
      '到场准时，着装避开纯白（抢新娘风头）与大红撞色视情况。',
      '仪式上别喧宾夺主，敬酒环节大方得体。',
      '不能到场提前送祝福+红包，并说明原因。'
    ]},
    { cat:'贺喜', title:'同事 / 朋友升职', say:[
      '太棒了！凭你的能力早就该升了，实至名归👏',
      '恭喜升职，以后还得多向你取经，请客可跑不掉哈～'
    ], do:[
      '公开场合真诚祝贺，不酸不妒。',
      '私下可约饭庆祝，别在领导面前过度表现亲近。',
      '新岗位上多配合、多请教。'
    ]},
    { cat:'慰问', title:'朋友失恋 / 处于低谷', say:[
      '这段时间你辛苦了，想说说话我随时在，不想说也陪你发呆。',
      '不是你的错，别拿别人的错惩罚自己。慢慢来，我陪你。'
    ], do:[
      '多听少说教，别急着给"解决方案"。',
      '别评价前任好坏，别催"赶紧下一个"。',
      '实际行动：带顿饭、陪散步，比千言万语有用。'
    ]},
    { cat:'道歉', title:'得罪人 / 做错事', say:[
      '那天是我不对，话说重了 / 事办砸了，真心跟你道个歉。',
      '我没考虑你的感受，让你不舒服了，以后注意，别生我气了好不好。'
    ], do:[
      '及时道歉，不找借口；先认错再解释（解释≠推脱）。',
      '用"我"开头，不说"你要是…我就…"。',
      '给出补救动作，而非只口头 sorry。',
      '对方没消气别逼着"和好"，给空间。'
    ]},
    { cat:'升学', title:'晚辈 / 朋友孩子考上', say:[
      '恭喜金榜题名！这孩子真争气，未来可期🎓',
      '考上啦！好好庆祝一下，学业更上一层楼。'
    ], do:[
      '红包 / 礼物按亲疏，附"学业进步"类祝福。',
      '不与别家孩子比较，少说"可别骄傲"。',
      '若是寒门励志，多鼓励少施舍感。'
    ]},
    { cat:'乔迁', title:'朋友搬新家', say:[
      '乔迁新居，恭喜恭喜！这下住得舒坦多了🏠',
      '新家真不错，以后常来蹭饭哈～'
    ], do:[
      '带实用礼物：绿植、餐具、小家电、鲜花，或红包。',
      '不空手上门，哪怕一束花也是心意。',
      '参观时夸布局 / 采光，别指指点点挑毛病。',
      '留意主人忌讳（如某些生肖摆件）。'
    ]},
    { cat:'丧事', title:'亲友离世，慰问家属', say:[
      '节哀顺变。有什么我能搭把手的，尽管说，别硬撑。',
      '知道这消息心里很难过，叔叔 / 阿姨一路走好。'
    ], do:[
      '言语简洁、庄重，不追问死因细节。',
      '实际帮忙：料理后事、接待、做饭、看护老小。',
      '红包 / 帛金按习俗，信封写"奠仪"。',
      '给家属空间，别过度安慰反而添负担。',
      '忌讳：别在此时说笑、拍照、穿大红大紫。'
    ]},
    { cat:'职场', title:'拒绝不合理请求', say:[
      '这个我理解，不过手头 X 项目这周要交，实在排不开，你看看能不能缓两天？',
      '我这边资源有限，怕耽误你进度，建议找 XX 更合适。'
    ], do:[
      '先肯定再拒绝，给替代方案或时间点。',
      '不情绪化，就事论事，对事不对人。',
      '留书面记录，避免日后扯皮。'
    ]}
  ];
  let wcat = WORLD[0].cat;
  let worldCustom = (await kvGet('eqworld_custom'))||[];
  let worldOverride = (await kvGet('eqworld_override'))||{};  // 内置项改名/改内容：{ [WORLD下标]: {cat,title,say,do} }
  const wCatsBar = el('div',{class:'row wrap',style:'gap:6px;margin-bottom:12px'});
  const wList = el('div',{class:'list'});
  worldSection.appendChild(wCatsBar); worldSection.appendChild(wList);
  rightCol.appendChild(worldSection);

  // 合并：内置项(可改名，存 override) + 自定义项(可改可删)
  function worldList(){
    const builtin = WORLD.map((w,i)=>{
      const ov = worldOverride[i];
      return { cat: ov?ov.cat:w.cat, title: ov?ov.title:w.title, say: ov?ov.say:w.say, do: ov?ov.do:w.do, _wi:i, _custom:false };
    });
    const custom = worldCustom.map(c=>({cat:c.cat,title:c.title,say:c.say,do:c.do,_cid:c.id,_custom:true}));
    return builtin.concat(custom);
  }

  // ===== 下：日常话术库（独立区块，可自定义添加 + 收藏 + 可搜索分类）=====
  const libSection=el('div',{class:'eq-section'});
  libSection.appendChild(secTitle('💬','日常话术库','自定义添加 + 收藏，可搜索分类'));
  let eqSearch='', eqCat='全部';
  const eqSearchI=el('input',{class:'input',style:'flex:1;min-width:160px',placeholder:'搜索话术…'});
  eqSearchI.oninput=()=>{ eqSearch=eqSearchI.value.trim().toLowerCase(); renderEqLib(); };
  const eqAddBtn=el('button',{class:'btn btn-primary btn-sm',onclick:openEqAdd},'➕ 添加话术');
  libSection.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-bottom:10px'},[eqSearchI, eqAddBtn]));
  const eqCatBar=el('div',{class:'row wrap',style:'gap:6px;margin-bottom:12px'});
  libSection.appendChild(eqCatBar);
  const eqList=el('div',{class:'list'});
  libSection.appendChild(eqList);
  rightCol.appendChild(libSection);
  cols.appendChild(leftCol); cols.appendChild(rightCol); root.appendChild(cols);
  function openWorldDetail(d){
    const sayBox = el('div',{class:'card',style:'white-space:pre-wrap'}, d.say.map(s=>'· '+s).join('\n'));
    const doBox = el('div',{class:'card',style:'white-space:pre-wrap'}, d.do.map(s=>'• '+s).join('\n'));
    modal.open('🤝 '+d.title, el('div',{},[
      el('div',{class:'field'},[el('label',{text:'🗣 该怎么说'}), sayBox]),
      el('div',{class:'field'},[el('label',{text:'🤲 怎么做 / 注意事项'}), doBox]),
      el('div',{class:'row',style:'gap:8px;margin-top:8px'},[
        el('button',{class:'btn btn-primary btn-sm',onclick:async()=>{
          await putRecord({id:uid(),module:MODULE,sub:'eq',created:now(),updated:now(),title:d.title,category:'人情世故',
            body:'【该怎么说】\n'+d.say.join('\n')+'\n\n【怎么做】\n'+d.do.join('\n')});
          await recordChange({module:MODULE,sub:'eq',op:'put',ts:now()});
          toast('已收藏到话术库（分类：人情世故）','ok'); modal.close();
        }},'⭐ 收藏到话术库'),
        el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{
          if(!(await hasAI())){ toast('未绑定大模型，先用内置模板','ok'); return; }
          const raw=await callAI({system:'你是人情世故专家。针对下面场景，补充 3 条更自然得体的话术，并补 2 条实操建议。直接给正文。',prompt:'场景：'+d.title+'\n已有话术：\n'+d.say.join('\n')+'\n已有做法：\n'+d.do.join('\n'),maxTokens:600});
          if(raw){ modal.open('🤖 AI 补充：'+d.title, el('div',{class:'card',style:'white-space:pre-wrap',text:raw})); }
        }},'🤖 用 AI 扩展')
      ])
    ]));
  }
  function renderWorld(){
    const all = worldList();
    const cats = Array.from(new Set(all.map(w=>w.cat)));
    if(!cats.includes(wcat)) wcat = cats[0]||'';
    wCatsBar.innerHTML='';
    cats.forEach(c=>wCatsBar.appendChild(el('button',{class:'chip'+(c===wcat?' chip-on':''),onclick:()=>{wcat=c;renderWorld();}},c)));
    const items = all.filter(w=>w.cat===wcat);
    wList.innerHTML='';
    if(!items.length){ wList.appendChild(el('div',{class:'empty'},'该分类暂无内容')); return; }
    items.forEach(d=>{
      const acts = el('div',{class:'it-actions'},[
        el('button',{class:'mini-btn',title:'改名 / 编辑',onclick:(e)=>{e.stopPropagation();openWorldEdit(d);}},'✎'),
        d._cid ? el('button',{class:'mini-btn',title:'删除',onclick:(e)=>{e.stopPropagation();openWorldDel(d);}},'🗑') : null
      ].filter(Boolean));
      wList.appendChild(el('div',{class:'card item',style:'cursor:pointer',onclick:()=>openWorldDetail(d)},[
        el('div',{class:'it-body'},[el('div',{class:'it-title',text:d.title}), el('div',{class:'it-meta',text: d._custom? '自定义场景 · 点开查看，✎ 可改名/编辑，🗑 可删' : '内置场景 · 点开查看，✎ 可改名 / 改内容'})]),
        acts
      ]));
    });
  }
  renderWorld();

  function openWorldDel(d){
    modal.open('删除场景', el('div',{},[
      el('p',{text:'确定删除「'+d.title+'」？此操作不可撤销。'}),
      el('div',{class:'row',style:'gap:8px'},[
        el('button',{class:'btn btn-danger btn-sm',onclick:async()=>{ worldCustom=worldCustom.filter(x=>x.id!==d._cid); await kvSet('eqworld_custom',worldCustom); toast('已删除','ok'); modal.close(); renderWorld(); }},'删除'),
        el('button',{class:'btn btn-ghost btn-sm',onclick:()=>modal.close()},'取消')
      ])
    ]));
  }

  function openWorldEdit(d){
    const isCustom = !!d._cid;
    const titleI=el('input',{class:'input',value:d.title});
    const catSel=el('select',{class:'input'});
    ['探病','贺喜','慰问','道歉','升学','乔迁','丧事','职场','其它'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
    catSel.value=d.cat;
    const sayA=el('textarea',{class:'input',style:'min-height:80px',text:(d.say||[]).join('\n')});
    const doA=el('textarea',{class:'input',style:'min-height:80px',text:(d.do||[]).join('\n')});
    modal.open('✎ '+(isCustom?'编辑场景':'改名 / 编辑内置场景'), el('div',{},[
      el('div',{class:'field'},[el('label',{text:'场景标题（可改名）'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field'},[el('label',{text:'🗣 该怎么说（每行一条）'}),sayA]),
      el('div',{class:'field'},[el('label',{text:'🤲 怎么做 / 注意事项（每行一条）'}),doA]),
      el('div',{class:'row',style:'gap:8px'},[
        el('button',{class:'btn btn-primary',onclick:async()=>{
          const title=titleI.value.trim(); if(!title){toast('先写场景标题','err');return;}
          const say=sayA.value.split('\n').map(s=>s.trim()).filter(Boolean);
          const doo=doA.value.split('\n').map(s=>s.trim()).filter(Boolean);
          if(isCustom){
            const entry=worldCustom.find(x=>x.id===d._cid);
            if(entry){entry.title=title;entry.cat=catSel.value;entry.say=say;entry.do=doo;await kvSet('eqworld_custom',worldCustom);}
          } else {
            worldOverride[d._wi]={cat:catSel.value,title,say,do:doo};
            await kvSet('eqworld_override',worldOverride);
          }
          toast('已保存','ok'); modal.close(); renderWorld();
        }},'保存'),
        el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
      ])
    ]));
  }

  function openEqAdd(){
    const titleI=el('input',{class:'input',placeholder:'标题/场景，如：拒绝聚餐'});
    const catSel=el('select',{class:'input'});
    ['暧昧','恋爱','朋友','职场','家人','陌生人','其它'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
    const bodyA=el('textarea',{class:'input',style:'min-height:90px',placeholder:'写下这条话术内容…'});
    modal.open('添加话术', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'标题'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field'},[el('label',{text:'内容'}),bodyA]),
      el('button',{class:'btn btn-primary',onclick:async()=>{
        const body=bodyA.value.trim(); if(!body){toast('先写内容','err');return;}
        await putRecord({id:uid(),module:MODULE,sub:'eq',created:now(),updated:now(),
          title:titleI.value.trim()||'话术', category:catSel.value, body});
        await recordChange({module:MODULE,sub:'eq',op:'put',ts:now()});
        toast('已添加','ok'); modal.close(); renderEqLib();
      }},'保存')
    ]));
  }

  function openWorldAdd(){
    const titleI=el('input',{class:'input',placeholder:'场景标题，如：同事生病慰问'});
    const catSel=el('select',{class:'input'});
    ['探病','贺喜','慰问','道歉','升学','乔迁','丧事','职场','其它'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
    const sayA=el('textarea',{class:'input',style:'min-height:80px',placeholder:'🗣 该怎么说（每行一条）'});
    const doA=el('textarea',{class:'input',style:'min-height:80px',placeholder:'🤲 怎么做 / 注意事项（每行一条）'});
    modal.open('添加人情世故场景', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'场景标题'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field'},[el('label',{text:'🗣 该怎么说（每行一条）'}),sayA]),
      el('div',{class:'field'},[el('label',{text:'🤲 怎么做 / 注意事项（每行一条）'}),doA]),
      el('button',{class:'btn btn-primary',onclick:async()=>{
        const title=titleI.value.trim(); if(!title){toast('先写场景标题','err');return;}
        const say=sayA.value.split('\n').map(s=>s.trim()).filter(Boolean);
        const doo=doA.value.split('\n').map(s=>s.trim()).filter(Boolean);
        worldCustom.push({id:uid(),cat:catSel.value,title,say,do:doo});
        await kvSet('eqworld_custom',worldCustom);
        wcat=catSel.value;
        toast('已添加场景','ok'); modal.close(); renderWorld();
      }},'保存')
    ]));
  }

  function openEqEdit(r){
    const titleI=el('input',{class:'input',value:r.title||''});
    const catSel=el('select',{class:'input'});
    ['暧昧','恋爱','朋友','职场','家人','陌生人','其它'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
    catSel.value=r.category||r.scene||'其它';
    const bodyA=el('textarea',{class:'input',style:'min-height:90px',text:r.body||''});
    modal.open('✎ 编辑话术', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'标题（可改名）'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field'},[el('label',{text:'内容'}),bodyA]),
      el('div',{class:'row',style:'gap:8px'},[
        el('button',{class:'btn btn-primary',onclick:async()=>{
          const upd={...r, title:titleI.value.trim()||'话术', category:catSel.value, body:bodyA.value.trim(), updated:now()};
          await putRecord(upd); await recordChange({module:MODULE,sub:'eq',op:'put',ts:now()});
          toast('已保存','ok'); modal.close(); renderEqLib();
        }},'保存'),
        el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')
      ])
    ]));
  }

  async function renderEqLib(){
    const items=(await recordsBySub(MODULE,'eq')).sort((a,b)=>b.created-a.created);
    const cats=['全部', ...Array.from(new Set(items.map(r=>r.category||r.scene||'未分类')))];
    eqCatBar.innerHTML='';
    cats.forEach(c=>eqCatBar.appendChild(el('button',{class:'chip'+(c===eqCat?' chip-on':''),onclick:()=>{eqCat=c;renderEqLib();}},c)));
    const ql=eqSearch;
    const filtered=items.filter(r=>{
      const cat=(r.category||r.scene||'未分类');
      const okCat = eqCat==='全部'||cat===eqCat;
      const okQ = !ql || (r.title||'').toLowerCase().includes(ql) || (r.body||'').toLowerCase().includes(ql);
      return okCat && okQ;
    });
    eqList.innerHTML='';
    if(!filtered.length){ eqList.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'💬'}),el('div',{text: items.length? '没有匹配的话术':'生成的回复点「收藏」，或点「添加话术」'})])); return; }
    for(const r of filtered){
      const rowActions=itActions(
        favoriteBtn(r, renderEqLib),
        el('button',{class:'mini-btn',title:'改名 / 编辑',onclick:()=>openEqEdit(r)},'✎'),
        el('button',{class:'mini-btn',title:'复制',onclick:()=>copyText(r.body||'')},'📋'),
        el('button',{class:'mini-btn',title:'删除',onclick:async()=>{if(confirm('删除？')){await softDelete(r.id);toast('已删除','ok');renderEqLib();}}},'🗑')
      );
      const ai=await aiItemActions({title:r.title||'',body:r.body||'',onApply:async(out,mode)=>{ const upd={...r,body:mode==='generate'?out:(mode==='continue'?(r.body||'')+'\n'+out:out),updated:now()};await putRecord(upd);await recordChange({module:MODULE,sub:'eq',op:'put',ts:now()});renderEqLib(); }});
      ai.childNodes.forEach(n=>rowActions.appendChild(n));
      eqList.appendChild(itemRow('💬',
        itBody([r.title||'话术', (r.category||r.scene)?(' · '+(r.category||r.scene)):''], r.body||''),
        rowActions
      ));
    }
  }
  renderEqLib();
}

function renderReplies(box, replies, ctx, src, refresh){
  box.innerHTML='';
  box.appendChild(el('div',{class:'muted',style:'font-size:12px;margin-bottom:8px'}, `来源：${src} · 场景 ${ctx.scene} · 语气 ${ctx.tone}`));
  (replies||[]).forEach(r=>{
    const card=el('div',{class:'card card-2',style:'margin-bottom:12px'});
    card.appendChild(el('p',{text:r.text||r,style:'margin:4px 0 6px;font-size:15px;line-height:1.6'}));
    if(r.tip) card.appendChild(el('div',{class:'muted',style:'font-size:12px',text:'💡 '+(r.tip||'')}));
    card.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-top:8px'},[
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(r.text||r)},'📋 复制'),
      el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{
        await putRecord({id:uid(),module:MODULE,sub:'eq',created:now(),updated:now(),
          title:(ctx.input||'话术').slice(0,30), scene:ctx.scene, category:ctx.scene, body:(r.text||r)});
        await recordChange({id:uid(),module:MODULE,sub:'eq',op:'put',ts:now()});
        toast('已收藏','ok'); refresh&&refresh();
      }},'⭐ 收藏')
    ]));
    box.appendChild(card);
  });
}

// 衣橱
function wardrobeView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('👚','AI衣橱管理','左：场合+身材 · 右：上传单品+搜索'));
  const cols=el('div',{class:'wt-cols'});
  const leftCol=el('div',{class:'wt-left'});
  const rightCol=el('div',{class:'wt-right'});
  cols.append(leftCol,rightCol);

  // —— 左：生成表单（场合 + 身高体重 + 风格）——
  const genCard=el('div',{class:'card',style:'margin-bottom:0'});
  const occI=el('textarea',{class:'input',rows:2,placeholder:'描述场合，例如：约会 / 露营拍照 / 上班开会'});
  const hI=el('input',{class:'input',placeholder:'身高 cm，如 168'});
  const wI=el('input',{class:'input',placeholder:'体重 kg，如 52'});
  const styleSel=el('select',{class:'input'});
  ['温柔','甜美','帅气','简约','辣妹','通勤'].forEach(s=>styleSel.appendChild(el('option',{value:s,text:s})));
  const genderSel=el('select',{class:'input'});
  ['女','男'].forEach(g=>genderSel.appendChild(el('option',{value:g,text:g})));
  const weaI=el('input',{class:'input',placeholder:'天气（自动获取，可改）'});
  (async()=>{ try{ const w=await getWeather(); weaI.value=weatherText(w.current.weather_code, w.current.temperature_2m); }catch{} })();
  const resBox=el('div',{style:'margin-top:12px'});
  const genBtn=el('button',{class:'btn btn-primary',onclick:async()=>{
    const text=occI.value.trim(); if(!text){toast('先描述一下场合吧～','err');return;}
    genBtn.disabled=true; genBtn.textContent='生成中…'; resBox.innerHTML='';
    const sk=el('div',{class:'skeleton-wrap'});
    for(let i=0;i<3;i++) sk.appendChild(el('div',{class:'skeleton-card'},[el('div',{class:'sk-line sk-title'}),el('div',{class:'sk-line'}),el('div',{class:'sk-line short'})]));
    resBox.appendChild(sk);
    const items=await recordsBySub(MODULE,'wardrobe');
    const byCat={}; items.forEach(r=>{ (byCat[r.category||'其它']=byCat[r.category||'其它']||[]).push((r.title||'')+(r.color?'（'+r.color+'）':'')); });
    const catText=Object.entries(byCat).map(([c,arr])=>`- ${c}：${arr.join('、')||'（暂无）'}`).join('\n');
    const occasion=detectOccasion(text)||'其他', style=styleSel.value, gender=genderSel.value, weather=weaI.value||'晴';
    const height=(parseInt(hI.value)||0), weight=(parseInt(wI.value)||0);
    let out, src='本地生成';
    try {
      if (await hasAI()) {
        const sys='你是专业形象顾问。根据用户衣橱已有单品、场合、天气、风格、性别，推荐 3 套完整造型。每套尽量从"衣橱单品"里挑选真实存在的单品组合，不要凭空捏造不存在的衣服。输出纯 JSON 数组，每项：{"name":"方案名（含风格）","items":["单品1","单品2"...],"color":"整体配色建议（如：米白+焦糖棕，温柔高级）","makeup":{"base":"底妆要点","eye":"眼妆要点","lip":"唇妆要点","blush":"腮红/修容要点"},"tip":"一句话要点"}，不要任何多余文字。';
        const pmt=`我的衣橱单品：\n${catText||'（衣橱为空）'}\n\n用户说：「${text}」\n场合：${occasion}　天气：${weather}　风格：${style}　性别：${gender}${height?('　身高：'+height+'cm'):''}${weight?('　体重：'+weight+'kg'):''}\n请给 3 套造型，每套附详细妆容（底妆/眼妆/唇妆/腮红）与配色建议。`;
        const raw=await callAI({system:sys,prompt:pmt,temperature:0.9,maxTokens:1200});
        const arr=parseAIJson(raw);
        if (Array.isArray(arr)&&arr.length){ out=arr; src='AI 大模型'; }
        else out=buildWardrobeLocal(items,occasion,weather,style,gender);
      } else out=buildWardrobeLocal(items,occasion,weather,style,gender);
    } catch(e){ out=buildWardrobeLocal(items,occasion,weather,style,gender); }
    genBtn.disabled=false; genBtn.textContent='✨ 生成穿搭+妆容';
    renderWardrobeAI(resBox, out, {occasion,weather,style,gender,text,height,weight}, src, root, back, items);
  }},'✨ 生成穿搭+妆容');
  genCard.append(
    el('div',{class:'field'},[el('label',{text:'场合（自由描述）'}), occI]),
    el('div',{class:'row',style:'gap:10px'},[el('div',{style:'flex:1'},[el('label',{text:'身高 cm'}), hI]),el('div',{style:'flex:1'},[el('label',{text:'体重 kg'}), wI])]),
    el('div',{class:'row',style:'gap:10px'},[el('div',{style:'flex:1'},[el('label',{text:'风格'}), styleSel]),el('div',{style:'flex:1'},[el('label',{text:'性别'}), genderSel])]),
    el('div',{class:'field'},[el('label',{text:'天气'}), weaI]),
    genBtn, resBox);
  leftCol.appendChild(genCard);

  // —— 右：上传单品（可多选）+ 搜索 + 衣橱网格 ——
  const upCard=el('div',{class:'card'});
  upCard.appendChild(secTitle('📷','上传我的单品',''));
  const picker=imagePicker('衣服 / 鞋包图片（可多选）', {multiple:true});
  const catSel=el('select',{class:'input'});
  ['上装','下装','外套','鞋','包','配饰','饰品'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
  const nameI=el('input',{class:'input',placeholder:'单品名称（如：米白针织衫）'});
  const colorI=el('input',{class:'input',placeholder:'颜色（可选）'});
  const upBtn=el('button',{class:'btn btn-primary btn-sm',onclick:async()=>{
    const files=picker.getFiles();
    if(!files.length){toast('先选图片','err');return;}
    upBtn.disabled=true; upBtn.textContent='保存中…';
    for(const f of files){
      const rec=await putRecord({id:uid(),module:MODULE,sub:'wardrobe',created:now(),updated:now(),title:nameI.value.trim()||'单品',category:catSel.value,color:colorI.value.trim(),body:''});
      await attachFile(rec.id, f);
      await recordChange(rec);
    }
    toast('已添加 '+files.length+' 件单品','ok'); nameI.value=''; colorI.value='';
    upBtn.disabled=false; upBtn.textContent='➕ 保存单品';
    renderGrid(searchI.value.trim());
  }},'➕ 保存单品');
  upCard.append(picker,
    el('div',{class:'row',style:'gap:10px;margin-top:8px'},[el('div',{style:'flex:1'},[el('label',{text:'类别'}), catSel]),el('div',{style:'flex:1'},[el('label',{text:'名称'}), nameI])]),
    el('div',{class:'field',style:'margin-top:8px'},[el('label',{text:'颜色'}), colorI]),
    upBtn);
  rightCol.appendChild(upCard);

  // 右栏：一键 AI 帮我搭配（基于已上传单品）
  const aiBox=el('div',{class:'card',style:'margin-top:12px'});
  aiBox.appendChild(secTitle('✨','AI 帮我搭配','用你已上传的单品智能组合穿搭'));
  const aiOccI=el('input',{class:'input',placeholder:'想搭什么场合？（可留空=日常）'});
  const aiBtn=el('button',{class:'btn btn-primary btn-sm',onclick:async()=>{
    const items=await recordsBySub(MODULE,'wardrobe');
    if(!items.length){ toast('先在上方上传几件单品吧～','err'); return; }
    aiBtn.disabled=true; aiBtn.textContent='搭配中…';
    const box=el('div',{style:'margin-top:8px'}); aiBox.appendChild(box); box.innerHTML='';
    const sk=el('div',{class:'skeleton-wrap'}); for(let i=0;i<3;i++) sk.appendChild(el('div',{class:'skeleton-card'},[el('div',{class:'sk-line sk-title'}),el('div',{class:'sk-line'}),el('div',{class:'sk-line short'})])); box.appendChild(sk);
    const byCat={}; items.forEach(r=>{ (byCat[r.category||'其它']=byCat[r.category||'其它']||[]).push((r.title||'')+(r.color?'（'+r.color+'）':'')); });
    const catText=Object.entries(byCat).map(([c,arr])=>`- ${c}：${arr.join('、')||'（暂无）'}`).join('\n');
    const text=aiOccI.value.trim()||'日常穿搭', occasion=detectOccasion(text)||'其他', style=styleSel.value, gender=genderSel.value, weather=weaI.value||'晴';
    const height=(parseInt(hI.value)||0), weight=(parseInt(wI.value)||0);
    let out, src='本地生成';
    try {
      if (await hasAI()) {
        const sys='你是专业形象顾问。根据用户衣橱已有单品、场合、天气、风格、性别，推荐 3 套完整造型。每套尽量从"衣橱单品"里挑选真实存在的单品组合，不要凭空捏造。输出纯 JSON 数组，每项：{"name":"方案名","items":["单品1","单品2"...],"color":"整体配色建议","makeup":{"base":"底妆要点","eye":"眼妆要点","lip":"唇妆要点","blush":"腮红/修容要点"},"tip":"一句话要点"}，不要任何多余文字。';
        const pmt=`我的衣橱单品：\n${catText}\n\n用户说：「${text}」\n场合：${occasion}　天气：${weather}　风格：${style}　性别：${gender}${height?('　身高：'+height+'cm'):''}${weight?('　体重：'+weight+'kg'):''}\n请给 3 套造型，每套附详细妆容与配色建议。`;
        const raw=await callAI({system:sys,prompt:pmt,temperature:0.9,maxTokens:1200});
        const arr=parseAIJson(raw);
        if (Array.isArray(arr)&&arr.length){ out=arr; src='AI 大模型'; } else out=buildWardrobeLocal(items,occasion,weather,style,gender);
      } else out=buildWardrobeLocal(items,occasion,weather,style,gender);
    } catch(e){ out=buildWardrobeLocal(items,occasion,weather,style,gender); }
    aiBtn.disabled=false; aiBtn.textContent='✨ AI 帮我搭配';
    renderWardrobeAI(box, out, {occasion,weather,style,gender,text,height,weight}, src, root, back, items);
  }},'✨ AI 帮我搭配');
  aiBox.append(aiOccI, el('div',{class:'row',style:'gap:8px;margin-top:8px'},[aiBtn]));
  rightCol.appendChild(aiBox);

  const searchI=el('input',{class:'input',style:'margin-top:12px',placeholder:'🔍 搜索衣橱单品 / 类别 / 颜色…'});
  searchI.oninput=()=>renderGrid(searchI.value.trim());
  rightCol.appendChild(searchI);
  const grid=el('div',{class:'ward-grid',style:'margin-top:10px'});
  rightCol.appendChild(grid);

  async function renderGrid(q){
    grid.innerHTML='';
    const items=await recordsBySub(MODULE,'wardrobe');
    const ql=(q||'').trim().toLowerCase();
    const f=items.filter(r=>!ql||(r.title||'').toLowerCase().includes(ql)||(r.category||'').toLowerCase().includes(ql)||(r.color||'').toLowerCase().includes(ql));
    if(!f.length){ grid.appendChild(el('div',{class:'muted',style:'grid-column:1/-1;padding:14px 0'},'还没有单品，先在上方上传～')); return; }
    f.forEach(r=>{
      const card=el('div',{class:'ward-item',onclick:()=>openWardEdit(r)});
      const thumb=el('div',{class:'ward-thumb'});
      (async()=>{ const u=await fileURL(r.id); if(u) thumb.style.backgroundImage='url('+u+')'; else thumb.textContent='👚'; })();
      card.append(thumb, el('div',{class:'ward-meta'},[el('div',{class:'ward-name',text:r.title||'单品'}), el('div',{class:'ward-cat',text:(r.category||'')+(r.color?' · '+r.color:'')})]));
      grid.appendChild(card);
    });
  }
  async function openWardEdit(r){
    const files=await filesByRec(r.id);
    const u=files.length?URL.createObjectURL(files[0].blob):null;
    const img=el('img',{src:u||'',style:u?'width:100%;border-radius:10px;margin-bottom:8px;max-height:220px;object-fit:cover':'display:none'});
    const titleI=el('input',{class:'input',value:r.title||''});
    const catSel2=el('select',{class:'input'});
    ['上装','下装','外套','鞋','包','配饰','饰品'].forEach(c=>catSel2.appendChild(el('option',{value:c,text:c})));
    catSel2.value=r.category||'上装';
    const colorI2=el('input',{class:'input',value:r.color||''});
    const bodyI=el('textarea',{class:'input',rows:2,value:r.body||''});
    const saveBtn=el('button',{class:'btn btn-primary',onclick:async()=>{
      r.title=titleI.value.trim(); r.category=catSel2.value; r.color=colorI2.value.trim(); r.body=bodyI.value.trim(); r.updated=now();
      await putRecord(r); await recordChange(r); toast('已更新','ok'); modal.close(); renderGrid(searchI.value.trim());
    }},'保存');
    modal.open('编辑单品', el('div',{},[img,
      el('div',{class:'field'},[el('label',{text:'名称'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'类别'}),catSel2]),
      el('div',{class:'field'},[el('label',{text:'颜色'}),colorI2]),
      el('div',{class:'field'},[el('label',{text:'搭配建议'}),bodyI]),
      el('div',{class:'row',style:'gap:8px'},[saveBtn, el('button',{class:'btn btn-ghost',onclick:async()=>{await softDelete(r.id);modal.close();renderGrid(searchI.value.trim());}},'🗑 删除')])
    ]));
  }
  renderGrid('');

  // —— 我的穿搭存档（合并自「日常规划 · 每日穿搭」）——
  const diaryCard=el('div',{class:'card',style:'margin-top:14px'});
  diaryCard.appendChild(secTitle('📖','我的穿搭存档','AI 搭配可一键「⭐ 存入穿搭」，在这里按时间回顾'));
  const diaryList=el('div',{style:'margin-top:8px'});
  diaryCard.appendChild(diaryList);
  async function renderDiary(){
    diaryList.innerHTML='';
    const list=await recordsBySub(MODULE,'outfit');
    list.sort((a,b)=>(b.created||0)-(a.created||0));
    if(!list.length){ diaryList.appendChild(el('div',{class:'muted',style:'padding:10px 0'},'还没有穿搭存档，搭配后点「⭐ 存入穿搭」即可记录～')); return; }
    list.forEach(r=>{
      const item=el('div',{class:'diary-item',onclick:async()=>{
        const del=el('button',{class:'btn btn-ghost',onclick:async(e)=>{e.stopPropagation(); await softDelete(r.id); await recordChange({id:uid(),module:MODULE,sub:'outfit',op:'del',ts:now()}); renderDiary(); toast('已删除','ok');}},'🗑 删除');
        modal.open(r.title||'穿搭', el('div',{},[ el('div',{class:'muted',text:(r.date||'')+' · '+(r.occasion||'')+(r.weather?(' · '+r.weather):''),style:'margin-bottom:8px'}), el('div',{style:'white-space:pre-wrap;line-height:1.7;font-size:14px'}, r.body||''), el('div',{class:'row',style:'margin-top:10px'},[del]) ]));
      }});
      item.append(
        el('div',{class:'diary-top'},[el('b',{text:r.title||'造型'}), el('span',{class:'muted',style:'font-size:12px'}, (r.date||'')+(r.occasion?(' · '+r.occasion):''))]),
        el('div',{class:'diary-body',text:(r.body||'').slice(0,80)})
      );
      diaryList.appendChild(item);
    });
  }
  renderDiary();
  root.appendChild(diaryCard);

  root.appendChild(cols);
}

function buildWardrobeLocal(items,occasion,weather,style,gender){
  const pick=cat=>items.filter(i=>i.category===cat).map(i=>i.title).filter(Boolean);
  const up=pick('上装'),down=pick('下装'),coat=pick('外套'),shoe=pick('鞋'),bag=pick('包').concat(pick('配饰'),pick('饰品'));
  const M={
    '辣妹':{base:'哑光雾面持妆底妆，遮瑕到位',eye:'小烟熏+亮片点缀，眼线微挑',lip:'镜面红唇/莓果色',blush:'少量收缩修容，强调轮廓',color:'黑+辣妹亮色，酷感撞色'},
    '通勤':{base:'清透伪素颜底妆',eye:'大地色平涂消肿',lip:'豆沙/奶茶裸色',blush:'自然杏色轻扫',color:'米白+浅灰蓝，干净利落'},
    '甜美':{base:'奶油肌水润底妆',eye:'粉棕晕染+卧蚕提亮',lip:'粉橘少女色',blush:'氛围感腮红横扫',color:'粉白+浅蓝/鹅黄，软萌甜系'},
    '温柔':{base:'水光肌薄透底妆',eye:'浅棕+细闪，温柔无辜',lip:'玫瑰豆沙色',blush:'膨润感腮红',color:'米杏+奶油白，温柔高级'},
    '帅气':{base:'哑光雾面底妆',eye:'上扬眼线+小面积深色',lip:'裸色/红棕',blush:'少量',color:'黑+牛仔蓝/皮革棕，酷飒中性'},
    '简约':{base:'清透薄底',eye:'单色平涂',lip:'润色护唇',blush:'淡扫',color:'黑白灰+单一主色，极简'}
  };
  const m=M[style]||M['温柔'];
  const mk=(n)=>({ name:n,
    items:[up[0]||'上装',(coat[0]||down[0]||'下装'),shoe[0]||'鞋',(bag[0]||'配饰')].filter(Boolean),
    color:m.color,
    makeup:{base:m.base,eye:m.eye,lip:m.lip,blush:m.blush},
    tip:'依据现有单品自由组合，可上下更换。' });
  return [mk('造型一'),mk('造型二'),mk('造型三')];
}

// 把配色文案转成可用的主色（用于数字模特上色）
function outfitColor(scheme){
  const map=[['焦糖棕','#8a5a2b'],['棕','#8a5a2b'],['卡其','#c9b48a'],['米白','#efe7da'],['米','#efe7da'],['鹅黄','#f0e2a0'],['白','#f1ece4'],['黑','#2b2b2b'],['蓝','#6b8fc4'],['牛仔','#5b7aa8'],['粉','#f3c6d6'],['红','#c0504d'],['绿','#7fae7f'],['黄','#e8c46a'],['灰','#b6b6b6'],['紫','#9a7fc4']];
  for(const [k,v] of map){ if(scheme && scheme.includes(k)) return v; }
  return '#b9a7d6';
}
// 数字模特：按身高/体重算比例，把推荐穿搭画上身；支持正面/背面切换 + 拖动旋转
function renderMannequin(opts){
  const {height=168, weight=52, gender='女', items=[], color='', makeup=null, name=''} = opts||{};
  const bmi = (weight && height) ? weight/Math.pow(height/100,2) : 21;
  const wScale = Math.max(0.82, Math.min(1.22, Math.sqrt(bmi/21)));
  let side='front', rot=0, dragging=false, lastX=0;
  const svgWrap=el('div',{class:'mk-svg'});
  const cTop=outfitColor(color), cBot=outfitColor(items.join(' '));
  const draw=()=>{
    const W=200, H=380, cx=W/2, bodyW=46*wScale, headR=16;
    const topY=40, topH=108, legY=topY+topH, legH=120, legW=bodyW*0.42, legGap=6;
    const sleeve=bodyW*0.46, skin='#f0c9a8', hair='#3a2c23', top=cTop, bot=cBot;
    const legX1=cx-legW-legGap/2, legX2=cx+legGap/2;
    let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
    s+=`<circle cx="${cx}" cy="${topY-headR+6}" r="${headR+3}" fill="${hair}"/>`;
    s+=`<circle cx="${cx}" cy="${topY-headR+10}" r="${headR}" fill="${skin}"/>`;
    if(side==='front'){
      s+=`<circle cx="${cx-6}" cy="${topY-headR+10}" r="2" fill="#3a2c23"/><circle cx="${cx+6}" cy="${topY-headR+10}" r="2" fill="#3a2c23"/>`;
      s+=`<path d="M${cx-5} ${topY-headR+18} q5 4 10 0" stroke="#b5654a" stroke-width="1.6" fill="none"/>`;
    } else { s+=`<circle cx="${cx}" cy="${topY-headR-3}" r="9" fill="${hair}"/>`; }
    s+=`<rect x="${cx-bodyW/2}" y="${topY}" width="${bodyW}" height="${topH}" rx="12" fill="${top}"/>`;
    s+=`<rect x="${cx-bodyW/2-sleeve}" y="${topY}" width="${sleeve}" height="${topH*0.5}" rx="10" fill="${top}"/>`;
    s+=`<rect x="${cx+bodyW/2}" y="${topY}" width="${sleeve}" height="${topH*0.5}" rx="10" fill="${top}"/>`;
    s+=`<rect x="${cx-bodyW/2-sleeve-4}" y="${topY+topH*0.5}" width="8" height="${topH*0.42}" rx="4" fill="${skin}"/>`;
    s+=`<rect x="${cx+bodyW/2+sleeve-4}" y="${topY+topH*0.5}" width="8" height="${topH*0.42}" rx="4" fill="${skin}"/>`;
    s+=`<rect x="${legX1}" y="${legY}" width="${legW}" height="${legH}" rx="10" fill="${bot}"/>`;
    s+=`<rect x="${legX2}" y="${legY}" width="${legW}" height="${legH}" rx="10" fill="${bot}"/>`;
    const ankleY=legY+legH-24;
    s+=`<rect x="${legX1+4}" y="${ankleY}" width="12" height="28" rx="6" fill="${skin}"/>`;
    s+=`<rect x="${legX2+legW-16}" y="${ankleY}" width="12" height="28" rx="6" fill="${skin}"/>`;
    s+=`<ellipse cx="${legX1+legW/2}" cy="${legY+legH+4}" rx="15" ry="7" fill="#3a3a3a"/>`;
    s+=`<ellipse cx="${legX2+legW/2}" cy="${legY+legH+4}" rx="15" ry="7" fill="#3a3a3a"/>`;
    s+=`</svg>`;
    svgWrap.innerHTML=s;
  };
  draw();
  const flip=el('div',{class:'mk-flip'});
  const fb=el('button',{class:'btn btn-sm on',onclick:()=>{side='front';draw();fb.classList.add('on');bb.classList.remove('on');}},'👤 正面');
  const bb=el('button',{class:'btn btn-sm',onclick:()=>{side='back';draw();bb.classList.add('on');fb.classList.remove('on');}},'🔄 背面');
  flip.append(fb,bb);
  const tag=el('div',{class:'muted',style:'text-align:center;margin-top:6px;font-size:13px'}, `${gender} · ${height||'?'}cm / ${weight||'?'}kg　拖动模特可旋转，看正面与背面`);
  svgWrap.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;});
  svgWrap.addEventListener('pointermove',e=>{ if(!dragging)return; rot+=(e.clientX-lastX)*0.6; lastX=e.clientX; svgWrap.style.transform='perspective(700px) rotateY('+rot+'deg)'; });
  svgWrap.addEventListener('pointerup',()=>{dragging=false;});
  svgWrap.addEventListener('pointerleave',()=>{dragging=false;});
  const stage=el('div',{class:'mk-stage'},[svgWrap]);
  const box=el('div',{},[flip, stage, tag]);
  if(makeup){
    const lines = typeof makeup==='string' ? [['',makeup]] : [['底妆',makeup.base],['眼妆',makeup.eye],['唇妆',makeup.lip],['腮红/修容',makeup.blush]].filter(([l,t])=>t);
    const mkBox=el('div',{class:'mk-mk'});
    mkBox.appendChild(el('b',{text:'💄 配套妆容'}));
    lines.forEach(([l,t])=>mkBox.appendChild(el('div',{style:'font-size:13px;margin-top:4px'},[l?el('b',{text:l+'：'}):'',document.createTextNode(t)])));
    box.appendChild(mkBox);
  }
  modal.open('👤 '+(name||'上身效果预览'), box);
}

function renderWardrobeAI(box, out, ctx, src, root, back, items){
  box.innerHTML='';
  box.appendChild(el('div',{class:'muted',style:'font-size:12px;margin-bottom:8px'}, `来源：${src} · 「${ctx.text}」 · ${ctx.weather}`));
  out.forEach(o=>{
    const card=el('div',{class:'card card-2',style:'margin-bottom:12px'});
    card.appendChild(el('div',{class:'row between'},[el('b',{text:o.name||'造型'}), el('span',{class:'tag',text:'👗'})]));
    const ul=el('ul',{style:'margin:8px 0;font-size:14px;padding-left:18px'});
    (o.items||[]).forEach(it=>ul.appendChild(el('li',{text:it})));
    card.appendChild(ul);
    if(o.color) card.appendChild(el('div',{style:'font-size:13px;margin:6px 0'},[el('b',{text:'🎨 配色：'}), document.createTextNode(o.color)]));
    const mkLines = typeof o.makeup==='string'
      ? (o.makeup?[['',o.makeup]]:[])
      : [['底妆',o.makeup.base],['眼妆',o.makeup.eye],['唇妆',o.makeup.lip],['腮红/修容',o.makeup.blush]].filter(([l,t])=>t);
    if(mkLines.length){
      const md=el('div',{style:'font-size:13px;margin:6px 0'},[el('b',{text:'💄 妆容'})]);
      const ml=el('ul',{style:'margin:4px 0 0;font-size:13px;padding-left:18px'});
      mkLines.forEach(([l,t])=>ml.appendChild(el('li',{},[ l?el('b',{text:l+'：'}):'', document.createTextNode(t)])));
      md.appendChild(ml); card.appendChild(md);
    }
    if(o.tip) card.appendChild(el('div',{class:'muted',style:'font-size:13px'},'💡 '+o.tip));
    const mkText = typeof o.makeup==='string'
      ? o.makeup
      : [o.makeup&&o.makeup.base?('底妆：'+o.makeup.base):'', o.makeup&&o.makeup.eye?('眼妆：'+o.makeup.eye):'', o.makeup&&o.makeup.lip?('唇妆：'+o.makeup.lip):'', o.makeup&&o.makeup.blush?('腮红/修容：'+o.makeup.blush):''].filter(Boolean).join(' / ');
    card.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-top:8px'},[
      el('button',{class:'btn btn-primary btn-sm',onclick:()=>renderMannequin({height:ctx.height, weight:ctx.weight, gender:ctx.gender, items:o.items||[], color:o.color||'', makeup:o.makeup, name:o.name})},'👤 看上身效果'),
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText([o.name,...(o.items||[]), o.color?('🎨 配色：'+o.color):'', mkText?('💄 妆容：'+mkText):'', o.tip?('💡'+o.tip):''].filter(Boolean).join('\n'))},'📋 复制'),
      el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{
        await putRecord({id:uid(),module:MODULE,sub:'outfit',created:now(),updated:now(),
          title:(o.name||'造型')+'（'+(ctx.occasion)+'）', date:fmtDate(now()), occasion:ctx.occasion, weather:ctx.weather,
          body:[...(o.items||[]), o.color?('🎨'+(o.color)):'', mkText?('💄'+mkText):'', o.tip?('💡'+o.tip):''].filter(Boolean).join(' · ')});
        await recordChange({id:uid(),module:MODULE,sub:'outfit',op:'put',ts:now()});
        toast('已存入穿搭存档','ok');
      }},'⭐ 存入穿搭')
    ]));
    box.appendChild(card);
  });
}

// 美妆
// 美妆发型教程笔记：支持 文字 / 链接 / 网页 / 图片 / PDF / PPT 多类型
function beautyView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('💄','美妆发型教程笔记','支持 文字 / 链接 / 网页 / 图片 / PDF / PPT'));
  const TYPES=[{k:'text',label:'文字'},{k:'link',label:'链接'},{k:'web',label:'网页'},{k:'image',label:'图片'},{k:'pdf',label:'PDF'},{k:'ppt',label:'PPT'}];
  const TYPE_LABEL={text:'文字',link:'链接',web:'网页',image:'图片',pdf:'PDF',ppt:'PPT'};
  const ICO={text:'📝',link:'🔗',web:'🌐',image:'🖼️',pdf:'📄',ppt:'📊'};
  const EXT={pdf:'.pdf',ppt:'.pptx',image:'.png'};
  const list=el('div',{class:'list'}); root.appendChild(list);
  const searchI=el('input',{class:'input',style:'max-width:300px',placeholder:'🔎 搜索标题 / 标签'});
  const addBtn=el('button',{class:'btn btn-primary',onclick:()=>openEdit(null)},'➕ 添加内容');
  root.insertBefore(el('div',{class:'card',style:'margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center'},[searchI,addBtn]), list);
  searchI.oninput=()=>render();

  async function render(){
    const items=(await recordsBySub(MODULE,'beauty')).sort((a,b)=>b.created-a.created);
    const q=searchI.value.trim().toLowerCase();
    const arr=items.filter(r=>!q||(r.title||'').toLowerCase().includes(q)||(r.tags||[]).join(' ').toLowerCase().includes(q)||(r.note||'').toLowerCase().includes(q)||(r.url||'').toLowerCase().includes(q));
    list.innerHTML='';
    if(!arr.length){ list.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'💄'}),el('div',{text: items.length? '没有匹配的内容':'添加喜欢的妆容/发型教程，支持文字、链接、图片、PDF、PPT'})])); return; }
    for(const r of arr){
      const card=el('div',{class:'item'});
      const body=el('div',{class:'it-body'});
      body.appendChild(el('div',{class:'it-title'},[el('span',{class:'tag',style:'margin-right:6px',text:TYPE_LABEL[r.type]||'文字'}), document.createTextNode(r.title||'未命名')]));
      if(r.type==='text'){ if(r.body) body.appendChild(el('div',{class:'it-meta',style:'white-space:pre-wrap',text:r.body.slice(0,90)})); }
      else if(r.type==='link'||r.type==='web'){ if(r.url) body.appendChild(el('div',{class:'it-meta',style:'word-break:break-all',text:r.url})); }
      else { if(r.note) body.appendChild(el('div',{class:'it-meta',text:r.note})); const u=await fileURL(r.id); if(u&&r.type==='image') body.appendChild(el('img',{src:u,style:'max-width:120px;border-radius:10px;margin-top:6px'})); if(u&&(r.type==='pdf'||r.type==='ppt')) body.appendChild(el('div',{class:'it-meta',text:'📎 已附文件，点右侧「打开」'})); }
      if((r.tags||[]).length) body.appendChild(el('div',{class:'it-meta',style:'font-size:12px',text:'# '+r.tags.join(' # ')}));
      const acts=el('div',{class:'it-actions'});
      if((r.type==='link'||r.type==='web')&&r.url) acts.appendChild(el('button',{class:'mini-btn',title:'打开',onclick:()=>window.open(r.url,'_blank','noopener')},'↗'));
      if((r.type==='pdf'||r.type==='ppt'||r.type==='image')){ acts.appendChild(el('button',{class:'mini-btn',title:'打开/下载',onclick:async()=>{ const fs=await filesByRec(r.id); if(!fs.length){toast('无文件','err');return;} const f=await getFile(fs[0].id); if(f&&f.blob) download(f.blob,(r.title||'file')+(EXT[r.type]||'')); }},'⬇')); }
      acts.append(
        el('button',{class:'mini-btn',onclick:()=>openEdit(r)},'✏'),
        el('button',{class:'mini-btn',onclick:async()=>{ if(confirm('删除「'+(r.title||'')+'」？')){ await softDelete(r.id); render(); } }},'🗑')
      );
      card.append(el('div',{class:'it-ico',html:ICO[r.type]||'📝'}), body, acts);
      list.appendChild(card);
    }
  }

  async function openEdit(r){
    const isNew=!r;
    const rec=r||{id:uid(),module:MODULE,sub:'beauty',created:now(),updated:now(),title:'',type:'text',url:'',body:'',note:'',tags:[]};
    const titleI=el('input',{class:'input',value:rec.title||'',placeholder:'标题'});
    const typeSel=el('select',{class:'input'}); TYPES.forEach(t=>typeSel.appendChild(el('option',{value:t.k,text:t.label,selected:rec.type===t.k})));
    const urlField=el('div',{class:'field'},[el('label',{text:'网址'}), el('input',{class:'input',value:rec.url||'',placeholder:'https://…'})]);
    const bodyField=el('div',{class:'field'},[el('label',{text:'文字内容'}), el('textarea',{class:'input',rows:3,value:rec.body||'',placeholder:'文字内容…'})]);
    const picker=imagePicker('选择文件（图片 / PDF / PPT）',{multiple:false});
    const fileField=el('div',{class:'field'},[picker]);
    const noteI=el('input',{class:'input',value:rec.note||'',placeholder:'备注（可选）'});
    const tagsI=el('input',{class:'input',value:(rec.tags||[]).join(', '),placeholder:'标签，逗号分隔（可选）'});
    const sync=()=>{ const t=typeSel.value; urlField.style.display=(t==='link'||t==='web')?'':'none'; bodyField.style.display=(t==='text')?'':'none'; fileField.style.display=(t==='image'||t==='pdf'||t==='ppt')?'':'none'; };
    typeSel.onchange=sync; sync();
    const save=async()=>{ const t=typeSel.value;
      rec.title=titleI.value.trim()||'未命名'; rec.type=t; rec.url=urlField.querySelector('input').value.trim(); rec.body=bodyField.querySelector('textarea').value.trim(); rec.note=noteI.value.trim(); rec.tags=tagsI.value.split(',').map(s=>s.trim()).filter(Boolean); rec.updated=now();
      await putRecord(rec);
      const f=(typeof picker.getFiles==='function') ? (picker.getFiles()||[]) : [];
      if(f&&f.length){ await attachFile(rec.id,f[0]); }
      await recordChange(rec);
      modal.close(); render(); toast('已保存','ok');
    };
    modal.open(isNew?'添加内容':'编辑内容', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'标题'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'类型'}),typeSel]),
      urlField, bodyField, fileField,
      el('div',{class:'field'},[el('label',{text:'备注'}),noteI]),
      el('div',{class:'field'},[el('label',{text:'标签'}),tagsI]),
      el('div',{class:'row',style:'gap:8px'},[el('button',{class:'btn btn-primary',onclick:save},'保存'),el('button',{class:'btn btn-ghost',onclick:()=>modal.close()},'取消')])
    ]));
    sync();
  }
  render();
}


// 播客
function podcastView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎧','精品播客','左：搜索 · 右：结果 + 我的收藏'));
  const cols=el('div',{class:'wt-cols'});
  const leftCol=el('div',{class:'wt-left'});
  const rightCol=el('div',{class:'wt-right'});
  cols.append(leftCol,rightCol);
  const q=el('input',{class:'input',placeholder:'搜索播客…'}); const btn=el('button',{class:'btn btn-primary'},'🔍');
  const results=el('div',{class:'list'});
  const doSearch=async()=>{ results.innerHTML=''; const r=await searchAudio(q.value); r.list.forEach(p=>results.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'🎧'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:p.title}),el('div',{class:'it-meta',text:(p.author||'')+' · '+(p.duration||'')})]),el('div',{class:'it-actions'},[el('button',{class:'mini-btn',title:'收藏',onclick:async()=>{await putRecord({id:uid(),module:MODULE,sub:'podcast',created:now(),updated:now(),title:p.title,author:p.author,duration:p.duration,progress:0});await recordChange({module:MODULE,sub:'podcast'});toast('已收藏','ok');}},'⭐')])]))); };
  btn.onclick=doSearch; q.onkeydown=e=>{if(e.key==='Enter')doSearch();};
  leftCol.append(el('div',{class:'card',style:'margin-bottom:0'},[el('div',{class:'field'},[el('label',{text:'搜索播客'}), q]), el('div',{class:'row',style:'gap:8px'},[btn])]));
  rightCol.append(secTitle('🔎','搜索结果',''), results);
  (async()=>{ await doSearch(); })();
  // 收藏
  rightCol.appendChild(secTitle('⭐','我的收藏',''));
  const fav=el('div',{class:'list'}); rightCol.appendChild(fav);
  (async()=>{ const items=await recordsBySub(MODULE,'podcast'); items.forEach(r=>fav.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'🎧'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title}),el('div',{class:'it-meta',text:'进度 '+(r.progress||0)+'%'})]),el('div',{class:'it-actions'},[el('button',{class:'mini-btn',onclick:async()=>{r.progress=Math.min(100,(r.progress||0)+10);await putRecord(r);await recordChange(r);podcastView(root,back);}},'▶'),el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);podcastView(root,back);}},'🗑')])]))); })();
  root.appendChild(cols);
}

// 小说
function novelView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📚','小说阅读书架','左：检索 · 右：我的书架'));
  const cols=el('div',{class:'wt-cols'});
  const leftCol=el('div',{class:'wt-left'});
  const rightCol=el('div',{class:'wt-right'});
  cols.append(leftCol,rightCol);

  const q=el('input',{class:'input',placeholder:'检索小说名/作者…'}); const btn=el('button',{class:'btn btn-primary'},'🔍');
  const results=el('div',{class:'list'});
  const doSearch=async()=>{ results.innerHTML=''; const ep=await kvGet('novel_endpoint'); let list=[];
    if(ep){ try{ const d=await import('../core/network.js').then(n=>n.fetchJSON(ep+'?q='+encodeURIComponent(q.value))); list=d.list||d; }catch{} }
    if(!list.length){ // 演示
      list=[{title:q.value||'示例小说：长安的荔枝',author:'马伯庸',desc:'小人物的大唐之旅'},{title:'三体',author:'刘慈欣',desc:'科幻经典'},{title:'活着',author:'余华',desc:'平凡人的苦难与坚韧'}].filter(b=>!q.value||b.title.includes(q.value)||b.author.includes(q.value));
    }
    list.forEach(b=>results.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'📖'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:b.title}),el('div',{class:'it-meta',text:(b.author||'')+' · '+(b.desc||'')})]),el('div',{class:'it-actions'},[el('button',{class:'mini-btn',title:'加入书架',onclick:async()=>{await putRecord({id:uid(),module:MODULE,sub:'bookshelf',created:now(),updated:now(),title:b.title,author:b.author,desc:b.desc,progress:0,category:'未分类'});await recordChange({module:MODULE,sub:'bookshelf'});toast('已入书架','ok');renderShelf&&renderShelf();}},'➕')])])));
  };
  btn.onclick=doSearch; q.onkeydown=e=>{if(e.key==='Enter')doSearch();};
  leftCol.append(el('div',{class:'card',style:'margin-bottom:0'},[el('div',{class:'field'},[el('label',{text:'检索小说'}), q]), el('div',{class:'row',style:'gap:8px'},[btn])]), secTitle('🔎','检索结果',''), results);
  (async()=>{ await doSearch(); })();

  // 我的书架（右列：搜索 + 分类 + 自定义添加）
  rightCol.appendChild(secTitle('📚','我的书架','检索 / 自定义添加，可搜索分类'));
  let bookSearch='', bookCat='全部';
  const bookSearchI=el('input',{class:'input',style:'flex:1;min-width:160px',placeholder:'搜索书名/作者…'});
  bookSearchI.oninput=()=>{ bookSearch=bookSearchI.value.trim().toLowerCase(); renderShelf(); };
  const bookAddBtn=el('button',{class:'btn btn-primary btn-sm',onclick:openBookAdd},'➕ 添加书籍');
  rightCol.appendChild(el('div',{class:'row wrap',style:'gap:8px;margin-bottom:10px'},[bookSearchI, bookAddBtn]));
  const bookCatBar=el('div',{class:'row wrap',style:'gap:6px;margin-bottom:12px'});
  rightCol.appendChild(bookCatBar);
  const shelf=el('div',{class:'list'});
  rightCol.appendChild(shelf);

  function openBookAdd(){
    const titleI=el('input',{class:'input',placeholder:'书名'});
    const authorI=el('input',{class:'input',placeholder:'作者'});
    const catSel=el('select',{class:'input'});
    ['小说','文学','科幻','历史','言情','悬疑','励志','其它'].forEach(c=>catSel.appendChild(el('option',{value:c,text:c})));
    const descA=el('textarea',{class:'input',style:'min-height:70px',placeholder:'简介…'});
    modal.open('添加书籍', el('div',{},[
      el('div',{class:'field'},[el('label',{text:'书名'}),titleI]),
      el('div',{class:'field'},[el('label',{text:'作者'}),authorI]),
      el('div',{class:'field'},[el('label',{text:'分类'}),catSel]),
      el('div',{class:'field'},[el('label',{text:'简介'}),descA]),
      el('button',{class:'btn btn-primary',onclick:async()=>{
        const title=titleI.value.trim(); if(!title){toast('先写书名','err');return;}
        await putRecord({id:uid(),module:MODULE,sub:'bookshelf',created:now(),updated:now(),
          title, author:authorI.value.trim(), category:catSel.value, desc:descA.value.trim(), progress:0});
        await recordChange({module:MODULE,sub:'bookshelf'});
        toast('已入书架','ok'); modal.close(); renderShelf();
      }},'保存')
    ]));
  }

  async function renderShelf(){
    const items=await recordsBySub(MODULE,'bookshelf');
    const cats=['全部', ...Array.from(new Set(items.map(r=>r.category||'未分类')))];
    bookCatBar.innerHTML='';
    cats.forEach(c=>bookCatBar.appendChild(el('button',{class:'chip'+(c===bookCat?' chip-on':''),onclick:()=>{bookCat=c;renderShelf();}},c)));
    const ql=bookSearch;
    const filtered=items.filter(r=>{
      const cat=(r.category||'未分类');
      const okCat = bookCat==='全部'||cat===bookCat;
      const okQ = !ql || (r.title||'').toLowerCase().includes(ql) || (r.author||'').toLowerCase().includes(ql);
      return okCat && okQ;
    });
    shelf.innerHTML='';
    if(!filtered.length){ shelf.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'📖'}),el('div',{text: items.length? '没有匹配的书籍':'检索后点「加入书架」，或点「添加书籍」'})])); return; }
    filtered.forEach(r=>{ const acts=el('div',{class:'it-actions'},[
      el('button',{class:'mini-btn',title:'+10%',onclick:async()=>{r.progress=Math.min(100,(r.progress||0)+10);await putRecord(r);await recordChange(r);renderShelf();}},'▶'),
      el('button',{class:'mini-btn',title:'下载TXT',onclick:()=>download(new Blob([`${r.title}\n作者:${r.author||''}\n\n（示例正文）`],{type:'text/plain'}),r.title+'.txt')},'⬇'),
      el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);renderShelf();}},'🗑')
    ]);
      (async()=>{ const ai=await aiItemActions({title:r.title||'',body:r.desc||r.body||'',onApply:async(out,mode)=>{ const upd={...r,desc:mode==='generate'?out:(mode==='continue'?((r.desc||'')+'\n'+out):out),updated:now()};await putRecord(upd);await recordChange(upd);renderShelf(); }}); ai.childNodes.forEach(n=>acts.appendChild(n)); })();
      shelf.appendChild(el('div',{class:'item'},[el('div',{class:'it-ico',html:'📖'}),el('div',{class:'it-body'},[el('div',{class:'it-title',text:r.title+' · '+(r.author||'')}),el('div',{class:'it-meta',text:'已读 '+(r.progress||0)+'%'+(r.category?' · '+(r.category):'')})]),acts]));
    });
  }
  renderShelf();
  root.appendChild(cols);
}

// 摄影
function photoView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('📷','摄影构图光影学习库',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'photo',icon:'📷',title:'笔记',empty:'三分法/对称/光影记录',
    fields:[{key:'title',label:'主题',type:'text'},{key:'body',label:'要点',type:'textarea'},{key:'tags',label:'标签',type:'tags'}]});
}

// 设计
function designView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back)); root.appendChild(secTitle('🎨','平面设计排版配色灵感',''));
  const c=el('div',{}); root.appendChild(c);
  Collection(c,{module:MODULE,sub:'design',icon:'🎨',title:'灵感',empty:'配色方案/排版参考',
    fields:[{key:'title',label:'名称',type:'text'},{key:'body',label:'配色/说明',type:'textarea'},{key:'tags',label:'标签',type:'tags'}]});
}

// 情绪随笔（加密）
function journalView(root,back){ root.innerHTML=''; root.appendChild(backBtn(back));
  if(!hasKey() && !isRemembered()){ const box=el('div',{class:'card'},[el('h4',{text:'🔐 私密加密开启'}),el('p',{class:'muted',text:'本模块内容使用 AES 加密，请输入口令（仅本机，不存储明文）。'}),el('input',{class:'input',type:'password',placeholder:'设置加密口令'}),el('label',{class:'row',style:'gap:6px;margin:10px 0'},[el('input',{type:'checkbox'}),el('span',{text:'记住口令（仅本设备）'})]),el('button',{class:'btn btn-primary',onclick:async(e)=>{ const p=e.target.previousElementSibling.previousElementSibling.value; if(!p){toast('输入口令','err');return;} await deriveKey(p); if(e.target.previousElementSibling.querySelector('input').checked){const{rememberKey}=await import('../core/crypto.js');rememberKey(p);} toast('已开启加密','ok'); journalView(root,back); }},'开启')]);
    root.appendChild(box); return; }
  root.appendChild(secTitle('🌱','情绪随笔 · 反内耗疏导','私密加密'));
  const ta=el('textarea',{class:'input',style:'min-height:120px',placeholder:'把情绪写下来，这里只有你能看…'});
  const form=el('div',{class:'card',style:'margin-bottom:14px'},[ta,el('div',{class:'row',style:'margin-top:10px'},[el('button',{class:'btn btn-primary',onclick:async()=>{ if(!ta.value.trim())return; const enc=await encryptText(ta.value); await putRecord({id:uid(),module:MODULE,sub:'journal',created:now(),updated:now(),title:'随笔',enc:true,cipher:enc}); await recordChange({module:MODULE,sub:'journal'}); toast('已加密保存','ok'); ta.value=''; journalView(root,back); }},'🔒 加密保存')])]);
  root.append(form, secTitle('📝','历史',''));
  const list=el('div',{class:'list'}); root.appendChild(list);
  (async()=>{ const items=await recordsBySub(MODULE,'journal'); items.sort((a,b)=>b.created-a.created);
    for(const r of items){ let text=''; try{ text=await decryptPayload(r.cipher); }catch{ text='（解密失败：需重新输入口令）'; }
      const delBtn = el('button',{class:'mini-btn',onclick:async()=>{await softDelete(r.id);journalView(root,back);}},'🗑');
      const acts = itActions(delBtn);
      const ai=await aiItemActions({title:'随笔',body:text,onApply:async(out,mode)=>{ const enc=await encryptText(mode==='generate'?out:(mode==='continue'?(text+'\n'+out):out)); const upd={...r,enc:true,cipher:enc,updated:now()};await putRecord(upd);await recordChange({module:MODULE,sub:'journal'});journalView(root,back); }});
      ai.childNodes.forEach(n=>acts.appendChild(n));
      const body = itBody(relTime(r.created), text.slice(0,60));
      list.appendChild(itemRow('🌱', body, acts));
    }
  })();
}

// ===== 普通话练习（绕口令 / 散文 / 自定义）=====
const MAND_TWISTERS=[
  '四是四，十是十，十四是十四，四十是四十。',
  '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮。',
  '扁担长，板凳宽，扁担绑在板凳上，板凳不让扁担绑在板凳上，扁担偏要绑在板凳上。',
  '红鲤鱼与绿鲤鱼与驴，红鲤鱼与绿鲤鱼与驴，绿鲤鱼与驴与红鲤鱼。',
  '牛郎恋刘娘，刘娘念牛郎。',
  '八百标兵奔北坡，炮兵并排北边跑，炮兵怕把标兵碰，标兵怕碰炮兵炮。',
  '化肥会挥发。黑化肥发灰，灰化肥发黑；黑化肥发灰会挥发，灰化肥挥发会发黑。',
  '粉红墙上画凤凰，凤凰画在粉红墙；红凤凰、粉凤凰、粉红凤凰、花凤凰。',
  '白石塔，白石搭，白石搭白塔，白塔白石搭，搭好白石塔，白塔白又大。',
  '七加一，七减一，加完减完等于几？七加一、七减一，再加减小余七。',
  '哥挎瓜筐过宽沟，过沟筐漏瓜滚沟；隔沟够瓜瓜筐扣，瓜滚筐空哥怪沟。',
  '山前有个严圆眼，山后有个杨眼圆，二人山前山后来比眼；不知是严圆眼比杨眼圆，还是杨眼圆比严圆眼的眼圆。',
];
const MAND_ESSAYS=[
  {t:'朱自清《春》（全文）',x:`盼望着，盼望着，东风来了，春天的脚步近了。

一切都像刚睡醒的样子，欣欣然张开了眼。山朗润起来了，水涨起来了，太阳的脸红起来了。

小草偷偷地从土里钻出来，嫩嫩的，绿绿的。园子里，田野里，瞧去，一大片一大片满是的。坐着，躺着，打两个滚，踢几脚球，赛几趟跑，捉几回迷藏。风轻悄悄的，草软绵绵的。

桃树、杏树、梨树，你不让我，我不让你，都开满了花赶趟儿。红的像火，粉的像霞，白的像雪。花里带着甜味儿；闭了眼，树上仿佛已经满是桃儿、杏儿、梨儿。花下成千成百的蜜蜂嗡嗡地闹着，大小的蝴蝶飞来飞去。野花遍地是：杂样儿，有名字的，没名字的，散在草丛里，像眼睛，像星星，还眨呀眨的。

"吹面不寒杨柳风"，不错的，像母亲的手抚摸着你。风里带来些新翻的泥土的气息，混着青草味儿，还有各种花的香，都在微微润湿的空气里酝酿。鸟儿将巢安在繁花嫩叶当中，高兴起来了，呼朋引伴地卖弄清脆的喉咙，唱出宛转的曲子，跟轻风流水应和着。牛背上牧童的短笛，这时候也成天在嘹亮地响。

雨是最寻常的，一下就是三两天。可别恼。看，像牛毛，像花针，像细丝，密密地斜织着，人家屋顶上全笼着一层薄烟。树叶儿却绿得发亮，小草儿也青得逼你的眼。傍晚时候，上灯了，一点点黄晕的光，烘托出一片安静而和平的夜。在乡下，小路上，石桥边，有撑起伞慢慢走着的人，地里还有工作的农夫，披着蓑戴着笠。他们的草屋，稀稀疏疏的在雨里静默着。

天上风筝渐渐多了，地上孩子也多了。城里乡下，家家户户，老老小小，也赶趟儿似的，一个个都出来了。舒活舒活筋骨，抖擞抖擞精神，各做各的一份事去。"一年之计在于春"，刚起头儿，有的是工夫，有的是希望。

春天像刚落地的娃娃，从头到脚都是新的，它生长着。

春天像小姑娘，花枝招展的，笑着，走着。

春天像健壮的青年，有铁一般的胳膊和腰脚，领着我们上前去。`},
  {t:'老舍《济南的冬天》（全文）',x:`对于一个在北平住惯的人，像我，冬天要是不刮风，便觉得是奇迹；济南的冬天是没有风声的。对于一个刚由伦敦回来的人，像我，冬天要能看得见日光，便觉得是怪事；济南的冬天是响晴的。自然，在热带的地方，日光是永远那么毒，响亮的天气，反有点叫人害怕。可是，在北中国的冬天，而能有温晴的天气，济南真得算个宝地。

设若单单是有阳光，那也算不了出奇。请闭上眼睛想：一个老城，有山有水，全在天底下晒着阳光，暖和安适地睡着，只等春风来把它们唤醒，这是不是个理想的境界？

小山整把济南围了个圈儿，只有北边缺着点口儿。这一圈小山在冬天特别可爱，好像是把济南放在一个小摇篮里，它们安静不动地低声地说："你们放心吧，这儿准保暖和。"真的，济南的人们在冬天是面上含笑的。他们一看那些小山，心中便觉得有了着落，有了依靠。他们由天上看到山上，便不知不觉地想起："明天也许就是春天了吧？这样的温暖，今天夜里山草也许就绿起来了吧？"就是这点幻想不能一时实现，他们也并不着急，因为有这样慈善的冬天，干啥还希望别的呢！

最妙的是下点小雪呀。看吧，山上的矮松越发的青黑，树尖上顶着一髻儿白花，好像日本看护妇。山尖全白了，给蓝天镶上一道银边。山坡上，有的地方雪厚点，有的地方草色还露着，这样，一道儿白，一道儿暗黄，给山们穿上一件带水纹的花衣；看着看着，这件花衣好像被风儿吹动，叫你希望看见一点更美的山的肌肤。等到快日落的时候，微黄的阳光斜射在山腰上，那点薄雪好像忽然害了羞，微微露出点粉色。就是下小雪吧，济南是受不住大雪的，那些小山太秀气！

古老的济南，城里那么狭窄，城外又那么宽敞，山坡上卧着些小村庄，小村庄的房顶上卧着点雪，对，这是张小水墨画，也许是唐代的名手画的吧。

那水呢，不但不结冰，倒反在绿萍上冒着点热气，水藻真绿，把终年贮蓄的绿色全拿出来了。天儿越晴，水藻越绿，就凭这些绿的精神，水也不忍得冻上，况且那些长枝的垂柳还要在水里照个影儿呢！看吧，由澄清的河水慢慢往上看吧，空中，半空中，天上，自上而下全是那么清亮，那么蓝汪汪的，整个的是块空灵的蓝水晶。这块水晶里，包着红屋顶，黄草山，像地毯上的小团花的小灰色树影；这就是冬天的济南。`},
  {t:'海子《面朝大海，春暖花开》（全文）',x:`从明天起，做一个幸福的人
喂马、劈柴，周游世界
从明天起，关心粮食和蔬菜
我有一所房子，面朝大海，春暖花开

从明天起，和每一个亲人通信
告诉他们我的幸福
那幸福的闪电告诉我的
我将告诉每一个人

给每一条河每一座山取一个温暖的名字
陌生人，我也为你祝福
愿你有一个灿烂的前程
愿你有情人终成眷属
愿你在尘世获得幸福
我只愿面朝大海，春暖花开`},
  {t:'朱自清《匆匆》（全文）',x:`燕子去了，有再来的时候；杨柳枯了，有再青的时候；桃花谢了，有再开的时候。但是，聪明的，你告诉我，我们的日子为什么一去不复返呢？——是有人偷了他们罢：那是谁？又藏在何处呢？是他们自己逃走了罢：现在又到了哪里呢？

我不知道他们给了我多少日子；但我的手确乎是渐渐空虚了。在默默里算着，八千多日子已经从我手中溜去；像针尖上一滴水滴在大海里，我的日子滴在时间的流里，没有声音，也没有影子。我不禁头涔涔而泪潸潸了。

去的尽管去了，来的尽管来着；去来的中间，又怎样地匆匆呢？早上我起来的时候，小屋里射进两三方斜斜的太阳。太阳他有脚啊，轻轻悄悄地挪移了；我也茫茫然跟着旋转。于是——洗手的时候，日子从水盆里过去；吃饭的时候，日子从饭碗里过去；默默时，便从凝然的双眼前过去。我觉察他去的匆匆了，伸出手遮挽时，他又从遮挽着的手边过去，天黑时，我躺在床上，他便伶伶俐俐地从我身上跨过，从我脚边飞去了。等我睁开眼和太阳再见，这算又溜走了一日。我掩着面叹息。但是新来的日子的影儿又开始在叹息里闪过了。

在逃去如飞的日子里，在千门万户的世界里的我能做些什么呢？只有徘徊罢了，只有匆匆罢了；在八千多日的匆匆里，除徘徊外，又剩些什么呢？过去的日子如轻烟，被微风吹散了，如薄雾，被初阳蒸融了；我留着些什么痕迹呢？我何曾留着像游丝样的痕迹呢？我赤裸裸来到这世界，转眼间也将赤裸裸的回去罢？但不能平的，为什么偏要白白走这一遭啊？

你聪明的，告诉我，我们的日子为什么一去不复返呢？`},
  {t:'郁达夫《故都的秋》（节选）',x:`秋天，无论在什么地方的秋天，总是好的；可是啊，北国的秋，却特别地来得清，来得静，来得悲凉。我的不远千里，要从杭州赶上青岛，更要从青岛赶上北平来的理由，也不过想饱尝一尝这"秋"，这故都的秋味。

江南，秋当然也是有的；但草木凋得慢，空气来得润，天的颜色显得淡，并且又时常多雨而少风；一个人夹在苏州上海杭州，或厦门香港广州的市民中间，浑浑沌沌地过去，只能感到一点点清凉，秋的味，秋的色，秋的意境与姿态，总看不饱，尝不透，赏玩不到十足。秋并不是名花，也并不是美酒，那一种半开、半醉的状态，在领略秋的过程上，是不合适的。

不逢北国之秋，已将近十余年了。在南方每年到了夏天，总要想起陶然亭的芦花，钓鱼台的柳影，西山的虫唱，玉泉的夜月，潭柘寺的钟声。在北平即使不出门去罢，就是在皇城人海之中，租人家一椽破屋来住着，早晨起来，泡一碗浓茶，向院子一坐，你也能看得到很高很高的碧绿的天色，听得到青天下驯鸽的飞声。`},
  {t:'鲁迅《从百草园到三味书屋》（节选）',x:`不必说碧绿的菜畦，光滑的石井栏，高大的皂荚树，紫红的桑椹；也不必说鸣蝉在树叶里长吟，肥胖的黄蜂伏在菜花上，轻捷的叫天子（云雀）忽然从草间直窜向云霄里去了。单是周围的短短的泥墙根一带，就有无限趣味。油蛉在这里低唱，蟋蟀们在这里弹琴。翻开断砖来，有时会遇见蜈蚣；还有斑蝥，倘若用手指按住它的脊梁，便会拍的一声，从后窍喷出一阵烟雾。何首乌藤和木莲藤缠络着，木莲有莲房一般的果实，何首乌有拥肿的根。有人说，何首乌根是有像人形的，吃了便可以成仙，我于是常常拔它起来，牵连不断地拔起来，也曾因此弄坏了泥墙，却从来没有见过有一块根像人样。如果不怕刺，还可以摘到覆盆子，像小珊瑚珠攒成的小球，又酸又甜，色味都比桑椹要好得远。`},
  {t:'汪曾祺《端午的鸭蛋》（节选）',x:`我的家乡是水乡。出鸭。高邮大麻鸭是著名的鸭种。鸭多，鸭蛋也多。高邮人也善于腌鸭蛋。高邮咸鸭蛋于是出了名。

我在苏南、浙江，每逢有人问起我的籍贯，回答之后，对方就会肃然起敬："哦！你们那里出咸鸭蛋！"上海的卖腌腊的店铺里也卖咸鸭蛋，必用纸条特别标明："高邮咸蛋"。高邮还出双黄鸭蛋。别处鸭蛋也偶有双黄的，但不如高邮的多，可以成批输出。双黄鸭蛋味道其实无特别处。还不就是个鸭蛋！只是切开之后，里面圆圆的两个黄，使人惊奇不已。我对异乡人称道高邮鸭蛋，是不大高兴的，好像我们那穷地方就出鸭蛋似的！不过高邮的咸鸭蛋，确实是好，我走的地方不少，所食鸭蛋多矣，但和我家乡的完全不能相比！`},
  {t:'晨光（现代散文）',x:`清晨，阳光穿过窗帘的缝隙，落在木地板上，像一汪温柔的水。我泡了一杯茶，看热气缓缓上升，忽然觉得，慢下来，也是一种能力。

不必急着追赶什么。让光线慢慢铺满房间，让心也慢慢舒展开来。今天不必完美，只要真实地、好好地，过完这一程就够了。`},
];
const MAND_NEWS=[
  {t:'今日要闻（示范）',x:'本报讯 据气象部门预报，受冷空气影响，未来三天我国大部分地区将出现明显降温，局部地区伴有小雨。提醒公众及时添衣保暖，注意出行安全。'},
  {t:'科技前沿（示范）',x:'近日，科研团队在量子计算领域取得重要进展，成功实现了更高精度的量子比特操控。专家表示，这将为下一代信息技术的突破奠定基础。'},
  {t:'民生关注（示范）',x:'为解决"最后一公里"配送难题，多个城市试点社区智能快递柜与无人配送车协同模式，居民取件更加便捷，物流效率显著提升。'},
  {t:'文化速递（示范）',x:'本届读书节以"阅读点亮生活"为主题，线上线下同步开展名家讲座、图书市集与亲子共读活动，倡导全民阅读，营造书香社会。'},
];
function speak(text){
  try{
    if(!('speechSynthesis' in window)){ toast('当前浏览器不支持语音朗读','err'); return; }
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text);
    u.lang='zh-CN'; u.rate=0.92; u.pitch=1;
    try{ const voices=window.speechSynthesis.getVoices(); const zh=voices.find(v=>/zh|Chinese|普通话|Yue|Han/i.test(v.lang||v.name||'')); if(zh)u.voice=zh; }catch{}
    window.speechSynthesis.speak(u);
  }catch(e){ toast('朗读失败','err'); }
}
function mkCollapsible(text){
  const MAX=140;
  const wrap=el('div',{});
  const p=el('div',{text:text||'',style:'margin:8px 0;line-height:1.7;white-space:pre-wrap;font-size:15px'});
  wrap.appendChild(p);
  if(text && text.length>MAX){
    p.style.maxHeight='5.4em'; p.style.overflow='hidden';
    const btn=el('button',{class:'btn btn-soft btn-sm',style:'margin-top:2px',text:'展开全文 ▼'});
    btn.onclick=()=>{ const collapsed=p.style.maxHeight!=='none'; p.style.maxHeight=collapsed?'none':'5.4em'; btn.textContent=collapsed?'收起 ▲':'展开全文 ▼'; };
    wrap.appendChild(btn);
  }
  return wrap;
}


function pieceCard(text,title,kind){
  return el('div',{class:'card',style:'margin-bottom:12px'},[
    title?el('div',{class:'row between'},[el('b',{text:title}),el('span',{class:'muted',style:'font-size:12px',text:kind||''})]):null,
    mkCollapsible(text),
    el('div',{class:'row wrap',style:'gap:8px'},[
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>speak(text)},'🔊 朗读'),
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(text)},'📋 复制'),
      el('button',{class:'btn btn-soft btn-sm',onclick:()=>recordFollow(text, null)},'🎙 跟读'),
    ])
  ].filter(Boolean));
}
async function mandarinView(root,back){
  root.innerHTML=''; root.appendChild(backBtn(back));
  root.appendChild(secTitle('🗣️','普通话练习','绕口令 · 散文 · 自由跟读'));
  const tabs=el('div',{style:'display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap'});
  const bodyBox=el('div',{}); root.appendChild(tabs); root.appendChild(bodyBox);
  let custom=(await kvGet('mandarin_custom'))||[];
  let news=(await kvGet('mandarin_news'))||[];
  const TABS=[
    {k:'twist',label:'📜 绕口令'},
    {k:'essay',label:'📖 散文'},
    {k:'news',label:'📰 新闻跟读'},
    {k:'mine',label:'➕ 我的内容'},
  ];
  const renderTabs=(active)=>{ tabs.innerHTML='';
    TABS.forEach(t=>{ tabs.appendChild(el('button',{class:'btn '+(t.k===active?'btn-primary':'btn-soft')+' btn-sm',onclick:()=>{renderTabs(t.k);renderBody(t.k);}},t.label)); });
  };
  const renderBody=async(kind)=>{ bodyBox.innerHTML='';
    if(kind==='twist'){
      MAND_TWISTERS.forEach((s,i)=>bodyBox.appendChild(pieceCard(s,'第'+(i+1)+'条','绕口令')));
    } else if(kind==='essay'){
      MAND_ESSAYS.forEach(e=>bodyBox.appendChild(pieceCard(e.x,e.t,'散文')));
    } else if(kind==='news'){
      MAND_NEWS.forEach(n=>bodyBox.appendChild(pieceCard(n.x,n.t,'新闻')));
      bodyBox.appendChild(secTitle('📂','我的新闻','自己粘贴的新闻，仅存本机'));
      const titleI=el('input',{class:'input',placeholder:'标题（如：今天的一条新闻）'});
      const textA=el('textarea',{class:'input',style:'min-height:90px',placeholder:'粘贴或写下一条新闻/播报稿，用来跟读…'});
      const addBtn=el('button',{class:'btn btn-primary',onclick:async()=>{
        const content=textA.value.trim(); if(!content){toast('先写点内容','err');return;}
        news.push({id:uid(),title:titleI.value.trim()||'我的新闻',content,created:now()});
        await kvSet('mandarin_news',news); toast('已添加','ok'); renderBody('news');
      }},'➕ 添加新闻');
      bodyBox.appendChild(el('div',{class:'card',style:'margin-bottom:16px'},[
        el('div',{class:'field'},[el('label',{text:'标题'}),titleI]),
        el('div',{class:'field'},[el('label',{text:'新闻内容'}),textA]),
        addBtn
      ]));
      if(!news.length){ bodyBox.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'📰'}),el('div',{text:'还没有，上面添加一条吧'})])); }
      news.forEach(it=>{ bodyBox.appendChild(el('div',{class:'card',style:'margin-bottom:12px'},[
        el('div',{class:'row between'},[el('b',{text:it.title}),el('span',{class:'muted',style:'font-size:12px',text:'新闻'})]),
        mkCollapsible(it.content),
        el('div',{class:'row wrap',style:'gap:8px'},[
          el('button',{class:'btn btn-soft btn-sm',onclick:()=>speak(it.content)},'🔊 朗读'),
          el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(it.content)},'📋 复制'),
          el('button',{class:'btn btn-soft btn-sm',onclick:()=>recordFollow(it.content,null)},'🎙 跟读'),
          el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{ news=news.filter(c=>c.id!==it.id); await kvSet('mandarin_news',news); renderBody('news'); }},'🗑 删除'),
        ])
      ])); });
    } else {
      const titleI=el('input',{class:'input',placeholder:'标题（如：我喜欢的绕口令）'});
      const typeSel=el('select',{class:'input'}); ['绕口令','散文','其它'].forEach(o=>typeSel.appendChild(el('option',{value:o,text:o})));
      const textA=el('textarea',{class:'input',style:'min-height:90px',placeholder:'在这里粘贴或写下你要练习的内容…'});
      const addBtn=el('button',{class:'btn btn-primary',onclick:async()=>{
        const content=textA.value.trim(); if(!content){toast('先写点内容','err');return;}
        custom.push({id:uid(),title:titleI.value.trim()||'我的内容',kind:typeSel.value,content,created:now()});
        await kvSet('mandarin_custom',custom); toast('已添加','ok'); renderBody('mine');
      }},'➕ 添加到我的内容');
      bodyBox.appendChild(el('div',{class:'card',style:'margin-bottom:16px'},[
        el('div',{class:'field'},[el('label',{text:'类型'}),typeSel]),
        el('div',{class:'field'},[el('label',{text:'标题'}),titleI]),
        el('div',{class:'field'},[el('label',{text:'内容'}),textA]),
        addBtn
      ]));
      bodyBox.appendChild(secTitle('📂','我的内容','你自己添加的，仅存本机'));
      if(!custom.length){ bodyBox.appendChild(el('div',{class:'empty'},[el('div',{class:'e-ico',html:'➕'}),el('div',{text:'还没有内容，上面添加一条吧'})])); }
      custom.forEach(it=>{ bodyBox.appendChild(el('div',{class:'card',style:'margin-bottom:12px'},[
        el('div',{class:'row between'},[el('b',{text:it.title}),el('span',{class:'muted',style:'font-size:12px',text:it.kind||''})]),
        mkCollapsible(it.content),
        el('div',{class:'row wrap',style:'gap:8px'},[
          el('button',{class:'btn btn-soft btn-sm',onclick:()=>speak(it.content)},'🔊 朗读'),
          el('button',{class:'btn btn-soft btn-sm',onclick:()=>copyText(it.content)},'📋 复制'),
          el('button',{class:'btn btn-soft btn-sm',onclick:()=>recordFollow(it.content,null)},'🎙 跟读'),
          el('button',{class:'btn btn-soft btn-sm',onclick:async()=>{ custom=custom.filter(c=>c.id!==it.id); await kvSet('mandarin_custom',custom); renderBody('mine'); }},'🗑 删除'),
        ])
      ])); });
    }
  };
  renderTabs('twist'); renderBody('twist');
}

// ===== 认亲戚：中文亲属关系计算器 =====
const KIN_ATOM = {'父':'父','母':'母','子':'子','女':'女','兄':'兄','弟':'弟','姐':'姐','妹':'妹','夫':'夫','妻':'妻'};
const KIN_SPLIT = {
  '爸爸':'父','父亲':'父','爸':'父',
  '妈妈':'母','母亲':'母','妈':'母',
  '儿子':'子','女儿':'女',
  '哥哥':'兄','弟弟':'弟','姐姐':'姐','妹妹':'妹',
  '老公':'夫','丈夫':'夫','老婆':'妻','妻子':'妻',
  '爷爷':['父','父'],'奶':['父','母'],'奶奶':['父','母'],
  '外公':['母','父'],'姥爷':['母','父'],'外婆':['母','母'],'姥姥':['母','母'],
  '伯父':['父','兄'],'伯伯':['父','兄'],'叔叔':['父','弟'],'姑姑':['父','姐'],'舅舅':['母','兄'],'姨妈':['母','姐'],
};
function kinTraverse(atoms){
  let level=0, maternal=false, sex=null, ord=0;
  let lastSib=null;            // 最近一次「兄弟姐妹」关系：{level,maternal,sex,ord}
  let isEgoSib=false, egoSibSex=null; // 是否为「我」的亲兄弟姐妹（用于侄/甥）
  let descMaternal=false;      // 是否从「我」的女儿往下（决定孙子/外孙）
  let inLaw=false, spouseSex=null;
  for(const a of atoms){
    if(a==='父'){ level++; sex='m'; }
    else if(a==='母'){ level++; sex='f'; maternal=true; }
    else if(a==='子'){ if(level===0 && !isEgoSib) descMaternal=false; level--; sex='m'; }
    else if(a==='女'){ if(level===0 && !isEgoSib) descMaternal=true; level--; sex='f'; }
    else if(a==='兄'){ if(level===0){ isEgoSib=true; egoSibSex='m'; } lastSib={level,maternal,sex:'m',ord:1}; sex='m'; ord=1; }
    else if(a==='弟'){ if(level===0){ isEgoSib=true; egoSibSex='m'; } lastSib={level,maternal,sex:'m',ord:-1}; sex='m'; ord=-1; }
    else if(a==='姐'){ if(level===0){ isEgoSib=true; egoSibSex='f'; } lastSib={level,maternal,sex:'f',ord:1}; sex='f'; ord=1; }
    else if(a==='妹'){ if(level===0){ isEgoSib=true; egoSibSex='f'; } lastSib={level,maternal,sex:'f',ord:-1}; sex='f'; ord=-1; }
    else if(a==='夫'||a==='妻'){ inLaw=true; spouseSex=(a==='夫'?'m':'f'); }
  }
  return {level,maternal,sex,ord,lastSib,isEgoSib,egoSibSex,descMaternal,inLaw,spouseSex};
}
function kinTerm(s){
  const {level,maternal,sex,ord,lastSib,isEgoSib,egoSibSex,descMaternal,inLaw,spouseSex}=s;
  if(inLaw){
    if(level===1 && !lastSib){ return {term: spouseSex==='m'?(sex==='m'?'岳父':'婆婆'):(sex==='m'?'岳父':'岳母'), note:'老公的'+(sex==='m'?'父亲':'母亲')}; }
    if(level===1 && lastSib){ const u=lastSib.sex==='m'?(lastSib.ord>0?'伯父':'叔父'):'姑姑'; const mm=lastSib.maternal?(lastSib.sex==='m'?'舅舅':'姨妈'):u; return {term:(spouseSex==='m'?'丈夫的':'妻子的')+mm, note:'配偶的长辈'}; }
    if(level===0 && sex && !lastSib){ if(spouseSex==='m'){ return {term: sex==='m'?(ord>0?'大伯子':'小叔子'):(ord>0?'大姑子':'小姑子'), note:'老公的'+(sex==='m'?(ord>0?'哥哥':'弟弟'):(ord>0?'姐姐':'妹妹'))}; } else { return {term: sex==='m'?(ord>0?'大舅子':'小舅子'):(ord>0?'大姨子':'小姨子'), note:'老婆的'+(sex==='m'?(ord>0?'哥哥':'弟弟'):(ord>0?'姐姐':'妹妹'))}; } }
    if(level===0 && sex===null && !lastSib) return {term: spouseSex==='m'?'老公':'老婆', note:'你的配偶'};
    return {term:(spouseSex==='m'?'丈夫的':'妻子的')+'亲戚', note:'配偶方亲属'};
  }
  if(lastSib && lastSib.level>=2){
    if(!lastSib.maternal){ return {term: lastSib.sex==='m'?(lastSib.ord>0?'伯公':'叔公'):'姑婆', note:'祖辈的'+(lastSib.sex==='m'?(lastSib.ord>0?'哥哥':'弟弟'):'姐妹')}; }
    return {term: lastSib.sex==='m'?'舅公':'姨婆', note:'祖辈的'+(lastSib.sex==='m'?'兄弟':'姐妹')};
  }
  if(level===1 && lastSib && lastSib.level===1){
    if(!lastSib.maternal){ if(lastSib.sex==='m') return {term:lastSib.ord>0?'伯父':'叔父', note:'爸爸的'+(lastSib.ord>0?'哥哥':'弟弟')}; return {term:'姑姑', note:'爸爸的姐妹'}; }
    if(lastSib.sex==='m') return {term:'舅舅', note:'妈妈的兄弟'}; return {term:'姨妈', note:'妈妈的姐妹'};
  }
  if(level===2 && !lastSib){ return {term: maternal?(sex==='m'?'外公':'外婆'):(sex==='m'?'爷爷':'奶奶'), note:(maternal?'妈妈':'爸爸')+'的'+(sex==='m'?'父亲':'母亲')}; }
  if(level===3 && !lastSib){ return {term: maternal?(sex==='m'?'外曾祖父':'外曾祖母'):(sex==='m'?'曾祖父':'曾祖母'), note:'曾祖辈'}; }
  if(level===1 && !lastSib){ return {term: maternal?'妈妈':'爸爸', note: maternal?'母亲':'父亲'}; }
  if(level===0 && lastSib && lastSib.level===1 && sex){
    const paternalCousin = (!lastSib.maternal && lastSib.sex==='m');
    const prefix = paternalCousin?'堂':'表';
    if(sex==='m') return {term: prefix+(ord>0?'兄':'弟'), note:(paternalCousin?'伯/叔':'姑/舅/姨')+'的孩子'};
    return {term: prefix+(ord>0?'姐':'妹'), note:(paternalCousin?'伯/叔':'姑/舅/姨')+'的孩子'};
  }
  if(level===0 && sex && (!lastSib || lastSib.level===0)){
    if(sex==='m') return {term: ord>0?'哥哥':'弟弟', note:'同父母的'+(ord>0?'哥哥':'弟弟')};
    return {term: ord>0?'姐姐':'妹妹', note:'同父母的'+(ord>0?'姐姐':'妹妹')};
  }
  if(level===-1 && isEgoSib){
    if(egoSibSex==='m') return {term: sex==='m'?'侄子':'侄女', note:'兄弟的'+(sex==='m'?'儿子':'女儿')};
    return {term: sex==='m'?'外甥':'外甥女', note:'姐妹的'+(sex==='m'?'儿子':'女儿')};
  }
  if(level===-1 && !isEgoSib){ return {term: sex==='m'?'儿子':'女儿', note:'你的'+(sex==='m'?'儿子':'女儿')}; }
  if(level===-2){ return {term: sex==='m'?(descMaternal?'外孙':'孙子'):(descMaternal?'外孙女':'孙女'), note:(descMaternal?'女儿':'儿子')+'的'+(sex==='m'?'儿子':'女儿')}; }
  return null;
}
function kinQuery(txt){
  try{
    let t=txt.replace(/^(我|我的|我家|我们家)[的]?/,'');
    const seg=t.split('的').map(s=>s.trim()).filter(Boolean);
    let atoms=[];
    for(const s of seg){
      let mapped=KIN_SPLIT[s]|| (KIN_ATOM[s]?[KIN_ATOM[s]]:null);
      if(!mapped) return {term:'未识别', note:'无法解析「'+s+'」，换种说法试试', path:txt};
      atoms=atoms.concat(mapped);
    }
    const st=kinTraverse(atoms);
    const term=kinTerm(st);
    if(!term) return {term:'（暂未收录）', note:'这条关系较复杂，暂未收录，可拆成更短的关系链', path:txt};
    return {term:term.term, note:term.note, path:txt};
  }catch(e){ return {term:'出错了', note:String(e&&e.message||e), path:txt}; }
}
// ===== 认亲戚计算器 + 横向家族树（合并页）=====
const KT_NW=170, KT_NH=58, KT_LEVEL_W=250, KT_GAP_Y=18, KT_SP_GAP=14;

function ktSvgNode(tag,attrs){
  const e=document.createElementNS('http://www.w3.org/2000/svg',tag);
  Object.keys(attrs||{}).forEach(k=>e.setAttribute(k,attrs[k]));
  return e;
}

// 横向树自动布局：长辈在左，后代向右分叉
function ktLayout(list){
  const map=new Map(list.map(n=>[n.id,n]));
  // 归一化配偶关系：夫妻可能互相记录 spouseId，这里一对只保留一个方向
  // （id 字典序小的为"主节点"，大的为"附属配偶"，附属配偶不单独参与树的遍历）
  const spouseMap=new Map(); const spouseSub=new Set(); const spDone=new Set();
  list.forEach(n=>{
    if(!n.spouseId||!map.has(n.spouseId)) return;
    const a=n.id, b=n.spouseId;
    const key=a<b?(a+'|'+b):(b+'|'+a);
    if(spDone.has(key)) return;
    spDone.add(key);
    const main=(a<b?a:b), sub=(a<b?b:a);
    spouseMap.set(main,sub); spouseSub.add(sub);
  });
  const kids=new Map();
  list.forEach(n=>{
    if(spouseSub.has(n.id)) return;
    const p=n.parentId;
    if(p&&map.has(p)){ if(!kids.has(p)) kids.set(p,[]); kids.get(p).push(n.id); }
  });
  kids.forEach(a=>a.sort((x,y)=>(map.get(x).order||0)-(map.get(y).order||0)));
  const H=new Map(); const busy=new Set();
  function calcH(id){
    if(H.has(id)) return H.get(id);
    if(busy.has(id)) return KT_NH+KT_GAP_Y;
    busy.add(id);
    const ks=kids.get(id)||[];
    const h=ks.length?Math.max(KT_NH+KT_GAP_Y, ks.reduce((s,k)=>s+calcH(k),0)):KT_NH+KT_GAP_Y;
    busy.delete(id); H.set(id,h); return h;
  }
  const pos={}; let maxX=0, maxY=0;
  const unitW=id=>spouseMap.has(id)?(KT_NW*2+KT_SP_GAP):KT_NW;
  function place(id,x,yTop){
    const h=H.get(id)||(KT_NH+KT_GAP_Y);
    const cy=yTop+h/2;
    pos[id]={x:x,y:cy-KT_NH/2};
    const sid=spouseMap.get(id);
    if(sid&&map.has(sid)) pos[sid]={x:x+KT_NW+KT_SP_GAP,y:cy-KT_NH/2};
    maxX=Math.max(maxX,x+unitW(id)); maxY=Math.max(maxY,yTop+h);
    const ks=kids.get(id)||[];
    const total=ks.reduce((s,k)=>s+(H.get(k)||KT_NH+KT_GAP_Y),0);
    let yy=yTop+(h-total)/2;
    ks.forEach(k=>{ const kh=H.get(k)||KT_NH+KT_GAP_Y; place(k,x+unitW(id)+KT_LEVEL_W,yy); yy+=kh; });
  }
  const roots=list.filter(n=>!spouseSub.has(n.id)&&(!n.parentId||!map.has(n.parentId)));
  roots.forEach(r=>calcH(r.id));
  let y=18;
  roots.forEach(r=>{ const h=H.get(r.id)||KT_NH+KT_GAP_Y; place(r.id,24,y); y+=h+KT_GAP_Y*2; });
  const pairs=[]; spouseMap.forEach((v,k)=>pairs.push([k,v]));
  return {map:map,kids:kids,pairs:pairs,pos:pos,maxX:maxX,maxY:maxY,unitW:unitW,spouseSub:spouseSub,spouseMap:spouseMap};
}

function kinFamilyView(root,back){
  root.innerHTML='';
  root.appendChild(backBtn(back));
  root.appendChild(secTitle('🧬','认亲戚 · 家族树','上面算称呼，下面是横向展开的家族树'));

  // ---- 顶部：称呼计算器 ----
  const examples=['姐姐的姐姐','爸爸的爸爸','妈妈的妈妈','哥哥的儿子','姐姐的女儿','老公的妈妈','叔叔的女儿','舅舅的儿子','奶奶的哥哥'];
  const input=el('textarea',{class:'input',rows:2,placeholder:'例如：姐姐的姐姐 / 爸爸的妈妈的哥哥'});
  const result=el('div',{class:'kin-result',style:'margin-top:12px'});
  const chips=el('div',{class:'kin-chips'});
  examples.forEach(e=>chips.appendChild(el('button',{class:'chip',onclick:()=>{ input.value=e; doCalc(); }},e)));
  function doCalc(){
    const txt=input.value.trim(); if(!txt){ toast('先输入关系链','err'); return; }
    const r=kinQuery(txt); result.innerHTML='';
    result.appendChild(el('div',{class:'card'+(r.term==='未识别'||r.term==='（暂未收录）'||r.term==='出错了'?' card-warn':'')},[
      el('div',{class:'kin-term',text:r.term}),
      el('div',{class:'muted',style:'margin-top:6px',text:'即：'+r.note}),
      el('div',{class:'muted',style:'margin-top:4px;font-size:12px',text:'关系链：'+(r.path||txt)})
    ]));
  }
  root.appendChild(el('div',{class:'card',style:'margin-bottom:14px'},[
    input,
    el('div',{class:'row',style:'gap:8px;margin-top:8px'},[el('button',{class:'btn btn-primary',onclick:doCalc},'🔍 计算称呼')]),
    el('div',{style:'margin-top:10px'},[el('div',{class:'muted',style:'font-size:12px;margin-bottom:6px'},'常见试试：'),chips])
  ]));
  root.appendChild(result);

  // ---- 全局：搜索成员 ----
  const searchI=el('input',{class:'input',placeholder:'🔎 搜索家族成员（姓名 / 称谓），自动高亮',style:'max-width:360px'});
  searchI.addEventListener('input',()=>applySearch(searchI.value.trim().toLowerCase()));
  root.appendChild(el('div',{class:'card',style:'margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap'},[
    searchI,
    el('div',{class:'muted',style:'font-size:12px'},'提示：卡片颜色 = 辈分（越暖色越长辈）')
  ]));

  // 辈分配色
  const KT_GEN_COLORS=['#b9843f','#d09a52','#7fafc9','#6fb093','#a87bb0','#cf7f7f','#6f8fb0','#9aab5a','#c0814f','#7d9bb5'];
  function ktGenOf(list,n){ let g=0,cur=n; const m=new Map(list.map(x=>[x.id,x])); while(cur&&cur.parentId&&m.has(cur.parentId)){ g++; cur=m.get(cur.parentId); } return g; }
  function escapeXml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // ---- 下方：女方 / 男方 上下两个版块 ----
  let all=[]; let delMode=false;
  const defs=[
    {key:'me', label:'👩 女方家族（我这边）', cls:'kt-f', stroke:'#e0a0bf'},
    {key:'him', label:'👨 男方家族', cls:'kt-m', stroke:'#93b9e6'}
  ];
  const panels=defs.map(d=>{
    const sec=el('div',{class:'kt-sec '+d.cls});
    const head=el('div',{class:'kt-sec-head'},[
      el('div',{class:'kt-sec-title',text:d.label}),
      el('div',{class:'kt-sec-acts'},[
        el('button',{class:'btn btn-soft btn-sm',onclick:()=>exportSide(d.key)},'⬇ 导出图片'),
        el('button',{class:'btn btn-ghost btn-sm',onclick:()=>clearSide(d.key)},'🗑 清空')
      ])
    ]);
    // 左侧工具条：添加 / 删除模式 / 拖拽新增 / 辈分图例
    const dragChip=el('div',{class:'kt-drag',draggable:true,title:'拖到右侧画布即可新增人物'},'🧍 拖我新增');
    dragChip.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain','new:'+d.key); try{e.dataTransfer.setData('application/json',JSON.stringify({side:d.key}));}catch(_){} });
    const left=el('div',{class:'kt-left'},[
      el('button',{class:'btn btn-primary btn-sm block',onclick:()=>openPerson(null,d.key)},'➕ 添加长辈'),
      el('button',{class:'kt-delmode btn btn-soft btn-sm block',onclick:()=>{ delMode=!delMode; document.querySelectorAll('.kt-delmode').forEach(b=>b.classList.toggle('on',delMode)); panels.forEach(pp=>pp.sec.classList.toggle('kt-delon',delMode)); toast(delMode?'删除模式：点人物卡片即可删除':'已退出删除模式','ok'); }},'✏ 删除模式'),
      dragChip,
      el('div',{class:'kt-legend',id:'ktLeg_'+d.key})
    ]);
    const scroll=el('div',{class:'kt-scroll'});
    const canvas=el('div',{class:'kt-canvas'});
    const svg=ktSvgNode('svg',{class:'kt-lines'});
    const layer=el('div',{class:'kt-layer'});
    canvas.append(svg,layer);
    canvas.addEventListener('dragover',e=>{ if(Array.from(e.dataTransfer.types).includes('text/plain')) e.preventDefault(); });
    canvas.addEventListener('drop',e=>{ e.preventDefault(); try{ const j=JSON.parse(e.dataTransfer.getData('application/json')); if(j&&j.side) openPerson(null,j.side); }catch(_){} });
    scroll.appendChild(canvas);
    const tip=el('div',{class:'kt-tip',text:'点人物卡片可：添加子女 / 添加配偶 / 编辑资料（含头像） / 删除。长辈在左，后代一代代向右展开。开启「删除模式」后点卡片即删。'});
    sec.append(head,el('div',{class:'kt-body'},[left,scroll]),tip);
    root.appendChild(sec);
    return Object.assign({},d,{sec:sec,canvas:canvas,svg:svg,layer:layer,scroll:scroll});
  });

  async function load(){ try{ all=(await recordsBySub(MODULE,'family'))||[]; }catch(e){ all=[]; } }
  async function saveRec(rec){ await putRecord(rec); try{ await recordChange(rec); }catch(e){} }

  function ktNode(n,pos,onOpen){
    const w=el('div',{class:'kt-node',style:'left:'+pos.x+'px;top:'+pos.y+'px;width:'+KT_NW+'px;height:'+KT_NH+'px'});
    w._rec=n;
    const av=el('div',{class:'kt-av',text:'👤'});
    (async()=>{ try{ const fs=await filesByRec(n.id); if(fs&&fs.length&&fs[0]&&fs[0].blob){ av.style.backgroundImage='url('+URL.createObjectURL(fs[0].blob)+')'; av.textContent=''; } }catch(e){} })();
    const box=el('div',{class:'kt-txt'},[
      el('div',{class:'kt-name',text:n.name||'未命名'}),
      el('div',{class:'kt-rel',text:n.title||'（点我补充称谓）'})
    ]);
    w.append(av,box);
    w.addEventListener('click',()=>{ if(delMode){ delPerson(n); } else onOpen(n); });
    return w;
  }

  function renderSide(p){
    const list=all.filter(n=>n.side===p.key);
    const genOf=new Map(); list.forEach(n=>genOf.set(n.id,ktGenOf(list,n)));
    const L=ktLayout(list);
    const W=Math.max(1100,L.maxX+200), Hh=Math.max(210,L.maxY+70);
    p.canvas.style.width=W+'px'; p.canvas.style.height=Hh+'px';
    p.svg.setAttribute('width',W); p.svg.setAttribute('height',Hh);
    while(p.svg.firstChild) p.svg.removeChild(p.svg.firstChild);
    p.layer.innerHTML='';
    L.pairs.forEach(pr=>{
      const a=L.pos[pr[0]], b=L.pos[pr[1]]; if(!a||!b) return;
      p.svg.appendChild(ktSvgNode('line',{x1:a.x+KT_NW,y1:a.y+KT_NH/2,x2:b.x,y2:b.y+KT_NH/2,stroke:p.stroke,'stroke-width':'2'}));
    });
    L.kids.forEach((ks,pid)=>{
      const pa=L.pos[pid]; if(!pa) return;
      const hasSp=!!(pid&&L.spouseMap&&L.spouseMap.has(pid));
      const sx=pa.x+(hasSp?(KT_NW+KT_SP_GAP/2):KT_NW);
      const sy=pa.y+KT_NH/2;
      ks.forEach(cid=>{
        const c=L.pos[cid]; if(!c) return;
        const cx=c.x, cy=c.y+KT_NH/2;
        const mid=sx+(cx-sx)*0.45;
        p.svg.appendChild(ktSvgNode('path',{d:'M'+sx+' '+sy+' H'+mid+' V'+cy+' H'+cx,fill:'none',stroke:p.stroke,'stroke-width':'2'}));
      });
    });
    list.forEach(n=>{ const pos=L.pos[n.id]; if(pos){ const w=ktNode(n,pos,openPerson); const g=genOf.get(n.id)||0; const col=KT_GEN_COLORS[g%KT_GEN_COLORS.length]; w.style.borderColor=col; w.style.boxShadow='0 1px 3px '+col+'33'; p.layer.appendChild(w); } });
    if(!list.length){
      p.layer.appendChild(el('div',{class:'kt-empty',text:'还没有人物 —— 点左侧「➕ 添加长辈」开始，例如先加：爷爷 / 奶奶，再给他们加子女'}));
    }
    const leg=p.sec.querySelector('#ktLeg_'+p.key); if(leg){ leg.innerHTML=''; const maxG=Math.max(0,...list.map(n=>genOf.get(n.id)||0)); for(let g=0;g<=maxG;g++){ const col=KT_GEN_COLORS[g%KT_GEN_COLORS.length]; leg.appendChild(el('div',{class:'kt-lg',html:'<i style="background:'+col+'"></i>第'+(g+1)+'代'})); } }
    applySearch(searchI.value.trim().toLowerCase(), p);
  }
  function renderAll(){ panels.forEach(renderSide); }

  function applySearch(q, onlyP){
    panels.forEach(p=>{ if(onlyP&&onlyP!==p) return; let firstHit=null;
      [...p.layer.querySelectorAll('.kt-node')].forEach(w=>{ const n=w._rec; const hit=!q||((n.name||'').toLowerCase().includes(q)||(n.title||'').toLowerCase().includes(q)); w.classList.toggle('kt-dim',!!q&&!hit); w.classList.toggle('kt-hit',!!q&&hit); if(hit&&!firstHit) firstHit=w; });
      if(q&&firstHit){ try{ firstHit.scrollIntoView({block:'center',inline:'center'}); }catch(_){} }
    });
  }

  async function openPerson(n,side){
    const isNew=!n;
    const rec=n||{id:uid(),module:MODULE,sub:'family',created:now(),updated:now(),name:'',title:'',side:side||'me',parentId:null,spouseId:null,order:now()};
    const picker=imagePicker('头像照片（可选）',{multiple:false});
    const nameI=el('input',{class:'input',value:rec.name||'',placeholder:'姓名，如：王秀英'});
    const relI=el('input',{class:'input',value:rec.title||'',placeholder:'亲戚称谓备注，如：奶奶 / 大姑 / 表哥'});
    const acts=[el('button',{class:'btn btn-primary',onclick:async()=>{
      rec.name=nameI.value.trim()||'未命名'; rec.title=relI.value.trim(); rec.updated=now();
      await saveRec(rec);
      const f=picker.getFiles(); if(f&&f.length){ try{ await attachFile(rec.id,f[0]); }catch(e){} }
      modal.close(); await load(); renderAll(); toast('已保存','ok');
    }},'保存')];
    if(!isNew){
      acts.push(el('button',{class:'btn btn-soft',onclick:async()=>{ modal.close(); await addChild(rec); }},'➕ 添加子女'));
      if(!rec.spouseId && !all.some(x=>x.spouseId===rec.id)) acts.push(el('button',{class:'btn btn-soft',onclick:async()=>{ modal.close(); await addSpouse(rec); }},'💑 添加配偶'));
      acts.push(el('button',{class:'btn btn-ghost',onclick:async()=>{ modal.close(); await delPerson(rec); }},'🗑 删除'));
    }
    modal.open(isNew?'添加人物':'编辑人物', el('div',{},[
      picker,
      el('div',{class:'field'},[el('label',{text:'姓名'}),nameI]),
      el('div',{class:'field'},[el('label',{text:'亲戚称谓 / 备注'}),relI]),
      el('div',{class:'row',style:'gap:8px;flex-wrap:wrap'},acts)
    ]));
  }
  async function addChild(parent){
    const rec={id:uid(),module:MODULE,sub:'family',created:now(),updated:now(),name:'',title:'',side:parent.side,parentId:parent.id,spouseId:null,order:now()};
    await saveRec(rec); await load(); renderAll(); await openPerson(rec);
  }
  async function addSpouse(n){
    const rec={id:uid(),module:MODULE,sub:'family',created:now(),updated:now(),name:'',title:'',side:n.side,parentId:null,spouseId:n.id,order:now()};
    await saveRec(rec);
    await saveRec(Object.assign({},n,{spouseId:rec.id,updated:now()}));
    await load(); renderAll(); await openPerson(rec);
  }
  function countDesc(id){
    let c=0; (function walk(i){ all.filter(x=>x.parentId===i).forEach(x=>{ c++; walk(x.id); }); })(id); return c;
  }
  async function delPerson(n){
    const cnt=countDesc(n.id);
    if(!confirm('删除「'+(n.name||'未命名')+'」'+(cnt?'及其 '+cnt+' 位后代':'')+'？')) return;
    const ids=[]; (function walk(id){ ids.push(id); all.filter(x=>x.parentId===id).forEach(x=>walk(x.id)); })(n.id);
    if(n.spouseId){ const s=all.find(x=>x.id===n.spouseId); if(s) await saveRec(Object.assign({},s,{spouseId:null,updated:now()})); }
    const sp=all.find(x=>x.spouseId===n.id); if(sp) await saveRec(Object.assign({},sp,{spouseId:null,updated:now()}));
    for(const id of ids){ try{ await softDelete(id); }catch(e){} }
    await load(); renderAll(); toast('已删除','ok');
  }
  async function clearSide(key){
    const list=all.filter(n=>n.side===key);
    if(!list.length){ toast('这边还没有人物','err'); return; }
    if(!confirm('清空'+(key==='me'?'女方':'男方')+'家族的 '+list.length+' 位人物？')) return;
    for(const n of list){ try{ await softDelete(n.id); }catch(e){} }
    await load(); renderAll(); toast('已清空','ok');
  }

  async function exportSide(key){
    const list=all.filter(n=>n.side===key);
    if(!list.length){ toast('这边还没有人物，无法导出','err'); return; }
    const p=panels.find(x=>x.key===key);
    const genOf=new Map(); list.forEach(n=>genOf.set(n.id,ktGenOf(list,n)));
    const L=ktLayout(list);
    const W=Math.max(1100,L.maxX+200), Hh=Math.max(210,L.maxY+70);
    let s='<?xml version="1.0" encoding="UTF-8"?>\n';
    s+='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+Hh+'" viewBox="0 0 '+W+' '+Hh+'">';
    s+='<rect width="'+W+'" height="'+Hh+'" fill="#ffffff"/>';
    L.pairs.forEach(pr=>{ const a=L.pos[pr[0]],b=L.pos[pr[1]]; if(!a||!b)return; s+='<line x1="'+(a.x+KT_NW)+'" y1="'+(a.y+KT_NH/2)+'" x2="'+b.x+'" y2="'+(b.y+KT_NH/2)+'" stroke="'+p.stroke+'" stroke-width="2"/>'; });
    L.kids.forEach((ks,pid)=>{ const pa=L.pos[pid]; if(!pa)return; const hasSp=!!L.spouseMap.has(pid); const sx=pa.x+(hasSp?(KT_NW+KT_SP_GAP/2):KT_NW), sy=pa.y+KT_NH/2;
      ks.forEach(cid=>{ const c=L.pos[cid]; if(!c)return; const cx=c.x, cy=c.y+KT_NH/2, mid=sx+(cx-sx)*0.45; s+='<path d="M'+sx+' '+sy+' H'+mid+' V'+cy+' H'+cx+'" fill="none" stroke="'+p.stroke+'" stroke-width="2"/>'; }); });
    for(const n of list){ const pos=L.pos[n.id]; if(!pos)continue; const g=genOf.get(n.id)||0; const col=KT_GEN_COLORS[g%KT_GEN_COLORS.length]; const x=pos.x,y=pos.y;
      s+='<rect x="'+x+'" y="'+y+'" width="'+KT_NW+'" height="'+KT_NH+'" rx="12" fill="#ffffff" stroke="'+col+'" stroke-width="2.5"/>';
      s+='<text x="'+(x+KT_NW/2)+'" y="'+(y+24)+'" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#222">'+escapeXml(n.name||'未命名')+'</text>';
      if(n.title) s+='<text x="'+(x+KT_NW/2)+'" y="'+(y+43)+'" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#888">'+escapeXml(n.title)+'</text>';
    }
    s+='</svg>';
    const name=(key==='me'?'女方家族':'男方家族')+'_家谱';
    const svgBlob=new Blob([s],{type:'image/svg+xml;charset=utf-8'});
    try{
      const url=URL.createObjectURL(svgBlob); const img=new Image();
      img.onload=()=>{ const c=document.createElement('canvas'); c.width=W; c.height=Hh; const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,Hh); ctx.drawImage(img,0,0); c.toBlob(b=>{ if(b){ download(b,name+'.png'); } else { download(svgBlob,name+'.svg'); } URL.revokeObjectURL(url); toast('已导出家谱图片（PNG）','ok'); },'image/png'); };
      img.onerror=()=>{ download(svgBlob,name+'.svg'); URL.revokeObjectURL(url); toast('已导出家谱图片（SVG）','ok'); };
      img.src=url;
    }catch(e){ download(svgBlob,name+'.svg'); toast('已导出家谱图片（SVG）','ok'); }
  }

  (async()=>{ await load(); renderAll(); })();
}


export const subs = { mandarin:mandarinView, eq:eqView, wardrobe:wardrobeView, beauty:beautyView, podcast:podcastView, novel:novelView, photo:photoView, design:designView, journal:journalView, kin:kinFamilyView, family:kinFamilyView };
