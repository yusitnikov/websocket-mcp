import _ from "lodash";
import axios, { AxiosResponse } from "axios";

// Types
interface ApiPost {
    userId: number;
    id: number;
    title: string;
    body: string;
}

interface LodashResults {
    original: number[];
    chunked: number[][];
    shuffled: number[];
    sum: number;
    random: number;
}

// DOM elements
const lodashBtn = document.getElementById("lodash-btn") as HTMLButtonElement;
const lodashResult = document.getElementById("lodash-result") as HTMLDivElement;
const apiBtn = document.getElementById("api-btn") as HTMLButtonElement;
const apiResult = document.getElementById("api-result") as HTMLDivElement;
const swStatus = document.getElementById("sw-status") as HTMLDivElement;
const swBtn = document.getElementById("sw-btn") as HTMLButtonElement;

// Lodash demo
lodashBtn.addEventListener("click", () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Demonstrate various lodash functions
    const chunked = _.chunk(numbers, 3);
    const shuffled = _.shuffle(numbers);
    const sum = _.sum(numbers);
    const random = _.random(1, 100);

    const results: LodashResults = {
        original: numbers,
        chunked: chunked,
        shuffled: shuffled,
        sum: sum,
        random: random,
    };

    lodashResult.innerHTML = `
        <h3>Lodash Results:</h3>
        <pre>${JSON.stringify(results, null, 2)}</pre>
    `;
});

// Axios demo
apiBtn.addEventListener("click", async () => {
    try {
        apiResult.innerHTML = '<div class="loading">Loading...</div>';

        // Using JSONPlaceholder API for demo
        const response: AxiosResponse<ApiPost> = await axios.get("https://jsonplaceholder.typicode.com/posts/1");

        apiResult.innerHTML = `
            <h3>API Response:</h3>
            <div class="api-data">
                <p><strong>Title:</strong> ${response.data.title}</p>
                <p><strong>Body:</strong> ${response.data.body}</p>
                <p><strong>User ID:</strong> ${response.data.userId}</p>
                <p><strong>Status:</strong> ${response.status}</p>
            </div>
        `;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        apiResult.innerHTML = `
            <div class="error">
                <h3>Error:</h3>
                <p>${errorMessage}</p>
            </div>
        `;
    }
});

// Service Worker functionality
function checkServiceWorker(): void {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((registration: ServiceWorkerRegistration | undefined) => {
            if (registration) {
                swStatus.innerHTML = '<span class="success">✓ Service Worker is registered and active</span>';
            } else {
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
