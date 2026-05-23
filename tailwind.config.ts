import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        space: {
          bg: "#0a0e1a",
          surface: "#0f1629",
          border: "#1e2d4a",
          accent: "#00d4ff",
          amber: "#f59e0b",
          green: "#22c55e",
          red: "#ef4444",
          yellow: "#eab308",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};

export default config;
