import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          include: [
            "tests/core/**/*.test.ts",
            "tests/cli/**/*.test.ts",
            "tests/zod/**/*.test.ts",
            "tests/integration/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "react",
          globals: true,
          environment: "jsdom",
          include: ["tests/react/**/*.test.ts", "tests/react/**/*.test.tsx"],
        },
      },
    ],
  },
});
