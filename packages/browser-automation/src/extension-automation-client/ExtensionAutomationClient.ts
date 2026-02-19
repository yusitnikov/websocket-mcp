import { BrokerClient } from "@sitnikov/connection-broker/client";
import type { BrokerClientLogger } from "@sitnikov/connection-broker/client";
import type { ExtensionResponse, TabInfo } from "../extension-tab-client/protocol";

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

    async listTabs(): Promise<TabInfo[]> {
        return await this.withBroker(async (broker) => {
            const extensionIds = await broker.listByRole("browser-extension");
            if (extensionIds.length === 0) {
                throw new Error("No browser extension connected");
            }

            const extensionId = extensionIds[0]!;
            const channel = await broker.openChannel(extensionId);

            return await new Promise<TabInfo[]>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Timeout waiting for list_tabs response (30s)"));
                }, 30000);

                channel.onMessage = (payload: unknown) => {
                    clearTimeout(timeout);
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    const response = payload as ExtensionResponse;
                    if (response.success && "tabs" in response) {
                        resolve(response.tabs);
                    } else if (!response.success) {
                        reject(new Error("error" in response ? response.error : response.message));
                    } else {
                        reject(new Error("Unexpected response"));
                    }
                };

                channel.onClosed = () => {
                    clearTimeout(timeout);
                    reject(new Error("Channel closed before receiving response"));
                };

                channel.send({ action: "list_tabs" });
            });
        });
    }

    async executeJs(tabId: number, code: string): Promise<ExtensionResponse> {
        return await this.withBroker(async (broker) => {
            const extensionIds = await broker.listByRole("browser-extension");
            if (extensionIds.length === 0) {
                throw new Error("No browser extension connected");
            }

            const extensionId = extensionIds[0]!;
            const channel = await broker.openChannel(extensionId);

            return await new Promise<ExtensionResponse>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Timeout waiting for execute_js response (30s)"));
                }, 30000);

                channel.onMessage = (payload: unknown) => {
                    clearTimeout(timeout);
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    resolve(payload as ExtensionResponse);
                };

                channel.onClosed = () => {
                    clearTimeout(timeout);
                    reject(new Error("Channel closed before receiving response"));
                };

                channel.send({ action: "execute_js", tabId, code });
            });
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
}
