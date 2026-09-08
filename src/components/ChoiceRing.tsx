import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from "react";
import "./ChoiceRing.css";

export interface ChoiceRingHandle {
  /** progress: 0..1 dwell/commit fill. visible: whether to show the ring at all. */
  update(progress: number, visible: boolean): void;
}

const CIRC = 2 * Math.PI * 15;

/**
 * The same "hold still and watch a ring fill" affordance Orbit uses to open
 * something, reused wherever a nested experiment needs to confirm a choice —
 * one consistent visual for "committing" everywhere in the piece.
 */
export const ChoiceRing = forwardRef<ChoiceRingHandle, { className?: string; style?: CSSProperties }>(
  ({ className, style }, ref) => {
    const groupRef = useRef<SVGGElement>(null);
    const arcRef = useRef<SVGCircleElement>(null);

    useImperativeHandle(ref, () => ({
      update(progress, visible) {
        if (groupRef.current) groupRef.current.style.opacity = visible ? "1" : "0";
        if (arcRef.current) arcRef.current.style.strokeDashoffset = String(CIRC * (1 - progress));
      },
    }));

    return (
      <svg className={`choiceRing ${className ?? ""}`} style={style} viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" className="choiceRing__track" />
        <g ref={groupRef} className="choiceRing__fillGroup">
          <circle
            ref={arcRef}
            cx="18"
            cy="18"
            r="15"
            className="choiceRing__fill"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC}
          />
        </g>
      </svg>
    );
  },
);
