import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Activity, Sparkles, ChefHat, ReceiptText,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../../../context/AppContext';
import { RefreshCw, Loader2 } from 'lucide-react';
import api from '../../../api';

const DEFAULT_TREND = Array.from({ length: 8 }, (_, index) => {
  const hour = (new Date().getHours() - 7 + index + 24) % 24;
  return { time: `${hour.toString().padStart(2, '0')}:00`, sales: 0, orders: 0 };
});

export default function RevenueCommandCenter() {
  const { restaurantId } = useApp();
  const [stats, setStats] = useState({ revenue: 0, orders: 0, avgOrderValue: 0, activeOrders: 0 });
  const [trendData, setTrendData] = useState(DEFAULT_TREND);
  const [health, setHealth] = useState({ db: 'checking', api: 'checking', storage: 'unknown', security: 'unknown', lastCheck: null });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (!restaurantId) return;
    loadSnapshot();
    loadHealth();
  }, [restaurantId, fromDate, toDate]);

  const loadSnapshot = async () => {
    try {
      const snapshot = await fetchTodaySnapshot(restaurantId, { from_date: fromDate, to_date: toDate });
      setStats((prev) => ({
        ...prev,
        revenue: snapshot.completedRevenue,
        orders: snapshot.totalOrders,
        avgOrderValue: snapshot.avgOrderValue,
        activeOrders: snapshot.pendingOrders + snapshot.preparingOrders,
      }));
      setTrendData(snapshot.trendData || DEFAULT_TREND);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[RevenueCommandCenter] failed to fetch snapshot', err);
    }
  };

  const loadHealth = async () => {
    try {
      const status = await api.request('/api/health');
      setHealth({
        db: status.status === 'ok' ? 'online' : 'degraded',
        api: 'online',
        storage: 'via api',
        security: 'enforced',
        lastCheck: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      console.error('[JAYA_DEBUG] Caught error in loadHealth:', err);
      setHealth({
        db: 'unknown',
        api: 'down',
        storage: 'via api',
        security: 'unknown',
        lastCheck: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      });
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-1000">

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-heritage-espresso/5 pb-12">
        <div className="space-y-2">
          <p className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px]">Financial Intelligence</p>
          <h2 className="text-6xl font-serif italic text-heritage-espresso leading-none">Revenue <span className="text-heritage-gold">Command Center</span></h2>
        </div>
        <div className="flex gap-4">
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="px-4 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-heritage-espresso/5 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/50 outline-none"
            aria-label="Revenue from date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="px-4 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-heritage-espresso/5 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/50 outline-none"
            aria-label="Revenue to date"
          />
          <div className="px-6 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-heritage-espresso/5 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${health.api === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">API {health.api}</span>
          </div>
        </div>
      </div>

      {/* TOP METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <MetricCard
          icon={<DollarSign className="text-heritage-gold" />}
          label="Gross Revenue"
          value={`₹${stats.revenue.toLocaleString()}`}
          trend="Live"
          up={true}
        />
        <MetricCard
          icon={<ShoppingBag className="text-heritage-accent" />}
          label="Total Volume"
          value={stats.orders}
          trend="Live"
          up={true}
        />
        <MetricCard
          icon={<ReceiptText className="text-orange-500" />}
          label="Average Bill"
          value={`Rs ${stats.avgOrderValue || 0}`}
          trend="Live"
          up={true}
        />
        <MetricCard
          icon={<ChefHat className="text-green-500" />}
          label="Active Kitchen"
          value={stats.activeOrders || 0}
          trend="Live"
          up={true}
        />
      </div>

      {/* MAIN CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* REVENUE TREND */}
        <div className="lg:col-span-2 bg-white rounded-[4rem] p-12 shadow-2xl border border-heritage-espresso/5 space-y-10">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-3xl font-serif italic text-heritage-espresso">Sales Velocity</h3>
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-heritage-espresso/25">
                {fromDate || toDate ? 'Selected range' : 'Today'} revenue and order flow
              </p>
            </div>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4A017" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#D4A017" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#bbb' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#bbb' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1A0F0A', border: 'none', borderRadius: '20px', padding: '15px' }}
                  itemStyle={{ color: '#D4A017', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }}
                  labelStyle={{ color: '#EAE5DD', fontSize: '12px', fontFamily: 'serif', marginBottom: '5px' }}
                />
                <Area type="monotone" dataKey="sales" name="Revenue" stroke="#D4A017" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="orders" name="Orders" stroke="#16A34A" strokeWidth={2} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SYSTEM HEALTH & BRIEFING */}
        <div className="space-y-8">

          {/* DAILY BRIEFING */}
          <AIBriefingCard restaurantId={restaurantId} restaurantName="Sunil's" />

          {/* HEALTH MONITOR */}
          <div className="bg-white/40 backdrop-blur-xl rounded-[3.5rem] p-10 border border-heritage-espresso/5 space-y-8">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-heritage-espresso/30">Infrastructure Health</h4>
            <div className="space-y-4">
              <HealthRow label="Database Engine" status={health.db} />
              <HealthRow label="Core API Layer" status={health.api} />
              <HealthRow label="Cloud Storage" status={health.storage} />
              <HealthRow label="Security Mesh" status={health.security} />
            </div>
            <div className="pt-6 border-t border-heritage-espresso/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={12} className="text-heritage-gold" />
                <span className="text-[9px] font-black text-heritage-espresso">Health probe only</span>
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-heritage-espresso/20">Last Check: {health.lastCheck || 'pending'}</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

function MetricCard({ icon, label, value, trend, up }) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="bg-white/40 backdrop-blur-xl p-10 rounded-[3.5rem] border border-heritage-espresso/5 hover:bg-white hover:shadow-2xl transition-all duration-500 cursor-pointer space-y-6 group"
    >
      <div className="flex justify-between items-start">
        <div className="w-14 h-14 rounded-3xl bg-heritage-stone flex items-center justify-center transition-transform group-hover:scale-110 duration-500">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-black ${up ? 'text-green-500' : 'text-red-500'}`}>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <div className="space-y-1">
        <h4 className="text-5xl font-serif italic text-heritage-espresso">{value}</h4>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">{label}</p>
      </div>
    </motion.div>
  );
}

function HealthRow({ label, status }) {
  const healthy = ['online', 'configured', 'enforced'].includes(status);
  const unknown = ['checking', 'unknown', 'not configured'].includes(status);
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] font-bold text-heritage-espresso/60">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-[8px] font-black uppercase tracking-widest text-heritage-espresso/20">{status}</span>
        <div className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-green-500' : unknown ? 'bg-yellow-500' : 'bg-red-500'}`} />
      </div>
    </div>
  );
}

