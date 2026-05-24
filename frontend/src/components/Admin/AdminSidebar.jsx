import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  UtensilsCrossed, 
  Users, 
  PieChart, 
  Settings, 
  LogOut,
  ChevronRight,
  Mail,
  X,
  TrendingUp,
  BarChart3,
  QrCode
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';

const NavItem = ({ icon, label, path, active, onClick, badge }) => (
  <button 
    onClick={() => onClick(path)}
    className={`w-full flex items-center justify-between p-5 rounded-[2rem] transition-all duration-500 group ${
      active 
        ? 'bg-heritage-espresso text-white shadow-2xl scale-105' 
        : 'text-heritage-espresso/40 hover:bg-white hover:text-heritage-espresso hover:shadow-xl'
    }`}
  >
    <div className="flex items-center gap-5">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${active ? 'bg-heritage-gold text-heritage-espresso' : 'bg-heritage-stone group-hover:bg-heritage-gold/20'}`}>
        {icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-[0.3em]">{label}</span>
      {badge > 0 && (
        <span className={`min-w-6 h-6 px-2 rounded-full inline-flex items-center justify-center text-[9px] font-black ${active ? 'bg-white text-heritage-espresso' : 'bg-heritage-gold text-heritage-espresso'}`}>
          {badge}
        </span>
      )}
    </div>
    {active && <ChevronRight size={14} className="animate-pulse" />}
  </button>
);

export default function AdminSidebar({ mobileOpen, setMobileOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [unreadInbox, setUnreadInbox] = useState(0);

  async function loadUnreadInbox() {
    try {
      const payload = await api.getContactSubmissions();
      setUnreadInbox(Number(payload?.unread || 0));
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Inbox badge unavailable:', err);
    }
  }

  useEffect(() => {
    loadUnreadInbox();
    const handler = () => loadUnreadInbox();
    window.addEventListener('rt:contact', handler);
    const timer = window.setInterval(loadUnreadInbox, 60000);
    return () => {
      window.removeEventListener('rt:contact', handler);
      window.clearInterval(timer);
    };
  }, []);

  const menuItems = [
    { icon: <LayoutDashboard size={18} />, label: 'Overview', path: '/admin' },
    { icon: <TrendingUp size={18} />, label: 'Revenue Center', path: '/admin/revenue' },
    { icon: <BarChart3 size={18} />, label: 'Reports', path: '/admin/reports' },
    { icon: <Mail size={18} />, label: 'Inbox', path: '/admin/inbox', badge: unreadInbox },
    { icon: <ShoppingBag size={18} />, label: 'Live Orders', path: '/admin/orders' },
    { icon: <QrCode size={18} />, label: 'Tables & QR', path: '/admin/tables' },
    { icon: <UtensilsCrossed size={18} />, label: 'The Menu', path: '/admin/menu' },
    { icon: <Users size={18} />, label: 'Reservations', path: '/admin/reservations' },
    { icon: <PieChart size={18} />, label: 'Intelligence', path: '/admin/analytics' },
    { icon: <Settings size={18} />, label: 'Operations', path: '/admin/settings' },
  ];

  const handleNav = (path) => {
    navigate(path);
    if (setMobileOpen) setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    if (setMobileOpen) setMobileOpen(false);
    navigate('/admin/login', { replace: true });
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-heritage-stone/95 backdrop-blur-xl border-r border-heritage-espresso/5 p-10">
      {/* BRANDING */}
      <div className="mb-20 px-4 flex justify-between items-center group">
         <div className="flex items-center gap-4 cursor-pointer" onClick={() => handleNav('/')}>
            <div className="w-10 h-10 bg-heritage-espresso rounded-2xl flex items-center justify-center text-heritage-gold shadow-lg group-hover:rotate-12 transition-transform">
               <span className="font-serif italic text-2xl">J</span>
            </div>
            <div>
               <h1 className="text-2xl font-serif italic text-heritage-espresso leading-none">Jaya Dhaba</h1>
               <p className="text-[8px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Control Suite</p>
            </div>
         </div>
         {setMobileOpen && (
           <button onClick={() => setMobileOpen(false)} className="lg:hidden text-heritage-espresso/20 hover:text-heritage-espresso">
             <X size={20} />
           </button>
         )}
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 space-y-4 no-scrollbar overflow-y-auto">
        {menuItems.map((item) => (
          <NavItem 
            key={item.path}
            {...item}
            active={location.pathname === item.path}
            onClick={handleNav}
          />
        ))}
      </nav>

      {/* FOOTER ACTION */}
      <button 
        onClick={handleLogout}
        className="w-full flex items-center gap-4 p-6 rounded-[2rem] text-heritage-espresso/40 hover:text-heritage-terracotta hover:bg-red-50 transition-all group mt-10 border border-transparent hover:border-red-100"
      >
        <div className="w-10 h-10 rounded-2xl bg-heritage-stone flex items-center justify-center group-hover:bg-red-100 group-hover:text-red-500 transition-colors">
           <LogOut size={18} />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Exit Sanctuary</span>
      </button>
    </div>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <div className="hidden lg:block w-80 h-dvh sticky top-0 no-print shrink-0">
        {sidebarContent}
      </div>

      {/* MOBILE DRAWER */}
      <div className={`fixed inset-0 z-[200] lg:hidden transition-opacity duration-500 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
         <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
         <div className={`absolute top-0 left-0 w-80 h-dvh transition-transform duration-500 transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            {sidebarContent}
         </div>
      </div>
    </>
  );
}
