#!/usr/bin/env node

import { Command } from "commander";
import { ConnectionBroker } from "../src/Broker";

const program = new Command();

program
    .name("connection-broker")
    .description("Generic connection broker for routing messages between clients")
    .version("0.1.0")
    .option("-p, --port <port>", "Port to listen on", "3004")
    .action((options) => {
        const port = parseInt(options.port, 10);

        if (isNaN(port) || port < 1 || port > 65535) {
            console.error("Invalid port number");
            process.exit(1);
        }

        const broker = new ConnectionBroker(port);

        // Graceful shutdown
        process.on("SIGINT", () => {
            console.log("\nShutting down...");
            broker.close();
            process.exit(0);
        });

        process.on("SIGTERM", () => {
            console.log("\nShutting down...");
            broker.close();
            process.exit(0);
        });
    });

program.parse();
