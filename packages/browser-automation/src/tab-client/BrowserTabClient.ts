import { BrokerClient, Channel } from "@sitnikov/connection-broker/client";

/**
 * Payload types for browser automation commands.
 */
export interface ExecuteJsCommand {
    action: "execute_js";
    code: string;
}

export interface ExecuteJsSuccess {
    success: true;
    result: string; // JSON serialized result
}

export interface ExecuteJsError {
    success: false;
    error: string;
}

export type BrowserCommand = ExecuteJsCommand;
export type BrowserResponse = ExecuteJsSuccess | ExecuteJsError;

/**
 * Browser tab client that connects to the connection broker.
 *
 * Automatically:
 * - Registers with role "browser-tab"
 * - Listens for incoming channels
 * - Handles execute_js commands
 * - Sends results back
 *
 * Usage in browser:
 * ```typescript
 * import { BrowserTabClient } from '@sitnikov/browser-automation/tab-client'
 *
 * const client = new BrowserTabClient('ws://localhost:3004')
 * await client.connect()
 * ```
 */
export class BrowserTabClient {
    private broker: BrokerClient;
    private activeChannels = new Set<Channel>();

    /**
     * Callback for when the client connects and receives an ID.
     */
    onConnected?: (id: string) => void;

    /**
     * Callback for when the client disconnects.
     */
    onDisconnected?: () => void;

    constructor(brokerUrl: string) {
        this.broker = new BrokerClient(brokerUrl, "browser-tab", console);

        this.broker.onConnected = () => {
            const id = this.broker.getMyId()!;
            console.log(`Browser tab connected with ID: ${id}`);
            this.onConnected?.(id);
        };

        this.broker.onDisconnected = () => {
            console.log("Disconnected from broker");
            this.onDisconnected?.();
        };

        this.broker.onIncomingChannel = (channel) => {
            this.handleIncomingChannel(channel);
        };
    }

    /**
     * Connect to the broker and start listening for commands.
     * Automatically reconnects on disconnect with exponential backoff.
     */
    async connect(): Promise<void> {
        await this.broker.maintainConnection();
    }

    /**
     * Get the connection ID assigned by the broker.
     */
    getConnectionId(): string | undefined {
        return this.broker.getMyId();
    }

    /**
     * Disconnect from the broker and stop automatic reconnection.
     */
    disconnect(): void {
        this.broker.disconnect();
        this.activeChannels.clear();
    }

    private handleIncomingChannel(channel: Channel): void {
        console.log(`Incoming channel from ${channel.getPeerId()}`);
        this.activeChannels.add(channel);

        channel.onMessage = (payload) => {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            this.handleCommand(payload as BrowserCommand, channel);
        };

        channel.onClosed = () => {
            console.log(`Channel ${channel.getChannelId()} closed`);
            this.activeChannels.delete(channel);
        };
    }

    private handleCommand(payload: BrowserCommand, channel: Channel): void {
        console.log("Received command:", payload);

        if (payload.action === "execute_js") {
            this.executeJs(payload.code, channel);
        } else {
            console.warn("Unknown command:", payload);
            channel.send({
                success: false,
                error: `Unknown command: ${payload.action}`,
            } satisfies BrowserResponse);
        }
    }

    private async executeJs(code: string, channel: Channel): Promise<void> {
        try {
            // Use indirect eval to execute in global scope
            let result = (0, eval)(code);

            // If result is a Promise, await it
            if (result && typeof result === "object" && typeof result.then === "function") {
                result = await result;
            }

            // Serialize the result
            // Handle undefined, functions, etc.
            let serialized: string;
            if (result === undefined) {
                serialized = "undefined";
            } else if (typeof result === "function") {
                serialized = result.toString();
            } else {
                serialized = JSON.stringify(result, null, 2);
            }

            console.log(`Executed JS, result: ${serialized}`);

            channel.send({
                success: true,
                result: serialized,
            } satisfies BrowserResponse);
        } catch (error) {
            console.error("Failed to execute JS:", error);

            channel.send({
                success: false,
                error: String(error),
            } satisfies BrowserResponse);
        }
    }
}
