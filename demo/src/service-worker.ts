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
    // Skip non-GET requests and external APIs
    if (event.request.method !== "GET" || event.request.url.includes("jsonplaceholder.typicode.com")) {
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

// Message event - handle messages from main thread
self.addEventListener("message", (event: ExtendableMessageEvent) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

// Push notifications (if supported)
self.addEventListener("push", (event: PushEvent) => {
    console.log("Push message received:", event);

    const options: NotificationOptions = {
        body: event.data ? event.data.text() : "Default push message",
        icon: "/icon-192x192.png",
        badge: "/icon-72x72.png",
        data: {
            dateOfArrival: Date.now(),
            primaryKey: "1",
        },
    };

    event.waitUntil(self.registration.showNotification("Demo App", options));
});

// Notification click handling
self.addEventListener("notificationclick", (event: NotificationEvent) => {
    console.log("Notification clicked:", event);

    event.notification.close();

    event.waitUntil(self.clients.openWindow("/"));
});
