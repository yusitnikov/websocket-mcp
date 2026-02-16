import { Channel } from "./Channel";
import type {
    BrokerMessage,
    BrokerResponse,
    ChannelClosedNotification,
    ChannelMessageReceived,
    ChannelOpenedMessage,
    ClientMessage,
    ClientMessageInput,
    ConnectionsMessage,
    ErrorResponse,
    IncomingChannelMessage,
    RegisteredMessage,
} from "../protocol";

// Use a union type to handle both browser and Node.js WebSocket
type WebSocketLike = WebSocket | import("ws").WebSocket;

interface PendingRequest {
    resolve: (value: BrokerResponse) => void;
    reject: (error: Error) => void;
    timer: number | NodeJS.Timeout;
}

/**
 * Optional logger interface for BrokerClient.
 */
export interface BrokerClientLogger {
    log(message: string): void;
    error(message: string, error?: Error | unknown): void;
}

/**
 * Client SDK for connecting to the generic connection broker.
 *
 * Usage:
 * ```typescript
 * const client = new BrokerClient('ws://localhost:3004', 'my-role')
 * await client.connect()
 *
 * // Discover connections
 * const ids = await client.listByRole('other-role')
 *
 * // Open channel
 * const channel = await client.openChannel(targetId)
 *
 * // Send messages
 * channel.send({ foo: 'bar' })
 *
 * // Listen for messages
 * channel.onMessage = (payload) => { ... }
 *
 * // Close
 * channel.close()
 * ```
 */
export class BrokerClient {
    private ws?: WebSocketLike;
    private myId?: string;
    private channels = new Map<string, Channel>();

    // Track pending requests by message ID
    private pendingRequests = new Map<number, PendingRequest>();

    private reconnectTimer?: number | NodeJS.Timeout;
    private reconnectAttempts = 0;
    private maxReconnectDelay = 30000;
    private shouldMaintainConnection = false;
    private nextMessageId = 1;

    /**
     * Callback for incoming channels.
     * Set this to handle channels opened by other connections.
     */
    onIncomingChannel?: (channel: Channel) => void;

    /**
     * Callback for when connection is established.
     */
    onConnected?: () => void;

    /**
     * Callback for when connection is lost.
     */
    onDisconnected?: () => void;

    constructor(
        private brokerUrl: string,
        private role: string,
        private logger?: BrokerClientLogger,
    ) {}

    /**
     * Send a typed message to the broker.
     * Generates and assigns a unique message ID, then sends the message.
     * Returns the assigned message ID.
     * Throws if WebSocket is not connected or not in OPEN state.
     */
    send(msg: ClientMessageInput): number {
        if (!this.ws) {
            throw new Error("Not connected to broker");
        }

        // Check readyState - handle both browser and Node.js WebSocket
        const readyState = this.ws.readyState;
        const OPEN = typeof WebSocket !== "undefined" ? WebSocket.OPEN : 1;

        if (readyState !== OPEN) {
            throw new Error(`WebSocket is not open (readyState: ${readyState})`);
        }

        // Generate ID and create full message
        const id = this.nextMessageId++;
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const fullMsg: ClientMessage = { ...msg, id } as ClientMessage;

        this.ws.send(JSON.stringify(fullMsg));
        return id;
    }

    /**
     * Send a message and wait for a response with timeout.
     * Returns the response message or throws an error.
     * Handling the response is the responsibility of the caller.
     * @internal
     */
    async sendWithResponse<T extends BrokerResponse>(
        msg: ClientMessageInput,
        timeout: number,
        errorMessage: string,
    ): Promise<T> {
        if (!this.ws) {
            throw new Error("Not connected to broker");
        }

        const messageId = this.send(msg);

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return (await new Promise<BrokerResponse>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(messageId);
                reject(new Error(errorMessage));
            }, timeout);

