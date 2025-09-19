# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an NX monorepo implementing an MCP proxy system with browser-based MCP servers:

**Apps:**
- `apps/demo/` - Browser demo that creates MCP servers in SharedWorkers and connects them to the proxy

**Packages (follow NX lib structure: `src/index.ts` exports from `src/lib/`):**
- `packages/websocket-mcp-backend/` - HTTP proxy server that bridges MCP clients (like Claude) to external MCP servers via stdio, HTTP, or WebSocket
- `packages/websocket-mcp-frontend/` - Provides `WebSocketClientTransport` for browser-based MCP servers to connect to the proxy
- `packages/tab-sync/` - Provides `TabSyncClient` and `TabSyncServer` for coordinating multiple browser tabs through SharedWorkers

## Development Notes

- **CRITICAL**: NEVER execute any commands, bash scripts, npm scripts, or NX commands yourself
- **CRITICAL**: NEVER launch, start, run, or test any servers, applications, or tools yourself
- **CRITICAL**: If testing is needed, ask the user to do it instead
- MCP proxy server entry point is `packages/websocket-mcp-backend/src/bin/run.ts`
- **DO NOT** access or run files from `dist/` directory

## Architecture

### MCP Proxy Server (`packages/websocket-mcp-backend/`)

**Core Architecture:**

- Entry point: `packages/websocket-mcp-backend/src/bin/run.ts`
- **MCP Proxy Server** - Acts as a proxy/bridge between MCP clients (like Claude) and multiple MCP servers
- Uses `@modelcontextprotocol/sdk` for MCP server implementation
- Exposes HTTP endpoints for each configured server at `/{serverName}` on configurable port (default: 3003)
- Proxies tool and resource requests/responses between MCP clients and external MCP servers
- Supports browser-based MCP servers via WebSocket connections

**Current State:**

- `McpClientsManager` - Manages connections to external MCP servers based on `mcp-config.json`
- Server configuration supports stdio, HTTP, and WebSocket server types for external MCP servers
- Express.js server handles MCP HTTP requests at individual server endpoints
- WebSocket server implemented - browser tabs can register as MCP servers
- Custom WebSocket MCP transport protocol implemented (`WebSocketServerTransport`, `WebSocketClientTransport`)
- Browser-defined MCP servers are treated as external servers by the proxy
- Tools and resources are proxied (prompts planned for future)

### Demo Web Application (`apps/demo/`)

**Purpose**: Browser demo proving MCP servers can run in browser tabs and connect to the proxy

**Architecture**:

- Demo creates an MCP **server** in a SharedWorker that connects to the proxy via WebSocket
- SharedWorker ensures only one WebSocket connection per browser instance (one SharedWorker = one connection)
- Browser-based MCP server implements `demo_ping` and `get_tabs` tools
- Tab synchronization system shows which tabs are connected to the same SharedWorker
- Proxy can route tool requests from MCP clients (like Claude) to this browser-defined MCP server

### WebSocket MCP Frontend (`packages/websocket-mcp-frontend/`)

**Purpose**: Enables browser-based MCP servers to connect to the proxy server

**Key Export**: `WebSocketClientTransport` - MCP transport implementation that connects via WebSocket to the proxy server

### Tab Sync (`packages/tab-sync/`)

**Purpose**: Enables communication between browser tabs via SharedWorker

**Key Exports**:
- `TabSyncClient` - Browser tab component that connects to SharedWorker and receives tab updates
- `TabSyncServer` - SharedWorker component that manages connected tabs and broadcasts changes
- Tab info tracking with creation time, dynamic titles, and connection status
- SharedWorker keeps running even when tabs are inactive, ensuring all tabs remain trackable by the sync system

## Documentation Files

Each package and app includes comprehensive documentation:

- **README.md** files in each package/app - User-focused documentation with installation, configuration, and usage examples
- **IMPLEMENTATION.md** files in packages - Developer-focused documentation with architecture details and design decisions
- **CLAUDE.md** (this file) - Development guidance for Claude Code

## Configuration Files

- `mcp-config.json` - Required configuration file for MCP server connections (referenced by `McpClientsManager`)
- `nx.json` - NX workspace configuration with build targets and plugins
- Root `package.json` - Workspace dependencies and NX scripts
- Root `tsconfig.json` - TypeScript configuration with path mappings for packages
- Individual `project.json` files in each app/package define NX targets

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `express` - Web server for HTTP transport mode
- `commander` - CLI argument parsing
- `zod` - Schema validation
- `typescript`, `vite` - Build tooling

## Important: What NOT to Do

- **DO NOT** execute any commands, scripts, or launch any processes
- **DO NOT** access or reference files in `dist/` directory - they are not used in development
- **DO NOT** suggest compilation steps - development works directly from TypeScript source
