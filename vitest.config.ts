import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcPath,
      "#": srcPath,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "references/**", "node_modules/**"],
  },
});