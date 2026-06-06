import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Plus, ShoppingBag } from 'lucide-react';
import api from '../../../api';
import { useApp } from '../../../context/AppContext';
import { countUp } from '../../../utils/scrollAnimations';
import ResponsiveImage from '../../../components/ResponsiveImage';
import { optimizedImage } from '../../../utils/imageAssets';

export default function DashboardHome() {
  const { restaurantId } = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ revenue: 0, orders: 0 });
  const revenueRef = useRef(null);
  const avgRef = useRef(null);
  const ordersRef = useRef(null);
  const counted = useRef(false);

  useEffect(() => {
    if (!restaurantId) return;
    const fetchData = async () => {
      try {
        const result = await api.getStats(restaurantId);
        setStats((prev) => ({ ...prev, ...result }));
      } catch (err) {
        console.error('Overview fetch failed:', err);
      }
    };

    fetchData();
    const refreshFromRealtime = () => fetchData();
    window.addEventListener('rt:orders', refreshFromRealtime);
    window.addEventListener('rt:analytics', refreshFromRealtime);
    const interval = setInterval(fetchData, 60000);
    return () => {
      window.removeEventListener('rt:orders', refreshFromRealtime);
      window.removeEventListener('rt:analytics', refreshFromRealtime);
      clearInterval(interval);
    };
  }, [restaurantId]);

  useEffect(() => {
    if (counted.current || !stats.revenue) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            counted.current = true;
            if (revenueRef.current) countUp(revenueRef.current, stats.revenue, 1500);
            if (avgRef.current) countUp(avgRef.current, Math.round((stats.revenue || 0) / Math.max(1, stats.orders || 0)), 1500);
            if (ordersRef.current) countUp(ordersRef.current, stats.orders, 1500);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );
    [revenueRef, avgRef, ordersRef].forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
  }, [stats]);

  const avgBill = Math.round((stats.revenue || 0) / Math.max(1, stats.orders || 0));

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">

      {/* Top Banner section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Welcome Card */}
        <div className="lg:col-span-2 bg-white rounded-[4rem] p-12 shadow-[0_40px_80px_rgba(74,55,40,0.06)] border border-heritage-espresso/5 relative overflow-hidden group hover:shadow-2xl transition-all duration-700">
          <div className="absolute top-0 right-0 w-64 h-64 bg-heritage-gold/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-heritage-gold/10 transition-colors" />

          <div className="relative z-10 space-y-10">
            <div className="space-y-2">
              <h2 className="text-4xl font-serif italic text-heritage-espresso">Welcome back, Sunil Behera</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Operational Monitoring Console</p>
            </div>
            <button
              onClick={() => navigate('/admin/orders?action=new-order')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-heritage-gold px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:bg-heritage-espresso"
            >
              <Plus size={16} />
              Manual Order
            </button>

            <div className="flex flex-wrap gap-16">
              <div className="space-y-2">
                <p ref={revenueRef} className="text-5xl font-serif italic text-heritage-espresso">₹{stats.revenue.toLocaleString()}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-heritage-gold">Today's Revenue • <span className="text-heritage-accent">Live</span></p>
              </div>
              <div className="space-y-2 border-l border-heritage-espresso/5 pl-16">
                <p className="text-3xl font-serif italic text-heritage-espresso/40">Rs <span ref={avgRef}>{avgBill.toLocaleString()}</span></p>
                <p className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/20">Average Bill Value</p>
              </div>
            </div>

            <div className="pt-8 border-t border-heritage-espresso/5 flex gap-12">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-heritage-stone flex items-center justify-center text-heritage-espresso">
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <p ref={ordersRef} className="text-lg font-serif italic text-heritage-espresso">{stats.orders}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-heritage-espresso/30">Total Orders</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-heritage-stone flex items-center justify-center text-heritage-espresso">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-lg font-serif italic text-heritage-espresso">{stats.total_active || 0}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-heritage-espresso/30">Active Orders</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Card / Featured */}
        <div className="bg-heritage-espresso rounded-[4rem] p-1 shadow-2xl overflow-hidden relative group h-[400px]">
          <ResponsiveImage
            src="/biryani.png"
            className="w-full h-full object-cover rounded-[3.8rem] opacity-70 group-hover:scale-110 group-hover:opacity-90 transition-all duration-1000"
            alt="Featured Item"
            loading="lazy"
            sizes="(max-width: 1024px) 100vw, 33vw"
            width="640"
            height="640"
            onError={(e) => { e.target.src = optimizedImage('/biryani.png', 640); }}
          />
          <div className="absolute inset-x-12 bottom-12 z-10 space-y-4">
            <span className="bg-heritage-gold text-white text-[9px] font-black uppercase tracking-[0.4em] px-5 py-2 rounded-full shadow-lg">Hero Choice</span>
            <h3 className="text-4xl font-serif italic text-white leading-none">Dum Biryani Heritage</h3>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">Live from the Mother Kitchen</p>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: 'Pending Orders', value: stats.pending || 0, color: 'text-orange-600', trend: 'Live', desc: 'Awaiting kitchen action' },
          { label: 'Preparing', value: stats.preparing || 0, color: 'text-red-600', trend: 'Live', desc: 'Currently in kitchen' },
          { label: 'Ready', value: stats.ready || 0, color: 'text-purple-700', trend: 'Live', desc: 'Cooked and awaiting service' },
          { label: 'Enjoying', value: stats.served || 0, color: 'text-heritage-gold', trend: 'Live', desc: 'Marked as guest enjoying' },
          { label: 'System Status', value: 'Live', color: 'text-heritage-accent', trend: 'Online', desc: 'Backend order ledger active' }
        ].map((item, i) => (
          <div key={i} className="bg-white/40 backdrop-blur-md p-10 rounded-[3.5rem] border border-heritage-espresso/5 group hover:bg-white hover:shadow-2xl transition-all cursor-pointer space-y-6">
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20 mb-4">{item.label}</p>
            <div className="flex justify-between items-end">
              <h4 className={`text-5xl font-serif italic ${item.color}`}>{item.value}</h4>
              <span className="text-[10px] font-bold text-heritage-espresso/40 mb-2">{item.trend}</span>
            </div>
            <p className="text-[9px] font-bold text-heritage-espresso/30 uppercase tracking-widest pt-4 border-t border-heritage-espresso/5">{item.desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
