import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export class McpClientManager {
    private config: Config;
    private clients: Map<string, Client> = new Map();

    constructor(configPath: string = "../mcp-config.json") {
        this.config = this.loadConfig(configPath);
    }

    private loadConfig(configPath: string): Config {
        const fullPath = path.resolve(__dirname, configPath);

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

        try {
            let transport;

            if (serverConfig.type === "stdio") {
                if (!serverConfig.command) {
                    throw new Error(`Stdio server ${serverName} missing command`);
                }

                transport = new StdioClientTransport({
                    command: serverConfig.command,
                    args: serverConfig.args || [],
                });
            } else if (serverConfig.type === "http") {
                if (!serverConfig.url) {
                    throw new Error(`HTTP server ${serverName} missing URL`);
                }

                transport = new StreamableHTTPClientTransport(new URL(serverConfig.url));
            } else {
                throw new Error(`Unsupported server type: ${serverConfig.type}`);
            }

            await client.connect(transport);
            this.clients.set(serverName, client);

            console.log(`Connected to MCP server: ${serverName}`);
            return client;
        } catch (error) {
            console.error(`Failed to connect to ${serverName}:`, error);
            throw error;
        }
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

    getConnectedServers(): string[] {
        return Array.from(this.clients.keys());
    }

    getClient(serverName: string): Client | undefined {
        return this.clients.get(serverName);
    }

    getEnabledServerNames(): string[] {
        return this.config.servers.filter((server) => server.enabled).map((server) => server.name);
    }

    async listTools(serverName: string) {
        const client = await this.connectToServer(serverName);
        return await client.listTools();
    }

    async listResources(serverName: string) {
        const client = await this.connectToServer(serverName);
        return await client.listResources();
    }

    async listPrompts(serverName: string) {
        const client = await this.connectToServer(serverName);
        return await client.listPrompts();
    }

    async callTool(serverName: string, name: string, arguments_: any) {
        const client = await this.connectToServer(serverName);
        return await client.callTool({
            name,
            arguments: arguments_,
        });
    }

    async readResource(serverName: string, uri: string) {
        const client = await this.connectToServer(serverName);
        return await client.readResource({ uri });
    }

    async getPrompt(serverName: string, name: string, arguments_?: any) {
        const client = await this.connectToServer(serverName);
        return await client.getPrompt({
            name,
            arguments: arguments_,
        });
    }
}

// Example usage
(async () => {
    const clientManager = new McpClientManager();

    try {
        // List all enabled servers
        console.log("Enabled servers:", clientManager.getEnabledServerNames());

        // Example: connect to a server and list its capabilities
        // const serverName = 'example-stdio-server';
        // const tools = await clientManager.listTools(serverName);
        // console.log(`Tools from ${serverName}:`, tools);

        // Clean up connections
        await clientManager.disconnectAll();
    } catch (error) {
        console.error("Error:", error);
    }
})();
