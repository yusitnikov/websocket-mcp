import { CustomMessageEvent, CustomMessageResponseEvent } from "./events.ts";
// noinspection ES6PreferShortImport
import { AbortablePromise } from "./utils";
import { TimeoutError, NoHandlerError } from "./errors.ts";
import { PartialTabInfo } from "./tabInfo.ts";

let autoId = 0;

export abstract class TabSyncBase<SenderTabT extends PartialTabInfo | undefined> {
    protected pendingMessages = new Map<
        number,
        {
            resolve: (value: any) => void;
            reject: (reason: Error) => void;
            abortController: AbortController;
        }
    >();
    protected customMessageHandlers = new Map<string, MessageHandler<SenderTabT, any, any>>();
    protected readonly defaultTimeout = 5000;

    protected generateMessageId() {
        return ++autoId;
    }

    onCustomMessage<PayloadT, ResponseT>(
        messageType: string,
        handler: MessageHandler<SenderTabT, PayloadT, ResponseT>,
    ): void {
        this.customMessageHandlers.set(messageType, handler);
    }

    protected waitForCustomMessageResponse<ResponseT>(messageId: number, timeout: number) {
        const promise = new AbortablePromise<ResponseT>((resolve, reject, abortController) => {
            this.pendingMessages.set(messageId, {
                resolve,
                reject,
                abortController,
            });
        });

        const timeoutId = setTimeout(() => {
            promise.abort(new TimeoutError(timeout));
        }, timeout);

        promise.finally(() => {
            this.pendingMessages.delete(messageId);
            clearTimeout(timeoutId);
        });

        return promise;
    }

    protected async handleCustomMessage<PayloadT, ResponseT>(
        event: CustomMessageEvent<PayloadT>,
        senderTab: SenderTabT,
    ): Promise<CustomMessageResponseEvent<ResponseT>> {
        const handler = this.customMessageHandlers.get(event.messageType);

        if (!handler) {
            return {
                type: "custom_message_response",
                messageId: event.messageId,
                payload: new NoHandlerError(event.messageType),
            };
        }

        try {
            const response = await handler(event.payload, senderTab);

            return {
                type: "custom_message_response",
                messageId: event.messageId,
                payload: response,
            };
        } catch (error) {
            return {
                type: "custom_message_response",
                messageId: event.messageId,
                payload: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }

    protected handleCustomMessageResponse<ResponseT>(event: CustomMessageResponseEvent<ResponseT>): void {
        const pending = this.pendingMessages.get(event.messageId);
        if (!pending) {
            return;
        }

        this.pendingMessages.delete(event.messageId);

        if (event.payload instanceof Error) {
            pending.reject(event.payload);
        } else {
            pending.resolve(event.payload);
        }
    }
}

export type MessageHandler<TabT extends PartialTabInfo | undefined, PayloadT, ResponseT> = (
    payload: PayloadT,
    senderTab: TabT,
) => ResponseT | Promise<ResponseT>;