            this.pendingRequests.set(messageId, { resolve, reject, timer });
        })) as T;
    }

    /**
     * Connect to the broker and register with the role specified in the constructor.
     * This is a one-time connection - use maintainConnection() for auto-reconnect.
     */
    async connect(): Promise<void> {
        return this.doConnect();
    }

    /**
     * Maintain a persistent connection with automatic reconnection on disconnect.
     * Uses exponential backoff: 1s, 2s, 4s, 8s, 16s, up to 30s max.
     */
    async maintainConnection(): Promise<void> {
        this.shouldMaintainConnection = true;
        await this.doConnect();
    }

    private async doConnect(): Promise<void> {
        // Create WebSocket using the appropriate implementation
        if (typeof window !== "undefined") {
            // Browser environment - use native WebSocket
            this.ws = new WebSocket(this.brokerUrl);
        } else {
            // Node.js environment - use 'ws' package
            const { WebSocket: WsWebSocket } = await import("ws");
            this.ws = new WsWebSocket(this.brokerUrl);
        }

        const ws = this.ws;

        return new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                reject(new Error("Connection timeout"));
            }, 10000);

            ws.onopen = async () => {
                try {
                    const response = await this.sendWithResponse<RegisteredMessage | ErrorResponse>(
                        {
                            type: "register",
                            role: this.role,
                        },
                        5000,
                        "Registration timeout",
                    );

                    clearTimeout(connectionTimeout);

                    if (response.type === "registered") {
                        this.reconnectAttempts = 0;
                        this.myId = response.connectionId;
                        this.logger?.log(`Registered with broker, ID: ${response.connectionId}`);
                        this.onConnected?.();
                        resolve();
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (error) {
                    clearTimeout(connectionTimeout);
                    reject(error);
                }
            };

            ws.onmessage = (event: MessageEvent | import("ws").MessageEvent) => {
                try {
                    // Handle both browser and Node.js message events
                    const data = "data" in event ? event.data : event;
                    const msgStr = typeof data === "string" ? data : data.toString();
                    const msg = JSON.parse(msgStr);

                    this.handleMessage(msg);
                } catch (error) {
                    this.logger?.error("Failed to parse broker message", error);
                }
            };

            ws.onerror = (error: Event | import("ws").ErrorEvent) => {
                clearTimeout(connectionTimeout);
                reject(error);
            };

            ws.onclose = () => {
                clearTimeout(connectionTimeout);
                this.handleDisconnect();
            };
        });
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);

        this.logger?.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
        this.reconnectAttempts++;

        this.reconnectTimer = setTimeout(() => {
            this.doConnect().catch(() => this.scheduleReconnect());
        }, delay);
    }

    /**
     * List all connections with the specified role.
     * Returns an array of connection IDs.
     */
    async listByRole(role: string): Promise<string[]> {
        const response = await this.sendWithResponse<ConnectionsMessage | ErrorResponse>(
            {
                type: "list_by_role",
                role,
            },
            5000,
            "listByRole timeout",
        );

        if (response.type === "connections") {
            return response.ids;
        } else {
            throw new Error(response.error);
        }
    }

    /**
     * Open a channel to the specified connection ID.
     * Returns a Channel object that can be used to send/receive messages.
     */
    async openChannel(targetId: string): Promise<Channel> {
        const response = await this.sendWithResponse<ChannelOpenedMessage | ErrorResponse>(
            {
                type: "open",
                targetId,
            },
            5000,
            "openChannel timeout",
        );

        if (response.type === "channel_opened") {
            const channel = new Channel(this, response.channelId, targetId);
            this.channels.set(response.channelId, channel);
            this.logger?.log(`Channel ${response.channelId} opened to ${targetId}`);
            return channel;
        } else {
            throw new Error(response.error);
        }
    }

    /**
     * Get the ID assigned to this connection by the broker.
     */
    getMyId(): string | undefined {
        return this.myId;
    }

    /**
     * Disconnect from the broker and stop auto-reconnect.
     * Closes all active channels.
     */
    disconnect(): void {
        this.shouldMaintainConnection = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }

        // Close all channels
        for (const channel of this.channels.values()) {
            channel.handleClosed();
        }
        this.channels.clear();
    }

    private handleMessage(msg: BrokerMessage): void {
        // If message has replyTo, route to pending request
        if ("replyTo" in msg) {
            this.handleReply(msg);
            return;
        }

        // Otherwise handle as unsolicited message
        switch (msg.type) {
            case "incoming_channel":
                this.handleIncoming(msg);
                break;
            case "channel_message":
                this.handleChannelMessage(msg);
                break;
            case "channel_closed_notification":
                this.handleChannelClosedNotification(msg);
                break;
            default:
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                this.logger?.error(`Unexpected unsolicited message type: ${(msg as BrokerMessage).type}`);
        }
    }

    private handleReply(msg: BrokerResponse): void {
        const pending = this.pendingRequests.get(msg.replyTo);
        if (!pending) {
            this.logger?.error(`Received reply for unknown request: ${msg.replyTo}`);
            return;
        }

        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.replyTo);

        // Resolve with the raw message - caller handles response processing
        pending.resolve(msg);
    }

    private handleIncoming(msg: IncomingChannelMessage): void {
        if (!this.ws) return;

        const channel = new Channel(this, msg.channelId, msg.from);
        this.channels.set(msg.channelId, channel);

        this.logger?.log(`Incoming channel ${msg.channelId} from ${msg.from}`);

        // Notify listener
        this.onIncomingChannel?.(channel);
    }

    private handleChannelMessage(msg: ChannelMessageReceived): void {
        const channel = this.channels.get(msg.channelId);
        if (channel) {
            channel.handleMessage(msg.payload);
        }
    }

    private handleChannelClosedNotification(msg: ChannelClosedNotification): void {
        const channel = this.channels.get(msg.channelId);
        if (channel) {
            this.logger?.log(`Channel ${msg.channelId} closed by other party`);
            channel.handleClosed();
            this.channels.delete(msg.channelId);
        }
    }

    private handleDisconnect(): void {
        this.logger?.log("Disconnected from broker");
        this.onDisconnected?.();

        // Reject all pending operations
        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Disconnected from broker"));
        }
        this.pendingRequests.clear();

        // Close all channels
        for (const channel of this.channels.values()) {
            channel.handleClosed();
        }
        this.channels.clear();

        // Auto-reconnect if enabled
        if (this.shouldMaintainConnection) {
            this.scheduleReconnect();
        }
    }
}
