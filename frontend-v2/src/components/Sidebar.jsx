import React from 'react';
import { User, Mail, GraduationCap, Calendar, Ticket, ChevronRight, X, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Sidebar = ({ 
  selectedSeat, 
  onClearSeat, 
  onStartPayment, 
  formData, 
  onFormChange, 
  loading 
}) => {
  return (
    <aside className="w-80 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[32px] flex flex-col h-full overflow-hidden shadow-2xl relative z-10">
      
      {/* Legend */}
      <div className="p-6 border-b border-white/5 bg-slate-900/20">
        <h3 className="font-headline text-lg font-bold text-white mb-5 flex items-center gap-2">
           <div className="w-1.5 h-4 bg-primary rounded-full" /> Legend
        </h3>
        <div className="grid grid-cols-2 gap-y-4 gap-x-2">
          <LegendItem color="bg-[rgba(0,170,255,0.15)] border-[rgba(0,170,255,0.5)]" label="Available" />
          <LegendItem color="bg-[rgba(255,204,0,0.2)] border-[#facc15]" label="Selected" />
          <LegendItem color="bg-[rgba(100,116,139,0.2)] border-[#64748b]" label="Locked" />
          <LegendItem color="bg-[rgba(239,68,68,0.2)] border-[#ef4444]" label="Sold" />
        </div>
      </div>

      {/* Participant Form */}
      <div className="p-6 space-y-4 border-b border-white/5 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col mb-1">
          <h3 className="font-headline text-lg font-bold text-white leading-none">Participant</h3>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1.5">Verification Required</span>
        </div>
        
        <div className="space-y-3">
          <FormInput 
            icon={<User className="w-4 h-4" />} 
            placeholder="Full Name" 
            name="name"
            value={formData.name}
            onChange={onFormChange}
          />
          <FormInput 
            icon={<Mail className="w-4 h-4" />} 
            placeholder="Email" 
            name="email"
            value={formData.email}
            disabled={true}
          />
          <div className="flex gap-2">
            <FormInput 
              icon={<GraduationCap className="w-4 h-4" />} 
              placeholder="Branch" 
              name="branch"
              value={formData.branch}
              onChange={onFormChange}
            />
            <select 
              name="year"
              value={formData.year}
              onChange={onFormChange}
              className="w-24 bg-slate-950/50 border border-white/10 rounded-xl py-3 px-3 text-xs text-slate-100 focus:outline-none focus:border-primary/50 transition-all shadow-inner"
            >
              <option value="">Year</option>
              <option value="1st">1st</option>
              <option value="2nd">2nd</option>
              <option value="3rd">3rd</option>
              <option value="4th">4th</option>
            </select>
          </div>
          <FormInput 
            icon={<ShieldCheck className="w-4 h-4" />} 
            placeholder="COLLEGE PIN" 
            name="pin"
            value={formData.pin}
            onChange={onFormChange}
            className="text-primary font-mono font-bold text-center tracking-[0.2em]"
          />
        </div>
      </div>

      {/* Selection & Checkout */}
      <div className="p-6 mt-auto bg-slate-950/30">
        <h3 className="font-headline text-lg font-bold text-white mb-4">Selection</h3>
        
        <div className="mb-6 min-h-[60px]">
          <AnimatePresence mode="wait">
            {selectedSeat ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-primary/10 border border-primary/30 rounded-2xl py-3 px-4 flex items-center justify-between shadow-lg shadow-primary/10 animate-fade-in"
              >
                <div className="flex flex-col">
                   <span className="text-[9px] text-primary font-bold uppercase tracking-widest leading-none mb-1">Confirmed Seat</span>
                   <span className="text-white font-mono font-bold text-lg leading-none">{selectedSeat}</span>
                </div>
                <button 
                  onClick={onClearSeat}
                  className="w-7 h-7 rounded-lg bg-slate-900 border border-white/10 text-slate-500 hover:text-rose-400 hover:border-rose-400 transition-all flex items-center justify-center shadow-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 rounded-2xl border border-dashed border-white/10 text-slate-500 animate-pulse bg-slate-900/50">
                <Ticket className="w-5 h-5 mb-1.5 opacity-30" />
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-center">Click a seat to select</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-white/5 shadow-inner">
           <div className="flex justify-between items-center mb-1">
             <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Entry Passes</span>
             <span className="text-slate-100 text-xs font-bold tabular-nums">Count: {selectedSeat ? 1 : 0}</span>
           </div>
           <div className="flex justify-between items-end mb-6">
             <span className="text-slate-400 text-xs font-medium">Subtotal</span>
             <span className="font-headline text-3xl font-black bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text drop-shadow-[0_0_10px_rgba(108,92,231,0.3)]">
               ₹{selectedSeat ? 1 : 0}
             </span>
           </div>

           <button 
            disabled={!selectedSeat || loading}
            onClick={onStartPayment}
            className="w-full h-14 rounded-2xl bg-primary text-white font-bold text-xs uppercase tracking-[0.2em] shadow-lg shadow-primary/30 hover:bg-primary-dim hover:shadow-primary/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group flex items-center justify-center gap-3"
           >
             {loading ? 'Initializing...' : (
               <>
                 Checkout Now
                 <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
               </>
             )}
           </button>
        </div>
      </div>
    </aside>
  );
};

const LegendItem = ({ color, label }) => (
  <div className="flex items-center gap-2.5">
    <div className={`w-3.5 h-3.5 rounded-sm border ${color}`} />
    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{label}</span>
  </div>
);

const FormInput = ({ icon, className, ...props }) => (
  <div className="relative group">
    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
      {icon}
    </div>
    <input 
      className={`w-full bg-slate-950/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-primary/50 transition-all shadow-inner ${className}`}
      {...props}
    />
  </div>
);

export default Sidebar;
