import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, ShoppingBag, ChevronRight, Trash2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { useNavigate } from "react-router-dom";

export default function CartDrawer() {
  const navigate = useNavigate();
  const { cart, cartOpen, setCartOpen, setItemQty, removeFromCart, total } = useApp();

  if (!cartOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex justify-end">
        {/* BACKDROP */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-heritage-espresso/40 backdrop-blur-sm"
          onClick={() => setCartOpen(false)}
        />

        {/* DRAWER */}
        <motion.div 
          initial={{ x: "100%" }} 
          animate={{ x: 0 }} 
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full max-w-md h-full bg-white/90 backdrop-blur-3xl border-l border-heritage-espresso/5 shadow-2xl flex flex-col overflow-hidden"
        >
          {/* HEADER */}
          <header className="p-5 md:p-8 border-b border-heritage-espresso/5 flex justify-between items-center bg-white/50">
            <div>
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30 block mb-1">Your Selection</span>
               <h2 className="text-2xl md:text-3xl font-serif italic text-heritage-espresso">The Cart</h2>
            </div>
            <button 
              className="w-10 h-10 rounded-full border border-heritage-espresso/5 flex items-center justify-center text-heritage-espresso/40 hover:bg-heritage-espresso hover:text-white transition-all shadow-sm" 
              onClick={() => setCartOpen(false)}
            >
              <X size={18} />
            </button>
          </header>

          {/* ITEMS */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8 space-y-4 md:space-y-6">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30">
                <div className="w-20 h-20 bg-heritage-stone rounded-full flex items-center justify-center">
                   <ShoppingBag size={40} className="text-heritage-espresso" />
                </div>
                <p className="text-2xl font-serif italic text-heritage-espresso">Your tray is empty</p>
                <button 
                  onClick={() => setCartOpen(false)}
                  className="text-[10px] font-black uppercase tracking-widest text-heritage-gold underline underline-offset-8"
                >
                  Return to Menu
                </button>
              </div>
            ) : (
              cart.map((item, i) => (
                <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: i * 0.1 }}
                   key={item._key} 
                   className="bg-white/50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border border-heritage-espresso/5 flex gap-4 md:gap-6 group hover:shadow-lg transition-all"
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border border-heritage-espresso/5 bg-heritage-stone shrink-0">
                    <img src={item.img || item.image || '/biryani.png'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={item.name} width="80" height="80" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-serif italic text-base md:text-lg text-heritage-espresso">{item.name}</h4>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {item.portionLabel && (
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-heritage-gold/10 text-heritage-gold rounded-full">
                              {item.portionLabel}
                            </span>
                          )}
                          <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-heritage-espresso/5 text-heritage-espresso/40 rounded-full">
                            {item.spiceLevel}
                          </span>
                          {(item.addons || []).map(a => (
                            <span key={a} className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-heritage-gold/10 text-heritage-gold rounded-full">
                              +{a}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-sm font-black text-heritage-gold">₹{item.price * item.qty}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                       <div className="flex items-center gap-4 bg-heritage-stone/40 p-1.5 rounded-full px-4 border border-heritage-espresso/5">
                         <button 
                           className="w-6 h-6 rounded-full flex items-center justify-center text-heritage-espresso/40 hover:text-heritage-espresso transition-colors" 
                           onClick={() => setItemQty(item._key, item.qty - 1)}
                         >
                           <Minus size={12} />
                         </button>
                         <span className="text-xs font-black text-heritage-espresso w-4 text-center">{item.qty}</span>
                         <button 
                           className="w-6 h-6 rounded-full flex items-center justify-center text-heritage-espresso/40 hover:text-heritage-espresso transition-colors" 
                           onClick={() => setItemQty(item._key, item.qty + 1)}
                         >
                           <Plus size={12} />
                         </button>
                       </div>
                       <button 
                         onClick={() => removeFromCart(item._key)} 
                         className="text-heritage-terracotta/40 hover:text-heritage-terracotta transition-colors p-2"
                        >
                          <Trash2 size={14} />
                        </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          {/* FOOTER */}
          {cart.length > 0 && (
            <footer className="p-4 md:p-8 border-t border-heritage-espresso/5 bg-white/80 space-y-4 md:space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40">
                   <span>Heritage Subtotal</span>
                   <span>₹{Math.round(total / 1.05)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-4 border-t border-heritage-espresso/5">
                   <h3 className="text-xl md:text-2xl font-serif italic text-heritage-espresso">Total Valuation</h3>
                   <span className="text-3xl font-serif italic text-heritage-gold">₹{total}</span>
                </div>
              </div>
              
              <button 
                className="w-full py-5 md:py-6 bg-heritage-espresso text-white rounded-[1.6rem] md:rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.25em] md:tracking-[0.5em] shadow-xl hover:bg-heritage-gold transition-all active:scale-95 flex items-center justify-center gap-4"
                onClick={() => { setCartOpen(false); navigate("/checkout"); }}
              >
                Enter Journey <ChevronRight size={16} />
              </button>
            </footer>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
