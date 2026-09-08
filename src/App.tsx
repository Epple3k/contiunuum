import { useCallback, useRef, useState } from "react";
import { useWheelInput } from "./hooks/useWheelInput";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { useCoarsePointer } from "./hooks/useCoarsePointer";
import { Intro } from "./scenes/Intro";
import { Ending } from "./scenes/Ending";
import { Orbit } from "./experiments/Orbit/Orbit";
import { Rewind } from "./experiments/Rewind/Rewind";
import { SoundToggle } from "./components/SoundToggle";
import { playClack } from "./lib/sound";
import "./App.css";

const SCENE_NAMES = ["intro", "orbit", "rewind", "ending"] as const;
type SceneName = (typeof SCENE_NAMES)[number];

const TRANSITION_LOCK_MS = 750;

function CoarsePointerNotice() {
  return (
    <div className="fallback">
      <div className="fallback__mark">CONTINUUM</div>
      <p>This experiment requires a scroll wheel or trackpad.</p>
      <p className="fallback__sub">Open this page on a desktop or laptop to continue.</p>
    </div>
  );
}

export default function App() {
  const isCoarsePointer = useCoarsePointer();
  const reducedMotion = useReducedMotion();
  const [scene, setScene] = useState<SceneName>("intro");
  const lockRef = useRef(false);
  const lockTimeout = useRef<number | undefined>(undefined);

  const engine = useWheelInput(typeof window !== "undefined" ? window : undefined, {}, !isCoarsePointer);

  const goTo = useCallback(
    (next: SceneName) => {
      if (lockRef.current) return;
      lockRef.current = true;
      engine.reset();
      playClack();
      setScene(next);
      window.clearTimeout(lockTimeout.current);
      lockTimeout.current = window.setTimeout(
        () => {
          lockRef.current = false;
        },
        reducedMotion ? 150 : TRANSITION_LOCK_MS,
      );
    },
    [engine, reducedMotion],
  );

  const handleIntroAdvance = useCallback(() => goTo("orbit"), [goTo]);
  const handleOrbitBoundary = useCallback(
    (direction: "forward" | "backward") => goTo(direction === "forward" ? "rewind" : "intro"),
    [goTo],
  );
  const handleRewindBoundary = useCallback(
    (direction: "forward" | "backward") => goTo(direction === "forward" ? "ending" : "orbit"),
    [goTo],
  );
  const handleEndingBoundary = useCallback(
    (direction: "forward" | "backward") => goTo(direction === "forward" ? "intro" : "rewind"),
    [goTo],
  );

  if (isCoarsePointer) return <CoarsePointerNotice />;

  return (
    <div className="app">
      <div className="grain" />
      <SoundToggle />
      <div className={`sceneLayer ${scene === "intro" ? "is-active" : ""}`} aria-hidden={scene !== "intro"}>
        <Intro engine={engine} active={scene === "intro"} onAdvance={handleIntroAdvance} />
      </div>
      <div className={`sceneLayer ${scene === "orbit" ? "is-active" : ""}`} aria-hidden={scene !== "orbit"}>
        <Orbit engine={engine} active={scene === "orbit"} reducedMotion={reducedMotion} onBoundary={handleOrbitBoundary} />
      </div>
      <div className={`sceneLayer ${scene === "rewind" ? "is-active" : ""}`} aria-hidden={scene !== "rewind"}>
        <Rewind engine={engine} active={scene === "rewind"} reducedMotion={reducedMotion} onBoundary={handleRewindBoundary} />
      </div>
      <div className={`sceneLayer ${scene === "ending" ? "is-active" : ""}`} aria-hidden={scene !== "ending"}>
        <Ending
          engine={engine}
          active={scene === "ending"}
          onBoundary={handleEndingBoundary}
          repoUrl="https://github.com/Epple3k/contiunuum"
        />
      </div>
    </div>
  );
}
