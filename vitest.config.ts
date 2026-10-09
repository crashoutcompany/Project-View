import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const resolve = {
  tsconfigPaths: true,
};

const testExclude = [
  "**/node_modules/**",
  "**/.next/**",
  "**/e2e/**",
  "**/playwright-report/**",
  "**/test-results/**",
];

export default defineConfig({
  plugins: [react()],
  resolve,
  test: {
    globals: true,
    exclude: testExclude,
    projects: [
      {
        resolve,
        test: {
          name: "node",
          environment: "node",
          include: ["__tests__/**/*.test.ts"],
          exclude: testExclude,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        resolve,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["__tests__/**/*.test.tsx"],
          exclude: testExclude,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
