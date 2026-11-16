// Ikon SVG inline (tanpa dependensi tambahan).
type P = { size?: number; className?: string };
const base = (size = 18) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconCalendar = ({ size }: P) => (<svg {...base(size)}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
export const IconPin = ({ size }: P) => (<svg {...base(size)}><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z" /><circle cx="12" cy="9" r="2.5" /></svg>);
export const IconTicket = ({ size }: P) => (<svg {...base(size)}><path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 11v2M13 17v2" /></svg>);
export const IconSearch = ({ size }: P) => (<svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconShield = ({ size }: P) => (<svg {...base(size)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>);
export const IconRefresh = ({ size }: P) => (<svg {...base(size)}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>);
export const IconUser = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const IconHome = ({ size }: P) => (<svg {...base(size)}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
export const IconGrid = ({ size }: P) => (<svg {...base(size)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
export const IconScan = ({ size }: P) => (<svg {...base(size)}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>);
export const IconX = ({ size }: P) => (<svg {...base(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const IconCheck = ({ size }: P) => (<svg {...base(size)}><path d="M20 6 9 17l-5-5" /></svg>);
export const IconWallet = ({ size }: P) => (<svg {...base(size)}><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15V7" /><circle cx="16" cy="14" r="1.2" /></svg>);
export const IconTag = ({ size }: P) => (<svg {...base(size)}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>);
export const IconLogout = ({ size }: P) => (<svg {...base(size)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>);
export const IconPlus = ({ size }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconChart = ({ size }: P) => (<svg {...base(size)}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>);
export const IconUsers = ({ size }: P) => (<svg {...base(size)}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3" /></svg>);
export const IconLock = ({ size }: P) => (<svg {...base(size)}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
export const IconInfo = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></svg>);
