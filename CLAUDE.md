# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a dual-purpose project containing:

1. **MCP Server** - A Model Context Protocol server implementation using the MCP SDK
2. **Chrome Extension** - A browser extension with basic popup and service worker functionality

## Development Notes

- MCP server is launched directly from the IDE without compilation
- Build commands exist but are not used in development workflow

## Architecture

### MCP Server (`src/index.ts`)

- Entry point: `src/index.ts`
- Uses `@modelcontextprotocol/sdk` for MCP server implementation
- Single tool implementation: "test" tool that returns "It works!"
- Supports both stdio and HTTP transports (use `--port` flag for HTTP mode)
- Outputs built as CommonJS module to `dist/` directory
- Includes Express.js server for HTTP transport mode

### Chrome Extension (`extension/`)

- Standard Manifest V3 extension structure
- Main files: `manifest.json`, `popup.html`, `popup.js`, `service-worker.js`
- Icons stored in `extension/images/`
- Permissions: storage, sockets

## Build Configuration

- **TypeScript**: Strict mode with ES2022 target
- **Vite**: Configured for Node.js library build (CommonJS output)
- **External dependencies**: MCP SDK and Node.js built-ins are externalized
- **Target**: Node.js 22

## Key Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `express` - Web server for HTTP transport mode
- `commander` - CLI argument parsing
- `zod` - Schema validation
- `typescript`, `vite` - Build tooling

## Important: What NOT to Do

- **DO NOT** run build commands or launch the MCP server - it's handled by the IDE
- **DO NOT** suggest compilation steps - development works directly from TypeScript source
