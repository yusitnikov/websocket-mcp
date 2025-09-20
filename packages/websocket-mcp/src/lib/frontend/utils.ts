export const sleep = (timeout: number) => new Promise<void>((resolve) => setTimeout(resolve, timeout));

export class AbortablePromise<T> extends Promise<T> {
    private readonly controller: AbortController;
    public readonly signal: AbortSignal;

    constructor(
        callback: (
            resolve: (value: T | PromiseLike<T>) => void,
            reject: (reason?: any) => void,
            signal: AbortSignal,
        ) => void,
    ) {
        const controller = new AbortController();
        const { signal } = controller;

        super((resolve, reject) => {
            if (signal.aborted) {
                reject(signal.reason);
                return;
            }

            callback(resolve, reject, signal);

            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });

        this.controller = controller;
        this.signal = signal;
    }

    get aborted() {
        return this.signal.aborted;
    }

    abort(reason?: any) {
        this.controller.abort(reason);
    }
}
