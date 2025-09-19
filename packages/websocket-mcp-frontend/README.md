# WebSocket MCP Frontend

Browser-side MCP transport that enables browser-based MCP servers to connect to an MCP proxy server via WebSocket.

## Installation

```bash
npm install @websocket-mcp/frontend
```

## Quick Start

```javascript
import { WebSocketClientTransport } from "@websocket-mcp/frontend";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Create your MCP server
const server = new Server({ name: "my-browser-server", version: "1.0.0" }, { capabilities: { tools: {} } });

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_page_title",
            description: "Get the current page title",
            inputSchema: { type: "object", properties: {} },
        },
    ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (params.name === "get_page_title") {
        return {
            content: [{ type: "text", text: document.title }],
        };
    }
    throw new Error(`Unknown tool: ${params.name}`);
});

// Connect to the proxy server
const transport = new WebSocketClientTransport({
    url: "ws://localhost:3003/my-server",
});

await server.connect(transport);
```

> **Important**: Only one WebSocket connection should be made to each server path from the browser. For multi-tab applications, consider implementing the MCP server in a SharedWorker to share a single connection across all tabs.

## Configuration Options

```javascript
const transport = new WebSocketClientTransport({
    url: "ws://localhost:3003/my-server", // Required: WebSocket URL to proxy server
    reconnectDelay: 1000, // Initial delay before reconnection attempt (default: 1000ms)
    maxReconnectDelay: 3000, // Maximum delay between reconnection attempts (default: 3000ms)
    connectionTimeout: 1000, // Timeout for initial connection (default: 1000ms)
});
```

## Connection Management

The transport automatically handles:

- **Connection establishment** with configurable timeout
- **Automatic reconnection** with exponential backoff
- **Error recovery** from network issues
- **Clean shutdown** when explicitly closed

### Connection Status

```javascript
// Check if connected
if (transport.isConnected) {
    console.log("Connected to proxy server");
}
```

## Further Reading

- [Implementation Details](./IMPLEMENTATION.md) - Transport internals and architecture
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs/getting-started/intro)
