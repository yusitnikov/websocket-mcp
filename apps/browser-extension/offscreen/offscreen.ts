import { ExtensionTabClient } from "@sitnikov/browser-automation/extension-tab-client";
import type { StatusMessage, ListTabsRequest, ListTabsResult, ExecuteJsRequest, ExecuteJsSuccess, ExecuteJsError } from "../types";

const BROKER_URL = "ws://localhost:3004";

const client = new ExtensionTabClient(BROKER_URL, {
    listTabs: async () => {
        const request: ListTabsRequest = { type: "list-tabs" };
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const result = (await chrome.runtime.sendMessage(request)) as ListTabsResult;
        return result.tabs;
    },
    executeInTab: async (tabId, code) => {
        const request: ExecuteJsRequest = { type: "execute-js", tabId, code };
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return (await chrome.runtime.sendMessage(request)) as ExecuteJsSuccess | ExecuteJsError;
    },
});

let currentStatus: StatusMessage = { type: "broker-status", connected: false };

function sendStatus(connected: boolean, connectionId?: string): void {
    currentStatus = { type: "broker-status", connected, connectionId };
    chrome.runtime.sendMessage(currentStatus).catch(() => {
        // Service worker may not be ready yet — ignore
    });
}

client.onConnected = (id) => {
    console.log("[offscreen] Connected to broker, ID:", id);
    sendStatus(true, id);
};

client.onDisconnected = () => {
    console.log("[offscreen] Disconnected from broker");
    sendStatus(false);
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): undefined => {
    if (typeof message === "object" && message !== null && "type" in message && message.type === "get-broker-status") {
        sendResponse(currentStatus);
    }
    return undefined;
});

// Start connecting (with auto-reconnect)
client.connect().catch((error: unknown) => {
    console.error("[offscreen] Failed to start broker connection:", error);
    sendStatus(false);
});
