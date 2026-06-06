export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion:reduce)").matches;

export function scrambleText(el, finalText) {
  if (!el) return;
  if (reducedMotion()) {
    el.textContent = finalText;
    return;
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%";
  const duration = 900;
  const start = performance.now();
  const tick = () => {
    const elapsed = performance.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const resolvedCount = Math.floor(finalText.length * progress);
    let output = "";
    for (let i = 0; i < finalText.length; i += 1) {
      output += i < resolvedCount ? finalText[i] : chars[Math.floor(Math.random() * chars.length)];
    }
    el.textContent = output;
    if (progress < 1) window.setTimeout(tick, 45);
    else el.textContent = finalText;
  };
  tick();
}
