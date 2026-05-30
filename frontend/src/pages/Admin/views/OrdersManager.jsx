import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Archive, Check, ChefHat, ClipboardList, Loader2, MessageCircle, PauseCircle, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import api from '../../../api';
import { getSocket } from '../../../lib/socket';
import { usePollingFallback } from '../../../hooks/usePollingFallback';
import { useToast } from '../../../components/Toast';

const TABS = ['all', 'pending', 'preparing', 'ready', 'served', 'archive'];
const STATUS_LABELS = {
  Placed: 'pending',
  Pending: 'pending',
  Confirmed: 'pending',
  pending: 'pending',
  confirmed: 'pending',
  Preparing: 'preparing',
  preparing: 'preparing',
  Ready: 'ready',
  ready: 'ready',
  Served: 'served',
  served: 'served',
};

function apiStatus(order) {
  return STATUS_LABELS[order.status] || String(order.status || 'pending').toLowerCase();
}

function displayId(order) {
  return order.order_number ? `#${order.order_number}` : `#${String(order.id).slice(0, 8)}`;
}

function formatMoney(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatItems(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) return 'Custom order';
  return order.items.map((item) => `${item.qty || item.quantity || 1}x ${item.name}`).join(', ');
}

function tableDisplay(order) {
  return order.table_label || order.table || order.table_number || (order.table_id ? `ID ${String(order.table_id).slice(0, 8)}` : 'Guest');
}

