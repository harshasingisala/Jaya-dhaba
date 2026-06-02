import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, Keyboard, Loader2, Printer, QrCode, RefreshCw, ToggleLeft, ToggleRight, Trash2, Utensils, X } from 'lucide-react';
import api from '../../../api';
import { createTicketedEventSource } from '../../../api/realtime';
import { useToast } from '../../../components/Toast';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function tableNumber(table) {
  if (typeof table.table_number === 'number') return table.table_number;
  const match = String(table.label || '').match(/\d+/);
  return match ? Number(match[0]) : 9999;
}

function tableQrUrl(table) {
  if (table.qr_url) return table.qr_url;
  const number = typeof table.table_number === 'number' ? table.table_number : String(table.label || '').match(/\d+/)?.[0];
  if (number) return `https://jayadhaba.online/menu?table=${number}`;
  return `https://jayadhaba.online/menu?table_token=${encodeURIComponent(table.qr_token || '')}`;
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function orderNumber(order) {
  return order?.order_number || String(order?.id || '').slice(0, 8);
}

function orderStatus(order) {
  const raw = String(order?.status || 'pending').replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function orderApiStatus(order) {
  const value = String(order?.status || 'pending').toLowerCase();
  return {
    placed: 'pending',
    confirmed: 'confirmed',
    preparing: 'preparing',
    ready: 'ready',
    enjoying: 'served',
    served: 'served',
    cancelled: 'cancelled',
  }[value] || value;
}

const ITEM_STATUSES = ['pending', 'preparing', 'ready'];
const ORDER_STEPS = ['pending', 'confirmed', 'preparing', 'ready', 'served'];
const WAITER_REASON_LABELS = {
  need_assistance: 'Need assistance',
  need_water: 'Need water',
  have_question: 'Have a question',
  requesting_bill: 'Request bill',
};

function normalizeItemStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return ITEM_STATUSES.includes(value) ? value : 'pending';
}

function nextItemStatus(status) {
  const current = normalizeItemStatus(status);
  return ITEM_STATUSES[(ITEM_STATUSES.indexOf(current) + 1) % ITEM_STATUSES.length];
}

function parseTime(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timerText(value, now) {
  const date = parseTime(value);
  const seconds = date ? Math.max(0, Math.floor((now - date.getTime()) / 1000)) : 0;
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function timerTone(value, now) {
  const date = parseTime(value);
  const mins = date ? Math.floor((now - date.getTime()) / 60000) : 0;
  if (mins >= 25) return 'text-red-700';
  if (mins >= 15) return 'text-amber-700';
  return 'text-heritage-espresso';
}

function playWaiterPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 820;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (_) {
    // Staff browsers can block audio before interaction.
  }
}

export default function QRTableManager() {
  const [tables, setTables] = useState([]);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [qrUrls, setQrUrls] = useState({});
  const [kitchenOrders, setKitchenOrders] = useState([]);
  const [waiterCalls, setWaiterCalls] = useState([]);
  const [waiterHistory, setWaiterHistory] = useState([]);
  const [waiterFlash, setWaiterFlash] = useState(false);
  const [expandedSplitOrder, setExpandedSplitOrder] = useState('');
  const [qrPopup, setQrPopup] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const tableGridRef = useRef(null);
  const waiterRef = useRef(null);
  const tableRefs = useRef([]);
  const { show: toast } = useToast();

  const sortedTables = useMemo(() => {
    return [...tables].sort((a, b) => tableNumber(a) - tableNumber(b));
  }, [tables]);

  const impact = useMemo(() => {
    const activeTables = sortedTables.filter((table) => table.active_order);
    const activeRevenue = activeTables.reduce((sum, table) => sum + Number(table.active_order?.total || 0), 0);
    return {
      totalTables: sortedTables.length,
      activeTables: activeTables.length,
      freeTables: sortedTables.filter((table) => table.active && !table.active_order).length,
      activeRevenue,
    };
  }, [sortedTables]);

  const loadTables = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, orders, calls, history] = await Promise.all([
        api.getAdminTables(),
        api.getKitchenOrders(),
        api.getWaiterCalls(),
        api.getWaiterCallHistory(),
      ]);
      setTables(rows);
      setKitchenOrders(orders);
      setWaiterCalls(calls);
      setWaiterHistory(history.filter((call) => call.status === 'resolved'));
    } catch (err) {
      toast(err.message || 'Tables could not be loaded', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const stream = createTicketedEventSource('/api/kitchen/stream', {
      events: ['waiter_call', 'waiter_call_resolved', 'item_status_update', 'bulk_item_status_update', 'split_paid', 'split_updated', 'order.created', 'order.updated'],
      minRefreshMs: 0,
      onRefresh: (eventName) => {
        if (eventName === 'waiter_call') {
          playWaiterPing();
          window.dispatchEvent(new CustomEvent('rt:waiter', { detail: { action: 'waiter_call' } }));
          setWaiterFlash(true);
          window.setTimeout(() => setWaiterFlash(false), 2000);
        }
        if (eventName === 'waiter_call_resolved') {
          window.dispatchEvent(new CustomEvent('rt:waiter', { detail: { action: 'waiter_call_resolved' } }));
        }
        loadTables();
      },
    });
    return () => stream.close();
  }, [loadTables]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'SELECT' || event.target?.tagName === 'TEXTAREA') return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        setQrPopup(null);
        setExpandedSplitOrder('');
        setShortcutsOpen(false);
      }
      if (key === 'w') waiterRef.current?.focus();
      if (key === 't') tableGridRef.current?.focus();
      if (key === 'r' && waiterCalls[0]) resolveCall(waiterCalls[0].id);
      if (/^[1-9]$/.test(key)) tableRefs.current[Number(key) - 1]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [waiterCalls]);

  useEffect(() => {
    let cancelled = false;
    const createdUrls = [];
    async function loadQrs() {
      const next = {};
      await Promise.all(sortedTables.map(async (table) => {
        try {
          const blob = await api.getTableQRCode(table.id);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          next[table.id] = url;
        } catch {
          next[table.id] = '';
        }
      }));
      if (!cancelled) setQrUrls(next);
    }
    if (sortedTables.length) loadQrs();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [sortedTables]);

  const generateTables = async () => {
    const safeCount = Math.min(50, Math.max(1, Number(count) || 1));
    setGenerating(true);
    try {
      const rows = await api.bulkCreateTables(safeCount);
      setTables(rows);
      toast(`${safeCount} table slots are ready`, 'success');
    } catch (err) {
      toast(err.message || 'Table generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const toggleActive = async (table) => {
    setBusyId(table.id);
    try {
      const updated = await api.updateTable(table.id, { active: !table.active });
      setTables((prev) => prev.map((row) => (row.id === table.id ? updated : row)));
      toast(updated.active ? `${updated.label} activated` : `${updated.label} paused`, 'info');
    } catch (err) {
      toast(err.message || 'Table update failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const clearTable = async (table) => {
    setBusyId(table.id);
    try {
      const result = await api.clearTable(table.id);
      toast(`${table.label} cleared (${result.cleared || 0} order${result.cleared === 1 ? '' : 's'})`, 'success');
      await loadTables();
    } catch (err) {
      toast(err.message || 'Clear table failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const updateItemStatus = async (order, item, status = nextItemStatus(item.status)) => {
    const itemId = item.item_id || item.id;
    try {
      await api.updateKitchenItemStatus(order.id, itemId, status);
      setKitchenOrders((current) => current.map((row) => (
        row.id === order.id
          ? { ...row, items: (row.items || []).map((line) => (line.item_id === itemId || line.id === itemId ? { ...line, status } : line)) }
          : row
      )));
    } catch (err) {
      toast(err.message || 'Item status update failed', 'error');
    }
  };

  const bulkItemStatus = async (order, status) => {
    const itemIds = (order.items || [])
      .filter((item) => status === 'ready' || normalizeItemStatus(item.status) === 'pending')
      .map((item) => item.item_id || item.id);
    if (!itemIds.length) return;
    try {
      await api.bulkUpdateKitchenItemStatus(order.id, itemIds, status);
      await loadTables();
    } catch (err) {
      toast(err.message || 'Bulk status update failed', 'error');
    }
  };

  const advanceOrder = async (order, targetStatus) => {
    try {
      await api.updateOrderStatus(order.id, targetStatus);
      await loadTables();
    } catch (err) {
      toast(err.message || 'Order status update failed', 'error');
    }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(`Cancel order #${orderNumber(order)}?`)) return;
    await advanceOrder(order, 'cancelled');
  };

  const resolveCall = async (callId) => {
    try {
      await api.resolveWaiterCall(callId);
      await loadTables();
    } catch (err) {
      toast(err.message || 'Waiter call resolve failed', 'error');
    }
  };

  const rotateQr = async (table) => {
    setBusyId(table.id);
    try {
      const updated = await api.rotateTableQr(table.id);
      setTables((prev) => prev.map((row) => (row.id === table.id ? updated : row)));
      const blob = await api.getTableQRCode(table.id);
      const url = URL.createObjectURL(blob);
      setQrPopup({ table: updated, url });
      toast(`${table.label} QR refreshed`, 'success');
    } catch (err) {
      toast(err.message || 'QR rotation failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const downloadOne = async (table) => {
    setBusyId(table.id);
    try {
      const blob = await api.getTableQRCode(table.id);
      downloadBlob(blob, `jaya-dhaba-${String(table.label).toLowerCase().replace(/\s+/g, '-')}-qr.png`);
    } catch (err) {
      toast(err.message || 'QR download failed', 'error');
    } finally {
      setBusyId('');
    }
  };

  const downloadAll = async () => {
    setGenerating(true);
    try {
      const blob = await api.downloadAllQRs();
      downloadBlob(blob, 'jaya-dhaba-table-qrs.zip');
    } catch (err) {
      toast(err.message || 'ZIP download failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const copyQrLink = async (table) => {
    const link = tableQrUrl(table);
    try {
      await navigator.clipboard.writeText(link);
      toast(`${table.label} QR link copied`, 'success');
    } catch {
      toast('Copy failed. Open the QR link and copy it from the address bar.', 'warning');
    }
  };

  const printOne = (table) => {
    const url = qrUrls[table.id];
    if (!url) {
      toast('QR is still loading', 'warning');
      return;
    }
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=620');
    if (!printWindow) {
      toast('Popup blocked. Allow popups to print QR codes.', 'warning');
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${table.label} QR</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; display: grid; place-items: center; min-height: 100vh; }
            .sheet { text-align: center; padding: 32px; }
            h1 { margin: 0 0 8px; font-size: 34px; }
            p { margin: 0 0 24px; font-size: 14px; color: #555; }
            img { width: 300px; height: 300px; object-fit: contain; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>${table.label}</h1>
            <p>Scan to order at Jaya Dhaba</p>
            <img src="${url}" alt="${table.label} QR" />
          </div>
          <script>window.onload = function () { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/35">Restaurant Tables</p>
          <h1 className="mt-2 font-serif italic text-5xl text-heritage-espresso">Table & QR Management</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-[54px] items-center gap-3 rounded-2xl bg-white px-4 shadow-sm ring-1 ring-heritage-espresso/5">
            <span className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40">Tables</span>
            <input
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="w-20 bg-transparent text-xl font-black text-heritage-espresso outline-none"
            />
          </label>
          <button
            onClick={generateTables}
            disabled={generating}
            className="min-h-[54px] rounded-2xl bg-heritage-gold px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-heritage-gold/20 disabled:opacity-60"
          >
            {generating ? 'Working...' : 'Generate Tables'}
          </button>
          <button
            onClick={downloadAll}
            disabled={generating || sortedTables.length === 0}
            className="inline-flex min-h-[54px] items-center gap-2 rounded-2xl bg-heritage-espresso px-5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-60"
          >
            <Download size={15} />
            Download All QRs as ZIP
          </button>
          <button onClick={loadTables} className="grid h-[54px] w-[54px] place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-heritage-espresso/5" title="Refresh">
            <RefreshCw size={17} />
          </button>
          <div className="relative">
            <button onClick={() => setShortcutsOpen((value) => !value)} className="grid h-[54px] w-[54px] place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-heritage-espresso/5" title="Shortcuts">
              <Keyboard size={17} />
            </button>
            {shortcutsOpen && (
              <div className="absolute right-0 top-16 z-20 w-72 rounded-2xl bg-white p-4 text-xs font-bold text-heritage-espresso shadow-2xl ring-1 ring-heritage-espresso/10">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40">Shortcuts</p>
                <p>W - waiter calls</p>
                <p>T - table grid</p>
                <p>R - resolve oldest call</p>
                <p>1-9 - focus table card</p>
                <p>Esc - close popup</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-heritage-espresso/5">
          <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">QR Tables</p>
          <p className="mt-2 text-3xl font-black text-heritage-espresso">{impact.totalTables}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-heritage-espresso/5">
          <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">Live Orders</p>
          <p className="mt-2 text-3xl font-black text-red-700">{impact.activeTables}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-heritage-espresso/5">
          <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">Open Tables</p>
          <p className="mt-2 text-3xl font-black text-green-700">{impact.freeTables}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-heritage-espresso/5">
          <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">Active Table Value</p>
          <p className="mt-2 text-3xl font-black text-heritage-gold">{formatMoney(impact.activeRevenue)}</p>
        </div>
      </div>

      <section ref={waiterRef} tabIndex={-1} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-heritage-espresso/5 outline-none">
        <div className={`flex items-center justify-between rounded-2xl px-4 py-3 transition ${waiterFlash ? 'bg-amber-100 text-amber-900' : 'bg-heritage-stone/40 text-heritage-espresso'}`}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] opacity-50">Waiter Calls</p>
            <h2 className="font-serif italic text-3xl">Live Assistance</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black">{waiterCalls.length} pending</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {waiterCalls.map((call) => (
            <div key={call.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-amber-950">{call.table_name || 'Table'}</p>
                  <p className="text-sm font-bold text-amber-800">{WAITER_REASON_LABELS[call.reason] || call.reason}</p>
                </div>
                <button onClick={() => resolveCall(call.id)} className="rounded-full bg-heritage-espresso px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">
                  Resolve
                </button>
              </div>
            </div>
          ))}
          {waiterCalls.length === 0 && (
            <p className="rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-800">No active waiter calls.</p>
          )}
        </div>
        {waiterHistory.length > 0 && (
          <details className="mt-4 rounded-2xl bg-heritage-stone/40 p-4">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-heritage-espresso/60">Resolved today</summary>
            <div className="mt-3 grid gap-2">
              {waiterHistory.map((call) => (
                <div key={call.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-bold">
                  <span>{call.table_name || 'Table'} - {WAITER_REASON_LABELS[call.reason] || call.reason}</span>
                  <span>{Math.max(0, Math.round((call.time_to_resolve_seconds || 0) / 60))}m</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {loading ? (
        <div className="rounded-3xl bg-white py-24 text-center text-heritage-espresso/40 shadow-sm">
          <Loader2 className="mx-auto animate-spin" size={34} />
          <p className="mt-3 font-serif italic text-2xl">Loading tables...</p>
        </div>
      ) : sortedTables.length === 0 ? (
        <div className="rounded-3xl bg-white py-24 text-center text-heritage-espresso/40 shadow-sm">
          <QrCode className="mx-auto mb-4" size={46} />
          <p className="font-serif italic text-3xl">No tables yet</p>
        </div>
      ) : (
        <div ref={tableGridRef} tabIndex={-1} className="grid gap-5 outline-none md:grid-cols-2 2xl:grid-cols-3">
          {sortedTables.map((table, tableIndex) => {
            const isBusy = busyId === table.id;
            const activeOrder = kitchenOrders.find((order) => String(order.table_id) === String(table.id)) || table.active_order;
            const hasOrder = Boolean(activeOrder);
            const qrLink = tableQrUrl(table);
            const splitCharges = activeOrder?.split_charges || [];
            const paidSplits = splitCharges.filter((charge) => charge.status === 'paid');
            const remainingSplitAmount = splitCharges.reduce((sum, charge) => charge.status === 'paid' ? sum : sum + Number(charge.amount || 0), 0);
            const currentStepIndex = ORDER_STEPS.indexOf(orderApiStatus(activeOrder));
            return (
              <article ref={(node) => { tableRefs.current[tableIndex] = node; }} tabIndex={-1} key={table.id} className="rounded-3xl border border-heritage-espresso/5 bg-white p-5 shadow-sm outline-none focus:ring-4 focus:ring-heritage-gold/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif italic text-3xl text-heritage-espresso">{table.label}</h2>
                    <p className="mt-1 text-xs font-black uppercase tracking-widest text-heritage-espresso/35">
                      Capacity {table.capacity || 4}
                    </p>
                  </div>
                  <div className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest ${hasOrder ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {hasOrder ? 'Active Order' : 'Free'}
                  </div>
                </div>

                {hasOrder && (
                  <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-950">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-red-700/65">Current QR Order</p>
                        <p className="mt-1 text-lg font-black">#{orderNumber(activeOrder)}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-black ${timerTone(activeOrder.created_at, now)}`}>{timerText(activeOrder.created_at, now)}</p>
                        <span className="mt-1 inline-flex rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                          {orderStatus(activeOrder)}
                        </span>
                        {splitCharges.length > 0 && (
                          <span className={`mt-2 block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${paidSplits.length === splitCharges.length ? 'bg-green-100 text-green-700' : paidSplits.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-white text-red-700'}`}>
                            {paidSplits.length === splitCharges.length ? 'Fully paid' : paidSplits.length > 0 ? 'Partial payment' : 'Split pending'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold text-red-950/70">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-red-700/45">Guest</p>
                        <p className="mt-1 truncate">{activeOrder.guest_name || 'Guest'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-red-700/45">Items</p>
                        <p className="mt-1">{activeOrder.item_count || activeOrder.items?.length || 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-red-700/45">Since</p>
                        <p className="mt-1">{formatTime(activeOrder.created_at)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-700">
                        <Utensils size={14} />
                        Table total
                      </span>
                      <span className="font-serif italic text-2xl text-red-800">{formatMoney(activeOrder.total)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {ORDER_STEPS.map((step, index) => {
                        const isCurrent = index === currentStepIndex;
                        const isNext = index === currentStepIndex + 1;
                        return (
                          <button
                            key={step}
                            onClick={() => isNext && advanceOrder(activeOrder, step)}
                            disabled={!isNext}
                            className={`rounded-full px-3 py-2 text-[9px] font-black uppercase tracking-widest ${isCurrent ? 'bg-heritage-espresso text-white' : isNext ? 'bg-white text-red-700' : 'bg-red-100 text-red-700/40'}`}
                          >
                            {step}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 space-y-2">
                      {(activeOrder.items || []).map((item) => {
                        const status = normalizeItemStatus(item.status);
                        const itemId = item.item_id || item.id;
                        return (
                          <div key={itemId} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                            <span className="truncate text-xs font-black">{item.qty || item.quantity || 1}x {item.name}</span>
                            <button
                              onClick={() => updateItemStatus(activeOrder, item)}
                              className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest ${status === 'ready' ? 'bg-green-100 text-green-700' : status === 'preparing' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
                            >
                              {status}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button onClick={() => bulkItemStatus(activeOrder, 'preparing')} className="min-h-10 rounded-xl bg-amber-100 text-[9px] font-black uppercase tracking-widest text-amber-800">
                        Mark all preparing
                      </button>
                      <button onClick={() => bulkItemStatus(activeOrder, 'ready')} className="min-h-10 rounded-xl bg-green-100 text-[9px] font-black uppercase tracking-widest text-green-700">
                        Mark all ready
                      </button>
                    </div>
                    {splitCharges.length > 0 && (
                      <div className="mt-4 rounded-xl bg-white">
                        <button
                          onClick={() => setExpandedSplitOrder((value) => value === activeOrder.id ? '' : activeOrder.id)}
                          className="flex min-h-11 w-full items-center justify-between px-3 text-xs font-black uppercase tracking-widest text-red-700"
                        >
                          <span>{paidSplits.length} of {splitCharges.length} paid</span>
                          <span>{formatMoney(remainingSplitAmount)} remaining</span>
                        </button>
                        {expandedSplitOrder === activeOrder.id && (
                          <div className="border-t border-red-50 p-3">
                            {splitCharges.map((charge) => (
                              <div key={charge.id || charge.name} className="flex items-center justify-between py-1 text-xs font-bold">
                                <span>{charge.name}</span>
                                <span>{formatMoney(charge.amount)} - {charge.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button onClick={() => cancelOrder(activeOrder)} className="mt-3 text-xs font-black uppercase tracking-widest text-red-700 underline">
                      Cancel order
                    </button>
                  </div>
                )}

                {!hasOrder && (
                  <div className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4 text-green-950">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">
                        {table.qr_rotated_at ? `Free since ${timerText(table.qr_rotated_at, now)}` : 'Ready for next scan'}
                      </p>
                      <button
                        onClick={() => rotateQr(table)}
                        disabled={isBusy}
                        className="rounded-full bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-700 disabled:opacity-50"
                      >
                        Generate fresh QR
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 grid place-items-center rounded-3xl bg-heritage-stone/40 p-5">
                  {qrUrls[table.id] ? (
                    <img src={qrUrls[table.id]} alt={`${table.label} QR code`} className="h-48 w-48 rounded-xl bg-white object-contain p-2 shadow-sm" />
                  ) : (
                    <div className="grid h-48 w-48 place-items-center rounded-xl bg-white text-heritage-espresso/30">
                      <Loader2 className="animate-spin" />
                    </div>
                  )}
                  <p className="mt-4 break-all text-center text-xs font-bold text-heritage-espresso/50">
                    {qrLink}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => copyQrLink(table)}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-heritage-stone text-[10px] font-black uppercase tracking-widest text-heritage-espresso"
                  >
                    <Copy size={15} />
                    Copy Link
                  </button>
                  <a
                    href={qrLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-heritage-stone text-[10px] font-black uppercase tracking-widest text-heritage-espresso"
                  >
                    <ExternalLink size={15} />
                    Open Link
                  </a>
                  <button
                    onClick={() => downloadOne(table)}
                    disabled={isBusy}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-heritage-stone text-[10px] font-black uppercase tracking-widest text-heritage-espresso disabled:opacity-60"
                  >
                    <Download size={15} />
                    Download
                  </button>
                  <button
                    onClick={() => printOne(table)}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-heritage-stone text-[10px] font-black uppercase tracking-widest text-heritage-espresso"
                  >
                    <Printer size={15} />
                    Print QR
                  </button>
                  <button
                    onClick={() => toggleActive(table)}
                    disabled={isBusy}
                    className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-60 ${table.active ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
                  >
                    {table.active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                    {table.active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => clearTable(table)}
                    disabled={isBusy || !hasOrder}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-red-50 text-[10px] font-black uppercase tracking-widest text-red-700 disabled:opacity-40"
                  >
                    {hasOrder ? <Trash2 size={15} /> : <CheckCircle2 size={15} />}
                    Clear Table
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {qrPopup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif italic text-3xl text-heritage-espresso">{qrPopup.table.label}</h2>
              <button onClick={() => setQrPopup(null)} className="grid h-10 w-10 place-items-center rounded-full bg-heritage-stone">
                <X size={16} />
              </button>
            </div>
            <div id="fresh-table-qr" className="mt-4 rounded-2xl bg-white p-4">
              <img src={qrPopup.url} alt={`${qrPopup.table.label} fresh QR`} className="mx-auto h-64 w-64 object-contain" />
              <p className="mt-3 text-sm font-black text-heritage-espresso">{qrPopup.table.label}</p>
            </div>
            <button onClick={() => window.print()} className="mt-4 min-h-11 w-full rounded-full bg-heritage-espresso text-xs font-black uppercase tracking-widest text-white">
              Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
