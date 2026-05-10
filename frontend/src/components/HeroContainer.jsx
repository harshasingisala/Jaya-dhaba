import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Truck, CheckCircle } from "lucide-react";
import { scrambleText } from "../utils/scrollAnimations";

/**
 * JAYA DHABA — HERO CONTAINER (GOLDEN COURTYARD)
 * Visual spec:
 *   • Card-style container with ~32px rounded corners
 *   • Biryani image fills left half; text + CTA on the right
 *   • Trust bar: 3-col grid beneath the card
 *   • Framer Motion stagger on text reveal
 */

const BIRYANI_IMAGE = "/hero.jpg";

const CONTAINER_VARIANTS = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

const TRUST_ITEMS = [
  { icon: Clock,       label: "Open 11:00 AM – 11:00 PM" },
  { icon: Truck,       label: "Free Delivery > ₹300"      },
  { icon: CheckCircle, label: "100% Halal Certified"       },
];

export default function HeroContainer() {
  const navigate = useNavigate();
  const heroRef  = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => {
    if (headingRef.current) scrambleText(headingRef.current, "Heritage Restored.\nFlavor Perfected.");
  }, []);

  const scrollToMenu = () => {
    const el = document.getElementById("menu");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      ref={heroRef}
      id="hero"
      className="pt-24 pb-12 px-4 sm:px-6 md:px-10 max-w-7xl mx-auto"
    >
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━ HERO CARD ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          borderRadius: "32px",
          minHeight: "clamp(300px, 52vw, 520px)",
          backgroundColor: "#1C1008",
        }}
      >
        {/* Background image */}
        <img
          src={BIRYANI_IMAGE}
          alt="Signature Mutton Biryani in copper handi — Jaya Dhaba"
          className="absolute inset-0 w-full h-full object-cover hero-bg"
          style={{ objectPosition: "40% center", willChange: "transform", scale: 1.2 }}
          loading="eager"
          decoding="async"
        />

        {/* Dark gradient overlay — right-to-left so text is readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, transparent 35%, rgba(20,10,4,0.65) 55%, rgba(20,10,4,0.82) 100%)",
          }}
        />

        {/* ── TEXT CONTENT ── */}
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="show"
          className="relative z-10 h-full flex items-center justify-end"
          style={{ minHeight: "inherit" }}
        >
          <div className="w-full max-w-lg px-8 py-12 md:px-14 md:py-16 text-left">
            <motion.p
              variants={ITEM_VARIANTS}
              className="uppercase tracking-[0.25em] text-[11px] font-bold mb-5"
              style={{ color: "var(--gold-brand)", opacity: 0.85 }}
            >
              Est. 1995 · East Marredpally
            </motion.p>

            <motion.h1
              ref={headingRef}
              variants={ITEM_VARIANTS}
              className="leading-[1.1] font-bold text-white mb-5"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(2rem, 4.5vw, 3.4rem)",
                whiteSpace: "pre-line",
              }}
            >
              Heritage Restored.
              <br />
              Flavor Perfected.
            </motion.h1>

            <motion.p
              variants={ITEM_VARIANTS}
              className="text-white/60 text-base md:text-lg font-normal mb-9 leading-relaxed"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Experience the soul of East Marredpally.
            </motion.p>

            <motion.div variants={ITEM_VARIANTS} className="flex flex-wrap gap-4">
              <button
                onClick={scrollToMenu}
                className="font-semibold text-sm px-8 py-3.5 rounded-full transition-all duration-300 hover:brightness-110 active:scale-95 shadow-lg"
                style={{
                  backgroundColor: "var(--gold-brand)",
                  color: "#fff",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Order Now
              </button>
              <button
                onClick={() => navigate("/reservation")}
                className="font-semibold text-sm px-8 py-3.5 rounded-full transition-all duration-300 active:scale-95 border border-white/25 text-white hover:bg-white/10"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Book a Table
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━ TRUST BAR ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
        className="grid grid-cols-1 sm:grid-cols-3 mt-0 divide-y sm:divide-y-0 sm:divide-x"
        style={{ borderColor: "var(--brown-brand)" }}
      >
        {TRUST_ITEMS.map(({ icon: Icon, label }, idx) => (
          <div
            key={idx}
            className="flex items-center justify-center gap-3 py-5 px-6"
            style={{
              borderColor: "rgba(139,69,19,0.15)",
              borderStyle: "solid",
              borderTopWidth: idx > 0 ? "1px" : "0",
              // sm override — handled by tailwind divide
            }}
          >
            <Icon
              size={18}
              style={{ color: "var(--brown-brand)", flexShrink: 0 }}
              strokeWidth={1.8}
            />
            <span
              className="text-sm font-medium"
              style={{ color: "var(--brown-brand)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
