import { useCallback, useRef } from "react";

export default function useRipple() {
  const rippleRef = useRef<HTMLSpanElement | null>(null);

  const createRipple = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const ripple = document.createElement("span");
    ripple.style.cssText = `
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.35);
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      pointer-events: none;
      transform: scale(0);
      animation: ripple-anim 600ms ease-out forwards;
    `;
    button.style.position = "relative";
    button.style.overflow = "hidden";
    button.appendChild(ripple);
    rippleRef.current = ripple;

    const cleanup = () => {
      ripple.remove();
    };
    ripple.addEventListener("animationend", cleanup, { once: true });
  }, []);

  return createRipple;
}

// CSS keyframes injected once
if (typeof document !== "undefined" && !document.getElementById("ripple-style")) {
  const style = document.createElement("style");
  style.id = "ripple-style";
  style.textContent = `
    @keyframes ripple-anim {
      to { transform: scale(3); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
