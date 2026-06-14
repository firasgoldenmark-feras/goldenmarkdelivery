const CACHE = 'gm-v13';
const BASE = self.registration.scope;

// الملفات الثابتة فقط (مكتبات CDN لا تتغير)
const STATIC = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(STATIC.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.startsWith('blob:')) return;

  const url = e.request.url;

  // APIs: شبكة فقط دائماً
  const isAPI = url.includes('anthropic.com') ||
                url.includes('supabase.co') ||
                url.includes('nominatim') ||
                url.includes('worldtimeapi');
  if (isAPI) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({error:'offline'}), {headers:{'Content-Type':'application/json'}})
    ));
    return;
  }

  // الملف الرئيسي (HTML): الشبكة أولاً دائماً — لضمان آخر نسخة
  const isHTML = e.request.mode === 'navigate' ||
                 url.endsWith('/') ||
                 url.endsWith('index.html') ||
                 url.includes('goldenmarkdelivery/');
  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          // خزّن النسخة الجديدة احتياطياً
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request)) // إذا لا إنترنت، استخدم المخزّن
    );
    return;
  }

  // مكتبات CDN: كاش أولاً (لا تتغير)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached || new Response('Offline', {status: 503}));
    })
  );
});
