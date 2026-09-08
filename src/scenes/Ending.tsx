import { useEffect, useLayoutEffect, useRef } from "react";
import type { WheelEngine } from "../lib/wheelPhysics";
import { BoundaryPressure } from "../lib/wheelPhysics";
import { BoundaryIndicator, type BoundaryIndicatorHandle } from "../components/BoundaryIndicator";
import { CornerLabels } from "../components/CornerLabels";
import "./Ending.css";

interface EndingProps {
  engine: WheelEngine;
  active: boolean;
  onBoundary: (direction: "forward" | "backward") => void;
  repoUrl?: string;
}

const WORKS_WELL = ["Sequential navigation", "Scrubbing", "Continuous state", "Momentum-based browsing"];
const STRUGGLES = ["Arbitrary spatial selection", "Text entry", "Multi-object manipulation"];

export function Ending({ engine, active, onBoundary, repoUrl }: EndingProps) {
  const topRef = useRef<BoundaryIndicatorHandle>(null);
  const bottomRef = useRef<BoundaryIndicatorHandle>(null);
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const pressure = new BoundaryPressure(0.55, 2.2);
    let lastFrame = performance.now();

    const unsub = engine.subscribe((s) => {
      if (!activeRef.current) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const signal = pressure.update(s.velocity > 0.03, s.velocity < -0.03, Math.abs(s.velocity), dt);
      topRef.current?.update(pressure.backward, pressure.backward > 0.02);
      bottomRef.current?.update(pressure.forward, pressure.forward > 0.02);
      if (signal) onBoundary(signal);
    });

    return unsub;
  }, [engine, onBoundary]);

  return (
    <div className="ending">
      <CornerLabels lines={["04 / 04", "STATE: OBSERVATIONS"]} />
      <div className="ending__grid">
        <div className="ending__column">
          <div className="ending__heading mono">SCROLL WORKS WELL FOR</div>
          <ul className="ending__list ending__list--good">
            {WORKS_WELL.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="ending__divider" />
        <div className="ending__column">
          <div className="ending__heading mono">SCROLL STRUGGLES WITH</div>
          <ul className="ending__list ending__list--bad">
            {STRUGGLES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="ending__statement">Constraint exposes the assumptions hidden inside familiar interfaces.</p>

      <div className="ending__source mono">
        {repoUrl ? (
          <a href={repoUrl} target="_blank" rel="noreferrer">
            VIEW SOURCE →
          </a>
        ) : (
          <span>VIEW SOURCE — repository link goes here</span>
        )}
      </div>

      <BoundaryIndicator ref={topRef} edge="top" label="RETURN TO REWIND" />
      <BoundaryIndicator ref={bottomRef} edge="bottom" label="RESTART" />
    </div>
  );
}
