import { useApp } from "../context/AppContext";

export default function LoyaltyPanel() {
  const { points, orders } = useApp();
  const tier = points > 500 ? "Gold" : points > 200 ? "Silver" : "Starter";
  const progress = Math.min(100, (points % 500) / 5);

  return (
    <div className="section-tight" style={{ paddingLeft: 80, paddingRight: 80 }}>
      <div className="glass" style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="small-label">Loyalty Status</div>
          <div style={{ fontSize: 20, marginTop: 4 }}>{tier} Member</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Points earned: {points}</div>
        </div>
        <div style={{ width: 220 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
            <span>Next Tier</span><span>{progress.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,140,0,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
