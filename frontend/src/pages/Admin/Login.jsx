import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import PageMeta from '../../components/SEO/PageMeta';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    login: '',
    password: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      
      localStorage.setItem('admin_token', res.access_token);
      login({ ...res.user, access_token: res.access_token });
      showToast('🔑 Access granted. Welcome back.', 'success');
      navigate('/admin');
    } catch (err) {
      console.error('[JAYA_DEBUG] Caught error in handleSubmit:', err);
      showToast('❌ Identity verification failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-10 relative overflow-hidden heritage-stone-bg">
      <PageMeta
        title="Admin Login"
        description="Jaya Dhaba private admin login."
        url="/admin/login"
        robots="noindex, nofollow"
      />
      
      {/* Background Aura */}
      <div className="absolute inset-0 bg-gradient-to-tr from-heritage-terracotta/5 via-transparent to-heritage-gold/5 pointer-events-none" />
      <div className="absolute w-[1000px] h-[1000px] bg-heritage-gold/5 blur-[200px] rounded-full -z-10" />

      <div className="max-w-md w-full space-y-12">
        
        <div className="text-center space-y-6">
           <div 
             onClick={() => navigate('/')}
             className="font-serif text-5xl italic cursor-pointer text-heritage-espresso flex items-center justify-center gap-4 group mx-auto"
           >
             Jaya <span className="text-heritage-gold">Dhaba</span>
           </div>
           <p className="text-[10px] font-black uppercase tracking-[0.6em] text-heritage-espresso/30">Restricted Access Entry</p>
        </div>

        <div className="bg-white p-12 rounded-[4rem] border border-heritage-espresso/5 shadow-[0_40px_80px_rgba(74,55,40,0.08)] space-y-10">
           <div className="space-y-2 text-center">
             <h2 className="text-3xl font-serif italic text-heritage-espresso leading-none">Authentication</h2>
             <p className="text-heritage-espresso/40 italic text-sm font-medium">Verify your presence at the hearth.</p>
           </div>

           <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6">Identification</label>
                 <div className="relative">
                   <User className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/30" size={16} />
                   <input 
                     type="text" 
                     required
                     value={formData.login}
                     onChange={e => setFormData({...formData, login: e.target.value})}
                     className="w-full bg-heritage-stone/50 border border-heritage-espresso/5 pl-14 pr-8 py-5 rounded-3xl text-sm font-bold focus:bg-white focus:border-heritage-gold outline-none transition-all placeholder:text-heritage-espresso/20 text-heritage-espresso"
                     placeholder="Admin Handle"
                   />
                 </div>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 pl-6">Cypher</label>
                 <div className="relative">
                   <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/30" size={16} />
                   <input 
                     type="password" 
                     required
                     value={formData.password}
                     onChange={e => setFormData({...formData, password: e.target.value})}
                     className="w-full bg-heritage-stone/50 border border-heritage-espresso/5 pl-14 pr-8 py-5 rounded-3xl text-sm font-bold focus:bg-white focus:border-heritage-gold outline-none transition-all placeholder:text-heritage-espresso/20 text-heritage-espresso"
                     placeholder="••••••••"
                   />
                 </div>
              </div>

              <button 
                disabled={loading}
                className="w-full py-6 bg-heritage-terracotta text-white rounded-[2.5rem] font-black text-[10px] uppercase tracking-[0.4em] hover:bg-heritage-espresso transition-all shadow-xl active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50 border-none cursor-pointer"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Enter Sanctuary'}
                {!loading && <ArrowRight size={14} />}
              </button>
           </form>

           <p className="text-center text-[9px] font-black uppercase tracking-widest text-heritage-espresso/20">Lost your keys? Contact the Master Chef.</p>
        </div>

      </div>
    </div>
  );
}
