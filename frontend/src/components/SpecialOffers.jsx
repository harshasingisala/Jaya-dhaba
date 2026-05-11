import React from 'react';
import { motion } from 'framer-motion';

import { useApp } from '../context/AppContext';

const offers = [
  {
    id: 1,
    img: "/assets/offer1.webp",
    subtitle: "Buy 4 Single Chicken Biryani Get Half Veg Manchurian Dry Free..",
    combo: [
      { id: 1, qty: 4 },  // Chicken Biryani
      { id: 11, qty: 0.5, price: 0 }  // Veg Manchurian Dry
    ]
  },
  {
    id: 2,
    img: "/assets/offer2.webp",
    subtitle: "Order Family Pack Chicken Biryani Get Half Chicken 65 Free",
    combo: [
      { id: 1, qty: 4 }, // Family pack = 4 servings Chicken Biryani
      { id: 12, qty: 0.5, price: 0 }  // Chicken 65
    ]
  },
  {
    id: 3,
    img: "/assets/offer3.webp",
    subtitle: "Serves 6, dominates",
    combo: [
      { id: 1, qty: 6 },  // Chicken Biryani
      { id: 5, qty: 1, price: 0 }  // Tandoori Chicken
    ]
  }
];

/**
 * JAYA DHABA — SPECIAL OFFERS (LEGENDARY SPECIALS)
 * Replicated exactly from the design specification.
 */
export default function SpecialOffers() {
  const { addItemsToCart, menuItems } = useApp();

  const handleOrder = (combo) => {
    const itemsToAdd = combo.map(c => {
      const baseItem = menuItems.find(m => m.id === c.id);
      return {
        item: { ...baseItem, price: c.price !== undefined ? c.price : baseItem.price },
        qty: c.qty
      };
    });
    addItemsToCart(itemsToAdd);
  };

  return (
    <section id="offers" className="py-24 px-6 md:px-20 bg-[var(--bg-primary)]">
      <div className="max-w-[1300px] mx-auto space-y-16">

        {/* HEADING */}
        <div className="text-center">
          <h2
            className="text-4xl md:text-5xl font-bold"
            style={{ fontFamily: "'Playfair Display', serif", color: 'var(--brown-brand)' }}
          >
            Legendary East Marredpally Specials
          </h2>
        </div>

        {/* CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {offers.map((offer, i) => (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="bg-white p-3 border-[3px] shadow-xl flex flex-col"
              style={{ borderColor: 'var(--gold-brand)' }}
            >
              {/* INNER WRAPPER FOR DOUBLE BORDER EFFECT IF NEEDED, OR JUST PADDING */}
              <div className="border border-gray-100 flex flex-col h-full">

                {/* IMAGE */}
                <div className="w-full">
                  <img
                    src={offer.img}
                    alt="Special Offer"
                    className="w-full h-auto block"
                  />
                </div>

                {/* CONTENT */}
                <div className="flex flex-col items-center justify-center pt-8 pb-6 space-y-6 flex-grow">
                  <p
                    className="text-lg md:text-xl font-medium text-center"
                    style={{ fontFamily: "'Playfair Display', serif", color: 'var(--brown-brand)' }}
                  >
                    {offer.subtitle}
                  </p>

                  <button
                    onClick={() => handleOrder(offer.combo)}
                    className="px-10 py-3 text-white text-sm font-bold tracking-wider uppercase transition-transform hover:scale-105"
                    style={{ backgroundColor: 'var(--gold-brand)' }}
                  >
                    Order Now
                  </button>
                </div>

              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
