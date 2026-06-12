import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**"],
  },
  resolve: {
    alias: {
      "@/shared": path.resolve(__dirname, "src/shared"),
      "@/features": path.resolve(__dirname, "src/features"),
    },
  },
});
