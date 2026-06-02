let audioCtx = null;
let unlocked = false;

export function getAdminAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export async function unlockAdminAudio() {
  try {
    const ctx = getAdminAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.frequency.value = 20;
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
    unlocked = true;
    return true;
  } catch (error) {
    return false;
  }
}

export function installAdminAudioUnlock() {
  if (unlocked) return () => {};
  const unlock = () => {
    unlockAdminAudio();
  };
  const options = { passive: true };
  window.addEventListener("pointerdown", unlock, options);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, options);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
}

function tone({ frequency, at, duration, type = "sine", gain = 0.34 }) {
  const ctx = getAdminAudioCtx();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gainNode.gain.setValueAtTime(gain, at);
  gainNode.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration);
}

async function playPattern(pattern) {
  const ctx = getAdminAudioCtx();
  if (ctx.state === "suspended") await ctx.resume();
  const start = ctx.currentTime + 0.02;
  pattern.forEach((note) => tone({ ...note, at: start + note.offset }));
}

export function playNewOrderSound() {
  playPattern([
    { offset: 0, frequency: 880, duration: 0.18, type: "square", gain: 0.26 },
    { offset: 0.2, frequency: 660, duration: 0.2, type: "square", gain: 0.26 },
    { offset: 0.43, frequency: 880, duration: 0.28, type: "square", gain: 0.3 },
  ]).catch((error) => console.warn("Order sound failed:", error));
}

export function playWaiterCallSound() {
  playPattern([
    { offset: 0, frequency: 1180, duration: 0.12, type: "triangle", gain: 0.22 },
    { offset: 0.14, frequency: 1480, duration: 0.12, type: "triangle", gain: 0.22 },
    { offset: 0.28, frequency: 1180, duration: 0.18, type: "triangle", gain: 0.22 },
  ]).catch((error) => console.warn("Waiter sound failed:", error));
}
