import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import useTilt from "../hooks/useTilt";
import Reveal from "./Reveal";
import CustomizationModal from "./CustomizationModal";
import { getDefaultPortion, getPortionOptions, isOnlyPortionPriceText } from "../utils/portionOptions";

function MenuItem({ item, onAddClicked, disabled }) {
  const ref = useTilt();
  const portionOptions = getPortionOptions(item);
  const [selectedPortionId, setSelectedPortionId] = useState(getDefaultPortion(item)?.id || "regular");
  const selectedPortion = portionOptions.find((portion) => portion.id === selectedPortionId) || getDefaultPortion(item);
  const displayPrice = Number(selectedPortion?.price ?? item.price ?? 0);
  const description = item.desc || item.description || "";

  return (
    <Reveal>
      <div
        ref={ref}
        className="bg-white p-5 rounded-[2.5rem] card-hover h-full flex flex-col group border border-heritage-espresso/5 relative overflow-hidden"
      >
        <div className="relative overflow-hidden rounded-[1.8rem] mb-5 aspect-square bg-heritage-stone">
          <img src={item.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={item.name} loading="lazy" width="420" height="420" />
        </div>
        <h3 className="text-xl font-serif italic text-heritage-espresso mb-1">{item.name}</h3>
        {description && !isOnlyPortionPriceText(description) && (
          <p className="text-[11px] text-heritage-espresso/40 mb-5 font-sans font-medium line-clamp-2">{description}</p>
        )}

        {portionOptions.length > 1 && (
          <div className="mb-4 flex rounded-2xl border border-heritage-espresso/5 bg-heritage-stone/30 p-1">
            {portionOptions.map((portion) => (
              <button
                key={portion.id}
                type="button"
                onClick={() => setSelectedPortionId(portion.id)}
                className={`flex-1 rounded-xl py-2 text-[9px] font-black uppercase tracking-widest transition-all ${selectedPortion?.id === portion.id ? "bg-white text-heritage-espresso shadow-sm" : "text-heritage-espresso/35"}`}
              >
                {portion.label} - Rs {portion.price}
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto flex justify-between items-center z-10 relative">
          <span className="font-black text-heritage-espresso/90 tracking-tighter text-lg font-sans">Rs {displayPrice}</span>
          <button
            disabled={disabled}
            onClick={() => onAddClicked({ ...item, _initialPortionId: selectedPortion?.id })}
            className="bg-heritage-gold/10 text-heritage-gold hover:bg-heritage-gold hover:text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export function MenuSectionComponent() {
  const { menuItems, addToCart, ordersPaused, menuUnavailable } = useApp();
  const [activeTab, setActiveTab] = useState("All");
  const [customizingItem, setCustomizingItem] = useState(null);
  const containerRef = useRef(null);

  const handleMouseMove = (event) => {
    if (!containerRef.current) return;
    const { left, top } = containerRef.current.getBoundingClientRect();
    containerRef.current.style.setProperty("--glow-x", `${event.clientX - left}px`);
    containerRef.current.style.setProperty("--glow-y", `${event.clientY - top}px`);
  };

  const filteredItems = menuItems.filter((item) => activeTab === "All" || item.category === activeTab);
  const categories = ["All", ...Array.from(new Set(menuItems.map((item) => item.category).filter(Boolean)))];

  return (
    <div
      id="menu"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="px-6 md:px-16 py-32 mt-10 scroll-mt-24 relative overflow-hidden group"
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{
          background: "radial-gradient(600px circle at var(--glow-x) var(--glow-y), rgba(245, 158, 11, 0.05), transparent 40%)",
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
            <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-none">The Chef&apos;s Palette</h2>
            <div className="flex-1 h-px bg-heritage-espresso/10 hidden md:block" />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30 font-sans">Menu</p>
          </div>
        </Reveal>

        {menuUnavailable && menuItems.length === 0 && (
          <div className="mb-8 rounded-2xl bg-amber-50 border border-amber-200 px-6 py-4 text-amber-800 text-sm font-black uppercase tracking-widest">
            Menu will load in a few seconds. Refresh if it does not appear.
          </div>
        )}

        {ordersPaused && (
          <div className="mb-8 rounded-2xl bg-red-50 border border-red-200 px-6 py-4 text-red-700 text-sm font-black uppercase tracking-widest">
            We are not accepting new orders right now. Please try again shortly.
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-center mb-16 px-2 gap-8">
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 w-full md:w-auto">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveTab(category)}
                className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap font-sans ${activeTab === category ? "bg-heritage-espresso text-white border-heritage-espresso shadow-lg" : "border-heritage-espresso/10 text-heritage-espresso/40 hover:border-heritage-espresso/20"}`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {!menuUnavailable && filteredItems.map((item) => (
            <MenuItem key={item.id} item={item} onAddClicked={setCustomizingItem} disabled={ordersPaused} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default MenuSectionComponent;