function buildWhatsAppReceipt(order) {
  const itemLines = Array.isArray(order.items) && order.items.length
    ? order.items.map((item) => {
        const qty = item.qty || item.quantity || 1;
        const unit = Number(item.price || item.unit_price || 0);
        return `- ${qty} x ${item.name} @ ${formatMoney(unit)} = ${formatMoney(unit * qty)}`;
      })
    : ['- Custom order'];
  return [
    'Jaya Dhaba Receipt',
    `Order: ${displayId(order)}`,
    `Guest: ${order.customer_name || order.guest_name || 'Guest'}`,
    `Phone: ${order.customer_phone || order.guest_phone || 'Not shared'}`,
    `Table: ${tableDisplay(order)}`,
    `Status: ${apiStatus(order)}`,
    `Payment: ${order.payment_method || 'Not recorded'}`,
    '',
    'Items:',
    ...itemLines,
    '',
    `Subtotal: ${formatMoney(order.subtotal || order.total || 0)}`,
    order.tax ? `Tax: ${formatMoney(order.tax)}` : '',
    `Total: ${formatMoney(order.total)}`,
    '',
    'Thank you for coming to Jaya Dhaba. What a wonderful experience it was serving you.',
  ].filter(Boolean).join('\n');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseServerTime(value) {
  if (!value) return null;
  const text = String(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  return new Date(hasTimezone ? text : `${text}Z`);
}

export default function OrdersManager() {
  const [orders, setOrders] = useState([]);
  const [archiveOrders, setArchiveOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [archiveDate, setArchiveDate] = useState('');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [ordersPaused, setOrdersPaused] = useState(false);
  const [now, setNow] = useState(new Date());
  const { show: toast } = useToast();
  const location = useLocation();

  useEffect(() => {
    document.title = 'Orders — Jaya Dhaba Admin';
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new-order') {
      setManualOpen(true);
    }
  }, [location.search]);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
      setLastUpdated(new Date());
    } catch {
      toast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await api.getOrderStats());
    } catch {
      // Stats are secondary; row data still renders.
    }
  }, []);

  const fetchArchive = useCallback(async (date = archiveDate) => {
    try {
      const data = await api.getOrderArchive(date);
      setArchiveOrders(data);
    } catch {
      toast('Failed to load archive', 'error');
    }
  }, [archiveDate, toast]);

  useEffect(() => {
    fetchOrders();
    fetchStats();
    api.getAdminOrderPauseStatus().then((data) => setOrdersPaused(!!data.paused)).catch(() => {});
  }, [fetchOrders, fetchStats]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!clearConfirm) return undefined;
    const timer = window.setTimeout(() => setClearConfirm(false), 5000);
    return () => window.clearTimeout(timer);
  }, [clearConfirm]);

  useEffect(() => {
    if (!deleteAllConfirm) return undefined;
    const timer = window.setTimeout(() => setDeleteAllConfirm(false), 6000);
    return () => window.clearTimeout(timer);
  }, [deleteAllConfirm]);

  useEffect(() => {
    const handler = (event) => {
      const data = event.detail || {};
      if (data.action === 'new_order' && data.order) {
        setOrders((prev) => [data.order, ...prev.filter((order) => order.id !== data.order.id)]);
      } else if (data.action === 'status_changed') {
        setOrders((prev) => prev.map((order) =>
          (data.order_ids || []).includes(order.id) ? {
            ...order,
            status: data.status,
            preparing_at: data.status === 'preparing' ? data.timestamp : order.preparing_at,
            served_at: data.status === 'served' ? data.timestamp : data.status === 'pending' ? null : order.served_at,
          } : order
        ));
      } else if (data.action === 'archived' || data.action === 'cleared') {
        setOrders((prev) => prev.filter((order) => !(data.order_ids || []).includes(order.id)));
        if (activeTab === 'archive') fetchArchive();
      }
      fetchStats();
      setLastUpdated(new Date());
    };
    window.addEventListener('rt:orders', handler);
    return () => window.removeEventListener('rt:orders', handler);
  }, [activeTab, fetchArchive, fetchStats]);

  usePollingFallback(() => {
    fetchOrders();
    fetchStats();
    if (activeTab === 'archive') fetchArchive();
  }, 15000);

  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatch = activeTab === 'all' || apiStatus(order) === activeTab;
      const createdAt = parseServerTime(order.created_at);
      const dateMatch = !dateFilter || (createdAt && createdAt.toISOString().slice(0, 10) === dateFilter);
      const searchMatch = !normalizedQuery ||
        String(order.order_number || order.id).toLowerCase().includes(normalizedQuery) ||
        String(order.customer_name || order.guest_name || 'Guest').toLowerCase().includes(normalizedQuery) ||
        formatItems(order).toLowerCase().includes(normalizedQuery);
      return statusMatch && dateMatch && searchMatch;
    });
  }, [activeTab, dateFilter, orders, query]);

  const archiveSummary = useMemo(() => {
    const todayStart = startOfDay(now);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const todayRows = archiveOrders.filter((order) => {
      const archivedAt = parseServerTime(order.archived_at);
      return archivedAt && archivedAt >= todayStart;
    });
    const weekRows = archiveOrders.filter((order) => {
      const archivedAt = parseServerTime(order.archived_at);
      return archivedAt && archivedAt >= weekStart;
    });
    return {
      todayRevenue: todayRows.reduce((sum, order) => sum + Number(order.total || 0), 0),
      todayCount: todayRows.length,
      weekRevenue: weekRows.reduce((sum, order) => sum + Number(order.total || 0), 0),
      weekCount: weekRows.length,
    };
  }, [archiveOrders, now]);

  const groupedArchive = useMemo(() => {
    return archiveOrders.reduce((groups, order) => {
      const key = order.archived_at
        ? parseServerTime(order.archived_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })
        : 'Unknown date';
      groups[key] = groups[key] || [];
      groups[key].push(order);
      return groups;
    }, {});
  }, [archiveOrders]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === visibleOrders.length) return new Set();
      return new Set(visibleOrders.map((order) => order.id));
    });
  }, [visibleOrders]);

  const refreshAll = useCallback(() => {
    fetchOrders();
    fetchStats();
    if (activeTab === 'archive') fetchArchive();
  }, [activeTab, fetchArchive, fetchOrders, fetchStats]);

  const togglePauseOrders = async () => {
    const next = !ordersPaused;
    setOrdersPaused(next);
    try {
      const result = await api.setOrderPauseStatus(next);
      setOrdersPaused(!!result.paused);
      toast(result.paused ? 'New orders paused' : 'New orders resumed', 'info');
    } catch {
      setOrdersPaused(!next);
      toast('Pause toggle failed', 'error');
    }
  };

  const bulkSetStatus = async (status) => {
    if (!selectedIds.size) {
      toast('Select at least one order', 'warning');
      return;
    }
    const ids = [...selectedIds];
    const previousOrders = orders;
    const timestamp = new Date().toISOString();
    setOrders((prev) => prev.map((order) =>
      ids.includes(order.id) ? {
        ...order,
        status,
        updated_at: timestamp,
        preparing_at: status === 'preparing' ? timestamp : order.preparing_at,
        served_at: status === 'served' ? timestamp : order.served_at,
      } : order
    ));
    setBulkLoading(true);
    try {
      await api.bulkUpdateOrderStatus(ids, status);
      toast(`${ids.length} orders marked ${status}`, 'success');
      setSelectedIds(new Set());
      const socket = getSocket();
      if (!socket.connected || socket.joined_admin === false) refreshAll();
    } catch {
      setOrders(previousOrders);
      toast('Action failed. Try again.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const singleSetStatus = async (orderId, status) => {
    const previousOrders = orders;
    const timestamp = new Date().toISOString();
    setOrders((prev) => prev.map((order) =>
      order.id === orderId ? {
        ...order,
        status,
        updated_at: timestamp,
        preparing_at: status === 'preparing' ? timestamp : order.preparing_at,
        served_at: status === 'served' ? timestamp : order.served_at,
      } : order
    ));
    setBulkLoading(true);
    try {
      await api.bulkUpdateOrderStatus([orderId], status);
      const socket = getSocket();
      if (!socket.connected || socket.joined_admin === false) refreshAll();
    } catch {
      setOrders(previousOrders);
      toast('Status update failed', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkArchive = async (ids = [...selectedIds]) => {
    if (!ids.length) {
      toast('Select at least one order', 'warning');
      return;
    }
    setBulkLoading(true);
    try {
      await api.bulkArchiveOrders(ids);
      toast(`${ids.length} orders archived`, 'success');
      setSelectedIds(new Set());
      const socket = getSocket();
      if (!socket.connected || socket.joined_admin === false) refreshAll();
    } catch {
      toast('Archive failed', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const clearAllServed = async () => {
    setBulkLoading(true);
    try {
      const result = await api.clearServedOrders();
      toast(`${result.cleared || 0} enjoying orders archived`, 'success');
      setSelectedIds(new Set());
      setClearConfirm(false);
      const socket = getSocket();
      if (!socket.connected || socket.joined_admin === false) refreshAll();
    } catch {
      toast('Clear failed', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const archiveAllLiveOrders = async () => {
    setBulkLoading(true);
    try {
      const result = await api.archiveAllOrders();
      toast(`${result.archived || 0} orders moved to archive`, 'success');
      setSelectedIds(new Set());
      setDeleteAllConfirm(false);
      const socket = getSocket();
      if (!socket.connected || socket.joined_admin === false) refreshAll();
    } catch {
      toast('Delete all failed. Nothing was changed.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const shareWhatsAppReceipt = (order) => {
    const phone = String(order.customer_phone || order.guest_phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(buildWhatsAppReceipt(order));
    const target = phone.length >= 10 ? `91${phone.slice(-10)}` : '';
    window.open(`https://wa.me/${target}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const handler = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key === 'a' || event.key === 'A') selectAll();
      if (event.key === 'p' || event.key === 'P') bulkSetStatus('preparing');
      if (event.key === 'r' || event.key === 'R') bulkSetStatus('ready');
      if (event.key === 's' || event.key === 'S') bulkSetStatus('served');
      if (event.key === 'Escape') setSelectedIds(new Set());
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => {
    if (activeTab === 'archive') fetchArchive();
  }, [activeTab, archiveDate, fetchArchive]);

  function getAge(order) {
    const status = apiStatus(order);
    if (status === 'served' && order.served_at) {
      return `Enjoying since ${parseServerTime(order.served_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (status === 'served') {
      return 'Enjoying just now';
    }
    const ref = status === 'preparing' && order.preparing_at ? parseServerTime(order.preparing_at) : parseServerTime(order.updated_at || order.created_at);
    const diff = Math.max(0, now - ref);
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${status === 'preparing' ? 'Cooking' : status === 'ready' ? 'Ready' : 'Waiting'} ${mins}m ${secs}s`;
  }

  function getAgeColor(order) {
    const createdAt = parseServerTime(order.created_at);
    const mins = createdAt ? Math.floor((now - createdAt) / 60000) : 0;
    if (mins > 30) return '#dc2626';
    if (mins > 15) return '#d97706';
    return 'inherit';
  }

  function rowClass(order) {
    const createdAt = parseServerTime(order.created_at);
    const mins = createdAt ? Math.floor((now - createdAt) / 60000) : 0;
    return mins > 30 ? 'bg-red-50' : 'bg-white';
  }

  const allSelected = visibleOrders.length > 0 && selectedIds.size === visibleOrders.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ManualOrderModal open={manualOpen} onClose={() => setManualOpen(false)} onCreated={() => {
        setManualOpen(false);
        toast('Manual order created', 'success');
        refreshAll();
      }} />

      <div className="sticky top-0 z-20 bg-[#FAF9F6]/95 backdrop-blur grid grid-cols-2 xl:grid-cols-5 gap-3 py-3">
        {[
          ['Active', stats.total_active || 0],
          ['Pending', stats.pending || 0],
          ['Preparing', stats.preparing || 0],
          ['Ready', stats.ready || 0],
          ['Enjoying', stats.served || 0],
          ['Today', `${formatMoney(stats.today_revenue)} / ${stats.today_orders || 0}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-heritage-espresso/5 rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">{label}</p>
            <p className="mt-2 text-2xl font-serif italic text-heritage-espresso">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedIds(new Set());
              }}
              className={`px-5 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border ${activeTab === tab ? 'bg-heritage-espresso text-white border-heritage-espresso' : 'bg-white text-heritage-espresso/45 border-heritage-espresso/10'}`}
            >
              {tab === 'archive' ? 'Archive' : `${tab === 'served' ? 'enjoying' : tab} (${tab === 'all' ? orders.length : stats[tab] || 0})`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setManualOpen(true)}
            className="min-h-[54px] px-5 py-3 rounded-2xl bg-heritage-gold text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-heritage-gold/20"
          >
            <Plus size={14} />
            Manual Order
          </button>
          <button
            onClick={togglePauseOrders}
            className={`min-h-[54px] px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm ${ordersPaused ? 'bg-red-600 text-white' : 'bg-white text-heritage-espresso/55 border border-heritage-espresso/10'}`}
          >
            <PauseCircle size={14} />
            {ordersPaused ? 'Resume Orders' : 'Pause Orders'}
          </button>
          {deleteAllConfirm ? (
            <div className="min-h-[54px] px-4 py-2 rounded-2xl bg-red-600 text-white flex items-center gap-2 shadow-lg">
              <span className="text-[10px] font-black uppercase tracking-widest">Delete all live?</span>
              <button onClick={archiveAllLiveOrders} disabled={bulkLoading} className="px-3 py-2 rounded-full bg-white text-red-700 text-[10px] font-black uppercase">Yes</button>
              <button onClick={() => setDeleteAllConfirm(false)} className="px-3 py-2 rounded-full bg-white/15 text-[10px] font-black uppercase">No</button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteAllConfirm(true)}
              className="min-h-[54px] px-5 py-3 rounded-2xl bg-white text-red-600 border border-red-100 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
            >
              <Trash2 size={14} />
              Delete All Orders
            </button>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-heritage-espresso/30" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders"
              className="pl-10 pr-4 py-3 rounded-full bg-white border border-heritage-espresso/10 text-sm outline-none"
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="px-4 py-3 rounded-full bg-white border border-heritage-espresso/10 text-sm outline-none"
          />
          {dateFilter && (
            <button onClick={() => setDateFilter('')} className="px-4 py-3 rounded-full bg-white border border-heritage-espresso/10 text-[10px] font-black uppercase tracking-widest">
              Clear Date
            </button>
          )}
          <button onClick={refreshAll} className="p-3 rounded-full bg-white border border-heritage-espresso/10" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString('en-IN') : 'loading'}
      </p>

      {activeTab === 'archive' ? (
        <ArchiveView
          archiveDate={archiveDate}
          setArchiveDate={setArchiveDate}
          groupedArchive={groupedArchive}
          archiveSummary={archiveSummary}
          archiveOrders={archiveOrders}
        />
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="bg-heritage-espresso text-white rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-xl">
              <span className="text-sm font-black">{selectedIds.size} selected</span>
              <ActionButton disabled={bulkLoading} onClick={() => bulkSetStatus('preparing')} icon={<ChefHat size={15} />} label="Start Prep" />
              <ActionButton disabled={bulkLoading} onClick={() => bulkSetStatus('ready')} icon={<Check size={15} />} label="Ready" />
              <ActionButton disabled={bulkLoading} onClick={() => bulkSetStatus('served')} icon={<Check size={15} />} label="Enjoying" />
              <ActionButton disabled={bulkLoading} onClick={() => bulkArchive()} icon={<Archive size={15} />} label="Archive Selected" />
              {clearConfirm ? (
                <div className="flex items-center gap-2 text-xs font-bold">
                  Clear {stats.served || 0} enjoying orders?
                  <button onClick={clearAllServed} disabled={bulkLoading} className="px-3 py-2 bg-white text-heritage-espresso rounded-full">Yes, Archive</button>
                  <button onClick={() => setClearConfirm(false)} className="px-3 py-2 bg-white/10 rounded-full">Cancel</button>
                </div>
              ) : (
                <ActionButton disabled={bulkLoading} onClick={() => setClearConfirm(true)} icon={<Trash2 size={15} />} label="Clear Enjoying" />
              )}
              {bulkLoading && <Loader2 size={18} className="animate-spin" />}
            </div>
          )}

          <div className="bg-white rounded-3xl border border-heritage-espresso/5 overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-heritage-espresso/5 flex items-center gap-3">
              <button onClick={selectAll} className="w-6 h-6 rounded border border-heritage-espresso/20 flex items-center justify-center">
                {allSelected ? 'x' : someSelected ? '-' : ''}
              </button>
              <span className="text-xs font-black uppercase tracking-widest text-heritage-espresso/45">
                Select all {visibleOrders.length} orders
              </span>
            </div>

            {loading ? (
              <div className="py-24 text-center text-heritage-espresso/35">
                <Loader2 className="animate-spin inline-block" />
                <p className="mt-3 font-serif italic">Loading live orders...</p>
              </div>
            ) : visibleOrders.length === 0 ? (
              <div className="py-24 text-center text-heritage-espresso/35">
                <ClipboardList className="mx-auto mb-4" size={42} />
                <p className="font-serif italic text-2xl">
                  {activeTab === 'all' ? 'No orders yet' : activeTab === 'pending' ? 'No pending orders' : activeTab === 'preparing' ? 'Nothing in the kitchen' : activeTab === 'ready' ? 'No ready orders' : 'No enjoying orders'}
                </p>
              </div>
            ) : visibleOrders.map((order) => (
              <div key={order.id} className={`border-b border-heritage-espresso/5 ${rowClass(order)}`}>
              <div className="grid grid-cols-[44px_1fr_auto] xl:grid-cols-[44px_100px_1.5fr_1fr_110px_150px_220px] gap-4 items-center px-5 py-5">
                <button onClick={() => toggleSelect(order.id)} className="w-6 h-6 rounded border border-heritage-espresso/20 flex items-center justify-center">
                  {selectedIds.has(order.id) ? 'x' : ''}
                </button>
                <button onClick={() => toggleExpand(order.id)} className="font-black text-heritage-espresso text-left">{displayId(order)}</button>
                <div>
                  <p className="font-serif italic text-xl text-heritage-espresso">{order.customer_name || order.guest_name || 'Guest'}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">
                    Table {tableDisplay(order)} {String(order.payment_method || '').toLowerCase() === 'cash' ? ' / Rs CASH' : ''}
                  </p>
                </div>
                <p className="text-sm text-heritage-espresso/60 truncate">{formatItems(order)}</p>
                <p className="font-serif italic text-xl text-heritage-terracotta">{formatMoney(order.total)}</p>
                <StatusBadge status={apiStatus(order)} />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[11px] font-bold" style={{ color: getAgeColor(order) }}>{getAge(order)}</span>
                  {apiStatus(order) === 'pending' && <MiniButton onClick={() => singleSetStatus(order.id, 'preparing')} icon={<ChefHat size={17} />} label="Prep" />}
                  {apiStatus(order) === 'preparing' && <MiniButton onClick={() => singleSetStatus(order.id, 'ready')} icon={<Check size={17} />} label="Ready" />}
                  {apiStatus(order) !== 'served' && <MiniButton onClick={() => singleSetStatus(order.id, 'served')} icon={<Check size={17} />} label="Enjoying" />}
                  <MiniButton onClick={() => shareWhatsAppReceipt(order)} icon={<MessageCircle size={17} />} label="WhatsApp" />
                  {apiStatus(order) === 'served' && <MiniButton onClick={() => bulkArchive([order.id])} icon={<Archive size={17} />} label="Archive" />}
                </div>
              </div>
              {expandedIds.has(order.id) && (
                <div className="mx-5 mb-5 rounded-2xl bg-heritage-stone/30 p-5 text-sm text-heritage-espresso/70">
                  <p className="font-black text-heritage-espresso">{order.customer_name || order.guest_name || 'Guest'} / {order.customer_phone || order.guest_phone || 'No phone'}</p>
                  <div className="mt-3 grid md:grid-cols-2 gap-2">
                    <p><b>Payment:</b> {order.payment_method || 'Not recorded'}</p>
                    <p><b>Source:</b> {order.source || 'customer'}</p>
                    <p><b>Order time:</b> {parseServerTime(order.created_at)?.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) || 'Unknown'}</p>
                    <p><b>Status:</b> {apiStatus(order) === 'served' ? 'enjoying' : apiStatus(order)}</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(order.items || []).map((item, index) => (
                      <div key={`${order.id}-${item.name}-${index}`} className="flex justify-between">
                        <span>{item.qty || item.quantity || 1}x {item.name} / Unit {formatMoney(item.price || item.unit_price || 0)}</span>
                        <span>{formatMoney((item.price || item.unit_price || 0) * (item.qty || item.quantity || 1))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-heritage-espresso/10 pt-3 space-y-1 font-bold">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(order.subtotal || order.total || 0)}</span></div>
                    {order.tax ? <div className="flex justify-between"><span>Tax</span><span>{formatMoney(order.tax)}</span></div> : null}
                    <div className="flex justify-between text-heritage-espresso"><span>Total</span><span>{formatMoney(order.total)}</span></div>
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionButton({ disabled, onClick, icon, label }) {
  return (
    <button disabled={disabled} onClick={onClick} className="min-h-[44px] px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">
      {icon}
      {label}
    </button>
  );
}

function MiniButton({ onClick, icon, label }) {
  return (
    <button onClick={onClick} className="min-h-[54px] min-w-[78px] px-3 py-2 rounded-2xl bg-heritage-stone text-[9px] font-black uppercase tracking-widest text-heritage-espresso/70 hover:bg-heritage-gold hover:text-white flex flex-col items-center justify-center gap-1 shadow-sm">
      <span className="leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    preparing: 'bg-blue-50 text-blue-700 border-blue-200',
    ready: 'bg-purple-50 text-purple-700 border-purple-200',
    served: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <span className={`px-4 py-2 rounded-full border text-[10px] font-black uppercase tracking-widest ${styles[status] || styles.pending}`}>
      {status === 'served' ? 'enjoying' : status}
    </span>
  );
}

function ArchiveView({ archiveDate, setArchiveDate, groupedArchive, archiveSummary, archiveOrders }) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-heritage-espresso/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="font-serif italic text-2xl text-heritage-espresso">
          Today: {formatMoney(archiveSummary.todayRevenue)} / {archiveSummary.todayCount} orders
          <span className="mx-3 text-heritage-espresso/20">|</span>
          Week: {formatMoney(archiveSummary.weekRevenue)} / {archiveSummary.weekCount} orders
        </div>
        <input
          type="date"
          value={archiveDate}
          onChange={(event) => setArchiveDate(event.target.value)}
          className="px-4 py-3 rounded-2xl border border-heritage-espresso/10 bg-white"
        />
      </div>

      {archiveOrders.length === 0 ? (
        <div className="py-24 bg-white rounded-3xl text-center text-heritage-espresso/35 font-serif italic text-2xl">Archive is empty</div>
      ) : Object.entries(groupedArchive).map(([date, rows]) => (
        <div key={date} className="space-y-3">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 px-2">
            <span>{date}</span>
            <span>{formatMoney(rows.reduce((sum, order) => sum + Number(order.total || 0), 0))} / {rows.length} orders</span>
          </div>
          {rows.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl border border-heritage-espresso/5 p-5 shadow-sm">
              <p className="font-serif italic text-xl text-heritage-espresso">{displayId(order)} - {order.customer_name || order.guest_name || 'Guest'} - {formatItems(order)} - {formatMoney(order.total)}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35 mt-2">
                Enjoying {order.served_at ? parseServerTime(order.served_at).toLocaleTimeString('en-IN') : 'unknown'} / Archived {order.archived_at ? parseServerTime(order.archived_at).toLocaleTimeString('en-IN') : 'unknown'}
              </p>
            </div>
          ))}
        </div>
      ))}
      <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">Showing last 200 archived orders</p>
    </div>
  );
}

function ManualOrderModal({ open, onClose, onCreated }) {
  const [menu, setMenu] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [lines, setLines] = useState([{ menu_item_id: '', qty: 1 }]);
  const [itemSearch, setItemSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.getAdminMenu().then(setMenu).catch(() => setError('Menu could not be loaded.'));
  }, [open]);

  if (!open) return null;

  const selectedLines = lines
    .map((line) => ({ ...line, item: menu.find((item) => String(item.id) === String(line.menu_item_id)) }))
    .filter((line) => line.item);
  const subtotal = selectedLines.reduce((sum, line) => sum + Number(line.item.price || 0) * Number(line.qty || 1), 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;
  const filteredMenu = menu.filter((item) =>
    String(item.name || '').toLowerCase().includes(itemSearch.trim().toLowerCase())
  );

  const submit = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (selectedLines.length === 0) {
      setError('Add at least one item.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createOrder({
        customer_name: customerName,
        guest_phone: phone,
        source: 'manual',
        payment_method: paymentMethod,
        order_type: 'pickup',
        items: selectedLines.map((line) => ({ id: line.item.id, qty: Number(line.qty || 1) })),
      });
      onCreated();
    } catch (err) {
      setError(err.message || 'Manual order failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-3xl font-serif italic text-heritage-espresso">Manual Order</h3>
          <button onClick={onClose} className="min-h-[44px] px-4 py-2 rounded-full bg-heritage-stone text-xs font-black uppercase">Close</button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" className="min-h-[44px] px-4 py-3 rounded-2xl border border-heritage-espresso/10" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone optional" className="min-h-[44px] px-4 py-3 rounded-2xl border border-heritage-espresso/10" />
        </div>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="min-h-[44px] px-4 py-3 rounded-2xl border border-heritage-espresso/10">
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
        </select>
        <div className="space-y-3">
          <input
            value={itemSearch}
            onChange={(event) => setItemSearch(event.target.value)}
            placeholder="Search menu items"
            className="min-h-[44px] w-full px-4 py-3 rounded-2xl border border-heritage-espresso/10"
          />
          {itemSearch.trim() && filteredMenu.length === 0 && (
            <p className="text-sm font-bold text-heritage-espresso/45">No items found</p>
          )}
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_90px_44px] gap-3">
              <select value={line.menu_item_id} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, menu_item_id: e.target.value } : row))} className="min-h-[44px] px-4 py-3 rounded-2xl border border-heritage-espresso/10">
                <option value="">Choose item</option>
                {filteredMenu.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} / Rs {item.price}</option>
                ))}
              </select>
              <input type="number" min="1" value={line.qty} onChange={(e) => setLines((prev) => prev.map((row, i) => i === index ? { ...row, qty: e.target.value } : row))} className="min-h-[44px] px-4 py-3 rounded-2xl border border-heritage-espresso/10" />
              <button onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} className="min-h-[44px] rounded-2xl bg-red-50 text-red-600">x</button>
            </div>
          ))}
          <button onClick={() => setLines((prev) => [...prev, { menu_item_id: '', qty: 1 }])} className="min-h-[44px] px-4 py-3 rounded-full bg-heritage-stone text-xs font-black uppercase">Add item</button>
        </div>
        <div className="flex items-center justify-between text-xl font-serif italic text-heritage-espresso">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <button disabled={saving} onClick={submit} className="min-h-[44px] w-full py-4 rounded-full bg-heritage-gold text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">
          {saving ? 'Submitting...' : 'Submit Manual Order'}
        </button>
      </div>
    </div>
  );
}
