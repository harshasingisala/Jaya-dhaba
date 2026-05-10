import React, { useState, useEffect } from 'react';
import { Search, Printer, CheckCircle, Clock, ChefHat, Loader2, Utensils, Info } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../../context/AppContext';
import api from '../../../api';
import { apiUrl } from '../../../api/config';
import { createManagedEventSource } from '../../../api/realtime';

const statusColors = {
  'Placed': 'text-heritage-gold bg-heritage-gold/10 border-heritage-gold/20',
  'Confirmed': 'text-emerald-700 bg-emerald-600/10 border-emerald-600/20',
  'Preparing': 'text-sky-600 bg-sky-600/10 border-sky-600/20',
  'Ready': 'text-heritage-accent bg-heritage-accent/10 border-heritage-accent/20',
  'Served': 'text-heritage-espresso/30 bg-heritage-espresso/5 border-heritage-espresso/10',
  'Enjoying': 'text-pink-600 bg-pink-100 border-pink-200',
  'Cancelled': 'text-red-700 bg-red-50 border-red-200',
};

export default function OrdersManager() {
  const { restaurantId } = useApp();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('All');
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [isUpdating, setIsUpdating] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!restaurantId) return;
    fetchOrders();

    let stream;
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const token = user?.access_token || user?.token || '';
      if (token) {
        stream = createManagedEventSource(apiUrl(`/api/kitchen/stream?access_token=${encodeURIComponent(token)}`), {
          events: ['order.created', 'order.updated'],
          onRefresh: fetchOrders,
        });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Kitchen stream unavailable:', err);
    }

    const pollingFallback = window.setInterval(fetchOrders, 30000);

    return () => {
      stream?.close();
      window.clearInterval(pollingFallback);
    };
  }, [restaurantId]);

  const fetchOrders = async () => {
    if (!restaurantId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getOrders(restaurantId);
      setOrders(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('Failed to retrieve signals from the culinary ledger. Please refresh or verify the connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    setIsUpdating(id);
    try {
      const updated = await api.updateOrderStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setIsUpdating(null);
    }
  };

  const handlePrintKOT = (order) => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>KOT - ${order.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 20px; width: 300px; color: #4a3728; }
            .header { text-align: center; border-bottom: 2px dashed #4a3728; padding-bottom: 15px; margin-bottom: 15px; }
            .title { font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
            .id { font-size: 10px; font-weight: 900; color: #4a372866; margin-top: 5px; }
            .items { margin: 20px 0; border-bottom: 2px dashed #4a3728; padding-bottom: 15px; }
            .item { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: 700; font-size: 14px; }
            .instructions { font-size: 10px; font-style: italic; color: #4a372888; margin-top: 15px; }
            .footer { text-align: center; font-size: 9px; font-weight: 900; margin-top: 20px; opacity: 0.3; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">KITCHEN SIGNAL</div>
            <div class="id">TABLE: ${order.table || 'GUEST'} | ID: ${order.id}</div>
            <div class="id">${order.time}</div>
          </div>
          <div class="items">
            ${order.items?.map(i => `
              <div class="item">
                <span>${i.qty}x ${i.name}</span>
                <span>${i.spiceLevel || 'Standard'}</span>
              </div>
            `).join('')}
          </div>
          <div class="instructions">
            Type: ${order.type || 'Dine-in'} | Payment: ${order.paymentMode || 'Pending'}
          </div>
          <div class="footer text-small mb-5">
            © 2026 JAYA DHABA • DIGITAL HERITAGE
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    if (!orders || orders.length === 0) return;
    const headers = ['Order ID', 'Customer', 'Status', 'Total', 'Time'];
    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + orders.map(o => `${o.id},${o.customer || 'Guest'},${o.status || 'Placed'},${o.total || 0},${o.time || new Date().toISOString()}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `jaya_dhaba_orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkReady = async () => {
    const pending = orders.filter(o => ['Placed', 'Confirmed', 'Preparing'].includes(o.status));
    if (pending.length === 0) return alert("No pending orders to process, bro!");

    setIsLoading(true);
    try {
      const orderIds = pending.map(o => o.id).filter(Boolean);
      await api.bulkUpdateOrderStatus(orderIds, 'Ready');
      alert(`Successfully signaled ${orderIds.length} orders to 'Ready' status.`);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      alert("Heritage connection error during bulk update.");
    } finally {
      setIsLoading(false);
      fetchOrders();
    }
  };

  const activeOrdersCount = (orders || []).filter(o => !['Served', 'Enjoying', 'Cancelled'].includes(o.status)).length;
  const totalRevenue = (orders || []).reduce((sum, o) => sum + (o.total || 0), 0);

  const filteredOrders = (orders || []).filter(o => {
    const matchesFilter = filter === 'All' || o.status === filter || (filter === 'Placed' && o.status === 'New');
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      o.id?.toLowerCase().includes(query) ||
      o.customer_name?.toLowerCase().includes(query) ||
      o.table_number?.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex flex-col xl:flex-row gap-10 animate-in fade-in slide-in-from-left-4 duration-700">

      {/* MAIN ORDERS AREA */}
      <div className="flex-1 space-y-10">
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
          <div className="space-y-6 flex-1">
            <h2 className="text-4xl font-serif italic text-heritage-espresso leading-none">Live Kitchen Signals</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {['All', 'Placed', 'Confirmed', 'Preparing', 'Ready', 'Enjoying'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer whitespace-nowrap ${filter === s ? 'bg-heritage-espresso border-heritage-espresso text-white shadow-lg' : 'border-heritage-espresso/10 text-heritage-espresso/40 hover:text-heritage-espresso hover:border-heritage-espresso/20'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="relative group w-full md:w-80 no-print">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-heritage-espresso/20 group-focus-within:text-heritage-gold transition-colors" size={16} />
            <input
              type="text"
              placeholder="Search Orders/Items..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSearchParams({ q: e.target.value });
              }}
              className="bg-white border border-heritage-espresso/5 px-14 py-4 rounded-full text-xs font-bold w-full focus:shadow-xl transition-all outline-none text-heritage-espresso"
            />
          </div>
        </div>

        <div className="bg-white rounded-[4rem] border border-heritage-espresso/5 shadow-2xl overflow-hidden min-h-[600px]">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-heritage-stone/30 border-b border-heritage-espresso/5">
                <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Customer / ID</th>
                <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Items (Qty)</th>
                <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Total</th>
                <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Status</th>
                <th className="px-10 py-8 text-right pr-12">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-heritage-espresso/5">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="group hover:bg-heritage-stone/20 transition-all duration-300">
                  <td className="px-10 py-10">
                    <p className="text-2xl font-serif italic text-heritage-espresso leading-none mb-3">Table {order.table || 'Guest'}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-heritage-espresso/20">ID: {order.id}</p>
                  </td>
                  <td className="px-10 py-10">
                    {order.items ? (
                      <p className="text-sm italic font-medium text-heritage-espresso/60 max-w-[200px] truncate">
                        {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                      </p>
                    ) : (
                      <p className="text-sm text-heritage-espresso/20">Custom Order</p>
                    )}
                    <p className="text-[9px] font-black text-heritage-espresso/20 uppercase tracking-widest mt-2">{order.time}</p>
                  </td>
                  <td className="px-10 py-10">
                    <p className="text-2xl font-serif italic text-heritage-terracotta tracking-tighter">₹{order.total}</p>
                  </td>
                  <td className="px-10 py-10">
                    <span className={`px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${statusColors[order.status] || ''}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-10 py-10 text-right pr-12">
                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                      <button onClick={() => updateStatus(order.id, 'Preparing')} className="p-3 bg-heritage-stone rounded-2xl text-heritage-espresso/40 hover:text-sky-600 hover:shadow-lg transition-all" title="Start Preparation">
                        <ChefHat size={18} />
                      </button>
                      <button onClick={() => updateStatus(order.id, 'Ready')} className="p-3 bg-heritage-stone rounded-2xl text-heritage-espresso/40 hover:text-heritage-accent hover:shadow-lg transition-all" title="Mark Ready">
                        <CheckCircle size={18} />
                      </button>
                      {order.status === 'Ready' && (
                        <button onClick={() => updateStatus(order.id, 'Enjoying')} className="p-3 bg-heritage-stone rounded-2xl text-heritage-espresso/40 hover:text-pink-600 hover:shadow-lg transition-all" title="Mark Enjoying">
                          <Utensils size={18} />
                        </button>
                      )}
                      <button onClick={() => handlePrintKOT(order)} className="p-3 bg-heritage-stone rounded-2xl text-heritage-espresso/40 hover:text-heritage-espresso hover:shadow-lg transition-all" title="Print KOT">
                        <Printer size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="py-40 text-center">
                    <Loader2 className="animate-spin inline-block text-heritage-espresso/20" size={40} />
                    <p className="mt-4 text-heritage-espresso/20 font-serif italic text-xl">Calling heritage systems...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="5" className="py-40 text-center">
                    <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
                      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                        <Info size={32} />
                      </div>
                      <p className="text-xl font-serif italic text-red-900/60 leading-relaxed">{error}</p>
                      <button
                        onClick={fetchOrders}
                        className="px-10 py-4 bg-red-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-200"
                      >
                        Retry Connection
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-40 text-center text-heritage-espresso/10 font-serif italic text-3xl">No signals from the kitchen.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECENT FEED SIDEBAR */}
      <div className="w-full xl:w-96 space-y-10 no-print">
        <div className="bg-white/40 backdrop-blur-md p-10 rounded-[4rem] border border-heritage-espresso/5 space-y-8">
          <h3 className="text-2xl font-serif italic text-heritage-espresso">Today's Pulse</h3>
          <div className="space-y-10">
            {[
              { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString()}`, trend: 'Live', icon: <span className="text-heritage-gold">●</span> },
              { label: 'Active Orders', value: activeOrdersCount, trend: 'Live', icon: <span className="text-heritage-accent">●</span> },
              { label: 'Prep Efficiency', value: 'N/A', trend: 'No timer feed', icon: <span className="text-sky-500">●</span> },
            ].map((pulse, i) => (
              <div key={i} className="flex justify-between items-end border-b border-heritage-espresso/5 pb-8 last:border-0 last:pb-0">
                <div className="space-y-2">
                  <p className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40">
                    {pulse.icon} {pulse.label}
                  </p>
                  <p className="text-3xl font-serif italic text-heritage-espresso">{pulse.value}</p>
                </div>
                <span className="text-[10px] font-black text-heritage-gold mb-2">{pulse.trend}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-heritage-gold p-10 rounded-[4rem] text-heritage-espresso space-y-8 relative overflow-hidden group hover:bg-heritage-espresso hover:text-white transition-all duration-700">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/20 rounded-full -mr-24 -mt-24 blur-3xl group-hover:bg-white/5 transition-colors" />
          <h3 className="text-2xl font-serif italic relative z-10">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4 relative z-10 mt-8">
            <button onClick={handleBulkReady} className="bg-white/20 hover:bg-white/30 p-6 rounded-3xl text-[9px] font-black uppercase tracking-widest transition-all">Bulk Ready</button>
            <button onClick={handleExportCSV} className="bg-white/20 hover:bg-white/30 p-6 rounded-3xl text-[9px] font-black uppercase tracking-widest transition-all">Export CSV</button>
          </div>
        </div>
      </div>

    </div>
  );
}
