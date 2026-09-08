import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import type { WheelEngine } from "../../lib/wheelPhysics";
import { BoundaryPressure, Spring, clamp } from "../../lib/wheelPhysics";
import { Telemetry } from "../../components/Telemetry";
import { CornerLabels } from "../../components/CornerLabels";
import { TranslationPanel } from "../../components/TranslationPanel";
import { BoundaryIndicator, type BoundaryIndicatorHandle } from "../../components/BoundaryIndicator";
import { ORBIT_APPS, type OrbitApp } from "./orbitApps";
import { playClack, playTick } from "../../lib/sound";
import { ArchiveZoom } from "./apps/ArchiveZoom";
import { NetworkTraversal } from "./apps/NetworkTraversal";
import { ImageFocusPull } from "./apps/ImageFocusPull";
import { NotesSemanticZoom } from "./apps/NotesSemanticZoom";
import "./Orbit.css";

const N = ORBIT_APPS.length;
const SPEED = 0.62; // index-units of rotation per second, per unit of engine velocity
const DWELL_SECONDS = 1.0; // time to fully open by simply holding still
const CLOSE_RATE = 3.4; // how fast a backward scroll drains openness
const MOTION_DEADZONE = 0.05; // ignores trackpad jitter so it can't fake a deliberate rotate or restart the dwell
const RING_CIRC = 2 * Math.PI * 58;
const MINI_ACTIVE_THRESHOLD = 0.97; // openFrac above this hands wheel control to the nested experiment
const MINI_MOUNT_ENTER = 0.55; // openFrac above this mounts the nested experiment (fading in)
const MINI_MOUNT_EXIT = 0.4; // openFrac below this unmounts it — hysteresis avoids thrashing at one boundary

interface MiniAppProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onExit: () => void;
}

const MINI_APPS: Record<OrbitApp["id"], ComponentType<MiniAppProps>> = {
  archive: ArchiveZoom,
  network: NetworkTraversal,
  images: ImageFocusPull,
  notes: NotesSemanticZoom,
};

interface OrbitProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onBoundary: (direction: "forward" | "backward") => void;
}

