import { useRef } from "react";
import type { WheelEngine } from "../../../lib/wheelPhysics";
import { ChoiceGate, clamp } from "../../../lib/wheelPhysics";
import { useBoundedScroll } from "../../../hooks/useBoundedScroll";
import { useInstance } from "../../../hooks/useInstance";
import { ChoiceRing, type ChoiceRingHandle } from "../../../components/ChoiceRing";
import { playClack } from "../../../lib/sound";
import "./ImageFocusPull.css";

interface Shape {
  x: number;
  y: number;
  size: number;
}

const BACKGROUND: Shape[] = [
  { x: 20, y: 28, size: 160 },
  { x: 72, y: 58, size: 130 },
  { x: 46, y: 78, size: 100 },
];

const MIDGROUND: Shape[] = [
  { x: 34, y: 42, size: 140 },
  { x: 68, y: 32, size: 110 },
  { x: 55, y: 72, size: 90 },
];

// Two genuinely different subjects compete for the foreground — which one
// the lens actually settles on is the choice.
const FOREGROUND_A: Shape[] = [
  { x: 22, y: 62, size: 190 },
  { x: 78, y: 22, size: 150 },
  { x: 12, y: 18, size: 120 },
];
const FOREGROUND_B: Shape[] = [
  { x: 30, y: 24, size: 200 },
  { x: 72, y: 70, size: 145 },
  { x: 86, y: 28, size: 110 },
];

const PLANE_COUNT = 3;
const GATE_POS = 1.5; // between midground and foreground

interface ImageFocusPullProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onExit: () => void;
}

/**
 * Experiment: a lens focus ring as a continuous scroll parameter instead of a
 * slideshow — with a real choice. Two candidate subjects share the foreground
 * plane; scrolling shifts weight between them, and holding still commits the
 * lens to whichever is currently favored.
 */
export function ImageFocusPull({ engine, active, reducedMotion, onExit }: ImageFocusPullProps) {
  const planeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shapeRefsA = useRef<(HTMLDivElement | null)[]>([]);
  const shapeRefsB = useRef<(HTMLDivElement | null)[]>([]);
  const labelRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<ChoiceRingHandle>(null);
  const gate = useInstance(() => new ChoiceGate(GATE_POS));
  const wasCommittedRef = useRef(false);

  useBoundedScroll(
    engine,
    active,
    { min: 0, max: PLANE_COUNT - 1, speed: 0.85, snap: false, reducedMotion, onExitBackward: onExit, freeze: () => gate.isPinned() },
    ({ position, settled, s, dt }) => {
      const choice = gate.step(position, s.velocity, settled, s.phase === "idle", dt);
      if (choice.committed && !wasCommittedRef.current) playClack();
      wasCommittedRef.current = choice.committed;
      const focus = clamp(choice.effectivePosition, 0, PLANE_COUNT - 1);

      let sharpestIndex = 0;
      let sharpestDist = Infinity;
      for (let p = 0; p < PLANE_COUNT; p++) {
        const el = planeRefs.current[p];
        if (!el) continue;
        const dist = Math.abs(p - focus);
        if (dist < sharpestDist) {
          sharpestDist = dist;
          sharpestIndex = p;
        }
        // Ink has no "brightness" to dim, so distance from focus is carried by
        // blur and opacity alone rather than a brightness filter.
        const blur = dist * 13;
        const scale = 1 + Math.max(0, 1 - dist) * 0.035;
        const fade = clamp(1 - dist * 0.32, 0.3, 1);
        el.style.filter = `blur(${blur.toFixed(2)}px)`;
        el.style.opacity = fade.toFixed(3);
        el.style.transform = `scale(${scale.toFixed(3)})`;
      }

      const opacityA = choice.committed
        ? choice.chosenBranch === "A"
          ? 1
          : 0
        : choice.atGate
          ? 1 - choice.choiceFocus
          : 1;
      const opacityB = choice.committed
        ? choice.chosenBranch === "B"
          ? 1
          : 0
        : choice.atGate
          ? choice.choiceFocus
          : 0;
      for (let i = 0; i < FOREGROUND_A.length; i++) {
        if (shapeRefsA.current[i]) shapeRefsA.current[i]!.style.opacity = (opacityA * 0.55).toFixed(3);
        if (shapeRefsB.current[i]) shapeRefsB.current[i]!.style.opacity = (opacityB * 0.55).toFixed(3);
      }

      if (labelRef.current) {
        const inFocus = sharpestDist < 0.12;
        const names = ["BACKGROUND", "MIDGROUND", "FOREGROUND"];
        labelRef.current.style.opacity = inFocus ? "1" : "0";
        labelRef.current.textContent = names[sharpestIndex];
      }
      ringRef.current?.update(choice.dwellProgress, choice.atGate);
      if (readoutRef.current) {
        const tag = choice.atGate ? ` — choosing ${choice.choiceFocus < 0.5 ? "A" : "B"}` : "";
        readoutRef.current.textContent = `FOCUS ${focus.toFixed(2)} / ${(PLANE_COUNT - 1).toFixed(2)}${tag}`;
      }
    },
  );

  return (
    <div className="imageFocusPull">
      <div
        className="imageFocusPull__plane"
        style={{ zIndex: 0 }}
        ref={(el) => {
          planeRefs.current[0] = el;
        }}
      >
        {BACKGROUND.map((shape, i) => (
          <div
            key={i}
            className="imageFocusPull__shape"
            style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: shape.size, height: shape.size }}
          />
        ))}
      </div>
      <div
        className="imageFocusPull__plane"
        style={{ zIndex: 1 }}
        ref={(el) => {
          planeRefs.current[1] = el;
        }}
      >
        {MIDGROUND.map((shape, i) => (
          <div
            key={i}
            className="imageFocusPull__shape"
            style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: shape.size, height: shape.size }}
          />
        ))}
      </div>
      <div
        className="imageFocusPull__plane"
        style={{ zIndex: 2 }}
        ref={(el) => {
          planeRefs.current[2] = el;
        }}
      >
        {FOREGROUND_A.map((shape, i) => (
          <div
            key={`a${i}`}
            className="imageFocusPull__shape imageFocusPull__shape--outline"
            ref={(el) => {
              shapeRefsA.current[i] = el;
            }}
            style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: shape.size, height: shape.size }}
          />
        ))}
        {FOREGROUND_B.map((shape, i) => (
          <div
            key={`b${i}`}
            className="imageFocusPull__shape"
            ref={(el) => {
              shapeRefsB.current[i] = el;
            }}
            style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: shape.size, height: shape.size }}
          />
        ))}
      </div>
      <ChoiceRing ref={ringRef} className="imageFocusPull__ring" />
      <div className="imageFocusPull__label mono" ref={labelRef} />
      <div className="imageFocusPull__readout mono" ref={readoutRef}>
        FOCUS 0.00 / {(PLANE_COUNT - 1).toFixed(2)}
      </div>
    </div>
  );
}
