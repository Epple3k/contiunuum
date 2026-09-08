export interface RewindShape {
  id: string;
  cx: number; // percent
  cy: number; // percent
  r: number; // percent
  opacity: number;
  blur: number;
  ring: boolean;
}

export interface RewindState {
  rev: string;
  timeOffset: string;
  caption: string;
  shapes: RewindShape[];
}

const CAPTIONS = [
  "first mark",
  "counterweight added",
  "drifting into balance",
  "a third voice",
  "tightened",
  "opened up again",
  "outer ring",
  "settling",
  "near final",
  "current composition",
  "current composition",
  "current composition",
];

const COUNT = 10;

/** Deterministic pseudo-randomness so every load produces the same history. */
function hashish(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function buildStates(count: number): RewindState[] {
  const states: RewindState[] = [];
  for (let s = 0; s < count; s++) {
    const shapes: RewindShape[] = [];
    for (let i = 0; i < count; i++) {
      const revealed = i <= s;
      const age = s - i; // how many revisions since this shape appeared
      const angle = (i / count) * Math.PI * 2 + s * 0.12;
      const jitter = hashish(i * 7.31) * 0.6;
      const baseRadius = 16 + ((i * 37) % 5) * 6.5 + jitter * 4;
      const cx = 50 + Math.cos(angle) * baseRadius * 0.62;
      const cy = 50 + Math.sin(angle) * baseRadius * 0.42;
      const size = revealed ? 5 + ((i * 13) % 4) * 2.6 + Math.min(age, 4) * 0.5 : 1;
      const opacity = revealed ? Math.min(0.5, 0.14 + age * 0.045) : 0;
      shapes.push({
        id: `s${i}`,
        cx,
        cy,
        r: size,
        opacity,
        blur: revealed ? 0 : 4,
        ring: i % 3 === 2,
      });
    }
    states.push({
      rev: String(s + 1).padStart(3, "0"),
      timeOffset: s === count - 1 ? "NOW" : `-${((count - 1 - s) * 6).toString().padStart(2, "0")}:00`,
      caption: CAPTIONS[Math.min(s, CAPTIONS.length - 1)],
      shapes,
    });
  }
  return states;
}

export const REWIND_STATES: RewindState[] = buildStates(COUNT);
