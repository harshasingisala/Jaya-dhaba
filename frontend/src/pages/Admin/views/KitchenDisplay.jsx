import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../api';
import { createTicketedEventSource } from '../../../api/realtime';
import { usePollingFallback } from '../../../hooks/usePollingFallback';
import { installAdminAudioUnlock, playNewOrderSound, playWaiterCallSound } from '../../../utils/adminAudio';

const ITEM_STATUS_ORDER = ['pending', 'preparing', 'ready'];
const ITEM_STATUS_LABELS = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
};
const ITEM_STATUS_CLASSES = {
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  preparing: 'bg-amber-100 text-amber-800 border-amber-300',
  ready: 'bg-green-100 text-green-800 border-green-300',
};
const WAITER_REASON_LABELS = {
  need_assistance: 'Need assistance',
  need_water: 'Need water',
  have_question: 'Have a question',
  requesting_bill: 'Request bill',
};

function parseServerTime(value) {
  if (!value) return null;
  const text = String(value);
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
}

function elapsed(from, now) {
  const start = parseServerTime(from);
  if (!start) return '0m ago';
  const mins = Math.max(0, Math.floor((now - start) / 60000));
  return `${mins}m ago`;
}

function normalizeItemStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return ITEM_STATUS_ORDER.includes(value) ? value : 'pending';
}

function nextItemStatus(status) {
  const current = normalizeItemStatus(status);
  return ITEM_STATUS_ORDER[(ITEM_STATUS_ORDER.indexOf(current) + 1) % ITEM_STATUS_ORDER.length];
}

function orderItems(order) {
  return Array.isArray(order.items) ? order.items : [];
}

function isAllReady(order) {
  const items = orderItems(order);
  return Boolean(order.all_items_ready || (items.length && items.every((item) => normalizeItemStatus(item.status) === 'ready')));
}

