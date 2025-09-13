import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

(async () => {
    try {
        await server.connect(new StdioServerTransport());
        log("Running!");
    } catch (error) {
        log("Fatal error:", error);
        process.exit(1);
    }
})();
