import { useEffect, useRef } from "react";
import type { WheelEngine } from "../lib/wheelPhysics";
import "./Telemetry.css";

const HISTORY = 72;

/**
 * Live readout of the wheel engine's state. Updates the DOM directly inside
 * the engine's per-frame callback rather than via React state — this panel
 * ticks at 60fps and routing that through re-renders would be wasteful.
 */
export function Telemetry({ engine, label = "INPUT CHANNEL / WHEEL" }: { engine: WheelEngine; label?: string }) {
  const deltaRef = useRef<HTMLSpanElement>(null);
  const velocityRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<SVGPolylineElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const history = useRef<number[]>(new Array(HISTORY).fill(0));

  useEffect(() => {
    return engine.subscribe((s) => {
      if (deltaRef.current) deltaRef.current.textContent = (s.delta >= 0 ? "+" : "") + s.delta.toFixed(2);
      if (velocityRef.current) velocityRef.current.textContent = Math.abs(s.smoothedVelocity).toFixed(2);
      if (stateRef.current) stateRef.current.textContent = s.phase.toUpperCase();
      if (rootRef.current) rootRef.current.dataset.phase = s.phase;

      const h = history.current;
      h.shift();
      h.push(s.smoothedVelocity);
      if (pathRef.current) {
        const w = 96;
        const midY = 14;
        const scale = 10;
        const pts = h
          .map((v, i) => {
            const x = (i / (HISTORY - 1)) * w;
            const y = midY - Math.max(-midY + 1, Math.min(midY - 1, v * scale));
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        pathRef.current.setAttribute("points", pts);
      }
    });
  }, [engine]);

  return (
    <div className="telemetry" ref={rootRef} data-phase="idle" aria-hidden="true">
      <svg className="telemetry__wave" viewBox="0 0 96 28" preserveAspectRatio="none">
        <line x1="0" y1="14" x2="96" y2="14" className="telemetry__waveMid" />
        <polyline ref={pathRef} className="telemetry__wavePath" points="" fill="none" />
      </svg>
      <div className="telemetry__rows">
        <div className="telemetry__row">
          <span className="telemetry__key">DELTA</span>
          <span className="telemetry__val" ref={deltaRef}>
            +0.00
          </span>
        </div>
        <div className="telemetry__row">
          <span className="telemetry__key">VELOCITY</span>
          <span className="telemetry__val" ref={velocityRef}>
            0.00
          </span>
        </div>
        <div className="telemetry__row">
          <span className="telemetry__key">STATE</span>
          <span className="telemetry__val telemetry__val--state" ref={stateRef}>
            IDLE
          </span>
        </div>
      </div>
      <div className="telemetry__label">{label}</div>
    </div>
  );
}
