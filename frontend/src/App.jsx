import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Analytics } from "@vercel/analytics/react";
import SmoothScroll from "./components/SmoothScroll";
import Preloader from "./components/Preloader";
import FloatingBookBar from "./components/FloatingBookBar";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Checkout from "./pages/Checkout";
import Reservation from "./pages/Reservation";
import Track from "./pages/Track";
import OrderTrackingRedirect from "./pages/OrderTrackingRedirect";

import ChatBot from "./components/ChatBot";
import FavoritesDrawer from "./components/FavoritesDrawer";
import CartDrawer from "./components/CartDrawer";
import ScrollToTop from "./components/ScrollToTop";
import Navbar from "./components/Navbar";

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
        className={isAdmin ? "" : "min-h-screen"}
      >
        {!isAdmin && <Navbar />}

        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Home />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/reservation" element={<Reservation />} />
          <Route path="/track" element={<Track />} />
          <Route path="/order-tracking/:id" element={<OrderTrackingRedirect />} />
        </Routes>

        {!isAdmin && (
          <>
            <ChatBot />
            <FavoritesDrawer />
            <CartDrawer />
            <FloatingBookBar />
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
        <AnimatedRoutes />
      </div>
      <Analytics />
    </SmoothScroll>
  );
}

export default App;
