import { useState } from "react";
export function ReservationPanel() {
  return (
    <div className="glass" style={{ padding: 18 }}>
      <h2 className="title-display">Book a Table</h2>
      <div style={{ marginTop: 14 }}>Reservation system ready.</div>
    </div>
  );
}

export function CheckoutPanel() {
  return (
    <div className="glass" style={{ padding: 18 }}>
      <h2 className="title-display">Checkout</h2>
      <div style={{ marginTop: 14 }}>Complete your feast.</div>
    </div>
  );
}

export function LoyaltyPanel() {
  return (
    <div className="glass" style={{ padding: 18 }}>
      <h2 className="title-display">Loyalty Points</h2>
      <div style={{ marginTop: 14 }}>Level up for more discounts.</div>
    </div>
  );
}
