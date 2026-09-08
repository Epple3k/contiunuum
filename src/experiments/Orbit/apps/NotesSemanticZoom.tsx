import { useRef } from "react";
import type { WheelEngine } from "../../../lib/wheelPhysics";
import { ChoiceGate, clamp } from "../../../lib/wheelPhysics";
import { useBoundedScroll } from "../../../hooks/useBoundedScroll";
import { useInstance } from "../../../hooks/useInstance";
import { ChoiceRing, type ChoiceRingHandle } from "../../../components/ChoiceRing";
import { playClack } from "../../../lib/sound";
import "./NotesSemanticZoom.css";

const SUMMARY = "Ship the redesigned onboarding flow before the Q3 review, pending final copy approval.";
const PARAGRAPH =
  "Ship the redesigned onboarding flow before the Q3 review. Design and engineering are aligned on scope; the remaining blocker is final copy approval from marketing, expected by the 12th.";

// Zooming past PARAGRAPH into full detail is the choice: which account of
// the situation the note actually expands into.
const DETAIL_A = {
  tag: "ACTION ITEMS",
  intro: PARAGRAPH,
  bullets: [
    "Copy review — marketing, due the 12th",
    "QA pass on the new flow — engineering, due the 15th",
    "Analytics events wired up — data, due the 16th",
  ],
};
const DETAIL_B = {
  tag: "RISKS & SCOPE",
  intro:
    "Actually, the bigger risk isn't copy — it's scope creep. Two stakeholders have asked for changes touching the SSO path, and neither has been scheduled.",
  bullets: [
    "SSO path hasn't been re-scoped since the last two asks",
    "No owner assigned for the scope conversation yet",
    "Q3 review date is now at risk independent of the copy blocker",
  ],
};

const LEVELS = 4; // 0: headline, 1: summary, 2: paragraph, 3: full detail (choice)
const GATE_POS = LEVELS - 1.5; // 2.5 — between paragraph and full detail

interface NotesSemanticZoomProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onExit: () => void;
}

/**
 * Experiment: zooming the level of abstraction of one note, rather than its
 * size on screen — with a real choice. Two accounts of the same situation
 * sit side by side as you approach full detail; scrolling shifts weight
 * between them, and holding still commits to whichever is currently favored.
 */
export function NotesSemanticZoom({ engine, active, reducedMotion, onExit }: NotesSemanticZoomProps) {
  const levelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const detailIntroRef = useRef<HTMLParagraphElement>(null);
  const detailBulletRefs = useRef<(HTMLLIElement | null)[]>([]);
  const previewARef = useRef<HTMLDivElement>(null);
  const previewBRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<ChoiceRingHandle>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const gate = useInstance(() => new ChoiceGate(GATE_POS));
  const wasCommittedRef = useRef(false);

  useBoundedScroll(
    engine,
    active,
    { min: 0, max: LEVELS - 1, speed: 1.0, snap: true, reducedMotion, onExitBackward: onExit, freeze: () => gate.isPinned() },
    ({ position, settled, s, dt }) => {
      const choice = gate.step(position, s.velocity, settled, s.phase === "idle", dt);
      if (choice.committed && !wasCommittedRef.current) playClack();
      wasCommittedRef.current = choice.committed;
      const pos = choice.effectivePosition;
      const showChoice = choice.atGate;
      const detail = choice.chosenBranch === "A" ? DETAIL_A : DETAIL_B;

      for (let i = 0; i < LEVELS; i++) {
        const el = levelRefs.current[i];
        if (!el) continue;
        if (i === LEVELS - 1 && showChoice) {
          el.style.opacity = "0";
          continue;
        }
        const d = i - pos;
        const focus = clamp(1 - Math.abs(d) * 1.35, 0, 1);
        el.style.opacity = focus.toFixed(3);
        el.style.transform = `translateY(${(d * 22).toFixed(1)}px) scale(${(0.94 + focus * 0.06).toFixed(3)})`;
        el.style.pointerEvents = focus > 0.5 ? "auto" : "none";
      }

      if (!showChoice && detailIntroRef.current) detailIntroRef.current.textContent = detail.intro;
      if (!showChoice) {
        for (let i = 0; i < detail.bullets.length; i++) {
          const el = detailBulletRefs.current[i];
          if (el) el.textContent = detail.bullets[i];
        }
      }

      const focusA = 1 - choice.choiceFocus;
      const focusB = choice.choiceFocus;
      if (previewARef.current) {
        previewARef.current.style.opacity = showChoice ? (0.4 + focusA * 0.6).toFixed(3) : "0";
        previewARef.current.style.transform = `translateX(calc(-50% - 90px)) scale(${(0.9 + focusA * 0.15).toFixed(3)})`;
      }
      if (previewBRef.current) {
        previewBRef.current.style.opacity = showChoice ? (0.4 + focusB * 0.6).toFixed(3) : "0";
        previewBRef.current.style.transform = `translateX(calc(-50% + 90px)) scale(${(0.9 + focusB * 0.15).toFixed(3)})`;
      }
      ringRef.current?.update(choice.dwellProgress, showChoice);

      if (readoutRef.current) {
        const names = ["HEADLINE", "SUMMARY", "PARAGRAPH", "FULL DETAIL"];
        const tag = showChoice ? ` — choosing ${choice.choiceFocus < 0.5 ? DETAIL_A.tag : DETAIL_B.tag}` : "";
        readoutRef.current.textContent = `${names[clamp(Math.round(pos), 0, LEVELS - 1)]}${tag}`;
      }
    },
  );

  return (
    <div className="notesZoom">
      <div className="notesZoom__stack">
        <div
          className="notesZoom__level notesZoom__level--headline"
          ref={(el) => {
            levelRefs.current[0] = el;
          }}
        >
          Q3 Launch Plan
        </div>
        <div
          className="notesZoom__level notesZoom__level--summary"
          ref={(el) => {
            levelRefs.current[1] = el;
          }}
        >
          {SUMMARY}
        </div>
        <div
          className="notesZoom__level notesZoom__level--paragraph"
          ref={(el) => {
            levelRefs.current[2] = el;
          }}
        >
          {PARAGRAPH}
        </div>
        <div
          className="notesZoom__level notesZoom__level--detail"
          ref={(el) => {
            levelRefs.current[3] = el;
          }}
        >
          <p ref={detailIntroRef} />
          <ul>
            {DETAIL_A.bullets.map((_, i) => (
              <li
                key={i}
                ref={(el) => {
                  detailBulletRefs.current[i] = el;
                }}
              />
            ))}
          </ul>
        </div>

        <div className="notesZoom__preview mono" ref={previewARef}>
          {DETAIL_A.tag}
        </div>
        <div className="notesZoom__preview mono" ref={previewBRef}>
          {DETAIL_B.tag}
        </div>
        <ChoiceRing ref={ringRef} className="notesZoom__ring" />
      </div>
      <div className="notesZoom__readout mono" ref={readoutRef}>
        HEADLINE
      </div>
    </div>
  );
}
