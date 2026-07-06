import React from 'react';

type P = { size?: number };
const S = (size = 20): React.SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
});

export const IconDumbbell = ({ size }: P) => (
  <svg {...S(size)}><path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7 7" /><path d="m14 21 7-7" /></svg>
);
export const IconHome = ({ size }: P) => (
  <svg {...S(size)}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>
);
export const IconCalendar = ({ size }: P) => (
  <svg {...S(size)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
);
export const IconLibrary = ({ size }: P) => (
  <svg {...S(size)}><path d="M16 6 4 18" /><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);
export const IconHistory = ({ size }: P) => (
  <svg {...S(size)}><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>
);
export const IconChart = ({ size }: P) => (
  <svg {...S(size)}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
);
export const IconPlay = ({ size }: P) => (
  <svg {...S(size)}><polygon points="6 3 20 12 6 21 6 3" /></svg>
);
export const IconPlus = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...S(size)}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconTrash = ({ size }: P) => (
  <svg {...S(size)}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
);
export const IconBack = ({ size }: P) => (
  <svg {...S(size)}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
);
export const IconX = ({ size }: P) => (
  <svg {...S(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconFlame = ({ size }: P) => (
  <svg {...S(size)}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
);
export const IconSearch = ({ size }: P) => (
  <svg {...S(size)}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
);
export const IconEdit = ({ size }: P) => (
  <svg {...S(size)}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
export const IconInfo = ({ size }: P) => (
  <svg {...S(size)}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
);
export const IconBarbell = ({ size }: P) => (
  <svg {...S(size)}><path d="M2.5 9v6M5.5 7v10M18.5 7v10M21.5 9v6M5.5 12h13" /></svg>
);
export const IconUser = ({ size }: P) => (
  <svg {...S(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
);
export const IconTrophy = ({ size }: P) => (
  <svg {...S(size)}><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
);
