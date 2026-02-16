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
- Protocol types

**Example usage beyond browsers**:
- Chat servers routing messages between users
- Microservices discovering and calling each other
- IoT devices communicating through a central hub
- Remote procedure call systems

### 2. `packages/browser-automation/` - Browser-Specific Implementation

**Purpose**: Browser automation built on top of the generic broker.

**Responsibilities**:
- `BrowserTabClient` - Browser tabs connect with role `"browser-tab"`, handle commands, auto-reconnect on disconnect
- `BrowserMcpServer` - MCP server connects **on-demand** for each tool call and disconnects immediately
- Define automation protocol (execute_js commands with async/await support)

**Exports**:
- `@sitnikov/browser-automation/tab-client` - For browser code
- `@sitnikov/browser-automation/mcp-server` - For MCP server

### 3. `apps/demo/` - Demo Application

**Purpose**: Example browser application using `BrowserTabClient`.

Shows how to:
- Connect to the broker from a browser
- Handle automation commands
- Display connection status

## Communication Flow

```
┌──────────────────────┐
│  Claude Desktop      │  External MCP client
└──────────┬───────────┘
           │ stdio
           ↓
┌─────────────────────────────────┐
│  BrowserMcpServer               │  Implements list_tabs, execute_js
│  (Node.js process)              │  Connects on-demand per tool call
│                                 │
│  Uses: BrokerClient SDK         │
└──────────┬────────────────────┬─┘
           │                    │
           │ WebSocket          │ Discovers tabs by role
           ↓ (ephemeral)        │ Opens channels to tabs
           │                    │ Disconnects after each call
┌─────────────────────────────────┐
│  ConnectionBroker               │  Generic, reusable broker
│  (WebSocket server)             │
│                                 │
│  - Assigns IDs                  │
│  - Routes messages              │
│  - Manages channels             │
│  - Role-agnostic                │
│  - Payload-agnostic             │
└──────────┬──────────────────────┘
           │ WebSocket (multiple connections)
           ↓
    ┌──────┴──────┬──────────┬──────────┐
    ↓             ↓          ↓          ↓
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Browser    │ │ Browser    │ │ Browser    │
│ Tab 1      │ │ Tab 2      │ │ Tab 3      │
│            │ │            │ │            │
│ BrowserTab │ │ BrowserTab │ │ BrowserTab │
│ Client     │ │ Client     │ │ Client     │
│            │ │            │ │            │
│ Role:      │ │ Role:      │ │ Role:      │
│ "browser-  │ │ "browser-  │ │ "browser-  │
│ tab"       │ │ tab"       │ │ tab"       │
└────────────┘ └────────────┘ └────────────┘
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

### Layer 2: Browser Automation Protocol

**Built on top of broker protocol:**

When MCP server calls `execute_js`:
1. MCP server connects to broker with role "mcp-server"
2. MCP server opens channel to tab ID
3. MCP server sends: `{action: "execute_js", code: "document.title"}`
4. Tab receives message, executes code (awaits if it's a Promise)
5. Tab sends: `{success: true, result: "\"Page Title\""}`
6. MCP server receives result, closes channel
7. MCP server disconnects from broker
8. MCP server returns result to Claude

**The broker doesn't know** that this is JavaScript execution - it just routes opaque messages.

**Key features:**
- Async/await support: Code like `(async () => { await fetch('/api') })()` is automatically awaited
- Timeout handling: Operations timeout after 30 seconds
- Error reporting: Exceptions are caught and reported back with stack traces
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
const userClient = new BrokerClient('ws://localhost:3004')
await userClient.connect('chat-user')

// Chat server
const serverClient = new BrokerClient('ws://localhost:3004')
await serverClient.connect('chat-server')

// Server lists all users
const users = await serverClient.listByRole('chat-user')

// Server opens channel to broadcast message
for (const userId of users) {
  const channel = await serverClient.openChannel(userId)
  channel.send({ type: 'message', text: 'Hello everyone!' })
  channel.close()
}
```

### Microservices RPC

```typescript
// Service A
const serviceA = new BrokerClient('ws://localhost:3004')
await serviceA.connect('payment-service')

serviceA.onIncomingChannel = (channel) => {
  channel.onMessage = async (payload) => {
    if (payload.method === 'process_payment') {
      const result = await processPayment(payload.data)
      channel.send({ success: true, result })
      channel.close()
    }
  }
}

// Service B
const serviceB = new BrokerClient('ws://localhost:3004')
await serviceB.connect('order-service')

// Call payment service
const paymentServices = await serviceB.listByRole('payment-service')
const channel = await serviceB.openChannel(paymentServices[0])

channel.send({
  method: 'process_payment',
  data: { amount: 100, currency: 'USD' }
})

channel.onMessage = (result) => {
  console.log('Payment result:', result)
  channel.close()
}
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

Then use tools:
- `list_tabs` - See all connected tabs
- `execute_js` - Run JavaScript in specific tabs

## Future Extensions

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

⚠️ **The broker has NO authentication or authorization.**

**For development only:**
- Run on localhost
- Use firewall rules to block external access
- Only connect trusted clients
- Don't expose to the internet

**For production:**
- Add authentication layer (JWT, OAuth, etc.)
- Implement authorization (role-based access control)
- Use TLS for WebSocket connections
- Rate limiting and abuse prevention

## Testing Strategy

### Unit Tests

- Broker: Connection management, channel routing
- BrokerClient: Connection lifecycle, message handling
- BrowserTabClient: Command execution, error handling
- BrowserMcpServer: Tool implementation, MCP protocol

### Integration Tests

- End-to-end flow: Claude → MCP Server → Broker → Browser Tab → Response
- Multiple tabs, multiple channels
- Error scenarios: disconnects, timeouts, invalid IDs

### Manual Testing

- Use the demo app to verify browser automation
- Test with Claude Desktop for real-world usage
- Stress test with many tabs and concurrent requests

## License

MIT
