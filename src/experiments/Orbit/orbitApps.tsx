import type { ReactNode } from "react";

export interface OrbitApp {
  id: "archive" | "network" | "images" | "notes";
  name: string;
  descriptor: string;
  icon: ReactNode;
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" strokeLinejoin="miter">
    {path}
  </svg>
);

export const ORBIT_APPS: OrbitApp[] = [
  {
    id: "archive",
    name: "Archive",
    descriptor: "Descend through nested folders",
    icon: icon(
      <>
        <rect x="4" y="4" width="16" height="4.5" />
        <rect x="4" y="9.75" width="16" height="4.5" />
        <rect x="4" y="15.5" width="16" height="4.5" />
      </>,
    ),
  },
  {
    id: "network",
    name: "Network",
    descriptor: "Walk a graph one hop at a time",
    icon: icon(
      <>
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="17" r="2" />
        <circle cx="19" cy="17" r="2" />
        <line x1="12" y1="7" x2="6.4" y2="15.4" />
        <line x1="12" y1="7" x2="17.6" y2="15.4" />
        <line x1="7" y1="17" x2="17" y2="17" />
      </>,
    ),
  },
  {
    id: "images",
    name: "Images",
    descriptor: "Rack focus across a scene",
    icon: icon(
      <>
        <rect x="4" y="5" width="16" height="14" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M4 16.5 9 12l3 2.6 3.5-3.6L20 15.5" />
      </>,
    ),
  },
  {
    id: "notes",
    name: "Notes",
    descriptor: "Zoom between outline and detail",
    icon: icon(
      <>
        <line x1="5" y1="7" x2="19" y2="7" />
        <line x1="5" y1="12" x2="19" y2="12" />
        <line x1="5" y1="17" x2="14" y2="17" />
      </>,
    ),
  },
];
