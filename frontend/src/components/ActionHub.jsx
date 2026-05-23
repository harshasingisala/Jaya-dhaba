import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import './ActionHub.css';

const ActionHub = () => {
  const navigate = useNavigate();
  const cards = [
    {
      id: 'dine-in',
      title: 'Immersive Dine-in',
      description: 'A sensory journey designed for long evenings and shared laughter.',
      cta: 'Book a Table',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBSvVpHASu4s259uhupVYut01TZ3qcdPG_5TWLOXZdg6W6nWxSR_GgYHInkzIyJVMxgpVoJnwr8KseboVQKWZ-GVhpNc2BbOc5npS4mhJX2WeUVPFHMAbV1FYH6Csy8c-cQcF9OdXkP8aS4xmWU9FgGvPdl_Q2VrNbzNWZ4tnF_iio_-s2kSmlDvrbJ7R33dUSvgBGajRC4W1oR1pUw7a2cAuBCHodoF6oh4W0tQQ0PPTPl5nZdrdNf28rCHrTk23T4xexDi-q9ffZS',
      gridArea: 'dine-in'
    },
    {
      id: 'qr-order',
      title: 'Smart Ordering',
      description: 'Skip the wait. Scan and order directly to your table.',
      cta: 'Explore Digital Menu',
      icon: 'qr_code_2',
      gridArea: 'qr-order'
    },
    {
      id: 'party',
      title: 'Host an Heirloom Affair',
      description: 'From intimate gatherings to grand celebrations.',
      cta: 'Inquire Now',
      icon: 'celebration',
      gridArea: 'party'
    },
    {
      id: 'quick-reserve',
      title: 'Tonight\'s Table',
      description: 'Quickly secure your spot. Select your time below.',
      slots: ['7:00 PM', '8:30 PM'],
      gridArea: 'reserve',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAuj1AOFm6nHZbAJfHnRH4cbL0BvhP1q_mTro0U-j6_SZ_58oPjbQdIB2vuqxyMcIZLeE3CUM6tKACJrpExOAVRNNFp7K_eO9Upl2xg7H6RmkxWo9uIGzl5GrBQVy7uHPyppGCQkUsjve9MytJf6v0lhNS4roiG9-9Czw-fcgKbpIeok0OdknEbgU2hvzvEWRmjWl6_uoY1dF6dtOAbXR5bipadJUWPafDWxVHuhN4Oh8V1g_pg68DrHQBbXTg0XsBeBUhtoWoo28zv'
    }
  ];

  return (
    <section className="action-hub py-20">
      <div className="container">
        <div className="section-header text-center mb-16">
          <h2 className="text-4xl">The Jaya Experience</h2>
          <div className="divider"></div>
        </div>
        
        <div className="bento-grid">
          {cards.map((card, index) => (
            <motion.div 
              key={card.id}
              className={`bento-card ${card.gridArea} gentle-lift`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              {card.image && !card.icon && (
                <div className="card-bg">
                  <img src={card.image} alt={card.title} loading="lazy" width="640" height="420" />
                  <div className="overlay"></div>
                </div>
              )}
              
              <div className="card-content">
                {card.icon && (
                  <div className="card-icon-wrapper sunset-gradient">
                    <span className="material-symbols-outlined">{card.icon}</span>
                  </div>
                )}
                <h3 className="card-title">{card.title}</h3>
                <p className="card-description">{card.description}</p>
                
                {card.cta && (
                  <button 
                    className={`btn ${card.id === 'dine-in' ? 'btn-secondary' : 'btn-text'}`}
                    onClick={() => {
                       if (card.id === 'dine-in') navigate('/reservation');
                       else if (card.id === 'qr-order') {
                          const menuEl = document.getElementById('menu');
                          if (menuEl) menuEl.scrollIntoView({ behavior: 'smooth' });
                          else navigate('/');
                       }
                       else if (card.id === 'party') {
                          const contactEl = document.getElementById('contact');
                          if (contactEl) contactEl.scrollIntoView({ behavior: 'smooth' });
                          else navigate('/#contact');
                       }
                    }}
                  >
                    {card.cta}
                    {card.id !== 'dine-in' && <span className="material-symbols-outlined">arrow_forward</span>}
                  </button>
                )}
                
                {card.slots && (
                  <div className="slot-grid">
                    {card.slots.map(slot => (
                      <button key={slot} className="slot-btn surface-low" onClick={() => navigate('/reservation')}>{slot}</button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ActionHub;
