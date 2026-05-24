import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import MagneticButton from "./MagneticButton";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

gsap.registerPlugin(ScrollTrigger);

const services = [
  { title: "Catering", desc: "Bring the Jaya legacy to your grandest celebrations with our premium catering.", img: "/exp1.jpg" },
  { title: "Private Dining", desc: "Experience the Golden Hour in our exclusive, heritage-inspired suites.", img: "/exp2.jpg" },
  { title: "Masterclass", desc: "Learn the secrets of traditional North Indian cooking with Chef Adnan.", img: "/exp3.jpg" },
];

export default function Services() {
  const containerRef = useRef(null);
  const imagesRef = useRef([]);
  const navigate = useNavigate();

  const openEnquiry = () => {
    const contactEl = document.getElementById("contact");
    if (contactEl) {
      contactEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate("/contact");
  };

  useEffect(() => {
    imagesRef.current.forEach((img) => {
      if (!img) return;
      gsap.to(img, {
        yPercent: 15,
        ease: "none",
        scrollTrigger: {
          trigger: img.parentElement,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.95, // GSAP Parallax at 0.95x scroll speed
        },
      });
    });

    return () => {
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  return (
    <section ref={containerRef} className="py-32 px-6 md:px-20 bg-heritage-stone/50 overflow-hidden relative">
      <div className="max-w-7xl mx-auto text-center mb-20 space-y-6">
        <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-tight">Bespoke Experiences</h2>
        <p className="text-heritage-espresso/40 text-[11px] font-black uppercase tracking-[0.4em] font-sans">Crafting Memories Beyond the Plate</p>
      </div>
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        {services.map((s, i) => (
          <div key={i} className="group relative rounded-[3.5rem] overflow-hidden bg-white border border-heritage-espresso/5 card-hover text-center space-y-8 pb-12">
            
            <div className="h-64 relative overflow-hidden rounded-t-[3.5rem]">
               <img ref={el => imagesRef.current[i] = el} src={s.img} alt={s.title} width="640" height="360" className="absolute top-[-10%] left-0 w-full h-[120%] object-cover scale-110" />
               <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
            </div>

            <div className="px-8 space-y-4 relative z-10 -mt-12">
              <h3 className="text-3xl font-serif italic text-heritage-espresso leading-none">{s.title}</h3>
              <p className="text-heritage-espresso/50 text-sm leading-relaxed font-medium font-sans">
                {s.desc}
              </p>
            </div>

            <div className="px-8 flex justify-center">
               <MagneticButton
                 className="px-10 py-4 bg-heritage-espresso text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-gold transition-colors font-sans w-full max-w-[200px]"
                 onClick={openEnquiry}
               >
                 Enquire
               </MagneticButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
