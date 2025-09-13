import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, "src/mcp-server.ts"),
            fileName: "mcp-server",
            formats: ["cjs"],
        },
        rollupOptions: {
            external: [
                "fs",
                "path",
                "process",
                "buffer",
                "async_hooks",
                "string_decoder",
                "node:process",
                "node:child_process",
                "node:crypto",
                "node:events",
                "node:path",
                "node:fs",
                "@modelcontextprotocol/sdk",
                "express",
                "command",
            ],
        },
        target: "node22",
    },
});
