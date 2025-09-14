import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ServerResult } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { Command } from "commander";
import http from "http";
import { McpClientsManager } from "./McpClientsManager";
import { log } from "./utils.ts";

const program = new Command();
program.description("MCP Proxy Server").option("-p, --port <port>", "port to run the server on", "3003");

program.parse();
const { port } = program.opts();

async function initializeTools(serverName: string, server: Server, clientsManager: McpClientsManager) {
    log(`Connecting to server: ${serverName}`);
    const client = await clientsManager.connectToServer(serverName);

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        log(`Requested tools list for ${serverName}`);

        const { tools } = await client.listTools();

        log(
            `Server ${serverName} has ${tools.length} tools:`,
            tools.map((tool) => tool.name),
        );

        return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<ServerResult> => {
        const { params } = request;
        log(`Requested tool call ${params.name} of ${serverName}`);
        log("Parameters:", request, extra);

        try {
            const result = await client.callTool(params);

            log("Tool call finished successfully", result);

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

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize clients manager with HTTP server
    const clientsManager = new McpClientsManager(httpServer);

    const serverNames = clientsManager.getEnabledServerNames();
    log("Found enabled servers:", serverNames);

    for (const serverName of serverNames) {
        app.post(`/${serverName}`, async (req, res) => {
            log("HTTP request!");
            log(req.body);

            try {
                const server = new Server(
                    {
                        name: "mcp-proxy",
                        version: "1.0.0",
                        title: "MCP Proxy",
                    },
                    { capabilities: { tools: {} } },
                );

                await initializeTools(serverName, server, clientsManager);

                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined, // stateless mode
                });

                res.on("close", async () => {
                    log("HTTP request closed");
                    await transport.close();
                    await server.close();
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
    }

    httpServer.listen(Number(port), () => {
        log(`MCP HTTP Server running on port ${port}`);
        log(`HTTP endpoint: http://localhost:${port}/mcp`);
        log(`WebSocket endpoint: ws://localhost:${port}`);
    });
})();
