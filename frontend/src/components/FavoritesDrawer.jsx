import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, ShoppingBag } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function FavoritesDrawer() {
  const { favoritesOpen, setFavoritesOpen, favorites, addToCart } = useApp();

  if (!favoritesOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex justify-end">
        {/* BACKDROP */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-heritage-espresso/20 backdrop-blur-sm"
          onClick={() => setFavoritesOpen(false)}
        />

        {/* PANEL */}
        <motion.div 
          initial={{ x: 400, opacity: 0 }} 
          animate={{ x: 0, opacity: 1 }} 
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full max-w-sm h-full bg-white/80 backdrop-blur-3xl border-l border-heritage-espresso/5 shadow-2xl flex flex-col overflow-hidden"
        >
          {/* HEADER */}
          <header className="p-8 border-b border-heritage-espresso/5 flex justify-between items-center">
            <div>
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30 block mb-1">Curated List</span>
               <h2 className="text-3xl font-serif italic text-heritage-espresso">The Favorites</h2>
            </div>
            <button 
              className="w-10 h-10 rounded-full border border-heritage-espresso/5 flex items-center justify-center text-heritage-espresso/40 hover:bg-heritage-espresso hover:text-white transition-all shadow-sm" 
              onClick={() => setFavoritesOpen(false)}
            >
              <X size={18} />
            </button>
          </header>

          {/* LIST */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-8 space-y-6">
            {favorites.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                <Heart size={40} className="text-heritage-espresso" />
                <p className="text-xl font-serif italic text-heritage-espresso">No heart-selected items yet</p>
              </div>
            ) : (
              favorites.map((item, i) => (
                <div key={`${item.id}-${i}`} className="flex gap-6 items-center group">
                   <div className="w-16 h-16 rounded-2xl overflow-hidden border border-heritage-espresso/5 shrink-0">
                      <img src={item.image || '/biryani.png'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={item.name} width="64" height="64" />
                   </div>
                   <div className="flex-1">
                      <h4 className="font-serif italic text-lg text-heritage-espresso">{item.name}</h4>
                      <p className="text-[10px] font-black tracking-widest text-heritage-espresso/30 uppercase mt-1">₹{item.price}</p>
                   </div>
                   <button 
                     onClick={() => { addToCart(item); setFavoritesOpen(false); }}
                     className="w-10 h-10 bg-heritage-gold/10 text-heritage-gold rounded-full flex items-center justify-center hover:bg-heritage-gold hover:text-white transition-all active:scale-90"
                   >
                     <ShoppingBag size={14} />
                   </button>
                </div>
              ))
            )}
          </div>

          <footer className="p-8 text-center">
             <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20 italic">
               Saved in your heritage session
             </p>
          </footer>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
