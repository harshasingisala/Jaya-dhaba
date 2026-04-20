import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import Navbar from '../../components/Navbar';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  TrendingUp, 
  Search, 
  Activity, 
  BarChart3, 
  MoreVertical,
  ShieldCheck,
  Mail,
  MapPin,
  Clock,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AdminDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date: '',
    venue: '',
    price: 1,
    description: '',
    category: 'Workshop'
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && users.length === 0) fetchUsers();
    if (activeTab === 'events' && events.length === 0) fetchEvents();
  }, [activeTab]);

  const fetchInitialData = async () => {
    try {
      const response = await api.get('/api/admin/analytics');
      setAnalytics(response.analytics);
    } catch (err) {
      console.error('Analytics failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setTabLoading(true);
    try {
      const response = await api.get('/api/admin/users');
      setUsers(response);
    } catch (err) {
      console.error('Fetch users failed:', err);
    } finally {
      setTabLoading(false);
    }
  };

  const handleExport = () => {
    if (!analytics?.recentBookings) return;
    
    const headers = ["Attendee", "Email", "Event", "Seat", "Payment ID", "Status", "Date"];
    const rows = analytics.recentBookings.map(b => [
      b.userId?.name || 'Anonymous',
      b.userId?.email || 'N/A',
      b.eventId?.title || 'Unknown',
      b.seatId,
      b.paymentId || 'N/A',
      'Success',
      new Date(b.createdAt).toLocaleDateString()
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers, ...rows].map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `feedx_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setTabLoading(true);
    try {
      await api.post('/api/admin/events', newEvent);
      setShowAddEvent(false);
      setNewEvent({ title: '', date: '', venue: '', price: 1, description: '', category: 'Workshop' });
      fetchEvents();
      fetchInitialData(); // Refresh analytics
    } catch (err) {
      console.error('Create event failed:', err);
      alert('Failed to create event. Check console for details.');
    } finally {
      setTabLoading(false);
    }
  };

  const fetchEvents = async () => {
    setTabLoading(true);
    try {
      const response = await api.get('/api/admin/events');
      setEvents(response);
    } catch (err) {
      console.error('Fetch events failed:', err);
    } finally {
      setTabLoading(false);
    }
  };

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-secondary animate-pulse font-headline uppercase tracking-widest">Generating Insights...</div>;

  const stats = [
    { label: 'Total Revenue', value: `₹${analytics?.totalRevenue || 0}`, icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Active Bookings', value: analytics?.totalBookings || 0, icon: Calendar, color: 'text-primary' },
    { label: 'Total Users', value: analytics?.totalUsers || 0, icon: Users, color: 'text-secondary' },
    { label: 'Seats Occupied', value: analytics?.occupancy?.sold || 0, icon: Activity, color: 'text-orange-400' },
  ];

  const renderContent = () => {
    if (tabLoading) return <div className="flex-1 flex items-center justify-center text-slate-500 font-bold uppercase tracking-widest animate-pulse transition-all">Synchronizing Data...</div>;

    switch (activeTab) {
      case 'users':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex justify-between items-end mb-8">
               <div>
                  <h2 className="text-3xl font-black text-white font-headline tracking-tight">User Directory</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Managed accounts and credentials</p>
               </div>
               <div className="flex gap-4">
                  <button className="h-10 px-4 bg-slate-900 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Bulk Import</button>
                  <button className="h-10 px-4 bg-primary rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 flex items-center gap-2"><Plus className="w-3 h-3" /> Add User</button>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
               {users.map((user) => (
                  <div key={user._id} className="p-6 rounded-[32px] bg-slate-900/40 border border-white/5 hover:border-primary/30 transition-all group relative overflow-hidden">
                     <div className="absolute top-4 right-4 capitalize text-[9px] px-2 py-0.5 rounded-md bg-slate-950 border border-white/5 text-slate-500 font-bold tracking-widest">
                        {user.role}
                     </div>
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-white/5 flex items-center justify-center text-primary font-black text-xl">
                           {user.name.charAt(0)}
                        </div>
                        <div>
                           <h4 className="font-bold text-white group-hover:text-primary transition-colors">{user.name}</h4>
                           <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{user.branch || 'General'} • {user.year || '2026'}</span>
                        </div>
                     </div>
                     <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-400">
                           <Mail className="w-3.5 h-3.5" />
                           <span className="text-xs truncate">{user.email}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400">
                           <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                           <span className="text-xs">{user.activity?.length || 0} Actions Logged</span>
                        </div>
                     </div>
                     <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center">
                        <button className="text-[10px] font-black uppercase tracking-widest text-primary">View Profile</button>
                        <MoreVertical className="w-4 h-4 text-slate-700 cursor-pointer hover:text-slate-400" />
                     </div>
                  </div>
               ))}
            </div>
          </motion.div>
        );

      case 'events':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="flex justify-between items-end mb-8">
               <div>
                  <h2 className="text-3xl font-black text-white font-headline tracking-tight">Event Management</h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Schedules and configurations</p>
               </div>
               <button 
                onClick={() => setShowAddEvent(true)}
                className="h-10 px-4 bg-primary rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> New Event
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
               {events.map((event) => (
                  <div key={event._id} className="rounded-[40px] bg-slate-900/40 border border-white/5 overflow-hidden flex group hover:border-primary/20 transition-all">
                     <div className="w-48 bg-slate-950 p-6 flex flex-col justify-center items-center gap-2 border-r border-white/5">
                        <span className="text-3xl font-black text-white">{new Date(event.date).getDate()}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">{new Date(event.date).toLocaleString('default', { month: 'short' })}</span>
                     </div>
                     <div className="flex-1 p-8 relative">
                        <div className="absolute top-6 right-8 flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                           <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Live</span>
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2 group-hover:text-primary transition-colors">{event.title}</h4>
                        <div className="flex items-center gap-6 mt-6">
                           <div className="flex flex-col gap-1">
                              <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest leading-none">Venue</span>
                              <span className="text-xs font-bold text-slate-300">{event.venue}</span>
                           </div>
                           <div className="flex flex-col gap-1">
                              <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest leading-none">Price</span>
                              <span className="text-xs font-bold text-slate-300">₹{event.price || '0'}</span>
                           </div>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
          </motion.div>
        );

      case 'overview':
      default:
        return (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
               {stats.map((stat, i) => (
                  <motion.div 
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-6 rounded-[32px] bg-slate-900/40 border border-white/5 hover:border-primary/20 transition-all group"
                  >
                     <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-2xl bg-slate-950 border border-white/5 ${stat.color} shadow-lg shadow-black/20`}>
                           <stat.icon className="w-5 h-5" />
                        </div>
                        <MoreVertical className="w-4 h-4 text-slate-700 cursor-pointer hover:text-slate-400" />
                     </div>
                     <h4 className="text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1">{stat.label}</h4>
                     <span className="text-3xl font-black text-white tracking-tight">{stat.value}</span>
                  </motion.div>
               ))}
            </div>

            {/* Recent Bookings Table */}
            <div className="rounded-[40px] bg-slate-900/40 border border-white/5 overflow-hidden">
               <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white font-headline">Recent Activity</h3>
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] animate-pulse">Live</span>
               </div>
               
               <div className="overflow-x-auto">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="bg-slate-950/30 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                           <th className="px-8 py-5">Attendee</th>
                           <th className="px-8 py-5">Event</th>
                           <th className="px-8 py-5">Seat</th>
                           <th className="px-8 py-5">Status</th>
                           <th className="px-8 py-5">Date</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {analytics?.recentBookings?.map((booking) => (
                          <tr key={booking._id} className="hover:bg-white/5 transition-colors group">
                             <td className="px-8 py-5">
                                <div className="flex flex-col">
                                   <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{booking.userId?.name || 'Anonymous'}</span>
                                   <span className="text-[10px] text-slate-500">{booking.userId?.email}</span>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{booking.eventId?.title || 'Unknown'}</span>
                             </td>
                             <td className="px-8 py-5">
                                <span className="px-3 py-1 bg-slate-950 border border-white/10 rounded-lg text-primary font-bold text-[10px]">{booking.seatId}</span>
                             </td>
                             <td className="px-8 py-5">
                                <div className="flex items-center gap-2">
                                   <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                                   <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Success</span>
                                </div>
                             </td>
                             <td className="px-8 py-5">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                   {new Date(booking.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                </span>
                             </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-slate-900/40 border-r border-white/5 p-6 space-y-8 print:hidden">
          <div className="flex items-center gap-3 px-4 py-2 mb-8">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
               <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Admin Console</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Premium Edition</p>
            </div>
          </div>

          <nav className="space-y-2">
             <NavItem active={activeTab === 'overview'} icon={LayoutDashboard} label="Overview" onClick={() => setActiveTab('overview')} />
             <NavItem active={activeTab === 'users'} icon={Users} label="User Directory" onClick={() => setActiveTab('users')} />
             <NavItem active={activeTab === 'events'} icon={Calendar} label="Event Management" onClick={() => setActiveTab('events')} />
             <NavItem active={activeTab === 'reports'} icon={BarChart3} label="Detailed Reports" onClick={() => setActiveTab('reports')} />
          </nav>

          <div className="pt-20">
             <div className="p-4 rounded-3xl bg-primary/5 border border-primary/10">
                <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-2 text-center">System Health</p>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                   <div className="w-full h-full bg-primary" />
                </div>
                <p className="text-center text-[9px] text-slate-500 mt-2 font-bold uppercase tracking-widest">Cluster 01 Online</p>
             </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-10 custom-scrollbar">
          <header className="flex justify-between items-center mb-12">
             <div>
                <h1 className="text-4xl font-black font-headline text-white tracking-tight">
                  {activeTab === 'overview' && 'Dashboard Overview'}
                  {activeTab === 'users' && 'User Directory'}
                  {activeTab === 'events' && 'Event Management'}
                  {activeTab === 'reports' && 'Analytics Reports'}
                </h1>
                <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-widest">
                  {activeTab === 'overview' && 'Real-time Auditorum Metrics'}
                  {activeTab === 'users' && 'Delegate and Staff listing'}
                  {activeTab === 'events' && 'Scheduling and auditorium layout'}
                  {activeTab === 'reports' && 'Deep-dive behavioral data'}
                </p>
             </div>
             
             <div className="flex gap-4">
                <div className="relative group">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-primary transition-colors" />
                   <input 
                    type="text" 
                    placeholder="Global Search..." 
                    className="h-12 w-64 bg-slate-900/50 border border-white/5 rounded-2xl pl-12 pr-4 text-xs font-bold text-white placeholder:text-slate-600 focus:outline-none focus:border-primary/30 transition-all"
                   />
                </div>
                 <button 
                  onClick={handleExport}
                  className="h-12 px-6 bg-primary text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all"
                >
                  Export Data
                </button>
             </div>
          </header>

          <AnimatePresence>
            {showAddEvent && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[40px] p-10 shadow-2xl space-y-8"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-black text-white font-headline">New Event Configuration</h3>
                    <button onClick={() => setShowAddEvent(false)} className="text-slate-500 hover:text-white">✕</button>
                  </div>
                  <form onSubmit={handleCreateEvent} className="space-y-4">
                    <input 
                      required 
                      placeholder="Event Title" 
                      className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-primary/50" 
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                    />
                    <input 
                      required 
                      type="datetime-local" 
                      className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-primary/50" 
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                    />
                    <input 
                      required 
                      placeholder="Venue Name" 
                      className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-primary/50" 
                      value={newEvent.venue}
                      onChange={(e) => setNewEvent({...newEvent, venue: e.target.value})}
                    />
                    <div className="flex gap-4">
                      <input 
                        required 
                        type="number" 
                        placeholder="Seat Price (₹)" 
                        className="flex-1 bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-primary/50" 
                        value={newEvent.price}
                        onChange={(e) => setNewEvent({...newEvent, price: e.target.value})}
                      />
                      <select 
                        required 
                        className="flex-1 bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-primary/50"
                        value={newEvent.category}
                        onChange={(e) => setNewEvent({...newEvent, category: e.target.value})}
                      >
                        <option value="Workshop">Workshop</option>
                        <option value="Seminar">Seminar</option>
                        <option value="Concert">Concert</option>
                        <option value="Compitition">Competition</option>
                      </select>
                    </div>
                    <textarea 
                      placeholder="Brief Description" 
                      multiline 
                      className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm text-white outline-none focus:border-primary/50 min-h-[100px]"
                      value={newEvent.description}
                      onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                    />
                    <button type="submit" className="w-full h-14 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all">Generate Event Environment</button>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {renderContent()}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

const NavItem = ({ active, icon: Icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 h-14 rounded-2xl transition-all group ${
      active 
        ? 'bg-primary text-white shadow-xl shadow-primary/20' 
        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
    }`}
  >
     <Icon className={`w-5 h-5 transition-transform ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
     <span className="text-xs font-bold uppercase tracking-widest whitespace-nowrap">{label}</span>
  </button>
);

export default AdminDashboard;
