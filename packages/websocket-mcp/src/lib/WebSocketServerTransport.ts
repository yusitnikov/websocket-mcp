import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServerManager } from "./WebSocketServerManager";

/**
 * WebSocket server transport for Model Context Protocol.
 * Accepts browser WebSocket connections and acts as an MCP transport.
 */
export class WebSocketServerTransport implements Transport {
    public sessionId?: string;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

    constructor(
        private readonly manager: WebSocketServerManager,
        private readonly path: string,
    ) {}

    private _close?: () => void;

    async start() {
        console.debug(`Start WebSocketServerTransport at ${this.path}`);

        if (this._close) {
            return;
        }

        // Check that we have an active connection - the method will throw an error otherwise
        this.manager.getActiveConnection(this.path);

        const onMessage = (message: any) => this.onmessage?.(message, {});
        const onError = (error: Error) => this.onerror?.(error);
        const onClose = () => this.onclose?.();

        this.manager.onMessage.add(onMessage);
        this.manager.onError.add(onError);
        this.manager.onClose.add(onClose);

        this._close = () => {
            this.manager.onMessage.delete(onMessage);
            this.manager.onError.delete(onError);
            this.manager.onClose.delete(onClose);
        };
    }

    async close() {
        console.debug(`Close WebSocketServerTransport at ${this.path}`);

        this._close?.();
        this._close = undefined;
    }

    /**
     * Sends a JSON-RPC message to the connected browser
     */
    async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
        try {
            await this.manager.send(this.path, {
                ...message,
                ...(options?.resumptionToken && { resumptionToken: options.resumptionToken }),
                ...(options?.relatedRequestId && { relatedRequestId: options.relatedRequestId }),
            });
        } catch (error) {
            console.warn(`WebSocket server manager error at ${this.path}:`, error);
            console.debug("Message:", message);
            console.debug("Options:", options);
            throw error;
        }
    }

    /**
     * Sets the protocol version for this connection
     */
    setProtocolVersion(version: string): void {
        // Store protocol version if needed
        console.debug(`WebSocket transport protocol version set to ${version} at ${this.path}`);
    }
}
