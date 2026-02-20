/// <reference types='vitest' />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import * as path from "path";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/protocol",
    plugins: [
        nxViteTsPaths(),
        nxCopyAssetsPlugin(["README.md", "../../LICENSE.md"]),
        dts({ entryRoot: "src", tsconfigPath: path.join(__dirname, "tsconfig.lib.json"), pathsToAliases: false }),
    ],
    build: {
        outDir: "../../dist/packages/protocol",
        emptyOutDir: true,
        reportCompressedSize: true,
        commonjsOptions: {
            transformMixedEsModules: true,
        },
        lib: {
            entry: {
                index: "src/index.ts",
            },
            name: "protocol",
            formats: ["es" as const],
        },
    },
}));
