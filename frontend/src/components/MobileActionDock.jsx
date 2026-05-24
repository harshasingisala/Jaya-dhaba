import { Home, MapPin, Menu as MenuIcon, CalendarDays, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const items = [
  { label: "Home", icon: Home, action: "home" },
  { label: "Menu", icon: MenuIcon, action: "menu" },
  { label: "Book", icon: CalendarDays, action: "reservation" },
  { label: "Track", icon: Search, action: "track" },
  { label: "Find", icon: MapPin, action: "contact" },
];

export default function MobileActionDock() {
  const navigate = useNavigate();

  const handleTap = (action) => {
    if (action === "reservation") {
      navigate("/reservation");
      return;
    }
    if (action === "track") {
      navigate("/track");
      return;
    }
    const section = action === "home" ? "hero" : action;
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else navigate("/");
  };

  return (
    <div className="mobile-action-dock md:hidden fixed inset-x-0 bottom-0 z-[95] px-3 pb-3 pt-2">
      <div className="grid grid-cols-5 rounded-[1.65rem] border border-white/50 bg-[#fffaf0]/95 shadow-[0_-12px_35px_rgba(26,15,10,0.16)] backdrop-blur-xl">
        {items.map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            type="button"
            onClick={() => handleTap(action)}
            className="flex min-h-[62px] flex-col items-center justify-center gap-1 text-[#7a3f14] transition active:scale-95"
            aria-label={label}
          >
            <Icon size={19} strokeWidth={2.2} />
            <span className="text-[9px] font-black uppercase tracking-[0.08em]">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
