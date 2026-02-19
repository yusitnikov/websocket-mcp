# Browser Automation via MCP

A system that enables Claude (or any MCP client) to list browser tabs and execute JavaScript in them, via a Chrome extension and a generic WebSocket connection broker.

## Components

### connection-broker

Generic, reusable WebSocket broker for routing messages between clients. Completely domain-agnostic — knows nothing about browsers, MCP, or any specific use case.

[📖 Documentation](packages/connection-broker/README.md)

### browser-automation

Browser automation built on the connection broker. Provides the Chrome extension client, the MCP server, and (for cooperating sites) a browser tab client.

[📖 Documentation](packages/browser-automation/README.md)

### browser-extension (`apps/browser-extension/`)

Chrome extension (Manifest V3) that connects to the broker via an offscreen document and executes JavaScript in tabs via `chrome.scripting.executeScript`. This is the primary browser-side component — no library embedding required on target pages.

## Quick Start

**1. Install the Chrome extension** from `apps/browser-extension/` (load unpacked in Chrome).

**2. Start the connection broker:**

```bash
npm run broker
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

- `list_tabs` — List all open browser tabs (title, URL, Chrome tab ID)
- `execute_js` — Execute JavaScript in a specific tab

## How It Works

The extension's offscreen document maintains a persistent WebSocket connection to the broker. When Claude calls `execute_js`, the MCP server sends a command through the broker to the extension, which calls `chrome.scripting.executeScript` in the target tab and returns the result (including full error details with stack traces).

See `ARCHITECTURE.md` for the full communication flow and `SECURITY.md` for the security model.
