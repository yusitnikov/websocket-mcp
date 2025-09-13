import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

const log = (...args: any[]) => {
    console.error(`[${new Date().toISOString()}]`, ...args);
};

const server = new McpServer(
    {
        name: "mcp-test",
        version: "1.0.0",
        title: "MCP Test",
    },
    { capabilities: { tools: {}, logging: {} } },
);

server.tool("test", "Test local MCP server", {}, async (args, extra) => {
    log("Got a connection!");
    log("Arguments:");
    const { sendNotification } = extra;
    log(args, extra);
    const progressToken = extra._meta?.progressToken;
    for (let progress = 0; progress <= 100; progress += 10) {
        log(`Progress: ${progress}%`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (progressToken) {
            await sendNotification({
                method: "notifications/progress",
                params: {
                    progressToken,
                    progress,
                    message: `Custom progress message - got ${progress}% now`,
                    total: 100,
                },
            });
        }
        await sendNotification({
            method: "notifications/message",
            params: { level: "info", data: `Progress is ${progress}%, by the way` },
        });
    }
    log("Finalized");
    return { content: [{ type: "text", text: "Finally it finished!" }] };
});

const app = express();
app.use(express.json());

app.post("/mcp", async (req: any, res: any) => {
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // stateless mode
        });

        res.on("close", () => {
            transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        log("Error handling MCP request:", error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: "2.0",
                error: {
                    code: -32603,
                    message: "Internal server error",
                },
                id: null,
            });
        }
    }
});

const PORT = 3002;
app.listen(PORT, () => {
    log(`MCP HTTP Server running on port ${PORT}`);
    log(`Connect to: http://localhost:${PORT}/mcp`);
});
