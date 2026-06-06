import React, { useState, useEffect } from 'react';
import { ShoppingBag, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../api';
import { apiUrl, USE_DEV_CUSTOMER_FALLBACKS } from '../api/config';
import { createManagedEventSource } from '../api/realtime';
import { MenuSchema } from './SEO/PageSchemas';
import { applyPortionToItem, getDefaultPortion, getPortionOptions, isOnlyPortionPriceText, isOnlySinglePriceText } from '../utils/portionOptions';
import ResponsiveImage from './ResponsiveImage';
import { menuImageSrc, optimizedImage } from '../utils/imageAssets';

/**
 * PRODUCTION MENU ENGINE - v4.0
 * Features: Supabase-First, Dual-Pricing, Category Grouping, and Fail-Safe Fallbacks
 */
export default function MenuDisplay() {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const { addToCart, t, restaurantId } = useApp();

  useEffect(() => {
    let isMounted = true;
    const fetchMenu = async () => {
      try {
        setLoading(true);
        const data = await api.getMenu();
        if (isMounted) {
          setMenu(data || []);
          if (!data || data.length === 0) setError("Menu is currently unavailable.");
        }
      } catch (err) {
        if (isMounted) {
          setMenu([]);
          setError("Menu is currently unavailable. Please try again shortly.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchMenu();
    const stream = USE_DEV_CUSTOMER_FALLBACKS
      ? { close() {} }
      : createManagedEventSource(apiUrl('/api/menu/stream'), {
          events: ['menu.updated'],
          onRefresh: fetchMenu,
        });
    const pollingFallback = window.setInterval(fetchMenu, 30000);
    return () => {
      isMounted = false;
      stream.close();
      window.clearInterval(pollingFallback);
    };
  }, []);

  const categories = ['All', ...new Set(menu.map(item => item.category))];
  const filteredMenu = activeCategory === 'All' ? menu : menu.filter(item => item.category === activeCategory);
  const groupedMenu = filteredMenu.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  if (loading) return (
    <div className="py-40 flex flex-col items-center justify-center space-y-6">
      <Loader2 className="animate-spin text-heritage-gold" size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-heritage-espresso/70">Consulting the Vault...</p>
    </div>
  );

  return (
    <div id="menu" className="mobile-menu-section py-20 px-4 md:px-20 bg-transparent scroll-mt-24 md:py-32">
      <MenuSchema items={menu} />
      <div className="max-w-7xl mx-auto space-y-12 md:space-y-20">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row items-baseline gap-4 md:gap-6 border-b border-heritage-espresso/5 pb-8 md:pb-12">
          <h2 className="text-5xl md:text-8xl font-serif italic text-heritage-espresso leading-none">{t('menu')}</h2>
          <div className="flex-1 h-px bg-heritage-espresso/10 hidden md:block" />
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-heritage-espresso/70">Secunderabad Selection</p>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex gap-4 items-center text-amber-800 animate-in fade-in slide-in-from-top-4">
            <AlertCircle size={20} />
            <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
          </div>
        )}

        {/* CATEGORY TABS */}
        <div className="mobile-category-tabs flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-4 md:pb-6 sticky top-20 md:top-24 z-40 bg-[var(--bg-primary)]/90 backdrop-blur-md -mx-4 md:-mx-6 px-4 md:px-6 pt-3 md:pt-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 min-h-11 px-5 py-3 md:px-10 md:py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${activeCategory === cat ? 'bg-heritage-espresso text-white border-heritage-espresso shadow-2xl' : 'bg-white/80 text-heritage-espresso/75 border-heritage-espresso/10 hover:bg-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* GRID */}
        <div className="space-y-20 md:space-y-32">
          {Object.entries(groupedMenu).map(([category, items]) => (
            <div key={category} className="premium-menu-group space-y-8 md:space-y-12">
              <div className="flex items-center gap-6">
                <h3 className="text-3xl md:text-4xl font-serif italic text-heritage-gold whitespace-nowrap">{category}</h3>
                <div className="w-full h-px bg-gradient-to-r from-heritage-gold/20 to-transparent" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10 md:gap-y-16">
                {items.map((item, index) => (
                  <MenuItemCard key={item.id} item={item} index={index} onAdd={addToCart} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuItemCard({ item, index = 0, onAdd }) {
  const { t } = useApp();
  const portionOptions = getPortionOptions(item);
  const [selectedSize, setSelectedSize] = useState(getDefaultPortion(item)?.id || 'regular');
  const [added, setAdded] = useState(false);
  const selectedPortion = portionOptions.find((portion) => portion.id === selectedSize) || getDefaultPortion(item);
  const price = Number(selectedPortion?.price ?? item.price ?? 0);
  const description = item.description || '';

  const handleAdd = (e) => {
    e.stopPropagation();
    onAdd(applyPortionToItem({ ...item, img: item.img || item.image_url || '/biryani.png' }, selectedPortion), 1, '', [], '');
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div
      className="mobile-menu-card premium-menu-card group space-y-4 md:space-y-6"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="relative aspect-square rounded-[1.5rem] md:rounded-[3rem] overflow-hidden bg-heritage-stone shadow-xl border border-heritage-espresso/5">
        <ResponsiveImage
          src={menuImageSrc(item)}
          className="w-full h-full object-cover transition-transform duration-1000 contrast-[1.05] group-hover:scale-110"
          alt={item.name}
          loading="lazy"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          width="420"
          height="420"
          onError={(e) => { e.target.src = optimizedImage('/biryani.png', 640); }}
        />
        {item.available === false && (
          <div className="absolute inset-0 bg-heritage-espresso/80 backdrop-blur-sm flex items-center justify-center">
            <span className="text-white text-[10px] font-black uppercase tracking-[0.5em] -rotate-12 border-2 border-white/30 px-6 py-2">Sold Out</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="text-2xl font-serif italic text-heritage-espresso leading-none">{item.name}</h4>
            {item.dietary_tags && item.dietary_tags.length > 0 && (
              <div className="flex gap-2 mt-2">
                {item.dietary_tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[8px] font-black uppercase tracking-widest text-heritage-gold">{tag}</span>
                ))}
              </div>
            )}
          </div>
          <div className="text-xl font-serif italic text-heritage-espresso">₹{price}</div>
        </div>

        {description && !isOnlyPortionPriceText(description) && !isOnlySinglePriceText(description) && (
          <div className="space-y-4">
            <p className="text-xs text-heritage-espresso/60 leading-relaxed font-medium">{description}</p>
          </div>
        )}

        {portionOptions.length > 1 && (
          <div className="flex p-1 bg-heritage-stone/30 rounded-2xl border border-heritage-espresso/5">
            {portionOptions.map(portion => (
              <button key={portion.id} onClick={(e) => { e.stopPropagation(); setSelectedSize(portion.id); }} className={`flex-1 min-h-11 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedSize === portion.id ? 'bg-white text-heritage-espresso shadow-md' : 'text-heritage-espresso/75'}`}>
                {portion.label} • ₹{portion.price}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={added || item.available === false}
          className={`w-full min-h-12 py-4 md:py-5 rounded-[1.5rem] md:rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] transition-all flex items-center justify-center gap-3 md:gap-4 ${added ? 'bg-green-500 text-white' : item.available === false ? 'bg-heritage-espresso/10 text-heritage-espresso/75 cursor-not-allowed' : 'bg-heritage-gold text-white hover:bg-heritage-espresso shadow-xl shadow-heritage-gold/20'}`}
        >
          {added ? <><CheckCircle2 size={16} /> Added</> : <><ShoppingBag size={16} /> Add to Order</>}
        </button>
      </div>
    </div>
  );
}
