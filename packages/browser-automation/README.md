# @sitnikov/browser-automation

Browser automation via MCP using the generic connection broker.

## Overview

This package provides browser automation capabilities through MCP (Model Context Protocol) by leveraging the generic connection broker. It enables Claude (or any MCP client) to control browser tabs remotely.

### Components

1. **BrowserTabClient** - Browser-side client that connects to the broker and handles automation commands
2. **BrowserMcpServer** - MCP server that provides tools for listing tabs and executing JavaScript

## Installation

```bash
npm install @sitnikov/browser-automation
```

## Usage

### In the Browser

```typescript
import { BrowserTabClient } from '@sitnikov/browser-automation/tab-client'

const client = new BrowserTabClient('ws://localhost:3004')

// Optional: Listen for connection events
client.onConnected = (id) => {
  console.log('Connected to broker with ID:', id)
}

client.onDisconnected = () => {
  console.log('Disconnected from broker')
}

// Connect to the broker
await client.connect()

// The client now automatically:
// - Registers with role "browser-tab"
// - Reconnects automatically if disconnected (with exponential backoff)
// - Listens for incoming channels from MCP server
// - Handles execute_js commands (including async code)
// - Sends results back to the MCP server

// To manually disconnect (stops auto-reconnect):
// client.disconnect()
```

### Starting the MCP Server

From the command line:

```bash
browser-mcp-server --broker ws://localhost:3004 --stdio
```

Or programmatically:

```typescript
import { BrowserMcpServer } from '@sitnikov/browser-automation/mcp-server'

const server = new BrowserMcpServer('/path/to/logs/mcp-server.log')
await server.start('ws://localhost:3004', 'stdio')
```

**Note:** The MCP server connects to the broker **on-demand** for each tool call and disconnects immediately after. This prevents stale connections and ensures reliability.

### Configuring Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "browser": {
      "command": "browser-mcp-server",
      "args": ["--broker", "ws://localhost:3004", "--stdio"]
    }
  }
}
```

## MCP Tools

The MCP server provides the following tools:

### `list_tabs`

Lists all connected browser tabs.

**Input Schema:**
```json
{}
```

**Output:**
```json
["tab-uuid-1", "tab-uuid-2", "tab-uuid-3"]
```

**Example:**
```
Claude: Use the list_tabs tool
→ Returns: ["a1b2c3d4-...", "e5f6g7h8-..."]
```

### `execute_js`

Executes JavaScript code in a specific browser tab.

**Input Schema:**
```json
{
  "tabId": "string",  // ID from list_tabs
  "code": "string"    // JavaScript code to execute
}
```

**Output:**
```json
"result of the execution"
```

**Example:**
```
Claude: Use execute_js with tabId="a1b2c3d4-..." and code="document.title"
→ Returns: "My Page Title"
```

**Features:**
- ✅ Supports async/await code (promises are automatically awaited)
- ✅ Returns serialized results (JSON for objects, string for primitives)
- ✅ Handles errors and reports them back to MCP
- ✅ 30-second timeout for long-running operations
- ✅ Handles `undefined` return values

**Advanced Examples:**

Get all links on a page:
```javascript
Array.from(document.querySelectorAll('a')).map(a => ({
  text: a.textContent,
  href: a.href
}))
```

Fill out a form:
```javascript
document.querySelector('#email').value = 'test@example.com'
document.querySelector('#password').value = 'secret'
document.querySelector('#submit').click()
'Form submitted'
```

Extract data:
```javascript
({
  title: document.title,
  url: window.location.href,
  headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent)
})
```

Async operation:
```javascript
(async () => {
  const response = await fetch('/api/data')
  const data = await response.json()
  return data
})()
```

## How It Works

```
┌──────────────────┐
│  Claude Desktop  │
└────────┬─────────┘
         │ stdio
         ↓
┌─────────────────────┐
│  MCP Server         │
│  (Node.js)          │
│  - list_tabs        │
│  - execute_js       │
└────────┬────────────┘
         │ WebSocket
         ↓
┌─────────────────────┐
│  Connection Broker  │
│  (Generic)          │
└────────┬────────────┘
         │ WebSocket (multiple connections)
         ↓
    ┌────┴───┬────┬────┐
    ↓        ↓    ↓    ↓
┌──────┐ ┌──────┐ ┌──────┐
│Tab 1 │ │Tab 2 │ │Tab 3 │
│ (Browser) (Browser) (Browser)
└──────┘ └──────┘ └──────┘
```

1. Browser tabs connect to the broker with role `"browser-tab"` (persistent connection with auto-reconnect)
2. When Claude calls `list_tabs`, the MCP server:
   - Connects to the broker with role `"mcp-server"`
   - Queries the broker for all connections with role `"browser-tab"`
   - Disconnects from the broker
   - Returns the list to Claude
3. When Claude calls `execute_js`, the MCP server:
   - Connects to the broker with role `"mcp-server"`
   - Opens a channel to the specific tab
   - Sends the JavaScript code
   - Waits for the result (with 30s timeout)
   - Closes the channel
   - Disconnects from the broker
   - Returns the result to Claude

## Security Considerations

⚠️ **WARNING**: This package executes arbitrary JavaScript in browser tabs. Only use it in controlled environments:

- **Development only**: Not for production use
- **Trusted code only**: Only execute code you trust
- **Local network**: Keep the broker on localhost or secure network
- **No authentication**: The broker has no built-in authentication

### Recommendations

- Run the broker on `localhost` only
- Use firewall rules to prevent external access
- Only connect browser tabs you control
- Validate and sanitize any user input before executing

## Example: Complete Setup

### Step 1: Start the Connection Broker

```bash
connection-broker --port 3004
```

### Step 2: Open Browser Tabs

Create an HTML page:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Browser Automation Demo</title>
</head>
<body>
  <h1>Browser Automation Demo</h1>
  <p id="status">Connecting...</p>

  <script type="module">
    import { BrowserTabClient } from '@sitnikov/browser-automation/tab-client'

    const client = new BrowserTabClient('ws://localhost:3004')

    client.onConnected = (id) => {
      document.getElementById('status').textContent = `Connected: ${id}`
    }

    await client.connect()
  </script>
</body>
</html>
```

Open this page in multiple tabs.

### Step 3: Start the MCP Server

```bash
browser-mcp-server --broker ws://localhost:3004 --stdio
```

Add to Claude Desktop config and restart.

### Step 4: Control from Claude

```
You: List all browser tabs

Claude: [Uses list_tabs tool]
→ ["a1b2c3d4-...", "e5f6g7h8-..."]

You: Get the title of the first tab

Claude: [Uses execute_js with code="document.title"]
→ "Browser Automation Demo"

You: Change the background color to red in all tabs

Claude: [Uses execute_js for each tab with code="document.body.style.background='red'"]
→ All tabs now have red background
```

## License

MIT
