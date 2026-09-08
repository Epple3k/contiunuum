import { useEffect, useRef } from "react";
import { WheelEngine, type WheelEngineOptions } from "../lib/wheelPhysics";

/**
 * Attaches a WheelEngine to `target` (defaults to window) for the lifetime
 * of the component and returns the stable engine instance.
 *
 * Deliberately does NOT put wheel state into React state — experiments
 * subscribe imperatively and drive their own refs/DOM at 60fps to avoid
 * routing every wheel tick through a re-render. Components that just want
 * to *display* the numbers (Telemetry) subscribe themselves.
 */
export function useWheelInput(
  target: EventTarget | null | undefined = typeof window !== "undefined" ? window : undefined,
  options?: WheelEngineOptions,
  enabled = true,
): WheelEngine {
  const engineRef = useRef<WheelEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new WheelEngine(options);
  }

  useEffect(() => {
    if (!enabled || !target) return;
    const engine = engineRef.current!;
    engine.attach(target);
    return () => engine.detach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled]);

  return engineRef.current;
}
