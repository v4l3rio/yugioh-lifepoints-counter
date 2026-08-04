const CACHE_NAME = 'lp-counter-v8';
const APP_SHELL = [
    './',
    './index.html',
    './styles.css?v=8',
    './app.js?v=8',
    './manifest.webmanifest',
    './icon.svg',
    './apple_icon.png',
    './favicon.ico',
    './lifedrop_sound.mp3'
];

const APP_ROOT = new URL('./', self.location.href).pathname;
const APP_ENTRY_POINTS = new Set([APP_ROOT, APP_ROOT + 'index.html']);
const EXCLUDED_PATHS = [APP_ROOT + 'old/', APP_ROOT + 'newui/'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (EXCLUDED_PATHS.some(path => url.pathname.startsWith(path))) return;

    if (request.mode === 'navigate') {
        if (!APP_ENTRY_POINTS.has(url.pathname)) return;
        event.respondWith(
            fetch(request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }))
    );
});
