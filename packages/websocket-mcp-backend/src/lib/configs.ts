import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
// noinspection ES6PreferShortImport
import { WebSocketServerTransport } from "./WebSocketServerTransport";
import fs from "fs";
import { McpServerProxy, McpServerProxyOptions } from "./McpServerProxy.ts";

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

export type ServerConfig = StdioServerConfig | HttpServerConfig | WebSocketServerConfig;

export const loadConfigs = (path: string) => {
    if (!fs.existsSync(path)) {
        throw new Error(`Config file not found: ${path}`);
    }

    const configContent = fs.readFileSync(path, "utf8");
    const config = JSON.parse(configContent) as { servers: ServerConfig[] };
    return config.servers.filter((server) => server.enabled);
};

export const getProxyOptionsFromConfig = (config: ServerConfig, proxy: McpServerProxy): McpServerProxyOptions => {
    switch (config.type) {
        case "stdio":
            if (!config.command) {
                throw new Error(`Stdio server ${config.name} missing command`);
            }

            return {
                name: config.name,
                getTransport: () =>
                    new StdioClientTransport({
                        command: config.command,
                        args: config.args || [],
                    }),
            };
        case "http":
            if (!config.url) {
                throw new Error(`HTTP server ${config.name} missing URL`);
            }

            return {
                name: config.name,
                getTransport: () => new StreamableHTTPClientTransport(new URL(config.url)),
            };
        case "websocket":
            let path = config.path ?? config.name;
            if (!path.startsWith("/")) {
                path = `/${path}`;
            }
            console.log(`WebSocket endpoint: ws://localhost:${proxy.port}${path}`);

            return {
                name: config.name,
                getTransport: () => new WebSocketServerTransport(proxy.webSocketServerManager, path),
            };
        default:
            throw new Error(`Unsupported server type: ${(config as any).type}`);
    }
};
