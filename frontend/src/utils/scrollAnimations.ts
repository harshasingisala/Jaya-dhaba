import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "@studio-freight/lenis";

gsap.registerPlugin(ScrollTrigger);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion:reduce)").matches;

export function initLenis() {
  if (reducedMotion()) return null;
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  function raf(time: number) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  return lenis;
}

export function initParallax() {
  if (reducedMotion()) return;
  if (document.querySelector(".hero-bg")) {
    gsap.to(".hero-bg", {
      yPercent: -20,
      ease: "none",
      scrollTrigger: { trigger: ".hero-bg", start: "top top", end: "bottom top", scrub: true },
    });
  }
  if (document.querySelector(".float-img")) {
    gsap.to(".float-img", {
      y: -40,
      rotation: 5,
      ease: "none",
      scrollTrigger: { trigger: ".float-img", start: "top bottom", end: "bottom top", scrub: 1.5 },
    });
  }
}

export function initScrollProgressBar() {
  const bar = document.createElement("div");
  bar.id = "scroll-progress-bar";
  bar.style.cssText = "position:fixed;top:0;left:0;height:2px;width:0;background:var(--gold-brand);z-index:9999;";
  document.body.appendChild(bar);
  const handler = () => {
    const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100;
    bar.style.width = `${Math.max(0, pct)}%`;
  };
  window.addEventListener("scroll", handler, { passive: true });
  handler();
}

export function initHorizontalWheel(el: HTMLElement) {
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    el.scrollLeft += e.deltaY * 0.8;
  }, { passive: false });
}

export function countUp(el: HTMLElement, target: number, duration = 1500) {
  if (reducedMotion()) {
    el.textContent = Math.round(target).toLocaleString("en-IN");
    return;
  }
  const start = performance.now();
  const update = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    el.textContent = Math.round(eased * target).toLocaleString("en-IN");
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

export function scrambleText(el: HTMLElement, finalText: string) {
  if (reducedMotion()) {
    el.textContent = finalText;
    return;
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%";
  const duration = 1200;
  const start = performance.now();
  const tick = () => {
    const elapsed = performance.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const resolvedCount = Math.floor(finalText.length * progress);
    let output = "";
    for (let i = 0; i < finalText.length; i += 1) {
      if (i < resolvedCount) output += finalText[i];
      else output += chars[Math.floor(Math.random() * chars.length)];
    }
    el.textContent = output;
    if (progress < 1) setTimeout(tick, 35);
    else el.textContent = finalText;
  };
  tick();
}
