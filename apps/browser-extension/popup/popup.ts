import type { GetStatusMessage, StatusMessage } from "../types";

function requireElement(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element #${id} not found`);
    return el;
}

const statusEl = requireElement("status");
const connectionIdEl = requireElement("connection-id");

function isStatusMessage(message: unknown): message is StatusMessage {
    return typeof message === "object" && message !== null && "type" in message && message.type === "broker-status";
}

function applyStatus(connected: boolean, connectionId?: string): void {
    if (connected) {
        statusEl.textContent = "Connected";
        statusEl.className = "status connected";
        connectionIdEl.textContent = connectionId ?? "—";
    } else {
        statusEl.textContent = "Disconnected";
        statusEl.className = "status disconnected";
        connectionIdEl.textContent = "—";
    }
}

// Listen for live status updates pushed from offscreen → service worker → popup
chrome.runtime.onMessage.addListener((message: unknown): undefined => {
    console.log("Got message!", message);
    if (isStatusMessage(message)) {
        applyStatus(message.connected, message.connectionId);
    }
    return undefined;
});

// Query current status on popup open
const request: GetStatusMessage = { type: "get-broker-status" };
chrome.runtime
    .sendMessage(request)
    .then((response: unknown) => {
        if (isStatusMessage(response)) {
            applyStatus(response.connected, response.connectionId);
        }
    })
    .catch(() => {
        // Offscreen document may not be ready yet
    });
