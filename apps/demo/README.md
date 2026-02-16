# Browser Automation Demo

This demo application showcases browser automation via the generic connection broker and MCP.

## What This Demo Does

Each browser tab:
1. Connects to the connection broker at `ws://localhost:3004`
2. Registers with role `"browser-tab"`
3. Automatically reconnects if disconnected (exponential backoff)
4. Listens for automation commands from the MCP server
5. Executes JavaScript (including async/await code) and returns results

## Setup

### 1. Start the Connection Broker

```bash
cd packages/connection-broker
npm run dev
```

Or from the root:

```bash
npx tsx packages/connection-broker/bin/broker.ts --port 3004
```

You should see:
```
Connection broker running on port 3004
```

### 2. Start the Demo App

```bash
npm run demo
```

The app will start at http://localhost:4200

### 3. Open Multiple Browser Tabs

Navigate to http://localhost:4200 in multiple browser tabs.

Each tab will:
- Connect to the broker
- Show "✓ Connected to broker"
- Display its unique connection ID

### 4. Start the MCP Server

```bash
cd packages/browser-automation
npm run dev -- --broker ws://localhost:3004 --stdio
```

Or from the root:

```bash
npx tsx packages/browser-automation/bin/mcp-server.ts --broker ws://localhost:3004 --stdio
```

### 5. Configure Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": [
        "tsx",
        "/absolute/path/to/packages/browser-automation/bin/mcp-server.ts",
        "--broker",
        "ws://localhost:3004",
        "--stdio"
      ]
    }
  }
}
```

Replace `/absolute/path/to` with the actual path to your project.

Restart Claude Desktop.

## Testing the Setup

### Test 1: List Browser Tabs

In Claude:
```
You: Use the list_tabs tool to see all browser tabs
```

Claude should return an array of tab IDs:
```json
["a1b2c3d4-e5f6-7890-abcd-ef1234567890", "b2c3d4e5-f6a7-8901-bcde-f12345678901"]
```

### Test 2: Execute JavaScript

Get the page title:
```
You: Use execute_js to get the title of the first tab
```

Claude will use `execute_js` with:
- `tabId`: (first ID from the list)
- `code`: `document.title`

Result:
```
"Browser Automation Demo"
```

### Test 3: Manipulate the DOM

Change the background color:
```
You: Use execute_js to change the background color to light blue in the first tab
```

Claude will execute:
```javascript
document.body.style.background = 'lightblue'
```

The tab's background will turn light blue.

### Test 4: Extract Data

Get all links on the page:
```
You: Use execute_js to get all links on the page
```

Claude will execute:
```javascript
Array.from(document.querySelectorAll('a')).map(a => ({
  text: a.textContent,
  href: a.href
}))
```

## Architecture

```
┌──────────────────┐
│  Claude Desktop  │
└────────┬─────────┘
         │ stdio
         ↓
┌─────────────────────┐
│  MCP Server         │
│  (Node.js)          │
│  Connects on-demand │
│  per tool call      │
└────────┬────────────┘
         │ WebSocket (ephemeral)
         ↓
┌─────────────────────┐
│  Connection Broker  │
│  (Generic, Reusable)│
│  Port: 3004         │
│  Logs: broker logs  │
└────────┬────────────┘
         │ WebSocket (persistent, auto-reconnect)
         ↓
    ┌────┴───┬────┬────┐
    ↓        ↓    ↓    ↓
┌──────┐ ┌──────┐ ┌──────┐
│Tab 1 │ │Tab 2 │ │Tab 3 │
│Role: │ │Role: │ │Role: │
│browser│ │browser│ │browser│
│-tab  │ │-tab  │ │-tab  │
└──────┘ └──────┘ └──────┘
```

## Key Features

### Generic Connection Broker

The broker is **completely reusable** for any scenario:
- Role-agnostic (roles are just strings)
- Payload-agnostic (messages are opaque)
- No browser-specific code
- No MCP-specific code

### On-Demand Connections

MCP server connects to broker only when needed:
1. Tool is called (list_tabs or execute_js)
2. MCP server connects to broker
3. Opens channel to tab (for execute_js)
4. Sends command, waits for response
5. Closes channel and disconnects from broker
6. Returns result to Claude

This prevents stale connections and ensures reliability.

### Auto-Reconnecting Browser Tabs

Browser tabs maintain persistent connections:
- Connect on page load
- Auto-reconnect if disconnected
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, up to 30s
- Reconnect after code changes (just refresh the page)

### Separation of Concerns

- **connection-broker**: Generic, reusable for any use case
- **browser-automation**: Specific implementation for browser control
- **demo**: Example usage in a browser application

## Troubleshooting

### "Connection failed" in Browser

- Ensure connection broker is running on port 3004
- Check browser console for error messages
- Verify WebSocket URL: `ws://localhost:3004`

### "No browser tabs found" in Claude

- Ensure at least one browser tab is open at http://localhost:4200
- Check that tabs show "✓ Connected to broker"
- Verify MCP server is connected to broker (check broker console logs)

### MCP Server Not Showing in Claude

- Verify Claude Desktop config has the correct absolute path
- Restart Claude Desktop after config changes
- Check Claude Desktop logs for errors

### "Timeout" Errors

- JavaScript execution takes > 30 seconds
- Check browser console for errors
- Simplify the JavaScript code

## Example Commands for Claude

**Get window dimensions:**
```javascript
({
  width: window.innerWidth,
  height: window.innerHeight
})
```

**Get all images:**
```javascript
Array.from(document.querySelectorAll('img')).map(img => ({
  src: img.src,
  alt: img.alt
}))
```

**Click a button:**
```javascript
document.querySelector('#myButton')?.click()
'Button clicked'
```

**Fill a form:**
```javascript
document.querySelector('#email').value = 'test@example.com'
'Email filled'
```

**Navigate to a new page:**
```javascript
window.location.href = 'https://example.com'
'Navigating...'
```

**Get cookies:**
```javascript
document.cookie
```

**Async operation (fetch API):**
```javascript
(async () => {
  const response = await fetch('https://api.example.com/data')
  const data = await response.json()
  return data
})()
```

**Async with timeout:**
```javascript
(async () => {
  await new Promise(r => setTimeout(r, 2000))
  return 'Done after 2 seconds'
})()
```

## Security Warning

⚠️ This demo executes arbitrary JavaScript in your browser. Only use in a controlled environment:

- Development only
- Localhost only
- Trusted code only
- No sensitive data in browser tabs

## License

MIT