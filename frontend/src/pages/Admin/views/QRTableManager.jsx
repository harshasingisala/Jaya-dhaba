import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Download, ExternalLink, Loader2, Printer, QrCode, RefreshCw, ToggleLeft, ToggleRight, Trash2, Utensils } from 'lucide-react';
import api from '../../../api';
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

export default function QRTableManager() {
  const [tables, setTables] = useState([]);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [qrUrls, setQrUrls] = useState({});
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
      const rows = await api.getAdminTables();
      setTables(rows);
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
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {sortedTables.map((table) => {
            const isBusy = busyId === table.id;
            const hasOrder = Boolean(table.active_order);
            const qrLink = tableQrUrl(table);
            return (
              <article key={table.id} className="rounded-3xl border border-heritage-espresso/5 bg-white p-5 shadow-sm">
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
                        <p className="mt-1 text-lg font-black">#{orderNumber(table.active_order)}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                        {orderStatus(table.active_order)}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold text-red-950/70">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-red-700/45">Guest</p>
                        <p className="mt-1 truncate">{table.active_order.guest_name || 'Guest'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-red-700/45">Items</p>
                        <p className="mt-1">{table.active_order.item_count || 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-red-700/45">Since</p>
                        <p className="mt-1">{formatTime(table.active_order.created_at)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-700">
                        <Utensils size={14} />
                        Table total
                      </span>
                      <span className="font-serif italic text-2xl text-red-800">{formatMoney(table.active_order.total)}</span>
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
                  <p className="mt-4 text-center text-xs font-bold text-heritage-espresso/50">
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
    </div>
  );
}
