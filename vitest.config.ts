import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const resolve = {
  tsconfigPaths: true,
};

export default defineConfig({
  plugins: [react()],
  resolve,
  test: {
    globals: true,
    exclude: ["**/node_modules/**", "**/.next/**"],
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["__tests__/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["__tests__/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
