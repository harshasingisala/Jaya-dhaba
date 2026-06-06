import { useEffect } from 'react';

export default function SmoothScroll({ children }) {
  useEffect(() => {
    let lenis;
    let active = true;
    const timer = window.setTimeout(async () => {
      const { initLenis, initParallax, initScrollProgressBar } = await import('../utils/scrollAnimations');
      if (!active) return;
      lenis = initLenis();
      initScrollProgressBar();
      initParallax();
    }, 1200);

    return () => {
      active = false;
      window.clearTimeout(timer);
      lenis?.destroy?.();
    };
  }, []);

  return <>{children}</>;
}
