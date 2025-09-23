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
    JSONRPCMessage,
    MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
// noinspection ES6PreferShortImport
import { WebSocketServerManager } from "./WebSocketServerManager.ts";

const _console = console;

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
        const console = {
            log: (...args: any[]) => _console.log(`[${new Date().toISOString()}]`, ...args),
            warn: (...args: any[]) => _console.warn(`[${new Date().toISOString()}]`, ...args),
        };

        const { app, port } = this;
        const serverName = name;

        console.log(`HTTP endpoint: http://localhost:${port}/${serverName}`);

        const client = new Client(
            {
                name: "Client proxy",
                version: "1.0.0",
            },
            {
                capabilities: { tools: {}, resources: {} },
            },
        );
        let transport: Transport | undefined;
        const getClient = async (): Promise<Client> => {
            if (!transport) {
                transport = new TransportLoggerProxy(getTransport(this), {
                    log: (...args: any[]) => console.log(`[${serverName}] [client]`, ...args),
                });

                try {
                    await client.connect(transport);
                } catch (error) {
                    console.warn(`[${serverName}] Failed to connect to the proxy client:`, error);

                    transport = undefined;

                    throw error instanceof McpError
                        ? error
                        : new McpError(ErrorCode.ConnectionClosed, "Cannot connect to the server");
                }
            }

            return client;
        };

        let connectionsCount = 0;
        let connectionAutoId = 0;

        app.post(`/${serverName}`, async (req, res) => {
            const logPrefix = `[${serverName}] [${++connectionAutoId}]`;
            ++connectionsCount;
            console.log(logPrefix, `HTTP request!`);
            console.log(logPrefix, req.body);
            console.log(logPrefix, "Active connections count:", connectionsCount);

            try {
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
                    console.log(logPrefix, "Requested to list tools:", params);
                    const client = await getClient();
                    const response = await client.listTools(params);
                    console.log(logPrefix, "Response:", response);
                    return response;
                });
                server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
                    console.log(logPrefix, "Requested to call a tool:", params);
                    const client = await getClient();
                    const response = await client.callTool(params);
                    console.log(logPrefix, "Response:", response);
                    return response;
                });
                server.setRequestHandler(
                    ListResourcesRequestSchema,
                    async ({ params }): Promise<ListResourcesResult> => {
                        console.log(logPrefix, "Requested resources list:", params);
                        const client = await getClient();
                        const response = await client.listResources(params);
                        console.log(logPrefix, "Response:", response);
                        return response;
                    },
                );
                server.setRequestHandler(ListResourceTemplatesRequestSchema, async ({ params }) => {
                    console.log(logPrefix, "Requested resource templates list:", params);
                    const client = await getClient();
                    const response = await client.listResourceTemplates(params);
                    console.log(logPrefix, "Response:", response);
                    return response;
                });
                server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
                    console.log(logPrefix, "Requested to read a resource:", params);
                    const client = await getClient();
                    const response = await client.readResource(params);
                    console.log(logPrefix, "Response:", response);
                    return response;
                });
                // TODO: prompts, ...

                res.on("close", async () => {
                    --connectionsCount;
                    console.log(logPrefix, "HTTP request closed");
                    console.log(logPrefix, "Active connections count:", connectionsCount);
                    await server.close();
                    if (transport && connectionsCount === 0) {
                        console.log(logPrefix, "Disconnecting from the proxy client...");
                        transport = undefined;
                        await client.close();
                    }
                });

                const serverTransport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined, // stateless mode
                });
                await server.connect(
                    new TransportLoggerProxy(serverTransport, {
                        log: (...args: any[]) => console.log(logPrefix, "[server]", ...args),
                    }),
                );
                await serverTransport.handleRequest(req, res, req.body);
                console.log(logPrefix, "Finished handling request");
            } catch (error) {
                console.warn(logPrefix, "Error handling request:", error);
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

class TransportLoggerProxy implements Transport {
    constructor(
        private readonly transport: Transport,
        private readonly logger: { log: (...args: any[]) => void },
    ) {
        logger.log("[Proxy:constructor]");

        transport.onmessage = (message, extra) => {
            logger.log("[Proxy:onMessage]", message);
            return this.onmessage?.(message, extra);
        };
        transport.onerror = (error) => {
            logger.log("[Proxy:onError]", error);
            return this.onerror?.(error);
        };
        transport.onclose = () => {
            logger.log("[Proxy:onClose]");
            return this.onclose?.();
        };
    }
    start() {
        this.logger.log("[Proxy:start]");
        return this.transport.start();
    }
    send(message: JSONRPCMessage, options?: TransportSendOptions) {
        this.logger.log("[Proxy:send]", message, options);
        return this.transport.send(message, options);
    }
    close() {
        this.logger.log("[Proxy:close]");
        return this.transport.close();
    }
    onclose?: (() => void) | undefined;
    onerror?: ((error: Error) => void) | undefined;
    onmessage?: ((message: JSONRPCMessage, extra?: MessageExtraInfo) => void) | undefined;
    get sessionId(): string | undefined {
        this.logger.log("[Proxy:getSessionId]", this.transport.sessionId);
        return this.transport.sessionId;
    }
    set sessionId(value: string | undefined) {
        this.logger.log("[Proxy:setSessionId]", value);
        this.transport.sessionId = value;
    }
    setProtocolVersion(version: string) {
        this.transport.setProtocolVersion?.(version);
    }
}
