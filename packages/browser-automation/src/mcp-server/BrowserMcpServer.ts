import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ExtensionAutomationClient } from "../extension-automation-client/ExtensionAutomationClient";
import { Logger } from "./Logger";
import { z } from "zod/v4";
import sift from "sift";

/**
 * MCP server for browser automation via the Chrome extension.
 *
 * Provides tools:
 * - list_tabs: List all open browser tabs
 * - execute_js: Execute JavaScript in a browser tab
 */
export class BrowserMcpServer {
    private readonly server: McpServer;
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
        this.server = new McpServer(
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
        this.server.registerTool(
            "initiate_session",
            {
                description:
                    "Initiate a browser automation session. Shows an approval dialog to the user with the session code. Returns a session token and extension connection ID on approval, or indicates rejection.",
                inputSchema: z.object({
                    sessionCode: z
                        .string()
                        .describe(
                            "A short, readable code shown to the user in the approval dialog to confirm the session is legitimate",
                        ),
                    hostnames: z
                        .array(
                            z.string().describe(`
                                Either exact hostname (e.g. "google.com") or a hostname mask that starts with "*." (e.g. "*.github.com") to match subdomains as well.
                                Only one "*" character is allowed in the mask - in the start of the mask, followed with a dot (e.g. "mail.*.com" and "*claude.ai" are NOT allowed).
                                Subdomain mask will match the base domain as well, e.g. "*.google.com" will match both "translate.google.com" and "google.com" itself.
                            `),
                        )
                        .optional()
                        .describe(
                            "Request to access tabs with specific hostnames. Skip to request access to all tabs.",
                        ),
                }),
            },
            async ({ sessionCode, hostnames }) => {
                this.logger?.log(`Initiating session with code: ${sessionCode}`);

                const result = await this.client.initiateSession(sessionCode, hostnames);

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
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({ approved: false }),
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );

        this.server.registerTool(
            "list_tabs",
            {
                description: "List all open browser tabs",
                inputSchema: z.object({
                    extensionConnectionId: z
                        .string()
                        .describe("Extension connection ID obtained from initiate_session"),
                    sessionToken: z.string().describe("Session token obtained from initiate_session"),
                    tabProps: z
                        .array(
                            z.enum<(keyof chrome.tabs.Tab)[]>([
                                "id",
                                "title",
                                "url",
                                "active",
                                "status",
                                "discarded",
                                "windowId",
                                "index",
                                "groupId",
                                "splitViewId",
                                "openerTabId",
                                "highlighted",
                                "lastAccessed",
                                "pinned",
                                "audible",
                                "frozen",
                                "autoDiscardable",
                                "mutedInfo",
                                "pendingUrl",
                                "favIconUrl",
                                "incognito",
                                "sessionId",
                                "width",
                                "height",
                            ]),
                        )
                        .default(["id", "title", "url", "active", "status", "discarded", "windowId"])
                        .describe(
                            "Which tab properties to return in the response. Please specify as few fields as possible that are enough to achieve your goal, in order to save the traffic.",
                        ),
                    tabFilter: z.record(z.string(), z.unknown()).optional().describe(`
                        Filter tabs by criteria (all tabs are returned by default).
                        It's highly recommended to pass a filter here to save the response traffic.

                        The filter is a sift-compatible MongoDB filter object, e.g. {
                            active: true,
                            url: { $regex: "://google.com/" },
                            title: { $regex: "browser automation", $options: "i" }
                        }.

                        You can filter by any tab property that is supported by tabProps.
                    `),
                }),
            },
            async ({ extensionConnectionId, sessionToken, tabProps, tabFilter }) => {
                const allTabs = await this.client.listTabs(sessionToken, extensionConnectionId);

                let tabs = allTabs;
                if (tabFilter) {
                    const filter = sift(tabFilter);
                    tabs = allTabs.filter(filter);
                }

                this.logger?.log(`Found ${tabs.length} matching browser tabs`);

                const truncationLimit = 80;

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(
                                tabs.map((tab) =>
                                    Object.fromEntries(
                                        Object.entries(tab)
                                            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                                            .filter(([key]) => tabProps.includes(key as keyof chrome.tabs.Tab))
                                            .map(([key, value]) => [
                                                key,
                                                typeof value === "string" && value.length > truncationLimit
                                                    ? `${value.substring(0, truncationLimit)}… (truncated)`
                                                    : value,
                                            ]),
                                    ),
                                ),
                                null,
                                2,
                            ),
                        },
                    ],
                };
            },
        );

        this.server.registerTool(
            "execute_js",
            {
                description: "Execute JavaScript code in a browser tab and return the result",
                inputSchema: z.object({
                    extensionConnectionId: z
                        .string()
                        .describe("Extension connection ID obtained from initiate_session"),
                    sessionToken: z.string().describe("Session token obtained from initiate_session"),
                    tabId: z.number().describe("ID of the browser tab to execute code in (from list_tabs)"),
                    code: z.string().describe("JavaScript code to execute, compatible with `eval`"),
                }),
            },
            async ({ extensionConnectionId, sessionToken, tabId, code }) => {
                this.logger?.log(`Executing JS in tab ${tabId}: ${code.substring(0, 100)}...`);

                const result = await this.client.executeJs(sessionToken, extensionConnectionId, tabId, code);

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
                    const errorText =
                        result.stack ?? (result.name ? `${result.name}: ${result.message}` : result.message);

                    this.logger?.error(`JS execution failed: ${result.message}`);

                    return {
                        content: [
                            {
                                type: "text",
                                text: errorText,
                            },
                        ],
                        isError: true,
                    };
                }
            },
        );
    }
}
