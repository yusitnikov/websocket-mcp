import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
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

            console.log(`New WebSocket connection established at ${url}`);
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
                console.log(`WebSocket connection to ${url} closed with code ${code}: ${reason.toString()}.`);
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
                console.warn(`WebSocket connection error at ${url}:`, error);
                this.handleError(error);
            });
        });

        this.wsServer.on("error", (error) => {
            console.warn("WebSocket server error:", error);
            this.handleError(error);
        });

        console.log("WebSocket server started");
    }

    logConnections() {
        console.log(`Total connections: ${this.connections.size}.`);
        for (const { ws, url } of this.connections) {
            console.log(`- ${url} (${socketReadyStateMap[ws.readyState]})`);
        }
    }

    getActiveConnection(path: string) {
        // Filter connections by path
        const pathConnections = Array.from(this.connections).filter((conn) => conn.url === path);

        if (pathConnections.length === 0) {
            throw new McpError(ErrorCode.ConnectionClosed, `No browser tabs connected to path: ${path}`);
        }

        if (pathConnections.length > 1) {
            console.warn(`Expected 1 browser connection at ${path}, got ${pathConnections.length}`);
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
        console.warn("WebSocket server transport error:", error);
        for (const handler of this.onError) {
            handler(error);
        }
    }
}

const socketReadyStateMap = {
    [WebSocket.CONNECTING]: "connecting",
    [WebSocket.OPEN]: "open",
    [WebSocket.CLOSING]: "closing",
    [WebSocket.CLOSED]: "closed",
};
