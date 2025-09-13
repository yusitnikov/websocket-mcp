import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: "index",
            formats: ["cjs"],
        },
        rollupOptions: {
            external: ["fs", "path", "process", "node:process", "@modelcontextprotocol/sdk"],
        },
        target: "node22",
    },
});
