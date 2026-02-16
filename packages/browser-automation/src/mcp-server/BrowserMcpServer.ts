import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BrokerClient } from "@sitnikov/connection-broker/client";
import type { BrowserCommand, BrowserResponse } from "../tab-client/BrowserTabClient";
import { Logger } from "./Logger";

/**
 * MCP server for browser automation.
 *
 * Provides tools:
 * - list_tabs: List all connected browser tabs
 * - execute_js: Execute JavaScript in a browser tab
 *
 * Uses the generic connection broker to communicate with browser tabs.
 */
export class BrowserMcpServer {
    private server: Server;
    private logger: Logger;
    private brokerUrl = "";

    constructor(logFilePath: string) {
        this.logger = new Logger(logFilePath);
        this.server = new Server(
            {
                name: "browser-automation",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        this.setupHandlers();
    }

    /**
     * Start the MCP server.
     *
     * @param brokerUrl - WebSocket URL of the connection broker
     * @param transport - MCP transport (default: stdio)
     */
    async start(brokerUrl: string, transport: "stdio" | "http" = "stdio"): Promise<void> {
        this.brokerUrl = brokerUrl;

        // Start MCP server
        if (transport === "stdio") {
            await this.server.connect(new StdioServerTransport());
            this.logger.log("MCP server running on stdio");
        } else {
            throw new Error("HTTP transport not yet implemented");
        }
    }

    /**
     * Create a temporary broker connection for a single operation.
     */
    private async withBroker<T>(fn: (broker: BrokerClient) => Promise<T>): Promise<T> {
        const broker = new BrokerClient(this.brokerUrl, "mcp-server", this.logger);

        try {
            await broker.connect();
            return await fn(broker);
        } finally {
            broker.disconnect();
        }
    }

    private setupHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "list_tabs",
                    description: "List all connected browser tabs",
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: [],
                    },
                },
                {
                    name: "execute_js",
                    description: "Execute JavaScript code in a browser tab and return the result",
                    inputSchema: {
                        type: "object",
                        properties: {
                            tabId: {
                                type: "string",
                                description: "ID of the browser tab to execute code in",
                            },
                            code: {
                                type: "string",
                                description: "JavaScript code to execute",
                            },
                        },
                        required: ["tabId", "code"],
                    },
                },
            ],
        }));

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
            try {
                if (params.name === "list_tabs") {
                    return await this.handleListTabs();
                } else if (params.name === "execute_js") {
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    return await this.handleExecuteJs(params.arguments as { tabId: string; code: string });
                } else {
                    // noinspection ExceptionCaughtLocallyJS
                    throw new Error(`Unknown tool: ${params.name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    private async handleListTabs() {
        const ids = await this.withBroker(async (broker) => {
            return await broker.listByRole("browser-tab");
        });

        this.logger.log(`Found ${ids.length} browser tabs`);

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(ids, null, 2),
                },
            ],
        };
    }

    private async handleExecuteJs(args: { tabId: string; code: string }) {
        const { tabId, code } = args;

        this.logger.log(`Executing JS in tab ${tabId}: ${code.substring(0, 100)}...`);

        return await this.withBroker(async (broker) => {
            // Open channel to the tab
            const channel = await broker.openChannel(tabId);

            // Send command and wait for response
            const result = await new Promise<BrowserResponse>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Timeout waiting for response (30s)"));
                }, 30000);

                channel.onMessage = (payload: unknown) => {
                    clearTimeout(timeout);
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    resolve(payload as BrowserResponse);
                };

                channel.onClosed = () => {
                    clearTimeout(timeout);
                    reject(new Error("Channel closed before receiving response"));
                };

                const command: BrowserCommand = {
                    action: "execute_js",
                    code,
                };

                channel.send(command);
            });

            if (result.success) {
                this.logger.log("JS execution successful");

                return {
                    content: [
                        {
                            type: "text",
                            text: result.result,
                        },
                    ],
                };
            } else {
                this.logger.error(`JS execution failed: ${result.error}`);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${result.error}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
}
