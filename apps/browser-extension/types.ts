/**
 * Status message sent from offscreen document to service worker (then relayed to popup).
 */
export interface StatusMessage {
    type: "broker-status";
    connected: boolean;
    connectionId?: string;
}

/**
 * Request sent from popup to ask for current status.
 */
export interface GetStatusMessage {
    type: "get-broker-status";
}

/**
 * Request sent from offscreen document to service worker to list open tabs.
 */
export interface ListTabsRequest {
    type: "list-tabs";
}

/**
 * Response from service worker with list of open tabs.
 */
export interface ListTabsResult {
    success: true;
    tabs: Array<{ tabId: number; title: string; url: string }>;
}

/**
 * Request sent from offscreen document to service worker to execute JS in a tab.
 */
export interface ExecuteJsRequest {
    type: "execute-js";
    tabId: number;
    code: string;
}

/**
 * Successful response from service worker with JS execution result.
 */
export interface ExecuteJsSuccess {
    success: true;
    result: string;
}

/**
 * Error response from service worker with JS execution error details.
 */
export interface ExecuteJsError {
    success: false;
    message: string;
    name?: string;
    stack?: string;
}

export type ExecuteJsResult = ExecuteJsSuccess | ExecuteJsError;
