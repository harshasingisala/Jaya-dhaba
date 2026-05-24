import React, { useEffect, useState } from 'react';
import { Send, MessageSquare, Phone, MapPin, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { fetchContact, submitContact } from '../api/client';

const DEFAULT_CONTACT = {
  phone: '+91 73861 85821',
  address: 'East Marredpally, Secunderabad, Telangana 500026',
};

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [contact, setContact] = useState(DEFAULT_CONTACT);
  const [isContactLoading, setIsContactLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetchContact()
      .then((details) => {
        if (!isMounted) return;
        setContact({
          phone: details.phone || DEFAULT_CONTACT.phone,
          address: details.address || DEFAULT_CONTACT.address,
        });
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.warn('Contact details unavailable:', err);
        if (isMounted) setContact(DEFAULT_CONTACT);
      })
      .finally(() => {
        if (isMounted) setIsContactLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await submitContact(form);
      setIsSuccess(true);
    } catch (error) {
      if (import.meta.env.DEV) console.error("Failed to submit contact", error);
      setError(error.message || `Message delivery failed. Please call ${contact?.phone || DEFAULT_CONTACT.phone}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <section className="py-32 px-6 flex items-center justify-center">
        <div className="max-w-xl w-full bg-white/40 backdrop-blur-2xl p-16 rounded-[4rem] border border-heritage-espresso/5 shadow-2xl text-center space-y-8 animate-in fade-in zoom-in duration-700">
           <div className="w-20 h-20 bg-heritage-accent/10 rounded-full flex items-center justify-center mx-auto text-heritage-accent">
              <CheckCircle2 size={40} />
           </div>
           <div className="space-y-4">
              <h2 className="text-3xl font-serif italic text-heritage-espresso">Inquiry Received</h2>
              <p className="text-sm font-medium text-heritage-espresso/60 leading-relaxed italic">
                Our team is reviewing your message. We'll be in touch regarding your heritage experience shortly.
              </p>
           </div>
           <button 
             onClick={() => setIsSuccess(false)}
             className="px-10 py-4 bg-heritage-espresso text-white rounded-full text-[10px] font-black uppercase tracking-[0.4em] hover:bg-heritage-gold transition-all"
           >
             Send another?
           </button>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="py-32 px-6 md:px-20 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-heritage-gold/5 blur-[140px] rounded-full -z-10" />
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
         
         {/* LEFT: TEXT */}
         <div className="space-y-12">
            <div className="space-y-6">
               <span className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px] block">Connect With Us</span>
               <h2 className="text-5xl md:text-7xl font-serif italic text-heritage-espresso leading-[0.9]">Inquire for <br/> <span className="text-heritage-gold">Events</span></h2>
               <p className="text-lg text-heritage-espresso/60 font-medium leading-relaxed italic max-w-md">
                 Whether it's a grand heritage wedding, a masterclass, or a private culinary evening, our team is ready to curate your story.
               </p>
            </div>

            <div className="space-y-8">
               <div className="flex gap-6 items-center group">
                  <div className="w-14 h-14 bg-white/60 backdrop-blur-md rounded-3xl flex items-center justify-center text-heritage-espresso/40 shadow-sm transition-all group-hover:bg-heritage-gold group-hover:text-white">
                     <Phone size={20} />
                  </div>
                  <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 mb-1">Establishment Owner</p>
                     <p className="text-sm font-bold text-heritage-espresso">
                        {isContactLoading ? 'Loading contact details...' : contact?.phone}
                     </p>
                  </div>
               </div>
               
               <div className="flex gap-6 items-center group">
                  <div className="w-14 h-14 bg-white/60 backdrop-blur-md rounded-3xl flex items-center justify-center text-heritage-espresso/40 shadow-sm transition-all group-hover:bg-heritage-gold group-hover:text-white">
                     <MapPin size={20} />
                  </div>
                  <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30 mb-1">Heritage Space</p>
                     <a
                        href="https://share.google/6efBsQaOasTY9Tnvt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-heritage-espresso hover:text-heritage-gold transition-colors"
                     >
                        Heritage Exclusive Since 2020
                     </a>
                  </div>
               </div>
            </div>
         </div>

         {/* RIGHT: THE INQUIRY CARD */}
         <div className="bg-white/40 backdrop-blur-2xl p-10 md:p-14 rounded-[4.5rem] border border-heritage-espresso/5 shadow-2xl space-y-10">
            <div className="flex items-center gap-4 border-b border-heritage-espresso/5 pb-8">
               <div className="w-12 h-12 bg-heritage-espresso text-heritage-gold rounded-2xl flex items-center justify-center shadow-lg">
                  <MessageSquare size={20} />
               </div>
               <div>
                  <h3 className="text-xl font-serif italic text-heritage-espresso">The Inquiry Slip</h3>
                  <p className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/30">Direct to Guest Relations</p>
               </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
               {error && (
                  <div className="px-6 py-4 bg-red-50 border border-red-200 rounded-3xl text-xs font-bold text-red-700">
                     {error}
                  </div>
               )}
               <div className="space-y-6">
                  <div className="relative group">
                     <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block">Identification</label>
                     <input 
                        required 
                        placeholder="Ex: Jay Singh"
                        className="w-full bg-white/50 border border-heritage-espresso/5 px-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm shadow-sm"
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                     />
                  </div>

                  <div className="relative group">
                     <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block">Direct Line / Email</label>
                     <input 
                        required 
                        placeholder="yourname@heritage.com"
                        className="w-full bg-white/50 border border-heritage-espresso/5 px-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm shadow-sm"
                        value={form.email}
                        onChange={e => setForm({...form, email: e.target.value})}
                     />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                     <div className="relative group">
                        <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block">Phone</label>
                        <input
                           placeholder="+91 98765 43210"
                           className="w-full bg-white/50 border border-heritage-espresso/5 px-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm shadow-sm"
                           value={form.phone}
                           onChange={e => setForm({...form, phone: e.target.value})}
                        />
                     </div>

                     <div className="relative group">
                        <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block">Subject</label>
                        <input
                           placeholder="Event, catering, feedback..."
                           className="w-full bg-white/50 border border-heritage-espresso/5 px-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm shadow-sm"
                           value={form.subject}
                           onChange={e => setForm({...form, subject: e.target.value})}
                        />
                     </div>
                  </div>

                  <div className="relative group">
                     <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6 mb-2 block text-right">Message Context</label>
                     <textarea 
                        required 
                        rows="4"
                        placeholder="Describe your heritage event requirements..."
                        className="w-full bg-white/50 border border-heritage-espresso/5 px-8 py-5 rounded-3xl outline-none focus:bg-white focus:border-heritage-gold transition-all font-bold text-heritage-espresso text-sm shadow-sm resize-none"
                        value={form.message}
                        onChange={e => setForm({...form, message: e.target.value})}
                     />
                  </div>
               </div>

               <button 
                 disabled={isSubmitting}
                 className="w-full py-6 bg-heritage-terracotta text-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.5em] shadow-xl hover:bg-heritage-espresso transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50"
               >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Dispatch Message →'}
               </button>
            </form>
         </div>

      </div>
    </section>
  );
}
