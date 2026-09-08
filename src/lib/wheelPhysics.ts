/**
 * wheelPhysics — a framework-agnostic engine that turns raw WheelEvents into
 * a rich, continuous description of scroll intent: direction, velocity,
 * momentum, dwell, and reversal. Every interaction in this project is
 * derived from the values this module produces.
 *
 * The design goal: treat the wheel as an analog input device, not a page
 * scroller. Consumers integrate `velocity` into whatever domain quantity
 * they own (an angle, a timeline position) rather than reading `delta`
 * directly — that's what gives every experiment its shared sense of
 * inertia and friction.
 */

export type WheelPhase = "idle" | "active" | "gliding" | "settling";

export interface WheelState {
  /** Last normalized delta received, roughly in the range [-3, 3]. */
  delta: number;
  /** Direction of the last non-zero delta. */
  direction: -1 | 0 | 1;
  /** Current momentum, an eased impulse accumulator. Positive = forward/down. */
  velocity: number;
  /** Heavily smoothed velocity, used for display and phase decisions. */
  smoothedVelocity: number;
  /** Signed running total of normalized delta since the engine was reset. */
  accumulated: number;
  /** Milliseconds since the last wheel event was received. */
  idleMs: number;
  /** True for exactly one frame when the smoothed direction flips sign. */
  reversed: boolean;
  /** Coarse classification of what the input is currently doing. */
  phase: WheelPhase;
}

export interface WheelEngineOptions {
  /** Fraction of velocity retained per second while no new input arrives. Lower = more friction. */
  friction?: number;
  /** How quickly smoothedVelocity chases velocity, 0..1 per frame at 60fps. */
  smoothing?: number;
  /** |velocity| below this is considered "at rest" for phase purposes. */
  restThreshold?: number;
  /** Time with no events + velocity at rest before phase becomes "idle". */
  idleTimeout?: number;
  /** Caps a single event's contribution so trackpad spikes can't teleport things. */
  maxImpulse?: number;
}

const DEFAULTS: Required<WheelEngineOptions> = {
  friction: 0.94, // ~6% velocity decay per frame-equivalent second — tuned by feel
  smoothing: 0.18,
  restThreshold: 0.02,
  idleTimeout: 600,
  maxImpulse: 2.6,
};

/**
 * Normalizes a WheelEvent's deltaY across devices/browsers into a small,
 * comparable unit. Mouse wheels fire large, discrete deltas (~100-120,
 * deltaMode 0) or line-mode deltas (deltaMode 1, ~3); trackpads fire many
 * small continuous pixel deltas. We fold both into "wheel notches" so the
 * rest of the system never has to think about device differences.
 */
function normalizeDelta(e: WheelEvent): number {
  let d = e.deltaY;
  if (e.deltaMode === 1) {
    // line mode: browser reports "lines" — approximate a line as 16px
    d *= 16;
  } else if (e.deltaMode === 2) {
    // page mode: rare, treat a page as a large jump
    d *= window.innerHeight;
  }
  // A typical mouse notch is ~100px, a light trackpad tick is ~2-6px.
  // Dividing by 60 puts a mouse notch at ~1.6 and a trackpad tick well below 1.
  return d / 60;
}

type Listener = (state: WheelState) => void;

export class WheelEngine {
  private opts: Required<WheelEngineOptions>;
  private state: WheelState = {
    delta: 0,
    direction: 0,
    velocity: 0,
    smoothedVelocity: 0,
    accumulated: 0,
    idleMs: Number.POSITIVE_INFINITY,
    reversed: false,
    phase: "idle",
  };

  private lastEventAt = 0;
  private listeners = new Set<Listener>();
  private target: EventTarget | null = null;
  private rafId: number | null = null;
  private lastFrameAt = 0;
  private boundWheel = (e: Event) => this.handleWheel(e as WheelEvent);
  private preventScroll: boolean;

  constructor(options: WheelEngineOptions = {}, preventScroll = true) {
    this.opts = { ...DEFAULTS, ...options };
    this.preventScroll = preventScroll;
  }

  attach(target: EventTarget) {
    this.target = target;
    target.addEventListener("wheel", this.boundWheel, { passive: false });
    this.lastFrameAt = performance.now();
    this.loop();
  }

