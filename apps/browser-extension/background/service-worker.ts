import { AnyToWorkerProtocol, processIncomingMessages } from "../protocol";
import { ExecuteJsResponse } from "@sitnikov/browser-automation/protocol";

/**
 * Extension service worker.
 *
 * Responsibilities:
 * - Create and maintain the offscreen document (which holds the broker WebSocket)
 * - Handle tab listing and JS execution requests from offscreen document
 * - Open the approval page
 */

/**
 * Ensure the offscreen document exists. Chrome only allows one at a time.
 * If the document already exists, createDocument throws — we catch and ignore that.
 */
async function ensureOffscreenDocument(): Promise<void> {
    try {
        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL("offscreen/offscreen.html"),
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

processIncomingMessages<AnyToWorkerProtocol>({
    list_tabs: () => chrome.tabs.query({}),

    execute_js: async ({ tabId, code }) => {
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
                    return { success: true, result: serialized } satisfies ExecuteJsResponse;
                } catch (error: unknown) {
                    if (error instanceof Error) {
                        return {
                            success: false,
                            name: error.name,
                            message: error.message,
                            stack: error.stack,
                        } satisfies ExecuteJsResponse;
                    }
                    return { success: false, message: String(error) } satisfies ExecuteJsResponse;
                }
            }) as unknown as () => void,
            args: [code],
        });

        return results[0]?.result ?? { success: false, message: "No result from executeScript" };
    },

    open_approval_tab: async () => {
        const tab = await chrome.tabs.create({
            url: chrome.runtime.getURL("approval/approval.html"),
        });
        await chrome.windows.update(tab.windowId, { focused: true });
    },
});
