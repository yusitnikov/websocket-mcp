import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { log } from "../utils.js";

export interface WebSocketClientTransportOptions {
    url: string;
    /**
     * Maximum number of reconnection attempts. Default: 5
     */
    maxReconnectAttempts?: number;
    /**
     * Initial reconnection delay in milliseconds. Default: 1000
     */
    reconnectDelay?: number;
    /**
     * Maximum reconnection delay in milliseconds. Default: 30000
     */
    maxReconnectDelay?: number;
    /**
     * WebSocket protocols to use during connection
     */
    protocols?: string | string[];
    /**
     * Connection timeout in milliseconds. Default: 10000
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
    private maxReconnectAttempts: number;
    private reconnectDelay: number;
    private maxReconnectDelay: number;
    private protocols?: string | string[];
    private connectionTimeout: number;

    private reconnectAttempts = 0;
    private reconnectTimeoutId: NodeJS.Timeout | null = null;
    private connectionTimeoutId: NodeJS.Timeout | null = null;
    private isClosedIntentionally = false;
    // @ts-ignore
    private protocolVersion?: string;

    public sessionId?: string;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

    constructor(options: WebSocketClientTransportOptions) {
        this.url = options.url;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
        this.reconnectDelay = options.reconnectDelay ?? 1000;
        this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
        this.protocols = options.protocols;
        this.connectionTimeout = options.connectionTimeout ?? 10000;
    }

    /**
     * Starts the WebSocket connection and message processing
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connect(resolve, reject);
        });
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
     * Closes the WebSocket connection
     */
    async close(): Promise<void> {
        this.isClosedIntentionally = true;

        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }

        if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Sets the protocol version for this connection
     */
    setProtocolVersion(version: string): void {
        this.protocolVersion = version;
    }

    /**
     * Establishes WebSocket connection with error handling and timeout
     */
    private connect(resolve?: () => void, reject?: (error: Error) => void): void {
        try {
            this.ws = new WebSocket(this.url, this.protocols);

            // Set connection timeout
            this.connectionTimeoutId = setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                    const error = new Error(`WebSocket connection timeout after ${this.connectionTimeout}ms`);
                    if (reject) {
                        reject(error);
                    } else {
                        this.handleError(error);
                    }
                }
            }, this.connectionTimeout);

            this.ws.addEventListener("open", () => {
                if (this.connectionTimeoutId) {
                    clearTimeout(this.connectionTimeoutId);
                    this.connectionTimeoutId = null;
                }

                this.reconnectAttempts = 0;
                log(`WebSocket connected to ${this.url}`);

                if (resolve) {
                    resolve();
                }
            });

            this.ws.addEventListener("message", ({ data }) => {
                try {
                    const message = JSON.parse(data.toString()) as JSONRPCMessage;

                    // Handle resumption token updates if present
                    const extra: MessageExtraInfo | undefined = undefined;

                    if (this.onmessage) {
                        this.onmessage(message, extra);
                    }
                } catch (error) {
                    this.handleError(
                        new Error(`Failed to parse message: ${error instanceof Error ? error.message : String(error)}`),
                    );
                }
            });

            this.ws.addEventListener("close", ({ code, reason }) => {
                if (this.connectionTimeoutId) {
                    clearTimeout(this.connectionTimeoutId);
                    this.connectionTimeoutId = null;
                }

                log(`WebSocket closed with code ${code}: ${reason}`);

                if (!this.isClosedIntentionally && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.scheduleReconnect();
                } else {
                    if (this.onclose) {
                        this.onclose();
                    }
                }
            });

            this.ws.addEventListener("error", (ev) => {
                if (this.connectionTimeoutId) {
                    clearTimeout(this.connectionTimeoutId);
                    this.connectionTimeoutId = null;
                }

                log("WebSocket error:", ev);
                const error = new Error("Unknown socket error");
                if (reject) {
                    reject(error);
                } else {
                    this.handleError(error);
                }
            });
        } catch (error) {
            const err = new Error(
                `Failed to create WebSocket connection: ${error instanceof Error ? error.message : String(error)}`,
            );
            if (reject) {
                reject(err);
            } else {
                this.handleError(err);
            }
        }
    }

    /**
     * Schedules a reconnection attempt with exponential backoff
     */
    private scheduleReconnect(): void {
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);

        this.reconnectAttempts++;

        log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimeoutId = setTimeout(() => {
            this.reconnectTimeoutId = null;
            this.connect();
        }, delay);
    }

    /**
     * Handles errors by invoking the error callback if available
     */
    private handleError(error: Error): void {
        log("WebSocket transport error:", error);
        if (this.onerror) {
            this.onerror(error);
        }
    }
}
