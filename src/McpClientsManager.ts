import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocketServerTransport } from "./transports/WebSocketServerTransport.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./utils.js";
import { WebSocketServerManager } from "./WebSocketServerManager.ts";

interface ServerConfig {
    name: string;
    type: "stdio" | "http" | "websocket";
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
}

interface Config {
    servers: ServerConfig[];
}

export class McpClientsManager {
    private readonly config: Config;

    constructor(private readonly webSocketServerManager: WebSocketServerManager) {
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

        const transport = this.getTransport(serverName);

        const client = new Client({
            name: "mcp-bridge-client",
            version: "1.0.0",
        });

        await client.connect(transport);

        log(`Connected to MCP server: ${serverName}`);
        return client;
    }

    private getTransport(serverName: string): Transport {
        const serverConfig = this.config.servers.find((s) => s.name === serverName);

        if (!serverConfig) {
            throw new Error(`Server not found: ${serverName}`);
        }

        if (!serverConfig.enabled) {
            throw new Error(`Server is disabled: ${serverName}`);
        }

        let transport: Transport;

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
            case "websocket":
                transport = new WebSocketServerTransport(this.webSocketServerManager);
                break;
            default:
                throw new Error(`Unsupported server type: ${serverConfig.type}`);
        }

        log("Initialized transport for", serverName);
        return transport;
    }

    getEnabledServerNames(): string[] {
        return this.config.servers.filter((server) => server.enabled).map((server) => server.name);
    }
}
