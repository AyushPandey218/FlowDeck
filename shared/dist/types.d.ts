export type ActionType = 'OPEN_APP' | 'OPEN_URL' | 'VOLUME_UP' | 'VOLUME_DOWN' | 'TOGGLE_MUTE' | 'LOCK_PC';
export interface Action {
    id: string;
    categoryId: string;
    name: string;
    actionType: ActionType;
    payload: string;
    icon: string;
    orderIndex: number;
}
export interface Category {
    id: string;
    pageId: string;
    name: string;
    orderIndex: number;
    actions?: Action[];
}
export interface Page {
    id: string;
    name: string;
    orderIndex: number;
    categories: Category[];
}
export interface SystemStats {
    cpu: number;
    ram: number;
    gpu: number;
    disk: number;
    networkUp: number;
    networkDown: number;
    uptime: number;
}
export interface TrustedDevice {
    deviceId: string;
    deviceName: string;
    pairedAt: number;
    lastActive: number;
    isBlocked: boolean;
}
export interface HostSettings {
    port: number;
    metricsInterval: number;
    startAtLogin: boolean;
    theme: 'dark' | 'light' | 'system';
}
