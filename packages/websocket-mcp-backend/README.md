# WebSocket MCP Backend

HTTP proxy server that bridges MCP clients (like Claude Code) to multiple MCP servers via stdio, HTTP, or WebSocket connections.

## Installation

```bash
npm install @websocket-mcp/backend
```

## Quick Start

1. Create a configuration file `mcp-config.json`:

```json
{
    "servers": [
        {
            "name": "my-server",
            "type": "stdio",
            "enabled": true,
            "command": "python",
            "args": ["-m", "my_mcp_server"]
        }
    ]
}
```

2. Start the proxy server:

```bash
npx websocket-mcp-backend --port 3003
```

3. Connect from your AI application:

The proxy exposes each server as an HTTP endpoint at `http://localhost:3003/{serverName}` using the [streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http) transport protocol.

If your client supports streamable HTTP, connect directly to the endpoint. For example, with **Roo Code**, add this to `.roo/mcp.json` in your project:

```json
{
    "mcpServers": {
        "my-server": {
            "type": "streamable-http",
            "url": "http://localhost:3003/my-server"
        }
    }
}
```

For clients without streamable HTTP support, use [mcp-remote](https://www.npmjs.com/package/mcp-remote) as a bridge. For example, with **Claude Desktop**, add this to your `claude_desktop_config.json` file:

```json
{
    "mcpServers": {
        "my-server": {
            "command": "npx",
            "args": ["mcp-remote", "http://localhost:3003/my-server"]
        }
    }
}
```

## Configuration

### Server Types

#### Stdio Servers

Connect to command-line MCP servers:

```json
{
    "name": "stdio-server",
    "type": "stdio",
    "enabled": true,
    "command": "node",
    "args": ["my-server.js"]
}
```

#### HTTP Servers

Connect to HTTP-based MCP servers:

```json
{
    "name": "http-server",
    "type": "http",
    "enabled": true,
    "url": "http://localhost:3001"
}
```

#### WebSocket Servers (Browser)

Accept browser-based MCP servers:

```json
{
    "name": "browser-demo",
    "type": "websocket",
    "enabled": true,
    "path": "/demo"
}
```

### Configuration Properties

- **name**: Unique identifier used in HTTP endpoint URL (`/{name}`)
- **type**: Transport type - "stdio", "http", or "websocket"
- **enabled**: Boolean flag to enable/disable the server
- **command/args**: For stdio servers - command and arguments to execute
- **url**: For HTTP servers - base URL of the target server
- **path**: For WebSocket servers - URL path where browser-based MCP servers connect (defaults to `/{name}`)

## WebSocket Endpoints

Browser-based MCP servers can connect to WebSocket endpoints:

```javascript
// Browser connects to ws://localhost:3003/demo
const ws = new WebSocket("ws://localhost:3003/demo");
```

## CLI Options

```bash
websocket-mcp-backend [options]

Options:
  -p, --port <port>  Port to run the server on (default: 3003)
  -h, --help         Display help information
```

## Further Reading

- [Implementation Details](./IMPLEMENTATION.md) - Architecture and internal workings
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs/getting-started/intro)
