# Architecture Overview

This project implements a **generic connection broker** system that enables browser automation via MCP.

## Core Design Principle

**Build generic infrastructure, not browser-specific solutions.**

The connection broker is completely reusable for ANY scenario where two parties can't reach each other directly - not just browsers or MCP.

## Package Structure

### 1. `packages/connection-broker/` - Generic Connection Broker

**Purpose**: Reusable WebSocket broker that routes messages between clients.

**Responsibilities**:

- Assign unique IDs to connections
- Group connections by role (arbitrary strings)
- Create ephemeral channels between connections
- Route messages through channels
- **DOES NOT** know about browsers, tabs, MCP, or any specific use case

**Exports**:

- `ConnectionBroker` - Server implementation
- `BrokerClient` - Client SDK
- `BrokerClientLogger` - Logger interface accepted by `BrokerClient`
- Protocol types

**Example usage beyond browsers**:

- Chat servers routing messages between users
- Microservices discovering and calling each other
- IoT devices communicating through a central hub
- Remote procedure call systems

### 2. `packages/browser-automation/` - Browser-Specific Implementation

**Purpose**: Browser automation built on top of the generic broker.

**Responsibilities**:

- `ExtensionTabClient` - Runs in the extension's offscreen document; registers as `"browser-extension"`, handles broker commands by delegating to service worker callbacks
- `ExtensionAutomationClient` - MCP-server-side client; talks to the extension via broker; connects on-demand and disconnects after each operation
- `BrowserMcpServer` - Thin MCP adapter; delegates to `ExtensionAutomationClient` for `list_tabs`, `execute_js`, and `initiate_session`

**Exports**:

- `@sitnikov/browser-automation/extension-tab-client` - For the extension's offscreen document
- `@sitnikov/browser-automation/extension-automation-client` - MCP-server-side client for the extension protocol
- `@sitnikov/browser-automation/mcp-server` - For MCP server

### 3. `apps/browser-extension/` - Chrome Extension

**Purpose**: Primary browser-side component. Connects to the broker and executes JS in tabs via `chrome.scripting`.

**Architecture (Manifest V3)**:

- `offscreen/offscreen.ts` - Holds the persistent broker WebSocket via `ExtensionTabClient`; bridges broker commands to service worker; owns the approval state machine
- `background/service-worker.ts` - Handles `chrome.tabs.query` (list tabs), `chrome.scripting.executeScript` (execute JS), and approval tab management; relays messages between all extension contexts
- `approval/approval.ts` + `approval/approval.html` - Shown to the user when a session is initiated; polls offscreen for state, shows session code, lets user approve or reject
- `popup/` - Shows broker connection status
- `protocol.ts` - Typed chrome runtime message contracts for all inter-context IPC (replaces untyped `types.ts`)

**Why offscreen document**: Manifest V3 service workers are terminated after ~30s of inactivity, which would kill any WebSocket. An offscreen document maintains the persistent WebSocket connection and stays alive independently of the service worker lifecycle.

### 4. `apps/demo/` - Demo Application

**Purpose**: Example browser application using `BrowserTabClient` (cooperating-site model).

Shows how to:

- Connect to the broker from a browser page
- Handle automation commands
- Display connection status

## Communication Flow

```
┌──────────────────────┐
│  Claude Desktop      │  External MCP client
└──────────┬───────────┘
           │ stdio
           ↓
┌────────────────────────────────────┐
│  BrowserMcpServer                  │  Implements list_tabs, execute_js
│  (Node.js process)                 │  Connects on-demand per tool call
│                                    │
│  Uses: ExtensionAutomationClient   │
└──────────┬─────────────────────────┘
           │ WebSocket (ephemeral, per call)
           ↓
┌─────────────────────────────────┐
│  ConnectionBroker               │  Generic, reusable broker
│  (WebSocket server)             │
│  - Role-agnostic                │
│  - Payload-agnostic             │
└──────────┬──────────────────────┘
           │ WebSocket (persistent, via offscreen document)
           ↓
┌──────────────────────────────────────────────┐
│  Chrome Extension                            │
│                                              │
│  offscreen.ts ─── ExtensionTabClient         │
│       │           role: "browser-extension"  │
│       │ chrome.runtime.sendMessage           │
│       ↓                                      │
│  service-worker.ts                           │
│       │ chrome.tabs.query                    │
│       │ chrome.scripting.executeScript       │
│       ↓                    { world: "MAIN" } │
│  Any browser tab (no library needed)         │
└──────────────────────────────────────────────┘
```

