import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { log } from "./utils.js";

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
                log("Got a message!", dataStr);

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

    /**
     * Sends a message to all connections
     */
    async send(message: any) {
        log("Sending a message to web socket connections", message);

        // Validate connection count on-demand
        if (this.connections.size === 0) {
            throw new Error("No browser tabs connected");
        }

        if (this.connections.size > 1) {
            throw new Error(`Expected 1 browser connection, got ${this.connections.size}`);
        }

        const connection = this.connections.values().next().value!;

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
