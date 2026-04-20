import React, { useState } from 'react';
import { LogOut, Activity, ShieldCheck, Settings, X, Bell, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = ({ onlineCount }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <nav className="h-20 flex items-center justify-between px-8 border-b border-white/10 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      {/* Left Section */}
      <div className="flex items-center gap-6">
        <div className="flex flex-col">
          <h1 className="font-headline text-2xl font-bold bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text drop-shadow-[0_0_10px_rgba(108,92,231,0.3)] tracking-tight">
            FEEDX <span className="text-white/40 font-light">PLATFORM</span>
          </h1>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em]">Auditorium Booking System</span>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-6">
        {/* Live Status */}
        <div className="flex items-center gap-3 bg-slate-800/40 px-4 py-2 rounded-full border border-white/5 shadow-inner">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-slate-300 text-xs font-semibold tabular-nums">
            {onlineCount || 0} <span className="text-slate-500 font-normal ml-1">Live Users</span>
          </span>
        </div>

        {/* User Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 pl-4 border-l border-white/10">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shadow-[0_0_15px_rgba(108,92,231,0.2)] border border-primary/40 ring-1 ring-primary/20">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-slate-100 text-xs font-bold uppercase tracking-wide">{user?.name}</span>
              <span className="text-slate-500 text-[10px] truncate max-w-[120px]">{user?.email}</span>
            </div>
          </div>
          
          {user?.role === 'admin' && (
            <button 
              onClick={() => navigate('/admin')}
              className="flex items-center gap-2 h-10 px-4 bg-primary/10 border border-primary/20 rounded-xl text-primary hover:bg-primary/20 transition-all group"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Admin</span>
            </button>
          )}
          
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/40 border border-white/5 text-slate-400 hover:text-primary transition-all"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          
          <button 
            onClick={logout}
            className="group flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/40 border border-white/5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all duration-300"
            title="Logout"
          >
            <LogOut className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl"
            onClick={() => setShowSettings(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[40px] p-10 shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <h3 className="text-2xl font-black text-white font-headline mb-8 tracking-tight">Account Configuration</h3>
              
              <div className="space-y-6">
                 <div className="flex items-center justify-between p-6 rounded-3xl bg-slate-950 border border-white/5 group hover:border-primary/20 transition-all">
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                          <Bell className="w-5 h-5" />
                       </div>
                       <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Push Notifications</span>
                    </div>
                    <div className="w-12 h-6 bg-primary rounded-full relative p-1 cursor-pointer">
                       <div className="w-4 h-4 bg-white rounded-full absolute right-1 shadow-lg" />
                    </div>
                 </div>

                 <div className="flex items-center justify-between p-6 rounded-3xl bg-slate-950 border border-white/5 group hover:border-secondary/20 transition-all">
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-secondary/20 rounded-xl flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                          <Moon className="w-5 h-5" />
                       </div>
                       <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Dark Theme Protocol</span>
                    </div>
                    <div className="w-12 h-6 bg-slate-800 rounded-full relative p-1 cursor-pointer border border-white/5">
                       <div className="w-4 h-4 bg-slate-600 rounded-full absolute left-1" />
                    </div>
                 </div>

                 <div className="p-6 rounded-3xl bg-slate-950 border border-white/5 space-y-4">
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">Security Access</p>
                    <div className="flex items-center justify-between">
                       <span className="text-xs font-bold text-slate-300 uppercase tracking-widest truncate max-w-[200px]">{user?.email}</span>
                       <button className="text-[9px] font-black text-primary uppercase tracking-[0.2em] hover:text-white transition-colors">Change Authorization PIN</button>
                    </div>
                 </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full h-14 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 mt-10 hover:bg-primary-dim transition-all"
              >
                Synchronize Cloud Sync
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
