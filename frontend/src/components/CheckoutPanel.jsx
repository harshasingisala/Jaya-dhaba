import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import api from "../api";
import { motion } from "framer-motion";
import { useState } from "react";

export default function CheckoutPanel() {
  const navigate = useNavigate();
  const { cart, subtotal, tax, total, clearCart, addOrder, restaurantId, t } = useApp();
  const [customerName, setCustomerName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const pay = async () => {
    if (!customerName.trim()) return alert("Bro, please enter your name!");
    setIsSubmitting(true);
    navigate("/checkout");
    setIsSubmitting(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 40, alignItems: "start" }}>
      {/* LEFT: DETAILS */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <h2 className="title-display" style={{ fontSize: 40, marginBottom: 32 }}>Savor the Heritage</h2>

        <div className="glass" style={{ padding: 32, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 16px" }}>Delivery Sanctuary</h3>
          <div style={{ display: "grid", gap: 16 }}>
            <input
              className="input"
              placeholder="Guest Name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Table Number (for Dine-in)"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="Special Culinary Instructions..."
              style={{ minHeight: 100 }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="glass" style={{ padding: 32 }}>
          <h3 style={{ margin: "0 0 16px" }}>Payment Legacy</h3>
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 20, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
            Secure checkout verified by Razorpay.
          </div>
        </div>
      </motion.div>

      {/* RIGHT: SUMMARY */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="glass" style={{ padding: 32, position: "sticky", top: 100 }}>
        <h3 className="title-display" style={{ fontSize: 24, marginBottom: 24 }}>Your Tray</h3>

        <div style={{ display: "grid", gap: 20, marginBottom: 32 }}>
          {cart.map(i => (
            <div key={i._key} style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{i.name}</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>qty: {i.qty}</div>
              </div>
              <div style={{ fontWeight: 900 }}>₹{i.price * i.qty}</div>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, color: "var(--muted)" }}>
            <span>Subtotal</span><span>₹{subtotal}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, color: "var(--muted)" }}>
            <span>Culinary Tax (5%)</span><span>₹{tax}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32, alignItems: "center" }}>
            <span className="title-display" style={{ fontSize: 24 }}>Total</span>
            <span style={{ fontSize: 32, fontWeight: 900, color: "var(--accent)" }}>₹{total}</span>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: 24, fontSize: 16, opacity: isSubmitting ? 0.7 : 1 }}
            onClick={pay}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Restoring Feast..." : "Finalize Order"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
