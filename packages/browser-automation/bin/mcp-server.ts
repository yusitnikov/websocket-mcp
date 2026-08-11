#!/usr/bin/env node

import { Command } from "commander";
// noinspection ES6PreferShortImport
import { BrowserMcpServer } from "../src/mcp-server/BrowserMcpServer";

const program = new Command();

program
    .name("browser-mcp-server")
    .description("MCP server for browser automation via connection broker")
    .version("1.0.0")
    .option("--broker <url>", "WebSocket URL of the connection broker", "ws://localhost:3004")
    .option("--log <file>", "Path to log file (omit to disable logging)")
    .option("--stdio", "Use stdio transport (default)", true)
    .action(async (options) => {
        const server = new BrowserMcpServer({
            logFilePath: options.log,
            brokerUrl: options.broker,
            transport: "stdio",
            serverInfo: {
                name: "browser-automation",
                version: "1.0.0",
            },
        });

        try {
            await server.start();
        } catch {
            process.exit(1);
        }
    });

program.parse();
