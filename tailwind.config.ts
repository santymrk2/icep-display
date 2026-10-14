import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#131313",
        panel: "#1e1e1e",
        raised: "#2b2b2b",
        line: "#343434",
        bar: "#262626",
        accent: "#2492ff",
      },
    },
  },
  plugins: [],
} satisfies Config;
