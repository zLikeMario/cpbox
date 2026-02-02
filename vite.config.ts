/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import pkg from "./package.json" assert { type: "json" };

const externalDeps = new Set([...Object.keys(pkg.peerDependencies ?? {})]);

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      "~": "/src",
    },
  },
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
      external: (id) => Array.from(externalDeps).some((dep) => id === dep || id.startsWith(`${dep}/`)),
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
