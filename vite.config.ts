/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    lib: {
      entry: {
        evm: "src/evm/index.ts",
      },
      fileName: (_format, entryName) => `${entryName}.js`,
      formats: ["cjs", "es"],
    },
    rollupOptions: {
      external: ["viem", "@zlikemario/helper"],
      output: [
        {
          format: "es",
          preserveModules: true,
          preserveModulesRoot: "src",
          entryFileNames: "[name].js",
          // chunkFileNames: "chunks/[name]-[hash].js",
        },
        {
          format: "cjs",
          preserveModules: true,
          preserveModulesRoot: "src",
          entryFileNames: "[name].cjs",
          // chunkFileNames: "chunks/[name]-[hash].cjs",
        },
      ],
    },
  },
  test: {},
});
