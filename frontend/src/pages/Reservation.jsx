import React, { useState, useEffect } from 'react';
import { Calendar, Users, Clock, MapPin, Phone, CheckCircle2, ChevronLeft, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api';
import { useStore } from '../store/useStore';
import MagneticButton from '../components/MagneticButton';
import { useNavigate } from 'react-router-dom';

export default function Reservation() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    guests: '4',
    date: '',
    time: '19:00',
    note: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formError, setFormError] = useState(null);
  const { ledgerStampActive, setLedgerStampActive } = useStore();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    
    try {
      await api.createReservation({
        ...form,
        restaurantId: 'jaya-dhaba'
      });
      
      // Trigger stamp animation
      setLedgerStampActive(true);
      
      setTimeout(() => {
        setIsSuccess(true);
        setLedgerStampActive(false);
      }, 1500); // Wait for stamp animation to finish
      
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setFormError(err.message || 'The booking ledger is full or a connection issue occurred.');
      setIsSubmitting(false);
    }
  };

  const inputClasses = "w-full bg-transparent border-0 border-b-2 border-[var(--text-accent)]/20 px-2 py-4 outline-none focus:border-[var(--text-accent)] transition-colors font-sans font-bold text-[var(--text-main)] text-lg placeholder:font-normal placeholder:italic placeholder:text-[var(--text-main)]/30";

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-10 bg-[var(--bg-primary)] relative overflow-hidden transition-colors duration-700">
        <div className="absolute inset-0 bg-gradient-to-tr from-[var(--cta-color)]/5 via-transparent to-[var(--text-main)]/5 pointer-events-none" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
          className="max-w-xl w-full bg-white/10 backdrop-blur-xl p-16 rounded-[4rem] border border-[var(--text-main)]/5 shadow-2xl text-center space-y-10"
        >
           <div className="w-24 h-24 bg-[var(--cta-color)]/10 rounded-full flex items-center justify-center mx-auto text-[var(--cta-color)]">
              <CheckCircle2 size={48} />
           </div>
           <div className="space-y-4">
              <h2 className="text-4xl font-serif italic text-[var(--text-main)]">Ancestral Table Secured</h2>
              <p className="text-sm font-medium text-[var(--text-main)]/60 leading-relaxed italic font-sans">
                Sunil Behera and the team will be ready for your arrival. Your place at the hearth is reserved.
              </p>
           </div>
           <MagneticButton 
             onClick={() => navigate('/')}
             className="px-10 py-4 bg-[var(--text-main)] text-[var(--bg-primary)] rounded-full text-[10px] font-black uppercase tracking-[0.4em] hover:bg-[var(--cta-color)] transition-all font-sans inline-block"
           >
             Return to Landing
           </MagneticButton>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden py-20 px-6 transition-colors duration-700">
      
      {/* HEADER & BACK BUTTON */}
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-20 relative z-50">
         <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-main)]/40 hover:text-[var(--text-accent)] transition-all group"
         >
            <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Return to Dhaba
         </button>
      </div>

      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[var(--cta-color)]/5 via-transparent to-[var(--text-main)]/5 pointer-events-none" />
      
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center min-h-[80svh]">
         
         {/* LEFT: CONTENT & INFO */}
         <div className="space-y-12 relative z-10 animate-in fade-in slide-in-from-left-8 duration-1000">
            <div className="space-y-6">
               <span className="text-[var(--cta-color)] font-black uppercase tracking-[0.6em] text-[10px] block font-sans">Table Reservations</span>
               <h1 className="text-6xl md:text-8xl font-serif italic text-[var(--text-main)] leading-[0.9]">
                 Secure Your <br/> <span className="text-[var(--cta-color)] pr-4">Hearth</span> Place
               </h1>
               <p className="text-lg text-[var(--text-main)]/60 font-medium leading-relaxed italic max-w-md font-sans">
                 "Secure Your Hearth Place: The handi is prepared; we await your arrival."
               </p>
            </div>

            <div className="space-y-8">
               <div className="flex gap-6 items-start">
                  <div className="w-12 h-12 bg-white/50 backdrop-blur-md rounded-2xl flex items-center justify-center text-[var(--text-main)]/40 shadow-sm shrink-0">
                     <MapPin size={20} />
                  </div>
                  <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]/40 mb-1 font-sans">Our Location</p>
                     <p className="text-sm font-bold text-[var(--text-main)]/80 font-sans">Secunderabad Space • East Marredpally</p>
                  </div>
               </div>
               
               <div className="flex gap-6 items-start">
                  <div className="w-12 h-12 bg-white/50 backdrop-blur-md rounded-2xl flex items-center justify-center text-[var(--text-main)]/40 shadow-sm shrink-0">
                     <Phone size={20} />
                  </div>
                  <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]/40 mb-1 font-sans">Direct Line</p>
                     <p className="text-sm font-bold text-[var(--text-main)]/80 font-sans">073861 85823</p>
                  </div>
               </div>
            </div>
         </div>

         {/* RIGHT: THE GUEST LEDGER */}
         <div className="relative animate-in fade-in slide-in-from-right-8 duration-1000 delay-300">
            
            <div className="bg-white/60 backdrop-blur-2xl p-10 md:p-14 rounded-none shadow-2xl space-y-10 relative overflow-hidden border border-[var(--text-main)]/10" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}>
               
               {/* Stamp Animation Layer */}
               <AnimatePresence>
                 {ledgerStampActive && (
                   <motion.div 
                     initial={{ scale: 3, opacity: 0, rotate: -20 }}
                     animate={{ scale: 1, opacity: 1, rotate: -5 }}
                     exit={{ opacity: 0 }}
                     transition={{ type: 'spring', damping: 12, stiffness: 100 }}
                     className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                   >
                     <div className="w-64 h-64 border-8 border-[var(--cta-color)] rounded-full flex items-center justify-center opacity-80 backdrop-blur-sm relative">
                        <div className="absolute inset-2 border-4 border-[var(--cta-color)] rounded-full border-dashed" />
                        <span className="text-4xl font-serif text-[var(--cta-color)] uppercase tracking-[0.2em] font-black rotate-[-10deg]">CONFIRMED</span>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>

               <div className="space-y-1 text-center border-b-2 border-[var(--text-main)]/10 pb-8">
                  <h2 className="text-3xl font-serif italic text-[var(--text-main)]">Guest Ledger</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-main)]/30 font-sans">Securing Your Arrival</p>
               </div>

               <form onSubmit={handleSubmit} className="space-y-10 pt-4 relative z-10">
                  <div className="space-y-8">
                     
                     <div className="relative group">
                        <input 
                           required 
                           type="text" 
                           placeholder="Guest Name (Ex: Jay Singh)"
                           className={inputClasses}
                           value={form.name}
                           onChange={e => setForm({...form, name: e.target.value})}
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-8">
                        <div className="relative">
                           <input 
                              required 
                              type="number" 
                              placeholder="Party Size"
                              className={inputClasses}
                              value={form.guests}
                              onChange={e => setForm({...form, guests: e.target.value})}
                           />
                        </div>
                        <div className="relative">
                           <select 
                              className={`${inputClasses} appearance-none cursor-pointer`}
                              value={form.time}
                              onChange={e => setForm({...form, time: e.target.value})}
                           >
                              {['11:00', '12:00', '13:00', '14:00', '19:00', '20:00', '21:00', '22:00'].map(t => (
                                 <option key={t} value={t}>{t} HRS</option>
                              ))}
                           </select>
                        </div>
                     </div>

                     <div className="relative">
                        <input 
                           required 
                           type="date" 
                           className={inputClasses}
                           value={form.date}
                           onChange={e => setForm({...form, date: e.target.value})}
                        />
                     </div>

                     {formError && (
                       <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
                          <Info size={16} className="text-red-500 mt-0.5 shrink-0" />
                          <p className="text-[10px] font-bold text-red-600 leading-relaxed font-sans uppercase tracking-widest">{formError}</p>
                       </div>
                     )}
                  </div>

                  <MagneticButton 
                    disabled={isSubmitting || ledgerStampActive}
                    className="w-full py-6 bg-[var(--text-main)] text-[var(--bg-primary)] font-black text-[10px] uppercase tracking-[0.5em] shadow-xl hover:bg-[var(--cta-color)] transition-all font-sans"
                    onClick={handleSubmit}
                  >
                     {isSubmitting || ledgerStampActive ? 'Imprinting...' : 'Seal the Ledger'}
                  </MagneticButton>
               </form>
            </div>
         </div>
      </div>
    </div>
  );
}
