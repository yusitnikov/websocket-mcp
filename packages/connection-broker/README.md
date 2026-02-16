# @sitnikov/connection-broker

Generic connection broker that enables ANY two parties to communicate when they can't reach each other directly.

## Overview

The connection broker is a **completely reusable, domain-agnostic** WebSocket server that routes messages between clients. It knows nothing about browsers, MCP, or any specific use case - it just manages connections, channels, and message routing.

### Key Concepts

- **Connections**: Clients connect to the broker and register with a "role" (arbitrary string)
- **Roles**: Used to discover connections (e.g., list all connections with role "browser-tab")
- **Channels**: Ephemeral pseudo-connections between two clients
- **Messages**: Opaque payloads routed between channels

### Protocol Flow

1. Client connects → declares a role → gets assigned a UUID
2. Any client can list all connections by role (returns UUIDs only)
3. Any client can open a channel (pseudo-connection) to another client by UUID
4. Both ends of channel can send messages to each other (with confirmation)
5. Either end can close the channel

### ID Types

- **Connection IDs**: UUID (persistent per client)
- **Channel IDs**: UUID (persistent per channel)
- **Message IDs**: Auto-increment integers (unique per message, used for request/response tracking)

## Installation

```bash
npm install @sitnikov/connection-broker
```

## Usage

### Starting the Broker Server

```bash
connection-broker --port 3004
```

Or programmatically:

```typescript
import { ConnectionBroker } from '@sitnikov/connection-broker'

const broker = new ConnectionBroker(3004)
// Broker is now running on port 3004
```

### Using the Client SDK

```typescript
import { BrokerClient } from '@sitnikov/connection-broker/client'

// Connect to broker with a role
const client = new BrokerClient('ws://localhost:3004')
await client.connect('my-role')

console.log('My ID:', client.getMyId())

// Optional: Pass a logger for debugging
import { Logger } from './Logger'
const logger = new Logger('/path/to/log.txt')
const clientWithLogger = new BrokerClient('ws://localhost:3004', logger)
await clientWithLogger.connect('my-role')

// Discover connections by role
const ids = await client.listByRole('other-role')
console.log('Found connections:', ids)

// Open a channel to a specific connection
const channel = await client.openChannel(targetId)

// Send messages (returns promise that resolves when broker confirms delivery)
await channel.send({ type: 'greeting', message: 'Hello!' })

// Listen for messages
channel.onMessage = (payload) => {
  console.log('Received:', payload)
  channel.send({ type: 'response', message: 'Got it!' })
}

// Listen for channel close
channel.onClosed = () => {
  console.log('Channel closed')
}

// Close the channel
channel.close()

// Listen for incoming channels
client.onIncomingChannel = (channel) => {
  console.log('Incoming channel from:', channel.getPeerId())

  channel.onMessage = (payload) => {
    console.log('Received:', payload)
  }
}

// Disconnect from broker
client.disconnect()
```

## Example Use Cases

### Browser Automation

- Browser tabs connect with role `"browser-tab"`
- MCP server connects with role `"mcp-server"`
- MCP server lists tabs, opens channels, sends commands
- Tabs execute commands and send back results

### Chat Application

- Users connect with role `"user"`
- Server connects with role `"chat-server"`
- Server can list all users and route messages between them

### Remote Procedure Calls

- Service A connects with role `"service-a"`
- Service B connects with role `"service-b"`
- Services can discover each other and exchange RPC requests/responses

## Protocol Reference

All messages include:
- `id`: Auto-increment integer (unique message ID)
- `replyTo`: Integer (optional, references request message ID for responses)

### Client → Broker Messages

#### Register
```json
{
  "type": "register",
  "id": 1,
  "role": "my-role"
}
```

Response (success):
```json
{
  "type": "registered",
  "id": 2,
  "replyTo": 1,
  "connectionId": "connection-uuid"
}
```

Response (failure):
```json
{
  "type": "register_failed",
  "id": 2,
  "replyTo": 1,
  "error": "Error message"
}
```

#### List by Role
```json
{
  "type": "list_by_role",
  "id": 3,
  "role": "other-role"
}
```

Response (success):
```json
{
  "type": "connections",
  "id": 4,
  "replyTo": 3,
  "ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Response (failure):
```json
{
  "type": "list_by_role_failed",
  "id": 4,
  "replyTo": 3,
  "error": "Error message"
}
```

#### Open Channel
```json
{
  "type": "open",
  "id": 5,
  "targetId": "connection-uuid"
}
```

Response to opener (success):
```json
{
  "type": "channel_opened",
  "id": 6,
  "replyTo": 5,
  "channelId": "channel-uuid",
  "targetId": "connection-uuid"
}
```

Notification to target (unsolicited):
```json
{
  "type": "incoming_channel",
  "id": 7,
  "from": "connection-uuid",
  "channelId": "channel-uuid"
}
```

Response (failure):
```json
{
  "type": "channel_open_failed",
  "id": 6,
  "replyTo": 5,
  "targetId": "connection-uuid",
  "error": "Target connection not found"
}
```

#### Send Message on Channel
```json
{
  "type": "message",
  "id": 8,
  "channelId": "channel-uuid",
  "payload": { "any": "data" }
}
```

Notification to recipient (unsolicited):
```json
{
  "type": "channel_message",
  "id": 9,
  "channelId": "channel-uuid",
  "payload": { "any": "data" }
}
```

Response to sender (success):
```json
{
  "type": "channel_message_sent",
  "id": 10,
  "replyTo": 8,
  "channelId": "channel-uuid"
}
```

Response (failure):
```json
{
  "type": "channel_message_failed",
  "id": 10,
  "replyTo": 8,
  "channelId": "channel-uuid",
  "error": "Channel not found"
}
```

#### Close Channel
```json
{
  "type": "close",
  "id": 11,
  "channelId": "channel-uuid"
}
```

Response to closer (success):
```json
{
  "type": "channel_closed",
  "id": 12,
  "replyTo": 11,
  "channelId": "channel-uuid"
}
```

Notification to other party (unsolicited):
```json
{
  "type": "channel_closed_notification",
  "id": 13,
  "channelId": "channel-uuid"
}
```

Response (failure):
```json
{
  "type": "channel_close_failed",
  "id": 12,
  "replyTo": 11,
  "channelId": "channel-uuid",
  "error": "Channel not found"
}
```

### Message Flow Patterns

**Request-Response (expects reply):**
- `register` → `registered` or `register_failed`
- `list_by_role` → `connections` or `list_by_role_failed`
- `open` → `channel_opened` or `channel_open_failed`
- `message` → `channel_message_sent` or `channel_message_failed`
- `close` → `channel_closed` or `channel_close_failed`

**Unsolicited Notifications (no replyTo):**
- `incoming_channel` - Notifies target about new channel
- `channel_message` - Notifies recipient about message
- `channel_closed_notification` - Notifies other party about closure

## Architecture

The broker is designed with these principles:

1. **Role-agnostic**: Roles are just strings, no validation or special handling
2. **Payload-agnostic**: Messages are opaque, broker doesn't inspect them
3. **Stateless channels**: No persistent state beyond active connections and channels
4. **Simple ID system**:
   - Connection IDs & Channel IDs: UUIDs (persistent identifiers)
   - Message IDs: Auto-increment integers (for request/response tracking)
5. **Generic routing**: Routes messages between parties without understanding content
6. **Request-Response Pattern**: All operations (register, list, open, send, close) get explicit success or failure responses
7. **Unsolicited Notifications**: Events like incoming channels, messages, and closures are pushed to clients without replyTo

## License

MIT
