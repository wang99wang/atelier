// ===== Service Worker：离线缓存 / 类原生体验 =====
const CACHE = 'ai-workbench-v4';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/core/utils.js','./js/core/db.js','./js/core/ai.js','./js/core/crypto.js','./js/core/network.js',
  './js/core/sync.js','./js/core/notifications.js','./js/core/media.js','./js/core/data-services.js',
  './js/core/crud.js','./js/core/lib.js',
  './js/modules/daily.js','./js/modules/tools.js','./js/modules/life.js','./js/modules/finance.js',
  './js/modules/growth.js','./js/modules/creator.js','./js/modules/ai-edit.js',
  './assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-512.png','./assets/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 逐个缓存：单个资源 404/失败不影响其它（避免 addAll 一处失败整体静默失效）
    await Promise.all(ASSETS.map(u => c.add(u).catch(()=>{})));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
// 网络优先，离线回退缓存（保证更新即时生效，同时离线可用）
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 外部 API 不缓存，直连
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return res;
    }).catch(() => caches.match(req))
  );
});
// 后台同步（联网自动同步 outbox）
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-outbox') { e.waitUntil(Promise.resolve()); }
});
// 收到「立即激活新版本」指令时跳过等待，直接生效
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
