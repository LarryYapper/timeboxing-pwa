/**
 * Service Worker for Timeboxing PWA
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'timeboxing-v75';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/style.css?v=52',
    './js/app.js?v=75',
    './js/calendar.js?v=31',
    './js/storage.js?v=22',
    './js/routines.js?v=21',
    './js/smartinput.js?v=40',
    './js/timeblocks.js?v=45',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip Google API requests - always fetch from network
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('accounts.google.com') ||
        url.hostname.includes('gstatic.com')) {
        return;
    }

    // For navigation requests, try network first, then cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // For other requests, try cache first, then network
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached response and update cache in background
                    event.waitUntil(
                        fetch(request)
                            .then((networkResponse) => {
                                if (networkResponse && networkResponse.status === 200) {
                                    const responseClone = networkResponse.clone();
                                    caches.open(CACHE_NAME)
                                        .then((cache) => cache.put(request, responseClone));
                                }
                            })
                            .catch(() => { }) // Ignore network errors
                    );
                    return cachedResponse;
                }

                // Not in cache, fetch from network
                return fetch(request)
                    .then((networkResponse) => {
                        // Cache successful responses
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(request, responseClone));
                        }
                        return networkResponse;
                    });
            })
    );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
