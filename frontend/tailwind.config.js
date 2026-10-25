/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Archivo", "system-ui", "sans-serif"],
      },
      colors: {
        paper: "#EEF2F5",
        panel: "#FFFFFF",
        ink: { DEFAULT: "#13233A", 2: "#4A5D78", 3: "#7B8BA1" },
        rule: "#D5DEE8",
        wind: "#0F9D8A",
        fcst: "#4D63D9",
        thermal: "#E08A00",
        short: "#D6453D",
        long: "#2F7FC1",
      },
      boxShadow: {
        lift: "0 1px 0 rgba(19,35,58,0.04), 0 8px 24px -12px rgba(19,35,58,0.18)",
      },
    },
  },
  plugins: [],
};
