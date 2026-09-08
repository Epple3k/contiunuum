import { forwardRef, useImperativeHandle, useRef } from "react";
import "./BoundaryIndicator.css";

export interface BoundaryIndicatorHandle {
  /** progress: 0..1 fill amount. active: whether to show it at all. */
  update(progress: number, active: boolean): void;
}

interface BoundaryIndicatorProps {
  edge: "top" | "bottom";
  label: string;
}

/**
 * A resistance ring shown when the user pushes past a domain boundary
 * (e.g. scrolling forward while already on the last orbit item). Filling it
 * completely triggers a scene transition — the visual equivalent of the
 * rubber-band "let go to continue" gesture.
 */
export const BoundaryIndicator = forwardRef<BoundaryIndicatorHandle, BoundaryIndicatorProps>(
  ({ edge, label }, ref) => {
    const ringRef = useRef<HTMLDivElement>(null);
    const arcRef = useRef<SVGCircleElement>(null);
    const CIRC = 2 * Math.PI * 20;

    useImperativeHandle(ref, () => ({
      update(progress, active) {
        if (ringRef.current) {
          ringRef.current.style.opacity = active ? String(Math.min(1, progress * 1.6 + 0.15)) : "0";
          ringRef.current.style.transform = `translateX(-50%) scale(${active ? 1 : 0.85})`;
        }
        if (arcRef.current) {
          arcRef.current.style.strokeDashoffset = String(CIRC * (1 - progress));
        }
      },
    }));

    return (
      <div className={`boundaryIndicator boundaryIndicator--${edge}`} ref={ringRef} aria-hidden="true">
        <svg viewBox="0 0 44 44" className="boundaryIndicator__svg">
          <circle cx="22" cy="22" r="20" className="boundaryIndicator__track" />
          <circle
            ref={arcRef}
            cx="22"
            cy="22"
            r="20"
            className="boundaryIndicator__arc"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC}
          />
        </svg>
        <span className="boundaryIndicator__chevron">{edge === "bottom" ? "▾" : "▴"}</span>
        <span className="boundaryIndicator__label mono">{label}</span>
      </div>
    );
  },
);
