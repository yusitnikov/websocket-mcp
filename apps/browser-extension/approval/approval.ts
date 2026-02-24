import { ApprovalToOffscreenProtocol, getSendMessage } from "../protocol";

const sendMessageToOffscreen = getSendMessage<ApprovalToOffscreenProtocol>();

async function sendDecision(approved: boolean): Promise<void> {
    await sendMessageToOffscreen({ type: "approval_decision", approved });
}

document.addEventListener("DOMContentLoaded", () => {
    /* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/consistent-type-assertions */
    const codeEl = document.getElementById("session-code")!;
    const subtitleEl = document.getElementById("subtitle")!;
    const statusEl = document.getElementById("status")!;
    const actionsEl = document.getElementById("actions")!;
    const scopeSectionEl = document.getElementById("scope-section")!;
    const scopeAllEl = document.getElementById("scope-all")!;
    const hostnameListEl = document.getElementById("hostname-list")!;
    const warningIconEl = document.getElementById("warning-icon")!;
    const btnApprove = document.getElementById("btn-approve") as HTMLButtonElement;
    const btnReject = document.getElementById("btn-reject") as HTMLButtonElement;
    /* eslint-enable @typescript-eslint/no-non-null-assertion, @typescript-eslint/consistent-type-assertions */

    btnApprove.addEventListener("click", () => {
        btnApprove.disabled = true;
        btnReject.disabled = true;
        actionsEl.classList.add("hidden");
        scopeSectionEl.classList.add("hidden");
        codeEl.classList.add("hidden");
        subtitleEl.classList.add("hidden");
        statusEl.textContent = "Approved.";
        void sendDecision(true).then(() => window.close());
    });

    btnReject.addEventListener("click", () => {
        btnApprove.disabled = true;
        btnReject.disabled = true;
        actionsEl.classList.add("hidden");
        scopeSectionEl.classList.add("hidden");
        codeEl.classList.add("hidden");
        subtitleEl.classList.add("hidden");
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
                // Show session code
                warningIconEl.classList.add("hidden");
                codeEl.textContent = state.sessionCode;
                codeEl.classList.remove("hidden");

                // Show scope
                const masks = state.hostnameMasks;
                scopeSectionEl.classList.remove("hidden");
                if (masks && masks.length > 0) {
                    scopeAllEl.classList.add("hidden");
                    hostnameListEl.classList.remove("hidden");
                    hostnameListEl.innerHTML = "";
                    for (const mask of masks) {
                        const tag = document.createElement("span");
                        tag.className = "hostname-tag";
                        tag.textContent = mask;
                        hostnameListEl.appendChild(tag);
                    }
                    btnApprove.textContent = "Approve";
                } else {
                    hostnameListEl.classList.add("hidden");
                    scopeAllEl.classList.remove("hidden");
                    btnApprove.textContent = "Approve (all tabs)";
                }

                // Show actions
                subtitleEl.classList.remove("hidden");
                actionsEl.classList.remove("hidden");
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
                codeEl.classList.add("hidden");
                scopeSectionEl.classList.add("hidden");
                actionsEl.classList.add("hidden");
                subtitleEl.classList.add("hidden");
                warningIconEl.classList.remove("hidden");
                statusEl.classList.add("warning");
                statusEl.textContent =
                    "Security alert: multiple simultaneous session requests detected. All requests have been rejected.";
                break;
            default:
                // idle — not pending yet, retry shortly
                codeEl.classList.add("hidden");
                scopeSectionEl.classList.add("hidden");
                actionsEl.classList.add("hidden");
                subtitleEl.classList.add("hidden");
                warningIconEl.classList.add("hidden");
                statusEl.classList.remove("warning");
                statusEl.textContent = "Waiting for session request…";
                setTimeout(pollForState, 200);
                break;
        }
    }

    void pollForState();
});
