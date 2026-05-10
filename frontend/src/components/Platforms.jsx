import { motion } from "framer-motion";
import { ExternalLink, ShoppingBag, Globe } from "lucide-react";

const apps = [
  { 
    name: "Direct Ordering", 
    desc: "Experience the fastest service and earn heritage loyalty points.", 
    icon: <ShoppingBag size={24} />,
    link: "#menu",
    isInternal: true
  },
  { 
    name: "Swiggy Heritage", 
    desc: "Swift delivery of our signature dishes via our verified channels.", 
    icon: <Globe size={24} />,
    link: "https://www.swiggy.com/city/hyderabad/jaya-dhaba-secunderabad-rest1207238"
  },
  { 
    name: "Zomato Selection", 
    desc: "Order from our top-rated Secunderabad listing.", 
    icon: <Globe size={24} />,
    link: "https://www.zomato.com/hyderabad/jaya-dhaba-marredpally-secunderabad"
  }
];

export default function Platforms() {
  return (
    <section className="py-32 px-6 md:px-20 bg-heritage-stone/30">
      <div className="max-w-2xl mx-auto text-center mb-20 space-y-6">
         <span className="text-heritage-gold font-black uppercase tracking-[0.5em] text-[10px] block">Global Reach</span>
         <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-tight">Order From <br/> <span className="text-heritage-gold pr-2">Everywhere</span></h2>
         <p className="text-heritage-espresso/60 text-sm font-medium leading-relaxed italic">
           Access the Jaya legacy through our direct portal or via our verified delivery partners.
         </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-7xl mx-auto">
        {apps.map((app, i) => (
          <motion.div
            key={i}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.2, duration: 0.8 }}
            viewport={{ once: true }}
            onClick={() => {
              if (app.isInternal) {
                document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
              } else {
                window.open(app.link, '_blank');
              }
            }}
            className="bg-white/60 backdrop-blur-xl p-12 rounded-[4rem] border border-heritage-espresso/5 shadow-xl text-center space-y-8 flex flex-col items-center group cursor-pointer hover:-translate-y-4 transition-all duration-500"
          >
            <div className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center transition-all duration-500 ${app.isInternal ? 'bg-heritage-terracotta text-white' : 'bg-heritage-espresso/5 text-heritage-espresso/40 group-hover:bg-heritage-gold group-hover:text-white'}`}>
              {app.icon}
            </div>
            
            <div className="space-y-4">
              <h3 className="text-2xl font-serif italic text-heritage-espresso tracking-tight">{app.name}</h3>
              <p className="text-heritage-espresso/50 text-[13px] leading-relaxed font-medium">
                {app.desc}
              </p>
            </div>

            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-heritage-gold group-hover:text-heritage-espresso transition-colors">
               <span>{app.isInternal ? 'Select Plates' : 'External Link'}</span>
               <ExternalLink size={12} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
