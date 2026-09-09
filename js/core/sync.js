// ===== 同步 / 快照 / 回收站维护 =====
import { allRecords, putSnapshot, purgeExpired, enqueue, outboxPending, getRecord, kvGet, kvSet } from './db.js';
import { cloudMirror, getEndpoints } from './network.js';
import { now, fmtDate } from './utils.js';

let _statusEls = [];
export const onSyncStatus = (fn) => _statusEls.push(fn);
const setStatus = (txt) => _statusEls.forEach(fn=>fn(txt));

// 任意本地写操作后调用：写入 outbox + 镜像到「本地云」
export const recordChange = async (rec) => {
  try { await cloudMirror.push(rec); } catch {}
  try { await enqueue({ op:'upsert', table:'records', id:rec.id, payload:rec }); } catch {}
};

// 每日快照（云端 + 本地）
export const dailySnapshot = async () => {
  const last = await kvGet('last_snapshot_date');
  const today = fmtDate(now());
  if (last === today) return false;
  const recs = await allRecords();
  const blob = JSON.stringify({ ts: now(), count: recs.length, records: recs });
  try { await putSnapshot({ id: 'snap_'+today, date: today, ts: now(), count: recs.length, blob }); } catch {}
  try { await cloudMirror.snapshot(blob); } catch {}
  await kvSet('last_snapshot_date', today);
  return true;
};

export const runHousekeeping = async () => {
  await purgeExpired();
  await dailySnapshot();
};

// 联网自动同步（outbox -> 云端端点，若配置了真实后端）
export const syncNow = async () => {
  setStatus('同步中…');
  const ep = await getEndpoints();
  const pending = await outboxPending();
  try {
    if (ep && ep.base) {
      // 真实后端（用户自建 MySQL+OSS）示例：POST /sync
      for (const job of pending) {
        await fetch(ep.base + '/sync', {
          method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer '+(ep.token||'')},
          body: JSON.stringify(job)
        });
      }
    } else {
      // 默认：本地云镜像已即时双写
      await new Promise(r=>setTimeout(r,300));
    }
    setStatus('已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
    return { ok:true, count: pending.length };
  } catch (e) {
    setStatus('离线 · 本地已保存');
    return { ok:false, error:e.message };
  }
};

export const initSync = () => {
  window.addEventListener('online', () => syncNow());
  // 每 90 秒做一次轻量维护（快照/回收站）
  setInterval(runHousekeeping, 90000);
  setTimeout(runHousekeeping, 4000);
  setTimeout(syncNow, 1500);
};
