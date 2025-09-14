# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-component project containing:

1. **MCP Server** - A Model Context Protocol server implementation using the MCP SDK
2. **Chrome Extension** - A browser extension with basic popup and service worker functionality
3. **Demo Web Application** - A Vite-based web app demonstrating browser-to-MCP server connectivity via WebSocket

## Development Notes

- **IMPORTANT**: MCP server is launched directly from the IDE using TypeScript files (`.ts`)
- **DO NOT** use build commands (`npm run build`, `npm run watch`) - they are not part of the development workflow
- **DO NOT** access or run files from `dist/` directory
- Launch `src/mcp-server.ts` directly in the IDE for development
- **IMPORTANT**: always use the log function from utils.ts for any kind of logging, never use console.log and such.

## Architecture

### MCP Server (`src/mcp-server.ts`)

**Core Architecture:**

- Entry point: `src/mcp-server.ts` (run directly from IDE)
- **MCP Proxy Server** - Acts as a proxy/bridge between MCP clients (like Claude) and multiple MCP servers
- Uses `@modelcontextprotocol/sdk` for MCP server implementation
- Exposes HTTP transport for MCP clients at `/mcp` endpoint on configurable port (default: 3003)
- Currently proxies tool requests/responses between MCP clients and external MCP servers
- Supports browser tabs defining MCP servers via WebSocket connections (implemented)

**Current State:**

- `McpClientsManager` - Manages connections to external MCP servers based on `mcp-config.json`
- Server configuration supports both stdio and HTTP server types for external MCP servers
- Express.js server handles MCP HTTP requests at `/mcp` endpoint
- WebSocket server implemented and working - browser tabs can register as MCP servers
- Custom WebSocket MCP transport protocol implemented (`WebSocketServerTransport`, `WebSocketClientTransport`)
- Browser-defined MCP servers are treated as external servers by the proxy
- Only tools are proxied (resources, prompts planned for future)

### Chrome Extension (`extension/`)

- Standard Manifest V3 extension structure
- Main files: `manifest.json`, `popup.html`, `popup.js`, `service-worker.js`
- Icons stored in `extension/images/`
- Permissions: storage, sockets

### Demo Web Application (`demo/`)

**Purpose**: Working prototype of browser-based MCP servers connecting via WebSocket

**Key Components**:

- `DemoMcpServer` class - Browser-based MCP server that registers with main proxy server
- Implements `demo_ping` tool to demonstrate MCP server functionality
- Service Worker integration for offline functionality
- Auto-connecting UI showing real-time connection status to main server

**Architecture**:

- Demo creates an MCP **server** that connects to main proxy server via WebSocket
- Uses custom `WebSocketClientTransport` to connect at `ws://localhost:3003`
- Demonstrates the "Future Goal" of browser tabs defining MCP servers
- Main server can route tool requests to this browser-defined MCP server

## Configuration Files

- `mcp-config.json` - Required configuration file for MCP server connections (referenced by `McpClientsManager`)
- `vite.config.ts` - Build configuration (not used in development, only for production builds)
- `package.json` - Project dependencies and scripts (build commands exist but should not be used)
- TypeScript configured with ES2022 target, Node.js 22 runtime

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `express` - Web server for HTTP transport mode
- `commander` - CLI argument parsing
- `zod` - Schema validation
- `typescript`, `vite` - Build tooling

## Important: What NOT to Do

- **DO NOT** run build commands (`npm run build`, `npm run watch`) - development uses TypeScript directly
- **DO NOT** suggest compilation steps - development works directly from TypeScript source
- **DO NOT** access or reference files in `dist/` directory - they are not used in development
- **DO NOT** launch the MCP server via command line - it's handled by the IDE
