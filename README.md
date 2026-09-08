# CONTINUUM

**Experiments in one-dimensional computing.**

Modern interfaces assume a pointer — something that points, clicks, drags, hovers. Continuum removes all of it and asks what's left of "interface" when the only input is a scroll wheel.

**[Live demo →]()** _(add hosted URL here)_

---

## The constraint

Every desktop interaction we take for granted decomposes into a handful of input primitives: pointing, clicking, dragging, hovering, keyboard entry, scrolling. This project keeps exactly one of them.

The wheel isn't treated as a way to move a page. It's treated as an analog instrument with its own vocabulary — direction, velocity, distance, deceleration, dwell, reversal, momentum — and the whole interface is built to speak that vocabulary back. There is no click. There is no pointer. Selecting something, opening it, undoing a change, moving through time: all of it has to be re-expressed in terms of how fast you're turning a wheel, and for how long, and when you stop.

The page itself doesn't scroll in the conventional sense. Each screen owns the wheel completely and decides what a scroll means while it's active.

## The experiments

### 01 — Orbit
*Can scrolling replace pointing and clicking when selecting objects?*

A radial launcher of four fictional applications, arranged along a shallow arc. Scrolling rotates the arc; velocity determines how far it carries after you stop. Once an item settles at the front, holding still opens it — visualized by a ring that fills in as you wait, the interface's substitute for a click. Scrolling backward at any point drains that same ring and pulls the view back toward the arc, proportional to how hard you push — there's no separate gesture to learn for "no, not that one" or "take me back."

The idea being tested: without a pointer, selection stops being spatial (where is the thing) and becomes temporal (how long did you rest on it).

Each of the four apps opens into its own small, fully explorable experiment — a different everyday desktop action re-expressed as a single continuous scroll parameter, all built on the same shared engine. Each also holds one real decision point, in the app's own terms rather than a puzzle bolted onto it: two options sit simultaneously visible, scrolling shifts weight between them, and holding still — the exact gesture Orbit already teaches for opening something — commits to whichever is currently favored:

- **Archive** — hierarchy as continuous zoom. Nested folders are rendered as frames inside frames; scrolling descends through them the way a camera would push in, rather than clicking to open one level at a time. One folder holds two possible subfolders, shown side by side, until you commit to one.
- **Network** — traversal as a walk, not a map. Scrolling advances a cursor hop-by-hop along a path through a small connected graph, revealing structure as you go instead of showing it all zoomed-out and static. One node is a junction where both onward routes glow at once until you choose.
- **Images** — focus as a lens, not a slideshow. Scrolling racks focus continuously across three depth planes of one scene, blurring and sharpening in real time like a manual focus ring. Two candidate subjects share the foreground until the lens settles on one.
- **Notes** — reading depth as zoom. Scrolling moves continuously between a bare headline and a fully detailed note, zooming the level of abstraction rather than the size on screen. Two different accounts of the same situation sit side by side as you approach full detail.

Each nested experiment fully owns the wheel while it's open, and hands control back to the orbit the same way the orbit itself hands control to the outer scene: by being pushed past its own edge, scrolling backward from its resting state — from anywhere inside it, not only from wherever it happened to start, and not blocked by a decision in progress. Opening and closing are meant to feel as unconstrained as switching apps in any ordinary piece of software; only what happens *between* those two moments, including its one choice, is unique to each app's own subject.

### 02 — Rewind
*What actually gets more natural when mapped directly to a wheel?*

A small generative composition — a translucent constellation of circles — with ten recorded revisions of its own history. Scrolling scrubs continuously through that history rather than jumping between states the way Ctrl+Z would; everything interpolates. A timeline appears while you're scrubbing and fades once you stop touching it, and the atmosphere itself dims the further back you travel.

The idea being tested: undo/redo are already secretly continuous operations (a position in a stack) that keyboards force into discrete steps. Scrolling just gives them back their shape.

Both experiments push against a hard edge in their own domain — the last item in the arc, the oldest or newest revision — and holding pressure against that edge is what moves you to the next part of the piece. There's no button anywhere in Continuum. Every transition, including the ones between scenes, is a boundary you push through — and every scene connects to its neighbors in both directions, so the four parts form a loop rather than a one-way line.

## Design principles

- **The input is the material.** Motion in this piece is meant to be read as physics (inertia, friction, magnetic snapping, rubber-band resistance) rather than as decoration layered on top of a static UI.
- **One interaction at a time.** No dashboards, no card grids. Each screen is a single large, legible idea.
- **Show the instrument.** A small telemetry readout (delta / velocity / state) stays visible during both experiments — not to look technical, but because the whole premise depends on the reader believing the wheel really does carry that much information.
- **A sincere alternate timeline.** The visual language borrows from optimistic, glossy, translucent computing circa 2001 — without becoming a pixel-font pastiche of it. The goal was software that looked like someone in 2001 was quietly building for 2015.
- **No hidden thresholds.** Early versions gated a couple of transitions behind an invisible timer or a velocity spike the interface never showed you — it read as broken rather than deliberate. Every state change in the current version is driven by a value you can watch accumulate (a filling ring, a crossfading panel) and immediately reverse by scrolling the other way.
- **Free navigation first, novelty second.** A decision only belongs in this piece if it doesn't cost you the ability to open and close things freely. An earlier version tried to layer a "decision point" into each nested experiment by making content alternate between two outcomes depending on unstated timing — it was cut for requiring a rule the interface never taught. The version that replaced it borrows the one rule Orbit already teaches (hold still to commit) and shows both options at once instead of alternating one in place of the other — recognizable rather than novel, which turned out to matter more.

