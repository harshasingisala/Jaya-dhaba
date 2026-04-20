import React from 'react';
import { motion } from 'framer-motion';

const Loader = ({ name }) => {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 overflow-hidden relative">
      {/* Background Orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-secondary/10 rounded-full blur-[80px]" />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="w-24 h-24 bg-slate-900 border-2 border-primary/30 rounded-[32px] flex items-center justify-center shadow-2xl shadow-primary/20 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
             <span className="text-3xl font-black text-white font-headline tracking-tighter">FX</span>
          </div>
        </motion.div>

        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-4xl md:text-5xl font-black font-headline text-white tracking-tight mb-3 text-center"
        >
          FEEDX <span className="text-primary">2026</span>
        </motion.h1>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex flex-col items-center"
        >
          <p className="text-slate-400 font-bold text-sm uppercase tracking-[0.3em] mb-6">
            Welcome, <span className="text-white">{name || 'Delegate'}</span>
          </p>
          
          <div className="w-48 h-1 bg-slate-900 rounded-full overflow-hidden relative">
             <motion.div 
               initial={{ x: "-100%" }}
               animate={{ x: "100%" }}
               transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
               className="absolute inset-0 bg-gradient-to-r from-transparent via-primary to-transparent"
             />
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-12 left-0 right-0 text-center">
         <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">Establishing Secure Session</p>
      </div>
    </div>
  );
};

export default Loader;
