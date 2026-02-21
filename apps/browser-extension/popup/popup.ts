import { getSendMessage, PopupToOffscreenProtocol, processIncomingMessages, AnyToPopupProtocol } from "../protocol";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const statusEl = document.getElementById("status")!;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const connectionIdEl = document.getElementById("connection-id")!;

const sendMessageToOffscreen = getSendMessage<PopupToOffscreenProtocol>();

function applyStatus(connectionId?: string): void {
    if (connectionId) {
        statusEl.textContent = "Connected";
        statusEl.className = "status connected";
        connectionIdEl.textContent = connectionId;
    } else {
        statusEl.textContent = "Disconnected";
        statusEl.className = "status disconnected";
        connectionIdEl.textContent = "—";
    }
}

// Listen for live status updates pushed from offscreen → service worker → popup
processIncomingMessages<AnyToPopupProtocol>({
    broker_status: ({ connectionId }) => applyStatus(connectionId),
});

// Query current status on popup open
sendMessageToOffscreen({ type: "get_broker_status" })
    .then((connectionId) => applyStatus(connectionId))
    .catch(() => {
        // Offscreen document may not be ready yet
    });
