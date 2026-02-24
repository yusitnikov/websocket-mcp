import { ExtensionTabClient } from "@sitnikov/browser-automation/extension-tab-client";
import {
    OffscreenToWorkerProtocol,
    getSendMessage,
    AnyToOffscreenProtocol,
    processIncomingMessages,
    OffscreenToPopupProtocol,
} from "../protocol";

const BROKER_URL = "ws://localhost:3004";

const sendMessageToWorker = getSendMessage<OffscreenToWorkerProtocol>();
const sendMessageToPopup = getSendMessage<OffscreenToPopupProtocol>();

// ---------------------------------------------------------------------------
// ExtensionTabClient setup
// ---------------------------------------------------------------------------

const client = new ExtensionTabClient(BROKER_URL, {
    listTabs: () => sendMessageToWorker({ type: "list_tabs" }),
    executeInTab: (tabId, code) => sendMessageToWorker({ type: "execute_js", tabId, code }),
    openApprovalTab: () => sendMessageToWorker({ type: "open_approval_tab" }),
});

const sendStatus = () =>
    void sendMessageToPopup({ type: "broker_status", connectionId: client.getConnectionId() }).catch();

client.onConnected = (id) => {
    console.log("[offscreen] Connected to broker, ID:", id);
    sendStatus();
};

client.onDisconnected = () => {
    console.log("[offscreen] Disconnected from broker");
    sendStatus();
};

// Message listener (handles messages from service worker)
processIncomingMessages<AnyToOffscreenProtocol>({
    get_broker_status: () => client.getConnectionId(),
    get_approval_state: () => client.getApprovalState(),
    approval_decision: ({ approved }) => client.resolveApproval(approved),
});

// Start connecting (with auto-reconnect)
client.connect();
