import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Command } from "commander";
import http from "http";
import { McpClientsManager } from "./McpClientsManager";
import { log } from "./utils.ts";
import { WebSocketServerManager } from "./WebSocketServerManager.ts";
import {
    ErrorCode,
    McpError,
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
    ListResourcesResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const program = new Command();
program.description("MCP Proxy Server").option("-p, --port <port>", "port to run the server on", "3003");

program.parse();
const { port } = program.opts();

(async () => {
    // HTTP mode with WebSocket support
    const app = express();
    app.use(express.json());

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Listen to web sockets
    const webSocketServerManager = new WebSocketServerManager(httpServer);

    // Initialize clients manager with HTTP server
    const clientsManager = new McpClientsManager(webSocketServerManager);

    const serverNames = clientsManager.getEnabledServerNames();
    log("Found enabled servers:", serverNames);

    for (const serverName of serverNames) {
        app.post(`/${serverName}`, async (req, res) => {
            log(`HTTP request to ${serverName}!`);
            log(req.body);

            // TODO: look at mcp-remote implementation for reference
            try {
                log(`Connecting to server: ${serverName}`);

                const server = new Server(
                    {
                        name: serverName,
                        version: "1.0.0",
                    },
                    {
                        capabilities: { tools: {}, resources: {} },
                    },
                );
                server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => {
                    log(`${serverName} requested to list tools:`, params);
                    const client = await getClient();
                    const response = await client.listTools(params);
                    log("Response:", response);
                    return response;
                });
                server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
                    log(`${serverName} requested to call a tool:`, params);
                    const client = await getClient();
                    const response = await client.callTool(params);
                    log("Response:", response);
                    return response;
                });
                server.setRequestHandler(
                    ListResourcesRequestSchema,
                    async ({ params }): Promise<ListResourcesResult> => {
                        log(`${serverName} requested resources list:`, params);
                        const client = await getClient();
                        const response = await client.listResources(params);
                        log("Response:", response);
                        return response;
                    },
                );
                server.setRequestHandler(ListResourceTemplatesRequestSchema, async ({ params }) => {
                    log(`${serverName} requested resource templates list:`, params);
                    const client = await getClient();
                    const response = await client.listResourceTemplates(params);
                    log("Response:", response);
                    return response;
                });
                server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
                    log(`${serverName} requested to read a resource:`, params);
                    const client = await getClient();
                    const response = await client.readResource(params);
                    log("Response:", response);
                    return response;
                });
                // TODO: prompts, ...

                let client: Client | undefined;
                const getClient = async (): Promise<Client> => {
                    if (client === undefined) {
                        log(`Connecting to the server ${serverName}...`);
                        try {
                            client = new Client(
                                {
                                    name: "Client proxy",
                                    version: "1.0.0",
                                },
                                {
                                    capabilities: { tools: {}, resources: {} },
                                },
                            );
                            await client.connect(clientsManager.getTransport(serverName));
                        } catch (error) {
                            log(`Failed to connect to ${serverName}:`, error);
                            throw error instanceof McpError
                                ? error
                                : new McpError(ErrorCode.ConnectionClosed, "Cannot connect to the server");
                        }
                    }

                    return client;
                };

                res.on("close", async () => {
                    log(`HTTP request for ${serverName} is closed`);
                    await server.close();
                    if (client instanceof Client) {
                        await client.close();
                    }
                });

                const serverTransport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined, // stateless mode
                });
                await server.connect(serverTransport);
                await serverTransport.handleRequest(req, res, req.body);
                log(`Finished handling request for ${serverName}`);
            } catch (error) {
                log(`Error handling MCP request for ${serverName}:`, error);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: "2.0",
                        error:
                            error instanceof McpError
                                ? {
                                      code: error.code,
                                      message: error.message,
                                  }
                                : {
                                      code: ErrorCode.InternalError,
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
