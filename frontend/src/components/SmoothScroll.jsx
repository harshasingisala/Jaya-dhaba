import { useEffect } from 'react';
import { initCursorGlow, initLenis, initParallax, initScrollProgressBar } from '../utils/scrollAnimations';

export default function SmoothScroll({ children }) {
  useEffect(() => {
    const lenis = initLenis();
    initScrollProgressBar();
    initCursorGlow();
    initParallax();

    return () => {
      lenis?.destroy?.();
    };
  }, []);

  return <>{children}</>;
}
