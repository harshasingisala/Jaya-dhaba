import React, { useEffect, useRef } from 'react';
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ResponsiveImage from "./ResponsiveImage";

gsap.registerPlugin(ScrollTrigger);

export default function Gallery() {
  const containerRef = useRef(null);

  useEffect(() => {
    const images = containerRef.current.querySelectorAll('.parallax-img');
    images.forEach((img, i) => {
      gsap.to(img, {
        yPercent: (i % 2 === 0 ? 10 : 20),
        ease: "none",
        scrollTrigger: {
          trigger: img,
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      });
    });
  }, []);

  return (
    <section className="py-32 px-6 md:px-20 bg-transparent">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-baseline gap-6 mb-16 px-2">
        <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-none">Visual Palette</h2>
        <div className="flex-1 h-px bg-heritage-espresso/10 hidden md:block" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-heritage-espresso/70">From the Hearth</p>
      </div>

      <div ref={containerRef} className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="aspect-[4/5] relative group overflow-hidden rounded-[2.5rem] shadow-xl border border-heritage-espresso/5 bg-heritage-stone">
            <div className="w-full h-full overflow-hidden">
               <ResponsiveImage src={i % 2 === 0 ? '/paneer.png' : '/chicken.png'} className="parallax-img absolute top-[-10%] left-0 w-full h-[120%] object-cover group-hover:scale-110 transition-transform duration-1000 grayscale-[0.2] group-hover:grayscale-0" alt="Culinary Creation" loading="lazy" sizes="(max-width: 768px) 50vw, 25vw" width="480" height="600" />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-8 translate-y-full group-hover:translate-y-0 transition-transform duration-500 bg-gradient-to-t from-heritage-espresso/80 to-transparent z-10">
               <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-gold mb-1">Heritage Plate</p>
               <p className="text-white font-serif italic text-lg">Creation #{i}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
