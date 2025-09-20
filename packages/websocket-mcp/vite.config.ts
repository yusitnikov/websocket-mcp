/// <reference types='vitest' />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import * as path from "path";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/websocket-mcp",
    plugins: [
        nxViteTsPaths(),
        nxCopyAssetsPlugin(["README.md", "../../LICENSE.md"]),
        dts({ entryRoot: "src", tsconfigPath: path.join(__dirname, "tsconfig.lib.json"), pathsToAliases: false }),
    ],
    // Configuration for building your library.
    // See: https://vitejs.dev/guide/build.html#library-mode
    build: {
        outDir: "../../dist/packages/websocket-mcp",
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        lib: {
            // Could also be a dictionary or array of multiple entry points.
            entry: {
                index: "src/index.ts",
                frontend: "src/lib/frontend/index.ts",
                "bin/run": "src/bin/run.ts",
            },
            name: "websocket-mcp",
            // Change this to the formats you want to support.
            // Don't forget to update your package.json as well.
            formats: ["es" as const],
        },
        rollupOptions: {
            // External packages that should not be bundled into your library.
            external: [
                /^@modelcontextprotocol\/sdk(\/.+)?$/,
                "ws",
                "path",
                "fs",
                "http",
                "express",
                "commander",
                /^node:/,
            ],
        },
    },
}));