## Protocol Layers

### Layer 1: Generic Broker Protocol

All messages include `id` (auto-increment integer) and optionally `replyTo` (for responses).

**Role-based discovery:**

```
Client → Broker: {type: "list_by_role", id: 1, role: "browser-tab"}
Broker → Client: {type: "connections", id: 2, replyTo: 1, ids: ["uuid-1", "uuid-2", "uuid-3"]}
```

**Channel-based communication:**

```
Client A → Broker: {type: "open", id: 3, targetId: "uuid-2"}
Broker → Client B: {type: "incoming_channel", id: 4, from: "uuid-a", channelId: "chan-1"}
Broker → Client A: {type: "channel_opened", id: 5, replyTo: 3, channelId: "chan-1", targetId: "uuid-2"}

Client A → Broker: {type: "message", id: 6, channelId: "chan-1", payload: {...}}
Broker → Client B: {type: "channel_message", id: 7, channelId: "chan-1", payload: {...}}
Broker → Client A: {type: "channel_message_sent", id: 8, replyTo: 6, channelId: "chan-1"}

Client A → Broker: {type: "close", id: 9, channelId: "chan-1"}
Broker → Client B: {type: "channel_closed_notification", id: 10, channelId: "chan-1"}
Broker → Client A: {type: "channel_closed", id: 11, replyTo: 9, channelId: "chan-1"}
```

**Key insights**:

- The broker doesn't interpret the payload - it's completely opaque
- Every operation gets explicit success or failure response (via `replyTo`)
- Unsolicited notifications (incoming_channel, channel_message, channel_closed_notification) have no `replyTo`

### Layer 2: Extension Automation Protocol (primary)

Message types and response shapes are defined in `packages/browser-automation/src/extension-tab-client/protocol.ts`.

**When MCP server calls `execute_js` (extension path):**

1. MCP server connects to broker with role `"mcp-server"`, using the `extensionConnectionId` from `initiate_session`
2. Opens channel directly to that extension ID (no `list_by_role` re-discovery)
3. Sends: `{type: "execute_js", sessionToken: "...", tabId: 123, code: "document.title"}`
4. `ExtensionTabClient` validates `sessionToken`; rejects if not in the approved set
5. Extension offscreen document relays command to service worker via `chrome.runtime`
6. Service worker calls `chrome.scripting.executeScript({ tabId, world: "MAIN", func, args: [code] })`
7. Injected function runs `eval(code)`, awaits if Promise, serializes result or captures error fields
8. Result (or error with `name`/`message`/`stack`) travels back through offscreen → broker → MCP server → Claude

**The broker doesn't know** anything about this — it just routes opaque messages.

**Key features:**

- Works on any page without embedding any library
- `eval()` inside the injected function is subject to page CSP — pages with strict `script-src` (e.g., WhatsApp) return an `EvalError`
- Async/await: code returning a Promise is awaited automatically by the injected wrapper
- Timeout: 30 seconds (enforced by `ExtensionAutomationClient`)
- Full error propagation: `name`, `message`, `stack` from `Error` objects

**When MCP server calls `initiate_session`:**

1. LLM generates a short human-readable session code and calls `initiate_session`
2. `ExtensionAutomationClient` enforces exactly 1 connected extension (multiple → error, suspected impersonation attack)
3. Opens broker channel to that extension, sends `{ type: "approve_session", sessionCode }`
4. Offscreen document checks approval state machine:
   - `blocked` → rejects immediately
   - `pending` → duplicate request detected → transitions to `blocked`, rejects both
   - `idle` → transitions to `pending`, asks service worker to open approval tab + focus window
