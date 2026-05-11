import React from "react";

export default function Loader() {
  return (
    <div className="fixed inset-0 z-[200] bg-secondary flex flex-col items-center justify-center space-y-8 animate-fade-in">
      <div className="relative">
        <div className="w-24 h-24 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-primary font-serif italic text-2xl font-bold animate-pulse">
           J
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-serif italic text-on-surface">Jaya Dhaba</h2>
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-on-surface/30">Curation in Progress</p>
      </div>

      <div className="w-48 h-1 bg-black/5 rounded-full overflow-hidden relative">
         <div className="absolute inset-y-0 left-0 bg-primary w-1/3 animate-loading-bar" />
      </div>

      {/* CUSTOM KEYFRAMES ARE IN TAILWIND CONFIG OR INLINE STYLES FOR COMPLEXITY */}
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        .animate-loading-bar {
          animation: loading-bar 2s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
        }
      `}</style>
    </div>
  );
}
