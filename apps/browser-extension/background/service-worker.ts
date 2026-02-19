/**
 * Extension service worker.
 *
 * Responsibilities:
 * - Create and maintain the offscreen document (which holds the broker WebSocket)
 * - Relay status updates from offscreen document to the popup
 * - Forward status queries from popup to offscreen document
 * - Handle tab listing and JS execution requests from offscreen document
 */

import type {
    GetStatusMessage,
    StatusMessage,
    ListTabsRequest,
    ListTabsResult,
    ExecuteJsRequest,
    ExecuteJsResult,
} from "../types";

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen/offscreen.html");

/**
 * Ensure the offscreen document exists. Chrome only allows one at a time.
 * If the document already exists, createDocument throws — we catch and ignore that.
 */
async function ensureOffscreenDocument(): Promise<void> {
    try {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: ["BLOBS"],
            justification: "Maintains persistent WebSocket connection to the connection broker",
        });
    } catch {
        // Document already exists — that's fine
    }
}

// Create offscreen document immediately on install/startup
chrome.runtime.onInstalled.addListener(() => {
    void ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
    void ensureOffscreenDocument();
});

// Also create it when the service worker first loads (handles reload/update)
void ensureOffscreenDocument();

function isStatusMessage(message: unknown): message is StatusMessage {
    return typeof message === "object" && message !== null && "type" in message && message.type === "broker-status";
}

function isGetStatusMessage(message: unknown): message is GetStatusMessage {
    return typeof message === "object" && message !== null && "type" in message && message.type === "get-broker-status";
}

function isListTabsRequest(message: unknown): message is ListTabsRequest {
    return typeof message === "object" && message !== null && "type" in message && message.type === "list-tabs";
}

function isExecuteJsRequest(message: unknown): message is ExecuteJsRequest {
    return typeof message === "object" && message !== null && "type" in message && message.type === "execute-js";
}

async function handleListTabs(): Promise<ListTabsResult> {
    const chromeTabs = await chrome.tabs.query({});
    const tabs = chromeTabs.map((tab) => ({
        tabId: tab.id ?? 0,
        title: tab.title ?? "",
        url: tab.url ?? "",
    }));
    return { success: true, tabs };
}

async function handleExecuteJs(tabId: number, code: string): Promise<ExecuteJsResult> {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            func: (async (codeToRun: string) => {
                // This function is serialized and re-evaluated in the page's MAIN world.
                // Awaiting handles both sync and async (Promise-returning) code.
                try {
                    const result = await eval(codeToRun);
                    const serialized: string =
                        result === undefined
                            ? "undefined"
                            : typeof result === "function"
                              ? result.toString()
                              : JSON.stringify(result, null, 2);
                    return { success: true, result: serialized };
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        return { success: false, name: error.name, message: error.message, stack: error.stack };
                    }
                    return { success: false, message: String(error) };
                }
            }) as unknown as () => void,
            args: [code],
        });

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return (results[0]?.result ?? { success: false, message: "No result from executeScript" }) as ExecuteJsResult;
    } catch (error) {
        return { success: false, message: String(error) };
    }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean | undefined => {
    if (isStatusMessage(message)) {
        // Broadcast status update to popup
        chrome.runtime.sendMessage(message).catch(() => {
            // Popup may not be open — ignore the error
        });
        return undefined;
    } else if (isGetStatusMessage(message)) {
        // Forward query to offscreen document; relay its response back to popup
        chrome.runtime
            .sendMessage(message)
            .then((response: unknown) => {
                sendResponse(response);
            })
            .catch(() => {
                sendResponse({ type: "broker-status", connected: false } satisfies StatusMessage);
            });
        return true; // Keep channel open for async response
    } else if (isListTabsRequest(message)) {
        handleListTabs()
            .then((result) => {
                sendResponse(result);
            })
            .catch((error: unknown) => {
                sendResponse({ success: false, error: String(error) });
            });
        return true; // Keep channel open for async response
    } else if (isExecuteJsRequest(message)) {
        handleExecuteJs(message.tabId, message.code)
            .then((result) => {
                sendResponse(result);
            })
            .catch((error: unknown) => {
                sendResponse({ success: false, error: String(error) });
            });
        return true; // Keep channel open for async response
    }
    return undefined;
});
