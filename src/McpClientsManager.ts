import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

interface ServerConfig {
    name: string;
    type: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
}

interface Config {
    servers: ServerConfig[];
}

export class McpClientsManager {
    private config: Config;
    private clients: Map<string, Client> = new Map();

    constructor() {
        this.config = this.loadConfig();
    }

    private loadConfig(): Config {
        const currentFolder = path.dirname(fileURLToPath(import.meta.url));
        const fullPath = path.resolve(currentFolder, "../mcp-config.json");

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Config file not found: ${fullPath}`);
        }

        const configContent = fs.readFileSync(fullPath, "utf8");
        return JSON.parse(configContent);
    }

    async connectToServer(serverName: string): Promise<Client> {
        const serverConfig = this.config.servers.find((s) => s.name === serverName);

        if (!serverConfig) {
            throw new Error(`Server not found: ${serverName}`);
        }

        if (!serverConfig.enabled) {
            throw new Error(`Server is disabled: ${serverName}`);
        }

        if (this.clients.has(serverName)) {
            return this.clients.get(serverName)!;
        }

        const client = new Client({
            name: "mcp-bridge-client",
            version: "1.0.0",
        });

        let transport;

        switch (serverConfig.type) {
            case "stdio":
                if (!serverConfig.command) {
                    throw new Error(`Stdio server ${serverName} missing command`);
                }

                transport = new StdioClientTransport({
                    command: serverConfig.command,
                    args: serverConfig.args || [],
                });
                break;
            case "http":
                if (!serverConfig.url) {
                    throw new Error(`HTTP server ${serverName} missing URL`);
                }

                transport = new StreamableHTTPClientTransport(new URL(serverConfig.url));
                break;
            default:
                throw new Error(`Unsupported server type: ${serverConfig.type}`);
        }

        await client.connect(transport);
        this.clients.set(serverName, client);

        console.log(`Connected to MCP server: ${serverName}`);
        return client;
    }

    async disconnectFromServer(serverName: string): Promise<void> {
        const client = this.clients.get(serverName);
        if (client) {
            await client.close();
            this.clients.delete(serverName);
            console.log(`Disconnected from MCP server: ${serverName}`);
        }
    }

    async disconnectAll(): Promise<void> {
        const disconnectPromises = Array.from(this.clients.keys()).map((serverName) =>
            this.disconnectFromServer(serverName),
        );
        await Promise.all(disconnectPromises);
    }

    getEnabledServerNames(): string[] {
        return this.config.servers.filter((server) => server.enabled).map((server) => server.name);
    }
}
