# WebSocket MCP

A system for creating MCP (Model Context Protocol) servers that run in web browsers and connect to AI clients through a proxy server.

## Packages

### websocket-mcp

Complete MCP proxy system that bridges AI clients to multiple MCP servers and enables browser-based MCP servers.

```bash
npm install websocket-mcp
```

[📖 Documentation](packages/websocket-mcp/README.md)

### tab-sync

Library for coordinating browser tabs using SharedWorkers.

```bash
npm install tab-sync
```

[📖 Documentation](packages/tab-sync/README.md)

## Quick Start

1. **Start the proxy server:**

```bash
npx websocket-mcp browser-tools --port 3003
```

2. **Create a browser MCP server:**

```javascript
import { WebSocketClientTransport } from "websocket-mcp/frontend";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({ name: "browser-tools", version: "1.0.0" }, { capabilities: { tools: {} } });

const transport = new WebSocketClientTransport({
    url: "ws://localhost:3003/browser-tools",
});

await server.connect(transport);
```

3. **Connect AI clients to `http://localhost:3003/browser-tools`**

This enables AI systems to access browser-specific capabilities that traditional command-line MCP servers cannot provide.
