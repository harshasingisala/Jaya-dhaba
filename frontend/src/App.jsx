import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import SmoothScroll from "./components/SmoothScroll";
import Home from "./pages/Home";
import ProtectedRoute from "./components/ProtectedRoute";

import Navbar from "./components/Navbar";

const Admin = lazy(() => import("./pages/Admin"));
const AdminLogin = lazy(() => import("./pages/Admin/Login"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Reservation = lazy(() => import("./pages/Reservation"));
const Track = lazy(() => import("./pages/Track"));
const OrderTrackingRedirect = lazy(() => import("./pages/OrderTrackingRedirect"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ChatBot = lazy(() => import("./components/ChatBot"));
const FavoritesDrawer = lazy(() => import("./components/FavoritesDrawer"));
const CartDrawer = lazy(() => import("./components/CartDrawer"));
const ScrollToTop = lazy(() => import("./components/ScrollToTop"));
const FloatingBookBar = lazy(() => import("./components/FloatingBookBar"));
const MobileActionDock = lazy(() => import("./components/MobileActionDock"));

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const pageTransition = { duration: 0.3, ease: "easeOut" };

function AnimatedRoutes() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const [loadChrome, setLoadChrome] = useState(false);

  useEffect(() => {
    if (isAdmin) return undefined;
    const load = () => setLoadChrome(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(load, 1600);
    return () => window.clearTimeout(timer);
  }, [isAdmin]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        className={isAdmin ? "" : "min-h-screen"}
      >
        {!isAdmin && <Navbar />}

        <Suspense fallback={null}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/menu" element={<MenuRoute />} />
            <Route path="/about" element={<Home />} />
            <Route path="/contact" element={<Home />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/*" element={<ProtectedRoute allowedRoles={["admin", "owner", "staff", "manager"]}><Admin /></ProtectedRoute>} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/reservation" element={<Reservation />} />
            <Route path="/reservations" element={<Reservation />} />
            <Route path="/track" element={<Track />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/order-tracking/:id" element={<OrderTrackingRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>

        {!isAdmin && loadChrome && (
          <>
            <Suspense fallback={null}>
              <ChatBot />
              <FavoritesDrawer />
              <CartDrawer />
              <FloatingBookBar />
              <MobileActionDock />
              <ScrollToTop />
            </Suspense>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function MenuRoute() {
  return <Home />;
}

/**
 * JAYA DHABA - CORE ENGINE v4.0
 * Fully Interconnected & Production Hardened
 */
function App() {
  return (
    <SmoothScroll>
      <div className="app-container antialiased heritage-stone-bg min-h-screen">
        <AnimatedRoutes />
      </div>
    </SmoothScroll>
  );
}

export default App;
