/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
      },
      // Every colour is a theme token (see index.css), so light and dark are selected, not flipped.
      colors: {
        paper: token("paper"),
        panel: token("panel"),
        ink: { DEFAULT: token("ink"), 2: token("ink-2"), 3: token("ink-3") },
        rule: token("rule"),
        wind: token("wind"),
        fcst: token("fcst"),
        thermal: token("thermal"),
        short: token("short"),
        long: token("long"),
      },
      boxShadow: {
        lift: "0 1px 0 rgb(var(--shadow) / 0.04), 0 10px 28px -14px rgb(var(--shadow) / 0.22)",
      },
    },
  },
  plugins: [],
};
