import { useEffect } from 'react';
import { initLenis, initParallax, initScrollProgressBar } from '../utils/scrollAnimations';

export default function SmoothScroll({ children }) {
  useEffect(() => {
    const lenis = initLenis();
    initScrollProgressBar();
    initParallax();

    return () => {
      lenis?.destroy?.();
    };
  }, []);

  return <>{children}</>;
}
