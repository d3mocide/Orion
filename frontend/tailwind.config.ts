import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#030304",
        // Semantic data colors only — UI chrome stays neutral zinc/white
        signal: {
          pos: "#4ade80", // live pass, link up
          warn: "#e8b44a", // max elevation, stale data
          neg: "#f87171", // error, decayed
        },
      },
      fontFamily: {
        display: ['"Space Grotesk Variable"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
