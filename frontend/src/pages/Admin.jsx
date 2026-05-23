import React, { useCallback, useEffect, useState, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AdminSidebar from '../components/Admin/AdminSidebar';
import AdminHeader from '../components/Admin/AdminHeader';
import PageMeta from '../components/SEO/PageMeta';
import { useAdminRealtime } from '../hooks/useAdminRealtime';
import { ToastContainer, useToast } from '../components/Toast';

// Sub-views (Lazy Loaded for performance)
const DashboardHome = React.lazy(() => import('./Admin/views/DashboardHome'));
const ReservationsManager = React.lazy(() => import('./Admin/views/ReservationsManager'));
const OrdersManager = React.lazy(() => import('./Admin/views/OrdersManager'));
const MenuManager = React.lazy(() => import('./Admin/views/MenuManager'));
const SettingsManager = React.lazy(() => import('./Admin/views/SettingsManager'));
const AnalyticsView = React.lazy(() => import('./Admin/views/AnalyticsView'));
const RevenueCommandCenter = React.lazy(() => import('./Admin/views/RevenueCommandCenter'));
const KitchenDisplay = React.lazy(() => import('./Admin/views/KitchenDisplay'));
const DailyReport = React.lazy(() => import('./Admin/views/DailyReport'));
const InboxManager = React.lazy(() => import('./Admin/views/InboxManager'));

let audioCtx = null;

export const getAdminAudioCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
};

export const playNewOrderSound = () => {
  try {
    const ctx = getAdminAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn('Sound failed:', e);
  }
};

/**
 * JAYA DHABA ADMIN SUITE - v5.0
 * Features: Responsive Sidebar, Global Utility Header, and Saffron Theme
 */
export default function Admin() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { toasts, show: toast } = useToast();

  useAdminRealtime({
    onOrdersUpdate: useCallback((data) => {
      window.dispatchEvent(new CustomEvent('rt:orders', { detail: data }));
      if (data.action === 'new_order') {
        playNewOrderSound();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Order — Jaya Dhaba', {
            body: `Order #${data.order?.order_number || data.order?.id} received — ₹${Number(data.order?.total || 0).toLocaleString('en-IN')}`,
            icon: '/logo.png',
          });
        }
        toast(`New order #${data.order?.order_number || data.order?.id} received`, 'info');
      }
    }, [toast]),
    onReservationsUpdate: useCallback((data) => {
      window.dispatchEvent(new CustomEvent('rt:reservations', { detail: data }));
      if (data.action === 'new_reservation') {
        toast(`New reservation from ${data.reservation?.guest_name || data.reservation?.name || 'Guest'}`, 'info');
      }
    }, [toast]),
    onMenuUpdate: useCallback((data) => {
      window.dispatchEvent(new CustomEvent('rt:menu', { detail: data }));
    }, []),
    onAnalyticsUpdate: useCallback((data) => {
      window.dispatchEvent(new CustomEvent('rt:analytics', { detail: data }));
    }, []),
    onSettingsUpdate: useCallback((data) => {
      window.dispatchEvent(new CustomEvent('rt:settings', { detail: data }));
    }, []),
    onContactUpdate: useCallback((data) => {
      window.dispatchEvent(new CustomEvent('rt:contact', { detail: data }));
    }, []),
  });

  if (location.pathname === '/admin/kitchen') {
    return (
      <div className="bg-[#FAF9F6] min-h-screen text-heritage-espresso font-sans">
        <PageMeta title="Kitchen Display" description="Jaya Dhaba kitchen display." url="/admin/kitchen" robots="noindex, nofollow" />
        <ToastContainer toasts={toasts} />
        <Suspense fallback={<div>Loading...</div>}>
          <KitchenDisplay />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex bg-[#FAF9F6] h-screen text-heritage-espresso font-sans relative overflow-hidden">
      <PageMeta
        title="Control Suite"
        description="Jaya Dhaba private admin control suite."
        url="/admin"
        robots="noindex, nofollow"
      />
      <ToastContainer toasts={toasts} />

      {/* Saffron Glow Background Layer */}
      <div className="absolute inset-0 bg-gradient-to-tr from-heritage-terracotta/5 via-transparent to-heritage-gold/5 pointer-events-none" />
      
      {/* LEFT SIDEBAR (Desktop & Mobile Modes) */}
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen relative z-10 w-full overflow-hidden">
        
        {/* Header with Mobile Toggle Trigger */}
        <AdminHeader onMenuToggle={() => setMobileOpen(true)} onTestSound={playNewOrderSound} />
        
        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-10 w-full">
          <div className="max-w-[1600px] mx-auto w-full">
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/reservations" element={<ReservationsManager />} />
              <Route path="/orders" element={<OrdersManager />} />
              <Route path="/menu" element={<MenuManager />} />
              <Route path="/settings" element={<SettingsManager />} />
              <Route path="/analytics" element={<AnalyticsView />} />
              <Route path="/reports" element={<DailyReport />} />
              <Route path="/inbox" element={<InboxManager />} />
              <Route path="/kitchen" element={<KitchenDisplay />} />
              <Route path="/revenue" element={<RevenueCommandCenter />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
          </div>
        </main>

        <footer className="p-10 text-[9px] font-black uppercase tracking-[0.5em] text-heritage-espresso/10 text-center no-print">
          © 2026 Jaya Dhaba • Digital Heritage Suite v5.0
        </footer>
      </div>

    </div>
  );
}
