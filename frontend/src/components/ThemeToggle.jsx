import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="fixed bottom-6 right-6 z-[100] w-12 h-12 rounded-full bg-white/80 dark:bg-stone-900/80 backdrop-blur-md shadow-premium border border-black/5 dark:border-white/5 flex items-center justify-center text-primary transition-transform hover:scale-110 active:scale-95 cursor-pointer"
      title="Toggle Theme"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
