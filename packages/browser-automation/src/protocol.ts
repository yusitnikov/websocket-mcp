import { AnyProtocolRequest, AnyProtocolResponse } from "@sitnikov/protocol";

// Commands sent TO the extension
export type ExtensionAutomationProtocol = {
    list_tabs: {
        request: {
            sessionToken: string;
        };
        response: chrome.tabs.Tab[];
    };
    execute_js: {
        request: {
            sessionToken: string;
            tabId: number; // Chrome tab ID (number)
            code: string;
        };
        response: ExecuteJsResponse;
    };
    approve_session: {
        request: {
            sessionCode: string;
        };
        response: ApproveSessionResponse;
    };
};

export type ExtensionRequest = AnyProtocolRequest<ExtensionAutomationProtocol>;

// Responses sent FROM the extension
export interface ExtensionError {
    type: "error";
    message: string;
}

export interface ExecuteJsSuccess {
    success: true;
    result: string; // JSON-serialized
}

export interface ExecuteJsError {
    success: false;
    message: string;
    name?: string;
    stack?: string;
}

export type ExecuteJsResponse = ExecuteJsSuccess | ExecuteJsError;

export interface ApproveSessionSuccess {
    success: true;
    sessionToken: string;
}

export interface ApproveSessionRejected {
    success: false;
}

export type ApproveSessionResponse = ApproveSessionSuccess | ApproveSessionRejected;

export type ExtensionResponse = AnyProtocolResponse<ExtensionAutomationProtocol> | ExtensionError;
