import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ErrorCode, JSONRPCMessage, McpError, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { AbortablePromise, sleep } from "utils";

export interface WebSocketClientTransportOptions {
    url: string;
    /**
     * Initial reconnection delay in milliseconds. Default: 1000
     */
    reconnectDelay?: number;
    /**
     * Maximum reconnection delay in milliseconds. Default: 3000
     */
    maxReconnectDelay?: number;
    /**
     * Connection timeout in milliseconds. Default: 1000
     */
    connectionTimeout?: number;
}

/**
 * WebSocket client transport for Model Context Protocol.
 * Implements the Transport interface with WebSocket communication.
 */
export class WebSocketClientTransport implements Transport {
    private ws: WebSocket | null = null;
    private url: string;
    private reconnectDelay: number;
    private maxReconnectDelay: number;
    private connectionTimeout: number;

    private isClosedIntentionally = false;

    public sessionId?: string;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

    constructor(options: WebSocketClientTransportOptions) {
        this.url = options.url;
        this.reconnectDelay = options.reconnectDelay ?? 1000;
        this.maxReconnectDelay = options.maxReconnectDelay ?? 3000;
        this.connectionTimeout = options.connectionTimeout ?? 1000;
    }

    get isConnected() {
        return this.ws !== null;
    }

    private connectPromise?: AbortablePromise<void>;

    private connect() {
        console.log("Starting to connect!");

        this.connectPromise = new AbortablePromise<void>((resolve, reject, signal) => {
            (async () => {
                try {
                    for (let attempt = 1; !signal.aborted; attempt++) {
                        try {
                            await this.tryToConnect(signal);
                            break;
                        } catch (error) {
                            if (signal.aborted) {
                                break;
                            }
                            console.warn(`Connect attempt ${attempt} failed:`, error);
                            await sleep(Math.min(this.reconnectDelay * Math.pow(2, attempt), this.maxReconnectDelay));
                        }
                    }

                    console.log("Finished connecting!");

                    resolve();
                } catch (error) {
                    console.log("Aborted connecting");
                    reject(error);
                }
            })();
        });

        return this.connectPromise;
    }

    private async tryToConnect(connectPromise: AbortSignal) {
        const ws = new WebSocket(this.url);

        connectPromise.addEventListener("abort", () => {
            console.log("Got abort signal!");
            ws.close();
        });

        await Promise.race([
            sleep(this.connectionTimeout).then(() => {
                throw new McpError(
                    ErrorCode.RequestTimeout,
                    `WebSocket connection timeout after ${this.connectionTimeout}ms`,
                );
            }),
            new Promise<void>((resolve, reject) => {
                const onClose = ({ code, reason }: CloseEvent) => {
                    console.log("Connection closed on startup", code, reason);
                    reject(new Error(reason));
                };

                ws.addEventListener("close", onClose);

                ws.addEventListener("open", () => {
                    ws.removeEventListener("close", onClose);

                    if (connectPromise.aborted) {
                        reject(new Error("Requested to close the connection"));
                        return;
                    }

                    console.log(`WebSocket connected to ${this.url}`);
                    this.ws = ws;
                    resolve();
                });
            }),
        ]);

        ws.addEventListener("message", ({ data }) => {
            if (connectPromise.aborted) {
                console.log("Got a message, but it's not the active socket anymore");
                return;
            }

            try {
                const message = JSON.parse(data.toString()) as JSONRPCMessage;

                // Handle resumption token updates if present
                const extra: MessageExtraInfo | undefined = undefined;

                this.onmessage?.(message, extra);
            } catch (error) {
                console.warn("Failed to parse message:", error);
                this.onerror?.(
                    new McpError(
                        ErrorCode.ParseError,
                        `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
                    ),
                );
            }
        });

        ws.addEventListener("close", ({ code, reason }) => {
            if (connectPromise.aborted) {
                console.log("Closed the connection, but it's not the active socket anymore");
                return;
            }

            console.log(`WebSocket closed with code ${code}: ${reason}`);

            this.ws = null;

            if (!this.isClosedIntentionally) {
                this.connect();
            }
        });

        ws.addEventListener("error", (ev) => {
            if (connectPromise.aborted) {
                console.log("Got an error, but it's not the active socket anymore");
                return;
            }

            console.warn("WebSocket error:", ev);
            this.onerror?.(new McpError(ErrorCode.InternalError, "Unknown socket error"));
        });
    }

    /**
     * Starts the WebSocket connection and message processing
     */
    async start(): Promise<void> {
        console.log("Requested to start");

        this.isClosedIntentionally = false;

        await (this.connectPromise ?? this.connect());
    }

    /**
     * Closes the WebSocket connection
     */
    async close() {
        console.log("Requested to close");

        this.isClosedIntentionally = true;

        this.ws = null;
        this.connectPromise?.abort();
        this.connectPromise = undefined;
    }

    /**
     * Sends a JSON-RPC message over the WebSocket connection
     */
    async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket is not connected");
        }

        try {
            const messageToSend = {
                ...message,
                ...(options?.resumptionToken && { resumptionToken: options.resumptionToken }),
                ...(options?.relatedRequestId && { relatedRequestId: options.relatedRequestId }),
            };

            this.ws.send(JSON.stringify(messageToSend));
        } catch (error) {
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sets the protocol version for this connection
     */
    setProtocolVersion(version: string): void {
        console.log("Protocol version is", version);
    }
}
