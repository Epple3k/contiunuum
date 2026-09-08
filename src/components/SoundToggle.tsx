import { useState } from "react";
import { isSoundEnabled, setSoundEnabled } from "../lib/sound";
import "./SoundToggle.css";

/**
 * The one control in Continuum you actually click — global meta-chrome
 * rather than part of any experiment, so it sits outside the scroll-only
 * constraint the same way a mute button sits outside a film.
 */
export function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled);

  return (
    <button
      type="button"
      className="soundToggle mono"
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
      }}
      aria-pressed={on}
    >
      SOUND [{on ? "ON" : "OFF"}]
    </button>
  );
}
