import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WheelEngine } from "../../lib/wheelPhysics";
import { BoundaryPressure, Spring, clamp, lerp } from "../../lib/wheelPhysics";
import { Telemetry } from "../../components/Telemetry";
import { CornerLabels } from "../../components/CornerLabels";
import { TranslationPanel } from "../../components/TranslationPanel";
import { BoundaryIndicator, type BoundaryIndicatorHandle } from "../../components/BoundaryIndicator";
import { REWIND_STATES } from "./rewindStates";
import "./Rewind.css";

const M = REWIND_STATES.length;
const SPEED = 1.35;
const TIMELINE_IDLE_FADE = 1100;

interface RewindProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onBoundary: (direction: "forward" | "backward") => void;
}

export function Rewind({ engine, active, reducedMotion, onBoundary }: RewindProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const shapeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const revRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const boundaryTopRef = useRef<BoundaryIndicatorHandle>(null);
  const boundaryBottomRef = useRef<BoundaryIndicatorHandle>(null);

  const [hasEngaged, setHasEngaged] = useState(false);
  const activeRef = useRef(active);
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => {
    activeRef.current = active;
    reducedMotionRef.current = reducedMotion;
  }, [active, reducedMotion]);

  useEffect(() => {
    const position = { current: M - 1 };
    const spring = new Spring(position.current, 130, 16);
    const pressure = new BoundaryPressure(1.0, 2.6);
    let mode: "free" | "snapping" = "snapping";
    let lastFrame = performance.now();
    let lastActivityAt = performance.now();
    let minVisited = M - 1;
    let maxVisited = M - 1;

    const unsub = engine.subscribe((s) => {
      if (!activeRef.current) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const freeRunning = s.phase === "active" || s.phase === "gliding";
      mode = freeRunning ? "free" : "snapping";
      if (s.phase !== "idle") lastActivityAt = now;

      let boundarySignal: "forward" | "backward" | null = null;

      if (mode === "free") {
        const raw = position.current + s.velocity * dt * SPEED;
        const clamped = clamp(raw, 0, M - 1);
        const overshoot = raw - clamped;
        boundarySignal = pressure.update(overshoot > 0.001, overshoot < -0.001, Math.abs(s.velocity), dt);
        position.current = clamped + overshoot * 0.1;
        spring.snapTo(position.current);
      } else {
        pressure.update(false, false, 0, dt);
        const nearest = Math.round(position.current);
        if (spring.target !== nearest) spring.target = nearest;
        if (reducedMotionRef.current) {
          spring.snapTo(nearest);
          position.current = nearest;
        } else {
          position.current = spring.step(dt);
        }
      }

      if (boundarySignal) onBoundary(boundarySignal);

      if (boundaryBottomRef.current) {
        boundaryBottomRef.current.update(pressure.forward, pressure.forward > 0.02);
      }
      if (boundaryTopRef.current) {
        boundaryTopRef.current.update(pressure.backward, pressure.backward > 0.02);
      }

      const pos = position.current;
      minVisited = Math.min(minVisited, pos);
      maxVisited = Math.max(maxVisited, pos);
      const spread = maxVisited - minVisited;
      if (spread > 1.5) setHasEngaged(true);

      // --- interpolate composition between the two nearest recorded states ---
      const lo = Math.floor(pos);
      const hi = Math.min(M - 1, lo + 1);
      const t = pos - lo;
      const stateLo = REWIND_STATES[lo];
      const stateHi = REWIND_STATES[hi];

      for (let i = 0; i < stateLo.shapes.length; i++) {
        const a = stateLo.shapes[i];
        const b = stateHi.shapes[i];
        const el = shapeRefs.current[i];
        if (!el) continue;
        const cx = lerp(a.cx, b.cx, t);
        const cy = lerp(a.cy, b.cy, t);
        const r = lerp(a.r, b.r, t);
        const opacity = lerp(a.opacity, b.opacity, t);
        el.setAttribute("cx", cx.toFixed(2));
        el.setAttribute("cy", cy.toFixed(2));
        el.setAttribute("r", r.toFixed(2));
        el.setAttribute("opacity", opacity.toFixed(3));
      }

      const nearestIdx = clamp(Math.round(pos), 0, M - 1);
      const nearestState = REWIND_STATES[nearestIdx];
      if (revRef.current) revRef.current.textContent = `REV ${nearestState.rev}`;
      if (timeRef.current) timeRef.current.textContent = nearestState.timeOffset;
      if (captionRef.current) captionRef.current.textContent = nearestState.caption;

      const atmosphereT = 1 - pos / (M - 1); // 0 = newest, 1 = oldest
      if (sceneRef.current) sceneRef.current.style.setProperty("--t", atmosphereT.toFixed(3));

      // Timeline visibility: present while manipulating, fades once truly idle.
      const idleFor = now - lastActivityAt;
      const timelineOpacity = clamp(1 - (idleFor - 250) / TIMELINE_IDLE_FADE, 0, 1);
      if (timelineRef.current) timelineRef.current.style.opacity = timelineOpacity.toFixed(2);
      if (markerRef.current) {
        markerRef.current.style.left = `${(pos / (M - 1)) * 100}%`;
      }
    });

    return unsub;
  }, [engine, onBoundary]);

  return (
    <div className="rewind" ref={sceneRef}>
      <CornerLabels lines={["EXPERIMENT 02 / HISTORY", "INPUT CHANNEL / WHEEL", "DEGREES OF FREEDOM / 1"]} />

      <div className="rewind__canvasWrap">
        <svg className="rewind__canvas" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {REWIND_STATES[M - 1].shapes.map((shape, i) => (
            <circle
              key={shape.id}
              ref={(el) => {
                shapeRefs.current[i] = el;
              }}
              cx={shape.cx}
              cy={shape.cy}
              r={shape.r}
              stroke="#111111"
              strokeWidth={shape.ring ? 0.6 : 0}
              fill={shape.ring ? "none" : "#111111"}
            />
          ))}
        </svg>
      </div>

      <div className="rewind__readout">
        <div className="rewind__rev mono" ref={revRef}>
          REV {REWIND_STATES[M - 1].rev}
        </div>
        <div className="rewind__caption">{REWIND_STATES[M - 1].caption}</div>
      </div>
      <div className="rewind__time mono" ref={timeRef}>
        {REWIND_STATES[M - 1].timeOffset}
      </div>

      <div className="rewind__timeline" ref={timelineRef}>
        <div className="rewind__ticks">
          {REWIND_STATES.map((st, i) => (
            <div className="rewind__tick" key={st.rev} style={{ left: `${(i / (M - 1)) * 100}%` }} />
          ))}
        </div>
        <div className="rewind__rail" />
        <div className="rewind__marker" ref={markerRef} />
      </div>

      <BoundaryIndicator ref={boundaryTopRef} edge="top" label="RETURN TO ORBIT" />
      <BoundaryIndicator ref={boundaryBottomRef} edge="bottom" label="CONTINUE" />
      <Telemetry engine={engine} />
      <TranslationPanel
        visible={hasEngaged}
        rows={[
          ["UNDO", "NEGATIVE DELTA"],
          ["REDO", "POSITIVE DELTA"],
          ["HISTORY", "CONTINUOUS SPACE"],
        ]}
        sentence="Some commands become easier to understand when discrete actions are turned into continuous movement."
      />
      {reducedMotion && <span className="visually-hidden">Reduced motion is enabled.</span>}
    </div>
  );
}
