import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
const Auth = React.lazy(() => import('./pages/Auth'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const EventDetails = React.lazy(() => import('./pages/Event'));
const SeatLayout = React.lazy(() => import('./pages/SeatLayout'));
const Pass = React.lazy(() => import('./pages/Pass'));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 gap-4">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
        System Authenticating...
      </span>
    </div>
  );
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (user && user.role === 'admin') ? children : <Navigate to="/dashboard" />;
};

function App() {
  console.log('📦 App: Rendering original structure');
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-primary/30">
        <React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-primary animate-pulse font-headline text-xs tracking-widest font-black uppercase">FEEDX INITIALIZING...</div>}>
          <Routes>
            <Route path="/login" element={<Auth />} />
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/event/:id" element={<ProtectedRoute><EventDetails /></ProtectedRoute>} />
            <Route path="/seats/:id" element={<ProtectedRoute><SeatLayout /></ProtectedRoute>} />
            <Route path="/pass/:id" element={<ProtectedRoute><Pass /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          </Routes>
        </React.Suspense>
      </div>
    </AuthProvider>
  );
}

export default App;
