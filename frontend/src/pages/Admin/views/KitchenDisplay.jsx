import React, { useEffect, useMemo, useState } from 'react';
import api from '../../../api';
import { usePollingFallback } from '../../../hooks/usePollingFallback';

function parseServerTime(value) {
  if (!value) return null;
  const text = String(value);
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
}

function elapsed(from, now) {
  const start = parseServerTime(from);
  if (!start) return '0m';
  const mins = Math.max(0, Math.floor((now - start) / 60000));
  return `${mins}m`;
}

function itemsText(order) {
  return (order.items || []).map((item) => `${item.qty || item.quantity || 1}x ${item.name}`).join(', ');
}

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    const data = await api.getOrders();
    setOrders(data
      .filter((order) => ['pending', 'preparing', 'Placed', 'Preparing'].includes(order.status))
      .sort((a, b) => (parseServerTime(b.created_at) || 0) - (parseServerTime(a.created_at) || 0)));
    setLoading(false);
  };

  useEffect(() => {
    document.title = 'Kitchen Display — Jaya Dhaba';
    fetchOrders();
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.action === 'new_order') playChime();
      fetchOrders();
    };
    window.addEventListener('rt:orders', handler);
    return () => window.removeEventListener('rt:orders', handler);
  }, []);

  usePollingFallback(fetchOrders, 15000);

  const visible = useMemo(() => orders.filter((order) => {
    const status = String(order.status || '').toLowerCase();
    return status === 'pending' || status === 'placed' || status === 'preparing';
  }), [orders]);

  const markServed = async (id) => {
    const previous = orders;
    setOrders((current) => current.filter((order) => order.id !== id));
    try {
      await api.updateOrderStatus(id, 'served');
    } catch {
      setOrders(previous);
    }
  };

  const ageBorder = (order) => {
    const createdAt = parseServerTime(order.created_at);
    const mins = createdAt ? Math.floor((now - createdAt) / 60000) : 0;
    if (mins >= 20) return 'border-red-500';
    if (mins >= 10) return 'border-amber-400';
    return 'border-green-500';
  };

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-5xl font-serif italic text-heritage-espresso">Kitchen Display</h1>
        <p className="text-xl font-black text-heritage-gold">{visible.length} live</p>
      </div>
      {loading ? (
        <div className="h-[70vh] grid place-items-center text-4xl font-serif italic text-heritage-espresso/30">Loading kitchen orders...</div>
      ) : visible.length === 0 ? (
        <div className="h-[70vh] grid place-items-center text-4xl font-serif italic text-heritage-espresso/30">Kitchen is clear 🎉</div>
      ) : (
        <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visible.map((order) => {
            const status = String(order.status || '').toLowerCase() === 'preparing' ? 'preparing' : 'pending';
            const ref = status === 'preparing' ? order.preparing_at || order.created_at : order.created_at;
            return (
              <article key={order.id} className={`rounded-3xl p-6 shadow-xl border-4 ${status === 'preparing' ? 'bg-blue-50' : 'bg-amber-50'} ${ageBorder(order)}`}>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-4xl font-black">#{order.order_number || String(order.id).slice(0, 8)}</h2>
                  <span className="text-lg font-black uppercase">{elapsed(ref, now)}</span>
                </div>
                <p className="mt-5 text-2xl font-serif italic text-heritage-espresso">{itemsText(order)}</p>
                <button onClick={() => markServed(order.id)} className="mt-8 min-h-[44px] w-full py-4 rounded-2xl bg-heritage-espresso text-white text-xl font-black uppercase">
                  Mark Enjoying
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {
    // Ignore browsers that block audio before user interaction.
  }
}
