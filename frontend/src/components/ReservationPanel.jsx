import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Users, Phone, User, CheckCircle2, Loader2, Sparkles, MapPin, Clock } from "lucide-react";
import api from "../api";
import { useApp } from "../context/AppContext";

export default function ReservationPanel() {
  const { t } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [form, setForm] = useState({ 
    name: "", 
    phone: "", 
    guests: 4, 
    date: "", 
    time: "19:00",
    note: "" 
  });

  const submit = async () => {
    if (!form.name || !form.phone || !form.date) {
      return alert("Bro, please fill in the heritage details so we can welcome you properly!");
    }
    
    setIsSubmitting(true);
    try {
      await api.createReservation(form);
      setIsSuccess(true);
      setForm({ name: "", phone: "", guests: 4, date: "", time: "19:00", note: "" });
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (e) { 
      if (import.meta.env.DEV) console.error(e);
      alert("Failed to book the sanctuary. Please check your connection."); 
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="reservations" className="py-40 px-6 md:px-20 bg-heritage-stone/10 scroll-mt-24">
      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-20 items-center">
        
        {/* LEFT: INFO */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          className="space-y-12"
        >
          <div className="space-y-6">
            <h2 className="text-6xl md:text-8xl font-serif italic text-heritage-espresso leading-none">Book the Sanctuary</h2>
            <p className="text-lg font-medium text-heritage-espresso/60 max-w-md">
              Secure your place at our table. Whether it's a family gathering or a quiet feast, we'll have the tandoor ready.
            </p>
          </div>

          <div className="space-y-8">
            <div className="flex gap-6 items-center group">
               <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-heritage-gold shadow-xl group-hover:bg-heritage-gold group-hover:text-white transition-all">
                  <MapPin size={24} />
               </div>
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 mb-1">Our Location</p>
                  <p className="font-serif italic text-xl">East Marredpally, Secunderabad, Telangana 500026</p>
               </div>
            </div>
            <div className="flex gap-6 items-center group">
               <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-heritage-gold shadow-xl group-hover:bg-heritage-gold group-hover:text-white transition-all">
                  <Phone size={24} />
               </div>
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 mb-1">Direct Hotline</p>
                  <p className="font-serif italic text-xl">+91 73861 85821</p>
               </div>
            </div>
          </div>
        </motion.div>

        {/* RIGHT: FORM */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white p-16 rounded-[4rem] shadow-2xl border border-heritage-espresso/5 text-center space-y-8"
              >
                <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center text-white mx-auto shadow-2xl shadow-green-500/20">
                  <CheckCircle2 size={48} />
                </div>
                <div className="space-y-4">
                  <h3 className="text-4xl font-serif italic text-heritage-espresso">Reservation Secured</h3>
                  <p className="text-sm font-medium text-heritage-espresso/40">We've added your request to the heritage ledger. We'll call you shortly to confirm your sanctuary.</p>
                </div>
                <button 
                  onClick={() => setIsSuccess(false)}
                  className="px-10 py-4 bg-heritage-stone text-heritage-espresso rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-espresso hover:text-white transition-all"
                >
                  Make Another Booking
                </button>
              </motion.div>
            ) : (
              <motion.div 
                key="form"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-12 md:p-16 rounded-[4rem] shadow-2xl border border-heritage-espresso/5 space-y-10"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 ml-4">Full Name</label>
                    <div className="relative">
                      <User size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20" />
                      <input 
                        className="w-full bg-heritage-stone/40 border-none rounded-3xl pl-14 pr-8 py-5 text-sm font-bold outline-none focus:ring-2 ring-heritage-gold/20 transition-all" 
                        placeholder="Sunil Behera"
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 ml-4">Phone Number</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20" />
                      <input 
                        className="w-full bg-heritage-stone/40 border-none rounded-3xl pl-14 pr-8 py-5 text-sm font-bold outline-none focus:ring-2 ring-heritage-gold/20 transition-all" 
                        placeholder="98765 43210"
                        value={form.phone}
                        onChange={e => setForm({...form, phone: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 ml-4">Guest Count</label>
                    <div className="relative">
                      <Users size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20" />
                      <input 
                        type="number"
                        className="w-full bg-heritage-stone/40 border-none rounded-3xl pl-14 pr-8 py-5 text-sm font-bold outline-none focus:ring-2 ring-heritage-gold/20 transition-all" 
                        value={form.guests}
                        onChange={e => setForm({...form, guests: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 ml-4">Date of Visit</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20" />
                      <input 
                        type="date"
                        className="w-full bg-heritage-stone/40 border-none rounded-3xl pl-14 pr-8 py-5 text-sm font-bold outline-none focus:ring-2 ring-heritage-gold/20 transition-all" 
                        value={form.date}
                        onChange={e => setForm({...form, date: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 ml-4">Special Requests</label>
                  <textarea 
                    className="w-full bg-heritage-stone/40 border-none rounded-[2rem] px-8 py-6 text-sm font-bold outline-none focus:ring-2 ring-heritage-gold/20 transition-all min-h-[120px]" 
                    placeholder="Celebrations, dietary preferences, or specific table requests..."
                    value={form.note}
                    onChange={e => setForm({...form, note: e.target.value})}
                  />
                </div>

                <button 
                  onClick={submit}
                  disabled={isSubmitting}
                  className="w-full py-6 bg-heritage-espresso text-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.5em] shadow-2xl shadow-heritage-espresso/20 hover:bg-heritage-gold transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      Confirm Reservation <Sparkles size={16} />
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
