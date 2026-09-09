// ===== 网络层（含离线降级） =====
import { kvGet, kvSet } from './db.js';

// 云端同步端点（可选）。默认留空 => 使用「本地云镜像」(localStorage) 实现离线双存储演示。
export const getEndpoints = async () => await kvGet('cloud_endpoints') || { base:'', token:'' };
export const setEndpoints = (e) => kvSet('cloud_endpoints', e);

export const fetchJSON = async (url, opts={}, timeout=8000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP '+res.status);
    return await res.json();
  } finally { clearTimeout(timer); }
};
export const fetchText = async (url, timeout=8000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP '+res.status);
    return await res.text();
  } finally { clearTimeout(timer); }
};
export const online = () => navigator.onLine;

// 云端镜像（localStorage 作为「本地云」，演示双存储 & 断网可用）
const MIRROR_KEY = 'wb_cloud_mirror_v1';
const mirrorGet = () => { try { return JSON.parse(localStorage.getItem(MIRROR_KEY)||'{}'); } catch { return {}; } };
const mirrorSet = (o) => { try { localStorage.setItem(MIRROR_KEY, JSON.stringify(o)); } catch {} };

export const cloudMirror = {
  async push(rec) { const m = mirrorGet(); m[rec.id] = { ...rec, _synced: Date.now() }; mirrorSet(m); return true; },
  async pull(since=0) { const m = mirrorGet(); return Object.values(m).filter(r=>r.updated>=since); },
  async snapshot(blob) { localStorage.setItem('wb_cloud_snapshot_'+new Date().toISOString().slice(0,10), blob); },
  async all() { return Object.values(mirrorGet()); }
};

export const isOnline = () => navigator.onLine !== false;
