import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Express } from "express";
import http from "http";
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
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
// noinspection ES6PreferShortImport
import { WebSocketServerManager } from "./WebSocketServerManager.ts";

export class McpServerProxy {
    public readonly app: Express;
    public readonly httpServer: http.Server;
    public readonly webSocketServerManager: WebSocketServerManager;

    constructor(public readonly port: number) {
        this.app = express();
        this.app.use(express.json());

        this.httpServer = http.createServer(this.app);

        this.webSocketServerManager = new WebSocketServerManager(this.httpServer);
    }

    proxy({ name, getTransport }: McpServerProxyOptions) {
        const { app, port } = this;
        const serverName = name;

        console.log(`HTTP endpoint: http://localhost:${port}/${serverName}`);

        app.post(`/${serverName}`, async (req, res) => {
            console.log(`HTTP request to ${serverName}!`);
            console.log(req.body);

            try {
                console.log(`Connecting to server: ${serverName}`);

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
                    console.log(`${serverName} requested to list tools:`, params);
                    const client = await getClient();
                    const response = await client.listTools(params);
                    console.log("Response:", response);
                    return response;
                });
                server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
                    console.log(`${serverName} requested to call a tool:`, params);
                    const client = await getClient();
                    const response = await client.callTool(params);
                    console.log("Response:", response);
                    return response;
                });
                server.setRequestHandler(
                    ListResourcesRequestSchema,
                    async ({ params }): Promise<ListResourcesResult> => {
                        console.log(`${serverName} requested resources list:`, params);
                        const client = await getClient();
                        const response = await client.listResources(params);
                        console.log("Response:", response);
                        return response;
                    },
                );
                server.setRequestHandler(ListResourceTemplatesRequestSchema, async ({ params }) => {
                    console.log(`${serverName} requested resource templates list:`, params);
                    const client = await getClient();
                    const response = await client.listResourceTemplates(params);
                    console.log("Response:", response);
                    return response;
                });
                server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
                    console.log(`${serverName} requested to read a resource:`, params);
                    const client = await getClient();
                    const response = await client.readResource(params);
                    console.log("Response:", response);
                    return response;
                });
                // TODO: prompts, ...

                let client: Client | undefined;
                const getClient = async (): Promise<Client> => {
                    if (client === undefined) {
                        console.log(`Connecting to the server ${serverName}...`);
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
                            await client.connect(getTransport(this));
                        } catch (error) {
                            console.warn(`Failed to connect to ${serverName}:`, error);
                            throw error instanceof McpError
                                ? error
                                : new McpError(ErrorCode.ConnectionClosed, "Cannot connect to the server");
                        }
                    }

                    return client;
                };

                res.on("close", async () => {
                    console.log(`HTTP request for ${serverName} is closed`);
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
                console.log(`Finished handling request for ${serverName}`);
            } catch (error) {
                console.warn(`Error handling MCP request for ${serverName}:`, error);
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

    start() {
        this.httpServer.listen(this.port, () => console.log(`MCP HTTP server running on port ${this.port}`));
    }
}

export interface McpServerProxyOptions {
    name: string;
    getTransport: (proxy: McpServerProxy) => Transport;
}
