export default function ParticlesBG() {
  const dots = Array.from({ length: 32 }, (_, i) => ({
    left: `${(i * 29) % 100}%`, top: `${(i * 17) % 100}%`,
    size: 2 + (i % 4), delay: `${(i % 10) * 0.6}s`, duration: `${8 + (i % 5)}s`
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {dots.map((d, i) => (
        <span key={i} style={{
          position: "absolute", left: d.left, top: d.top, width: d.size, height: d.size,
          borderRadius: 999, background: "rgba(255,255,255,0.75)",
          boxShadow: "0 0 12px rgba(255,140,0,0.35)", opacity: 0.35,
          animation: `floatParticle ${d.duration} linear infinite`, animationDelay: d.delay
        }} />
      ))}
    </div>
  );
}
