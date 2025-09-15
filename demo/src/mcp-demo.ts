import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketClientTransport } from "@main/transports/WebSocketClientTransport.js";
import { log } from "@main/utils.js";

/**
 * Simple MCP server that demonstrates WebSocket connectivity
 * This server will connect as a client to the main WebSocket server
 */
export class DemoMcpServer {
    private readonly server: Server;
    private readonly transport: WebSocketClientTransport;

    constructor(url: string) {
        this.server = new Server(
            {
                name: "demo-mcp-server",
                version: "1.0.0",
                title: "Demo MCP Server",
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        this.transport = new WebSocketClientTransport({ url });

        this.setupTools();
    }

    private setupTools(): void {
        // Register a simple demo tool
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "demo_ping",
                        description: "A simple ping tool that returns pong",
                        inputSchema: {
                            type: "object",
                            properties: {
                                message: {
                                    type: "string",
                                    description: "Message to echo back",
                                },
                            },
                        },
                    },
                ],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === "demo_ping") {
                const message = request.params.arguments?.message || "Hello from demo!";
                return {
                    content: [
                        {
                            type: "text",
                            text: `Pong! You said: ${message}`,
                        },
                    ],
                };
            }

            throw new Error(`Unknown tool: ${request.params.name}`);
        });
    }

    /**
     * Connect to the main MCP server via WebSocket and start the MCP server with this transport
     */
    async connectToMainServer() {
        try {
            log("Attempting to connect to the main MCP server");

            // Connect the MCP server to this transport - server handles transport start
            await this.server.connect(this.transport);

            log("Successfully connected MCP server to main server!");
        } catch (error) {
            log("Failed to connect to main server:", error);
            throw error;
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            connected: this.transport.isConnected,
        };
    }
}
