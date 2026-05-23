import React, { useEffect } from 'react';
import { Home, Info, RefreshCcw } from 'lucide-react';

const volatileStorageKeys = [
  'user',
  'admin_token',
  'jd_cart',
  'jd_favorites',
  'jd_orders',
  'jd_sync_queue',
  'jaya_chat_messages',
];

export default function GlobalErrorBoundary({ error, resetErrorBoundary }) {
  const isAdmin = window.location.pathname.startsWith('/admin');
  const message = String(error?.message || error || '');
  const shouldAutoRefresh = /chunk|module|import|loading/i.test(message);

  useEffect(() => {
    if (!shouldAutoRefresh) return;
    const refreshKey = 'jd_auto_recovered_once';
    if (sessionStorage.getItem(refreshKey) === '1') return;
    sessionStorage.setItem(refreshKey, '1');
    window.setTimeout(() => window.location.reload(), 300);
  }, [shouldAutoRefresh]);

  const handleReset = () => {
    volatileStorageKeys.forEach((key) => {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch {
        // Ignore blocked storage during recovery.
      }
    });
    resetErrorBoundary();
  };

  return (
    <div className="min-h-screen heritage-stone-bg flex items-center justify-center p-10 text-center">
      <div className="max-w-2xl w-full bg-white/40 backdrop-blur-3xl p-16 rounded-[4rem] border border-heritage-espresso/5 shadow-2xl space-y-10">
         <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
            <Info size={48} />
         </div>
         <div className="space-y-4">
            <p className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px]">{isAdmin ? 'Admin Session Refresh' : 'Momentary Service Refresh'}</p>
            <h2 className="text-5xl font-serif italic text-heritage-espresso">{isAdmin ? 'Admin Panel Is Refreshing' : 'Please Refresh Once'}</h2>
            <p className="text-sm font-medium text-heritage-espresso/60 leading-relaxed italic max-w-sm mx-auto">
              {isAdmin
                ? 'A fresh version of the control suite is loading. Refresh once or return to admin login.'
                : 'A fresh version of Jaya Dhaba is loading. Refresh once, or call our Secunderabad kitchen directly.'}
            </p>
         </div>
         
         {/* FALLBACK STATIC CONTENT - Fulfillment of mission requirement */}
         <div className="relative h-64 rounded-3xl overflow-hidden border border-heritage-espresso/10">
            <img src="https://images.unsplash.com/photo-1563379091339-03b17af4a4f9?q=80&w=1200&auto=format&fit=crop" className="w-full h-full object-cover" alt="Jaya Dhaba Heritage" loading="lazy" width="1200" height="800" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
               <p className="text-white font-serif italic text-xl">The Hearth remains warm.</p>
            </div>
         </div>

         <div className="flex flex-col sm:flex-row gap-6 justify-center pt-4">
            <button 
               onClick={handleReset}
               className="flex items-center gap-4 bg-heritage-espresso text-white px-10 py-5 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-gold transition-all shadow-xl"
            >
               <RefreshCcw size={16} /> Refresh Now
            </button>
            <a 
               href={isAdmin ? '/admin/login' : 'tel:+917386185821'}
               className="flex items-center gap-4 border border-heritage-espresso/20 text-heritage-espresso px-10 py-5 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all"
            >
               {isAdmin ? <Home size={16} /> : null}
               {isAdmin ? 'Admin Login' : 'Call Kitchen'}
            </a>
         </div>
      </div>
    </div>
  );
}
