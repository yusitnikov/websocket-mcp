import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ExtensionAutomationClient } from "../extension-automation-client/ExtensionAutomationClient";
import { Logger } from "./Logger";

/**
 * MCP server for browser automation via the Chrome extension.
 *
 * Provides tools:
 * - list_tabs: List all open browser tabs
 * - execute_js: Execute JavaScript in a browser tab
 */
export class BrowserMcpServer {
    private readonly server: Server;
    private readonly logger: Logger | undefined;
    private readonly client: ExtensionAutomationClient;

    /**
     * @param logFilePath - Path to the log file (omit to disable logging)
     * @param brokerUrl - WebSocket URL of the connection broker
     * @param transport - MCP transport (default: stdio)
     */
    constructor(
        logFilePath: string | undefined,
        brokerUrl: string,
        private readonly transport: "stdio" | "http" = "stdio",
    ) {
        this.logger = logFilePath !== undefined ? new Logger(logFilePath) : undefined;
        this.client = new ExtensionAutomationClient(brokerUrl, this.logger);
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

    async start(): Promise<void> {
        if (this.transport === "stdio") {
            await this.server.connect(new StdioServerTransport());
            this.logger?.log("MCP server running on stdio");
        } else {
            throw new Error("HTTP transport not yet implemented");
        }
    }

    private setupHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "list_tabs",
                    description: "List all open browser tabs",
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
                                description: "ID of the browser tab to execute code in (from list_tabs)",
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
        const tabs = await this.client.listTabs();

        this.logger?.log(`Found ${tabs.length} browser tabs`);

        const MAX_URL_LENGTH = 80;
        const truncate = (str: string) =>
            str.length > MAX_URL_LENGTH ? `${str.substring(0, MAX_URL_LENGTH)}… (truncated)` : str;
        const lines = tabs.map((tab) => `[${tab.tabId}] ${truncate(tab.title)}\n        ${truncate(tab.url)}`);

        return {
            content: [
                {
                    type: "text",
                    text: lines.join("\n"),
                },
            ],
        };
    }

    private async handleExecuteJs(args: { tabId: string; code: string }) {
        const { tabId, code } = args;
        const tabIdNum = parseInt(tabId, 10);

        if (isNaN(tabIdNum)) {
            throw new Error(`Invalid tabId: ${tabId}`);
        }

        this.logger?.log(`Executing JS in tab ${tabId}: ${code.substring(0, 100)}...`);

        const result = await this.client.executeJs(tabIdNum, code);

        if (result.success && "result" in result) {
            this.logger?.log("JS execution successful");

            return {
                content: [
                    {
                        type: "text",
                        text: result.result,
                    },
                ],
            };
        } else if (!result.success && "message" in result) {
            const errorText = result.stack ?? (result.name ? `${result.name}: ${result.message}` : result.message);

            this.logger?.error(`JS execution failed: ${result.message}`);

            return {
                content: [{ type: "text", text: errorText }],
                isError: true,
            };
        } else {
            this.logger?.error("JS execution failed: unexpected response type");

            return {
                content: [{ type: "text", text: "Error: unexpected response type" }],
                isError: true,
            };
        }
    }
}
