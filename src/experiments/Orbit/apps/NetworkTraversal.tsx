import { useRef } from "react";
import type { WheelEngine } from "../../../lib/wheelPhysics";
import { ChoiceGate, clamp, lerp } from "../../../lib/wheelPhysics";
import { useBoundedScroll } from "../../../hooks/useBoundedScroll";
import { useInstance } from "../../../hooks/useInstance";
import { ChoiceRing, type ChoiceRingHandle } from "../../../components/ChoiceRing";
import { playClack } from "../../../lib/sound";
import "./NetworkTraversal.css";

// Hand-placed so the traversal path reads as a deliberate sweep around the
// perimeter before cutting into the interior. Nodes 11-15 only exist on the
// alternate branch past the junction at node 5.
const NODES = [
  { x: 50, y: 14 },
  { x: 73, y: 25 },
  { x: 86, y: 46 },
  { x: 77, y: 69 },
  { x: 57, y: 83 },
  { x: 34, y: 80 }, // 5 — the junction
  { x: 14, y: 65 }, // branch A tail
  { x: 9, y: 39 },
  { x: 25, y: 19 },
  { x: 45, y: 46 },
  { x: 61, y: 51 },
  { x: 52, y: 60 }, // branch B tail
  { x: 68, y: 55 },
  { x: 82, y: 62 },
  { x: 78, y: 40 },
  { x: 60, y: 30 },
];

const CONTEXT_EDGES: [number, number][] = [
  [0, 8],
  [2, 10],
  [9, 6],
  [3, 10],
  [9, 1],
];

const PATH_SHARED = [0, 1, 2, 3, 4, 5];
const PATH_A_TAIL = [5, 6, 7, 8, 9, 10];
const PATH_B_TAIL = [5, 11, 12, 13, 14, 15];
const GATE_POS = PATH_SHARED.length - 1; // 5 — the junction
const TOTAL_HOPS = GATE_POS + (PATH_A_TAIL.length - 1); // 10

interface NetworkTraversalProps {
  engine: WheelEngine;
  active: boolean;
  reducedMotion: boolean;
  onExit: () => void;
}

/**
 * Experiment: exploring a graph as a continuous walk instead of a static
 * zoomed-out map — with a real choice at node 5. Both onward directions
 * glow simultaneously; scrolling shifts weight toward one, and holding still
 * commits to whichever is currently favored.
 */
