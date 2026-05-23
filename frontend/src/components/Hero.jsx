import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import MagneticButton from './MagneticButton';

gsap.registerPlugin(ScrollTrigger);

export default function Hero() {
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const textRef = useRef(null);
  const bgRef = useRef(null);

  useEffect(() => {
    // Cinematic Parallax for Text
    gsap.to(textRef.current, {
      y: 100,
      opacity: 0.2,
      scale: 0.9,
      ease: "none",
      scrollTrigger: {
        trigger: heroRef.current,
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });

    // Background Parallax
    gsap.to(bgRef.current, {
      yPercent: 30,
      ease: "none",
      scrollTrigger: {
        trigger: heroRef.current,
        start: "top top",
        end: "bottom top",
        scrub: true
      }
    });

    // Saffron Glow Mouse Follow
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      gsap.to(".saffron-orb", {
        x: clientX,
        y: clientY,
        duration: 2,
        ease: "power2.out"
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleReservationClick = () => {
    navigate('/reservation');
  };

  const handleMenuScroll = () => {
    const menuSection = document.getElementById('menu');
    if (menuSection) {
      menuSection.scrollIntoView({ behavior: 'auto' }); 
    }
  };

  return (
    <section ref={heroRef} className="min-h-svh relative flex items-center justify-center px-6 md:px-20 pt-32 pb-20 overflow-hidden bg-[var(--bg-primary)] transition-colors duration-700">
      
      {/* SAFFRON ORB (MOUSE FOLLOW) */}
      <div className="saffron-orb pointer-events-none fixed top-0 left-0 w-[500px] h-[500px] bg-heritage-gold/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-[120px] z-0" />

      {/* BACKGROUND LAYERS */}
      <div ref={bgRef} className="absolute inset-0 z-0">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'var(--pattern-nav)', backgroundSize: '100px 100px' }} />
        <img src="https://images.unsplash.com/photo-1544148103-0773bf10d330?q=80&w=2070&auto=format&fit=crop" className="w-full h-full object-cover opacity-10 filter sepia-[0.5] contrast-[1.2]" alt="Atmospheric Background" loading="eager" width="2070" height="1380" />
      </div>

      {/* SIDE PAGINATION (DECORATIVE) */}
      <div className="absolute left-6 md:left-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-50">
        <div className="w-2 h-2 rounded-full bg-[var(--text-accent)] shadow-[0_0_10px_rgba(212,160,23,0.4)]" />
        {[1, 2, 3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full border border-[var(--text-main)]/10" />)}
      </div>

      <div ref={textRef} className="max-w-4xl mx-auto w-full flex flex-col items-center text-center relative z-10">
        
        {/* TEXT CONTENT - CENTRALIZED */}
        <div className="space-y-10">
          <div className="space-y-6 flex flex-col items-center">
             <span className="text-[var(--cta-color)] font-black uppercase tracking-[0.4em] text-[10px] block">Est. 1995 • The Golden Hour</span>
             <h1 className="text-6xl md:text-9xl leading-[1.1] font-serif tracking-tight text-[var(--text-main)] transition-colors duration-700">
               Where Heritage <br />
               Meets the <span className="saffron-glow" style={{ color: 'var(--text-accent)' }}>Golden Hour</span>
             </h1>
             <p className="text-sm md:text-lg text-[var(--text-main)] opacity-70 max-w-lg leading-relaxed font-medium">
               Savor the art of vegetarian cuisine, crafted with tradition and served with modern flair. Experience the essence of India in every bite.
             </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
            <MagneticButton 
              className="px-12 py-5 bg-[var(--cta-color)] text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-full shadow-2xl hover:brightness-110 transition-all"
              onClick={handleMenuScroll}
            >
              Explore Menu
            </MagneticButton>
            <MagneticButton 
              className="px-12 py-5 border border-[var(--text-main)]/20 text-[var(--text-main)] font-black uppercase text-[10px] tracking-[0.2em] rounded-full hover:bg-[var(--text-main)]/5 transition-all"
              onClick={handleReservationClick}
            >
              Book Table
            </MagneticButton>
          </div>
        </div>
      </div>

      {/* FOOTER DECORATIVE */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-30">
         <div className="w-10 h-px bg-[var(--text-main)]" />
         <span className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--text-main)]">Scroll to explore</span>
         <div className="w-10 h-px bg-[var(--text-main)]" />
      </div>

    </section>
  );
}