## Technical implementation

- **React + TypeScript + Vite**, no UI framework, no animation library. Every spring, snap, and rubber-band curve is a few lines of hand-rolled physics — see [`src/lib/wheelPhysics.ts`](src/lib/wheelPhysics.ts).
- **`WheelEngine`** is the single abstraction every interaction is built on. It normalizes wheel deltas across mice and trackpads, turns them into an impulse-driven velocity with friction, and classifies the result into a small state machine (`active` → `gliding` → `settling` → `idle`). Consumers integrate its velocity into whatever they own — an angle, a timeline position — rather than reading raw deltas, which is what gives both experiments the same sense of momentum for free.
- **`Spring`** is a tiny critically-under-damped integrator used for the "magnetic" snap-to-nearest-item behavior in both experiments; a touch of underdamping is what produces the small overshoot when something locks into place.
- **`BoundaryPressure`** accumulates sustained push against a domain edge (already on the last item, still scrolling forward) and fires a scene transition once it's clearly deliberate — the resistance-then-release gesture used for every transition in the piece, visualized by the small filling ring (`BoundaryIndicator`) at each screen's edge.
- **`useBoundedScroll`** factors that same "integrate velocity, clamp to a domain, push-past-the-edge-to-exit" pattern into a hook, so each of the four nested experiments inside Orbit gets it for free instead of hand-rolling it a fourth time. Nesting goes two levels deep: the app owns a scene (Intro/Orbit/Rewind/Ending), Orbit owns which item is selected, and a fully-open item hands the wheel to its own experiment entirely — which hands it back by the same push-past-the-edge gesture used everywhere else. Exiting isn't gated to reaching that edge, either: a second, position-independent pressure builds from sustained backward scrolling alone, so closing an app works from wherever you are inside it, not only from wherever it happened to start.
- **`ChoiceGate`** is the one binary decision each nested experiment holds. It pins position at a fixed point via `useBoundedScroll`'s `freeze` option — genuinely halting integration, not just clamping the displayed value, so the moment a choice commits there's nothing to visually snap back from — while routing further scroll into a 0..1 focus between two options and a dwell timer identical to Orbit's own open gesture. Backing away from the gate before committing quietly re-opens the decision.
- Physics runs imperatively off the engine's own `requestAnimationFrame` loop and writes directly to refs/DOM (transforms, SVG attributes, text content) rather than through React state, so 60fps input never causes a React re-render storm. React state is reserved for the rare, discrete transitions (which scene is active, whether an orbit item is open).
- `prefers-reduced-motion` is honored at two levels: decorative CSS animation/transition durations collapse globally, and the spring-based snapping throughout switches from physical interpolation to an immediate snap.
- Touch and other coarse-pointer devices get an explicit, honest fallback screen rather than a broken experience — this project has nothing to say to a device with no wheel.

```
src/
  components/     shared UI: telemetry readout, boundary ring, translation panel, corner labels
  experiments/
    Orbit/        experiment 01, plus apps/ — the four nested mini-experiments
    Rewind/       experiment 02
  hooks/          useWheelInput, useBoundedScroll, useReducedMotion, useCoarsePointer
  lib/            wheelPhysics.ts — the engine, springs, boundary pressure
  scenes/         Intro, Ending
  styles/         design tokens + global reset
```

## Running locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run lint     # oxlint
```

Requires a scroll wheel or trackpad — this is a desktop-first, mouse-second, touch-never piece by design.

## What I learned

Removing the pointer doesn't just remove functionality, it exposes which parts of an interface were ever spatial to begin with. Selection wants a position, so it happily becomes an angle. History wants a position too, so it becomes a timeline. But nothing about a wheel can express *which one of twelve objects on a canvas* you mean, or let you type a sentence — those needs were never really about scrolling being missing a feature; they're about needing more than one degree of freedom in the first place.

The other surprise was how much "feel" comes from a very small set of primitives — an impulse, a friction constant, a damped spring — applied consistently everywhere, rather than from any single clever animation. Once the wheel engine existed, both experiments more or less fell out of asking "what does this domain's version of an angle/position look like, and where's its edge?"

## Screenshots

_(add screenshots or a short GIF of Orbit and Rewind here)_

---

Built as a self-contained interaction design study. Source is MIT-licensed — take the wheel engine, leave the rest.
