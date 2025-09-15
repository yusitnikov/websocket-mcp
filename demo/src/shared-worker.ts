/// <reference lib="webworker" />

import { DemoMcpServer } from "./mcp-demo.js";
import { log } from "@main/utils.js";

declare const self: SharedWorkerGlobalScope;

// Global MCP server instance - ensures single instance across all tabs
const mcpServer = new DemoMcpServer("ws://localhost:3003");
const connectedPorts: MessagePort[] = [];

// Auto-connect to main MCP server when shared worker starts
async function initializeMcpConnection(): Promise<void> {
    try {
        log("SharedWorker: Auto-connecting to MCP server...");
        await mcpServer.connectToMainServer();
        log("SharedWorker: MCP connection established");
        notifyAllPorts({ type: "mcp-status-change", connected: true });
    } catch (error) {
        log("SharedWorker: MCP connection failed:", error);
        notifyAllPorts({ type: "mcp-status-change", connected: false });
    }
}

// Notify all connected tabs about status changes
function notifyAllPorts(message: any): void {
    connectedPorts.forEach((port) => {
        try {
            port.postMessage(message);
        } catch (error) {
            log("SharedWorker: Error sending message to port:", error);
        }
    });
}

// Handle new connections from tabs
self.onconnect = (event) => {
    const port = event.ports[0];
    connectedPorts.push(port);

    log("SharedWorker: New tab connected, total tabs:", connectedPorts.length);

    // Send current status to the new connection
    const status = mcpServer.getConnectionStatus();
    port.postMessage({ type: "mcp-status-change", connected: status.connected });

    // Handle messages from this tab
    port.addEventListener("message", async (messageEvent) => {
        const { type } = messageEvent.data;

        switch (type) {
            case "get-mcp-status":
                const currentStatus = mcpServer.getConnectionStatus();
                port.postMessage({
                    type: "mcp-status-response",
                    success: true,
                    status: currentStatus,
                });
                break;

            default:
                log("SharedWorker: Unknown message type:", type);
        }
    });

    port.start();
};

// Initialize MCP connection when shared worker starts
initializeMcpConnection().catch(log);
