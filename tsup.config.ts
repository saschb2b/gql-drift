import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "zod/index": "src/zod/index.ts",
    "react/index": "src/react/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  external: ["react", "react-dom", "zod", "@tanstack/react-query", "graphql"],
});
