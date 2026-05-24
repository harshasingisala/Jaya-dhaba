import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import SmoothScroll from "./components/SmoothScroll";
import Preloader from "./components/Preloader";
import FloatingBookBar from "./components/FloatingBookBar";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/Admin/Login";
import Checkout from "./pages/Checkout";
import Reservation from "./pages/Reservation";
import Track from "./pages/Track";
import OrderTrackingRedirect from "./pages/OrderTrackingRedirect";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

import ChatBot from "./components/ChatBot";
import FavoritesDrawer from "./components/FavoritesDrawer";
import CartDrawer from "./components/CartDrawer";
import ScrollToTop from "./components/ScrollToTop";
import Navbar from "./components/Navbar";
import MobileActionDock from "./components/MobileActionDock";
import RestaurantSchema from "./components/SEO/RestaurantSchema";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const pageTransition = { duration: 0.3, ease: "easeOut" };

function AnimatedRoutes() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={pageTransition}
        className={isAdmin ? "" : "customer-phone-shell min-h-screen"}
      >
        {!isAdmin && <Navbar />}

        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Home />} />
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

        {!isAdmin && (
          <>
            <ChatBot />
            <FavoritesDrawer />
            <CartDrawer />
            <FloatingBookBar />
            <MobileActionDock />
            <ScrollToTop />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * JAYA DHABA - CORE ENGINE v4.0
 * Fully Interconnected & Production Hardened
 */
function App() {
  return (
    <SmoothScroll>
      <Preloader />
      <div className="app-container antialiased heritage-stone-bg min-h-screen">
        <RestaurantSchema />
        <AnimatedRoutes />
      </div>
    </SmoothScroll>
  );
}

export default App;
