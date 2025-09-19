#!/usr/bin/env node

import { Command } from "commander";
import { McpServerProxy } from "../lib/McpServerProxy.ts";
import { getProxyOptionsFromConfig, loadConfigs } from "../lib/configs.ts";

const program = new Command();
program
    .description("MCP Proxy Server - bridges AI clients to multiple MCP servers")
    .argument(
        "[websockets...]",
        'WebSocket servers: "name" or "name:wsPath" (name=HTTP endpoint, wsPath=browser connection)',
    )
    .option("-c, --config <path>", "path to JSON config file")
    .option("-p, --port <port>", "port for HTTP and WebSocket endpoints", "3003");

program.parse();

const options = program.opts();
const webSocketArgs = program.args;
const { port, config: configPath } = options;

// Validate that at least one configuration method is provided
if (!configPath && !webSocketArgs.length) {
    console.error("Error: Must provide either --config <path> or WebSocket server arguments");
    console.log();
    program.help({ error: true });
    process.exit(1);
}

const proxyServer = new McpServerProxy(Number(port));

// Load from config file
if (configPath) {
    for (const config of loadConfigs(configPath)) {
        proxyServer.proxy(getProxyOptionsFromConfig(config, proxyServer));
    }
}

// Create WebSocket configs from arguments
for (const arg of webSocketArgs) {
    const [name, path] = arg.split(":", 2);

    proxyServer.proxy(
        getProxyOptionsFromConfig(
            {
                name,
                enabled: true,
                type: "websocket",
                path,
            },
            proxyServer,
        ),
    );
}

proxyServer.start();
