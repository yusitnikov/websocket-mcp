import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocketServerTransport } from "./transports/WebSocketServerTransport.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./utils.js";
import { WebSocketServerManager } from "./WebSocketServerManager.ts";

interface BaseServerConfig {
    name: string;
    enabled: boolean;
}

interface StdioServerConfig extends BaseServerConfig {
    type: "stdio";
    command: string;
    args?: string[];
}

interface HttpServerConfig extends BaseServerConfig {
    type: "http";
    url: string;
}

interface WebSocketServerConfig extends BaseServerConfig {
    type: "websocket";
    path?: string;
}
// Default path to server name if not provided, then normalize to ensure it starts with /
export const getWebSocketPathFromConfig = ({ name, path = name }: WebSocketServerConfig) =>
    path.startsWith("/") ? path : `/${path}`;

type ServerConfig = StdioServerConfig | HttpServerConfig | WebSocketServerConfig;

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

    getTransport(serverName: string): Transport {
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
                transport = new WebSocketServerTransport(
                    this.webSocketServerManager,
                    getWebSocketPathFromConfig(serverConfig),
                );
                break;
            default:
                throw new Error(`Unsupported server type: ${(serverConfig as any).type}`);
        }

        log("Initialized transport for", serverName);
        return transport;
    }

    getEnabledServers() {
        return this.config.servers.filter((server) => server.enabled);
    }
}
