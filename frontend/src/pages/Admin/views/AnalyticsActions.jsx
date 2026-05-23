import React, { useState } from 'react';
import { Archive, FileSpreadsheet, Loader2, RotateCcw } from 'lucide-react';
import api from '../../../api';
import { useToast } from '../../../context/ToastContext';

const AnalyticsActions = ({ onRefresh, onResetView }) => {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const payload = await api.exportAnalytics();
      const rows = payload.closures || [];
      if (rows.length === 0) {
        showToast('No historical ledger data found yet.', 'info');
        return;
      }

      const headers = 'Closed At,Revenue,Orders,Closed By\n';
      const csvContent = rows.map((row) =>
        `${row.closed_at},${row.revenue},${row.orders},${row.created_by ?? ''}`
      ).join('\n');

      const blob = new Blob([headers + csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Jaya_Dhaba_Heritage_Report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast('Ledger exported successfully.', 'success');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Analytics export failed', error);
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearServed = async () => {
    const confirmed = window.confirm(
      'Archive served orders from the live queue? Order history will be preserved.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const result = await api.clearServedOrders();
      showToast(`${result?.cleared || 0} served orders archived.`, 'success');
      window.dispatchEvent(new Event('rt:orders'));
      window.dispatchEvent(new Event('rt:analytics'));
      if (onRefresh) await onRefresh();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Clear served orders failed', error);
      showToast('Clear served orders failed. Nothing was changed.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const handleResetView = async () => {
    setIsResetting(true);
    try {
      if (onResetView) {
        await onResetView();
      } else if (onRefresh) {
        await onRefresh();
      }
      showToast("Today's analytics view refreshed.", 'success');
    } catch (error) {
      if (import.meta.env.DEV) console.error('Reset analytics view failed', error);
      showToast('Could not refresh analytics. Please try again.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-10 bg-white/40 backdrop-blur-md rounded-[3.5rem] border border-heritage-espresso/5 mt-10 shadow-xl no-print">
      <div className="flex-1 space-y-2">
        <h3 className="text-xl font-serif italic text-heritage-espresso">Sovereign Control</h3>
        <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">Administrative Operations & Ledger Management</p>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-3 px-8 py-4 bg-white text-heritage-espresso border border-heritage-espresso/10 rounded-full hover:bg-heritage-gold hover:text-white transition-all font-black uppercase text-[9px] tracking-widest shadow-md hover:shadow-xl disabled:opacity-60"
        >
          {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
          Export CSV Ledger
        </button>

        <button
          onClick={handleResetView}
          disabled={isResetting}
          className="flex items-center gap-3 px-8 py-4 bg-white text-heritage-espresso border border-heritage-espresso/10 rounded-full hover:bg-heritage-espresso hover:text-white transition-all font-black uppercase text-[9px] tracking-widest shadow-md hover:shadow-xl disabled:opacity-60"
        >
          {isResetting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
          Reset Today's View
        </button>

        <button
          onClick={handleClearServed}
          disabled={isClearing}
          className="flex items-center gap-3 px-8 py-4 bg-red-50 text-red-600 border border-red-100 rounded-full hover:bg-red-600 hover:text-white transition-all font-black uppercase text-[9px] tracking-widest shadow-md hover:shadow-xl disabled:opacity-60"
        >
          {isClearing ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
          Clear Served Orders
        </button>
      </div>
    </div>
  );
};

export default AnalyticsActions;
