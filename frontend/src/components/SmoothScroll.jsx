import { useEffect } from 'react';

export default function SmoothScroll({ children }) {
  useEffect(() => {
    let lenis;
    let active = true;
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    const init = async () => {
      const { initLenis, initParallax, initScrollProgressBar } = await import('../utils/scrollAnimations');
      if (!active) return;
      lenis = initLenis();
      initScrollProgressBar();
      initParallax();
      events.forEach((event) => window.removeEventListener(event, init));
    };

    events.forEach((event) => window.addEventListener(event, init, { once: true, passive: true }));

    return () => {
      active = false;
      events.forEach((event) => window.removeEventListener(event, init));
      lenis?.destroy?.();
    };
  }, []);

  return <>{children}</>;
}
