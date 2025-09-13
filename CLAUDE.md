# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a dual-purpose project containing:
1. **MCP Server** - A Model Context Protocol server implementation using the MCP SDK
2. **Chrome Extension** - A browser extension with basic popup and service worker functionality

## Common Development Commands

- `npm run build` - Build the project using Vite
- `npm run watch` - Build in watch mode for development
- `npm run claude` - Launch Claude Code CLI

## Architecture

### MCP Server (`src/index.ts`)
- Entry point: `src/index.ts`
- Uses `@modelcontextprotocol/sdk` for MCP server implementation
- Single tool implementation: "test" tool with progress notifications
- Configured for stdio transport
- Outputs built as CommonJS module to `dist/` directory

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
- `zod` - Schema validation
- `typescript`, `vite` - Build tooling