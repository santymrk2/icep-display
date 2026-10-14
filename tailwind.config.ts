import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#171717",
        panel: "#262626",
        raised: "#2e2e2e",
        line: "#3a3a3a",
        accent: "#2492ff",
      },
    },
  },
  plugins: [],
} satisfies Config;
