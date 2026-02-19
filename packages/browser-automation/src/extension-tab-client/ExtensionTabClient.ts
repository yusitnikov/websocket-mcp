import { BrokerClient, Channel } from "@sitnikov/connection-broker/client";
import type {
    ExtensionCommand,
    ExtensionResponse,
    ListTabsSuccess,
    ExecuteJsSuccess,
    ExecuteJsError,
    TabInfo,
} from "./protocol";

/**
 * Extension tab client that connects to the connection broker.
 *
 * Registers with role "browser-extension" and handles incoming channels.
 * Delegates actual tab listing and JS execution to injected callbacks,
 * which are implemented in the service worker.
 *
 * Usage in offscreen document:
 * ```typescript
 * const client = new ExtensionTabClient('ws://localhost:3004', {
 *   listTabs: () => sendToServiceWorker({ type: 'list-tabs' }),
 *   executeInTab: (tabId, code) => sendToServiceWorker({ type: 'execute-js', tabId, code }),
 * });
 * await client.connect();
 * ```
 */
export class ExtensionTabClient {
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

    constructor(
        brokerUrl: string,
        private readonly callbacks: {
            listTabs: () => Promise<TabInfo[]>;
            executeInTab: (tabId: number, code: string) => Promise<ExecuteJsSuccess | ExecuteJsError>;
        },
    ) {
        this.broker = new BrokerClient(brokerUrl, "browser-extension", console);

        this.broker.onConnected = () => {
            const id = this.broker.getMyId()!;
            console.log(`Extension client connected with ID: ${id}`);
            this.onConnected?.(id);
        };

        this.broker.onDisconnected = () => {
            console.log("Extension client disconnected from broker");
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
            void this.handleCommand(payload as ExtensionCommand, channel);
        };

        channel.onClosed = () => {
            console.log(`Channel ${channel.getChannelId()} closed`);
            this.activeChannels.delete(channel);
        };
    }

    private async handleCommand(command: ExtensionCommand, channel: Channel): Promise<void> {
        console.log("Received command:", command);

        if (command.action === "list_tabs") {
            await this.handleListTabs(channel);
        } else if (command.action === "execute_js") {
            await this.handleExecuteJs(command.tabId, command.code, channel);
        } else {
            console.warn("Unknown command:", command);
            channel.send({
                success: false,
                error: "Unknown command",
            } satisfies ExtensionResponse);
        }
    }

    private async handleListTabs(channel: Channel): Promise<void> {
        try {
            const tabs = await this.callbacks.listTabs();
            channel.send({
                success: true,
                tabs,
            } satisfies ListTabsSuccess);
        } catch (error) {
            console.error("Failed to list tabs:", error);
            channel.send({
                success: false,
                error: String(error),
            } satisfies ExtensionResponse);
        }
    }

    private async handleExecuteJs(tabId: number, code: string, channel: Channel): Promise<void> {
        try {
            const result = await this.callbacks.executeInTab(tabId, code);
            channel.send(result satisfies ExecuteJsSuccess | ExecuteJsError);
        } catch (error) {
            console.error("Failed to execute JS:", error);
            channel.send({
                success: false,
                message: String(error),
            } satisfies ExecuteJsError);
        }
    }
}
