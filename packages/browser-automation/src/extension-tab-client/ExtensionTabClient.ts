import { BrokerClient, Channel } from "@sitnikov/connection-broker/client";
import type {
    ExtensionRequest,
    ExecuteJsResponse,
    ApproveSessionResponse,
    ExtensionAutomationProtocol,
    ExtensionResponse,
} from "../protocol";
import { processRequestByProtocolImplementationMap } from "@sitnikov/protocol";

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

    private readonly approvedSessions: Record<string, { hostnameMasks?: string[] }> = {};

    constructor(
        brokerUrl: string,
        private readonly callbacks: {
            listTabs: () => Promise<chrome.tabs.Tab[]>;
            executeInTab: (tabId: number, code: string) => Promise<ExecuteJsResponse>;
            approveSession: (sessionCode: string, hostnameMasks?: string[]) => Promise<ApproveSessionResponse>;
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
    connect(): void {
        this.broker.maintainConnection();
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

    private validateSessionToken(sessionToken: string) {
        const session = this.approvedSessions[sessionToken];
        if (!session) {
            throw new Error("Invalid or expired session token");
        }
        return session;
    }

    private handleIncomingChannel(channel: Channel): void {
        console.log(`Incoming channel from ${channel.getPeerId()}`);
        this.activeChannels.add(channel);

        channel.onMessage = (payload) => {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            void this.handleCommand(payload as ExtensionRequest, channel);
        };

        channel.onClosed = () => {
            console.log(`Channel ${channel.getChannelId()} closed`);
            this.activeChannels.delete(channel);
        };
    }

    private async getAllowedTabs(sessionToken: string) {
        const { hostnameMasks } = this.validateSessionToken(sessionToken);

        let tabs = await this.callbacks.listTabs();

        if (hostnameMasks?.length) {
            tabs = tabs.filter(({ url }) => {
                if (!url) {
                    return false;
                }

                let hostname: string;
                try {
                    const parsed = new URL(url);
                    hostname = parsed.hostname;
                } catch {
                    return false;
                }

                return hostnameMasks.some((mask) => {
                    if (!mask.startsWith("*.")) {
                        return hostname === mask;
                    }

                    const domain = mask.substring(2);
                    return hostname === domain || hostname.endsWith(`.${domain}`);
                });
            });
        }

        return tabs;
    }

    private async handleCommand(command: ExtensionRequest, channel: Channel): Promise<void> {
        console.log("Received command:", command);

        let response: ExtensionResponse;
        try {
            response = await processRequestByProtocolImplementationMap<ExtensionAutomationProtocol>(command, {
                list_tabs: ({ sessionToken }) => this.getAllowedTabs(sessionToken),
                execute_js: async ({ sessionToken, tabId, code }) => {
                    const tabs = await this.getAllowedTabs(sessionToken);
                    const tab = tabs.find(({ id }) => id === tabId);

                    if (!tab) {
                        throw new Error(`Tab ${tabId} not found - it was probably closed. Try listing the tabs again.`);
                    }

                    if (tab.discarded || tab.status === "unloaded") {
                        throw new Error("The tab was unloaded due to inactivity - cannot execute code there");
                    }

                    return await this.callbacks.executeInTab(tabId, code);
                },
                approve_session: ({ sessionCode, hostnameMasks }) =>
                    this.callbacks.approveSession(sessionCode, hostnameMasks).then((response) => {
                        if (response.success) {
                            this.approvedSessions[response.sessionToken] = { hostnameMasks };
                        }
                        return response;
                    }),
            });
        } catch (error: unknown) {
            response = {
                type: "error",
                message: error instanceof Error ? error.message : String(error),
            };
        }

        await channel.send(response);
    }
}
