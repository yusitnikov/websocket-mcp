import { log } from "@main/utils.js";

// DOM elements
const swStatus = document.getElementById("sw-status") as HTMLDivElement;
const mcpStatus = document.getElementById("mcp-status") as HTMLDivElement;

// SharedWorker functionality
let sharedWorker: SharedWorker | null = null;

function connectSharedWorker() {
    try {
        swStatus.innerHTML = '<span class="warning">🔄 Connecting to Shared Worker...</span>';

        sharedWorker = new SharedWorker("/src/shared-worker.ts", { type: "module" });

        // Listen for messages from shared worker
        sharedWorker.port.addEventListener("message", (event) => {
            log("Message from the shared worker:", event.data);
            const { type, connected, status } = event.data;

            if (type === "mcp-status-change") {
                updateMcpStatusDisplay(connected);
            } else if (type === "mcp-status-response") {
                updateMcpStatusDisplay(status.connected);
            }
        });

        sharedWorker.port.start();

        log("SharedWorker connected");
        swStatus.innerHTML = '<span class="success">✓ SharedWorker connected and active</span>';
    } catch (error) {
        log("SharedWorker connection failed:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        swStatus.innerHTML = `<span class="error">✗ SharedWorker connection failed: ${errorMessage}</span>`;
    }
}

// MCP functionality
let mcpStatusInterval: NodeJS.Timeout | null = null;

function updateMcpStatusDisplay(connected: boolean): void {
    if (connected) {
        mcpStatus.innerHTML = '<span class="success">✓ Connected to MCP server</span>';
    } else {
        mcpStatus.innerHTML = '<span class="warning">⚠ Not connected to MCP server</span>';
    }
}

function updateMcpStatus() {
    // Get status from shared worker
    if (sharedWorker) {
        sharedWorker.port.postMessage({ type: "get-mcp-status" });
    } else {
        mcpStatus.innerHTML = '<span class="error">✗ SharedWorker not available</span>';
    }
}

function startMcpStatusMonitoring(): void {
    updateMcpStatus();
    if (mcpStatusInterval) {
        clearInterval(mcpStatusInterval);
    }
    mcpStatusInterval = setInterval(updateMcpStatus, 2000); // Update every 2 seconds
}

// SharedWorker auto-manages connection, no manual buttons needed

// Initialize - auto-start everything
function initialize() {
    // Auto-connect shared worker (which will auto-connect MCP)
    connectSharedWorker();

    // Start MCP status monitoring
    startMcpStatusMonitoring();
}

initialize();
