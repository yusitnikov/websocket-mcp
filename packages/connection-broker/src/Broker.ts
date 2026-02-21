import { WebSocket, WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import {
    ClientRequest,
    ClientToBrokerProtocol,
    BaseResponseMessage,
    BaseMessage,
    BrokerResponse,
    BrokerToClientProtocol,
} from "./protocol";
import { processRequestByProtocolImplementationMap, ProtocolRequest, ProtocolUnknownRequest } from "@sitnikov/protocol";

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

    private handleMessage(ws: WebSocket, msg: ClientRequest & BaseMessage): void {
        let response: BrokerResponse;

        try {
            response = processRequestByProtocolImplementationMap<ClientToBrokerProtocol>(msg, {
                register: ({ role }) => ({
                    connectionId: this.handleRegister(ws, role),
                }),
                list_by_role: ({ role }) => ({ ids: this.handleListByRole(role) }),
                open: ({ targetId }) => ({ channelId: this.handleOpenChannel(ws, targetId) }),
                message: ({ channelId, payload }) => this.handleChannelMessage(ws, channelId, payload),
                close: ({ channelId }) => this.handleCloseChannel(ws, channelId),
            });
        } catch (error: unknown) {
            if (error instanceof ProtocolUnknownRequest) {
                console.error(error);
                ws.close(1003, error.message);
                return;
            }

            response = {
                type: "error",
                error: error instanceof Error ? error.message : String(error),
            };
        }

        this.send(ws, {
            ...response,
            replyTo: msg.id,
        });
    }

    private handleRegister(ws: WebSocket, role: string): string {
        const connectionId = randomUUID();
        this.connections.set(connectionId, { role, ws });
        console.log(`Registered connection ${connectionId} with role "${role}"`);

        return connectionId;
    }

    private handleListByRole(role: string): string[] {
        const ids = Array.from(this.connections.entries())
            .filter(([_, conn]) => conn.role === role)
            .map(([id]) => id);

        console.log(`Listing connections with role "${role}": ${ids.length} found`);

        return ids;
    }

    private handleOpenChannel(ws: WebSocket, targetId: string): string {
        const targetConn = this.connections.get(targetId);
        if (!targetConn) {
            throw new Error("Target connection not found");
        }

        const fromId = this.getConnectionId(ws);
        if (!fromId) {
            throw new Error("Connection not registered");
        }

        const channelId = randomUUID();
        this.channels.set(channelId, { from: fromId, to: targetId });

        console.log(`Opened channel ${channelId} from ${fromId} to ${targetId}`);

        // Notify target about incoming channel
        this.send(targetConn.ws, {
            type: "incoming_channel",
            from: fromId,
            channelId,
        });

        return channelId;
    }

    private handleChannelMessage(ws: WebSocket, channelId: string, payload: unknown): void {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error("Channel not found");
        }

        const senderId = this.getConnectionId(ws);
        if (!senderId) {
            throw new Error("Connection not registered");
        }

        // Verify sender is part of this channel
        if (senderId !== channel.from && senderId !== channel.to) {
            throw new Error("Not authorized for this channel");
        }

        // Route to the other party
        const recipientId = channel.from === senderId ? channel.to : channel.from;
        const recipient = this.connections.get(recipientId);

        if (!recipient) {
            throw new Error("Recipient not found");
        }

        console.log(`Routing message on channel ${channelId} from ${senderId} to ${recipientId}`);

        // Send message to recipient (unsolicited)
        this.send(recipient.ws, {
            type: "channel_message",
            channelId,
            payload,
        });
    }

    private handleCloseChannel(ws: WebSocket, channelId: string): void {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error("Channel not found");
        }

        const initiatorId = this.getConnectionId(ws);
        if (!initiatorId) {
            throw new Error("Connection not registered");
        }

        // Verify sender is part of this channel
        if (initiatorId !== channel.from && initiatorId !== channel.to) {
            throw new Error("Not authorized for this channel");
        }

        // Notify the other party
        const otherId = channel.from === initiatorId ? channel.to : channel.from;
        const other = this.connections.get(otherId);

        if (other) {
            this.send(other.ws, {
                type: "channel_closed_notification",
                channelId,
            });
        }

        console.log(`Closed channel ${channelId}`);
        this.channels.delete(channelId);
    }

    private getConnectionId(ws: WebSocket): string | undefined {
        for (const [id, conn] of this.connections.entries()) {
            if (conn.ws === ws) return id;
        }
        return undefined;
    }

    private send<TypeT extends keyof BrokerToClientProtocol>(
        ws: WebSocket,
        msg: Omit<ProtocolRequest<BrokerToClientProtocol, TypeT>, "id">,
    ): void;
    private send<T extends BaseResponseMessage>(ws: WebSocket, msg: Omit<T, "id">): void;
    private send(ws: WebSocket, msg: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({
                    ...msg,
                    id: this.generateMessageId(),
                }),
            );
        }
    }

    close(): void {
        this.wsServer.close();
    }
}
