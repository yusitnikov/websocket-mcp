# WebSocket MCP

A system for creating MCP (Model Context Protocol) servers that communicate with browser tabs via WebSocket.

## Packages

### connection-broker

Generic, reusable WebSocket broker for routing messages between clients. Completely domain-agnostic — knows nothing about browsers, MCP, or any specific use case.

[📖 Documentation](packages/connection-broker/README.md)

### browser-automation

Browser automation built on the connection broker. Provides an MCP server and a browser tab client, enabling Claude (or any MCP client) to control browser tabs remotely.

[📖 Documentation](packages/browser-automation/README.md)

## Quick Start

**1. Start the connection broker:**

```bash
npm run broker
```

**2. Start the demo app and open browser tabs:**

```bash
npm run demo
# Navigate to http://localhost:4200 in one or more tabs
```

**3. Configure the MCP server in Claude Desktop:**

```json
{
    "mcpServers": {
        "browser": {
            "command": "npx",
            "args": ["tsx", "/absolute/path/to/packages/browser-automation/bin/mcp-server.ts", "--broker", "ws://localhost:3004", "--stdio"]
        }
    }
}
```

**4. Use the MCP tools in Claude:**

- `list_tabs` — List all connected browser tabs
- `execute_js` — Execute JavaScript in a specific tab
