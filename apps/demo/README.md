# Demo Web Application

Browser demonstration proving that MCP servers can run in browser tabs and connect to the MCP proxy server via WebSocket.

## Purpose

This demo showcases the core functionality of the MCP proxy system by creating a browser-based MCP server that can be accessed by external MCP clients (like Claude Code) through the proxy server.

## Architecture

### MCP Server in Browser
- Creates an MCP **server** (not client) that runs in a SharedWorker
- SharedWorker ensures only one WebSocket connection per browser instance
- Multiple tabs can share the same SharedWorker, maintaining a single connection to the proxy

### SharedWorker Implementation
- **Single Connection**: One SharedWorker = one WebSocket connection to the proxy
- **Tab Coordination**: Uses the tab-sync system to coordinate multiple browser tabs
- **Persistent Connection**: SharedWorker keeps running even when tabs are inactive

### MCP Tools Provided
The browser-based MCP server implements these tools:
- `demo_ping` - Simple ping tool that echoes back a message with server identification
- `get_tabs` - Returns detailed information about all connected browser tabs (ID and title)

### MCP Resources Provided
The demo also implements MCP resources:
- `test-resource-name` - Example resource at URI `stam://file/path/example.json`
- Returns sample JSON data `{"foo": "bar"}` when read

### Tab Synchronization
- Shows which tabs are connected to the same SharedWorker
- Tracks tab creation time, dynamic titles, and connection status
- Demonstrates real-time coordination between multiple browser instances

## How It Works

1. **Server Name Configuration**: Demo extracts server name from URL hash (e.g., `#my-server`)
2. **Browser Tab Opens**: Demo page loads and connects to SharedWorker with parameterized name
3. **SharedWorker Connects**: SharedWorker establishes WebSocket connection to proxy at `/serverName` path
4. **MCP Server Registration**: Browser-based MCP server registers with the proxy using dynamic name
5. **Tool Routing**: Proxy can route tool requests from MCP clients to this browser-defined server
6. **Tab Updates**: Tab sync system broadcasts changes and MCP connection status to all connected tabs

## Integration with Proxy

The proxy server treats browser-defined MCP servers as external servers, routing:
- **Tool Requests**: From MCP clients (like Claude) to browser tools
- **Resource Requests**: From MCP clients to browser resources
- **Responses**: Back from browser to the requesting MCP client

## Development

This demo runs as a standard web application and connects to the MCP proxy server running on the configured port (default: 3003).