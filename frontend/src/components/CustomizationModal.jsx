import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ChefHat } from 'lucide-react';
import { applyPortionToItem, getDefaultPortion, getPortionOptions } from '../utils/portionOptions';

export default function CustomizationModal({ item, isOpen, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const [selectedPortionId, setSelectedPortionId] = useState('');
  const portionOptions = getPortionOptions(item);
  const selectedPortion = portionOptions.find((portion) => portion.id === selectedPortionId) || getDefaultPortion(item);
  const unitPrice = Number(selectedPortion?.price ?? item.price ?? 0);

  useEffect(() => {
    if (!isOpen) return;
    setQty(1);
    setSelectedPortionId(getDefaultPortion(item)?.id || '');
  }, [isOpen, item]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleManualQtyChange = (value) => {
    const nextQty = parseInt(value, 10);
    if (!Number.isNaN(nextQty) && nextQty > 0) setQty(nextQty);
    else if (value === '') setQty('');
  };

  const addItem = () => {
    onAdd(applyPortionToItem(item, selectedPortion), parseInt(qty, 10) || 1, '', [], '');
    onClose();
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
          className="relative flex max-h-[90svh] w-full max-w-xl flex-col overflow-hidden rounded-[3rem] border border-white/20 bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between p-8 pb-0">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-heritage-stone text-heritage-espresso shadow-sm">
                  <ChefHat size={20} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30">Menu Rate</span>
              </div>
              <h2 className="text-4xl font-serif italic text-heritage-espresso">{item.name}</h2>
            </div>
            <button onClick={onClose} className="rounded-full bg-heritage-stone p-4 text-heritage-espresso/30 transition-all hover:bg-heritage-espresso hover:text-white">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-10 overflow-y-auto p-8">
            <section className="space-y-5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/40">Choose Rate</h3>
              {portionOptions.length > 1 ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {portionOptions.map((portion) => (
                    <button
                      key={portion.id}
                      onClick={() => setSelectedPortionId(portion.id)}
                      className={`rounded-[1.75rem] border p-5 text-left transition-all ${selectedPortion?.id === portion.id ? 'border-heritage-espresso bg-heritage-espresso text-white shadow-xl' : 'border-heritage-espresso/5 bg-white hover:border-heritage-gold/40'}`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest">{portion.label}</p>
                      <p className={`mt-2 text-lg font-serif italic ${selectedPortion?.id === portion.id ? 'text-heritage-gold' : 'text-heritage-espresso'}`}>₹{portion.price}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.75rem] border border-heritage-espresso/5 bg-heritage-stone/30 p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40">
                    {selectedPortion?.label || 'Regular'} • ₹{Number(selectedPortion?.price ?? item.price ?? 0)}
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-5">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/40">Quantity</h3>
              <div className="flex items-center justify-between gap-5 rounded-[2rem] border border-heritage-espresso/5 bg-heritage-stone/30 p-4">
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full text-heritage-espresso/40 shadow-sm transition-all hover:bg-heritage-espresso hover:text-white"
                  onClick={() => setQty(Math.max(1, (parseInt(qty, 10) || 1) - 1))}
                >
                  <Minus size={14} />
                </button>
                <input
                  type="text"
                  value={qty}
                  onChange={(event) => handleManualQtyChange(event.target.value)}
                  className="w-16 bg-transparent text-center font-serif text-3xl italic text-heritage-espresso outline-none"
                />
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full text-heritage-espresso/40 shadow-sm transition-all hover:bg-heritage-espresso hover:text-white"
                  onClick={() => setQty((parseInt(qty, 10) || 0) + 1)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </section>
          </div>

          <div className="flex items-center justify-between border-t border-heritage-espresso/5 p-8">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Total</p>
              <p className="text-3xl font-serif italic text-heritage-gold">₹{unitPrice * (parseInt(qty, 10) || 0)}</p>
            </div>
            <button
              onClick={addItem}
              className="rounded-full bg-heritage-espresso px-10 py-5 text-[10px] font-black uppercase tracking-[0.35em] text-white shadow-xl transition-all hover:bg-heritage-gold"
            >
              Add to Order
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
