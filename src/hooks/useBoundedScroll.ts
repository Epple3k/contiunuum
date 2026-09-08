import { useEffect, useRef } from "react";
import type { WheelEngine, WheelState } from "../lib/wheelPhysics";
import { BoundaryPressure, Spring, clamp } from "../lib/wheelPhysics";

export interface BoundedScrollOptions {
  /** Domain minimum. Pushing backward past this fires `onExitBackward`. */
  min: number;
  max: number;
  /** Domain-units per second, per unit of engine velocity. */
  speed: number;
  /** Snap to the nearest integer once input settles (for domains with discrete steps). */
  snap?: boolean;
  reducedMotion?: boolean;
  /** Fires once, exactly when sustained backward pressure crosses the `min` edge. */
  onExitBackward?: () => void;
  /**
   * When this returns true, position integration is skipped entirely for the
   * frame — `position` stays exactly where it was, untouched by velocity.
   * Used by `ChoiceGate` to genuinely pin position at a decision point while
   * a choice is being made, rather than merely reporting a clamped value
   * while the real position keeps drifting underneath it (which would cause
   * a visible jump the instant the choice commits). Exit pressure still
   * accumulates while frozen, so "close at any point" keeps working.
   */
  freeze?: () => boolean;
}

export interface BoundedScrollFrame {
  position: number;
  settled: boolean;
  s: WheelState;
  dt: number;
}

/**
 * One continuous, clamped scroll domain: integrate velocity, clamp to
 * [min, max], optionally snap to the nearest step once settled, and report
 * sustained backward pressure at the `min` edge as an exit.
 *
 * This is the same domain-with-an-edge pattern Orbit and Rewind each hand-roll
 * for their own top-level navigation — factored out so every mini-experiment
 * nested inside an opened orbit item gets it for free instead of
 * reimplementing velocity integration and boundary pressure four times.
 */
export function useBoundedScroll(
  engine: WheelEngine,
  active: boolean,
  options: BoundedScrollOptions,
  onFrame: (frame: BoundedScrollFrame) => void,
) {
  const activeRef = useRef(active);
  const optionsRef = useRef(options);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    activeRef.current = active;
    optionsRef.current = options;
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    const position = { current: optionsRef.current.min };
    const spring = new Spring(position.current, 130, 16);
    const pressure = new BoundaryPressure(0.9, 2.6);
    // Independent of `position` entirely: sustained backward scrolling always
    // gets you out, no matter how deep you are. Without this, exiting requires
    // first navigating all the way back to `min` — not "close at any point."
    // Tuned slow enough that a single deliberate step backward within the app
    // (a normal navigation action) can't accidentally trigger it.
    const exitPressure = new BoundaryPressure(0.42, 2.3);
    let lastFrame = performance.now();

    // A consumer typically mounts (and starts fading in) well before it becomes
    // `active` — see Orbit's MINI_MOUNT_ENTER vs MINI_ACTIVE_THRESHOLD gap. Without
    // this, its DOM would sit with no inline styles at all until the first real
    // engine tick, flashing an untransformed, fully-opaque jumble while fading in.
    onFrameRef.current({
      position: position.current,
      settled: true,
      dt: 0,
      s: { delta: 0, direction: 0, velocity: 0, smoothedVelocity: 0, accumulated: 0, idleMs: Infinity, reversed: false, phase: "idle" },
    });

    const unsub = engine.subscribe((s) => {
      if (!activeRef.current) return;
      const { min, max, speed, snap, reducedMotion, onExitBackward, freeze } = optionsRef.current;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const exitSignal = exitPressure.update(false, s.velocity < -0.02, Math.abs(s.velocity), dt);
      if (exitSignal === "backward") onExitBackward?.();

      if (freeze?.()) {
        onFrameRef.current({ position: position.current, settled: true, s, dt });
        return;
      }

      const freeRunning = (s.phase === "active" || s.phase === "gliding") && Math.abs(s.velocity) > 0.05;
      let settled = false;

      if (freeRunning) {
        const raw = position.current + s.velocity * dt * speed;
        const clamped = clamp(raw, min, max);
        const overshoot = raw - clamped;
        const signal = pressure.update(overshoot > 0.001, overshoot < -0.001, Math.abs(s.velocity), dt);
        position.current = clamped + overshoot * 0.12;
        spring.snapTo(position.current);
        if (signal === "backward") onExitBackward?.();
      } else {
        pressure.update(false, false, 0, dt);
        if (snap) {
          const target = clamp(Math.round(position.current), min, max);
          if (spring.target !== target) spring.target = target;
          if (reducedMotion) {
            spring.snapTo(target);
            position.current = target;
          } else {
            position.current = spring.step(dt);
          }
          settled = spring.isSettled(0.01);
        } else {
          settled = Math.abs(s.velocity) < 0.02;
        }
      }

      onFrameRef.current({ position: position.current, settled, s, dt });
    });

    return unsub;
    // Only `engine` should restart the subscription; latest options/callback flow through refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);
}
