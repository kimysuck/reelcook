// 릴쿡 서비스 워커: 오프라인 캐시 + 인스타 "공유" 받기
const VERSION = 'reelcook-v9';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const INBOX = 'share-inbox';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== INBOX) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1) 다른 앱에서 공유한 내용 받기 (POST /share-target)
  if (e.request.method === 'POST' && url.pathname === '/share-target') {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const inbox = await caches.open(INBOX);
        for (const k of await inbox.keys()) await inbox.delete(k);
        const files = form.getAll('media').filter(f => f && typeof f !== 'string' && f.size > 0);
        const meta = {
          title: form.get('title') || '', text: form.get('text') || '', url: form.get('url') || '',
          files: files.map((f, i) => ({ key: `/inbox/file-${i}`, type: f.type, name: f.name })),
          at: Date.now(),
        };
        await inbox.put('/inbox/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
        for (let i = 0; i < files.length; i++) {
          await inbox.put(`/inbox/file-${i}`, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'application/octet-stream' } }));
        }
      } catch (err) { /* 받은 게 없어도 앱은 열어준다 */ }
      return Response.redirect('/?share=1', 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // AI 요청은 캐시하지 않음

  // 2) 화면: 네트워크 우선(업데이트 반영), 실패하면 캐시
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone(); caches.open(VERSION).then(c => c.put('/index.html', copy)); return r;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  // 3) 아이콘 등 정적 파일: 캐시 우선
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
