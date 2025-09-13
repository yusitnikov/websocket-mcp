// noinspection ExceptionCaughtLocallyJS

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { program } from "commander";
import { McpClientsManager } from "./McpClientsManager.ts";
import { isMethodNotFoundError } from "./isMethodNotFoundError.ts";

// CLI setup
program
    .description("MCP Client for connecting to multiple MCP servers")
    .option("--keep-alive", "Keep connections alive after listing capabilities")
    .parse();

const options = program.opts();

// Example usage
(async () => {
    const clientManager = new McpClientsManager();

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
                if (isMethodNotFoundError(error)) {
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
                if (isMethodNotFoundError(error)) {
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
                if (isMethodNotFoundError(error)) {
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
