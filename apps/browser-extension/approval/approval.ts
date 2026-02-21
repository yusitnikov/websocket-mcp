import { ApprovalToOffscreenProtocol, getSendMessage } from "../protocol";

const sendMessageToOffscreen = getSendMessage<ApprovalToOffscreenProtocol>();

async function sendDecision(approved: boolean): Promise<void> {
    await sendMessageToOffscreen({ type: "approval_decision", approved });
}

document.addEventListener("DOMContentLoaded", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const codeEl = document.getElementById("session-code")!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const statusEl = document.getElementById("status")!;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const btnApprove = document.getElementById("btn-approve") as HTMLButtonElement;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const btnReject = document.getElementById("btn-reject") as HTMLButtonElement;

    btnApprove.addEventListener("click", () => {
        btnApprove.disabled = true;
        btnReject.disabled = true;
        statusEl.textContent = "Approved.";
        void sendDecision(true).then(() => window.close());
    });

    btnReject.addEventListener("click", () => {
        btnApprove.disabled = true;
        btnReject.disabled = true;
        statusEl.textContent = "Rejected.";
        void sendDecision(false).then(() => window.close());
    });

    // Closing the tab without deciding is treated as rejection
    window.addEventListener("beforeunload", () => {
        if (!btnApprove.disabled) {
            // Buttons still enabled means no decision was made
            void sendDecision(false);
        }
    });

    async function pollForState(): Promise<void> {
        const state = await sendMessageToOffscreen({ type: "get_approval_state" });

        switch (state.status) {
            case "pending": {
                codeEl.textContent = state.sessionCode;
                statusEl.textContent = "Verify the code matches what you were shown, then approve or reject.";
                const wasDisabled = btnApprove.disabled;
                btnApprove.disabled = false;
                btnReject.disabled = false;
                // Keep polling to detect if state switches to blocked mid-approval
                setTimeout(pollForState, 500);
                if (wasDisabled) {
                    btnApprove.focus();
                }
                break;
            }
            case "blocked":
                // TODO: better UI
                // TODO: ability to unlock
                codeEl.textContent = "—";
                btnApprove.disabled = true;
                btnReject.disabled = true;
                statusEl.textContent =
                    "⚠ Security alert: multiple simultaneous session requests detected. All requests have been rejected.";
                break;
            default:
                // idle — not pending yet, retry shortly
                statusEl.textContent = "Waiting for session request…";
                setTimeout(pollForState, 200);
                break;
        }
    }

    void pollForState();
});
