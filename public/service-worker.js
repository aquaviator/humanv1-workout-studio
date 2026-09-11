const SHELL_CACHE = 'humanv1-workout-studio-shell-v1';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('humanv1-workout-studio-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

function isShellRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate') return true;
  if (url.pathname === '/service-worker.js') return false;
  return ['script', 'style', 'font', 'image'].includes(request.destination);
}

self.addEventListener('fetch', event => {
  if (!isShellRequest(event.request)) return;
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        void caches.open(SHELL_CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    });
    return cached || network.catch(() => requestFallback(event.request));
  }));
});

async function requestFallback(request) {
  if (request.mode === 'navigate') return (await caches.match('/index.html')) || Response.error();
  return Response.error();
}
