/// <reference lib="webworker" />

import { TabSyncServer } from "@sitnikov/tab-sync";
import { McpServerPingData } from "./types.ts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebSocketClientTransport } from "websocket-mcp/frontend";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

declare const self: SharedWorkerGlobalScope;

// Extract serverName from URL parameters
const urlParams = new URLSearchParams(self.location.search);
const serverName = urlParams.get("serverName") || "demo";

const tabSyncServer = new TabSyncServer<McpServerPingData>({
    scope: self,
    getExtraPingData: () => ({ connected: mcpTransport.isConnected }),
});

const mcpServer = new Server(
    {
        name: `demo-mcp-server-${serverName}`,
        version: "1.0.0",
        title: `Demo MCP Server (${serverName})`,
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
    },
);

// region Implement MCP request handlers
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
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
            {
                name: "get_tabs",
                description: "Get the list of all tabs connected to the tool",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "confirm",
                description: "Show a confirmation dialog to a specific tab",
                inputSchema: {
                    type: "object",
                    properties: {
                        message: {
                            type: "string",
                            description: "Message to show in the confirmation dialog",
                        },
                        tabId: {
                            type: "number",
                            description:
                                "ID of the tab to show the confirmation dialog to. You can know the list of available tabs by calling the get_tabs tool.",
                        },
                    },
                    required: ["message", "tabId"],
                },
            },
        ],
    };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    switch (params.name) {
        case "demo_ping":
            const message = params.arguments?.message || "Hello from demo!";
            return {
                content: [
                    {
                        type: "text",
                        text: `Pong! I'm ${serverName}. You said: ${message}`,
                    },
                ],
            };
        case "get_tabs": {
            const activeTabs = tabSyncServer.activeTabs;

            let text = `There are ${activeTabs.length} tabs connected to the shared worker.`;

            for (const tab of activeTabs) {
                text += `\n- ID: ${tab.id}; Title: "${tab.dynamicInfo!.title}"`;
            }

            return {
                content: [
                    {
                        type: "text",
                        text,
                    },
                ],
            };
        }
        case "confirm": {
            const message = params.arguments?.message as string;
            const tabId = params.arguments?.tabId as number;

            try {
                const result = await tabSyncServer.sendMessageToTab<string, boolean>(tabId, "confirm", message, 10000);

                return {
                    content: [
                        {
                            type: "text",
                            text: result ? "Confirmed" : "Rejected",
                        },
                    ],
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error showing confirmation to tab ${tabId}: ${errorMessage}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    }

    throw new Error(`Unknown tool: ${params.name}`);
});

mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                name: "test-resource-name",
                title: "Test Resource Title",
                uri: "stam://file/path/example.json",
                mimeType: "text/json",
            },
        ],
    };
});

mcpServer.setRequestHandler(ReadResourceRequestSchema, async ({ params }): Promise<ReadResourceResult> => {
    console.log(`Requested ${params.uri}`);

    return {
        contents: [
            {
                uri: params.uri,
                mimeType: "text/json",
                text: JSON.stringify({ foo: "bar" }),
            },
        ],
    };
});
// endregion

const mcpTransport = new WebSocketClientTransport({ url: `ws://localhost:3003/${serverName}` });

tabSyncServer.start();

// Initialize MCP connection when shared worker starts
(async () => {
    try {
        console.log("Auto-connecting to MCP server...");
        await mcpServer.connect(mcpTransport);
        console.log("MCP connection established");
    } catch (error) {
        console.warn("MCP connection failed:", error);
    }

    // Notify the tabs about the connection status
    tabSyncServer.pingAllTabs();
})();
