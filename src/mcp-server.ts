import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ServerResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { Command } from "commander";
import http from "http";
import { McpClientsManager } from "./McpClientsManager";
import { log } from "./utils.ts";

const program = new Command();
program.description("MCP Proxy Server").option("-p, --port <port>", "port to run the server on", "3003");

program.parse();
const { port } = program.opts();

const server = new Server(
    {
        name: "mcp-proxy",
        version: "1.0.0",
        title: "MCP Proxy",
    },
    { capabilities: { tools: {} } },
);

let initialized = false;
async function initializeTools(clientsManager: McpClientsManager) {
    if (initialized) {
        return;
    }
    initialized = true;

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
    // HTTP mode with WebSocket support
    const app = express();
    app.use(express.json());

    app.post("/mcp", async (req, res) => {
        log("HTTP request!");
        log(req.body);

        await initializeTools(clientsManager);

        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // stateless mode
            });

            res.on("close", () => {
                log("HTTP request closed");
                transport.close();
            });

            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            log("Finished handling request");
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

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize clients manager with HTTP server
    const clientsManager = new McpClientsManager(httpServer);

    httpServer.listen(Number(port), () => {
        log(`MCP HTTP Server running on port ${port}`);
        log(`HTTP endpoint: http://localhost:${port}/mcp`);
        log(`WebSocket endpoint: ws://localhost:${port}`);
    });
})();