export function Orbit({ engine, active, reducedMotion, onBoundary }: OrbitProps) {
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nameRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<BoundaryIndicatorHandle>(null);
  const boundaryTopRef = useRef<BoundaryIndicatorHandle>(null);
  const arcRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const ringGroupRef = useRef<SVGGElement>(null);
  const ringArcRef = useRef<SVGCircleElement>(null);

  const [openAppIndex, setOpenAppIndex] = useState(Math.round((N - 1) / 2));
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  // These only cross into React state at the thresholds that actually change what's
  // rendered, so an open/close animation doesn't re-render this component every frame.
  const [suppressTranslation, setSuppressTranslation] = useState(false);
  const [miniVisible, setMiniVisible] = useState(false);
  const [miniActive, setMiniActive] = useState(false);

  const activeRef = useRef(active);
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => {
    activeRef.current = active;
    reducedMotionRef.current = reducedMotion;
  }, [active, reducedMotion]);

  // Set by the nested mini-experiment when it's pushed past its own zero edge —
  // read once at the top of the next tick to hand wheel control back to Orbit.
  const forceCloseRef = useRef(false);
  const handleMiniExit = useCallback(() => {
    forceCloseRef.current = true;
  }, []);

  useEffect(() => {
    const position = { current: Math.round(N / 2) - 0.001 }; // authoritative float index
    const spring = new Spring(position.current, 140, 15);
    const pressure = new BoundaryPressure(0.9, 2.6);
    let openFrac = 0; // continuous 0..1: how far into "opening" the centered item we are
    let lastFrame = performance.now();
    let lastLockedIndex = -1;
    let lastOpenAppIndex = -1;
    let hasInteracted = false;
    let announcedOpen = false;
    let suppressed = false;
    let miniVisibleFlag = false;
    let miniActiveFlag = false;

    const unsub = engine.subscribe((s) => {
      if (!activeRef.current) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      if (s.phase === "active" && !hasInteracted) {
        hasInteracted = true;
        if (hintRef.current) hintRef.current.style.opacity = "0";
      }

      // Once fully open, the nested mini-experiment owns the wheel entirely — Orbit's
      // own physics stay frozen until that experiment reports it's been pushed back
      // past its own zero edge (forceCloseRef), at which point we resume right here,
      // one tick below the threshold, using this frame's still-live velocity.
      if (openFrac >= MINI_ACTIVE_THRESHOLD) {
        if (forceCloseRef.current) {
          forceCloseRef.current = false;
          openFrac = MINI_ACTIVE_THRESHOLD - 0.001;
          // Flip the mini-experiment's `active` prop false in this same tick — not just
          // when openFrac later drains below threshold — so it stops processing wheel
          // input immediately rather than racing Orbit's closing logic for a few frames.
          if (miniActiveFlag) {
            miniActiveFlag = false;
            setMiniActive(false);
          }
        } else {
          if (!miniActiveFlag) {
            miniActiveFlag = true;
            playClack();
            setMiniActive(true);
          }
          return;
        }
      } else if (miniActiveFlag) {
        miniActiveFlag = false;
        setMiniActive(false);
      }

      let boundarySignal: "forward" | "backward" | null = null;
      let mode: "free" | "snapping" = "snapping";

      // A backward scroll while something is open (or opening) closes it first —
      // it never falls through to "rotate to the previous item" until openness hits 0.
      // No deadzone here: the drain is proportional to velocity, so tiny jitter closes
      // by an imperceptible amount instead of never registering at all.
      const closing = openFrac > 0.001 && s.velocity < -0.001;

      if (closing) {
        openFrac = clamp(openFrac - Math.abs(s.velocity) * dt * CLOSE_RATE, 0, 1);
        pressure.update(false, false, 0, dt);
      } else {
        // A deadzone here (unlike above) matters: without it, a stray jittery tick from a
        // trackpad would register as "real" motion, resetting openness and restarting the
        // dwell from zero every time someone tries to hold still.
        const freeRunning = (s.phase === "active" || s.phase === "gliding") && Math.abs(s.velocity) > MOTION_DEADZONE;
        mode = freeRunning ? "free" : "snapping";

        if (mode === "free") {
          openFrac = 0; // any real rotation cancels a pending dwell-open
          const raw = position.current + s.velocity * dt * SPEED;
          const clamped = clamp(raw, 0, N - 1);
          const overshoot = raw - clamped;

          boundarySignal = pressure.update(overshoot > 0.001, overshoot < -0.001, Math.abs(s.velocity), dt);
          position.current = clamped + overshoot * 0.12; // faint rubber-band give at the edges
          spring.snapTo(position.current);
        } else {
          pressure.update(false, false, 0, dt);
          const target = Math.round(position.current);
          if (spring.target !== target) spring.target = target;
          if (reducedMotionRef.current) {
            spring.snapTo(target);
            position.current = target;
          } else {
            position.current = spring.step(dt);
          }

          if (spring.isSettled(0.0015) && s.phase === "idle") {
            openFrac = clamp(openFrac + dt / DWELL_SECONDS, 0, 1);
          }
        }
      }

      if (boundarySignal) {
        onBoundary(boundarySignal);
      }
      if (boundaryRef.current) {
        boundaryRef.current.update(pressure.forward, pressure.forward > 0.02);
      }
      if (boundaryTopRef.current) {
        boundaryTopRef.current.update(pressure.backward, pressure.backward > 0.02);
      }

      const nearest = Math.round(position.current);
      if (nearest !== lastLockedIndex && mode === "snapping" && spring.isSettled(0.02)) {
        lastLockedIndex = nearest;
        const el = nodeRefs.current[nearest];
        if (el) {
          el.classList.remove("is-locked");
          void el.offsetWidth;
          el.classList.add("is-locked");
        }
        playTick();
      }

      if (nearest !== lastOpenAppIndex) {
        lastOpenAppIndex = nearest;
        setOpenAppIndex(nearest);
      }
      if (openFrac > 0.3 && !announcedOpen) {
        announcedOpen = true;
        setHasOpenedOnce(true);
      }
      const shouldSuppress = openFrac >= 0.3;
      if (shouldSuppress !== suppressed) {
        suppressed = shouldSuppress;
        setSuppressTranslation(shouldSuppress);
      }

      // --- render orbit ring ---
      const pos = position.current;
      const radius = Math.min(window.innerWidth * 0.3, 400);
      const curveDepth = 78;
      for (let i = 0; i < N; i++) {
        const el = nodeRefs.current[i];
        if (!el) continue;
        const theta = (i - pos) * (Math.PI / 5.4); // ~33.3deg spacing in radians
        const c = Math.cos(theta);
        const x = Math.sin(theta) * radius;
        const y = -(1 - c) * curveDepth;
        const scale = 0.5 + 0.5 * c;
        const opacity = clamp(c * 1.35, 0.04, 1);
        const blur = (1 - c) * 3.2;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : "";
        el.style.zIndex = String(Math.round(c * 100) + 100);
      }

      const nearestApp = ORBIT_APPS[clamp(nearest, 0, N - 1)];
      const focus = clamp(1 - Math.abs(pos - nearest) * 2.2, 0, 1);
      if (nameRef.current) {
        nameRef.current.textContent = nearestApp.name;
        nameRef.current.style.opacity = String(0.35 + focus * 0.65);
      }
      if (descRef.current) {
        descRef.current.textContent = nearestApp.descriptor;
        descRef.current.style.opacity = String(0.25 + focus * 0.55);
      }
      if (arcRef.current) {
        arcRef.current.style.setProperty("--focus", focus.toFixed(3));
      }

      // --- render the continuous open/close crossfade ---
      const stageOpacity = clamp(1 - openFrac * 1.3, 0, 1);
      if (stageRef.current) {
        stageRef.current.style.opacity = stageOpacity.toFixed(3);
        stageRef.current.style.transform = `scale(${(1 - openFrac * 0.06).toFixed(3)})`;
        stageRef.current.style.pointerEvents = openFrac > 0.5 ? "none" : "auto";
      }
      const panelT = clamp((openFrac - 0.05) / 0.5, 0, 1);
      if (detailRef.current) {
        detailRef.current.style.opacity = panelT.toFixed(3);
        detailRef.current.style.transform = `scale(${(0.88 + panelT * 0.12).toFixed(3)})`;
        detailRef.current.style.filter = `blur(${((1 - panelT) * 6).toFixed(2)}px)`;
        detailRef.current.style.pointerEvents = openFrac > 0.6 ? "auto" : "none";
      }
      // The dwell ring only appears once something is settled and mode is 'snapping' or actively closing.
      const ringVisible = mode === "snapping" || closing;
      if (ringGroupRef.current) {
        const ringOpacity = ringVisible ? clamp(1 - Math.max(0, openFrac - 0.55) / 0.45, 0, 1) : 0;
        ringGroupRef.current.style.opacity = ringOpacity.toFixed(3);
      }
      if (ringArcRef.current) {
        ringArcRef.current.style.strokeDashoffset = String(RING_CIRC * (1 - openFrac));
      }

      if (!miniVisibleFlag && openFrac > MINI_MOUNT_ENTER) {
        miniVisibleFlag = true;
        setMiniVisible(true);
      } else if (miniVisibleFlag && openFrac < MINI_MOUNT_EXIT) {
        miniVisibleFlag = false;
        setMiniVisible(false);
      }
    });

    return unsub;
  }, [engine, onBoundary]);

  const openApp = ORBIT_APPS[openAppIndex];

  return (
    <div className="orbit">
      <CornerLabels lines={["EXPERIMENT 01 / SELECTION", "INPUT CHANNEL / WHEEL", "DEGREES OF FREEDOM / 1"]} />

      <div className="orbit__stage" ref={stageRef}>
        <div className="orbit__arc" ref={arcRef} />
        <svg className="orbit__dwellRing" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="58" className="orbit__dwellTrack" />
          <g ref={ringGroupRef} className="orbit__dwellFillGroup">
            <circle
              ref={ringArcRef}
              cx="60"
              cy="60"
              r="58"
              className="orbit__dwellFill"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={RING_CIRC}
            />
          </g>
        </svg>
        <div className="orbit__ring">
          {ORBIT_APPS.map((app, i) => (
            <div
              className="orbit__node"
              key={app.id}
              ref={(el) => {
                nodeRefs.current[i] = el;
              }}
            >
              <div className="orbit__nodeGlyph">{app.icon}</div>
            </div>
          ))}
        </div>

        <div className="orbit__focusLabel">
          <div className="orbit__focusName" ref={nameRef}>
            {ORBIT_APPS[Math.round((N - 1) / 2)].name}
          </div>
          <div className="orbit__focusDesc" ref={descRef}>
            {ORBIT_APPS[Math.round((N - 1) / 2)].descriptor}
          </div>
        </div>

        <div className="orbit__hint mono" ref={hintRef}>
          SCROLL TO ROTATE
        </div>
      </div>

      <div className="orbitDetail" ref={detailRef}>
        <div className="orbitDetail__header">
          <div className="orbitDetail__glyph">{openApp.icon}</div>
          <h2 className="orbitDetail__title">{openApp.name}</h2>
        </div>
        <div className="orbitDetail__stage">
          {miniVisible &&
            (() => {
              const MiniApp = MINI_APPS[openApp.id];
              return (
                <MiniApp engine={engine} active={miniActive} reducedMotion={reducedMotion} onExit={handleMiniExit} />
              );
            })()}
        </div>
      </div>

      <BoundaryIndicator ref={boundaryTopRef} edge="top" label="RETURN TO START" />
      <BoundaryIndicator ref={boundaryRef} edge="bottom" label="CONTINUE" />
      <Telemetry engine={engine} />
      <TranslationPanel
        visible={hasOpenedOnce && !suppressTranslation}
        rows={[
          ["POINT", "ANGULAR POSITION"],
          ["CLICK", "DECELERATION + DWELL"],
          ["BROWSING", "MOMENTUM"],
        ]}
        sentence="Removing the pointer turns selection from a spatial action into a temporal one."
      />
      {reducedMotion && <span className="visually-hidden">Reduced motion is enabled; transitions are shortened.</span>}
    </div>
  );
}
