import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const [lang, setLang] = useState('EN');

  return (
    <footer className="py-20 px-6 md:px-20 bg-[var(--bg-primary)] border-t border-[var(--text-main)]/5 transition-colors duration-700">
      <div className="max-w-7xl mx-auto space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 pb-12 border-b border-[var(--text-main)]/5">
           <div className="space-y-6">
              <h2 className="text-3xl font-serif italic text-[var(--text-main)]" style={{ fontFamily: "'Playfair Display', serif" }}>Jaya <span className="text-[var(--text-accent)]">Dhaba</span></h2>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-main)]/30">Heritage Excellence Since 1995</p>
              <div className="flex items-center gap-3">
                 <div className="px-3 py-1 border border-green-600/30 rounded-md">
                    <span className="text-[8px] font-black text-green-600 uppercase tracking-widest">100% Halal Verified</span>
                 </div>
              </div>
           </div>

           <div className="space-y-8">
              <div className="space-y-2">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-main)]">Timing & Delivery</h4>
                 <p className="text-sm text-[var(--text-main)]/60 font-medium">Dining: 11:00 AM - 11:00 PM</p>
                 <p className="text-sm text-[var(--text-accent)] font-bold">Free Home Delivery on Min. ₹300 Order</p>
              </div>
              <div className="space-y-2">
                 <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-main)]">Contact</h4>
                 <a href="tel:+917386185821" className="block text-sm text-[var(--text-main)]/60 hover:text-[var(--text-accent)] transition-colors">+91 73861 85821</a>
              </div>
           </div>

           <div className="space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-main)]">Location</h4>
              <p className="text-sm text-[var(--text-main)]/60 leading-relaxed font-medium max-w-xs">
                 East Marredpally, Secunderabad, Telangana 500026
              </p>
              <a href="https://share.google/6efBsQaOasTY9Tnvt" target="_blank" rel="noopener noreferrer" className="inline-block text-[9px] font-black uppercase tracking-widest text-[var(--text-accent)] border-b border-[var(--text-accent)]/20 pb-1">Heritage Exclusive Since 2020</a>
           </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-12 gap-6">
          <p className="text-[10px] font-medium text-[var(--text-main)]/20 italic font-serif">© 2026 Jaya Dhaba. Curated by Sunil Behera.</p>
          
          <div className="flex items-center gap-3 bg-[var(--text-main)]/5 p-1 rounded-full border border-[var(--text-main)]/5">
             <button 
                onClick={() => setLang('EN')}
                className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all ${lang === 'EN' ? 'bg-[var(--text-main)] text-[var(--bg-primary)] shadow-md' : 'text-[var(--text-main)]/40'}`}
             >
                EN
             </button>
             <button 
                onClick={() => setLang('TE')}
                className={`px-4 py-1.5 rounded-full text-[9px] font-black tracking-widest transition-all ${lang === 'TE' ? 'bg-[var(--text-main)] text-[var(--bg-primary)] shadow-md' : 'text-[var(--text-main)]/40'}`}
             >
                తెలుగు
             </button>
          </div>

          <div className="flex gap-6 text-[9px] font-black uppercase tracking-widest text-[var(--text-main)]/20">
             <Link to="/terms" className="hover:text-[var(--text-main)] transition-colors">Terms</Link>
             <Link to="/privacy" className="hover:text-[var(--text-main)] transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