// ─── Fetch real today's data from Supabase ────────────────────────────────────
async function fetchTodaySnapshot(restaurantId, dateRange = {}) {
  const today = new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
  const range = dateRange.from_date || dateRange.to_date
    ? dateRange
    : { from_date: today, to_date: today };
  const [stats, orders, revenue] = await Promise.all([
    api.getAdminStats(),
    api.getOrders(),
    api.getRevenue(range),
  ]);
  const daily = Array.isArray(revenue?.daily) ? revenue.daily : [];
  const completedRevenue = daily.length > 0
    ? daily.reduce((sum, row) => sum + Number(row.revenue || 0), 0)
    : Number(stats.revenue || 0);
  const totalOrders = Number(stats.orders || orders.length || 0);

  return {
    totalOrders,
    completedRevenue,
    topItems: Array.isArray(stats.top_items) ? stats.top_items.map((item) => ({
      name: item.name,
      count: item.qty || item.count || 0,
    })) : [],
    pendingOrders: orders.filter((o) => o.status === 'Placed' || o.status === 'Confirmed').length,
    preparingOrders: orders.filter((o) => o.status === 'Preparing').length,
    avgOrderValue: totalOrders > 0 ? Math.round(completedRevenue / totalOrders) : 0,
    trendData: daily.length > 0
      ? daily.slice().reverse().map((row) => ({ time: row.label, sales: Number(row.revenue || 0), orders: Number(row.orders || 0) }))
      : DEFAULT_TREND,
  };
}

// ─── Call /api/jaya-concierge ─────────────────────────────────────────────────
function localBusinessInsight(snapshot, mode = 'brief') {
  const topItem = snapshot.topItems?.[0]?.name || 'the current best seller';
  const activeOrders = snapshot.pendingOrders + snapshot.preparingOrders;
  if (mode === 'brief') {
    if (snapshot.totalOrders === 0) {
      return "No orders are recorded yet today. Keep the kitchen ready and push today's hero items once the first rush begins.";
    }
    return `Today has ${snapshot.totalOrders} orders with Rs ${snapshot.completedRevenue.toFixed(0)} revenue and an average bill of Rs ${snapshot.avgOrderValue}. Keep ${topItem} visible and nudge add-ons while ${activeOrders} orders are active.`;
  }
  if (snapshot.totalOrders === 0) {
    return "Performance summary: no orders are recorded yet today. What is working well: the system is ready and live. Act now: feature a strong starter or biryani offer on manual and online channels. Upsell suggestion: pair the first few orders with beverages or desserts to lift average bill value.";
  }
  return `Performance summary: ${snapshot.totalOrders} orders have generated Rs ${snapshot.completedRevenue.toFixed(0)} today, with an average bill of Rs ${snapshot.avgOrderValue}. What is working well: ${topItem} is leading demand. Act now: keep prep focused because ${activeOrders} orders are active. Upsell suggestion: pair ${topItem} with beverages, breads, or dessert to raise every bill.`;
}

