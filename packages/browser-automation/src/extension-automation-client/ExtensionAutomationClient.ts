import { BrokerClient, type BrokerClientLogger, Channel } from "@sitnikov/connection-broker/client";
import {
    TabInfo,
    ExecuteJsResponse,
    ExtensionAutomationProtocol,
    ExtensionResponse,
} from "../extension-tab-client/protocol";
import { ProtocolRequest, ProtocolResponse } from "@sitnikov/protocol";

export interface InitiateSessionSuccess {
    approved: true;
    sessionToken: string;
    extensionConnectionId: string;
}

export interface InitiateSessionRejected {
    approved: false;
}

/**
 * Client for browser extension automation via the connection broker.
 *
 * Handles all broker communication for the extension protocol:
 * listing tabs and executing JavaScript via the extension's scripting API.
 * Each operation creates an ephemeral broker connection.
 */
export class ExtensionAutomationClient {
    constructor(
        private readonly brokerUrl: string,
        private readonly logger?: BrokerClientLogger,
    ) {}

    async listTabs(sessionToken: string, extensionConnectionId: string): Promise<TabInfo[]> {
        return await this.withSpecificExtensionChannel(extensionConnectionId, async (channel) => {
            const { tabs } = await this.sendToBrowserExtension(channel, { type: "list_tabs", sessionToken }, 30000);
            return tabs;
        });
    }

    async executeJs(sessionToken: string, extensionConnectionId: string, tabId: number, code: string): Promise<ExecuteJsResponse> {
        return await this.withSpecificExtensionChannel(extensionConnectionId, async (channel) => {
            return await this.sendToBrowserExtension(channel, { type: "execute_js", sessionToken, tabId, code }, 30000);
        });
    }

    async initiateSession(sessionCode: string): Promise<InitiateSessionSuccess | InitiateSessionRejected> {
        return await this.withBrowserExtensionChannel(async (channel) => {
            const response = await this.sendToBrowserExtension(
                channel,
                { type: "approve_session", sessionCode },
                120000,
            );

            if (response.success) {
                return {
                    approved: true,
                    sessionToken: response.sessionToken,
                    extensionConnectionId: channel.getPeerId(),
                };
            } else {
                return { approved: false };
            }
        });
    }

    private async withBroker<T>(fn: (broker: BrokerClient) => Promise<T>): Promise<T> {
        const broker = new BrokerClient(this.brokerUrl, "mcp-server", this.logger);

        try {
            await broker.connect();
            return await fn(broker);
        } finally {
            broker.disconnect();
        }
    }

    private async withBrowserExtensionChannel<T>(fn: (channel: Channel) => Promise<T>): Promise<T> {
        return await this.withBroker(async (broker) => {
            const extensionIds = await broker.listByRole("browser-extension");
            if (extensionIds.length > 1) {
                throw new Error("Multiple browser extensions connected — possible attack");
            }

            const extensionId = extensionIds[0];
            if (!extensionId) {
                throw new Error("No browser extension connected");
            }

            return await this.withChannel(broker, extensionId, fn);
        });
    }

    private async withSpecificExtensionChannel<T>(extensionConnectionId: string, fn: (channel: Channel) => Promise<T>): Promise<T> {
        return await this.withBroker(async (broker) => {
            return await this.withChannel(broker, extensionConnectionId, fn);
        });
    }

    private async withChannel<T>(broker: BrokerClient, extensionId: string, fn: (channel: Channel) => Promise<T>): Promise<T> {
        const channel = await broker.openChannel(extensionId);

        try {
            return await fn(channel);
        } finally {
            channel.close();
        }
    }

    private async sendToBrowserExtension<TypeT extends keyof ExtensionAutomationProtocol>(
        channel: Channel,
        request: ProtocolRequest<ExtensionAutomationProtocol, TypeT>,
        timeout: number,
    ): Promise<ProtocolResponse<ExtensionAutomationProtocol, TypeT>> {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const response = (await channel.sendWithResponse(request, timeout)) as ExtensionResponse;

        if ("type" in response && response.type === "error") {
            throw new Error(response.message);
        }

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return response as ProtocolResponse<ExtensionAutomationProtocol, TypeT>;
    }
}
