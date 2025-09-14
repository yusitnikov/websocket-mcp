import _ from 'lodash';
import axios from 'axios';

// DOM elements
const lodashBtn = document.getElementById('lodash-btn');
const lodashResult = document.getElementById('lodash-result');
const apiBtn = document.getElementById('api-btn');
const apiResult = document.getElementById('api-result');
const swStatus = document.getElementById('sw-status');
const swBtn = document.getElementById('sw-btn');

// Lodash demo
lodashBtn.addEventListener('click', () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Demonstrate various lodash functions
    const chunked = _.chunk(numbers, 3);
    const shuffled = _.shuffle(numbers);
    const sum = _.sum(numbers);
    const random = _.random(1, 100);

    const results = {
        original: numbers,
        chunked: chunked,
        shuffled: shuffled,
        sum: sum,
        random: random
    };

    lodashResult.innerHTML = `
        <h3>Lodash Results:</h3>
        <pre>${JSON.stringify(results, null, 2)}</pre>
    `;
});

// Axios demo
apiBtn.addEventListener('click', async () => {
    try {
        apiResult.innerHTML = '<div class="loading">Loading...</div>';

        // Using JSONPlaceholder API for demo
        const response = await axios.get('https://jsonplaceholder.typicode.com/posts/1');

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
        apiResult.innerHTML = `
            <div class="error">
                <h3>Error:</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
});

// Service Worker functionality
function checkServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => {
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

swBtn.addEventListener('click', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/src/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered:', registration);
                swStatus.innerHTML = '<span class="success">✓ Service Worker registered successfully!</span>';
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
                swStatus.innerHTML = '<span class="error">✗ Service Worker registration failed</span>';
            });
    }
});

// Initialize
checkServiceWorker();