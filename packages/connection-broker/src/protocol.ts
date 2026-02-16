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

// Base message structure
interface BaseMessage {
    id: number; // Auto-increment message ID
}

// Base response message structure (includes replyTo field)
interface BaseResponseMessage extends BaseMessage {
    replyTo: number; // Reference to request message ID
}

// Base for success responses (extend this when there are additional props)
type BaseSuccessResponse = BaseResponseMessage;

// Base for error responses (extend this when there are additional props)
interface BaseErrorResponse extends BaseResponseMessage {
    error: string;
}

// Use directly in the union when there are no additional props
export interface SuccessResponse extends BaseSuccessResponse {
    type: "success";
}

// Use directly in the union when there are no additional props
export interface ErrorResponse extends BaseErrorResponse {
    type: "error";
}

// Client → Broker messages
export type ClientMessage =
    | RegisterMessage
    | ListByRoleMessage
    | OpenChannelMessage
    | ChannelMessage
    | CloseChannelMessage;

// Client → Broker messages (before ID assignment)
// We omit 'id' from each member of the union to preserve discriminated union
export type ClientMessageInput =
    | Omit<RegisterMessage, "id">
    | Omit<ListByRoleMessage, "id">
    | Omit<OpenChannelMessage, "id">
    | Omit<ChannelMessage, "id">
    | Omit<CloseChannelMessage, "id">;

export interface RegisterMessage extends BaseMessage {
    type: "register";
    role: string;
}

export interface ListByRoleMessage extends BaseMessage {
    type: "list_by_role";
    role: string;
}

export interface OpenChannelMessage extends BaseMessage {
    type: "open";
    targetId: string;
}

export interface ChannelMessage extends BaseMessage {
    type: "message";
    channelId: string;
    payload: unknown;
}

export interface CloseChannelMessage extends BaseMessage {
    type: "close";
    channelId: string;
}

// Broker → Client response messages (always have replyTo)
export type BrokerResponse =
    | RegisteredMessage
    | ConnectionsMessage
    | ChannelOpenedMessage
    | SuccessResponse
    | ErrorResponse;

// Broker → Client unsolicited notifications (no replyTo)
export type BrokerNotification =
    | IncomingChannelMessage
    | ChannelMessageReceived
    | ChannelClosedNotification;

// All Broker → Client messages
export type BrokerMessage = BrokerResponse | BrokerNotification;

// Responses to 'register' (expect replyTo)
export interface RegisteredMessage extends BaseSuccessResponse {
    type: "registered";
    connectionId: string;
}

// Responses to 'list_by_role' (expect replyTo)
export interface ConnectionsMessage extends BaseSuccessResponse {
    type: "connections";
    ids: string[];
}

// Responses to 'open' (expect replyTo)
export interface ChannelOpenedMessage extends BaseSuccessResponse {
    type: "channel_opened";
    channelId: string;
}

// Notification of incoming channel (no replyTo - unsolicited)
export interface IncomingChannelMessage extends BaseMessage {
    type: "incoming_channel";
    from: string;
    channelId: string;
}

// Notification of incoming channel message (no replyTo - unsolicited)
export interface ChannelMessageReceived extends BaseMessage {
    type: "channel_message";
    channelId: string;
    payload: unknown;
}

// Unsolicited channel closed notification (when other party closes)
export interface ChannelClosedNotification extends BaseMessage {
    type: "channel_closed_notification";
    channelId: string;
}
