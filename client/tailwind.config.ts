import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "nagar-blue": "#0A4C84",
        "nagar-ink": "#0C172A",
        "nagar-bg": "#EEF3F8"
      }
    }
  },
  plugins: []
} satisfies Config;

