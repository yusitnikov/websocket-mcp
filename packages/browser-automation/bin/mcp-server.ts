#!/usr/bin/env node

import { Command } from "commander";
// noinspection ES6PreferShortImport
import { BrowserMcpServer } from "../src/mcp-server/BrowserMcpServer";
import { join } from "path";

const LOG_FILE = join(__dirname, "../../../logs/mcp-server.log");

const program = new Command();

program
    .name("browser-mcp-server")
    .description("MCP server for browser automation via connection broker")
    .version("1.0.0")
    .option("--broker <url>", "WebSocket URL of the connection broker", "ws://localhost:3004")
    .option("--stdio", "Use stdio transport (default)", true)
    .action(async (options) => {
        const server = new BrowserMcpServer(LOG_FILE);

        try {
            await server.start(options.broker, "stdio");
        } catch {
            process.exit(1);
        }
    });

program.parse();
