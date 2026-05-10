/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        heritage: {
          stone: "var(--bg-primary)",
          gold: "var(--heritage-gold)",
          terracotta: "var(--heritage-terracotta)",
          espresso: "var(--heritage-espresso)",
          accent: "var(--text-accent)",
        }
      },
      fontFamily: {
        serif: ["'Playfair Display'", "serif"],
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
      }
    },
  },
  plugins: [],
}