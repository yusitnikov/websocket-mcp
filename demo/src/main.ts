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
async function registerServiceWorker(): Promise<void> {
    if ("serviceWorker" in navigator) {
        try {
            swStatus.innerHTML = '<span class="warning">🔄 Registering Service Worker...</span>';
            const registration = await navigator.serviceWorker.register("/src/service-worker.ts");
            log("Service Worker registered:", registration);
            swStatus.innerHTML = '<span class="success">✓ Service Worker registered and active</span>';
        } catch (error) {
            log("Service Worker registration failed:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            swStatus.innerHTML = `<span class="error">✗ Service Worker registration failed: ${errorMessage}</span>`;
        }
    } else {
        swStatus.innerHTML = '<span class="error">✗ Service Worker not supported</span>';
    }
}

swBtn.addEventListener("click", () => {
    registerServiceWorker();
});

// MCP functionality
let mcpStatusInterval: NodeJS.Timeout | null = null;

function updateMcpStatus(): void {
    const status = mcpServer.getConnectionStatus();
    if (status.connected) {
        mcpStatus.innerHTML = '<span class="success">✓ Connected to MCP server</span>';
        mcpConnectBtn.style.display = 'none';
        mcpDisconnectBtn.style.display = 'block';
    } else {
        mcpStatus.innerHTML = '<span class="warning">⚠ Not connected to MCP server (retrying...)</span>';
        mcpConnectBtn.style.display = 'block';
        mcpDisconnectBtn.style.display = 'none';
    }
}

function startMcpStatusMonitoring(): void {
    updateMcpStatus();
    if (mcpStatusInterval) {
        clearInterval(mcpStatusInterval);
    }
    mcpStatusInterval = setInterval(updateMcpStatus, 2000); // Update every 2 seconds
}

async function startMcpConnection(): Promise<void> {
    const wsUrl = "ws://localhost:3003";
    try {
        mcpStatus.innerHTML = '<span class="warning">🔄 Connecting to MCP server...</span>';
        await mcpServer.connectToMainServer(wsUrl);
        log('MCP connection established');
    } catch (error) {
        log('MCP connection failed, will retry automatically:', error);
        // Don't update status here - let the monitoring handle it
    }
}

mcpConnectBtn.addEventListener("click", () => {
    startMcpConnection();
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

// Initialize - auto-start everything
async function initialize(): Promise<void> {
    // Auto-register service worker
    await registerServiceWorker();

    // Start MCP status monitoring
    startMcpStatusMonitoring();

    // Auto-start MCP connection
    await startMcpConnection();
}

initialize();