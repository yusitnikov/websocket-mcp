import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketClientTransport } from "@main/transports/WebSocketClientTransport.js";
import { log } from "@main/utils.js";

/**
 * Simple MCP server that demonstrates WebSocket connectivity
 * This server will connect as a client to the main WebSocket server
 */
export class DemoMcpServer {
    private server: Server;
    private isConnected = false;

    constructor() {
        this.server = new Server(
            {
                name: "demo-mcp-server",
                version: "1.0.0",
                title: "Demo MCP Server"
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

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
                                    description: "Message to echo back"
                                }
                            }
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name === "demo_ping") {
                const message = request.params.arguments?.message || "Hello from demo!";
                return {
                    content: [
                        {
                            type: "text",
                            text: `Pong! You said: ${message}`
                        }
                    ]
                };
            }

            throw new Error(`Unknown tool: ${request.params.name}`);
        });
    }

    /**
     * Connect to the main MCP server via WebSocket and start the MCP server with this transport
     */
    async connectToMainServer(url: string): Promise<void> {
        try {
            log(`Attempting to connect to main MCP server at: ${url}`);

            const transport = new WebSocketClientTransport({
                url,
                maxReconnectAttempts: 3,
                reconnectDelay: 1000
            });

            // Connect the MCP server to this transport - server handles transport start
            await this.server.connect(transport);

            this.isConnected = true;
            log("Successfully connected MCP server to main server!");

        } catch (error) {
            log("Failed to connect to main server:", error);
            throw error;
        }
    }


    /**
     * Get connection status
     */
    getConnectionStatus(): { connected: boolean } {
        return {
            connected: this.isConnected
        };
    }

    /**
     * Disconnect from main server
     */
    async disconnect(): Promise<void> {
        await this.server.close();
        this.isConnected = false;
        log("Disconnected from main server");
    }
}