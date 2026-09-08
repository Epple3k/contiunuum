import { useEffect, useState } from "react";

/** True on devices whose primary pointer is touch (no wheel, no hover) — this experiment needs neither. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse) and (hover: none)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (hover: none)");
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return coarse;
}
