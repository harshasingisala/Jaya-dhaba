import { ShoppingBag } from "lucide-react";
import { useApp } from "../context/AppContext";
import { motion, AnimatePresence } from "framer-motion";

export default function FloatingCartTrigger() {
  const { cart, setCartOpen, cartOpen } = useApp();
  const totalQty = cart.reduce((a, b) => a + b.qty, 0);

  if (cart.length === 0 || cartOpen) return null;

  return (
    <AnimatePresence>
      <motion.button
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={() => setCartOpen(true)}
        className="btn btn-primary"
        style={{
          position: "fixed",
          right: 32,
          bottom: 32,
          zIndex: 900,
          width: 64,
          height: 64,
          borderRadius: "50%",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
        }}
      >
        <ShoppingBag size={24} />
        {totalQty > 0 && (
          <span style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: "white",
            color: "black",
            fontSize: 10,
            fontWeight: 900,
            width: 20,
            height: 20,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 10px rgba(0,0,0,0.3)"
          }}>
            {totalQty}
          </span>
        )}
      </motion.button>
    </AnimatePresence>
  );
}
