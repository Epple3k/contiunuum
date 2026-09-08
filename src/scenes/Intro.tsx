import { useEffect, useLayoutEffect, useRef } from "react";
import type { WheelEngine } from "../lib/wheelPhysics";
import { BoundaryPressure } from "../lib/wheelPhysics";
import { BoundaryIndicator, type BoundaryIndicatorHandle } from "../components/BoundaryIndicator";
import { CornerLabels } from "../components/CornerLabels";
import "./Intro.css";

interface IntroProps {
  engine: WheelEngine;
  active: boolean;
  onAdvance: () => void;
}

export function Intro({ engine, active, onAdvance }: IntroProps) {
  const boundaryRef = useRef<BoundaryIndicatorHandle>(null);
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

      const signal = pressure.update(s.velocity > 0.03, false, Math.abs(s.velocity), dt);
      boundaryRef.current?.update(pressure.forward, pressure.forward > 0.02);
      if (signal === "forward") onAdvance();
    });

    return unsub;
  }, [engine, onAdvance]);

  return (
    <div className="intro">
      <CornerLabels lines={["01 / 04", "INPUT: WHEEL"]} />
      <div className="intro__rings" aria-hidden="true">
        <div className="intro__ring intro__ring--a" />
        <div className="intro__ring intro__ring--b" />
        <div className="intro__ring intro__ring--c" />
      </div>

      <div className="intro__content">
        <h1 className="intro__title">CONTINUUM</h1>
        <p className="intro__subtitle">Experiments in one-dimensional computing.</p>
        <div className="intro__statement">
          <p>Modern interfaces assume a pointer.</p>
          <p className="intro__statementStrong">This one doesn't.</p>
        </div>
      </div>

      <BoundaryIndicator ref={boundaryRef} edge="bottom" label="USE YOUR SCROLL WHEEL" />
    </div>
  );
}
