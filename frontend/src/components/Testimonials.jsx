import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const reviews = [
  { text: "The most authentic biryani in Hyderabad. The saffron aroma truly captures the essence of heritage.", author: "Rahul Singh" },
  { text: "A premium dining experience that respects tradition while embracing modern hospitality.", author: "Priya Rao" },
  { text: "Seamless ordering app. The real-time tracking is a game-changer for my Sunday lunch.", author: "Amit V." }
];

export default function Testimonials() {
  return (
    <section className="py-32 px-10 md:px-20 text-center relative overflow-hidden bg-heritage-stone/30">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-px bg-gradient-to-r from-transparent via-heritage-gold/20 to-transparent" />
      
      <div className="max-w-2xl mx-auto mb-20 space-y-6">
         <div className="flex flex-col items-center gap-4">
            <div className="flex gap-1 text-heritage-gold">
               {[1,2,3,4,5].map(i => <Sparkles key={i} size={14} fill="currentColor" />)}
            </div>
            <div className="flex items-center gap-3">
               <span className="text-3xl font-serif italic text-heritage-espresso">4.9/5</span>
               <div className="h-4 w-px bg-heritage-espresso/10" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-heritage-espresso/70">Google Heritage Rating</span>
            </div>
         </div>
         <h2 className="text-4xl md:text-5xl font-serif italic text-heritage-espresso leading-tight">Voices of Heritage</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-7xl mx-auto">
        {reviews.map((rev, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.2, duration: 0.6 }}
            viewport={{ once: true }}
            className="flex flex-col items-center group"
          >
            <div className="text-heritage-gold text-5xl mb-6 opacity-30 italic font-serif group-hover:opacity-100 transition-opacity">"</div>
            <p className="text-heritage-espresso/70 text-lg mb-8 leading-relaxed font-medium italic text-balance">
              {rev.text}
            </p>
            <div className="h-px w-8 bg-heritage-gold/40 mb-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-heritage-espresso/70">{rev.author}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
