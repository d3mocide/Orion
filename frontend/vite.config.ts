import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
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
    proxy: {
      "/api/satnogs": {
        target: "https://db.satnogs.org/api",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/satnogs/, ""),
      },
      "/api/celestrak": {
        target: "https://celestrak.org/NORAD/elements/gp.php",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/celestrak/, ""),
      },
    },
  },
});
