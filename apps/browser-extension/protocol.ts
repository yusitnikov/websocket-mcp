import { ExecuteJsResponse, ExtensionError } from "@sitnikov/browser-automation/protocol";
import {
    AnyProtocolResponse,
    processRequestByProtocolImplementationMap,
    ProtocolAsyncImplementationMap,
    ProtocolContract,
    ProtocolRequest,
    ProtocolResponse,
    ProtocolSyncImplementationMap,
    ProtocolUnknownRequest,
} from "@sitnikov/protocol";

export type OffscreenToWorkerProtocol = {
    list_tabs: {
        response: chrome.tabs.Tab[];
    };
    execute_js: {
        request: {
            tabId: number;
            code: string;
        };
        response: ExecuteJsResponse;
    };
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    open_approval_tab: {};
};

export type PopupToOffscreenProtocol = {
    get_broker_status: {
        // Connection ID
        response: string | undefined;
    };
};

export type OffscreenToPopupProtocol = {
    broker_status: {
        request: {
            connectionId?: string;
        };
    };
};

export type ApprovalToOffscreenProtocol = {
    approval_decision: {
        request: {
            approved: boolean;
        };
    };
    get_approval_state: {
        response: { status: "idle" } | { status: "pending"; sessionCode: string } | { status: "blocked" };
    };
};

export type AnyToWorkerProtocol = OffscreenToWorkerProtocol;

export type AnyToOffscreenProtocol = PopupToOffscreenProtocol & ApprovalToOffscreenProtocol;

export type AnyToPopupProtocol = OffscreenToPopupProtocol;

export const getSendMessage =
    <ContractT extends ProtocolContract>() =>
    <TypeT extends keyof ContractT>(
        message: ProtocolRequest<ContractT, TypeT>,
    ): Promise<ProtocolResponse<ContractT, TypeT>> =>
        chrome.runtime.sendMessage(message);

export const processIncomingMessages = <ContractT extends ProtocolContract>(
    implementationMap: ProtocolSyncImplementationMap<ContractT> | ProtocolAsyncImplementationMap<ContractT>,
) =>
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean | undefined => {
        let response: AnyProtocolResponse<ContractT> | Promise<AnyProtocolResponse<ContractT>> | ExtensionError;

        const formatError = (error: unknown): ExtensionError => ({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });

        try {
            response = processRequestByProtocolImplementationMap(message, implementationMap);
        } catch (error: unknown) {
            if (error instanceof ProtocolUnknownRequest) {
                return undefined;
            }

            response = formatError(error);
        }

        // noinspection SuspiciousTypeOfGuard
        if (!(response instanceof Promise)) {
            sendResponse(response);
            return undefined;
        }

        (async () => {
            try {
                response = await response;
            } catch (error) {
                response = formatError(error);
            }

            sendResponse(response);
        })();

        return true;
    });
