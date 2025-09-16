import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { log } from "./utils.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

export class WebSocketServerManager {
    private readonly connections = new Set<WebSocket>();
    private readonly wsServer: WebSocketServer;

    public readonly onClose = new Set<() => void>();
    public readonly onError = new Set<(error: Error) => void>();
    public readonly onMessage = new Set<(message: any) => void>();

    constructor(server: Server) {
        this.wsServer = new WebSocketServer({ server });

        this.wsServer.on("connection", (ws) => {
            this.connections.add(ws);

            log(`New WebSocket connection established. Total connections: ${this.connections.size}`);

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
                this.connections.delete(ws);
                log(
                    `WebSocket connection closed with code ${code}: ${reason.toString()}. Remaining connections: ${this.connections.size}`,
                );

                // If this was the last connection
                if (this.connections.size === 0) {
                    for (const handler of this.onClose) {
                        handler();
                    }
                }
            });

            ws.on("error", (error) => {
                this.connections.delete(ws);
                log(`WebSocket connection error:`, error);
                this.handleError(error);
            });
        });

        this.wsServer.on("error", (error) => {
            log("WebSocket server error:", error);
            this.handleError(error);
        });

        log("WebSocket server started");
    }

    getActiveConnection() {
        // Validate connection count on-demand
        if (this.connections.size === 0) {
            throw new McpError(ErrorCode.ConnectionClosed, "No browser tabs connected");
        }

        if (this.connections.size > 1) {
            log(`Expected 1 browser connection, got ${this.connections.size}`);
            for (const connection of this.connections) {
                log(`- readyState: ${connection.readyState}`);
            }
        }

        return this.connections.values().next().value!;
    }

    /**
     * Sends a message to all connections
     */
    async send(message: any) {
        const connection = this.getActiveConnection();

        try {
            connection.send(JSON.stringify(message));
        } catch (error) {
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
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