export function NetworkTraversal({ engine, active, reducedMotion, onExit }: NetworkTraversalProps) {
  const sharedEdgeRefs = useRef<(SVGLineElement | null)[]>([]);
  const tailEdgeRefsA = useRef<(SVGLineElement | null)[]>([]);
  const tailEdgeRefsB = useRef<(SVGLineElement | null)[]>([]);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);
  const cursorRef = useRef<SVGCircleElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<ChoiceRingHandle>(null);
  const gate = useInstance(() => new ChoiceGate(GATE_POS));
  const wasCommittedRef = useRef(false);

  useBoundedScroll(
    engine,
    active,
    { min: 0, max: TOTAL_HOPS, speed: 1.4, snap: true, reducedMotion, onExitBackward: onExit, freeze: () => gate.isPinned() },
    ({ position, settled, s, dt }) => {
      const choice = gate.step(position, s.velocity, settled, s.phase === "idle", dt);
      if (choice.committed && !wasCommittedRef.current) playClack();
      wasCommittedRef.current = choice.committed;
      const pos = choice.effectivePosition;
      const branch = choice.committed ? choice.chosenBranch : "A";
      const showChoice = choice.atGate;

      for (let i = 0; i < PATH_SHARED.length - 1; i++) {
        const el = sharedEdgeRefs.current[i];
        if (!el) continue;
        const t = clamp(pos - i, 0, 1);
        el.style.opacity = (0.15 + t * 0.85).toFixed(3);
        el.style.strokeWidth = (0.4 + t * 0.9).toFixed(2);
      }
      for (let k = 0; k < PATH_SHARED.length; k++) {
        const el = nodeRefs.current[PATH_SHARED[k]];
        if (!el) continue;
        const visited = clamp(pos - k + 1, 0, 1);
        el.style.opacity = (0.3 + visited * 0.7).toFixed(3);
        el.style.r = (1.6 + visited * 1.4).toFixed(2);
      }

      (["A", "B"] as const).forEach((tailBranch) => {
        const tail = tailBranch === "A" ? PATH_A_TAIL : PATH_B_TAIL;
        const edgeRefs = tailBranch === "A" ? tailEdgeRefsA : tailEdgeRefsB;
        const isChosen = branch === tailBranch;
        const focus = tailBranch === "A" ? 1 - choice.choiceFocus : choice.choiceFocus;

        for (let j = 0; j < tail.length - 1; j++) {
          const el = edgeRefs.current[j];
          if (!el) continue;
          if (showChoice && j === 0) {
            // The immediate next step from the junction previews both directions at once.
            el.style.opacity = (0.25 + focus * 0.65).toFixed(3);
            el.style.strokeWidth = (0.4 + focus * 0.7).toFixed(2);
            continue;
          }
          const t = clamp(pos - (GATE_POS + j), 0, 1);
          el.style.opacity = isChosen ? (0.15 + t * 0.85).toFixed(3) : showChoice ? "0.06" : "0.06";
          el.style.strokeWidth = (isChosen ? 0.4 + t * 0.9 : 0.35).toFixed(2);
        }
        for (let k = 1; k < tail.length; k++) {
          const el = nodeRefs.current[tail[k]];
          if (!el) continue;
          if (showChoice && k === 1) {
            el.style.opacity = (0.35 + focus * 0.55).toFixed(3);
            el.style.r = (1.6 + focus * 1.2).toFixed(2);
            continue;
          }
          const visited = clamp(pos - (GATE_POS + k) + 1, 0, 1);
          el.style.opacity = isChosen ? (0.3 + visited * 0.7).toFixed(3) : "0.18";
          el.style.r = (isChosen ? 1.6 + visited * 1.4 : 1.6).toFixed(2);
        }
      });

      // Cursor follows the shared path up to the junction, then whichever branch is active.
      const clampedPos = clamp(pos, 0, TOTAL_HOPS);
      let cx: number;
      let cy: number;
      if (clampedPos <= GATE_POS) {
        const lo = Math.floor(clampedPos);
        const hi = Math.min(GATE_POS, lo + 1);
        const t = clampedPos - lo;
        const a = NODES[PATH_SHARED[lo]];
        const b = NODES[PATH_SHARED[hi]];
        cx = lerp(a.x, b.x, t);
        cy = lerp(a.y, b.y, t);
      } else {
        const tail = branch === "A" ? PATH_A_TAIL : PATH_B_TAIL;
        const local = clampedPos - GATE_POS;
        const lo = Math.floor(local);
        const hi = Math.min(tail.length - 1, lo + 1);
        const t = local - lo;
        const a = NODES[tail[lo]];
        const b = NODES[tail[hi]];
        cx = lerp(a.x, b.x, t);
        cy = lerp(a.y, b.y, t);
      }
      if (cursorRef.current) {
        cursorRef.current.setAttribute("cx", cx.toFixed(2));
        cursorRef.current.setAttribute("cy", cy.toFixed(2));
      }

      ringRef.current?.update(choice.dwellProgress, showChoice);

      if (readoutRef.current) {
        const tag = showChoice ? ` — choosing ${choice.choiceFocus < 0.5 ? "A" : "B"}` : "";
        readoutRef.current.textContent = `HOP ${clamp(Math.round(pos), 0, TOTAL_HOPS)} / ${TOTAL_HOPS}${tag}`;
      }
    },
  );

  return (
    <div className="networkTraversal">
      <div className="networkTraversal__stage">
        <svg className="networkTraversal__canvas" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {CONTEXT_EDGES.map(([a, b]) => (
            <line
              key={`ctx-${a}-${b}`}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              className="networkTraversal__contextEdge"
            />
          ))}
          {PATH_SHARED.slice(0, -1).map((from, i) => (
            <line
              key={`shared-${from}`}
              x1={NODES[from].x}
              y1={NODES[from].y}
              x2={NODES[PATH_SHARED[i + 1]].x}
              y2={NODES[PATH_SHARED[i + 1]].y}
              className="networkTraversal__pathEdge"
              ref={(el) => {
                sharedEdgeRefs.current[i] = el;
              }}
            />
          ))}
          {PATH_A_TAIL.slice(0, -1).map((from, i) => (
            <line
              key={`a-${from}`}
              x1={NODES[from].x}
              y1={NODES[from].y}
              x2={NODES[PATH_A_TAIL[i + 1]].x}
              y2={NODES[PATH_A_TAIL[i + 1]].y}
              className="networkTraversal__pathEdge"
              ref={(el) => {
                tailEdgeRefsA.current[i] = el;
              }}
            />
          ))}
          {PATH_B_TAIL.slice(0, -1).map((from, i) => (
            <line
              key={`b-${from}`}
              x1={NODES[from].x}
              y1={NODES[from].y}
              x2={NODES[PATH_B_TAIL[i + 1]].x}
              y2={NODES[PATH_B_TAIL[i + 1]].y}
              className="networkTraversal__pathEdge"
              ref={(el) => {
                tailEdgeRefsB.current[i] = el;
              }}
            />
          ))}
          {NODES.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={1.6}
              className="networkTraversal__node"
              ref={(el) => {
                nodeRefs.current[i] = el;
              }}
            />
          ))}
          <circle ref={cursorRef} cx={NODES[0].x} cy={NODES[0].y} r="2.6" className="networkTraversal__cursor" />
        </svg>
        <ChoiceRing
          ref={ringRef}
          className="networkTraversal__ring"
          style={{ left: `${NODES[GATE_POS].x}%`, top: `${NODES[GATE_POS].y}%` }}
        />
      </div>
      <div className="networkTraversal__readout mono" ref={readoutRef}>
        HOP 0 / {TOTAL_HOPS}
      </div>
    </div>
  );
}
