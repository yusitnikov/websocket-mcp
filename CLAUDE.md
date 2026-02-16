# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an NX monorepo implementing a **generic connection broker** system that enables browser automation via MCP.

**Core Packages:**

- `packages/connection-broker/` - Generic, reusable WebSocket broker for routing messages between clients (completely domain-agnostic)
- `packages/browser-automation/` - Browser automation built on the broker (MCP server + browser tab client)
- `apps/demo/` - Browser demo application showing browser automation in action

## Development Notes

- **CRITICAL**: NEVER execute any commands, bash scripts, npm scripts, or NX commands yourself
- **CRITICAL**: NEVER launch, start, run, or test any servers, applications, or tools yourself
- **CRITICAL**: If testing is needed, ask the user to do it instead
- Connection broker entry point: `packages/connection-broker/bin/broker.ts`
- MCP server entry point: `packages/browser-automation/bin/mcp-server.ts`
- **DO NOT** access or run files from `dist/` directory

## Architecture

See `ARCHITECTURE.md` for full details. Key points:

### Generic Connection Broker (`packages/connection-broker/`)

**What it is**: Completely reusable WebSocket broker that routes messages between clients. Domain-agnostic - can be used for ANY scenario where two parties can't reach each other directly.

**Protocol**:
- Clients register with a **role** (arbitrary string) and get assigned a **UUID**
- Any client can list connections by role
- Clients open **channels** (ephemeral pseudo-connections) to other clients by UUID
- Messages are routed through channels with request-response pattern
- All messages have auto-increment integer IDs for tracking
- Responses include `replyTo` field referencing request message ID

**Key files**:
- `src/Broker.ts` - Server implementation
- `src/client/BrokerClient.ts` - Client SDK
- `src/client/Channel.ts` - Channel abstraction
- `src/protocol.ts` - Protocol type definitions

**ID Types**:
- Connection IDs: UUID (persistent per client)
- Channel IDs: UUID (persistent per channel)
- Message IDs: Auto-increment integers (for request/response tracking)

**Exports**:
- `ConnectionBroker` - Server class
- `BrokerClient` - Client SDK
- `Channel` - Channel class
- Protocol types

### Browser Automation (`packages/browser-automation/`)

**What it is**: Browser automation built on top of the generic broker.

**Components**:

1. **BrowserTabClient** (`src/tab-client/`)
   - Browser tabs connect to broker with role `"browser-tab"`
   - Persistent connection with auto-reconnect (exponential backoff)
   - Handles incoming channels and executes JavaScript commands
   - Supports async/await code execution

2. **BrowserMcpServer** (`src/mcp-server/`)
   - MCP server that uses BrokerClient to talk to browser tabs
   - Connects to broker **on-demand** for each tool call (ephemeral connections)
   - Implements `list_tabs` and `execute_js` tools
   - Disconnects immediately after each tool execution

**Protocol flow** (example for execute_js):
1. MCP server connects to broker with role `"mcp-server"`
2. Opens channel to specific tab UUID
3. Sends: `{action: "execute_js", code: "document.title"}`
4. Tab receives, executes code (awaits if Promise)
5. Tab sends: `{success: true, result: "\"Page Title\""}`
6. MCP server receives result, closes channel, disconnects
7. Returns result to Claude

### Demo Application (`apps/demo/`)

**Purpose**: Example browser application using `BrowserTabClient`.

**What it does**:
- Connects to broker on startup
- Shows connection status and assigned UUID
- Automatically handles automation commands from MCP server
- No SharedWorker complexity - just direct WebSocket connection

## Key Design Principles

1. **Generic Infrastructure**: The broker knows nothing about browsers, MCP, or any specific use case
2. **Role-Agnostic**: Roles are just strings - no validation or special handling
3. **Payload-Agnostic**: Broker never inspects message payloads - completely opaque
4. **Request-Response Pattern**: All operations get explicit success/failure responses via `replyTo`
5. **Ephemeral Channels**: Channels are temporary (open → use → close)
6. **Clean Separation**: Generic layer (connection-broker) vs specific implementation (browser-automation)

## Message Flow Pattern

**All broker protocol messages include:**
- `id`: Auto-increment integer (unique message ID)
- `replyTo`: Integer (optional, for responses only, references request message ID)

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

## Documentation Files

- `ARCHITECTURE.md` - Full architecture documentation
- `README.md` files in packages - User-focused documentation
- `CLAUDE.md` (this file) - Development guidance

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `ws` - WebSocket server/client
- `typescript`, `vite` - Build tooling

## Important: What NOT to Do

- **DO NOT** execute any commands, scripts, or launch any processes
- **DO NOT** access or reference files in `dist/` directory - they are not used in development
- **DO NOT** suggest compilation steps - development works directly from TypeScript source
