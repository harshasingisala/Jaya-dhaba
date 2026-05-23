import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function Story() {
  const imageRef = useRef(null);

  useEffect(() => {
    gsap.to(imageRef.current, {
      yPercent: 20,
      ease: "none",
      scrollTrigger: {
        trigger: "#story",
        start: "top bottom",
        end: "bottom top",
        scrub: true
      }
    });
  }, []);

  return (
    <section id="story" className="py-32 px-6 md:px-20 relative overflow-hidden bg-transparent">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-20">
        
        {/* TEXT SIDE */}
        <div className="md:w-1/2 space-y-10 order-2 md:order-1">
          <div className="space-y-6">
            <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-tight">Our Story</h2>
            <div className="w-20 h-1 bg-heritage-gold" />
            <p className="text-heritage-espresso/70 text-lg leading-relaxed font-medium">
              Rooted in tradition, Jaya Dhaba brings you the authentic taste of vegetarian Indian cuisine, blending age-old recipes with modern flair. Experience the essence of India in every bite, served with a modern golden hour soul.
            </p>
          </div>
          <button className="btn-outline !border-heritage-espresso/20">
            Read About Us
          </button>
        </div>

        {/* IMAGE SIDE */}
        <div className="md:w-1/2 order-1 md:order-2 overflow-hidden rounded-[4rem] relative">
          <div className="relative rounded-[4rem] overflow-hidden shadow-2xl border border-heritage-espresso/5 bg-heritage-stone h-[650px]">
             <img ref={imageRef} src="/ambiance.png" alt="Heritage Ambiance" loading="lazy" width="640" height="780" className="absolute top-[-10%] left-0 w-full h-[120%] object-cover contrast-[1.1] filter brightness-[0.9] hover:scale-105 transition-transform duration-[2s]" />
             <div className="absolute inset-0 bg-gradient-to-t from-heritage-espresso/40 to-transparent pointer-events-none" />
          </div>
        </div>

      </div>
    </section>
  );
}
