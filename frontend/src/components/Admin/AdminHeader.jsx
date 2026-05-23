import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Archive, Bell, Download, Loader2, Plus, Menu, Volume2 } from 'lucide-react';
import api from '../../api';
import { RTStatus } from './RTStatus';
import { useToast } from '../../context/ToastContext';

export default function AdminHeader({ onMenuToggle, onTestSound }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [ordersPaused, setOrdersPaused] = useState(false);
  const [isClearingServed, setIsClearingServed] = useState(false);

  useEffect(() => {
    api.getAdminOrderPauseStatus().then((data) => setOrdersPaused(!!data.paused)).catch(() => {});
    const handler = (event) => {
      if (event.detail?.action === 'orders_paused') setOrdersPaused(!!event.detail.paused);
    };
    window.addEventListener('rt:settings', handler);
    return () => window.removeEventListener('rt:settings', handler);
  }, []);

  const getBreadcrumbs = () => {
    const path = location.pathname.split('/').filter((x) => x);
    return path.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' / ');
  };

  const handleClearServed = async () => {
    const confirmed = window.confirm('Archive served orders from the live queue? Order history will be preserved.');
    if (!confirmed) return;

    setIsClearingServed(true);
    try {
      const result = await api.clearServedOrders();
      showToast(`${result?.cleared || 0} served orders archived.`, 'success');
      window.dispatchEvent(new Event('rt:orders'));
      window.dispatchEvent(new Event('rt:analytics'));
    } catch (e) {
      if (import.meta.env.DEV) console.error('Clear served orders failed:', e);
      showToast('Clear served orders failed. Nothing was changed.', 'error');
    } finally {
      setIsClearingServed(false);
    }
  };

  const handleExport = async () => {
    try {
      const stats = await api.getStats();
      const csvContent = 'data:text/csv;charset=utf-8,'
        + 'Date,Revenue,Total_Orders\n'
        + `${new Date().toLocaleDateString()},${stats.revenue},${stats.total_orders}`;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `jaya_heritage_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Ledger downloaded successfully.', 'success');
    } catch (e) {
      if (import.meta.env.DEV) console.error('Export Failure:', e);
      showToast('Export failed. Please try again.', 'error');
    }
  };

  const handleEnableNotifications = () => {
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported here.', 'error');
      return;
    }
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        showToast('Notifications enabled', 'success');
      } else {
        showToast('Notifications were not enabled.', 'info');
      }
    }).catch(() => showToast('Notification permission failed.', 'error'));
  };

  const handleTestSound = () => {
    onTestSound?.();
    showToast('Sound test played.', 'success');
  };

  return (
    <div className="h-24 px-6 md:px-10 flex items-center justify-between border-b border-heritage-espresso/5 bg-white/50 backdrop-blur-xl sticky top-0 z-[100] no-print">
      <div className="flex items-center gap-4 md:gap-6">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-3 bg-heritage-espresso text-white rounded-2xl shadow-lg active:scale-95"
        >
          <Menu size={18} />
        </button>
        <h2 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-heritage-espresso/30">
          <span className="hidden sm:inline">Control Suite / </span>
          <span className="text-heritage-espresso">{getBreadcrumbs() || 'Dashboard'}</span>
        </h2>
      </div>

      <div className="flex items-center gap-4 md:gap-8">
        <div className="flex items-center gap-2 md:gap-3 pr-4 md:pr-8 border-r border-heritage-espresso/5">
          <button
            onClick={handleExport}
            title="Download Heritage Ledger (CSV)"
            className="p-2 md:p-3 text-heritage-espresso/40 hover:text-heritage-gold hover:bg-heritage-gold/5 rounded-2xl transition-all"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleTestSound}
            title="Test Sound"
            className="p-2 md:p-3 text-heritage-espresso/40 hover:text-heritage-gold hover:bg-heritage-gold/5 rounded-2xl transition-all"
          >
            <Volume2 size={16} />
          </button>
          <button
            onClick={handleEnableNotifications}
            title="Enable Notifications"
            className="p-2 md:p-3 text-heritage-espresso/40 hover:text-heritage-gold hover:bg-heritage-gold/5 rounded-2xl transition-all"
          >
            <Bell size={16} />
          </button>
          <button
            onClick={handleClearServed}
            disabled={isClearingServed}
            title="Clear Served Orders"
            className="p-2 md:p-3 text-heritage-espresso/40 hover:text-heritage-terracotta hover:bg-heritage-terracotta/5 rounded-2xl transition-all disabled:opacity-60"
          >
            {isClearingServed ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
          </button>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <RTStatus />
          {ordersPaused && (
            <span className="px-4 py-2 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-widest">
              Orders Paused
            </span>
          )}
          <button
            onClick={() => navigate('/admin/orders?action=new-order')}
            className="bg-heritage-espresso text-white px-6 md:px-8 py-2.5 md:py-3 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] shadow-xl hover:bg-heritage-gold transition-all flex items-center gap-2 md:gap-3"
          >
            <Plus size={14} /> <span className="hidden xs:inline">Manual Order</span>
          </button>
        </div>
      </div>
    </div>
  );
}
