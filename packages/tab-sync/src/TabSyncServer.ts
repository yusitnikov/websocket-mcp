/// <reference lib="webworker" />

import { PartialTabInfo, TabInfo } from "./tabInfo.ts";
import { TabToWorkerEvent, WorkerToTabEvent } from "./events.ts";
// noinspection ES6PreferShortImport
import { AbortablePromise } from "./utils";
import { TabSyncBase } from "./TabSyncBase.ts";

interface TabSyncServerOptions<ExtraPingDataT = undefined> {
    scope: SharedWorkerGlobalScope;
    getExtraPingData?: () => ExtraPingDataT;
}

export class TabSyncServer<ExtraPingDataT = undefined> extends TabSyncBase<PartialTabInfo> {
    private readonly scope: SharedWorkerGlobalScope;
    private readonly tabs: Tab[] = [];

    constructor(private readonly options: TabSyncServerOptions<ExtraPingDataT>) {
        super();
        this.scope = options.scope;
    }

    get activeTabs() {
        return this.tabs
            .filter(({ lastPongTime = 0 }) => Date.now() < lastPongTime + 5000)
            .map(({ port, lastPongTime, ...other }) => other)
            .filter((otherTab): otherTab is TabInfo => otherTab.dynamicInfo !== undefined);
    }

    private sendMessage(tab: Tab, message: WorkerToTabEvent<ExtraPingDataT>): void {
        try {
            tab.port.postMessage(message);
        } catch (error) {
            console.warn("SharedWorker: Error sending message to port:", error);
        }
    }

    private pingTab(tab: Tab) {
        this.sendMessage(tab, {
            type: "ping",
            tabId: tab.id,
            otherTabs: this.activeTabs.filter((otherTab) => otherTab.id !== tab.id),
            extraData: this.options.getExtraPingData?.() ?? (undefined as unknown as ExtraPingDataT),
        });
    }

    pingAllTabs() {
        for (const tab of this.tabs) {
            this.pingTab(tab);
        }
    }

    start() {
        this.scope.onconnect = (event) => {
            const port = event.ports[0];
            const tab: Tab = {
                port,
                id: this.tabs.length + 1,
                createdAt: Date.now(),
            };
            this.tabs.push(tab);

            console.log("New tab connected, total tabs:", this.tabs.length);

            this.pingTab(tab);

            const pingOtherTabs = () => {
                for (const otherTab of this.tabs) {
                    if (otherTab !== tab) {
                        this.pingTab(otherTab);
                    }
                }
            };

            // Handle messages from this tab
            port.addEventListener("message", async (messageEvent) => {
                const data = messageEvent.data as TabToWorkerEvent;

                switch (data.type) {
                    case "pong":
                        tab.lastPongTime = Date.now();
                        if (JSON.stringify(tab.dynamicInfo) === JSON.stringify(data.tabInfo)) {
                            // no changes
                            break;
                        }

                        tab.dynamicInfo = data.tabInfo;
                        pingOtherTabs();
                        break;

                    case "bye":
                        tab.lastPongTime = undefined;
                        pingOtherTabs();
                        break;

                    case "custom_message":
                        const response = await this.handleCustomMessage(data, tab);
                        this.sendMessage(tab, response);
                        break;

                    case "custom_message_response":
                        this.handleCustomMessageResponse(data);
                        break;

                    default:
                        console.warn("SharedWorker: Unknown message type:", (data as any).type);
                        break;
                }
            });

            port.start();
        };

        this.scope.setInterval(() => this.pingAllTabs(), 2000);
    }

    private getTabById(tabId: number) {
        const tab = this.tabs.find(({ id }) => id === tabId);
        if (!tab) {
            throw new Error(
                `Tab not found. Available tabs: ${this.activeTabs.map(({ id, dynamicInfo: { title } }) => `${id} ("${title}")`).join(", ")}`,
            );
        }
        return tab;
    }

    sendMessageToTab<PayloadT, ResponseT>(
        tabId: number,
        messageType: string,
        payload: PayloadT,
        timeout: number = this.defaultTimeout,
    ): AbortablePromise<ResponseT> {
        const targetTab = this.getTabById(tabId);

        const messageId = this.generateMessageId();

        this.sendMessage(targetTab, {
            type: "custom_message",
            messageId,
            messageType,
            payload,
        });

        return this.waitForCustomMessageResponse<ResponseT>(messageId, timeout);
    }
}

interface Tab extends PartialTabInfo {
    port: MessagePort;
    lastPongTime?: number;
}
