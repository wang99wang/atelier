// ===== IndexedDB 数据层 =====
import { uid, now } from './utils.js';

const DB_NAME = 'ai_workbench_db';
const DB_VER = 1;
let _db = null;

export const openDB = () => new Promise((resolve, reject) => {
  if (_db) return resolve(_db);
  const req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains('records')) {
      const s = db.createObjectStore('records', { keyPath: 'id' });
      s.createIndex('module', 'module', { unique: false });
      s.createIndex('sub', 'sub', { unique: false });
      s.createIndex('type', 'type', { unique: false });
      s.createIndex('deleted', 'deleted', { unique: false });
      s.createIndex('updated', 'updated', { unique: false });
      s.createIndex('module_updated', ['module','updated'], { unique: false });
    }
    if (!db.objectStoreNames.contains('files')) {
      const f = db.createObjectStore('files', { keyPath: 'id' });
      f.createIndex('recId', 'recId', { unique: false });
    }
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('outbox')) {
      const o = db.createObjectStore('outbox', { keyPath: 'id' });
      o.createIndex('status', 'status', { unique: false });
    }
  };
  req.onsuccess = () => { _db = req.result; resolve(_db); };
  req.onerror = () => reject(req.error);
});

const tx = async (store, mode, fn) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let captured;
    const ret = fn(s);
    if (ret && typeof ret === 'object' && 'result' in ret) {
      ret.onsuccess = () => { captured = ret.result; };
    } else {
      captured = ret;
    }
    t.oncomplete = () => resolve(captured);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};

// === 记录 CRUD ===
export const putRecord = async (rec) => {
  const r = { id: rec.id || uid(), created: rec.created || now(), updated: now(), deleted: false, ...rec };
  await tx('records', 'readwrite', s => s.put(r));
  return r;
};
export const getRecord = (id) => tx('records', 'readonly', s => s.get(id));
export const allRecords = () => tx('records', 'readonly', s => s.getAll());
export const recordsByModule = (module) => tx('records', 'readonly', s => s.index('module').getAll(module));
export const recordsBySub = (module, sub) => new Promise(async (resolve) => {
  const all = await recordsByModule(module);
  resolve(all.filter(r => r.sub === sub && !r.deleted));
});
export const softDelete = async (id, days=30) => {
  const r = await getRecord(id);
  if (!r) return;
  r.deleted = true; r.deletedAt = now(); r.purgeAt = now() + days*86400000;
  await tx('records', 'readwrite', s => s.put(r));
};
export const restore = async (id) => {
  const r = await getRecord(id);
  if (!r) return;
  r.deleted = false; delete r.deletedAt; delete r.purgeAt;
  await tx('records', 'readwrite', s => s.put(r));
};
export const hardDelete = (id) => tx('records', 'readwrite', s => s.delete(id));
export const purgeExpired = async () => {
  const all = await allRecords();
  const t = now();
  for (const r of all) {
    if (r.deleted && r.purgeAt && r.purgeAt < t) await hardDelete(r.id);
  }
};
export const trashList = async () => {
  const all = await allRecords();
  return all.filter(r => r.deleted).sort((a,b)=>b.deletedAt-a.deletedAt);
};

// === KV ===
export const kvGet = async (k) => { const r = await tx('kv','readonly',s=>s.get(k)); return r?r.v:null; };
export const kvSet = (k,v) => tx('kv','readwrite',s=>s.put({k,v}));

// === 文件 Blob ===
export const putFile = (f) => tx('files','readwrite',s=>s.put({id:f.id||uid(),...f}));
export const getFile = (id) => tx('files','readonly',s=>s.get(id));
export const filesByRec = (recId) => tx('files','readonly',s=>s.index('recId').getAll(recId));

// === 快照 ===
export const putSnapshot = (snap) => tx('snapshots','readwrite',s=>s.put(snap));
export const latestSnapshot = () => new Promise(async (res)=>{
  const all = await tx('snapshots','readonly',s=>s.getAll());
  all.sort((a,b)=>b.ts-a.ts); res(all[0]||null);
});

// === 同步 outbox ===
export const enqueue = (op) => tx('outbox','readwrite',s=>s.put({id:uid(),status:'pending',ts:now(),...op}));
export const outboxPending = () => tx('outbox','readonly',s=>s.index('status').getAll('pending'));
export const clearOutbox = (id) => tx('outbox','readwrite',s=>s.delete(id));

// === 全局搜索 ===
export const globalSearch = async (q) => {
  if (!q) return [];
  const all = await allRecords();
  const ql = q.toLowerCase();
  return all.filter(r=>!r.deleted && (
    (r.title||'').toLowerCase().includes(ql) ||
    (r.body||'').toLowerCase().includes(ql) ||
    (r.tags||[]).join(' ').toLowerCase().includes(ql)
  )).sort((a,b)=>b.updated-a.updated).slice(0,60);
};

// 统计存储占用
export const storageInfo = async () => {
  const all = await allRecords();
  const files = await tx('files','readonly',s=>s.getAll());
  let bytes = files.reduce((a,f)=>a+(f.blob?f.blob.size:0),0);
  return { records: all.length, files: files.length, bytes };
};
