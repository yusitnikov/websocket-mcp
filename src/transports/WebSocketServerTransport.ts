import { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { log } from "../utils.js";
import { WebSocketServerManager } from "../WebSocketServerManager.ts";

/**
 * WebSocket server transport for Model Context Protocol.
 * Accepts browser WebSocket connections and acts as an MCP transport.
 */
export class WebSocketServerTransport implements Transport {
    public sessionId?: string;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;

    constructor(private readonly manager: WebSocketServerManager) {
        log("WebSocket server started");
    }

    private _close?: () => void;

    async start() {
        log("Start WebSocketServerTransport");

        if (this._close) {
            return;
        }

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
        log("Close WebSocketServerTransport");

        this._close?.();
        this._close = undefined;
    }

    /**
     * Sends a JSON-RPC message to the connected browser
     */
    async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
        await this.manager.send({
            ...message,
            ...(options?.resumptionToken && { resumptionToken: options.resumptionToken }),
            ...(options?.relatedRequestId && { relatedRequestId: options.relatedRequestId }),
        });
    }

    /**
     * Sets the protocol version for this connection
     */
    setProtocolVersion(version: string): void {
        // Store protocol version if needed
        log(`WebSocket transport protocol version set to: ${version}`);
    }
}
