/// <reference lib="webworker" />

const CACHE_NAME = "demo-app-v1";
const urlsToCache: string[] = ["/", "/src/main.ts", "/src/style.css", "/index.html"];

// Install event - cache resources
self.addEventListener("install", (event: ExtendableEvent) => {
    console.log("Service Worker installing...");

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache: Cache) => {
            console.log("Opened cache:", CACHE_NAME);
            return cache.addAll(urlsToCache);
        }),
    );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event: ExtendableEvent) => {
    console.log("Service Worker activating...");

    event.waitUntil(
        caches.keys().then((cacheNames: string[]) => {
            return Promise.all(
                cacheNames.map((cacheName: string) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log("Deleting old cache:", cacheName);
                        return caches.delete(cacheName);
                    }
                }),
            );
        }),
    );
});

// Fetch event - serve from cache when possible
self.addEventListener("fetch", (event: FetchEvent) => {
    // Only cache GET requests for same origin
    if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response: Response | undefined) => {
            // Return cached version if available
            if (response) {
                console.log("Serving from cache:", event.request.url);
                return response;
            }

            // Otherwise fetch from network and cache the response
            return fetch(event.request).then((response: Response) => {
                // Check if valid response
                if (!response || response.status !== 200 || response.type !== "basic") {
                    return response;
                }

                // Clone the response for caching
                const responseToCache: Response = response.clone();

                caches.open(CACHE_NAME).then((cache: Cache) => {
                    cache.put(event.request, responseToCache);
                });

                console.log("Fetched and cached:", event.request.url);
                return response;
            });
        }),
    );
});