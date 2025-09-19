import { TabDynamicInfo, TabInfo } from "./tabInfo.ts";

export interface PingEvent<ExtraDataT = undefined> {
    type: "ping";
    // ID of the tab that receives the event (the shared worker decides what's the ID)
    tabId: number;
    otherTabs: TabInfo[];
    extraData: ExtraDataT;
}

export interface PongEvent {
    type: "pong";
    tabInfo: TabDynamicInfo;
}

export interface ByeEvent {
    type: "bye";
}

export type WorkerToTabEvent<ExtraPingDataT = undefined> = PingEvent<ExtraPingDataT>;

export type TabToWorkerEvent = PongEvent | ByeEvent;