  detach() {
    this.target?.removeEventListener("wheel", this.boundWheel);
    this.target = null;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getState(): WheelState {
    return this.state;
  }

  /** Zeroes velocity and accumulation, e.g. after a scene transition. */
  reset() {
    this.state = {
      delta: 0,
      direction: 0,
      velocity: 0,
      smoothedVelocity: 0,
      accumulated: 0,
      idleMs: Number.POSITIVE_INFINITY,
      reversed: false,
      phase: "idle",
    };
  }

  private handleWheel(e: WheelEvent) {
    if (this.preventScroll) e.preventDefault();

    const raw = normalizeDelta(e);
    const clamped = Math.max(-this.opts.maxImpulse, Math.min(this.opts.maxImpulse, raw));
    if (clamped === 0) return;

    const direction: -1 | 0 | 1 = clamped > 0 ? 1 : -1;

    // An impulse adds to velocity rather than setting it — repeated same-direction
    // ticks build momentum, which friction then bleeds off between events.
    this.state.velocity += clamped;
    this.state.delta = clamped;
    this.state.direction = direction;
    this.state.accumulated += clamped;
    this.lastEventAt = performance.now();
  }

  private loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameAt) / 1000); // clamp dt to avoid tab-switch jumps
    this.lastFrameAt = now;

    const s = this.state;
    const { friction, smoothing, restThreshold, idleTimeout } = this.opts;

    // Exponential friction decay, expressed per-second so it's frame-rate independent.
    const frictionPerFrame = Math.pow(friction, dt * 60);
    s.velocity *= frictionPerFrame;
    if (Math.abs(s.velocity) < 0.0005) s.velocity = 0;

    const prevSmoothedSign = Math.sign(s.smoothedVelocity);
    s.smoothedVelocity += (s.velocity - s.smoothedVelocity) * smoothing;
    const newSign = Math.sign(s.smoothedVelocity);
    s.reversed = prevSmoothedSign !== 0 && newSign !== 0 && prevSmoothedSign !== newSign;

    s.idleMs = now - this.lastEventAt;

    const atRest = Math.abs(s.velocity) < restThreshold;
    const receivingInput = s.idleMs < 120;

    if (receivingInput) {
      s.phase = "active";
    } else if (!atRest) {
      s.phase = "gliding";
    } else if (s.idleMs < idleTimeout) {
      s.phase = "settling";
    } else {
      s.phase = "idle";
    }

    for (const fn of this.listeners) fn(s);
    this.rafId = requestAnimationFrame(this.loop);
  };
}

// ---- Small physics helpers shared across experiments ----

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shortest signed distance from `a` to `b` on a circle of circumference `mod`. */
export const shortestAngleDelta = (a: number, b: number, mod: number) => {
  let diff = (b - a) % mod;
  if (diff > mod / 2) diff -= mod;
  if (diff < -mod / 2) diff += mod;
  return diff;
};

