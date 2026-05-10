import { useState, useRef } from "react";
import { useApp } from "../context/AppContext";
import useTilt from "../hooks/useTilt";
import Reveal from "./Reveal";
import CustomizationModal from "./CustomizationModal";
import { useStore } from "../store/useStore";
import MagneticButton from "./MagneticButton";
import { motion } from "framer-motion";

const categories = ["All", "Biryani", "Starters", "Gravy", "Breads", "Beverages"];

function MenuItem({ item, onAddClicked }) {
  const ref = useTilt();
  
  return (
    <Reveal>
      <div 
        ref={ref} 
        className="bg-white p-5 rounded-[2.5rem] card-hover h-full flex flex-col group border border-heritage-espresso/5 relative overflow-hidden"
      >
        <div className="relative overflow-hidden rounded-[1.8rem] mb-5 aspect-square bg-heritage-stone">
           <img src={item.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
        </div>
        <h3 className="text-xl font-serif italic text-heritage-espresso mb-1">{item.name}</h3>
        <p className="text-[11px] text-heritage-espresso/40 mb-5 font-sans font-medium line-clamp-2">{item.desc}</p>
        <div className="mt-auto flex justify-between items-center z-10 relative">
           <span className="font-black text-heritage-espresso/90 tracking-tighter text-lg font-sans">₹{item.price}</span>
           <button onClick={() => onAddClicked(item)} className="bg-heritage-gold/10 text-heritage-gold hover:bg-heritage-gold hover:text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all">
            Add to Ledger
           </button>
        </div>
      </div>
    </Reveal>
  );
}

export function MenuSectionComponent() {
  const { menuItems, addToCart } = useApp();
  const [activeTab, setActiveTab] = useState("All");
  const [customizingItem, setCustomizingItem] = useState(null);
  const { menuExpanded, setMenuExpanded } = useStore();
  const containerRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const { left, top } = containerRef.current.getBoundingClientRect();
    const x = e.clientX - left;
    const y = e.clientY - top;
    containerRef.current.style.setProperty('--glow-x', `${x}px`);
    containerRef.current.style.setProperty('--glow-y', `${y}px`);
  };

  const filteredItems = menuItems.filter(i => activeTab === "All" || i.category === activeTab);
  const signatureItems = filteredItems.filter(i => i.isSignature || true).slice(0, 3); // Fallback if no isSignature
  const itemsToShow = menuExpanded ? filteredItems : signatureItems;

  return (
    <div 
      id="menu" 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="px-6 md:px-16 py-32 mt-10 scroll-mt-24 relative overflow-hidden group"
    >
      {/* Golden Glow Radial Hover Effect */}
      <div 
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{
          background: 'radial-gradient(600px circle at var(--glow-x) var(--glow-y), rgba(245, 158, 11, 0.05), transparent 40%)'
        }}
      />

      <CustomizationModal 
        isOpen={!!customizingItem}
        item={customizingItem || {}}
        onClose={() => setCustomizingItem(null)}
        onAdd={addToCart}
      />

      <div className="relative z-10">
        <Reveal>
          <div className="flex flex-col md:flex-row items-baseline gap-6 mb-8 px-2">
            <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-none">The Chef's Palette</h2>
            <div className="flex-1 h-px bg-heritage-espresso/10 hidden md:block" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30 font-sans">Curated Ledger</p>
          </div>
          <p className="px-2 text-sm text-heritage-espresso/60 font-sans italic max-w-lg mb-16">
            "A Lineage of Flavour: Every spice is a hand-ground memory, every dish an invitation to belong."
          </p>
        </Reveal>
        
        {/* TABS ROW */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-16 px-2 gap-8">
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 w-full md:w-auto">
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => { setActiveTab(cat); setMenuExpanded(false); }}
                className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap font-sans ${activeTab === cat ? "bg-heritage-espresso text-white border-heritage-espresso shadow-lg" : "border-heritage-espresso/10 text-heritage-espresso/40 hover:border-heritage-espresso/20"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-12">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {itemsToShow.map(item => (
              <MenuItem key={item.id} item={item} onAddClicked={setCustomizingItem} />
            ))}
          </div>

          {!menuExpanded && filteredItems.length > 3 && (
            <div className="flex justify-center mt-8">
               <MagneticButton 
                 className="px-10 py-4 border border-heritage-espresso/20 text-heritage-espresso rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-espresso hover:text-white transition-colors"
                 onClick={() => setMenuExpanded(true)}
               >
                 Unveil Full Ledger
               </MagneticButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MenuSectionComponent;