async function callJaya(snapshot, restaurantName, mode = 'brief') {
  const topItemsList = snapshot.topItems.length > 0
    ? snapshot.topItems.map(i => `${i.name} (${i.count} orders)`).join(', ')
    : 'No data yet';

  const prompt = mode === 'brief'
    ? `You are Jaya, the AI concierge for ${restaurantName}. Give a 2-sentence sharp business briefing for the restaurant owner based on today's live data:
- Total orders today: ${snapshot.totalOrders}
- Revenue (completed orders): ₹${snapshot.completedRevenue.toFixed(0)}
- Average order value: ₹${snapshot.avgOrderValue}
- Top items: ${topItemsList}
- Currently pending: ${snapshot.pendingOrders}, preparing: ${snapshot.preparingOrders}

Be specific, use the actual numbers. Give one concrete recommendation. Keep it under 40 words. No greetings.`
    : `You are Jaya, the AI concierge for ${restaurantName}. Create a full operational briefing for the restaurant owner:
- Total orders today: ${snapshot.totalOrders}
- Revenue (completed orders): ₹${snapshot.completedRevenue.toFixed(0)}  
- Average order value: ₹${snapshot.avgOrderValue}
- Top items today: ${topItemsList}
- Currently pending: ${snapshot.pendingOrders}, preparing: ${snapshot.preparingOrders}

Provide: (1) Performance summary, (2) What's working well, (3) One thing to act on now, (4) Upsell suggestion based on top items. Use actual numbers. Be direct. 80–100 words.`;

  try {
    const data = await api.request('/api/jaya-concierge', {
      method: 'POST',
      body: JSON.stringify({ message: prompt }),
    });
    const text = (
      data.message ||
      data.reply ||
      data.response ||
      data.text ||
      (Array.isArray(data.content) ? data.content.map(b => b.text || '').join('') : '')
    );
    return text || localBusinessInsight(snapshot, mode);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[AIBriefingCard fallback]', err);
    return localBusinessInsight(snapshot, mode);
  }
}

// ─── THE COMPONENT ────────────────────────────────────────────────────────────
export function AIBriefingCard({ restaurantId, restaurantName = 'your restaurant' }) {
  const [insight, setInsight] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const generateInsight = React.useCallback(async (mode = 'brief') => {
    setLoading(true);
    setError(false);
    try {
      const snap = await fetchTodaySnapshot(restaurantId);
      setSnapshot(snap);
      const text = await callJaya(snap, restaurantName, mode);
      setInsight(text);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AIBriefingCard]', err);
      setError(true);
      setInsight('');
    } finally {
      setLoading(false);
    }
  }, [restaurantId, restaurantName]);

  // Auto-generate on mount and every 5 minutes
  useEffect(() => {
    generateInsight('brief');
    const interval = setInterval(() => generateInsight('brief'), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [generateInsight]);

  return (
    <div className="bg-heritage-espresso rounded-[4rem] p-10 text-white shadow-2xl relative overflow-hidden group">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-heritage-gold/10 rounded-full -mr-10 -mt-10 blur-2xl" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-8 -mb-8 blur-2xl" />

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-heritage-gold flex items-center justify-center text-white shadow-lg shadow-heritage-gold/20">
              <Sparkles size={18} />
            </div>
            <div>
              <h4 className="text-xl font-serif italic">Jaya's Briefing</h4>
              <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mt-0.5">
                AI · Live data
              </p>
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={() => generateInsight('brief')}
            disabled={loading}
            className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40"
            title="Refresh briefing"
          >
            <RefreshCw size={13} className={`text-white/40 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quick stats row */}
        {snapshot && !loading && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Orders', value: snapshot.totalOrders },
              { label: 'Revenue', value: `₹${snapshot.completedRevenue >= 1000 ? (snapshot.completedRevenue / 1000).toFixed(1) + 'k' : snapshot.completedRevenue.toFixed(0)}` },
              { label: 'Avg', value: `₹${snapshot.avgOrderValue}` },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/5 rounded-2xl px-3 py-2.5 text-center">
                <p className="text-white font-black text-base">{stat.value}</p>
                <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold mt-0.5">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Insight text */}
        <div className="min-h-[48px]">
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={13} className="text-heritage-gold animate-spin" />
              <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                Analysing today's data…
              </span>
            </div>
          ) : error ? (
            <p className="text-[11px] text-white/40 leading-relaxed">
              Could not connect to Jaya. Check that{' '}
              <code className="text-heritage-gold">/api/jaya-concierge</code> is running.
            </p>
          ) : (
            <p className="text-[11px] text-white/70 leading-relaxed font-medium">
              {insight}
            </p>
          )}
        </div>

        {/* Top item quick badge */}
        {snapshot?.topItems?.[0] && !loading && (
          <div className="flex items-center gap-2">
            <TrendingUp size={11} className="text-heritage-gold" />
            <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">
              Top today:
            </span>
            <span className="text-[10px] text-heritage-gold font-black">
              {snapshot.topItems[0].name}
            </span>
            <span className="text-[9px] text-white/30">
              ({snapshot.topItems[0].count} orders)
            </span>
          </div>
        )}

        {/* Full report button */}
        <button
          onClick={() => generateInsight('full')}
          disabled={loading}
          className="w-full py-4 bg-white/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-heritage-gold transition-all border border-white/5 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          Generate Full AI Report
        </button>
      </div>
    </div>
  );
}
