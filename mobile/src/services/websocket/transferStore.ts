import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ActiveTransfer {
  transferId: string;
  fileName: string;
  fileSize: number;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop';
  bytesTransferred: number;
  avgSpeed: number;
  peakSpeed: number;
  durationMs: number;
  status: 'queued' | 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled' | 'rejected';
}

export interface TransferHistoryEntry {
  id: string;
  fileName: string;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop';
  fileSize: number;
  avgSpeed: number | null;
  peakSpeed: number | null;
  durationMs: number | null;
  status: 'queued' | 'pending' | 'transferring' | 'completed' | 'failed' | 'cancelled' | 'rejected';
  timestamp: number;
  integrityVerified: boolean;
}

interface TransferState {
  activeTransfer: ActiveTransfer | null;
  history: TransferHistoryEntry[];
  setActiveTransfer: (transfer: ActiveTransfer | null) => void;
  updateActiveProgress: (bytesTransferred: number, avgSpeed?: number, peakSpeed?: number, durationMs?: number) => void;
  addHistoryEntry: (entry: TransferHistoryEntry) => void;
  clearHistory: () => void;
}

export const useTransferStore = create<TransferState>()(
  persist(
    (set) => ({
      activeTransfer: null,
      history: [],
      setActiveTransfer: (transfer) => set({ activeTransfer: transfer }),
      updateActiveProgress: (bytesTransferred, avgSpeed = 0, peakSpeed = 0, durationMs = 0) =>
        set((state) => {
          if (!state.activeTransfer) return {};
          return {
            activeTransfer: {
              ...state.activeTransfer,
              bytesTransferred,
              avgSpeed,
              peakSpeed,
              durationMs,
            },
          };
        }),
      addHistoryEntry: (entry) =>
        set((state) => ({
          history: [entry, ...state.history].slice(0, 100), // Keep last 100 history items on mobile
        })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'flowdeck-transfer-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        history: state.history,
      }),
    }
  )
);
