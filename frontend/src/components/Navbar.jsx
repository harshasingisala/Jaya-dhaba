import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "../context/AppContext";
import { useStore } from "../store/useStore";

/**
 * JAYA DHABA — GOLDEN COURTYARD NAVBAR
 * Visual spec: Playfair Display logo (top-left), right-aligned nav links,
 * language toggle (English | తెలుగు). Minimal, high-contrast, premium.
 */
export default function Navbar() {
  const { language, setLanguage, t, cart } = useApp();
  const { theme, toggleTheme } = useStore();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const scrollTo = (id) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
    else navigate("/");
  };

  const navLinks = [
    { label: language === "te" ? "మా కథ"         : "Our Story",    action: () => scrollTo("story") },
    { label: language === "te" ? "మెనూ"           : "Menu",         action: () => scrollTo("menu") },
    { label: language === "te" ? "గ్యాలరీ"        : "Gallery",      action: () => scrollTo("gallery") },
    { label: language === "te" ? "రిజర్వేషన్లు"   : "Reservations", action: () => navigate("/reservation") },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-[100] transition-all duration-500 ${
        isScrolled
          ? "py-2 md:py-3 shadow-sm border-b border-[var(--brown-brand)]/8"
          : "py-3 md:py-5"
      }`}
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-10 flex items-center justify-between">

        {/* ── LOGO ── */}
        <button
          onClick={() => { setMobileOpen(false); navigate("/"); }}
          className="flex items-center min-h-[44px] min-w-0 group"
          aria-label="Jaya Dhaba Home"
        >
          <span
            className="text-2xl sm:text-3xl tracking-tight transition-colors duration-300 group-hover:opacity-80 truncate"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: "var(--brown-brand)",
              fontWeight: 700,
            }}
          >
            Jaya Dhaba
          </span>
        </button>

        {/* ── DESKTOP NAV ── */}
        <div className="hidden items-center gap-8">
          {navLinks.map((link) => (
            <button
              key={link.label}
              onClick={link.action}
              className="text-sm font-medium transition-colors duration-200 hover:opacity-60"
              style={{ color: "var(--brown-brand)" }}
            >
              {link.label}
            </button>
          ))}

          {/* Language Toggle */}
          <button
            onClick={() => setLanguage(language === "en" ? "te" : "en")}
            className="text-sm font-medium transition-colors duration-200 hover:opacity-60"
            style={{ color: "var(--brown-brand)" }}
            aria-label="Toggle language"
          >
            {language === "en" ? (
              <span>English&nbsp;<span className="opacity-40">|</span>&nbsp;తెలుగు</span>
            ) : (
              <span>తెలుగు&nbsp;<span className="opacity-40">|</span>&nbsp;English</span>
            )}
          </button>

          {/* Cart badge */}
          {cart.length > 0 && (
            <button
              onClick={() => scrollTo("menu")}
              className="relative flex items-center justify-center w-9 h-9 rounded-full transition-opacity hover:opacity-70"
              style={{ backgroundColor: "var(--gold-brand)" }}
              aria-label={`Cart: ${cart.length} items`}
            >
              <span className="text-white text-[11px] font-black">{cart.length}</span>
            </button>
          )}
        </div>

        {/* ── MOBILE BURGER ── */}
        <button
          className="relative z-[10000] flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1.5 p-2"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-6 transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} style={{ backgroundColor: "var(--brown-brand)" }} />
          <span className={`block h-0.5 w-6 transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} style={{ backgroundColor: "var(--brown-brand)" }} />
          <span className={`block h-0.5 w-6 transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} style={{ backgroundColor: "var(--brown-brand)" }} />
        </button>
      </div>

      {/* ── MOBILE DRAWER ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--brown-brand)10",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maxHeight: "100vh",
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
            }}
          >
            <div className="px-5 pb-8 pt-24 flex flex-col gap-2">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={link.action}
                  className="text-left text-xl font-serif py-4 border-b border-[var(--brown-brand)]/10 transition-colors"
                  style={{ color: "var(--brown-brand)" }}
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => setLanguage(language === "en" ? "te" : "en")}
                className="text-left text-sm font-bold py-4 uppercase tracking-[0.18em] transition-colors"
                style={{ color: "var(--brown-brand)" }}
              >
                {language === "en" ? "English | తెలుగు" : "తెలుగు | English"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
