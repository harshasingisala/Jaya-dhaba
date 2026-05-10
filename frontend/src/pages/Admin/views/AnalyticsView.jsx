import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell 
} from 'recharts';
import { TrendingUp, Download, PieChart, Info, ArrowUpRight } from 'lucide-react';
import api from '../../../api';
import AnalyticsActions from './AnalyticsActions';

export default function AnalyticsView() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getStats(); 
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics. The ledger is momentarily out of reach.');
    } finally {
      setIsLoading(false);
    }
  };
  const handleDownloadLedger = async () => {
    try {
      const payload = await api.exportAnalytics();
      const rows = payload.closures || [];
      const header = 'closed_at,revenue,orders,created_by\n';
      const body = rows.map((r) => `${r.closed_at},${r.revenue},${r.orders},${r.created_by ?? ''}`).join('\n');
      const blob = new Blob([header + body], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jaya_dhaba_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (_err) {
      alert('Failed to export analytics. Please verify admin access.');
    }
  };

  if (isLoading) return (
     <div className="h-[60svh] flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 border-4 border-heritage-gold/20 border-t-heritage-gold rounded-full animate-spin" />
        <p className="text-xl font-serif italic text-heritage-espresso/40 animate-pulse">Sifting Through the Harvest...</p>
     </div>
  );

  if (error) return (
    <div className="h-[60svh] flex flex-col items-center justify-center space-y-8 text-center px-6">
       <div className="space-y-4">
          <h3 className="text-2xl font-serif italic text-heritage-espresso">Momentary Disruption</h3>
          <p className="text-sm font-medium text-heritage-espresso/60 max-w-md mx-auto">{error}</p>
       </div>
       <button 
         onClick={fetchAnalytics}
         className="px-10 py-4 bg-heritage-espresso text-white rounded-full text-[10px] font-black uppercase tracking-[0.4em] shadow-xl hover:bg-heritage-gold transition-all"
       >
          Retry Connection
       </button>
    </div>
  );

  const d = data || { revenue: 0, orders: 0, growth: 'N/A', trajectory: [] };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
         <div className="space-y-6">
            <h2 className="text-4xl font-serif italic text-heritage-espresso leading-none">Heritage Analytics</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Decrypting Business Intelligence & Live Flow</p>
         </div>
         <button onClick={handleDownloadLedger} className="bg-white border border-heritage-espresso/10 text-heritage-espresso/40 hover:text-heritage-espresso px-10 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.4em] transition-all flex items-center gap-4 group hover:shadow-xl">
            <Download size={16} className="group-hover:translate-y-1 transition-transform" />
            Download Ledger
         </button>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
         {[
           { label: 'Weekly Revenue', value: `₹${Number(d.revenue || 0).toLocaleString()}`, icon: <TrendingUp size={20} />, trend: 'Live', color: 'text-heritage-gold' },
           { label: 'Platform Orders', value: d.total_orders || d.orders || 0, icon: <ArrowUpRight size={20} />, trend: 'Live', color: 'text-heritage-accent' },
           { label: 'Kitchen Velocity', value: 'N/A', icon: <Info size={20} />, trend: 'No timer feed', color: 'text-sky-600' },
           { label: 'Dine-in Mix', value: 'N/A', icon: <PieChart size={20} />, trend: 'No table feed', color: 'text-heritage-espresso' },
         ].map((item, i) => (
           <div key={i} className="bg-white/40 backdrop-blur-md p-10 rounded-[3.5rem] border border-heritage-espresso/5 shadow-xl group hover:bg-white transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-8">
                <div className={`w-14 h-14 rounded-2xl bg-heritage-stone flex items-center justify-center ${item.color} shadow-inner`}>
                   {item.icon}
                </div>
                <span className="text-[9px] font-black uppercase px-3 py-1 bg-heritage-stone rounded-full text-heritage-espresso/30 tracking-widest">{item.trend}</span>
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20 mb-3">{item.label}</p>
              <h4 className="text-4xl font-serif italic text-heritage-espresso">{item.value}</h4>
           </div>
         ))}
      </div>

      <AnalyticsActions onFlushSuccess={fetchAnalytics} />

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
         
         <div className="xl:col-span-2 bg-white/40 backdrop-blur-md rounded-[4rem] p-12 border border-heritage-espresso/5 shadow-2xl space-y-10">
            <div className="flex justify-between items-center">
               <h3 className="text-2xl font-serif italic text-heritage-espresso">Order Trajectory</h3>
               <div className="flex gap-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-heritage-gold flex items-center gap-2">
                     <span className="w-2 h-2 bg-heritage-gold rounded-full" /> Today
                  </span>
               </div>
            </div>
            <div className="h-80 w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={d.trajectory || [
                    { time: '10am', value: 10 }, { time: '12pm', value: 35 }, { time: '2pm', value: 20 },
                    { time: '4pm', value: 15 }, { time: '6pm', value: 45 }, { time: '8pm', value: 60 }, { time: '10pm', value: 30 }
                  ]}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#B3541E" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#B3541E" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE5DD" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4A372833' }} dy={20} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4A372833' }} dx={-10} />
                    <Tooltip 
                      contentStyle={{ background: '#f1ebe3', border: 'none', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                      itemStyle={{ color: '#4A3728', fontSize: '12px', fontWeight: 'bold' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#B3541E" strokeWidth={4} fillOpacity={1} fill="url(#colorVal)" />
                  </AreaChart>
               </ResponsiveContainer>
            </div>
         </div>

         <div className="space-y-10">
            <div className="bg-heritage-espresso rounded-[4rem] p-12 text-white shadow-2xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
               <h3 className="text-2xl font-serif italic mb-10 relative z-10">Payment Analysis</h3>
               <div className="space-y-8 relative z-10">
                  <div className="space-y-3">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Digital Assets</span>
                        <span>74%</span>
                     </div>
                     <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-heritage-gold w-[74%] rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
                     </div>
                  </div>
                  <div className="space-y-3">
                     <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/40">
                        <span>Physical Cash</span>
                        <span>26%</span>
                     </div>
                     <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-white/40 w-[26%] rounded-full" />
                     </div>
                  </div>
               </div>
            </div>

            <div className="bg-heritage-stone/40 p-12 rounded-[4rem] border border-heritage-espresso/5 shadow-xl space-y-6">
               <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">AI Strategy Insight</p>
               <p className="text-sm font-serif italic text-heritage-espresso/60 leading-relaxed">
                  "Peak demand shifting towards 8:30 PM. Increase tandoor hydration levels by 15% during 7:00 PM pre-fire. Digital payments are at an all-time high—recommend implementing tableside QR codes."
               </p>
               <button onClick={handleDownloadLedger} className="text-[10px] font-black uppercase tracking-[0.2em] text-heritage-gold hover:text-heritage-espresso transition-colors">Generate Full Report →</button>
            </div>
         </div>

      </div>

    </div>
  );
}
