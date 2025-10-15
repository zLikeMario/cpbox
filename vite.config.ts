/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    lib: {
      entry: {
        evm: "src/evm/index.ts",
      },
      name: "zmario",
      formats: ["es", "cjs"],
    },
  },
  test: {},
});
