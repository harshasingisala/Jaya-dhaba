import React, { useState } from 'react';
import { auth } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import api from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Terminal, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import Loader from '../components/Loader';
import { useNavigate } from 'react-router-dom';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showWelcomeLoader, setShowWelcomeLoader] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        
        // Premium transition
        setShowWelcomeLoader(true);
        // Capturing name from Firebase user profile if available, else use email
        const displayName = userCredential.user.displayName || formData.email.split('@')[0];
        setFormData({ ...formData, name: displayName });
        
        setTimeout(() => {
          // Firebase onAuthStateChanged in AuthContext will catch this and sync state
          navigate('/dashboard');
        }, 2200); 
        
      } else {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        
        // Update Firebase profile with name
        await updateProfile(userCredential.user, {
           displayName: formData.name
        });

        // After registration, Firebase will trigger auth change, but we want to show a success message or login
        setIsLogin(true); 
        setFormData({ ...formData, password: '', confirmPassword: '' });
        alert('Welcome! Your account has been initialized. Please sign in.');
      }
    } catch (err) {
      console.error('Auth Hub Error:', err);
      setError(err.code === 'auth/user-not-found' ? 'User access not granted' : (err.message || 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  if (showWelcomeLoader) {
    return <Loader name={formData.name} />;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow" />
      <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px] animate-pulse-slow" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 bg-slate-900/50 border border-white/5 px-4 py-1.5 rounded-full backdrop-blur-sm shadow-xl">
             <Terminal className="w-4 h-4 text-primary" />
             <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest leading-none mt-0.5">Terminal Access Restricted</span>
          </div>
          <h1 className="text-4xl font-black font-headline text-white tracking-tight bg-gradient-to-r from-white via-white to-white/40 text-transparent bg-clip-text drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] truncate">
             FEEDX <span className="opacity-40">2026</span>
          </h1>
        </div>

        <div className="p-8 rounded-[40px] border border-white/10 bg-slate-900/40 backdrop-blur-3xl shadow-2xl relative">
          
          <div className="flex bg-slate-950/80 p-1.5 rounded-2xl mb-8 border border-white/5 shadow-inner">
             <button 
               onClick={() => setIsLogin(true)}
               className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${isLogin ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}`}
             >
               Sign In
             </button>
             <button 
               onClick={() => setIsLogin(false)}
               className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${!isLogin ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}`}
             >
               Register
             </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-5"
                >
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                    <input 
                      type="text" 
                      name="name"
                      placeholder="Full Name"
                      required={!isLogin}
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-600 focus:shadow-[0_0_15px_rgba(108,92,231,0.1)]"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
              <input 
                type="email" 
                name="email"
                placeholder="College Email Address"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-600 focus:shadow-[0_0_15px_rgba(108,92,231,0.1)]"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
              <input 
                type="password" 
                name="password"
                placeholder="Access Password"
                required
                value={formData.password}
                onChange={handleInputChange}
                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-600 focus:shadow-[0_0_15px_rgba(108,92,231,0.1)]"
              />
            </div>

            {!isLogin && (
              <div className="relative group animate-fade-in">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input 
                  type="password" 
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  required={!isLogin}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-600 focus:shadow-[0_0_15px_rgba(108,92,231,0.1)]"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] uppercase font-bold tracking-widest animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full h-14 bg-primary text-white rounded-2xl font-bold text-sm uppercase tracking-[0.2em] shadow-lg shadow-primary/20 flex items-center justify-center gap-3 transition-all hover:bg-primary-dim"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isMagicLink ? 'Send Magic Link' : (isLogin ? 'Grant Access' : 'Initialize Account')}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>

            {isLogin && (
              <div className="pt-4 text-center">
                <button 
                  type="button"
                  onClick={() => setIsMagicLink(!isMagicLink)}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary transition-colors"
                >
                  {isMagicLink ? 'Back to Password Login' : 'Try Passwordless (Magic Link)'}
                </button>
              </div>
            )}
          </form>

          <div className="absolute inset-x-0 -bottom-10 flex justify-center">
             <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest leading-none">
                © 2026 GEI Department of Electronics
             </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
