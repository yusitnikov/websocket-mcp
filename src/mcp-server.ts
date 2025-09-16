import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Command } from "commander";
import http from "http";
import { McpClientsManager } from "./McpClientsManager";
import { log } from "./utils.ts";
import { WebSocketServerManager } from "./WebSocketServerManager.ts";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const program = new Command();
program.description("MCP Proxy Server").option("-p, --port <port>", "port to run the server on", "3003");

program.parse();
const { port } = program.opts();

(async () => {
    // HTTP mode with WebSocket support
    const app = express();
    app.use(express.json());

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Listen to web sockets
    const webSocketServerManager = new WebSocketServerManager(httpServer);

    // Initialize clients manager with HTTP server
    const clientsManager = new McpClientsManager(webSocketServerManager);

    const serverNames = clientsManager.getEnabledServerNames();
    log("Found enabled servers:", serverNames);

    for (const serverName of serverNames) {
        app.post(`/${serverName}`, async (req, res) => {
            log("HTTP request!");
            log(req.body);

            try {
                log(`Connecting to server: ${serverName}`);

                const inputTransport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined, // stateless mode
                });
                const outputTransport = clientsManager.getTransport(serverName);

                inputTransport.onmessage = (message, extra) => {
                    log(`[${serverName}]`);
                    log("<<<", JSON.stringify(message, null, 4), JSON.stringify(extra, null, 4));
                    outputTransport.send(message, {}).catch((error) => {
                        log(`[${serverName}]`);
                        log("<<< Failed to forward the message to outputTransport:", error);
                    });
                };
                outputTransport.onmessage = (message, extra) => {
                    log(`[${serverName}]`);
                    log(">>>", JSON.stringify(message, null, 4), JSON.stringify(extra, null, 4));
                    inputTransport.send(message, {}).catch((error) => {
                        log(`[${serverName}]`);
                        log(">>> Failed to forward the message to inputTransport:", error);
                    });
                };
                inputTransport.onerror = (error) => {
                    log(`[${serverName}]`);
                    log("<<< ERROR:", error);
                    // TODO
                };
                outputTransport.onerror = (error) => {
                    log(`[${serverName}]`);
                    log(">>> ERROR:", error);
                    // TODO
                };
                inputTransport.onclose = () => {
                    log(`[${serverName}]`);
                    log("<<< CLOSE");
                    // TODO
                };
                outputTransport.onclose = () => {
                    log(`[${serverName}]`);
                    log(">>> CLOSE");
                    // TODO
                };

                await outputTransport.start();
                await inputTransport.start();

                res.on("close", async () => {
                    log("HTTP request closed");
                    await inputTransport.close();
                    await outputTransport.close();
                });

                await inputTransport.handleRequest(req, res, req.body);
                log("Finished handling request");
            } catch (error) {
                log("Error handling MCP request:", error);
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

    httpServer.listen(Number(port), () => {
        log(`MCP HTTP Server running on port ${port}`);
        log(`HTTP endpoint: http://localhost:${port}/mcp`);
        log(`WebSocket endpoint: ws://localhost:${port}`);
    });
})();
