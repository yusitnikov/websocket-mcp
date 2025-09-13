// noinspection ExceptionCaughtLocallyJS

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { program } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isMethodNotFound(error: unknown): boolean {
    return error instanceof McpError && error.code === -32601;
}

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
}

// CLI setup
program
    .name("mcp-client")
    .description("MCP Client for connecting to multiple MCP servers")
    .option("--keep-alive", "Keep connections alive after listing capabilities")
    .parse();

const options = program.opts();

// Example usage
(async () => {
    const clientManager = new McpClientManager();

    try {
        const enabledServers = clientManager.getEnabledServerNames();
        console.log("Enabled servers:", enabledServers);

        // Connect to all enabled servers and list their tools
        for (const serverName of enabledServers) {
            let client: Client;
            try {
                console.log(`\n🔗 Connecting to ${serverName}...`);
                client = await clientManager.connectToServer(serverName);
            } catch (error: unknown) {
                console.error(`❌ Failed to connect to ${serverName}:`, error);
                continue;
            }

            // Get server capabilities
            console.log(`⚙️  Server capabilities for ${serverName}:`);
            const capabilities = client.getServerCapabilities();
            console.log("  ", capabilities);

            // Helper function to check if capability is declared
            const hasCapability = (capabilityName: string) => capabilities && capabilities[capabilityName];

            // List tools for this server
            console.log(`📋 Listing tools for ${serverName}:`);
            try {
                const tools = await client.listTools();
                if (tools.tools && tools.tools.length > 0) {
                    tools.tools.forEach((tool) => {
                        console.log(`  • ${tool.name}: ${tool.description}`);
                    });
                } else {
                    console.log("  No tools available");
                }

                // Check for capability mismatch (method works but capability not declared)
                if (!hasCapability("tools")) {
                    console.log("  ⚠️ Method works despite server not declaring tools capability");
                }
            } catch (error: unknown) {
                if (isMethodNotFound(error)) {
                    if (hasCapability("tools")) {
                        console.log("  ⚠️ Method not supported despite server declaring tools capability");
                    } else {
                        console.log("  🚫 Method not supported by this server");
                    }
                } else {
                    console.error("  ❌ Error listing tools:", error instanceof Error ? error.message : error);
                }
            }

            // List resources for this server
            console.log(`📄 Listing resources for ${serverName}:`);
            try {
                const resources = await client.listResources();
                if (resources.resources && resources.resources.length > 0) {
                    resources.resources.forEach((resource) => {
                        console.log(`  • ${resource.name}: ${resource.description}`);
                    });
                } else {
                    console.log("  No resources available");
                }

                // Check for capability mismatch (method works but capability not declared)
                if (!hasCapability("resources")) {
                    console.log("  ⚠️ Method works despite server not declaring resources capability");
                }
            } catch (error: unknown) {
                if (isMethodNotFound(error)) {
                    if (hasCapability("resources")) {
                        console.log("  ⚠️ Method not supported despite server declaring resources capability");
                    } else {
                        console.log("  🚫 Method not supported by this server");
                    }
                } else {
                    console.error("  ❌ Error listing resources:", error instanceof Error ? error.message : error);
                }
            }

            // List prompts for this server
            console.log(`💭 Listing prompts for ${serverName}:`);
            try {
                const prompts = await client.listPrompts();
                if (prompts.prompts && prompts.prompts.length > 0) {
                    prompts.prompts.forEach((prompt) => {
                        console.log(`  • ${prompt.name}: ${prompt.description}`);
                    });
                } else {
                    console.log("  No prompts available");
                }

                // Check for capability mismatch (method works but capability not declared)
                if (!hasCapability("prompts")) {
                    console.log("  ⚠️ Method works despite server not declaring prompts capability");
                }
            } catch (error: unknown) {
                if (isMethodNotFound(error)) {
                    if (hasCapability("prompts")) {
                        console.log("  ⚠️ Method not supported despite server declaring prompts capability");
                    } else {
                        console.log("  🚫 Method not supported by this server");
                    }
                } else {
                    console.error("  ❌ Error listing prompts:", error instanceof Error ? error.message : error);
                }
            }
        }

        console.log("\n✅ All server connections attempted.");

        if (options.keepAlive) {
            console.log("🔄 Keeping connections alive. Press Ctrl+C to exit.");

            process.on("SIGINT", async () => {
                console.log("\n🔄 Shutting down and disconnecting from all servers...");
                await clientManager.disconnectAll();
                process.exit(0);
            });

            // Keep alive
            setInterval(() => {}, 1000);
        } else {
            console.log("🔄 Disconnecting from all servers...");
            await clientManager.disconnectAll();
            console.log("✅ Done.");
        }
    } catch (error) {
        console.error("Error:", error);
        process.exitCode = 1;
    } finally {
        // Ensure proper cleanup and avoid pipe issues
        if (!options.keepAlive) {
            // Small delay to allow any pending I/O operations to complete
            await new Promise((resolve) => setTimeout(resolve, 100));
            process.exit(process.exitCode || 0);
        }
    }
})();
