import { create } from 'zustand';
import { RouteType, ROUTES } from '../config/constants';

interface UIState {
  currentPage: RouteType;
  theme: 'dark' | 'light' | 'system';
  sidebarCollapsed: boolean;
  isOnboarding: boolean;
  setCurrentPage: (page: RouteType) => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setIsOnboarding: (isOnboarding: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  currentPage: ROUTES.DASHBOARD,
  theme: 'dark',
  sidebarCollapsed: false,
  isOnboarding: false,
  setCurrentPage: (page) => set({ currentPage: page }),
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setIsOnboarding: (isOnboarding) => set({ isOnboarding }),
}));
