import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { useApp } from '../context/AppContext';
import ResponsiveImage from './ResponsiveImage';
import api from '../api';

function buildOffers(menuItems) {
  const byCategory = (name) => menuItems.filter((item) => String(item.category || '').toLowerCase() === name.toLowerCase());
  const biryani = byCategory('Biryani');
  const starters = byCategory('Starters');
  const breads = byCategory('Breads');

  return [
    { id: 'family', img: '/assets/offer1.webp', title: 'Family Table Combo', items: [biryani[0], starters[0]].filter(Boolean) },
    { id: 'kitchen', img: '/assets/offer2.webp', title: 'Kitchen Favorite Combo', items: [biryani[1] || biryani[0], breads[0]].filter(Boolean) },
    { id: 'dhaba', img: '/assets/offer3.webp', title: 'Dhaba Sharing Combo', items: [starters[1] || starters[0], breads[1] || breads[0]].filter(Boolean) },
  ].filter((offer) => offer.items.length);
}

export default function SpecialOffers() {
  const { addItemsToCart, menuItems } = useApp();
  const [localMenu, setLocalMenu] = useState(menuItems);

  useEffect(() => {
    if (menuItems.length) {
      setLocalMenu(menuItems);
      return undefined;
    }

    let cancelled = false;
    api.getMenu()
      .then((items) => {
        if (!cancelled) setLocalMenu(items || []);
      })
      .catch(() => {
        if (!cancelled) setLocalMenu([]);
      });
    return () => {
      cancelled = true;
    };
  }, [menuItems]);

  const offers = buildOffers(localMenu);

  if (!offers.length) return null;

  const handleOrder = (items) => {
    addItemsToCart(items.map((item) => ({ item, qty: 1 })));
  };

  return (
    <section id="offers" className="py-24 px-6 md:px-20 bg-[var(--bg-primary)]">
      <div className="max-w-[1300px] mx-auto space-y-16">
        <div className="text-center">
          <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: 'var(--brown-brand)' }}>
            Legendary East Marredpally Specials
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {offers.map((offer, index) => (
            <motion.div
              key={offer.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-white p-3 border-[3px] shadow-xl flex flex-col"
              style={{ borderColor: 'var(--gold-brand)' }}
            >
              <div className="border border-gray-100 flex flex-col h-full">
                <ResponsiveImage src={offer.img} alt={offer.title} width="576" height="1024" loading="lazy" sizes="(max-width: 768px) 100vw, 33vw" className="w-full h-auto block" />
                <div className="flex flex-col items-center justify-center pt-8 pb-6 space-y-6 flex-grow">
                  <p className="text-lg md:text-xl font-medium text-center" style={{ fontFamily: "'Playfair Display', serif", color: 'var(--brown-brand)' }}>
                    {offer.title}: {offer.items.map((item) => item.name).join(' + ')}
                  </p>
                  <button
                    onClick={() => handleOrder(offer.items)}
                    className="min-h-12 px-10 py-3 text-white text-sm font-bold tracking-wider uppercase transition-transform hover:scale-105"
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
