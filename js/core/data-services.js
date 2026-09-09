// ===== 外部数据接口（30s 刷新：行情/天气/热点）=====
import { fetchJSON, fetchText, online } from './network.js';
import { kvGet, kvSet } from './db.js';

// ---------- 天气（Open-Meteo，免密钥，CORS 友好）----------
export const getWeather = async (lat, lon) => {
  if (lat==null) { const g = await geoLocation(); lat=g.lat; lon=g.lon; }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
    const d = await fetchJSON(url, {}, 8000);
    return { source:'live', current:d.current, daily:d.daily };
  } catch (e) {
    return { source:'demo', current:{temperature_2m:24,relative_humidity_2m:55,weather_code:1,wind_speed_10m:8,apparent_temperature:25}, daily:{weather_code:[1,2,3],temperature_2m_max:[26,27,25],temperature_2m_min:[18,19,17]} };
  }
};
const geoLocation = async () => {
  // 默认北京；可扩展为 IP 定位
  const saved = await kvGet('geo');
  if (saved) return saved;
  return { lat:39.9042, lon:116.4074, city:'北京' };
};
export const setGeo = (g) => kvSet('geo', g);

// ---------- 股票行情（可配置；默认演示行情，30s 刷新）----------
const SYMBOLS = [
  { code:'SH000001', name:'上证指数' }, { code:'SZ399001', name:'深证成指' },
  { code:'SZ399006', name:'创业板指' }, { code:'AU9999', name:'黄金Au99.99' },
];
const _quoteCache = {};
export const getQuotes = async () => {
  const ep = await kvGet('stock_endpoint');
  try {
    if (ep) {
      const d = await fetchJSON(ep, {}, 6000);
      return { source:'live', list: d.list||d };
    }
  } catch {}
  // 演示行情（随机游走，30s 刷新）
  const list = SYMBOLS.map(s=>{
    const prev = _quoteCache[s.code] ?? (s.code==='AU9999'?560: s.code.includes('000001')?3100:(s.code.includes('399006')?2100:10500));
    const change = (Math.random()-0.5)* (s.code==='AU9999'?6:30);
    const price = +(prev+change).toFixed(2);
    _quoteCache[s.code]=price;
    const pct = +((change/prev)*100).toFixed(2);
    return { ...s, price, change:+change.toFixed(2), pct, ts:Date.now() };
  });
  return { source:'demo', list };
};
export const setStockEndpoint = (url) => kvSet('stock_endpoint', url);

// ---------- 全网热点（可配置 RSS/JSON；默认演示）----------
export const getHotTopics = async () => {
  const ep = await kvGet('hot_endpoint');
  try {
    if (ep) { const d = await fetchJSON(ep, {}, 6000); return { source:'live', list: d.list||d }; }
  } catch {}
  const base = [
    'AI 大模型新一轮能力升级，多模态成焦点',
    '夏季抗炎饮食火了：这 5 类食物要多吃',
    '城市夜经济升温，周末市集成新宠',
    '轻运动风潮：帕梅拉式居家训练持续走红',
    '极简主义生活：断舍离整理清单分享',
    '通勤穿搭公式：三件单品搞定一周',
    '播客听书成年轻人新习惯',
    '新手理财：基金定投的 5 个误区',
  ];
  return { source:'demo', list: base.map((t,i)=>({ title:t, heat: 9999-i*333, tag:['热','新','荐'][i%3] })) };
};
export const setHotEndpoint = (url) => kvSet('hot_endpoint', url);

// ---------- 播客/音频搜索（可配置；默认演示）----------
export const searchAudio = async (q) => {
  const ep = await kvGet('podcast_endpoint');
  try { if (ep) { const d=await fetchJSON(ep+'?q='+encodeURIComponent(q),{},6000); return { source:'live', list:d.list||d }; } } catch {}
  const demo = ['深度思考','小宇宙夜话','商业内参','生活美学','科技乱炖','心理学小课'];
  return { source:'demo', list: demo.filter(d=>!q||d.includes(q)).map(t=>({ title:t, author:'主播·'+t.slice(0,2), duration:'38:12', cover:'🎧' })) };
};

export const isOnlineNow = () => online();
