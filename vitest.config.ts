import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      "~": "/src",
    },
  },
  test: {
    testTimeout: 30000,
  },
});
