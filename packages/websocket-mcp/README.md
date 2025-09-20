# WebSocket MCP

Complete MCP proxy system that bridges MCP clients to multiple servers and enables browser-based MCP servers.

## Overview

This package provides both **server** and **frontend** components:

- **Server**: HTTP proxy that connects AI clients to multiple MCP servers via stdio, HTTP, or WebSocket
- **Frontend**: Browser-side transport for creating MCP servers that run in web browsers

**Key Features:**

- Connects AI clients to multiple MCP servers simultaneously through a single proxy
- Accepts browser-based MCP servers via WebSocket connections
- Exposes each server as an HTTP endpoint for easy client access
- Supports stdio (command-line), HTTP, and WebSocket server types
- Provides browser transport with automatic reconnection and error recovery

**Use cases:** Run multiple MCP servers from one proxy, enable browser-based MCP servers, centralize MCP server management.

## Installation

```bash
npm install websocket-mcp
```

# Server Usage (Node.js)

## Quick Start

Choose one of the following methods:

### Option 1: WebSocket Arguments (Browser-based servers)

Pass server definitions as arguments. Each server has a **name** (how AI clients will reference it) and a **WebSocket path** (where browsers connect). You can specify just a name (path defaults to `/{name}`) or provide both name and custom path separated by a colon:

```bash
npx websocket-mcp browser-tools database-ui:/db --port 3003
```

This creates two servers:

1. **browser-tools** server: browsers connect to `ws://localhost:3003/browser-tools`, AI clients access via `http://localhost:3003/browser-tools`
2. **database-ui** server: browsers connect to `ws://localhost:3003/db`, AI clients access via `http://localhost:3003/database-ui`

The server name determines the HTTP endpoint URL that AI clients use to access the server.

**Complete workflow**: After starting the proxy, create browser MCP servers using the frontend transport (see [Frontend Usage](#frontend-usage-browser) below) that connect to these WebSocket endpoints. AI clients can then access the browser servers through the HTTP endpoints.

### Option 2: Config File (All server types)

1. Create `mcp-config.json`:

```json
{
    "servers": [
        {
            "name": "filesystem",
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
        }
    ]
}
```

2. Start the server:

```bash
npx websocket-mcp --config mcp-config.json --port 3003
```

This starts the proxy server, which will:

- Launch the filesystem MCP server as a subprocess
- Create an HTTP endpoint at `http://localhost:3003/filesystem` (using the server name "filesystem")
- Proxy all requests between AI clients and the filesystem server

## Connect AI Clients to Your Servers

The proxy exposes each server (including browser-based ones) as an HTTP endpoint at `http://localhost:3003/{serverName}` using the [streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http) transport protocol. The `{serverName}` part of the URL comes from the "name" field in your configuration or argument.

**Example**: If you started the proxy with `npx websocket-mcp browser-tools` and created a browser MCP server that connected to it, AI clients can access the browser's tools at `http://localhost:3003/browser-tools`.

If your client supports streamable HTTP, connect directly to the endpoint. For example, with **Roo Code**, add this to `.roo/mcp.json` in your project:

```json
{
    "mcpServers": {
        "browser-tools": {
            "type": "streamable-http",
            "url": "http://localhost:3003/browser-tools"
        }
    }
}
```

For clients without streamable HTTP support, use [mcp-remote](https://www.npmjs.com/package/mcp-remote) as a bridge. For example, with **Claude Desktop**, add this to your `claude_desktop_config.json` file:

```json
{
    "mcpServers": {
        "browser-tools": {
            "command": "npx",
            "args": ["mcp-remote", "http://localhost:3003/browser-tools"]
        }
    }
}
```

**Result**: The AI client can now call browser-specific tools like `get_page_info` through the proxy, which routes requests to your browser-based MCP server. This enables AI systems to interact with web content and browser capabilities that traditional command-line servers cannot provide.

## Configuration

### Server Types

#### Stdio Servers

Connect to command-line MCP servers:

```json
{
    "name": "git-tools",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
}
```

#### HTTP Servers

Connect to HTTP-based MCP servers:

```json
{
    "name": "external-api",
    "type": "http",
    "url": "http://localhost:3001"
}
```

#### WebSocket Servers (Browser)

Accept browser-based MCP servers:

```json
{
    "name": "database-ui",
    "type": "websocket",
    "path": "/db"
}
```

### Configuration Properties

- **name**: Server identifier that becomes part of the HTTP endpoint URL (`http://localhost:3003/{name}`) that AI clients use
- **type**: How the proxy connects to the server - "stdio" (command-line), "http" (existing HTTP server), or "websocket" (browser connection)
- **enabled**: Whether this server should be started (optional, defaults to true, set to false to disable)
- **command/args**: For stdio servers - the command and arguments to launch the MCP server process
- **url**: For HTTP servers - the existing HTTP server URL to connect to
- **path**: For WebSocket servers - the WebSocket URL path where browsers should connect (defaults to `/{name}`)

## WebSocket Endpoints

Browser-based MCP servers can connect to WebSocket endpoints:

```javascript
// Browser connects to ws://localhost:3003/db
const ws = new WebSocket("ws://localhost:3003/db");
```

# Frontend Usage (Browser)

Browser-side components for creating MCP servers that run in web browsers and connect to the proxy server.

## Import Path

Import frontend components from the `/frontend` subpath to maintain separation from server components:

```javascript
import { WebSocketClientTransport } from "websocket-mcp/frontend";
```

## Quick Start

Create a browser MCP server that connects to the proxy server you started above:

```javascript
import { WebSocketClientTransport } from "websocket-mcp/frontend";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Create MCP server that provides browser-specific capabilities
const server = new Server({ name: "browser-tools", version: "1.0.0" }, { capabilities: { tools: {} } });

// Add tools that only browsers can provide
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_page_info",
            description: "Get current page title and URL",
            inputSchema: { type: "object", properties: {} },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (params.name === "get_page_info") {
        return {
            content: [{ type: "text", text: `Title: ${document.title}\nURL: ${window.location.href}` }],
        };
    }
    throw new Error(`Unknown tool: ${params.name}`);
});

// Connect to the proxy WebSocket endpoint (matches the server name from Step 1)
const transport = new WebSocketClientTransport({
    url: "ws://localhost:3003/browser-tools",
});

await server.connect(transport);
console.log("Browser MCP server connected - AI clients can now access it at http://localhost:3003/browser-tools");
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

# Further Reading

- [Implementation Details](./IMPLEMENTATION.md) - Architecture and internal workings of both server and frontend components
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs/getting-started/intro)
