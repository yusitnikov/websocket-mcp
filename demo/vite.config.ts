import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    resolve: {
        alias: {
            "@main": path.resolve(__dirname, "../src"),
        },
    },
    server: {
        port: 3000,
        open: true,
    },
    build: {
        outDir: "dist",
        rollupOptions: {
            input: {
                main: "index.html",
            },
        },
    },
    // Ensure TypeScript files are handled correctly
    esbuild: {
        target: "es2020",
    },
});
