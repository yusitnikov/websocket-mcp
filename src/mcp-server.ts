import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ServerResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { Command } from "commander";
import { WebSocketServer } from "ws";
import http from "http";
import { McpClientsManager } from "./McpClientsManager";
import { log } from "./utils.ts";

const program = new Command();
program
    .description("MCP Proxy Server")
    .option("-p, --port <port>", "port to run the server on (if omitted, uses stdio)");

program.parse();
const options = program.opts();

const clientsManager = new McpClientsManager();

const server = new Server(
    {
        name: "mcp-proxy",
        version: "1.0.0",
        title: "MCP Proxy",
    },
    { capabilities: { tools: {}, logging: {} } },
);

async function initializeTools() {
    interface MyTool {
        serverName: string;
        definition: Tool;
    }
    const allTools: MyTool[] = [];

    try {
        const serverNames = clientsManager.getEnabledServerNames();
        log("Found enabled servers:", serverNames);

        for (const serverName of serverNames) {
            try {
                log(`Connecting to server: ${serverName}`);
                const client = await clientsManager.connectToServer(serverName);

                const { tools } = await client.listTools();

                log(
                    `Server ${serverName} has ${tools.length} tools:`,
                    tools.map((t) => t.name),
                );

                allTools.push(
                    ...tools.map((tool) => ({
                        serverName,
                        definition: tool,
                    })),
                );
            } catch (error) {
                log(`Failed to connect to server ${serverName}:`, error);
            }
        }
    } catch (error) {
        log("Error initializing tools:", error);
    }

    server.setRequestHandler(ListToolsRequestSchema, () => {
        log("Requested tools list");

        return {
            tools: allTools.map(({ definition }) => definition),
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<ServerResult> => {
        const { params } = request;
        log(`Requested tool call ${params.name}`);
        log("Parameters:", request, extra);

        try {
            const tool = allTools.find((tool) => tool.definition.name === params.name);
            if (!tool) {
                log("Tool not found");

                return {
                    content: [
                        {
                            type: "text",
                            text: "Tool not found",
                        },
                    ],
                    isError: true,
                };
            }

            const client = await clientsManager.connectToServer(tool.serverName);

            const result = await client.callTool(params);

            log("Tool call finished successfully");

            return result;
        } catch (error: unknown) {
            log("Tool call failed:", error);

            return {
                content: [
                    {
                        type: "text",
                        text: String(error),
                    },
                ],
                isError: true,
            };
        }
    });
}

(async () => {
    await initializeTools();

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
        try {
            await server.connect(new StdioServerTransport());
            log("Running!");
        } catch (error) {
            log("Fatal error:", error);
            process.exit(1);
        }
    }
})();
