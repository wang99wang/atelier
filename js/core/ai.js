// ===== AI 网关：可绑定任意 OpenAI 兼容大模型接口 =====
import { kvGet, kvSet } from './db.js';

const KV = 'ai_config';
const DEFAULT = { enabled:false, base:'', key:'', model:'gpt-4o-mini' };

export const getAIConfig = async () => {
  const c = await kvGet(KV);
  if (!c) return { ...DEFAULT };
  return { ...DEFAULT, ...c };
};
export const saveAIConfig = (c) => kvSet(KV, c);
export const hasAI = async () => {
  const c = await getAIConfig();
  return !!(c.enabled && c.base && c.key);
};

// 调用 OpenAI 兼容 /chat/completions（带超时，避免"生成中"永久卡住）
export const callAI = async ({ system='', prompt='', temperature=0.8, maxTokens=900, timeout=20000 } = {}) => {
  const c = await getAIConfig();
  if (!c.enabled || !c.base || !c.key) throw new Error('NO_AI');
  const url = c.base.replace(/\/+$/,'') + '/chat/completions';
  const body = {
    model: c.model || 'gpt-4o-mini',
    messages: [ ...(system?[{role:'system',content:system}]:[]), {role:'user',content:prompt} ],
    temperature, max_tokens: maxTokens
  };
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+c.key },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  } catch(err) {
    if (err.name === 'AbortError') throw new Error('请求超时（'+(timeout/1000)+'秒），请检查网络或模型可用性');
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

// 调用 OpenAI 兼容 /images/generations（文生图）
// 优先请求 b64_json（避免二次跨域拉取），4xx 时回退为不带 response_format 再试
export const callImageAI = async ({ prompt='', size='1024x1024', model='', timeout=90000 } = {}) => {
  const c = await getAIConfig();
  if (!c.enabled || !c.base || !c.key) throw new Error('NO_AI');
  const url = c.base.replace(/\/+$/,'') + '/images/generations';
  const attempt = async (withB64) => {
    const body = { prompt, n:1, size };
    body.model = model || c.imageModel || c.model || '';
    if (withB64) body.response_format = 'b64_json';
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+c.key },
        body: JSON.stringify(body), signal: ctrl.signal
      });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const t = await res.text(); if (t && t.length < 300) msg += ' ' + t; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const d = data && data.data && data.data[0];
      if (!d) throw new Error('接口未返回图片');
      if (d.b64_json) {
        const bin = atob(d.b64_json);
        const arr = new Uint8Array(bin.length);
        for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type:'image/png' });
        return { blob, url: URL.createObjectURL(blob) };
      }
      if (d.url) {
        const r2 = await fetch(d.url);
        const blob = await r2.blob();
        return { blob, url: URL.createObjectURL(blob) };
      }
      throw new Error('无图片数据');
    } finally { clearTimeout(timer); }
  };
  try { return await attempt(true); }
  catch (e) { if (/HTTP 4\d\d/.test(e.message||'')) return await attempt(false); throw e; }
};

export const testAI = async () => {
  try {
    const t = await callAI({ system:'你是测试助手', prompt:'只回复「OK」两个字', temperature:0, maxTokens:10 });
    return { ok:true, reply:(t||'').slice(0,40) };
  } catch(e) { return { ok:false, error:e.message }; }
};

// 从 AI 文本解析出 JSON 数组/对象（容错）
export const parseAIJson = (text) => {
  if (!text) return null;
  const s = text.trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1].trim()); } catch {} }
  const a = s.match(/\[[\s\S]*\]/); if (a) { try { return JSON.parse(a[0]); } catch {} }
  const o = s.match(/\{[\s\S]*\}/); if (o) { try { return JSON.parse(o[0]); } catch {} }
  return null;
};

// ===================== 本地兜底生成（无 API 时也能用）=====================

