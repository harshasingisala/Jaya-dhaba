import { useState, useEffect } from 'react';
import api from '../api/index';
import { apiUrl } from '../api/config';
import { createManagedEventSource } from '../api/realtime';
import {
  Clock, CheckCircle, ChefHat, Flame,
  Package, MapPin, AlertCircle, Loader2, Search
} from 'lucide-react';

// ─── HOOK: paste into your existing OrderTracking component ──────────────────
export function useOrderTracking(orderId, token = '') {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setError('No order ID provided.');
      return;
    }

    // 1. Load initial order state
    setLoading(true);
    api.getOrder(orderId, token)
      .then((data) => {
        setOrder(data);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load order tracking details:', err);
        setError(err.message || 'Order not found.');
      })
      .finally(() => setLoading(false));

    // 2. Realtime updates — replaces socket.io
    const refreshOrder = () => {
      api.getOrder(orderId, token)
        .then((data) => setOrder(data))
        .catch((err) => {
          console.error('Failed to refresh order tracking details:', err);
          setError(err.message || 'Order not found.');
        });
    };
    const streamUrl = apiUrl(`/api/orders/${orderId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`);
    const stream = createManagedEventSource(streamUrl, {
      events: ['order.created', 'order.updated'],
      onRefresh: refreshOrder,
    });
    return () => stream.close();
  }, [orderId, token]);

  return { order, loading, error };
}


// ─── FULL STANDALONE PAGE COMPONENT ─────────────────────────────────────────
const STEPS = [
  { key: 'pending', label: 'Order Received', icon: Clock, desc: 'Your order has been placed.' },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle, desc: 'The restaurant confirmed your order.' },
  { key: 'preparing', label: 'In Kitchen', icon: ChefHat, desc: 'Being freshly prepared for you.' },
  { key: 'ready', label: 'Ready', icon: Flame, desc: 'Your order is ready!' },
  { key: 'served', label: 'Enjoying', icon: Package, desc: 'Enjoy your meal.' },
];

const STATUS_ORDER = STEPS.map((s) => s.key);

export function OrderTrackingPage({ orderId, token = '' }) {
  const { order, loading, error } = useOrderTracking(orderId, token);

  if (!orderId) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <Clock size={36} className="text-heritage-espresso/30" />
        <p className="text-[11px] font-black uppercase tracking-widest text-heritage-espresso/30">
          Enter an Order ID to begin tracking
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="text-heritage-espresso/30 animate-spin" />
        <p className="text-[11px] font-black uppercase tracking-widest text-heritage-espresso/30">
          Loading order…
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 px-8">
        <AlertCircle size={36} className="text-red-400" />
        <p className="text-center text-heritage-espresso/60 text-sm">
          {error || 'Order not found. Please check your order link.'}
        </p>
      </div>
    );
  }

  const normalizedStatus = String(order.status || '').toLowerCase() === 'enjoying' ? 'served' : String(order.status || '').toLowerCase();
  const currentIdx = STATUS_ORDER.indexOf(normalizedStatus);
  const isCancelled = normalizedStatus === 'cancelled';

  const items = (() => {
    try {
      return Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
    } catch (err) {
      console.error('Failed to parse tracked order items:', err);
      return [];
    }
  })();

  return (
    <div className="bg-heritage-cream pt-12 pb-12 w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40">
          Order #{String(order.id).slice(-6).toUpperCase()}
        </p>
        <h1 className="text-4xl font-serif italic text-heritage-espresso mt-1">
          {isCancelled ? 'Order Cancelled' : 'Tracking Your Order'}
        </h1>
        {order.customer_name && (
          <p className="text-sm text-heritage-espresso/50 mt-1">
            For {order.customer_name}
            {order.table_number && ` · Table ${order.table_number}`}
          </p>
        )}
      </div>

      {isCancelled && (
        <div className="mb-6 rounded-[2rem] border border-red-200 bg-red-50 p-7 text-center shadow-sm">
          <AlertCircle size={30} className="mx-auto mb-4 text-red-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-red-500">
            Order Cancelled
          </p>
          <p className="mt-3 text-2xl font-serif italic leading-tight text-heritage-espresso">
            Sorry, we are not able to serve you today.
          </p>
        </div>
      )}

      {/* Progress stepper */}
      {!isCancelled && (
        <div className="bg-white rounded-[3rem] p-8 shadow-sm ring-1 ring-heritage-espresso/5 mb-6">
          <div className="space-y-0">
            {STEPS.map((step, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              const upcoming = i > currentIdx;
              const Icon = step.icon;

              return (
                <div key={step.key} className="flex gap-4">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                      ${done ? 'bg-heritage-espresso' : ''}
                      ${active ? 'bg-heritage-gold shadow-lg shadow-heritage-gold/30 animate-pulse' : ''}
                      ${upcoming ? 'bg-heritage-stone/40' : ''}
                    `}>
                      <Icon
                        size={16}
                        className={
                          done ? 'text-white' :
                            active ? 'text-white' :
                              'text-heritage-espresso/25'
                        }
                      />
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`
                        w-0.5 h-8 my-1 transition-all duration-500
                        ${done ? 'bg-heritage-espresso' : 'bg-heritage-stone/40'}
                      `} />
                    )}
                  </div>

                  {/* Text */}
                  <div className="pb-2 pt-2.5">
                    <p className={`text-sm font-bold leading-tight ${active ? 'text-heritage-espresso' :
                      done ? 'text-heritage-espresso/60' :
                        'text-heritage-espresso/25'
                      }`}>
                      {step.label}
                    </p>
                    {active && (
                      <p className="text-[11px] text-heritage-espresso/50 mt-0.5">
                        {step.desc}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Order summary */}
      {items.length > 0 && (
        <div className="bg-white rounded-[3rem] p-8 shadow-sm ring-1 ring-heritage-espresso/5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 mb-5">
            Your Order
          </h3>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm text-heritage-espresso">
                <span>
                  {item.quantity > 1 && (
                    <span className="font-bold mr-1">{item.quantity}×</span>
                  )}
                  {item.name || item.item_name}
                </span>
                <span className="font-medium">
                  ₹{((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-heritage-espresso/10 flex justify-between font-black text-heritage-espresso">
              <span>Total</span>
              <span>₹{parseFloat(order.total_amount || 0).toFixed(0)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderTracking() {
  const [searchInput, setSearchInput] = useState("");

  return (
    <div className="max-w-2xl mx-auto px-6">
      <div className="bg-white/40 backdrop-blur-2xl rounded-[4rem] border border-heritage-espresso/5 p-12 shadow-2xl space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-5xl font-serif italic text-heritage-espresso">Heritage Tracking</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30">Locate your soul food's rhythm</p>
        </div>

        <div className="relative group">
          <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-heritage-espresso/20 group-focus-within:text-heritage-gold transition-colors" />
          <input
            className="bg-white/80 border border-heritage-espresso/5 px-16 py-6 rounded-full text-lg font-serif italic w-full focus:shadow-2xl transition-all outline-none text-heritage-espresso"
            placeholder="Enter Order ID (e.g. 123)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <OrderTrackingPage orderId={searchInput} />
      </div>

      <div className="mt-12 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-heritage-espresso/20">
          Need assistance? Connect with Sunil Behera at +91 73861 85821
        </p>
      </div>
    </div>
  );
}
