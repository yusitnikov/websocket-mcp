import { ForwardedToPopupProtocol, getSendMessage, PopupToWorkerProtocol, processIncomingMessages } from "../protocol";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const statusEl = document.getElementById("status")!;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const connectionIdEl = document.getElementById("connection-id")!;

const sendMessageToWorker = getSendMessage<PopupToWorkerProtocol>();

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
processIncomingMessages<ForwardedToPopupProtocol>({
    broker_status: ({ connectionId }) => applyStatus(connectionId),
});

// Query current status on popup open
sendMessageToWorker({ type: "get_broker_status" })
    .then((response) => {
        applyStatus(response.connectionId);
    })
    .catch(() => {
        // Offscreen document may not be ready yet
    });
