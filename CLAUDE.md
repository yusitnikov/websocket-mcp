# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an NX monorepo implementing a **generic connection broker** system that enables browser automation via MCP.

**Core Packages:**

- `packages/protocol/` - Generic typed request-response protocol utilities; used to define message contracts between any two parties in this repo
- `packages/connection-broker/` - Generic, reusable WebSocket broker for routing messages between clients (completely domain-agnostic)
- `packages/browser-automation/` - Browser automation built on the broker (MCP server + extension client + tab client)
- `apps/browser-extension/` - Chrome extension (Manifest V3) — the primary browser-side component
- `apps/demo/` - Demo browser application using `BrowserTabClient` (cooperating-site model)

## Development Notes

- **CRITICAL**: NEVER launch, start, run, or test any servers, applications, or tools yourself
- To check for issues after making changes, run `npm run lint` and `npm run typecheck`
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

**Primary path — Chrome Extension (Model A):**

1. **ExtensionTabClient** (`src/extension-tab-client/`)
    - Runs in the extension's offscreen document
    - Registers with broker role `"browser-extension"` (persistent, auto-reconnect)
    - Receives commands via broker channels; delegates to injected callbacks
    - Callbacks are implemented in the service worker (`chrome.tabs`, `chrome.scripting`)

2. **ExtensionAutomationClient** (`src/extension-automation-client/`)
    - MCP-server-side client that talks to the extension via broker
    - Connects to broker **on-demand** for each operation (ephemeral connections)
    - Disconnects immediately after each operation

3. **BrowserMcpServer** (`src/mcp-server/`)
    - Thin MCP adapter that delegates to `ExtensionAutomationClient`
    - Implements `list_tabs`, `execute_js`, and `initiate_session` tools

**Extension protocol flow** (example for execute_js):

1. MCP server connects to broker with role `"mcp-server"`
2. Finds the extension via `list_by_role("browser-extension")`
3. Opens channel, sends: `{action: "execute_js", tabId: 123, code: "document.title"}`
4. Extension's offscreen document receives command, relays to service worker via `chrome.runtime.sendMessage`
5. Service worker calls `chrome.scripting.executeScript({ tabId, world: "MAIN", func, args: [code] })`
6. Injected function runs code via `eval()` inside the page's JS context; catches errors; returns structured result
7. Result travels back: service worker → offscreen → broker → MCP server → Claude
8. Errors include `name`, `message`, `stack` fields from the `Error` object

**Important CSP note:** `chrome.scripting.executeScript` with `func` bypasses page CSP for the injection itself. But `eval()` _inside_ the injected function is still subject to page CSP — it will fail on pages with strict `script-src` (e.g., WhatsApp). The error is reported back as a structured `EvalError`.

### Chrome Extension (`apps/browser-extension/`)

**Architecture**: Manifest V3 with offscreen document for persistent WebSocket.

**Components**:

- `background/service-worker.ts` — handles tab listing, JS execution, approval tab management; relays messages between extension contexts
- `offscreen/offscreen.ts` — holds the persistent broker WebSocket via `ExtensionTabClient`; owns the approval state machine
- `approval/approval.ts` + `approval/approval.html` — shown to the user when a session is initiated; user approves or rejects
- `popup/` — connection status UI
- `protocol.ts` — typed chrome runtime message contracts for all inter-context IPC

**Key manifest permissions**: `"offscreen"`, `"scripting"`, `"tabs"`, `"windows"`, `"host_permissions": ["<all_urls>"]`

### Demo Application (`apps/demo/`)

**Purpose**: Example browser application using `BrowserTabClient` (cooperating-site model).

**What it does**:

- Connects to broker on startup
- Shows connection status and assigned UUID
- Automatically handles automation commands from MCP server

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
- `SECURITY.md` - Security analysis and design for the browser automation and MCP
- `README.md` files in packages - User-focused documentation
- `CLAUDE.md` (this file) - Development guidance

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `ws` - WebSocket server/client
- `typescript`, `vite` - Build tooling

## Context Notes

- **Claude runs as a CLI tool (MCP server), not in a browser tab.** There is no "Claude tab" in the browser. The user interacts with Claude via a terminal/IDE, not a browser page.

## Important: What NOT to Do

- **DO NOT** launch servers, applications, or long-running processes
- **DO NOT** access or reference files in `dist/` directory - they are not used in development
- **DO NOT** suggest compilation steps - development works directly from TypeScript source
