# @sitnikov/browser-automation

Browser automation via MCP using the generic connection broker.

## Overview

This package provides browser automation capabilities through MCP (Model Context Protocol). It enables Claude (or any MCP client) to list all open browser tabs and execute JavaScript in them.

The primary mechanism is via a **Chrome extension** (`apps/browser-extension/`) — no library needs to be embedded in target pages. A secondary cooperating-site path (`BrowserTabClient`) exists for pages that opt in explicitly.

### Components

**Primary (Chrome extension path):**

1. **ExtensionTabClient** (`extension-tab-client`) — runs in the extension's offscreen document; registers as `"browser-extension"` on the broker; delegates commands to service worker callbacks
2. **ExtensionAutomationClient** (`extension-automation-client`) — MCP-server-side client; talks to the extension via broker on-demand
3. **BrowserMcpServer** (`mcp-server`) — thin MCP adapter delegating to `ExtensionAutomationClient`

**Secondary (cooperating-site path):**

4. **BrowserTabClient** (`tab-client`) — browser pages embed this and connect to the broker directly
5. **BrowserAutomationClient** (`automation-client`) — talks to `BrowserTabClient`-connected tabs via broker

## Installation

```bash
npm install @sitnikov/browser-automation
```

## Usage

### Configuring Claude Desktop

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

### In Cooperating Browser Pages (secondary)

```typescript
import { BrowserTabClient } from "@sitnikov/browser-automation/tab-client";

const client = new BrowserTabClient("ws://localhost:3004");
client.onConnected = (id) => console.log("Connected to broker with ID:", id);
await client.connect();
// Automatically registers as "browser-tab" and handles incoming commands
```

## MCP Tools

### `list_tabs`

Lists all open browser tabs.

**Output:** One tab per line — `[tabId] title\n        url`

**Example:**

```
[359593373] This SM tab! – SudokuMaker
        https://sudokumaker.app/?puzzle=...
[359586359] WhatsApp
        https://web.whatsapp.com/
```

### `execute_js`

Executes JavaScript code in a specific browser tab.

**Input:** `tabId` (Chrome tab ID as string, from `list_tabs`), `code` (JavaScript string)

**Output:** JSON-serialized return value, or an error with full stack trace.

**Features:**

- ✅ Works on any page — no library embedding needed
- ✅ Supports async/await (wrap in an async IIFE: `(async () => { ...; return value; })()`)
- ✅ Returns serialized results (JSON for objects, `"undefined"` for void)
- ✅ Full error propagation: `name`, `message`, and `stack` from thrown `Error` objects
- ✅ 30-second timeout
- ⚠️ Pages with strict `script-src` CSP (e.g., WhatsApp) block `eval()` — returns `EvalError`

**Examples:**

```
// Sync
document.title
```

```
// Async
(async () => {
    const response = await fetch("/api/data");
    return await response.json();
})()
```

```
// DOM manipulation
document.querySelector("#email").value = "test@example.com";
document.querySelector("#submit").click();
"submitted"
```

## How It Works

```
Claude Desktop
    │ stdio
    ▼
BrowserMcpServer
    │ WebSocket (ephemeral per call)
    ▼
Connection Broker
    │ WebSocket (persistent, via offscreen document)
    ▼
Chrome Extension
    ├── offscreen.ts (ExtensionTabClient, broker WebSocket)
    │       │ chrome.runtime.sendMessage
    └── service-worker.ts
            │ chrome.scripting.executeScript({ world: "MAIN" })
            ▼
        Any browser tab
```

1. Extension's offscreen document maintains a persistent broker connection with role `"browser-extension"`
2. When Claude calls `list_tabs`, the MCP server connects to the broker, finds the extension, opens a channel, sends `{action: "list_tabs"}`, and receives the tab list from `chrome.tabs.query`
3. When Claude calls `execute_js`, the MCP server sends `{action: "execute_js", tabId, code}`. The extension's service worker calls `chrome.scripting.executeScript` in the target tab's main world. The result (or structured error) is returned through the broker.

## Security Considerations

⚠️ **WARNING**: This package executes arbitrary JavaScript in browser tabs with full access to page context (cookies, localStorage, DOM). Only use in controlled environments.

- **Development only** — no authentication or authorization on the broker
- **Localhost only** — keep the broker on localhost and use firewall rules
- **No user approval** — any MCP client with broker access can control any tab

See `SECURITY.md` in the project root for the full threat model and planned security mechanisms (session codes, HMAC authentication).

## License

MIT
