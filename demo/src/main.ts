import { log } from '@main/utils.js';

// DOM elements
const swStatus = document.getElementById("sw-status") as HTMLDivElement;
const swBtn = document.getElementById("sw-btn") as HTMLButtonElement;

// Service Worker functionality
function checkServiceWorker(): void {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((registration: ServiceWorkerRegistration | undefined) => {
            if (registration) {
                log('Service Worker found:', registration);
                swStatus.innerHTML = '<span class="success">✓ Service Worker is registered and active</span>';
            } else {
                log('Service Worker not registered');
                swStatus.innerHTML = '<span class="warning">⚠ Service Worker not registered</span>';
            }
        });
    } else {
        swStatus.innerHTML = '<span class="error">✗ Service Worker not supported</span>';
    }
}

swBtn.addEventListener("click", () => {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
            .register("/src/service-worker.ts")
            .then((registration: ServiceWorkerRegistration) => {
                console.log("Service Worker registered:", registration);
                swStatus.innerHTML = '<span class="success">✓ Service Worker registered successfully!</span>';
            })
            .catch((error: unknown) => {
                console.error("Service Worker registration failed:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                swStatus.innerHTML = `<span class="error">✗ Service Worker registration failed: ${errorMessage}</span>`;
            });
    }
});

// Initialize
checkServiceWorker();