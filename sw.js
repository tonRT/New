// ===== MOBILE SERVICE WORKER =====
const CACHE_NAME = 'crypto-mobile-v1';
const STATIC_FILES = [
    './',
    './index.html',
    './style.css',
    './setup.js',
    './script.js',
    './analysis.py',
    './manifest.json'
];

const CDN_FILES = [
    'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js'
];

// ===== INSTALL =====
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll([...STATIC_FILES, ...CDN_FILES]))
    );
    self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ===== FETCH =====
self.addEventListener('fetch', (e) => {
    // Skip API calls
    if (e.request.url.includes('api.coingecko.com') || 
        e.request.url.includes('huggingface.co') ||
        e.request.url.includes('cryptopanic.com') ||
        e.request.url.includes('blocknative.com')) {
        return;
    }
    
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            
            return fetch(e.request).then(res => {
                if (res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return res;
            }).catch(() => cached);
        })
    );
});
