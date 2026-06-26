// Action types supported by Flow Deck (Phase 6)
export type ActionType =
  | 'OPEN_APP'
  | 'OPEN_URL'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'TOGGLE_MUTE'
  | 'LOCK_PC'
  | 'HIDE_ALL_WINDOWS'
  | 'CLOSE_ALL_WINDOWS'
  | 'SWITCH_DESKTOP';

// Individual command button / control action model
export interface Action {
  id: string;
  categoryId: string;
  name: string;
  actionType: ActionType;
  payload: string; // Filepath, web link, etc.
  icon: string; // Icon key mapping
  orderIndex: number;
}

// Category grouping buttons inside pages
export interface Category {
  id: string;
  pageId: string;
  name: string;
  orderIndex: number;
  actions?: Action[];
}

// Grid pages containing categories
export interface Page {
  id: string;
  name: string;
  orderIndex: number;
  categories: Category[];
}

export interface SystemStats {
  telemetryVersion: number;
  cpu: number;
  ram: number;
  gpu: number | null;
  disk: number;
  networkUp: number;
  networkDown: number;
  uptime: number;
  latencyMs: number;
}

// Trusted / paired device model
export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  pairedAt: number; // epoch timestamp
  lastActive: number; // epoch timestamp
  isBlocked: boolean;
}

// Desktop global settings keys/values mapping
export interface HostSettings {
  port: number;
  metricsInterval: number;
  startAtLogin: boolean;
  theme: 'dark' | 'light' | 'system';
}