/**
 * A tiny critically-damped-ish spring integrator, stepped manually per frame.
 * Used for "magnetic" snapping: call step() each frame with dt in seconds.
 * Produces natural overshoot when `damping` is lowered slightly below 1.
 */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  stiffness: number;
  damping: number;

  constructor(initial: number, stiffness = 90, damping = 14) {
    this.value = initial;
    this.target = initial;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  step(dt: number): number {
    const force = (this.target - this.value) * this.stiffness;
    const damp = -this.velocity * this.damping;
    const accel = force + damp;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  isSettled(epsilon = 0.001): boolean {
    return Math.abs(this.target - this.value) < epsilon && Math.abs(this.velocity) < epsilon;
  }

  snapTo(value: number) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}

/** Rubber-band resistance curve for overscroll past a boundary (iOS-style). */
export const rubberBand = (overshoot: number, dimension = 200, constant = 0.55) => {
  return (1 - 1 / ((Math.abs(overshoot) * constant) / dimension + 1)) * dimension * Math.sign(overshoot);
};

export type BoundarySignal = "forward" | "backward" | null;

/**
 * Accumulates "pressure" when the user keeps pushing input against a domain
 * edge (e.g. scrolling forward while already on the last item). Firing
 * requires sustained intent, not a single stray tick, and pressure bleeds
 * off quickly once the user stops pressing — this is what makes crossing a
 * scene boundary feel like an unmistakable, deliberate gesture rather than
 * an accident.
 */
export class BoundaryPressure {
  forward = 0;
  backward = 0;
  private buildRate: number;
  private decayRate: number;

  constructor(buildRate = 0.8, decayRate = 2.6) {
    this.buildRate = buildRate;
    this.decayRate = decayRate;
  }

  update(pressingForward: boolean, pressingBackward: boolean, magnitude: number, dt: number): BoundarySignal {
    this.forward = pressingForward
      ? Math.min(1, this.forward + magnitude * this.buildRate * dt)
      : Math.max(0, this.forward - this.decayRate * dt);
    this.backward = pressingBackward
      ? Math.min(1, this.backward + magnitude * this.buildRate * dt)
      : Math.max(0, this.backward - this.decayRate * dt);

    if (this.forward >= 1) {
      this.forward = 0;
      this.backward = 0;
      return "forward";
    }
    if (this.backward >= 1) {
      this.forward = 0;
      this.backward = 0;
      return "backward";
    }
    return null;
  }

  reset() {
    this.forward = 0;
    this.backward = 0;
  }
}

export type ChoiceBranch = "A" | "B";

export interface ChoiceGateResult {
  /** Position to actually render/navigate with — pinned at the gate until committed. */
  effectivePosition: number;
  /** 0..1: which option is currently favored. 0 = A, 1 = B. */
  choiceFocus: number;
  committed: boolean;
  chosenBranch: ChoiceBranch;
  /** 0..1 ring-fill while holding still on a choice, before it commits. */
  dwellProgress: number;
  /** True while position is at-or-past the gate and no choice has committed yet. */
  atGate: boolean;
}

const CHOICE_SPEED = 1.4;
const CHOICE_DWELL_SECONDS = 0.9;

/**
 * A single binary decision point along an otherwise linear scroll domain,
 * modeled directly on the mechanic Orbit already teaches for opening
 * something: reach it, hold still, watch a ring fill, and whichever way
 * you're currently leaning is what commits. The difference from a plain
 * dwell is that *which* option you get is also under direct control —
 * scrolling at the gate moves a focus between two simultaneously visible
 * options instead of just picking the one you happen to be facing.
 *
 * Wire this up with `useBoundedScroll`'s `freeze` option — pass
 * `freeze: () => gate.isPinned()` — so the hook's own position genuinely
 * stops advancing while a choice is being made, rather than merely being
 * overridden in the rendered value while the real position drifts
 * unboundedly underneath it (which would cause a visible jump the instant
 * the choice commits). Backing up before the gate again un-pins and
 * re-opens the decision, so passing through it is always a live choice.
 */
export class ChoiceGate {
  private choiceFocus = 0;
  private committed = false;
  private chosenBranch: ChoiceBranch = "A";
  private dwellProgress = 0;
  private pinned = false;
  private gatePos: number;

  constructor(gatePos: number) {
    this.gatePos = gatePos;
  }

  /** Reflects state as of the end of the last `step()` call — read by `useBoundedScroll`'s `freeze` option. */
  isPinned(): boolean {
    return this.pinned;
  }

  step(rawPosition: number, velocity: number, settled: boolean, idle: boolean, dt: number): ChoiceGateResult {
    const atOrPastGate = rawPosition >= this.gatePos - 0.001;

    if (this.committed && rawPosition < this.gatePos - 0.05) {
      // Backed up clearly before the gate — require a fresh decision next approach.
      this.committed = false;
      this.choiceFocus = 0;
      this.dwellProgress = 0;
    }

    if (!this.committed && atOrPastGate) {
      this.choiceFocus = clamp(this.choiceFocus + velocity * dt * CHOICE_SPEED, 0, 1);
      if (settled && idle) {
        this.dwellProgress = clamp(this.dwellProgress + dt / CHOICE_DWELL_SECONDS, 0, 1);
        if (this.dwellProgress >= 1) {
          this.committed = true;
          this.chosenBranch = this.choiceFocus < 0.5 ? "A" : "B";
        }
      } else {
        this.dwellProgress = 0;
      }
    } else {
      this.dwellProgress = 0;
    }

    this.pinned = !this.committed && atOrPastGate;
    return {
      effectivePosition: this.pinned ? this.gatePos : rawPosition,
      choiceFocus: this.choiceFocus,
      committed: this.committed,
      chosenBranch: this.chosenBranch,
      dwellProgress: this.dwellProgress,
      atGate: this.pinned,
    };
  }
}
