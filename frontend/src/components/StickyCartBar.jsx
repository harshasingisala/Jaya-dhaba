import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { ShoppingBag, ChevronRight } from "lucide-react";

const StickyCartBar = () => {
  const { cart, total, setCartOpen } = useApp();
  const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);

  return (
    <AnimatePresence>
      {cartCount > 0 && (
        <motion.div 
          initial={{ y: 100, x: '-50%', opacity: 0 }}
          animate={{ y: 0, x: '-50%', opacity: 1 }}
          exit={{ y: 100, x: '-50%', opacity: 0 }}
          onClick={() => setCartOpen(true)}
          className="mobile-cart-bar fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-1rem)] max-w-lg cursor-pointer group"
        >
          <div className="glass p-3 md:p-4 rounded-[1.5rem] md:rounded-full border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between gap-3 group-hover:border-heritage-gold/30 transition-all duration-500 overflow-hidden relative">
            
            {/* BACKGROUND GLOW */}
            <div className="absolute inset-0 bg-gradient-to-r from-heritage-gold/5 via-transparent to-heritage-gold/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-11 h-11 md:w-12 md:h-12 bg-heritage-gold rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500 shrink-0">
                <ShoppingBag size={20} className="text-white" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-heritage-espresso/30 mb-0.5">Your Tray</div>
                <div className="flex items-center gap-3">
                   <span className="text-sm font-black text-heritage-espresso">{cartCount} {cartCount === 1 ? 'Item' : 'Items'}</span>
                   <div className="w-1 h-1 rounded-full bg-heritage-espresso/10" />
                   <span className="text-sm font-black text-heritage-gold">₹{total}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 bg-heritage-espresso/5 group-hover:bg-heritage-gold transition-colors duration-500 px-4 md:px-6 py-3 rounded-full relative z-10 shrink-0">
               <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-heritage-espresso group-hover:text-white transition-colors duration-500">View</span>
               <ChevronRight size={16} className="text-heritage-espresso/20 group-hover:text-white transition-colors duration-500" />
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StickyCartBar;
