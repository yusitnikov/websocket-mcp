import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/apps/browser-extension",
    plugins: [
        nxViteTsPaths(),
        webExtension({
            manifest: "manifest.json",
            additionalInputs: ["offscreen/offscreen.html"],
            disableAutoLaunch: true,
        }),
    ],
    build: {
        outDir: "../../dist/apps/browser-extension",
        emptyOutDir: true,
    },
});
