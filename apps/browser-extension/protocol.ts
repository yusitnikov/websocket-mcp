import { ExecuteJsResponse, ExtensionError, TabInfo } from "@sitnikov/browser-automation/extension-tab-client";
import {
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
        response: TabInfo[];
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
    broker_status: {
        request: {
            connectionId?: string;
        };
    };
};

export type PopupToWorkerProtocol = {
    get_broker_status: {
        response: any;
    };
};

export type ApprovalToWorkerProtocol = {
    approval_decision: {
        request: {
            approved: boolean;
        };
    };
    get_approval_state: {
        response: { status: "idle" } | { status: "pending"; sessionCode: string } | { status: "blocked" };
    };
};

export type AnyToWorkerProtocol = OffscreenToWorkerProtocol & PopupToWorkerProtocol & ApprovalToWorkerProtocol;

export type ForwardedToOffscreenProtocol = PopupToWorkerProtocol & ApprovalToWorkerProtocol;

export type ForwardedToPopupProtocol = Pick<OffscreenToWorkerProtocol, "broker_status">;

export const getSendMessage =
    <ContractT extends ProtocolContract>() =>
    async <TypeT extends keyof ContractT>(message: ProtocolRequest<ContractT, TypeT>) => {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return (await chrome.runtime.sendMessage(message)) as ProtocolResponse<ContractT, TypeT>;
    };

export const processIncomingMessages = <ContractT extends ProtocolContract>(
    implementationMap: ProtocolSyncImplementationMap<ContractT> | ProtocolAsyncImplementationMap<ContractT>,
) =>
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean | undefined => {
        let response;

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
