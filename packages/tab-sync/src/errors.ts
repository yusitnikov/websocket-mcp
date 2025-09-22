export class TimeoutError extends Error {
    constructor(timeout: number) {
        super(`Operation timed out after ${timeout}ms`);
        this.name = "TimeoutError";
    }
}

export class NoHandlerError extends Error {
    constructor(messageType: string) {
        super(`No handler registered for message type "${messageType}"`);
        this.name = "NoHandlerError";
    }
}
