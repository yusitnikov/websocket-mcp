# WebSocket MCP - Implementation Details

This document covers the implementation details of both the **server** (Node.js proxy) and **frontend** (browser transport) components of the WebSocket MCP package.

# Server Implementation (Node.js)

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

Provides configuration management functions:

- `loadConfigs()` - Reads and validates JSON config files, filtering enabled servers
- `getProxyOptionsFromConfig()` - Converts configuration objects into `McpServerProxyOptions` with appropriate transport factories

### CLI Interface (run.ts)

Entry point that handles argument parsing and server instantiation. Supports both file-based and argument-based configuration with validation to ensure exactly one method is used.

### WebSocketServerManager

Handles WebSocket connections from browsers at different URL paths, enabling browser-based MCP servers to connect to the proxy.

### WebSocketServerTransport

Acts as a bridge between WebSocket connections and the MCP protocol, allowing seamless integration of browser-based servers into the proxy ecosystem.

## WebSocket Handling

Browser-based MCP servers connect via WebSocket to specific paths configured in the system. The proxy treats these WebSocket connections exactly like any other external server, routing HTTP requests to them through the established WebSocket connection. This means browsers can register as full MCP servers that other clients can access through the standard HTTP interface.

# Frontend Implementation (Browser)

## Architecture

The transport implements the MCP Transport interface using WebSocket connections with automatic reconnection and exponential backoff. This creates a reliable bridge between browser-based MCP servers and the proxy server.

The key insight is that browser environments are inherently unreliable compared to server environments. Network connections drop, users navigate between pages, and browsers suspend tabs to save resources. The transport handles all of this complexity automatically, presenting a clean MCP Transport interface to the application code.

## Connection Management

The transport manages the entire connection lifecycle without requiring intervention from the application. When you call `start()`, it establishes a WebSocket connection with a configurable timeout. If the connection succeeds, it begins listening for messages and monitoring the connection state. If the connection drops unexpectedly, the transport automatically attempts to reconnect using exponential backoff.

The reconnection strategy starts with a short delay (1 second by default) and doubles the delay with each failed attempt, up to a maximum (3 seconds by default). This prevents the browser from overwhelming a struggling server while still providing responsive reconnection when the server comes back online.

## Resource Management

The transport uses `AbortController` to properly cancel connection attempts when needed. This is particularly important in browser environments where users might navigate away from a page or explicitly close connections. When `close()` is called, any pending connection attempts are immediately cancelled to prevent resource leaks.

## Browser Optimization

The design is specifically optimized for SharedWorker environments where a single persistent connection can efficiently serve multiple browser tabs. The transport maintains state about the connection and provides the `isConnected` property so applications can make informed decisions about their behavior based on connectivity status.
