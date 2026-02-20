import { ApproveSessionResponse, ExtensionTabClient } from "@sitnikov/browser-automation/extension-tab-client";
import {
    OffscreenToWorkerProtocol,
    getSendMessage,
    ForwardedToOffscreenProtocol,
    processIncomingMessages,
} from "../protocol";

const BROKER_URL = "ws://localhost:3004";

// ---------------------------------------------------------------------------
// Approval state machine
// ---------------------------------------------------------------------------

type ApprovalState =
    | { status: "idle" }
    | {
          status: "pending";
          sessionCode: string;
          resolve: (result: ApproveSessionResponse) => void;
      }
    | { status: "blocked" }; // TODO: add mechanism to unblock (e.g. via popup action or timeout)

let approvalState: ApprovalState = { status: "idle" };

async function handleApproveSession(sessionCode: string): Promise<ApproveSessionResponse> {
    if (approvalState.status === "blocked") {
        return { success: false };
    }

    if (approvalState.status === "pending") {
        // Two simultaneous approval requests — assume attack; block all future requests and reject both
        const previousResolve = approvalState.resolve;
        approvalState = { status: "blocked" };
        previousResolve({ success: false });
        return { success: false };
    }

    // status === "idle" — start a new approval flow
    return new Promise<ApproveSessionResponse>((resolve) => {
        approvalState = { status: "pending", sessionCode, resolve };

        // Ask service worker to open the approval tab and focus the window
        sendMessageToWorker({ type: "open_approval_tab" }).catch((error: unknown) => {
            console.error("[offscreen] Error opening approval tab:", error);
            approvalState = { status: "idle" };
            resolve({ success: false });
        });
    });
}

const sendMessageToWorker = getSendMessage<OffscreenToWorkerProtocol>();

// ---------------------------------------------------------------------------
// ExtensionTabClient setup
// ---------------------------------------------------------------------------

const client = new ExtensionTabClient(BROKER_URL, {
    listTabs: () => sendMessageToWorker({ type: "list_tabs" }),
    executeInTab: (tabId, code) => sendMessageToWorker({ type: "execute_js", tabId, code }),
    approveSession: handleApproveSession,
});

let currentConnectionId: string | undefined;

function sendStatus(): void {
    sendMessageToWorker({ type: "broker_status", connectionId: currentConnectionId }).catch();
}

client.onConnected = (id) => {
    console.log("[offscreen] Connected to broker, ID:", id);
    currentConnectionId = id;
    sendStatus();
};

client.onDisconnected = () => {
    console.log("[offscreen] Disconnected from broker");
    currentConnectionId = undefined;
    sendStatus();
};

// Message listener (handles messages from service worker)
processIncomingMessages<ForwardedToOffscreenProtocol>({
    get_broker_status: () => ({ type: "broker_status", connectionId: currentConnectionId }),

    get_approval_state: () =>
        approvalState.status === "pending"
            ? { status: "pending", sessionCode: approvalState.sessionCode }
            : approvalState.status === "blocked"
              ? { status: "blocked" }
              : { status: "idle" },

    approval_decision: ({ approved }) => {
        if (approvalState.status !== "pending") {
            return;
        }

        const resolve = approvalState.resolve;
        approvalState = { status: "idle" };
        if (approved) {
            const sessionToken = crypto.randomUUID();
            resolve({ success: true, sessionToken });
        } else {
            resolve({ success: false });
        }
    },
});

// Start connecting (with auto-reconnect)
client.connect();
