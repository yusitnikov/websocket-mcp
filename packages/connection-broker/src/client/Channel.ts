import type { BrokerClient } from "./BrokerClient";

/**
 * Represents a channel (pseudo-connection) between two connections.
 *
 * Channels are ephemeral: open → use → close
 * Either party can send messages or close the channel.
 */
export class Channel {
    onMessage?: (payload: unknown) => void;
    onClosed?: () => void;

    constructor(
        private client: BrokerClient,
        private channelId: string,
        private peerId: string,
    ) {}

    /**
     * Send a message to the other party on this channel.
     * The payload is completely opaque - the broker just routes it.
     * Returns a promise that resolves when the broker confirms delivery.
     */
    async send(payload: unknown): Promise<void> {
        await this.client.sendWithResponse("message", {
            channelId: this.channelId,
            payload,
        });
    }

    async sendWithResponse(payload: unknown, timeout: number): Promise<unknown> {
        return await new Promise<unknown>((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeout / 1000} seconds`));
            }, timeout);

            this.onMessage = (payload: unknown) => {
                clearTimeout(timeoutHandle);
                resolve(payload);
            };

            this.onClosed = () => {
                clearTimeout(timeoutHandle);
                reject(new Error("Channel closed before receiving response"));
            };

            this.send(payload);
        });
    }

    /**
     * Close this channel.
     * Notifies the other party that the channel is closed.
     */
    close(): void {
        this.client.send("close", { channelId: this.channelId });
    }

    /**
     * Get the ID of the peer on the other end of this channel.
     */
    getPeerId(): string {
        return this.peerId;
    }

    /**
     * Get the channel ID.
     */
    getChannelId(): string {
        return this.channelId;
    }

    /** @internal */
    handleMessage(payload: unknown): void {
        this.onMessage?.(payload);
    }

    /** @internal */
    handleClosed(): void {
        this.onClosed?.();
    }
}
