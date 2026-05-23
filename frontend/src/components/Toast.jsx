import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

const COLORS = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
  warning: '#d97706',
};

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, duration);
  }, []);

  return { toasts, show };
}

export function ToastContainer({ toasts }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      zIndex: 99999,
      pointerEvents: 'none',
    }}>
      {toasts.map((toast) => (
        <div key={toast.id} style={{
          padding: '0.75rem 1.25rem',
          borderRadius: '8px',
          background: COLORS[toast.type] || COLORS.success,
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.875rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          whiteSpace: 'nowrap',
        }}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

/**
 * Premium Toast Component for Jaya Dhaba
 * Handles success, error, and info types with elegant animations.
 */
export default function Toast({ message, type = "info", onClose, duration = 4000 }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 500); // Match animation duration
  };

  const icons = {
    success: <CheckCircle2 className="text-green-600" size={20} />,
    error: <AlertCircle className="text-red-600" size={20} />,
    info: <AlertCircle className="text-orange-600" size={20} />
  };

  const bgColors = {
    success: "bg-green-50 border-green-100",
    error: "bg-red-50 border-red-100",
    info: "bg-orange-50 border-orange-100"
  };

  return (
    <div 
      className={`fixed top-0 left-1/2 z-[9999] min-w-[320px] max-w-[90vw] 
        flex items-center gap-4 p-4 rounded-2xl shadow-premium border 
        ${bgColors[type]} ${isExiting ? 'toast-exit' : 'toast-enter'}
      `}
      role="alert"
    >
      <div className="flex-shrink-0">
        {icons[type]}
      </div>
      <div className="flex-grow">
        <p className="text-sm font-bold text-stone-800 leading-tight">
          {message}
        </p>
      </div>
      <button 
        onClick={handleClose}
        className="flex-shrink-0 text-stone-400 hover:text-stone-600 transition-colors bg-transparent border-none cursor-pointer"
      >
        <X size={18} />
      </button>
    </div>
  );
}
