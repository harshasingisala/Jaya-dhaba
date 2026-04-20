/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#6C5CE7",
        "primary-dim": "#4834D4",
        secondary: "#00F3FF",
        surface: "#0F172A",
        "surface-bright": "#1E293B",
        "surface-container": "#0F172A",
        "surface-container-low": "#1E293B",
        "on-surface": "#F1F2F6",
        "on-surface-variant": "#A4B0BE",
        "outline-variant": "#2F3542",
        error: "#FF4757"
      },
      fontFamily: {
        headline: ["Outfit", "sans-serif"],
        body: ["Inter", "sans-serif"]
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      }
    },
  },
  plugins: [],
}
