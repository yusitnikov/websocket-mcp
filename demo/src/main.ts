import { log } from '@main/utils.js';
import { DemoMcpServer } from './mcp-demo.js';

// DOM elements
const swStatus = document.getElementById("sw-status") as HTMLDivElement;
const swBtn = document.getElementById("sw-btn") as HTMLButtonElement;
const mcpStatus = document.getElementById("mcp-status") as HTMLDivElement;
const mcpConnectBtn = document.getElementById("mcp-connect-btn") as HTMLButtonElement;
const mcpDisconnectBtn = document.getElementById("mcp-disconnect-btn") as HTMLButtonElement;

// MCP Server instance
const mcpServer = new DemoMcpServer();

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

// MCP functionality
function updateMcpStatus(): void {
    const status = mcpServer.getConnectionStatus();
    if (status.connected) {
        mcpStatus.innerHTML = '<span class="success">✓ Connected to MCP server</span>';
        mcpConnectBtn.style.display = 'none';
        mcpDisconnectBtn.style.display = 'block';
    } else {
        mcpStatus.innerHTML = '<span class="warning">⚠ Not connected to MCP server</span>';
        mcpConnectBtn.style.display = 'block';
        mcpDisconnectBtn.style.display = 'none';
    }
}

mcpConnectBtn.addEventListener("click", async () => {
    const wsUrl = "ws://localhost:3003"; // Default WebSocket URL for main server
    try {
        mcpStatus.innerHTML = '<span class="warning">🔄 Connecting to MCP server...</span>';
        await mcpServer.connectToMainServer(wsUrl);
        updateMcpStatus();
        log('MCP connection established');
    } catch (error) {
        log('MCP connection failed:', error);
        mcpStatus.innerHTML = `<span class="error">✗ Failed to connect: ${error instanceof Error ? error.message : String(error)}</span>`;
    }
});

mcpDisconnectBtn.addEventListener("click", async () => {
    try {
        await mcpServer.disconnect();
        updateMcpStatus();
        log('MCP disconnected');
    } catch (error) {
        log('MCP disconnect failed:', error);
    }
});

// Initialize
checkServiceWorker();
updateMcpStatus();