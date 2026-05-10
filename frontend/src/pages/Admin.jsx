import React, { useState, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminSidebar from '../components/Admin/AdminSidebar';
import AdminHeader from '../components/Admin/AdminHeader';

// Sub-views (Lazy Loaded for performance)
const DashboardHome = React.lazy(() => import('./Admin/views/DashboardHome'));
const ReservationsManager = React.lazy(() => import('./Admin/views/ReservationsManager'));
const OrdersManager = React.lazy(() => import('./Admin/views/OrdersManager'));
const MenuManager = React.lazy(() => import('./Admin/views/MenuManager'));
const SettingsManager = React.lazy(() => import('./Admin/views/SettingsManager'));
const AnalyticsView = React.lazy(() => import('./Admin/views/AnalyticsView'));
const RevenueCommandCenter = React.lazy(() => import('./Admin/views/RevenueCommandCenter'));

/**
 * JAYA DHABA ADMIN SUITE - v5.0
 * Features: Responsive Sidebar, Global Utility Header, and Saffron Theme
 */
export default function Admin() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex bg-[#FAF9F6] min-h-screen text-heritage-espresso font-sans relative overflow-hidden">
      
      {/* Saffron Glow Background Layer */}
      <div className="absolute inset-0 bg-gradient-to-tr from-heritage-terracotta/5 via-transparent to-heritage-gold/5 pointer-events-none" />
      
      {/* LEFT SIDEBAR (Desktop & Mobile Modes) */}
      <AdminSidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-h-screen relative z-10 w-full overflow-x-hidden">
        
        {/* Header with Mobile Toggle Trigger */}
        <AdminHeader onMenuToggle={() => setMobileOpen(true)} />
        
        <main className="flex-1 p-4 md:p-10 max-w-[1600px] mx-auto w-full">
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/reservations" element={<ReservationsManager />} />
              <Route path="/orders" element={<OrdersManager />} />
              <Route path="/menu" element={<MenuManager />} />
              <Route path="/settings" element={<SettingsManager />} />
              <Route path="/analytics" element={<AnalyticsView />} />
              <Route path="/revenue" element={<RevenueCommandCenter />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        </main>

        <footer className="p-10 text-[9px] font-black uppercase tracking-[0.5em] text-heritage-espresso/10 text-center no-print">
          © 2026 Jaya Dhaba • Digital Heritage Suite v5.0
        </footer>
      </div>

    </div>
  );
}
