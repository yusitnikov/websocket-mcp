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

export interface CustomMessageEvent<PayloadT> {
    type: "custom_message";
    messageId: number;
    messageType: string;
    payload: PayloadT;
}

export interface CustomMessageResponseEvent<ResponseT> {
    type: "custom_message_response";
    messageId: number;
    payload: ResponseT | Error;
}

export type WorkerToTabEvent<ExtraPingDataT = undefined> =
    | PingEvent<ExtraPingDataT>
    | CustomMessageEvent<unknown>
    | CustomMessageResponseEvent<unknown>;

export type TabToWorkerEvent = PongEvent | ByeEvent | CustomMessageEvent<unknown> | CustomMessageResponseEvent<unknown>;
