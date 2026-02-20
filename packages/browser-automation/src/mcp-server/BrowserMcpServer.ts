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
                        properties: {
                            session_token: {
                                type: "string",
                                description: "Session token obtained from initiate_session",
                            },
                            extension_connection_id: {
                                type: "string",
                                description: "Extension connection ID obtained from initiate_session",
                            },
                        },
                        required: ["session_token", "extension_connection_id"],
                    },
                },
                {
                    name: "execute_js",
                    description: "Execute JavaScript code in a browser tab and return the result",
                    inputSchema: {
                        type: "object",
                        properties: {
                            session_token: {
                                type: "string",
                                description: "Session token obtained from initiate_session",
                            },
                            extension_connection_id: {
                                type: "string",
                                description: "Extension connection ID obtained from initiate_session",
                            },
                            tabId: {
                                type: "string",
                                description: "ID of the browser tab to execute code in (from list_tabs)",
                            },
                            code: {
                                type: "string",
                                description: "JavaScript code to execute",
                            },
                        },
                        required: ["session_token", "extension_connection_id", "tabId", "code"],
                    },
                },
                {
                    name: "initiate_session",
                    description:
                        "Initiate a browser automation session. Shows an approval dialog to the user with the session code. Returns a session token and extension connection ID on approval, or indicates rejection.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            session_code: {
                                type: "string",
                                description:
                                    "A short, readable code shown to the user in the approval dialog to confirm the session is legitimate",
                            },
                        },
                        required: ["session_code"],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
            try {
                if (params.name === "list_tabs") {
                    type ListTabsArgs = { session_token: string; extension_connection_id: string };
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    return await this.handleListTabs(params.arguments as ListTabsArgs);
                } else if (params.name === "execute_js") {
                    type ExecuteJsArgs = { session_token: string; extension_connection_id: string; tabId: string; code: string };
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    return await this.handleExecuteJs(params.arguments as ExecuteJsArgs);
                } else if (params.name === "initiate_session") {
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    return await this.handleInitiateSession(params.arguments as { session_code: string });
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

    private async handleListTabs(args: { session_token: string; extension_connection_id: string }) {
        const tabs = await this.client.listTabs(args.session_token, args.extension_connection_id);

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

    private async handleExecuteJs(args: { session_token: string; extension_connection_id: string; tabId: string; code: string }) {
        const { session_token, extension_connection_id, tabId, code } = args;
        const tabIdNum = parseInt(tabId, 10);

        if (isNaN(tabIdNum)) {
            throw new Error(`Invalid tabId: ${tabId}`);
        }

        this.logger?.log(`Executing JS in tab ${tabId}: ${code.substring(0, 100)}...`);

        const result = await this.client.executeJs(session_token, extension_connection_id, tabIdNum, code);

        if (result.success) {
            this.logger?.log("JS execution successful");

            return {
                content: [
                    {
                        type: "text",
                        text: result.result,
                    },
                ],
            };
        } else {
            const errorText = result.stack ?? (result.name ? `${result.name}: ${result.message}` : result.message);

            this.logger?.error(`JS execution failed: ${result.message}`);

            return {
                content: [{ type: "text", text: errorText }],
                isError: true,
            };
        }
    }

    private async handleInitiateSession(args: { session_code: string }) {
        const { session_code } = args;

        this.logger?.log(`Initiating session with code: ${session_code}`);

        const result = await this.client.initiateSession(session_code);

        if (result.approved) {
            this.logger?.log("Session approved");
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            approved: true,
                            sessionToken: result.sessionToken,
                            extensionConnectionId: result.extensionConnectionId,
                        }),
                    },
                ],
            };
        } else {
            this.logger?.log("Session rejected by user");
            return {
                content: [{ type: "text", text: JSON.stringify({ approved: false }) }],
            };
        }
    }
}
