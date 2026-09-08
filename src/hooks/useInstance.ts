import { useState } from "react";

/**
 * Creates a value once via `factory` and returns the same instance for the
 * component's lifetime. Uses React's lazy-initial-state form rather than a
 * ref precisely so nothing ever reads `.current` in a render body.
 */
export function useInstance<T>(factory: () => T): T {
  const [instance] = useState(factory);
  return instance;
}
