import { useRef } from "react";
import { useApp } from "../context/AppContext";
import ResponsiveImage from "./ResponsiveImage";
import { menuImageSrc } from "../utils/imageAssets";
export default function FoodCard({ item }) {
  const ref = useRef(null);
  const { addToCart, toggleFavorite, favorites, t } = useApp();
  const loved = favorites.includes(item.id);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = (0.5 - (e.clientY-r.top)/r.height) * 12;
    const ry = ((e.clientX-r.left)/r.width - 0.5) * 12;
    el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px) scale(1.02)`;
  };
  return (
    <div ref={ref} className="glass" onMouseMove={onMove} onMouseLeave={() => ref.current.style.transform = "none"} style={{ padding: 14, transition: "transform .18s ease" }}>
      <ResponsiveImage src={menuImageSrc(item)} alt={item.name} loading="lazy" width="320" height="160" sizes="(max-width: 768px) 100vw, 33vw" style={{ width: "100%", height: 160, borderRadius: 14, objectFit: "cover" }} />
      <div style={{ marginTop: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{item.name}</h3>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
           <div style={{ fontWeight: 800, color: "var(--accent)" }}>₹{item.price}</div>
           <button className="btn btn-primary" onClick={() => addToCart(item)}>{t("add")}</button>
        </div>
      </div>
    </div>
  );
}
