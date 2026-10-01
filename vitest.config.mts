import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // The browser SDK's extensionless roughjs imports need Vite resolution in
    // DOM contract tests; do not externalize these two packages to Node's ESM loader.
    server: { deps: { inline: ["@excalidraw/excalidraw", "roughjs"] } },
    maxWorkers: 1,
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
  },
});
