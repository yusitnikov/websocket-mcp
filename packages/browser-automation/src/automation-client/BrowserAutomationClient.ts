import { BrokerClient } from "@sitnikov/connection-broker/client";
import type { BrokerClientLogger } from "@sitnikov/connection-broker/client";
import type { BrowserCommand, BrowserResponse } from "../tab-client/BrowserTabClient";

/**
 * Client for browser automation via the connection broker.
 *
 * Handles all broker communication: listing tabs and executing JavaScript.
 * Each operation creates an ephemeral broker connection.
 */
export class BrowserAutomationClient {
    constructor(
        private readonly brokerUrl: string,
        private readonly logger?: BrokerClientLogger,
    ) {}

    async listTabs(): Promise<string[]> {
        return await this.withBroker(async (broker) => {
            return await broker.listByRole("browser-tab");
        });
    }

    async executeJs(tabId: string, code: string): Promise<BrowserResponse> {
        return await this.withBroker(async (broker) => {
            const channel = await broker.openChannel(tabId);

            return await new Promise<BrowserResponse>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Timeout waiting for response (30s)"));
                }, 30000);

                channel.onMessage = (payload: unknown) => {
                    clearTimeout(timeout);
                    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                    resolve(payload as BrowserResponse);
                };

                channel.onClosed = () => {
                    clearTimeout(timeout);
                    reject(new Error("Channel closed before receiving response"));
                };

                const command: BrowserCommand = {
                    action: "execute_js",
                    code,
                };

                channel.send(command);
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
