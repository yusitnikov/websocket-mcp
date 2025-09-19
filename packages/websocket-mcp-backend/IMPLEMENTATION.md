# WebSocket MCP Backend - Implementation Details

## Architecture

The proxy uses a stateless, per-request design where each HTTP request creates a fresh MCP Server instance that connects to the target server, handles the request, and cleans up immediately afterward.

This approach might seem inefficient at first, but it's actually quite elegant. Instead of managing persistent connections and dealing with connection pooling complexities, the proxy treats each request as an independent operation. When an HTTP request arrives at `/{serverName}`, the system creates a new MCP Server instance, establishes a client connection to the target server (if needed), proxies the request through the MCP protocol, returns the response, and cleans everything up.

## Key Components

The system consists of a modular architecture with clear separation of concerns:

### McpServerProxy
The main orchestrator class that handles:
- Express.js HTTP server setup and management
- WebSocket server initialization through `WebSocketServerManager`
- Request routing and proxy endpoint creation
- Per-request MCP Server and Client lifecycle management

### Configuration System (configs.ts)
Provides two focused functions for configuration management:
- `loadConfigs()` - Reads and validates `mcp-config.json`, filtering enabled servers
- `getProxyOptionsFromConfig()` - Converts configuration objects into `McpServerProxyOptions` with appropriate transport factories

### WebSocketServerManager
Handles WebSocket connections from browsers at different URL paths, enabling browser-based MCP servers to connect to the proxy.

### WebSocketServerTransport
Acts as a bridge between WebSocket connections and the MCP protocol, allowing seamless integration of browser-based servers into the proxy ecosystem.

## WebSocket Handling

Browser-based MCP servers connect via WebSocket to specific paths configured in the system. The proxy treats these WebSocket connections exactly like any other external server, routing HTTP requests to them through the established WebSocket connection. This means browsers can register as full MCP servers that other clients can access through the standard HTTP interface.
