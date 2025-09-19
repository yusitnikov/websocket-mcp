#!/usr/bin/env node

import { Command } from "commander";
import { McpServerProxy } from "../lib/McpServerProxy.ts";
import { getProxyOptionsFromConfig, loadConfigs } from "../lib/configs.ts";

const program = new Command();
program.description("MCP Proxy Server").option("-p, --port <port>", "port to run the server on", "3003");

program.parse();
const { port } = program.opts();

const proxyServer = new McpServerProxy(Number(port));

const servers = loadConfigs("mcp-config.json");

for (const config of servers) {
    proxyServer.proxy(getProxyOptionsFromConfig(config, proxyServer));
}

proxyServer.start();
