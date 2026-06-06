import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X, Plus, Minus, ArrowRight, Info } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useNavigate } from 'react-router-dom';
import ResponsiveImage from '../ResponsiveImage';
import { menuImageSrc } from '../../utils/imageAssets';

export default function CartPanel() {
  const { items, removeFromCart, addToCart, cartTotal, cartCount } = useCart();
  const navigate = useNavigate();

  return (
    <div className="glass-card rounded-[3rem] p-8 space-y-8 border border-white/5 shadow-2xl relative overflow-hidden">
      
      {/* Background Aura */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl -z-10" />

      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-serif italic text-white flex items-center gap-4">
          <ShoppingBag size={24} className="text-orange-500" />
          Shopping Tray
        </h3>
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          {cartCount} Items
        </span>
      </div>

      <div className="min-h-[300px] max-h-[500px] overflow-y-auto no-scrollbar space-y-6">
        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center grayscale opacity-20 italic text-sm space-y-4 pt-20">
              <ShoppingBag size={40} className="text-gray-400" />
              <p>Your tray is waiting to be filled.</p>
            </div>
          ) : (
            items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center gap-4 group"
              >
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0">
                  <ResponsiveImage src={menuImageSrc(item) || '/food1.jpg'} className="w-full h-full object-cover" alt={item.name} loading="lazy" sizes="64px" width="64" height="64" />
                </div>
                
                <div className="flex-grow space-y-1">
                  <h4 className="font-serif italic text-lg leading-none">{item.name}</h4>
                  <p className="text-orange-400 font-serif italic text-sm">₹{item.price * item.quantity}</p>
                </div>

                <div className="flex items-center gap-3 bg-white/5 rounded-full p-1 border border-white/5 group-hover:border-white/10 transition-all">
                  <button 
                    onClick={() => removeFromCart(item.id)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors bg-transparent border-none cursor-pointer text-gray-400 hover:text-white"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-xs font-black w-4 text-center">{item.quantity}</span>
                  <button 
                    onClick={() => addToCart(item)}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors bg-transparent border-none cursor-pointer text-gray-400 hover:text-white"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {items.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-white/5">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-medium italic">Subtotal</span>
              <span className="text-white font-medium">₹{cartTotal}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500 font-medium italic">Service & Spices</span>
              <span className="text-white font-medium">₹0</span>
            </div>
          </div>

          <div className="flex justify-between items-center px-2">
            <span className="text-xl font-serif italic text-white leading-none">Total Value</span>
            <span className="text-3xl font-serif italic font-bold text-orange-500 leading-none">₹{cartTotal}</span>
          </div>

          <button 
            onClick={() => navigate('/checkout')}
            className="w-full py-5 bg-white text-black rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] hover:bg-orange-500 hover:text-white transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3 border-none cursor-pointer"
          >
            Review and Checkout <ArrowRight size={14} />
          </button>
          
          <div className="flex items-center gap-3 grayscale opacity-30 text-[9px] font-black uppercase tracking-widest justify-center">
             <Info size={12} /> Kitchen opens for orders only
          </div>
        </div>
      )}

    </div>
  );
}
