import React from 'react';
import { Download, Trash2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import api from '../../../api';

const AnalyticsActions = ({ onFlushSuccess }) => {
  
  // 1. THE EXPORT ENGINE
  const handleExport = async () => {
    try {
      const payload = await api.exportAnalytics();
      const rows = payload.closures || [];
      if (rows.length === 0) {
        return alert("No historical data found to export.");
      }
      const headers = "Closed At,Revenue,Orders,Closed By\n";
      const csvContent = rows.map(row =>
        `${row.closed_at},${row.revenue},${row.orders},${row.created_by ?? ''}`
      ).join("\n");

      const blob = new Blob([headers + csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Jaya_Dhaba_Heritage_Report_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      return alert("Export failed! The vault is temporarily locked.");
    }
  };

  // 2. THE FLUSH ENGINE
  const handleFlush = async () => {
    const confirmed = window.confirm(
      "⚠️ SETTLE DAY? This will archive today's revenue and reset the dashboard to zero. This action is recorded in the heritage ledger and cannot be undone. Proceed?"
    );
    
    if (confirmed) {
      try {
        await api.flushStats();
        alert("Day settled successfully. Today's harvest has been archived. Resetting live counters...");
        if (onFlushSuccess) onFlushSuccess();
      } catch (error) {
        alert("Flush failed: " + (error?.message || 'Unknown error'));
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-10 bg-white/40 backdrop-blur-md rounded-[3.5rem] border border-heritage-espresso/5 mt-10 shadow-xl no-print">
      <div className="flex-1 space-y-2">
         <h3 className="text-xl font-serif italic text-heritage-espresso">Sovereign Control</h3>
         <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/30">Administrative Operations & Ledger Management</p>
      </div>

      <div className="flex gap-4 items-center">
        <button 
          onClick={handleExport}
          className="flex items-center gap-3 px-8 py-4 bg-white text-heritage-espresso border border-heritage-espresso/10 rounded-full hover:bg-heritage-gold hover:text-white transition-all font-black uppercase text-[9px] tracking-widest shadow-md hover:shadow-xl"
        >
          <FileSpreadsheet size={16} />
          Export CSV Ledger
        </button>

        <button 
          onClick={handleFlush}
          className="flex items-center gap-3 px-8 py-4 bg-red-50 text-red-600 border border-red-100 rounded-full hover:bg-red-600 hover:text-white transition-all font-black uppercase text-[9px] tracking-widest shadow-md hover:shadow-xl"
        >
          <Trash2 size={16} />
          End of Day Flush
        </button>
      </div>
    </div>
  );
};

export default AnalyticsActions;
