# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a dual-purpose project containing:

1. **MCP Server** - A Model Context Protocol server implementation using the MCP SDK
2. **Chrome Extension** - A browser extension with basic popup and service worker functionality

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
- **Future Goal**: Allow browser tabs to define MCP servers via WebSocket connections

**Current State:**

- `McpClientsManager` - Manages connections to external MCP servers based on `mcp-config.json`
- Server configuration supports both stdio and HTTP server types for external MCP servers
- Express.js server handles MCP HTTP requests at `/mcp` endpoint
- WebSocket server implemented but currently only for testing browser connections
- Only tools are proxied (resources, prompts planned for future)

**Future Architecture:**

- WebSocket connections will allow browser tabs to register as MCP servers
- Custom WebSocket MCP transport protocol for browser communication
- Browser-defined MCP servers will be treated as external servers by the proxy

### Chrome Extension (`extension/`)

- Standard Manifest V3 extension structure
- Main files: `manifest.json`, `popup.html`, `popup.js`, `service-worker.js`
- Icons stored in `extension/images/`
- Permissions: storage, sockets

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
