import { useState } from "react";
import { BellRing } from "lucide-react";
import api from "../api";
import { useApp } from "../context/AppContext";

const WAITER_REASONS = [
  { value: "need_assistance", label: "Need assistance" },
  { value: "need_water", label: "Need water" },
  { value: "have_question", label: "Have a question" },
  { value: "requesting_bill", label: "Request bill" },
];

export default function TableWaiterCall() {
  const { tableOrderContext } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const tableSession = tableOrderContext?.table_session;

  if (!tableSession) return null;

  const callWaiter = async (reason) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.callWaiter({ tableSession, reason });
      setOpen(false);
      setMessage("Waiter called - we'll be right with you");
      window.setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error.message || "Could not call waiter. Please ask nearby staff.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-28 right-4 z-[110] flex w-[min(18rem,calc(100vw-2rem))] flex-col items-end gap-2 md:bottom-8">
      {message && (
        <div className="rounded-2xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {message}
        </div>
      )}
      {open && (
        <div className="w-full rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-orange-100">
          {WAITER_REASONS.map((reason) => (
            <button
              key={reason.value}
              onClick={() => callWaiter(reason.value)}
              disabled={busy}
              className="block min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-950 px-4 text-xs font-black uppercase tracking-widest text-white shadow-xl disabled:opacity-60"
      >
        <BellRing size={17} />
        {busy ? "Calling..." : "Call waiter"}
      </button>
    </div>
  );
}
