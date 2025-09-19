# WebSocket MCP Backend - Implementation Details

## Architecture

The proxy uses a stateless, per-request design where each HTTP request creates a fresh MCP Server instance that connects to the target server, handles the request, and cleans up immediately afterward.

This approach might seem inefficient at first, but it's actually quite elegant. Instead of managing persistent connections and dealing with connection pooling complexities, the proxy treats each request as an independent operation. When an HTTP request arrives at `/{serverName}`, the system creates a new MCP Server instance, establishes a client connection to the target server (if needed), proxies the request through the MCP protocol, returns the response, and cleans everything up.

## Key Components

The system consists of three main components working together. The `McpClientsManager` reads the `mcp-config.json` file and creates appropriate transports based on the server type (stdio, HTTP, or WebSocket). The `WebSocketServerManager` handles WebSocket connections from browsers at different URL paths. Finally, the `WebSocketServerTransport` acts as a bridge between WebSocket connections and the MCP protocol.

## WebSocket Handling

Browser-based MCP servers connect via WebSocket to specific paths configured in the system. The proxy treats these WebSocket connections exactly like any other external server, routing HTTP requests to them through the established WebSocket connection. This means browsers can register as full MCP servers that other clients can access through the standard HTTP interface.
