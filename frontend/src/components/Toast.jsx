import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

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
