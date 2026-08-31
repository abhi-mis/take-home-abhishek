import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    // Only the deterministic suites run by default. The extraction eval needs a live
    // API key and is a separate script (`npm run eval`), never a CI gate.
    include: ["tests/**/*.test.ts"],
  },
});
