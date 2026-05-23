import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";

export default defineConfig({
  plugins: [react(), cesium(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@/shared": path.resolve(__dirname, "src/shared"),
      "@/features": path.resolve(__dirname, "src/features"),
    },
  },
  worker: {
    format: "es",
    plugins: () => [wasm(), topLevelAwait()],
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 5000,
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["src/features/orbital-mechanics/wasm"],
  },
});
