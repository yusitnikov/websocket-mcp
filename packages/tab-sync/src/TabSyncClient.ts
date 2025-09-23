import { TabToWorkerEvent, WorkerToTabEvent } from "./events.ts";
import { TabDynamicInfo, TabInfo } from "./tabInfo.ts";
import { AbortablePromise } from "utils";
import { TabSyncBase } from "./TabSyncBase.ts";

// @ts-ignore
interface TabSyncClientOptions<ExtraPingDataT = undefined> {
    sharedWorkerPath: string;
    sharedWorkerOptions?: WorkerOptions;
}

export class TabSyncClient<ExtraPingDataT = undefined> extends TabSyncBase<undefined> {
    private sharedWorker: SharedWorker | undefined;

    private readonly startTime: number;
    private myTabId = 0;
    private otherTabs: TabInfo[] = [];
    private extraPingData: ExtraPingDataT | undefined;

    // region Event listeners
    onTabsChanged?: (tabs: TabInfo[]) => void;
    onExtraPingDataChanged?: (extraPingData: ExtraPingDataT) => void;
    // endregion

    constructor(private readonly options: TabSyncClientOptions<ExtraPingDataT>) {
        super();
        this.startTime = Date.now();
    }

    private get myTabDynamicInfo(): TabDynamicInfo {
        return {
            title: window.document.title,
            url: window.location.href,
        };
    }

    get myTabInfo(): TabInfo {
        return {
            id: this.myTabId,
            createdAt: this.startTime,
            dynamicInfo: this.myTabDynamicInfo,
        };
    }

    get tabs(): TabInfo[] {
        return [this.myTabInfo, ...this.otherTabs].sort((a, b) => a.id - b.id);
    }

    private sendMessage(message: TabToWorkerEvent) {
        return this.sharedWorker?.port.postMessage(message);
    }

    start() {
        this.sharedWorker = new SharedWorker(this.options.sharedWorkerPath, {
            name: "Tabs sync",
            ...this.options.sharedWorkerOptions,
        });

        this.sharedWorker.port.addEventListener("message", async (event) => {
            const data = event.data as WorkerToTabEvent<ExtraPingDataT>;
            console.debug("Message from the shared worker:", data);

            switch (data.type) {
                case "ping":
                    const prevTabs = this.tabs;
                    const prevExtraPingData = this.extraPingData;

                    this.myTabId = data.tabId;
                    this.otherTabs = data.otherTabs;
                    this.extraPingData = data.extraData;

                    this.sendMessage({
                        type: "pong",
                        tabInfo: this.myTabDynamicInfo,
                    });

                    if (JSON.stringify(this.tabs) !== JSON.stringify(prevTabs)) {
                        this.onTabsChanged?.(this.tabs);
                    }
                    if (JSON.stringify(this.extraPingData) !== JSON.stringify(prevExtraPingData)) {
                        this.onExtraPingDataChanged?.(this.extraPingData);
                    }
                    break;

                case "custom_message":
                    const response = await this.handleCustomMessage(data, undefined);
                    this.sendMessage(response);
                    break;

                case "custom_message_response":
                    this.handleCustomMessageResponse(data);
                    break;

                default:
                    console.warn("Unknown message type:", (data as any).type);
                    break;
            }
        });

        this.sharedWorker.port.start();

        window.addEventListener("beforeunload", () => this.sendMessage({ type: "bye" }));

        this.onTabsChanged?.(this.tabs);
    }

    sendMessageToServer<PayloadT, ResponseT>(
        messageType: string,
        payload: PayloadT,
        timeout: number = this.defaultTimeout,
    ): AbortablePromise<ResponseT> {
        const messageId = this.generateMessageId();

        this.sendMessage({
            type: "custom_message",
            messageId,
            messageType,
            payload,
        });

        return this.waitForCustomMessageResponse<ResponseT>(messageId, timeout);
    }
}
