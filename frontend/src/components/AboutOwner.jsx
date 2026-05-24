import React from 'react';
import { motion } from 'framer-motion';

/**
 * JAYA DHABA — ABOUT OWNER (HERITAGE RESTORED)
 * Replicated exactly from the design specification.
 */
export default function AboutOwner() {
  return (
    <section id="owner" className="py-24 px-6 md:px-20 bg-[var(--bg-primary)]">
      <div className="max-w-[1300px] mx-auto">
        
        {/* GOLD BORDERED CONTAINER */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 border-[4px] shadow-2xl"
          style={{ borderColor: 'var(--gold-brand)', backgroundColor: 'var(--bg-primary)' }}
        >
          
          {/* IMAGE SIDE */}
          <div className="relative h-[400px] md:h-auto border-b md:border-b-0 md:border-r border-[var(--gold-brand)]">
            <img src="/assets/owner-portrait.webp" alt="Owner at desk" width="640" height="520" className="w-full h-full object-cover" />
          </div>

          {/* TEXT SIDE */}
          <div className="p-10 md:p-16 flex flex-col justify-center space-y-8">
            <h2 
              className="text-4xl md:text-5xl font-bold leading-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: 'var(--brown-brand)' }}
            >
              Heritage Restored by Hand
            </h2>
            
            <div className="space-y-6 text-base md:text-lg text-gray-800 leading-relaxed font-medium">
              <p>
                In the heart of the kitchen, amidst the aroma of roasting spices and the whistle of the handi, stands the architect of our flavor. More than just an owner, he is the keeper of the Jaya Dhaba legacy and high-tracked Halal Certification.
              </p>
              <p>
                The Dhaba reflects his dedication to authentic Hyderabadi flavor and home-style hospitality. Every grain of our signature Biryani and every spice in our curries is a testament to this commitment.
              </p>
              <p>
                When you eat here, you aren't just a customer; you are a guest in his home, experiencing authentic certifications designated by Jaya Dhaba.
              </p>
            </div>
          </div>

        </motion.div>
      </div>
    </section>
  );
}
