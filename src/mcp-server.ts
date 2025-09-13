import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { Command } from "commander";
import { WebSocketServer } from "ws";
import http from "http";

const program = new Command();
program
    .description("MCP Test Server")
    .option("-p, --port <port>", "port to run the server on (if omitted, uses stdio)");

program.parse();
const options = program.opts();

const log = (...args: any[]) => {
    console.error(`[${new Date().toISOString()}]`, ...args);
};

const server = new McpServer(
    {
        name: "mcp-test",
        version: "1.0.0",
        title: "MCP Test",
    },
    { capabilities: { tools: {}, logging: {} } },
);

server.tool("test", "Test local MCP server", {}, async (args, extra) => {
    log("Got a connection!");
    log("Arguments:");
    log(args, extra);
    return { content: [{ type: "text", text: "It works!" }] };
});

if (options.port) {
    // HTTP mode with WebSocket support
    const app = express();
    app.use(express.json());

    // Track active WebSocket connections
    const activeConnections = new Set();

    app.post("/mcp", async (req, res) => {
        log("HTTP request!");
        log(req.body);
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // stateless mode
            });

            res.on("close", () => {
                transport.close();
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            log("Error handling MCP request:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32603,
                        message: "Internal server error",
                    },
                    id: null,
                });
            }
        }
    });

    const PORT = parseInt(options.port, 10);

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Create WebSocket server
    const wss = new WebSocketServer({ server: httpServer });

    wss.on("connection", (ws) => {
        log("New WebSocket connection established");
        activeConnections.add(ws);
        log("Active connections:", activeConnections.size);

        ws.send(
            `Hi there! You're ${activeConnections.size}th in the queue. Your opinion is important to us.`,
            (error) => log(error ?? "Sent a message"),
        );

        ws.on("message", (data) => {
            log("WebSocket received message:", data.toString());
        });

        ws.on("close", (code, reason) => {
            log("WebSocket connection closed:", { code, reason: reason.toString() });
            activeConnections.delete(ws);
            log("Active connections:", activeConnections.size);
            ws.close();
        });

        ws.on("error", (error) => {
            log("WebSocket error:", error);
        });

        ws.on("pong", (data) => {
            log("WebSocket pong received:", data.toString());
        });
    });

    httpServer.listen(PORT, () => {
        log(`MCP HTTP Server running on port ${PORT}`);
        log(`HTTP endpoint: http://localhost:${PORT}/mcp`);
        log(`WebSocket endpoint: ws://localhost:${PORT}`);
    });
} else {
    // Stdio mode
    (async () => {
        try {
            await server.connect(new StdioServerTransport());
            log("Running!");
        } catch (error) {
            log("Fatal error:", error);
            process.exit(1);
        }
    })();
}
