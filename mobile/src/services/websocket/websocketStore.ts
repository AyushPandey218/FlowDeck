import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ConnectionStatus } from './ConnectionState';
import { NETWORK, createId, Action, Page, SystemStats } from '@flowdeck/shared';

interface ClipboardHistoryEntry {
  text: string;
  sourceDeviceId: string;
  timestamp: number;
  syncId: string;
  version: number;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop' | 'local';
}

interface WebSocketState {
  connectionStatus: ConnectionStatus;
  hostIp: string;
  hostPort: number;
  lastError: string;
  deviceId: string;
  deviceName: string;
  deviceNickname: string;
  pairedHost: { hostIp: string; hostPort: number } | null;
  actions: Action[];
  pages: Page[];
  layoutVersion: number;
  systemStats: SystemStats | null;
  // Clipboard sync state
  clipboardHistory: ClipboardHistoryEntry[];
  clipboardSyncEnabled: boolean;
  lastSyncId: string | null;
  lastClipboardHash: string | null;

  // Feedback URLs
  feedbackGithubUrl: string;
  feedbackEmail: string;
  // Onboarding state
  onboardingCompleted: boolean;
  // Haptic feedback state
  hapticFeedbackEnabled: boolean;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setConnectionConfig: (hostIp: string, hostPort: number) => void;
  setLastError: (error: string) => void;
  setDeviceNickname: (nickname: string) => void;
  setPairedHost: (host: { hostIp: string; hostPort: number } | null) => void;
  setActions: (actions: Action[]) => void;
  setPages: (pages: Page[]) => void;
  setLayoutVersion: (version: number) => void;
  setSystemStats: (stats: SystemStats | null) => void;
  // Clipboard sync actions
  addClipboardEntry: (entry: ClipboardHistoryEntry) => void;
  removeClipboardEntry: (index: number) => void;
  clearClipboardHistory: () => void;
  setClipboardSyncEnabled: (enabled: boolean) => void;
  setLastSyncId: (syncId: string | null) => void;
  setLastClipboardHash: (hash: string | null) => void;

  // Feedback action
  setFeedbackGithubUrl: (url: string) => void;
  setFeedbackEmail: (email: string) => void;
  // Onboarding action
  setOnboardingCompleted: (completed: boolean) => void;
  // Haptic feedback action
  setHapticFeedbackEnabled: (enabled: boolean) => void;
}

export const useWebSocketStore = create<WebSocketState>()(
  persist(
    (set, get) => ({
      connectionStatus: 'disconnected',
      hostIp: '127.0.0.1',
      hostPort: NETWORK.DEFAULT_PORT,
      lastError: 'None',
      deviceId: createId(),
      deviceName: `${Platform.OS === 'ios' ? 'iOS' : 'Android'} Companion`,
      deviceNickname: `${Platform.OS === 'ios' ? 'iOS' : 'Android'} Phone`,
      pairedHost: null,
      actions: [],
      pages: [],
      layoutVersion: 0,
      systemStats: null,
      // Clipboard defaults
      clipboardHistory: [],
      clipboardSyncEnabled: false,
      lastSyncId: null,
      lastClipboardHash: null,

      // Feedback defaults
      feedbackGithubUrl: '',
      feedbackEmail: '',
      // Onboarding default
      onboardingCompleted: false,
      // Haptic defaults
      hapticFeedbackEnabled: true,
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setConnectionConfig: (hostIp, hostPort) => set({ hostIp, hostPort }),
      setLastError: (error) => set({ lastError: error }),
      setDeviceNickname: (nickname) => set({ deviceNickname: nickname }),
      setPairedHost: (pairedHost) => set({ pairedHost }),
      setActions: (actions) => set({ actions }),
      setPages: (pages) => set({ pages }),
      setLayoutVersion: (layoutVersion) => set({ layoutVersion }),
      setSystemStats: (systemStats) => set({ systemStats }),
      // Clipboard sync actions
      addClipboardEntry: (entry) =>
        set((state) => ({
          clipboardHistory: [entry, ...state.clipboardHistory].slice(0, 100),
        })),
      removeClipboardEntry: (index) =>
        set((state) => ({
          clipboardHistory: state.clipboardHistory.filter((_, i) => i !== index),
        })),
      clearClipboardHistory: () => set({ clipboardHistory: [] }),
      setClipboardSyncEnabled: (enabled) => set({ clipboardSyncEnabled: enabled }),
      setLastSyncId: (syncId) => set({ lastSyncId: syncId }),
      setLastClipboardHash: (hash) => set({ lastClipboardHash: hash }),

      // Feedback setters
      setFeedbackGithubUrl: (url) => set({ feedbackGithubUrl: url }),
      setFeedbackEmail: (email) => set({ feedbackEmail: email }),
      // Onboarding action
      setOnboardingCompleted: (completed) => set({ onboardingCompleted: completed }),
      // Haptic feedback setter
      setHapticFeedbackEnabled: (enabled) => set({ hapticFeedbackEnabled: enabled }),
    }),
    {
      name: 'flowdeck-websocket-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        deviceNickname: state.deviceNickname,
        hostIp: state.hostIp,
        hostPort: state.hostPort,
        pairedHost: state.pairedHost,
        clipboardSyncEnabled: state.clipboardSyncEnabled,

        feedbackGithubUrl: state.feedbackGithubUrl,
        feedbackEmail: state.feedbackEmail,
        onboardingCompleted: state.onboardingCompleted,
        hapticFeedbackEnabled: state.hapticFeedbackEnabled,
      }),
    }
  )
);
