import { useRef } from "react";
import type { WheelEngine } from "../../../lib/wheelPhysics";
import { ChoiceGate, clamp } from "../../../lib/wheelPhysics";
import { useBoundedScroll } from "../../../hooks/useBoundedScroll";
import { useInstance } from "../../../hooks/useInstance";
import { ChoiceRing, type ChoiceRingHandle } from "../../../components/ChoiceRing";
import { playClack } from "../../../lib/sound";
import "./ArchiveZoom.css";

// Depths 0-3 are the same regardless of what you choose; only what lies
// beyond the gate differs — a genuinely different subtree, not a recolor.
const SHARED_LEVELS = ["ROOT", "PROJECTS", "2024", "Q3_REVIEW"];
const BRANCH_A = ["CLIENT_WORK", "DRAFTS", "ASSET_014", "REVISIONS", "ORIGINAL.PSD"];
const BRANCH_B = ["LEGAL_HOLD", "COMPLIANCE_COPY", "REDACTED_v2", "AUDIT_LOG", "ARCHIVED_FINAL"];

const GATE_POS = SHARED_LEVELS.length - 1; // 3 — Q3_REVIEW is the fork
const TOTAL_LEVELS = SHARED_LEVELS.length + BRANCH_A.length;
const ZOOM_PER_LEVEL = 2.6;
const BASE_SIZE = 420;

function labelAt(i: number, branch: "A" | "B"): string {
  if (i < SHARED_LEVELS.length) return SHARED_LEVELS[i];
  return (branch === "A" ? BRANCH_A : BRANCH_B)[i - SHARED_LEVELS.length];
}

interface ArchiveZoomProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onExit: () => void;
}

/**
 * Experiment: hierarchy navigation as continuous zoom instead of click-to-open —
 * with a real choice at Q3_REVIEW. Both possible subfolders sit side by side;
 * scrolling shifts weight between them, and holding still commits to
 * whichever is currently favored — the same hold-still-to-open logic Orbit
 * itself uses, just choosing between two options instead of one.
 */
export function ArchiveZoom({ engine, active, reducedMotion, onExit }: ArchiveZoomProps) {
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previewARef = useRef<HTMLDivElement>(null);
  const previewBRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<ChoiceRingHandle>(null);
  const depthReadoutRef = useRef<HTMLDivElement>(null);
  const gate = useInstance(() => new ChoiceGate(GATE_POS));
  const wasCommittedRef = useRef(false);

  useBoundedScroll(
    engine,
    active,
    { min: 0, max: TOTAL_LEVELS - 1, speed: 1.1, snap: false, reducedMotion, onExitBackward: onExit, freeze: () => gate.isPinned() },
    ({ position, settled, s, dt }) => {
      const choice = gate.step(position, s.velocity, settled, s.phase === "idle", dt);
      if (choice.committed && !wasCommittedRef.current) playClack();
      wasCommittedRef.current = choice.committed;
      const depth = choice.effectivePosition;
      const branch = choice.committed ? choice.chosenBranch : "A";
      const showChoice = choice.atGate;

      for (let i = 0; i < TOTAL_LEVELS; i++) {
        const el = frameRefs.current[i];
        const label = labelRefs.current[i];
        if (!el) continue;
        if (showChoice && i === GATE_POS + 1) {
          el.style.opacity = "0"; // this level is shown by the two preview panels instead
          continue;
        }
        const d = i - depth;
        const scale = Math.pow(ZOOM_PER_LEVEL, -d);

        let opacity = 1;
        if (d < -1.4) opacity = clamp(1 - (-1.4 - d) / 1.1, 0, 1);
        if (d > 3.2) opacity = clamp(1 - (d - 3.2) / 1.4, 0, 1);

        el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);

        if (label) {
          const focus = clamp(1 - Math.abs(d) * 1.5, 0, 1);
          label.style.opacity = (0.4 + focus * 0.6).toFixed(3);
          label.textContent = labelAt(i, branch);
        }
      }

      const previewScale = Math.pow(ZOOM_PER_LEVEL, -1);
      const focusA = 1 - choice.choiceFocus;
      const focusB = choice.choiceFocus;
      if (previewARef.current) {
        previewARef.current.style.opacity = showChoice ? (0.35 + focusA * 0.65).toFixed(3) : "0";
        previewARef.current.style.transform = `translate(calc(-50% - 78px), -50%) scale(${(previewScale * (0.82 + focusA * 0.3)).toFixed(3)})`;
        previewARef.current.textContent = BRANCH_A[0];
      }
      if (previewBRef.current) {
        previewBRef.current.style.opacity = showChoice ? (0.35 + focusB * 0.65).toFixed(3) : "0";
        previewBRef.current.style.transform = `translate(calc(-50% + 78px), -50%) scale(${(previewScale * (0.82 + focusB * 0.3)).toFixed(3)})`;
        previewBRef.current.textContent = BRANCH_B[0];
      }
      ringRef.current?.update(choice.dwellProgress, showChoice);

      if (depthReadoutRef.current) {
        const tag = showChoice ? ` — choosing ${choice.choiceFocus < 0.5 ? BRANCH_A[0] : BRANCH_B[0]}` : "";
        depthReadoutRef.current.textContent = `DEPTH ${Math.max(0, depth).toFixed(1)} / ${TOTAL_LEVELS - 1}${tag}`;
      }
    },
  );

  return (
    <div className="archiveZoom">
      {Array.from({ length: TOTAL_LEVELS }, (_, i) => (
        <div
          key={i}
          className="archiveZoom__frame"
          ref={(el) => {
            frameRefs.current[i] = el;
          }}
          style={{ width: BASE_SIZE, height: BASE_SIZE, zIndex: i }}
        >
          <div
            className="archiveZoom__label mono"
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
          />
        </div>
      ))}
      <div className="archiveZoom__preview mono" ref={previewARef} style={{ width: BASE_SIZE, height: BASE_SIZE }} />
      <div className="archiveZoom__preview mono" ref={previewBRef} style={{ width: BASE_SIZE, height: BASE_SIZE }} />
      <ChoiceRing ref={ringRef} className="archiveZoom__ring" />
      <div className="archiveZoom__readout mono" ref={depthReadoutRef}>
        DEPTH 0.0 / {TOTAL_LEVELS - 1}
      </div>
    </div>
  );
}
