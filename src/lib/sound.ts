/**
 * Small physical interface noises, synthesized rather than loaded — a dry
 * click for minor advances (a lock, a tick), a fuller clack for definite
 * ones (opening something, a choice committing). No audio files; every
 * sound here is a couple of short oscillator envelopes.
 *
 * Sound is opt-out, persisted, and never plays continuously during
 * scrolling — only at the meaningful thresholds the rest of the piece
 * already marks visually.
 */

const STORAGE_KEY = "continuum-sound";

let ctx: AudioContext | null = null;
let enabled = true;

try {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  if (stored !== null) enabled = stored === "1";
} catch {
  // Storage unavailable (private browsing, disabled cookies) — default stays on.
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Ignore — the toggle still works for this session even if it can't persist.
  }
  if (value) getContext(); // resume/create on the gesture that turned it on
}

function tone(freq: number, duration: number, peak: number) {
  if (!enabled) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** A dry, short click — an item locking into place. */
export function playTick() {
  tone(1700, 0.03, 0.05);
}

/** A fuller two-note clack — something definite happening: opened, committed, crossed. */
export function playClack() {
  tone(560, 0.05, 0.07);
  setTimeout(() => tone(320, 0.045, 0.05), 16);
}
