import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { log } from "./utils.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

interface Connection {
    ws: WebSocket;
    url: string;
}

export class WebSocketServerManager {
    private readonly connections = new Set<Connection>();
    private readonly wsServer: WebSocketServer;

    public readonly onClose = new Set<() => void>();
    public readonly onError = new Set<(error: Error) => void>();
    public readonly onMessage = new Set<(message: any) => void>();

    constructor(server: Server) {
        this.wsServer = new WebSocketServer({ server });

        this.wsServer.on("connection", (ws, { url = "/" }) => {
            const connection: Connection = { ws, url };
            this.connections.add(connection);

            log(`New WebSocket connection established at ${url}`);
            this.logConnections();

            ws.on("message", (data) => {
                const dataStr = data.toString();

                try {
                    const message = JSON.parse(dataStr);

                    for (const handler of this.onMessage) {
                        handler(message);
                    }
                } catch (error) {
                    this.handleError(
                        new Error(`Failed to parse message: ${error instanceof Error ? error.message : String(error)}`),
                    );
                }
            });

            ws.on("close", (code, reason) => {
                this.connections.delete(connection);
                log(`WebSocket connection to ${url} closed with code ${code}: ${reason.toString()}.`);
                this.logConnections();

                // If this was the last connection
                if (this.connections.size === 0) {
                    for (const handler of this.onClose) {
                        handler();
                    }
                }
            });

            ws.on("error", (error) => {
                this.connections.delete(connection);
                log(`WebSocket connection error at ${url}:`, error);
                this.handleError(error);
            });
        });

        this.wsServer.on("error", (error) => {
            log("WebSocket server error:", error);
            this.handleError(error);
        });

        log("WebSocket server started");
    }

    logConnections() {
        log(`Total connections: ${this.connections.size}.`);
        for (const { ws, url } of this.connections) {
            log(`- ${url} (${ws.readyState})`);
        }
    }

    getActiveConnection(path: string) {
        // Filter connections by path
        const pathConnections = Array.from(this.connections).filter((conn) => conn.url === path);

        if (pathConnections.length === 0) {
            throw new McpError(ErrorCode.ConnectionClosed, `No browser tabs connected to path: ${path}`);
        }

        if (pathConnections.length > 1) {
            log(`Expected 1 browser connection at ${path}, got ${pathConnections.length}`);
            this.logConnections();
        }

        return pathConnections[0].ws;
    }

    /**
     * Sends a message to connection on the specified path
     */
    async send(path: string, message: any) {
        const connection = this.getActiveConnection(path);

        try {
            connection.send(JSON.stringify(message));
        } catch (error) {
            throw new Error(
                `Failed to send message to path ${path}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Handles errors by invoking the error callback if available
     */
    private handleError(error: Error): void {
        log("WebSocket server transport error:", error);
        for (const handler of this.onError) {
            handler(error);
        }
    }
}
