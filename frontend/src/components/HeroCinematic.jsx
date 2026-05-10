import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import { useApp } from "../context/AppContext";

gsap.registerPlugin(ScrollTrigger);

export default function HeroCinematic() {
  const ref = useRef(null);
  const navigate = useNavigate();
  const { t, trackEvent, restaurantId } = useApp();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".hero-title", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "power3.out" });
      gsap.fromTo(".hero-img", { scale: 1.22, rotate: -3 }, { scale: 1, y: -120, rotate: 0, scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 1 } });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={ref} style={{ height: "200svh", position: "relative" }}>
      <div style={{ position: "sticky", top: 0, height: "100svh", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", alignItems: "center", padding: "70px 80px" }}>
        <div style={{ maxWidth: 560, position: "relative", zIndex: 2 }}>
          <div className="small-label" style={{ marginBottom: 18 }}>Premium heritage restaurant · Since 1995</div>
          <h1 className="hero-title title-display" style={{ fontSize: 64, lineHeight: "72px", margin: 0 }}>
            Where Heritage Meets <br />
            <span style={{ background: "linear-gradient(90deg, var(--accent), var(--gold))", WebkitBackgroundClip: "text", color: "transparent" }}>Golden Hour</span>
          </h1>
          <p style={{ color: "var(--muted)", marginTop: 16, fontSize: 16, lineHeight: "26px" }}>Authentic North Indian flavors, cinematic ambience, real-time ordering and reservations.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
            <button className="btn btn-primary" onClick={() => navigate("/menu")}>{t("exploreMenu")}</button>
            <button className="btn btn-ghost" onClick={() => navigate("/reservation")}>{t("bookTable")}</button>
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ position: "absolute", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,140,0,0.18) 0%, transparent 70%)", filter: "blur(30px)" }} />
          <img src="/biryani.png" alt="Biryani" className="hero-img" style={{ width: 470, filter: "drop-shadow(0 0 90px rgba(255,140,0,0.55))" }} />
        </div>
      </div>
    </section>
  );
}
