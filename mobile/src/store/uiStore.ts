import { create } from 'zustand';

interface UIState {
  currentScreen: string;
  theme: 'dark' | 'light' | 'system';
  selectedDevice: string | null;
  setCurrentScreen: (screen: string) => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  setSelectedDevice: (deviceId: string | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  currentScreen: 'Home',
  theme: 'dark',
  selectedDevice: null,
  setCurrentScreen: (screen) => set({ currentScreen: screen }),
  setTheme: (theme) => set({ theme }),
  setSelectedDevice: (deviceId) => set({ selectedDevice: deviceId }),
}));
