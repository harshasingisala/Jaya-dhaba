import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ResponsiveImage from "./ResponsiveImage";

gsap.registerPlugin(ScrollTrigger);

export default function Chef() {
  const imageRef = useRef(null);

  useEffect(() => {
    gsap.to(imageRef.current, {
      yPercent: 15,
      ease: "none",
      scrollTrigger: {
        trigger: "#chef",
        start: "top bottom",
        end: "bottom top",
        scrub: true
      }
    });
  }, []);

  return (
    <section id="chef" className="py-32 px-6 md:px-20 bg-transparent relative overflow-hidden">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
        
        {/* IMAGE SIDE */}
        <div className="relative group overflow-hidden rounded-[4rem] h-[650px]">
          <div className="absolute inset-x-0 bottom-0 h-3/4 bg-heritage-terracotta/5 rounded-[4rem] group-hover:bg-heritage-terracotta/10 transition-colors z-20 pointer-events-none" />
          <ResponsiveImage ref={imageRef} src="/chef_adnan.png" alt="Master Chef Adnan" loading="lazy" sizes="(max-width: 768px) 100vw, 50vw" width="640" height="780" className="absolute top-[-10%] left-0 w-full h-[120%] object-cover contrast-[1.05] z-10" />
        </div>

        {/* TEXT SIDE */}
        <div className="space-y-12">
          <div className="space-y-6">
            <span className="text-heritage-terracotta font-black uppercase tracking-[0.4em] text-[10px] block">Artisan Craftsmanship</span>
            <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-tight">The Master's Touch</h2>
            <p className="text-heritage-espresso/70 text-lg leading-relaxed font-medium capitalize italic">Chef Adnan Jaya — 30 Years of Heritage</p>
            <p className="text-heritage-espresso/60 text-base leading-relaxed font-medium">
              "Cooking is not just about ingredients; it's about the memory of taste. At Jaya Dhaba, we don't just serve food; we serve a lineage of flavors passed down through generations, refined for the modern palate."
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10">
            <div>
               <h4 className="text-3xl font-serif italic text-heritage-espresso">Authentic</h4>
               <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 mt-1">Slow Cooked Tradition</p>
            </div>
            <div>
               <h4 className="text-3xl font-serif italic text-heritage-espresso">Premium</h4>
               <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 mt-1">Sourced with Passion</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