5. Approval page opens; polls offscreen (via service worker) for state every 200ms
6. Once `pending`, page shows the session code with Approve/Reject buttons; keeps polling every 500ms to detect `blocked` state
7. User approves → offscreen generates a UUID session token, resolves with `{ success: true, sessionToken }`
8. `ExtensionTabClient` adds the token to its `approvedSessionTokens` set
9. User rejects or closes tab → offscreen resolves with `{ success: false }`
10. If `blocked` detected while page is open → buttons disabled, security warning shown
11. Result returns: offscreen → broker → `ExtensionAutomationClient` → MCP server → LLM as `{ approved: true, sessionToken, extensionConnectionId }`
12. Timeout: 120 seconds (enforced by `ExtensionAutomationClient`)

**Blocked state**: Triggered when two simultaneous `approve_session` requests arrive. All subsequent requests are rejected until the extension is reloaded. (TODO: add unlock mechanism.)

### Layer 2: Tab Client Protocol (cooperating sites, secondary)

When MCP server calls `execute_js` (tab path):

1. MCP server connects to broker with role `"mcp-server"`
2. Opens channel to a specific tab UUID
3. Sends the command; tab executes the code and responds with the result
4. MCP server receives result, closes channel, disconnects

**Key features:**

- Async/await support: Code like `(async () => { await fetch('/api') })()` is automatically awaited
- Timeout handling: Operations timeout after 30 seconds
- Error reporting: Exceptions are caught and reported back
- Return value handling: Undefined, functions, objects are all serialized properly

## Why This Design?

### Problem: Browser-Specific Broker

**What we could have built:**

- WebSocket server specifically for browser tabs
- Built-in knowledge of tabs, JavaScript execution, DOM manipulation
- MCP protocol baked into the broker
- SharedWorker management in the broker

**Problems with this approach:**

- Can only be used for browser automation
- Can't reuse for other scenarios
- Tight coupling between broker and use case
- Hard to test and maintain

### Solution: Generic Broker + Specific Implementation

**What we actually built:**

**Generic layer** (`connection-broker`):

- No domain knowledge
- Just: connections, roles, channels, messages
- Can be reused for ANY scenario

**Specific layer** (`browser-automation`):

- Browser tab client
- MCP server implementation
- JavaScript execution protocol

**Benefits**:

- Connection broker is reusable
- Clean separation of concerns
- Easy to test each layer independently
- Can build other use cases on the same broker

## Example: Other Use Cases

### Chat Application

```typescript
// User connections
const userClient = new BrokerClient("ws://localhost:3004");
await userClient.connect("chat-user");

// Chat server
const serverClient = new BrokerClient("ws://localhost:3004");
await serverClient.connect("chat-server");

// Server lists all users
const users = await serverClient.listByRole("chat-user");

// Server opens channel to broadcast message
for (const userId of users) {
    const channel = await serverClient.openChannel(userId);
    channel.send({ type: "message", text: "Hello everyone!" });
    channel.close();
}
```

### Microservices RPC

```typescript
// Service A
const serviceA = new BrokerClient("ws://localhost:3004");
await serviceA.connect("payment-service");

serviceA.onIncomingChannel = (channel) => {
    channel.onMessage = async (payload) => {
        if (payload.method === "process_payment") {
            const result = await processPayment(payload.data);
            channel.send({ success: true, result });
            channel.close();
        }
    };
};

// Service B
const serviceB = new BrokerClient("ws://localhost:3004");
await serviceB.connect("order-service");

// Call payment service
const paymentServices = await serviceB.listByRole("payment-service");
const channel = await serviceB.openChannel(paymentServices[0]);

channel.send({
    method: "process_payment",
    data: { amount: 100, currency: "USD" },
});

channel.onMessage = (result) => {
    console.log("Payment result:", result);
    channel.close();
};
```

