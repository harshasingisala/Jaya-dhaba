import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { TrendingUp, Download, PieChart, Info, ArrowUpRight } from 'lucide-react';
import api from '../../../api';
import AnalyticsActions from './AnalyticsActions';
import { usePollingFallback } from '../../../hooks/usePollingFallback';

const buildTrajectory = (stats) => {
  const orders = Number(stats?.total_orders || stats?.orders || 0);
  const revenue = Number(stats?.revenue || 0);
  return [
    { time: 'Open', orders: 0, revenue: 0 },
    { time: 'Now', orders, revenue },
  ];
};

const normalizeStats = (stats = {}) => ({
  revenue: Number(stats.revenue || 0),
  orders: Number(stats.orders || stats.total_orders || 0),
  total_orders: Number(stats.total_orders || stats.orders || 0),
  top_item: stats.top_item || 'No orders yet',
  top_item_qty: Number(stats.top_item_qty || 0),
  top_items: Array.isArray(stats.top_items) ? stats.top_items : [],
  trajectory: Array.isArray(stats.trajectory) ? stats.trajectory : buildTrajectory(stats),
});

const formatRs = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function AnalyticsView() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Analytics — Jaya Dhaba Admin';
    fetchAnalytics();
  }, []);

  useEffect(() => {
    const handler = () => fetchAnalytics();
    window.addEventListener('rt:analytics', handler);
    return () => window.removeEventListener('rt:analytics', handler);
  }, []);

  usePollingFallback(fetchAnalytics, 30000);

  async function fetchAnalytics() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getStats();
      setData(normalizeStats(result));
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics. The ledger is momentarily out of reach.');
    } finally {
      setIsLoading(false);
    }
  }

  async function resetTodayView() {
    await fetchAnalytics();
  }

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

  if (isLoading) {
    return (
      <div className="h-[60svh] flex flex-col items-center justify-center space-y-6">
        <div className="w-16 h-16 border-4 border-heritage-gold/20 border-t-heritage-gold rounded-full animate-spin" />
        <p className="text-xl font-serif italic text-heritage-espresso/40 animate-pulse">Loading live analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[60svh] flex flex-col items-center justify-center space-y-8 text-center px-6">
        <div className="space-y-4">
          <h3 className="text-2xl font-serif italic text-heritage-espresso">Analytics Unavailable</h3>
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
  }

  const d = data || normalizeStats();
  const averageOrderValue = d.total_orders > 0 ? Math.round(d.revenue / d.total_orders) : 0;
  const topItemData = d.top_items.length ? d.top_items.slice(0, 5) : [{ name: d.top_item, qty: d.top_item_qty }];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div className="space-y-6">
          <h2 className="text-4xl font-serif italic text-heritage-espresso leading-none">Heritage Analytics</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Live business intelligence from the order ledger</p>
        </div>
        <button onClick={handleDownloadLedger} className="bg-white border border-heritage-espresso/10 text-heritage-espresso/40 hover:text-heritage-espresso px-10 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.4em] transition-all flex items-center gap-4 group hover:shadow-xl">
          <Download size={16} className="group-hover:translate-y-1 transition-transform" />
          Download Ledger
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: 'Live Revenue', value: formatRs(d.revenue), icon: <TrendingUp size={20} />, trend: 'Live', color: 'text-heritage-gold' },
          { label: 'Platform Orders', value: d.total_orders || d.orders || 0, icon: <ArrowUpRight size={20} />, trend: 'Live', color: 'text-heritage-accent' },
          { label: 'Top Item', value: d.top_item, icon: <Info size={20} />, trend: `${d.top_item_qty} sold`, color: 'text-sky-600' },
          { label: 'Avg Order Value', value: formatRs(averageOrderValue), icon: <PieChart size={20} />, trend: 'Computed', color: 'text-heritage-espresso' },
        ].map((item) => (
          <div key={item.label} className="bg-white/40 backdrop-blur-md p-10 rounded-[3.5rem] border border-heritage-espresso/5 shadow-xl group hover:bg-white transition-all">
            <div className="flex justify-between items-start mb-8">
              <div className={`w-14 h-14 rounded-2xl bg-heritage-stone flex items-center justify-center ${item.color} shadow-inner`}>
                {item.icon}
              </div>
              <span className="text-[9px] font-black uppercase px-3 py-1 bg-heritage-stone rounded-full text-heritage-espresso/30 tracking-widest">{item.trend}</span>
            </div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20 mb-3">{item.label}</p>
            <h4 className="text-3xl font-serif italic text-heritage-espresso break-words">{item.value}</h4>
          </div>
        ))}
      </div>

      <AnalyticsActions onRefresh={fetchAnalytics} onResetView={resetTodayView} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 bg-white/40 backdrop-blur-md rounded-[4rem] p-12 border border-heritage-espresso/5 shadow-2xl space-y-10">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-serif italic text-heritage-espresso">Order Trajectory</h3>
            <span className="text-[9px] font-black uppercase tracking-widest text-heritage-gold flex items-center gap-2">
              <span className="w-2 h-2 bg-heritage-gold rounded-full" /> Today
            </span>
          </div>
          <div className="h-80 w-full">
            {d.trajectory.length === 0 ? (
              <div className="h-full grid place-items-center text-xl font-serif italic text-heritage-espresso/35">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.trajectory}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#B3541E" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#B3541E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EAE5DD" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4A372833' }} dy={20} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#4A372833' }} dx={-10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#f1ebe3', border: 'none', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                  itemStyle={{ color: '#4A3728', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="orders" stroke="#B3541E" strokeWidth={4} fillOpacity={1} fill="url(#colorVal)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-10">
          <div className="bg-heritage-espresso rounded-[4rem] p-12 text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
            <h3 className="text-2xl font-serif italic mb-10 relative z-10">Top Seller</h3>
            <div className="h-64 w-full relative z-10">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topItemData}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 900, fill: '#FFFFFF66' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontWeight: 900, fill: '#FFFFFF66' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#f1ebe3', border: 'none', borderRadius: '18px' }}
                    itemStyle={{ color: '#4A3728', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="qty" fill="#F59E0B" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-heritage-stone/40 p-12 rounded-[4rem] border border-heritage-espresso/5 shadow-xl space-y-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">Service Insight</p>
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">Top 5 Items Today</p>
              {topItemData.filter((item) => item.qty > 0).length === 0 ? (
                <p className="text-sm font-serif italic text-heritage-espresso/45">No items sold yet today.</p>
              ) : topItemData.slice(0, 5).map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-4 text-sm font-bold text-heritage-espresso/65">
                  <span>{item.name}</span>
                  <span>{item.qty}</span>
                </div>
              ))}
            </div>
            <p className="text-sm font-serif italic text-heritage-espresso/60 leading-relaxed">
              Current live ledger shows {d.total_orders} orders, revenue of {formatRs(d.revenue)}, and {d.top_item_qty} sold for {d.top_item}. Keep this panel open during service and export the ledger after the rush.
            </p>
            <button onClick={handleDownloadLedger} className="text-[10px] font-black uppercase tracking-[0.2em] text-heritage-gold hover:text-heritage-espresso transition-colors">Generate Full Report</button>
          </div>
        </div>
      </div>
    </div>
  );
}
