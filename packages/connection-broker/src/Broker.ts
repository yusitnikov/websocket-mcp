import { WebSocket, WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import type {
    ClientMessage,
    BrokerMessage,
    RegisterMessage,
    ListByRoleMessage,
    OpenChannelMessage,
    ChannelMessage,
    CloseChannelMessage,
} from "./protocol";

interface Connection {
    role: string;
    ws: WebSocket;
}

interface Channel {
    from: string;
    to: string;
}

/**
 * Generic connection broker that enables ANY two parties to communicate
 * when they can't reach each other directly.
 *
 * The broker is completely role-agnostic and domain-agnostic:
 * - No knowledge of browsers, tabs, MCP, or any specific use case
 * - Just manages connections, channels, and message routing
 * - Roles are arbitrary strings defined by clients
 * - Payloads are completely opaque
 *
 * Protocol:
 * 1. Client connects → declares a role → gets assigned a UUID
 * 2. Any client can list all connections by role (returns UUIDs only)
 * 3. Any client can open a pseudo-connection (channel) to another client by UUID
 * 4. Both ends of channel can send messages to each other
 * 5. Either end can close the channel
 *
 * Message IDs:
 * - Connection IDs: UUID (persistent per client)
 * - Channel IDs: UUID (persistent per channel)
 * - Message IDs: Auto-increment integers (unique per broker instance)
 */
export class ConnectionBroker {
    private connections = new Map<string, Connection>();
    private channels = new Map<string, Channel>();
    private wsServer: WebSocketServer;
    private nextMessageId = 1;

    constructor(port: number) {
        this.wsServer = new WebSocketServer({ port });
        console.log(`Connection broker running on port ${port}`);

        this.wsServer.on("connection", (ws) => {
            this.handleConnection(ws);
        });
    }

    private generateMessageId(): number {
        return this.nextMessageId++;
    }

    private handleConnection(ws: WebSocket): void {
        console.log("New connection established");

        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                this.handleMessage(ws, msg);
            } catch (error) {
                console.error("Failed to parse message:", error);
                ws.close(1003, "Invalid message format");
            }
        });

        ws.on("close", () => {
            const id = this.getConnectionId(ws);
            if (id) {
                console.log(`Connection ${id} closed`);
                this.connections.delete(id);

                // Notify other parties about channel closures
                for (const [channelId, channel] of this.channels.entries()) {
                    if (channel.from === id || channel.to === id) {
                        // Find the other party
                        const otherId = channel.from === id ? channel.to : channel.from;
                        const other = this.connections.get(otherId);

                        if (other) {
                            this.send(other.ws, {
                                type: "channel_closed_notification",
                                id: this.generateMessageId(),
                                channelId,
                            });
                        }

                        this.channels.delete(channelId);
                    }
                }
            }
        });

        ws.on("error", (error) => {
            console.error("WebSocket error:", error);
        });
    }

    private handleMessage(ws: WebSocket, msg: ClientMessage): void {
        switch (msg.type) {
            case "register":
                this.handleRegister(ws, msg);
                break;
            case "list_by_role":
                this.handleListByRole(ws, msg);
                break;
            case "open":
                this.handleOpenChannel(ws, msg);
                break;
            case "message":
                this.handleChannelMessage(ws, msg);
                break;
            case "close":
                this.handleCloseChannel(ws, msg);
                break;
            default:
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                console.error(`Unknown message type: ${(msg as ClientMessage).type}`);
                ws.close(1003, "Unknown message type");
        }
    }

    private handleRegister(ws: WebSocket, msg: RegisterMessage): void {
        const connectionId = randomUUID();
        this.connections.set(connectionId, { role: msg.role, ws });
        console.log(`Registered connection ${connectionId} with role "${msg.role}"`);

        this.send(ws, {
            type: "registered",
            id: this.generateMessageId(),
            replyTo: msg.id,
            connectionId,
        });
    }

    private handleListByRole(ws: WebSocket, msg: ListByRoleMessage): void {
        const ids = Array.from(this.connections.entries())
            .filter(([_, conn]) => conn.role === msg.role)
            .map(([id]) => id);

        console.log(`Listing connections with role "${msg.role}": ${ids.length} found`);

        this.send(ws, {
            type: "connections",
            id: this.generateMessageId(),
            replyTo: msg.id,
            ids,
        });
    }

    private handleOpenChannel(ws: WebSocket, msg: OpenChannelMessage): void {
        const targetConn = this.connections.get(msg.targetId);
        if (!targetConn) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Target connection not found",
            });
            return;
        }

        const fromId = this.getConnectionId(ws);
        if (!fromId) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Connection not registered",
            });
            return;
        }

        const channelId = randomUUID();
        this.channels.set(channelId, { from: fromId, to: msg.targetId });

        console.log(`Opened channel ${channelId} from ${fromId} to ${msg.targetId}`);

        // Notify target about incoming channel
        this.send(targetConn.ws, {
            type: "incoming_channel",
            id: this.generateMessageId(),
            from: fromId,
            channelId,
        });

        // Confirm to opener
        this.send(ws, {
            type: "channel_opened",
            id: this.generateMessageId(),
            replyTo: msg.id,
            channelId,
        });
    }

    private handleChannelMessage(ws: WebSocket, msg: ChannelMessage): void {
        const channel = this.channels.get(msg.channelId);
        if (!channel) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Channel not found",
            });
            return;
        }

        const senderId = this.getConnectionId(ws);
        if (!senderId) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Connection not registered",
            });
            return;
        }

        // Verify sender is part of this channel
        if (senderId !== channel.from && senderId !== channel.to) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Not authorized for this channel",
            });
            return;
        }

        // Route to the other party
        const recipientId = channel.from === senderId ? channel.to : channel.from;
        const recipient = this.connections.get(recipientId);

        if (!recipient) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Recipient not found",
            });
            return;
        }

        console.log(`Routing message on channel ${msg.channelId} from ${senderId} to ${recipientId}`);

        // Send message to recipient (unsolicited)
        this.send(recipient.ws, {
            type: "channel_message",
            id: this.generateMessageId(),
            channelId: msg.channelId,
            payload: msg.payload,
        });

        // Confirm success to sender
        this.send(ws, {
            type: "success",
            id: this.generateMessageId(),
            replyTo: msg.id,
        });
    }

    private handleCloseChannel(ws: WebSocket, msg: CloseChannelMessage): void {
        const channel = this.channels.get(msg.channelId);
        if (!channel) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Channel not found",
            });
            return;
        }

        const initiatorId = this.getConnectionId(ws);
        if (!initiatorId) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Connection not registered",
            });
            return;
        }

        // Verify sender is part of this channel
        if (initiatorId !== channel.from && initiatorId !== channel.to) {
            this.send(ws, {
                type: "error",
                id: this.generateMessageId(),
                replyTo: msg.id,
                error: "Not authorized for this channel",
            });
            return;
        }

        // Notify the other party
        const otherId = channel.from === initiatorId ? channel.to : channel.from;
        const other = this.connections.get(otherId);

        if (other) {
            this.send(other.ws, {
                type: "channel_closed_notification",
                id: this.generateMessageId(),
                channelId: msg.channelId,
            });
        }

        // Confirm to initiator
        this.send(ws, {
            type: "success",
            id: this.generateMessageId(),
            replyTo: msg.id,
        });

        console.log(`Closed channel ${msg.channelId}`);
        this.channels.delete(msg.channelId);
    }

    private getConnectionId(ws: WebSocket): string | undefined {
        for (const [id, conn] of this.connections.entries()) {
            if (conn.ws === ws) return id;
        }
        return undefined;
    }

    private send(ws: WebSocket, msg: BrokerMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    close(): void {
        this.wsServer.close();
    }
}
