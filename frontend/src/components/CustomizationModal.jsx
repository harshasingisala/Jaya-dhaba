import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Flame, Sparkles, ChefHat } from 'lucide-react';

const SPICE_LEVELS = [
  { id: 'Mild', label: 'Mild Heritage', color: 'text-sky-500', bg: 'bg-sky-500/10' },
  { id: 'Medium', label: 'The Balance', color: 'text-heritage-gold', bg: 'bg-heritage-gold/10' },
  { id: 'Spicy', label: 'Saffron Spike', color: 'text-heritage-terracotta', bg: 'bg-heritage-terracotta/10' },
];

const ADDONS = [
  { id: 'Extra Ghee', label: 'Ancient Ghee Spike', price: 40 },
  { id: 'Double Saffron', label: 'Premium Saffron Dust', price: 60 },
  { id: 'Heritage Spices', label: 'Secret Family Blend', price: 30 },
];

export default function CustomizationModal({ item, isOpen, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const [spice, setSpice] = useState('Medium');
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleAddon = (id) => {
    setSelectedAddons(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleManualQtyChange = (val) => {
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) setQty(n);
    else if (val === '') setQty('');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 md:p-10">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-heritage-espresso/80 backdrop-blur-xl"
          onClick={onClose}
        />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 40 }}
          className="relative w-full max-w-2xl bg-white rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[90svh] border border-white/20"
        >
          {/* HEADER */}
          <div className="p-10 pb-0 flex justify-between items-start relative z-10">
             <div className="space-y-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-2xl bg-heritage-stone flex items-center justify-center text-heritage-espresso shadow-sm">
                      <ChefHat size={20} />
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30">Custom Curation</span>
                </div>
                <h2 className="text-4xl font-serif italic text-heritage-espresso">{item.name}</h2>
             </div>
             <button onClick={onClose} className="p-4 bg-heritage-stone rounded-full text-heritage-espresso/30 hover:bg-heritage-espresso hover:text-white transition-all">
                <X size={20} />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar p-10 space-y-12">
             
             {/* QUANTITY SECTION */}
             <section className="space-y-6">
                <div className="flex justify-between items-end">
                   <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/40">1. Define Portion</h3>
                   <span className="text-sm font-bold text-heritage-espresso">Manual Entry Supported</span>
                </div>
                <div className="flex items-center gap-8 bg-heritage-stone/30 p-4 rounded-[2.5rem] border border-heritage-espresso/5">
                   <div className="flex items-center gap-4 px-4 bg-white/50 p-2 rounded-full shadow-inner border border-heritage-espresso/5">
                      <button 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-heritage-espresso/40 hover:bg-heritage-espresso hover:text-white transition-all shadow-sm"
                        onClick={() => setQty(Math.max(1, (parseInt(qty) || 1) - 1))}
                      >
                         <Minus size={14} />
                      </button>
                      <input 
                        type="text" 
                        value={qty}
                        onChange={(e) => handleManualQtyChange(e.target.value)}
                        className="w-12 text-center bg-transparent font-serif italic text-2xl text-heritage-espresso outline-none"
                      />
                      <button 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-heritage-espresso/40 hover:bg-heritage-espresso hover:text-white transition-all shadow-sm"
                        onClick={() => setQty((parseInt(qty) || 0) + 1)}
                      >
                         <Plus size={14} />
                      </button>
                   </div>
                   <p className="text-[11px] font-medium text-heritage-espresso/40 italic">Adjust quantity with precision for your gathering.</p>
                </div>
             </section>

             {/* SPICE SELECTOR */}
             <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/40">2. Heat Archetype</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   {SPICE_LEVELS.map(s => (
                      <button 
                        key={s.id}
                        onClick={() => setSpice(s.id)}
                        className={`p-6 rounded-[2.5rem] border transition-all text-left flex flex-col gap-3 group ${spice === s.id ? 'bg-heritage-espresso text-white shadow-xl scale-105' : 'bg-white border-heritage-espresso/5 hover:border-heritage-espresso/20'}`}
                      >
                         <Flame size={18} className={spice === s.id ? 'text-white' : s.color} />
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">{s.id}</p>
                            <p className={`text-[9px] font-medium opacity-60 ${spice === s.id ? 'text-white' : ''}`}>{s.label}</p>
                         </div>
                      </button>
                   ))}
                </div>
             </section>

             {/* ADDONS */}
             <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/40">3. Quick Guest Add-ons</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {ADDONS.map(a => (
                      <button 
                        key={a.id}
                        onClick={() => toggleAddon(a.id)}
                        className={`p-6 rounded-[2.5rem] border transition-all flex justify-between items-center group ${selectedAddons.includes(a.id) ? 'bg-heritage-stone border-heritage-espresso shadow-inner' : 'bg-white border-heritage-espresso/5 hover:shadow-lg'}`}
                      >
                         <div className="flex gap-4 items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedAddons.includes(a.id) ? 'bg-heritage-espresso text-white' : 'bg-heritage-espresso/5 text-heritage-espresso/20'}`}>
                               <Sparkles size={14} />
                            </div>
                            <div>
                               <p className="text-sm font-serif italic text-heritage-espresso">{a.id}</p>
                               <p className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/30">+₹{a.price}</p>
                            </div>
                         </div>
                         <div className={`w-5 h-5 rounded-md border border-heritage-espresso/10 flex items-center justify-center transition-all ${selectedAddons.includes(a.id) ? 'bg-heritage-gold border-heritage-gold text-white' : ''}`}>
                            {selectedAddons.includes(a.id) && <Plus size={12} />}
                         </div>
                      </button>
                   ))}
                </div>
             </section>

             {/* INSTRUCTIONS */}
             <section className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/40">4. Special Directives</h3>
                <textarea 
                  placeholder="Ex: No cilantro, Extra gravy in separate bowl..."
                  className="w-full h-32 p-8 bg-heritage-stone/40 border border-heritage-espresso/5 rounded-[2.5rem] outline-none focus:bg-white focus:shadow-xl transition-all font-serif italic text-lg text-heritage-espresso"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
             </section>
          </div>

          {/* FOOTER ACTION */}
          <div className="p-10 border-t border-heritage-espresso/5 flex items-center justify-between">
             <div className="space-y-1">
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Final Valuation</p>
                <p className="text-3xl font-serif italic text-heritage-gold">
                   ₹{ (item.price + selectedAddons.reduce((sum, id) => sum + ADDONS.find(a => a.id === id).price, 0)) * (parseInt(qty) || 0) }
                </p>
             </div>
             <button 
               onClick={() => {
                 onAdd(item, parseInt(qty) || 1, spice, selectedAddons, instructions);
                 onClose();
               }}
               className="px-12 py-6 bg-heritage-espresso text-white rounded-full font-black text-[10px] uppercase tracking-[0.5em] shadow-xl hover:bg-heritage-gold transition-all"
             >
                Infuse Into Tray →
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
