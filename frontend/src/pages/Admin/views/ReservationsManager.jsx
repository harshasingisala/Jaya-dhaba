import React, { useState, useEffect } from 'react';
import { Search, Filter, MoreVertical, CheckCircle2, XCircle, Clock, Loader2, Info } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../api';

const statusStyles = {
  'New': 'bg-heritage-gold/10 text-heritage-gold border-heritage-gold/20',
  'Confirmed': 'bg-heritage-accent/10 text-heritage-accent border-heritage-accent/20',
  'Completed': 'bg-heritage-espresso/5 text-heritage-espresso/40 border-heritage-espresso/10',
  'Cancelled': 'bg-red-500/10 text-red-500 border-red-500/20'
};

export default function ReservationsManager() {
  const [reservations, setReservations] = useState([]);
  const [activeTab, setActiveTab] = useState('New');
  const [isUpdating, setIsUpdating] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const statusTabs = ['All', 'New', 'Confirmed', 'Completed', 'Cancelled'];

  useEffect(() => {
    fetchReservations();
  }, []);

  const filteredReservations = (reservations || []).filter(r => {
    const matchesFilter = activeTab === 'All' || (r.status || 'New') === activeTab;
    const matchesSearch = (r.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const fetchReservations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getReservations();
      setReservations(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('The guest ledger is momentarily inaccessible. Please refresh or check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateReservation = async (id, status) => {
    setIsUpdating(id);
    try {
      await api.updateReservation(id, status);
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setIsUpdating(null);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-10 animate-in fade-in slide-in-from-right-4 duration-700">
      
      {/* MAIN TABLE SECTION */}
      <div className="flex-1 space-y-8">
        <div className="flex items-center justify-between">
            <h2 className="text-3xl font-serif italic text-heritage-espresso">Reservations</h2>
            <div className="flex gap-4">
               <div className="relative group">
                 <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-heritage-espresso/20 group-focus-within:text-heritage-gold" />
                 <input 
                   placeholder="Search..." 
                   value={searchTerm}
                   onChange={(e) => {
                     setSearchTerm(e.target.value);
                     setSearchParams({ q: e.target.value });
                   }}
                   className="bg-white border border-heritage-espresso/5 pl-10 pr-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest outline-none focus:border-heritage-gold w-40" 
                 />
               </div>
              <button
                onClick={() => {
                  const idx = statusTabs.indexOf(activeTab);
                  const next = statusTabs[(idx + 1) % statusTabs.length];
                  setActiveTab(next);
                }}
                title={`Cycle status filter (current: ${activeTab})`}
                className="p-2 border border-heritage-espresso/10 rounded-xl hover:bg-white text-heritage-espresso/40 transition-colors"
              >
                <Filter size={18} />
              </button>
            </div>
        </div>

        {/* TABS */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-heritage-espresso/5">
           {statusTabs.map(tab => (
             <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === tab ? 'text-heritage-espresso' : 'text-heritage-espresso/20 hover:text-heritage-espresso/60'}`}
             >
               {tab}
               {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-heritage-terracotta rounded-t-full" />}
             </button>
           ))}
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-[3rem] border border-heritage-espresso/5 shadow-xl overflow-hidden min-h-[500px]">
           <table className="w-full text-left">
              <thead>
                <tr className="border-b border-heritage-espresso/5 bg-heritage-stone/30">
                  <th className="px-8 py-6 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">ID / Guest</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">Table</th>
                  <th className="px-10 py-6 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">Time</th>
                  <th className="px-10 py-6 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">Size</th>
                  <th className="px-10 py-6 text-[9px] font-black uppercase tracking-widest text-heritage-espresso/40">Status</th>
                  <th className="px-8 py-6 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-heritage-espresso/5">
                {filteredReservations.map((res, i) => (
                  <tr key={res.id} className="group hover:bg-heritage-stone/20 transition-all">
                    <td className="px-8 py-8">
                       <p className="text-xl font-serif italic text-heritage-espresso leading-none">{res.name}</p>
                       <p className="text-[8px] font-black uppercase tracking-widest text-heritage-espresso/30 mt-2">#{res.id}</p>
                    </td>
                    <td className="px-8 py-8">
                       <span className="text-sm font-black text-heritage-espresso/60 tracking-widest uppercase">Table {res.tableNo || 'TBD'}</span>
                    </td>
                    <td className="px-10 py-8">
                       <p className="text-xs font-bold text-heritage-espresso/60">{res.time}</p>
                    </td>
                    <td className="px-10 py-8">
                       <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-heritage-gold">{res.guests || res.partySize}</span>
                          <span className="text-[9px] font-bold text-heritage-espresso/20 uppercase tracking-widest">Guests</span>
                       </div>
                    </td>
                    <td className="px-10 py-8">
                       <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${res.status ? statusStyles[res.status] : statusStyles['New']}`}>
                         {res.status || 'New'}
                       </span>
                    </td>
                    <td className="px-8 py-8 text-right">
                       <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            disabled={isUpdating === res.id}
                            onClick={() => updateReservation(res.id, 'Confirmed')}
                            className="p-2.5 bg-heritage-stone rounded-xl text-heritage-espresso/40 hover:text-heritage-accent transition-colors disabled:opacity-50"
                          >
                             <CheckCircle2 size={16} />
                          </button>
                          <button 
                            disabled={isUpdating === res.id}
                            onClick={() => updateReservation(res.id, 'Cancelled')}
                            className="p-2.5 bg-heritage-stone rounded-xl text-heritage-espresso/40 hover:text-red-500 transition-colors disabled:opacity-50"
                          >
                             <XCircle size={16} />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))}
                {isLoading ? (
                   <tr>
                     <td colSpan="6" className="py-20 text-center">
                        <Loader2 className="animate-spin inline-block text-heritage-espresso/20" size={40} />
                        <p className="mt-4 text-heritage-espresso/40 font-serif italic text-xl">Consulting reservation logs...</p>
                     </td>
                   </tr>
                 ) : error ? (
                    <tr>
                      <td colSpan="6" className="py-40 text-center">
                         <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
                            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                               <Info size={32} />
                            </div>
                            <p className="text-xl font-serif italic text-red-900/60 leading-relaxed">{error}</p>
                            <button 
                              onClick={fetchReservations}
                              className="px-10 py-4 bg-red-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-200"
                            >
                              Retry Connection
                            </button>
                         </div>
                      </td>
                    </tr>
                 ) : filteredReservations.length === 0 ? (
                   <tr>
                     <td colSpan="6" className="py-20 text-center text-heritage-espresso/20 font-serif italic text-2xl">No reservations found.</td>
                   </tr>
                 ) : null}
              </tbody>
           </table>
        </div>
      </div>

    </div>
  );
}
