/**
 * Protocol types for the generic connection broker.
 *
 * The broker is completely role-agnostic - it only knows about:
 * - Connections (identified by UUID)
 * - Roles (arbitrary strings)
 * - Channels (pseudo-connections between two connections)
 * - Messages (opaque payloads routed between channels)
 *
 * Every message has a unique `id` field (auto-increment integer).
 * Messages that are direct responses have a `replyTo` field referencing the request message ID.
 */
import { AnyProtocolRequest, AnyProtocolResponse } from "@sitnikov/protocol";

// Base message structure
export interface BaseMessage {
    id: number; // Auto-increment message ID
}

// Base response message structure (includes replyTo field)
export interface BaseResponseMessage extends BaseMessage {
    replyTo: number; // Reference to request message ID
}

// Error message
export interface ErrorResponse {
    type: "error";
    error: string;
}

export type ClientToBrokerProtocol = {
    register: {
        request: {
            role: string;
        };
        response: {
            connectionId: string;
        };
    };
    list_by_role: {
        request: {
            role: string;
        };
        response: {
            ids: string[];
        };
    };
    open: {
        request: {
            targetId: string;
        };
        response: {
            channelId: string;
        };
    };
    message: {
        request: {
            channelId: string;
            payload: unknown;
        };
    };
    close: {
        request: {
            channelId: string;
        };
    };
};

export type BrokerToClientProtocol = {
    incoming_channel: {
        request: {
            channelId: string;
            from: string;
        };
    };
    channel_message: {
        request: {
            channelId: string;
            payload: unknown;
        };
    };
    channel_closed_notification: {
        request: {
            channelId: string;
        };
    };
};

// Client → Broker messages
export type ClientRequest = AnyProtocolRequest<ClientToBrokerProtocol>;

// Broker → Client response messages (always have replyTo)
export type BrokerResponse = AnyProtocolResponse<ClientToBrokerProtocol> | ErrorResponse;

// Broker → Client unsolicited notifications (no replyTo)
export type BrokerNotification = AnyProtocolRequest<BrokerToClientProtocol>;

// All Broker → Client messages
export type BrokerMessage = (Exclude<BrokerResponse, void> & BaseResponseMessage) | BrokerNotification;