// 天气文字
export const weatherText = (code, temp) => {
  const map = {0:'晴',1:'晴间多云',2:'多云',3:'阴',45:'雾',48:'雾',51:'毛毛雨',53:'小雨',55:'中雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'阵雨',95:'雷阵雨'};
  const w = map[code] ?? '晴';
  return `${w} ${temp!=null?temp+'°':''}`;
};

// 从用户自由文字中识别场合（无 AI 时本地兜底用）
export const detectOccasion = (text='') => {
  const t = String(text||'').toLowerCase();
  if (/约会|相亲|date|看电影|暗恋|心动|喜欢的人/.test(t)) return '约会';
  if (/面试|应聘|复试|求职|校招/.test(t)) return '面试';
  if (/通勤|上班|开会|办公|出差|工作/.test(t)) return '通勤';
  if (/旅行|旅游|出游|度假|出去玩|road ?trip/.test(t)) return '旅行';
  if (/逛街|购物|商场|买东西|探店/.test(t)) return '逛街';
  if (/运动|健身|跑步|瑜伽|打球|锻炼|游泳/.test(t)) return '运动';
  if (/聚会|派对|趴|年会|团建|生日会|酒会/.test(t)) return '聚会';
  if (/拍照|摄影|写真|出片|约拍|拍立得/.test(t)) return '拍照';
  return '其他';
};

// 场景化穿搭兜底（返回 3 套）
export const localOutfit = ({ occasion='约会', weather='晴 26°', style='温柔', gender='女' }) => {
  const temp = (weather.match(/(-?\d+)\s*°/)||[])[1];
  const t = temp!=null?+temp:24;
  const isCold = t<=12, isHot = t>=28, isRain = /雨|雪|雾/.test(weather);
  const base = {
    '约会':{ mood:'温柔气质，让人心动不易出错', up:['奶油色针织衫','香芋紫衬衫','法式碎花裙上衣'], low:['高腰A字半身裙','微喇牛仔裤'], shoe:['小皮鞋','玛丽珍鞋'], acc:['珍珠耳钉','草编包'] },
    '面试':{ mood:'干练得体，专业可信', up:['纯白衬衫','浅蓝西装外套'], low:['九分西装裤','直筒西裙'], shoe:['尖头高跟/乐福鞋'], acc:['简约腕表','通勤托特包'] },
    '通勤':{ mood:'简约利落，舒适耐看', up:['基础款纯色T','薄款针织开衫'], low:['直筒休闲裤','烟管裤'], shoe:['小白鞋','乐福鞋'], acc:['帆布包','细框眼镜'] },
    '旅行':{ mood:'舒适随性，方便活动', up:['宽松卫衣','条纹长袖'], low:['工装裤','牛仔短裤'], shoe:['运动鞋','帆布鞋'], acc:['双肩包','棒球帽'] },
    '逛街':{ mood:'时尚吸睛，自在出片', up:['crop 上衣','廓形西装'], low:['阔腿裤','百褶裙'], shoe:['老爹鞋','短靴'], acc:['链条包','墨镜'] },
    '运动':{ mood:'活力清爽，透气排汗', up:['速干运动背心','运动卫衣'], low:['瑜伽裤','运动短裤'], shoe:['跑鞋'], acc:['运动腕表','发带'] },
    '聚会':{ mood:'精致有氛围，微醺不媚俗', up:['丝绒吊带','亮片针织'], low:['缎面半裙','修身西裤'], shoe:['细跟凉鞋','切尔西靴'], acc:['金属耳环','手拿包'] },
    '拍照':{ mood:'上镜出片，色彩干净', up:['纯色大领上衣','牛仔外套'], low:['白色长裙','浅色阔腿裤'], shoe:['小白鞋'], acc:['草帽','丝巾'] }
  }[occasion] || { mood:'随性大方', up:['纯色上衣'], low:['百搭下装'], shoe:['舒适鞋'], acc:['随手配饰'] };

  const styleAdj = { '甜美':'少女感', '帅气':'中性酷感', '温柔':'柔美', '简约':'极简', '辣妹':'性感吸睛' }[style]||'';
  const sets = [
    { name:`${occasion}·${styleAdj||'经典'}款`, items:[base.up[0], base.low[0], base.shoe[0], base.acc[0]] },
    { name:`${occasion}·备选 A`, items:[base.up[1]||base.up[0], base.low[1]||base.low[0], base.shoe[1]||base.shoe[0], base.acc[1]||base.acc[0]] },
    { name:`${occasion}·备选 B`, items:[ (gender==='女'?base.up[0]:base.up[1]||base.up[0]), base.low[1]||base.low[0], base.shoe[0], base.acc[0]] },
  ];
  const tips = [];
  if (isCold) tips.push('气温较低，外搭大衣/羽绒，注意保暖层次。');
  if (isHot) tips.push('天气偏热，选透气面料、浅色系更清爽。');
  if (isRain) tips.push('有降水，建议防水鞋+便携伞，下装避免拖地。');
  tips.push(`整体走「${styleAdj||'百搭'}」路线：${base.mood}。`);
  return { outfits: sets.map(s=>({ ...s, tip: tips.join(' ') })), weather };
};

// 高情商话术兜底（返回多条回复）
export const localSpeech = ({ input='', scene='暧昧', tone='温柔' }) => {
  const echo = input? `「${input}」` : '对方的话';
  const banks = {
    '温柔':[
      `${echo} —— 听到这句，心里一下子就软了，谢谢你这么想我 🌷`,
      `我也常常想起你呀。把这句话悄悄收进心里了。`,
      `你这么说，我今天的开心就有了理由。`,
    ],
    '幽默':[
      `${echo}？那你可能被判「太会撩」了，我申请旁听下一次 😏`,
      `收到！已加入我的「心动语录」收藏夹，编号 No.1。`,
      `这句话的含糖量超标了，建议下次提前预警 🍬`,
    ],
    '真诚':[
      `${echo} —— 我是认真的：有你在我很安心。`,
      `我也很想你。不需要理由，就是想。`,
      `谢谢你告诉我，这对我很重要。`,
    ],
    '撩人':[
      `${echo}？巧了，我正打算说这句，被你抢先了 😘`,
      `想我的时候，记得也让自己被好好对待呀。`,
      `那……下次见面，我要当面听你说第二遍。`,
    ],
    '克制':[
      `${echo} —— 嗯，我也记下了。`,
      `收到，挺好的。`,
      `你这样说，我挺高兴的，先放心里。`,
    ],
  };
  const sceneTip = {
    '暧昧':'（暧昧期：留点余味，别一次说满）',
    '恋爱':'（恋爱中：大方接住，互相给情绪价值）',
    '朋友':'（朋友间：轻松自然，别暧昧越界）',
    '职场':'（职场：礼貌专业，保持分寸）',
    '家人':'（对家人：温暖直接就好）',
    '陌生人':'（陌生社交：客气有边界）'
  }[scene]||'';
  const list = (banks[tone]||banks['温柔']).map(t=>({ text:t, tip:sceneTip }));
  return { replies:list, scene, tone };
};
