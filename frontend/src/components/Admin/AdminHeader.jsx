import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Download, Trash2, Plus, Menu } from 'lucide-react';
import api from '../../api';

/**
 * GLOBAL ADMIN HEADER - v5.0 (RESPONSIVE)
 * Features: Mobile Toggle, Sticky Utility Bar & Direct Supabase Actions
 */
export default function AdminHeader({ onMenuToggle }) {
  const location = useLocation();
  const navigate = useNavigate();

  const getBreadcrumbs = () => {
    const path = location.pathname.split('/').filter(x => x);
    return path.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' / ');
  };

  const handleFlush = async () => {
    if (confirm("🚨 WARNING: This will settle all current stats into history and clear the live dashboard. Proceed?")) {
      try {
        await api.flushStats();
        alert("✅ Heritage Ledger Settle Successful.");
        window.location.reload();
      } catch (e) {
        if (import.meta.env.DEV) console.error("Flush Failure:", e);
        alert("❌ Flush failed.");
      }
    }
  };

  const handleExport = async () => {
    try {
      const stats = await api.getStats();
      const csvContent = "data:text/csv;charset=utf-8," + 
        "Date,Revenue,Total_Orders\n" + 
        `${new Date().toLocaleDateString()},${stats.revenue},${stats.total_orders}`;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `jaya_heritage_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      if (import.meta.env.DEV) console.error("Export Failure:", e);
      alert("❌ Export failed.");
    }
  };

  return (
    <div className="h-24 px-6 md:px-10 flex items-center justify-between border-b border-heritage-espresso/5 bg-white/50 backdrop-blur-xl sticky top-0 z-[100] no-print">
      
      {/* MOBILE TOGGLE & VIEW INDICATOR */}
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

      {/* GLOBAL UTILITIES */}
      <div className="flex items-center gap-4 md:gap-8">
        
        {/* ACTION BAR */}
        <div className="flex items-center gap-2 md:gap-3 pr-4 md:pr-8 border-r border-heritage-espresso/5">
           <button 
             onClick={handleExport}
             title="Download Heritage Ledger (CSV)"
             className="p-2 md:p-3 text-heritage-espresso/40 hover:text-heritage-gold hover:bg-heritage-gold/5 rounded-2xl transition-all"
           >
              <Download size={16} md:size={18} />
           </button>
           <button 
             onClick={handleFlush}
             title="End of Day Settle"
             className="p-2 md:p-3 text-heritage-espresso/40 hover:text-heritage-terracotta hover:bg-heritage-terracotta/5 rounded-2xl transition-all"
           >
              <Trash2 size={16} md:size={18} />
           </button>
        </div>

        {/* NOTIFICATIONS & QUICK ACTION */}
        <div className="flex items-center gap-4 md:gap-6">
           <div className="hidden sm:block relative p-2 text-heritage-espresso/20 hover:text-heritage-espresso cursor-pointer transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-heritage-gold rounded-full" />
           </div>
           <button 
             onClick={() => navigate('/admin/reservations')}
             className="bg-heritage-espresso text-white px-6 md:px-8 py-2.5 md:py-3 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-[0.4em] shadow-xl hover:bg-heritage-gold transition-all flex items-center gap-2 md:gap-3"
           >
             <Plus size={14} /> <span className="hidden xs:inline">Add Signal</span>
           </button>
        </div>
      </div>

    </div>
  );
}
