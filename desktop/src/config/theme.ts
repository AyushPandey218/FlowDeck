/**
 * Centralized theme class tokens matching premium dark glassmorphic designs (Linear/Raycast style).
 * Ensures consistency across buttons, inputs, panels, active items, and states.
 */
export const THEME = {
  // Base Layout
  appContainer: 'h-screen bg-slate-950 text-slate-200 font-sans selection:bg-violet-500/30 selection:text-violet-200 overflow-hidden',
  sidebar: 'w-64 bg-slate-950/80 backdrop-blur-3xl border-r border-slate-900/60 flex flex-col justify-between transition-all duration-200 ease-in-out shrink-0 z-20',
  sidebarCollapsed: 'w-20 bg-slate-950/80 backdrop-blur-3xl border-r border-slate-900/60 flex flex-col justify-between transition-all duration-200 ease-in-out shrink-0 z-20',
  contentArea: 'flex-1 flex flex-col overflow-hidden relative z-10',
  mainScrollable: 'flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar',
  
  // Cards & Panels (Unified)
  panel: 'bg-slate-900/40 backdrop-blur-md border border-slate-800/40 shadow-lg shadow-slate-950/40 rounded-xl p-5 transition-all duration-200 ease-in-out',
  panelHover: 'hover:bg-slate-900/60 hover:border-slate-700/50 hover:shadow-xl hover:shadow-slate-950/50',
  
  // Typography Hierarchy
  title: 'text-2xl font-bold tracking-tight text-white',
  subtitle: 'text-sm text-slate-400 font-medium',
  sectionHeader: 'text-base font-semibold text-slate-200 border-b border-slate-800/60 pb-2 mb-4',
  cardTitle: 'text-sm font-semibold text-slate-200',
  textDesc: 'text-xs text-slate-400 leading-relaxed',
  textMeta: 'text-[10px] text-slate-500 font-mono tracking-wider',

  // Nav Links
  navItem: 'flex items-center gap-3 px-3 py-2.5 mx-3 my-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-all duration-150 ease-in-out cursor-pointer group',
  navItemActive: 'flex items-center gap-3 px-3 py-2.5 mx-3 my-1 rounded-lg text-white bg-violet-600 border border-violet-500/30 shadow-md shadow-violet-900/20 transition-all duration-150 ease-in-out cursor-pointer',
  navIcon: 'text-slate-400 group-hover:text-slate-200 transition-colors duration-150',
  navIconActive: 'text-white',

  // Buttons (Unified styling)
  btnPrimary: 'bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium text-xs rounded-lg px-3.5 py-2 shadow-sm border border-violet-500/30 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer',
  btnSecondary: 'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 font-medium text-xs rounded-lg px-3.5 py-2 border border-slate-700/50 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer',
  btnDanger: 'bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400 hover:text-rose-300 font-medium text-xs rounded-lg px-3.5 py-2 border border-rose-500/20 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer',
  btnIcon: 'p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all duration-150 cursor-pointer',

  // Form Inputs
  input: 'w-full bg-slate-950/50 hover:bg-slate-900/50 focus:bg-slate-950 border border-slate-800/80 focus:border-violet-500/60 outline-none text-slate-200 placeholder-slate-500 text-sm rounded-lg py-2 px-3 shadow-inner transition-all duration-150',
  label: 'block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5',

  // Semantic Badges
  badgeGreen: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  badgeBlue: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20',
  badgePurple: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20',
  badgeYellow: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20',
  badgeRed: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20',
  badgeGray: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20',
};
