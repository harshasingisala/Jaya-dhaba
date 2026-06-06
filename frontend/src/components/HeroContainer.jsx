import { useNavigate } from "react-router-dom";
import { Clock, Truck, CheckCircle } from "lucide-react";
import ResponsiveImage from "./ResponsiveImage";

/**
 * JAYA DHABA — HERO CONTAINER (GOLDEN COURTYARD)
 * Visual spec:
 *   • Card-style container with ~32px rounded corners
 *   • Biryani image fills left half; text + CTA on the right
 *   • Trust bar: 3-col grid beneath the card
 *   • Framer Motion stagger on text reveal
 */

const BIRYANI_IMAGE = "/hero.jpg";

const TRUST_ITEMS = [
  { icon: Clock,       label: "Open 11:00 AM – 11:00 PM" },
  { icon: Truck,       label: "Free Delivery > ₹300"      },
  { icon: CheckCircle, label: "100% Halal Certified"       },
];

export default function HeroContainer() {
  const navigate = useNavigate();

  const scrollToMenu = () => {
    const el = document.getElementById("menu");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      id="hero"
      className="pt-[4.75rem] pb-7 px-3 sm:px-6 md:px-10 max-w-7xl mx-auto sm:pt-24 sm:pb-12"
    >
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━ HERO CARD ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className="mobile-hero-card premium-hero-card relative w-full overflow-hidden"
        style={{
          borderRadius: "32px",
          minHeight: "clamp(300px, 52vw, 520px)",
          backgroundColor: "#1C1008",
        }}
      >
        {/* Background image */}
        <ResponsiveImage
          src={BIRYANI_IMAGE}
          alt="Signature Mutton Biryani in copper handi — Jaya Dhaba"
          className="absolute inset-0 w-full h-full object-cover hero-bg"
          style={{ objectPosition: "40% center", willChange: "transform", scale: 1.2 }}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          sizes="100vw"
          width="1024"
          height="1024"
        />

        {/* Dark gradient overlay — right-to-left so text is readable */}
        <div
          className="hero-readable-overlay premium-hero-overlay absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, transparent 35%, rgba(20,10,4,0.65) 55%, rgba(20,10,4,0.82) 100%)",
          }}
        />

        {/* ── TEXT CONTENT ── */}
        <div
          className="relative z-10 h-full flex items-center justify-end"
          style={{ minHeight: "inherit" }}
        >
          <div className="mobile-hero-copy premium-hero-copy w-full max-w-lg px-6 py-10 md:px-14 md:py-16 text-left">
            <p
              className="mobile-hero-kicker premium-hero-kicker uppercase tracking-[0.25em] text-[11px] font-bold mb-5"
              style={{ color: "#F6C453" }}
            >
              Est. 1995 · East Marredpally
            </p>

            <h1
              className="premium-hero-title leading-[1.1] font-bold text-white mb-5"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(2rem, 4.5vw, 3.4rem)",
                whiteSpace: "pre-line",
              }}
            >
              Heritage Restored.
              <br />
              Flavor Perfected.
            </h1>

            <p
              className="mobile-hero-subtitle premium-hero-subtitle text-white/70 text-base md:text-lg font-normal mb-8 leading-relaxed"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Experience the soul of East Marredpally.
            </p>

            <div className="mobile-hero-actions premium-hero-actions flex flex-wrap gap-3 sm:gap-4">
              <button
                onClick={scrollToMenu}
                className="premium-button font-semibold text-sm px-8 py-3.5 rounded-full transition-all duration-300 hover:brightness-110 active:scale-95 shadow-lg"
                style={{
                  backgroundColor: "var(--gold-brand)",
                  color: "#fff",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Order Now
              </button>
              <button
                onClick={() => navigate("/reservation")}
                className="premium-button font-semibold text-sm px-8 py-3.5 rounded-full transition-all duration-300 active:scale-95 border border-white/25 text-white hover:bg-white/10"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Book a Table
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━ TRUST BAR ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
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
      </div>
    </section>
  );
}
