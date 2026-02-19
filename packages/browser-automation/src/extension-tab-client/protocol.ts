// Commands sent TO the extension
export interface ListTabsCommand {
    action: "list_tabs";
}

export interface ExecuteJsCommand {
    action: "execute_js";
    tabId: number; // Chrome tab ID (number)
    code: string;
}

export type ExtensionCommand = ListTabsCommand | ExecuteJsCommand;

// Responses sent FROM the extension
export interface TabInfo {
    tabId: number;
    title: string;
    url: string;
}

export interface ListTabsSuccess {
    success: true;
    tabs: TabInfo[];
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

export interface ExtensionError {
    success: false;
    error: string;
}

export type ExtensionResponse = ListTabsSuccess | ExecuteJsSuccess | ExecuteJsError | ExtensionError;