function parseEventPayload(event) {
  try {
    return JSON.parse(event?.data || '{}');
  } catch {
    return {};
  }
}

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [waiterCalls, setWaiterCalls] = useState([]);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const data = await api.getKitchenOrders();
    setOrders(data.sort((a, b) => (parseServerTime(b.created_at) || 0) - (parseServerTime(a.created_at) || 0)));
    setLoading(false);
  }, []);

  const fetchWaiterCalls = useCallback(async () => {
    const calls = await api.getWaiterCalls();
    setWaiterCalls(calls);
  }, []);

  const applyItemStatusUpdate = useCallback((payload) => {
    if (!payload?.order_id || !payload?.item_id) return;
    setOrders((current) => current.map((order) => {
      if (String(order.id) !== String(payload.order_id)) return order;
      const items = orderItems(order).map((item) => (
        String(item.item_id || item.id) === String(payload.item_id)
          ? { ...item, status: payload.status }
          : item
      ));
      return {
        ...order,
        items,
        all_items_ready: Boolean(payload.all_ready),
        status: payload.all_ready ? 'Ready' : order.status,
      };
    }));
  }, []);

  useEffect(() => {
    document.title = 'Kitchen Display - Jaya Dhaba';
    const removeAudioUnlock = installAdminAudioUnlock();
    fetchOrders();
    fetchWaiterCalls();
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      window.clearInterval(timer);
      removeAudioUnlock();
    };
  }, [fetchOrders, fetchWaiterCalls]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.action === 'new_order') playNewOrderSound();
      fetchOrders();
    };
    window.addEventListener('rt:orders', handler);
    return () => window.removeEventListener('rt:orders', handler);
  }, [fetchOrders]);

  useEffect(() => {
    const stream = createTicketedEventSource('/api/kitchen/stream', {
      events: ['waiter_call', 'waiter_call_resolved', 'item_status_update', 'order_addon', 'order.created', 'order.updated'],
      minRefreshMs: 0,
      onRefresh: (eventName, event) => {
        if (eventName === 'item_status_update') {
          applyItemStatusUpdate(parseEventPayload(event));
          return;
        }
        if (eventName === 'waiter_call' || eventName === 'waiter_call_resolved') {
          if (eventName === 'waiter_call') playWaiterCallSound();
          window.dispatchEvent(new CustomEvent('rt:waiter', { detail: { action: eventName } }));
          fetchWaiterCalls();
          return;
        }
        fetchOrders();
      },
    });
    const timer = window.setInterval(fetchWaiterCalls, 15000);
    return () => {
      stream.close();
      window.clearInterval(timer);
    };
  }, [applyItemStatusUpdate, fetchOrders, fetchWaiterCalls]);

  usePollingFallback(fetchOrders, 15000);

  const visible = useMemo(() => orders.filter((order) => {
    const status = String(order.status || '').toLowerCase();
    return ['pending', 'placed', 'confirmed', 'preparing', 'ready'].includes(status);
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

  const updateItemStatus = async (order, item) => {
    const itemId = item.item_id || item.id;
    const status = nextItemStatus(item.status);
    const previous = orders;
    applyItemStatusUpdate({
      order_id: order.id,
      item_id: itemId,
      status,
      all_ready: orderItems(order).every((line) => (
        String(line.item_id || line.id) === String(itemId) ? status === 'ready' : normalizeItemStatus(line.status) === 'ready'
      )),
    });
    try {
      await api.updateKitchenItemStatus(order.id, itemId, status);
    } catch {
      setOrders(previous);
    }
  };

  const resolveCall = async (callId) => {
    const previous = waiterCalls;
    setWaiterCalls((current) => current.filter((call) => call.id !== callId));
    try {
      await api.resolveWaiterCall(callId);
    } catch {
      setWaiterCalls(previous);
    }
  };

  const ageBorder = (order) => {
    if (isAllReady(order)) return 'border-green-500 bg-green-50';
    const createdAt = parseServerTime(order.created_at);
    const mins = createdAt ? Math.floor((now - createdAt) / 60000) : Math.floor(Number(order.elapsed_seconds || 0) / 60);
    if (mins >= 25) return 'border-red-500 bg-red-50';
    if (mins >= 15) return 'border-amber-400 bg-amber-50';
    return 'border-heritage-espresso/10 bg-white';
  };

  const callAgeMinutes = (call) => {
    const seconds = Number(call.created_at || 0);
    if (!seconds) return 0;
    return Math.max(0, Math.floor((Date.now() - seconds * 1000) / 60000));
  };

  const callTone = (call) => {
    const mins = callAgeMinutes(call);
    if (mins >= 7) return 'border-red-500 bg-red-50 text-red-950';
    if (mins >= 3) return 'border-amber-400 bg-amber-50 text-amber-950';
    return 'border-green-400 bg-green-50 text-green-950';
  };

  const renderItemRows = (order, items, addon = false) => (
    <div className="space-y-3">
      {items.map((item) => {
        const status = normalizeItemStatus(item.status);
        const qty = item.qty || item.quantity || 1;
        return (
          <div key={item.item_id || item.id || `${item.name}-${qty}`} className="flex items-center justify-between gap-3 rounded-2xl border border-heritage-espresso/5 bg-white/70 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-base font-black text-heritage-espresso">{qty}x {item.name}</p>
              {addon && <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Add-on</p>}
            </div>
            <button
              type="button"
              onClick={() => updateItemStatus(order, item)}
              className={`min-h-[38px] shrink-0 rounded-full border px-4 text-[10px] font-black uppercase tracking-widest ${ITEM_STATUS_CLASSES[status]}`}
            >
              {ITEM_STATUS_LABELS[status]}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-5xl font-serif italic text-heritage-espresso">Kitchen Display</h1>
        <p className="text-xl font-black text-heritage-gold">{visible.length} live</p>
      </div>
      {waiterCalls.length > 0 && (
        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {waiterCalls.map((call) => (
            <article key={call.id} className={`rounded-3xl border-4 p-5 shadow-lg ${callTone(call)}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-60">Waiter Call</p>
                  <h2 className="mt-2 text-3xl font-black">{call.table_name || 'Table'}</h2>
                </div>
                <span className="text-lg font-black">{callAgeMinutes(call)}m</span>
              </div>
              <p className="mt-4 text-xl font-serif italic">{WAITER_REASON_LABELS[call.reason] || call.reason}</p>
              <button onClick={() => resolveCall(call.id)} className="mt-5 min-h-[44px] w-full rounded-2xl bg-heritage-espresso px-4 text-sm font-black uppercase tracking-widest text-white">
                Resolve
              </button>
            </article>
          ))}
        </section>
      )}
      {loading ? (
        <div className="grid h-[70vh] place-items-center text-4xl font-serif italic text-heritage-espresso/30">Loading kitchen orders...</div>
      ) : visible.length === 0 ? (
        <div className="grid h-[70vh] place-items-center text-4xl font-serif italic text-heritage-espresso/30">Kitchen is clear</div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((order) => {
            const regularItems = orderItems(order).filter((item) => !item.is_addon);
            const addonItems = orderItems(order).filter((item) => item.is_addon);
            return (
              <article key={order.id} className={`rounded-3xl border-4 p-6 shadow-xl ${ageBorder(order)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-4xl font-black">#{order.order_number || String(order.id).slice(0, 8)}</h2>
                    <p className="mt-1 text-sm font-black text-heritage-espresso/50">{order.table_label || order.table || 'Table'}</p>
                  </div>
                  <span className="shrink-0 text-lg font-black uppercase">{elapsed(order.created_at, now)}</span>
                </div>

                <div className="mt-5">
                  {renderItemRows(order, regularItems)}
                </div>

                {addonItems.length > 0 && (
                  <div className="mt-5 border-l-4 border-amber-400 pl-4">
                    <div className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                      Add-on
                    </div>
                    {renderItemRows(order, addonItems, true)}
                  </div>
                )}

                <button onClick={() => markServed(order.id)} className="mt-8 min-h-[44px] w-full rounded-2xl bg-heritage-espresso py-4 text-xl font-black uppercase text-white">
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
