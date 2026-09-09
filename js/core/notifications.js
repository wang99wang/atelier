// ===== 全局消息提醒 =====
import { kvGet, kvSet } from './db.js';
import { toast } from './utils.js';
import { allRecords } from './db.js';

const DEFAULT_REMINDERS = {
  water:   { on:true,  label:'饮水提醒', icon:'💧', times:['09:00','11:00','14:00','16:00','19:00'], vibrate:[200,100,200] },
  skincare:{ on:true,  label:'护肤提醒', icon:'🧴', times:['21:30','07:30'], vibrate:[200,100,200] },
  workout: { on:false, label:'训练提醒', icon:'🏃', times:['18:30'], vibrate:[300,100,300] },
  bill:    { on:true,  label:'账单还款提醒', icon:'💳', times:['09:00'], vibrate:[200,100,200] },
  anniv:   { on:true,  label:'纪念日到期提醒', icon:'💝', times:['09:00'], vibrate:[200,100,200] },
};

let _reminders = null;
export const getReminders = async () => {
  if (_reminders) return _reminders;
  _reminders = await kvGet('reminders') || structuredClone(DEFAULT_REMINDERS);
  return _reminders;
};
export const saveReminders = async (r) => { _reminders = r; await kvSet('reminders', r); };

export const requestPermission = async () => {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
};

const notify = (title, body) => {
  toast(body || title, 'ok');
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('🌸 '+title, { body, icon:'assets/icon-192.png' }); } catch {}
  }
  if (navigator.vibrate) navigator.vibrate([200,100,200]);
};

// 检查定时提醒是否到点（按 HH:MM 比对，避免重复）
let _firedKey = new Set();
export const evaluateTimed = async () => {
  const r = await getReminders();
  const nowDt = new Date();
  const hhmm = String(nowDt.getHours()).padStart(2,'0')+':'+String(nowDt.getMinutes()).padStart(2,'0');
  for (const [key, cfg] of Object.entries(r)) {
    if (!cfg.on) continue;
    if (!cfg.times.includes(hhmm)) continue;
    const fk = key+'@'+hhmm+'@'+nowDt.toDateString();
    if (_firedKey.has(fk)) continue;
    _firedKey.add(fk);
    if (key==='water') notify('该喝水啦 💧', cfg.label+' · 每天 8 杯，皮肤更水润');
    if (key==='skincare') notify('护肤时间 🧴', cfg.label+' · 清洁-精华-面霜别偷懒');
    if (key==='workout') notify('训练时间 🏃', cfg.label+' · 动起来，身材悄悄变好');
  }
};

// 数据驱动的到期提醒：纪念日 / 账单
export const evaluateDataReminders = async () => {
  const all = await allRecords();
  const today = new Date(); today.setHours(0,0,0,0);
  // 纪念日
  const anniv = all.filter(x=>x.sub==='anniversary' && !x.deleted && x.date);
  for (const a of anniv) {
    const d = new Date(a.date+'T00:00:00');
    const diff = Math.round((d - today)/86400000);
    const warn = a.warnDays ?? 7;
    if (diff>=0 && diff<=warn) {
      const fk = 'anniv@'+a.id+'@'+today.toDateString();
      if (!_firedKey.has(fk)) { _firedKey.add(fk);
        notify('纪念日临近 💝', `${a.title} 还有 ${diff} 天（${a.date}）`); }
    }
  }
  // 账单 / 还款
  const bills = all.filter(x=>(x.sub==='bill'||x.type==='bill') && !x.deleted && x.dueDate);
  for (const b of bills) {
    const d = new Date(b.dueDate+'T00:00:00');
    const diff = Math.round((d - today)/86400000);
    if (diff>=0 && diff<=3) {
      const fk='bill@'+b.id+'@'+today.toDateString();
      if (!_firedKey.has(fk)) { _firedKey.add(fk);
        notify('账单还款日 💳', `${b.title} ${diff===0?'今天到期':('还有 '+diff+' 天')} · ${b.amount||''}`); }
    }
  }
};

export const initReminders = () => {
  requestPermission();
  const tick = () => { evaluateTimed(); evaluateDataReminders(); };
  setInterval(tick, 30000);
  setTimeout(tick, 3000);
};

// 顶部红点提示
export const pendingReminderCount = async () => {
  const all = await allRecords();
  const today = new Date(); today.setHours(0,0,0,0);
  let n = 0;
  for (const a of all.filter(x=>x.sub==='anniversary' && !x.deleted && x.date)) {
    const d = new Date(a.date+'T00:00:00'); const diff=Math.round((d-today)/86400000);
    if (diff>=0 && diff<=(a.warnDays??7)) n++;
  }
  return n;
};