## Key Architectural Decisions

### 1. Roles Are Just Strings

The broker doesn't validate roles - any string is valid.

**Why**: Maximum flexibility. Clients decide what roles mean.

### 2. Payloads Are Opaque

The broker never inspects message payloads.

**Why**: The broker doesn't need to understand the business logic. Higher-level protocols (like execute_js) are defined by clients, not the broker.

### 3. Ephemeral Channels

Channels are temporary: open → use → close.

**Why**: Simple lifecycle, no persistent state to manage.

### 4. ID System

**Connection IDs & Channel IDs**: UUIDs for persistent identification
**Message IDs**: Auto-increment integers for request/response tracking

**Why**: UUIDs are simple and globally unique for persistent entities. Integer message IDs enable efficient request/response correlation with minimal overhead.

### 5. No Authentication

The broker has no built-in authentication.

**Why**: Keep it simple and generic. Authentication is application-specific and should be handled at a higher layer.

## Development Workflow

### 1. Start the Broker

```bash
npx tsx packages/connection-broker/bin/broker.ts --port 3004
```

### 2. Start Browser Tabs

```bash
npm run demo
# Navigate to http://localhost:4200
```

### 3. Start MCP Server

```bash
npx tsx packages/browser-automation/bin/mcp-server.ts --broker ws://localhost:3004 --stdio
```

### 4. Use from Claude

Configure Claude Desktop:

```json
{
    "mcpServers": {
        "browser": {
            "command": "npx",
            "args": ["tsx", "/path/to/browser-automation/bin/mcp-server.ts", "--broker", "ws://localhost:3004", "--stdio"]
        }
    }
}
```

Then use tools (in order):

1. `initiate_session` — Show an approval dialog in the browser; returns `sessionToken` + `extensionConnectionId` on approval
2. `list_tabs` — List all open browser tabs (requires `session_token` + `extension_connection_id`)
3. `execute_js` — Run JavaScript in a specific tab (requires `session_token` + `extension_connection_id`)

## Future Extensions

### Domain-Specific MCP Servers

`BrowserMcpServer` is built to be subclassed: `setupHandlers` is `protected`, and the constructor accepts `skipExecuteJs` (drop raw JS execution) and `hostnames` (hardcode the hostname scope requested by `initiate_session`, removing that parameter from the LLM-facing schema entirely). A subclass calls `super.setupHandlers()` to keep the tools it still wants, then registers additional, intent-shaped tools (e.g. `send_email` for Gmail) that call the inherited `this.client` (`ExtensionAutomationClient`) internally. See `packages/browser-automation/README.md` → "Building a Domain-Specific Server" for a worked example.

### Additional MCP Tools

- `click_element` - Click DOM elements
- `fill_form` - Fill form fields
- `screenshot` - Take screenshots
- `get_html` - Extract page HTML

### Additional Clients

- Mobile apps (React Native, Flutter)
- Desktop apps (Electron)
- CLI tools
- Test automation frameworks

### Additional Use Cases

- IoT device coordination
- Distributed testing
- Remote debugging
- Live collaboration tools

## Security Considerations

⚠️ **The broker has NO authentication or authorization.** See `SECURITY.md` for full threat model and planned mitigations.

**Current state:**

- The broker has no authentication — any WebSocket client can connect and register with any role
- `initiate_session` requires explicit user approval via the approval page; issues a session token + extension connection ID
- `list_tabs` and `execute_js` require both a valid `session_token` and the exact `extension_connection_id` from `initiate_session`
- Session token is validated by `ExtensionTabClient` (the extension-side broker client, the true security boundary)
- Subsequent operations target the specific extension instance by ID — no re-discovery via `list_by_role`
- The extension rejects simultaneous `approve_session` requests as a suspected attack
- Run on localhost only; use firewall rules to block external access

**Planned (see SECURITY.md):**

- Fine-grained per-tab approval
- HMAC challenge-response to cryptographically guard against role impersonation on the broker
