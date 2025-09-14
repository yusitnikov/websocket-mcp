import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";
import { Server as HttpServer } from "http";
import { log } from "../utils.js";

/**
 * WebSocket server transport for Model Context Protocol.
 * Accepts browser WebSocket connections and acts as an MCP transport.
 */
export class WebSocketServerTransport implements Transport {
    private readonly connections = new Set<WebSocket>();
    private readonly wsServer: WebSocketServer;

    public sessionId?: string;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

    constructor(server: HttpServer) {
        this.wsServer = new WebSocketServer({ server });

        this.wsServer.on("connection", (ws) => {
            this.connections.add(ws);

            log(`New WebSocket connection established. Total connections: ${this.connections.size}`);

            ws.on("message", (data) => {
                log("Got a message!", data.toString());

                try {
                    const message = JSON.parse(data.toString()) as JSONRPCMessage;
                    const extra: MessageExtraInfo = {};

                    if (this.onmessage) {
                        this.onmessage(message, extra);
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

                // If this was the last connection and we have an onclose handler
                if (this.connections.size === 0 && this.onclose) {
                    this.onclose();
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
     * Starts accepting WebSocket connections
     */
    async start(): Promise<void> {
        log("start() called");
    }

    /**
     * Sends a JSON-RPC message to the connected browser
     */
    async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
        // Validate connection count on-demand
        if (this.connections.size === 0) {
            throw new Error("No browser tabs connected");
        }

        if (this.connections.size > 1) {
            throw new Error(`Expected 1 browser connection, got ${this.connections.size}`);
        }

        const connection = this.connections.values().next().value;

        if (!connection || connection.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket connection is not open");
        }

        try {
            const messageToSend = {
                ...message,
                ...(options?.resumptionToken && { resumptionToken: options.resumptionToken }),
                ...(options?.relatedRequestId && { relatedRequestId: options.relatedRequestId }),
            };

            connection!.send(JSON.stringify(messageToSend));
        } catch (error) {
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Closes all WebSocket connections and stops the server
     */
    async close(): Promise<void> {
        log("close() called");

        // Close all active connections
        for (const ws of this.connections) {
            ws.close();
        }
        this.connections.clear();

        // Close the WebSocket server
        if (this.wsServer) {
            this.wsServer.close();
        }

        log("WebSocket server transport closed");
    }

    /**
     * Sets the protocol version for this connection
     */
    setProtocolVersion(version: string): void {
        // Store protocol version if needed
        log(`WebSocket transport protocol version set to: ${version}`);
    }

    /**
     * Handles errors by invoking the error callback if available
     */
    private handleError(error: Error): void {
        log("WebSocket server transport error:", error);
        if (this.onerror) {
            this.onerror(error);
        }
    }
}
