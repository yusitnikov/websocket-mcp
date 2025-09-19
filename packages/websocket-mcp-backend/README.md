# WebSocket MCP Backend

HTTP proxy server that bridges MCP clients (like Claude Code) to multiple MCP servers via stdio, HTTP, or WebSocket connections.

**What it does:**
- Connects AI clients to multiple MCP servers simultaneously through a single proxy
- Accepts browser-based MCP servers via WebSocket connections
- Exposes each server as an HTTP endpoint for easy client access
- Supports stdio (command-line), HTTP, and WebSocket server types

**Use cases:** Run multiple MCP servers from one proxy, enable browser-based MCP servers, centralize MCP server management.

## Installation

```bash
npm install @websocket-mcp/backend
```

## Quick Start

Choose one of the following methods:

### Option 1: WebSocket Arguments (Browser-based servers)

Pass server definitions as arguments. Each server has a **name** (how AI clients will reference it) and a **WebSocket path** (where browsers connect). You can specify just a name (path defaults to `/{name}`) or provide both name and custom path separated by a colon:

```bash
npx @websocket-mcp/backend browser-tools database-ui:/db --port 3003
```

This creates two servers:
1. **browser-tools** server: browsers connect to `ws://localhost:3003/browser-tools`, AI clients access via `http://localhost:3003/browser-tools`
2. **database-ui** server: browsers connect to `ws://localhost:3003/db`, AI clients access via `http://localhost:3003/database-ui`

The server name determines the HTTP endpoint URL that AI clients use to access the server.

### Option 2: Config File (All server types)

1. Create `mcp-config.json`:

```json
{
    "servers": [
        {
            "name": "filesystem",
            "type": "stdio",
            "enabled": true,
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
        }
    ]
}
```

2. Start the server:

```bash
npx @websocket-mcp/backend --config mcp-config.json --port 3003
```

This starts the proxy server, which will:
- Launch the filesystem MCP server as a subprocess
- Create an HTTP endpoint at `http://localhost:3003/filesystem` (using the server name "filesystem")
- Proxy all requests between AI clients and the filesystem server

## Connect from your AI application:

The proxy exposes each server as an HTTP endpoint at `http://localhost:3003/{serverName}` using the [streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http) transport protocol. The `{serverName}` part of the URL comes from the "name" field in your configuration.

If your client supports streamable HTTP, connect directly to the endpoint. For example, with **Roo Code**, add this to `.roo/mcp.json` in your project:

```json
{
    "mcpServers": {
        "filesystem": {
            "type": "streamable-http",
            "url": "http://localhost:3003/filesystem"
        }
    }
}
```

For clients without streamable HTTP support, use [mcp-remote](https://www.npmjs.com/package/mcp-remote) as a bridge. For example, with **Claude Desktop**, add this to your `claude_desktop_config.json` file:

```json
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": ["mcp-remote", "http://localhost:3003/filesystem"]
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
    "name": "git-tools",
    "type": "stdio",
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-git"]
}
```

#### HTTP Servers

Connect to HTTP-based MCP servers:

```json
{
    "name": "external-api",
    "type": "http",
    "enabled": true,
    "url": "http://localhost:3001"
}
```

#### WebSocket Servers (Browser)

Accept browser-based MCP servers:

```json
{
    "name": "database-ui",
    "type": "websocket",
    "enabled": true,
    "path": "/db"
}
```

### Configuration Properties

- **name**: Server identifier that becomes part of the HTTP endpoint URL (`http://localhost:3003/{name}`) that AI clients use
- **type**: How the proxy connects to the server - "stdio" (command-line), "http" (existing HTTP server), or "websocket" (browser connection)
- **enabled**: Whether this server should be started (true/false)
- **command/args**: For stdio servers - the command and arguments to launch the MCP server process
- **url**: For HTTP servers - the existing HTTP server URL to connect to
- **path**: For WebSocket servers - the WebSocket URL path where browsers should connect (defaults to `/{name}`)

## WebSocket Endpoints

Browser-based MCP servers can connect to WebSocket endpoints:

```javascript
// Browser connects to ws://localhost:3003/db
const ws = new WebSocket("ws://localhost:3003/db");
```


## Further Reading

- [Implementation Details](./IMPLEMENTATION.md) - Architecture and internal workings
- [MCP Protocol Documentation](https://modelcontextprotocol.io/docs/getting-started/intro)
