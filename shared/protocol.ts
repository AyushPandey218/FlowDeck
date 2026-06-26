import { ActionType, SystemStats, Page } from './types';

// Supported WebSocket transmission types
export type WSMessageType =
  | 'PING'
  | 'PONG'
  | 'CLIENT_CONNECTED'
  | 'CLIENT_DISCONNECTED'
  | 'SERVER_STATUS'
  | 'PAIR_REQUEST'
  | 'PAIR_RESPONSE'
  | 'LAYOUT_SYNC'
  | 'ACTIONS_SYNC'
  | 'EXECUTE_ACTION'
  | 'ACTION_STATUS'
  | 'SYSTEM_STATS'
  | 'CLIPBOARD_SYNC'
  | 'FILE_TRANSFER_REQUEST'
  | 'FILE_TRANSFER_ACCEPT'
  | 'FILE_TRANSFER_REJECT'
  | 'FILE_TRANSFER_PROGRESS'
  | 'FILE_TRANSFER_COMPLETE'
  | 'FILE_TRANSFER_CANCEL'
  | 'FACTORY_RESET';

// Standard envelope wrapping all local network packets
export interface WSMessageEnvelope<T = any> {
  type: WSMessageType;
  payload: T;
  timestamp: number; // Epoch milliseconds
}

export interface LayoutSyncPayload {
  layoutVersion: number;
  pages: Page[];
}

export interface ActionsSyncPayload {
  actions: any[];
}

export interface ExecuteActionPayload {
  actionId: string;
}

export interface ActionStatusPayload {
  success: boolean;
  message: string;
}

export interface PairRequestPayload {
  deviceId: string;
  deviceName: string;
  deviceNickname: string;
  pairingToken?: string;
  unpair?: boolean;
}

export interface PairResponsePayload {
  success: boolean;
  error?: string;
}

// AUTH_REQUEST payload interface
export interface AuthRequestPayload {
  deviceId: string;
  deviceName: string;
  pairingToken: string; // Could be temp QR token or stored persistent token
}

// AUTH_RESPONSE payload interface
export interface AuthResponsePayload {
  success: boolean;
  persistentToken?: string; // Client stores this locally if pairing succeeded
  error?: string;
}

// EXECUTE_ACTION payload interface
export interface ExecuteActionPayload {
  actionId: string;
  actionType: ActionType;
  payload: string;
}

// ACTION_STATUS payload interface (response from executor to client)
export interface ActionStatusPayload {
  actionId: string;
  success: boolean;
  exitCode?: number;
  error?: string;
}

// Helper generators for quick WS packet creation
export function createWSMessage<T>(type: WSMessageType, payload: T): WSMessageEnvelope<T> {
  return {
    type,
    payload,
    timestamp: Date.now(),
  };
}

// Phase 9: Clipboard Sync
export interface ClipboardSyncPayload {
  text: string;
  sourceDeviceId: string;
  timestamp: number; // epoch ms
  syncId: string; // UUID for loop detection
  version: number; // payload version, initial = 1
  direction: 'desktop_to_mobile' | 'mobile_to_desktop' | 'local';
}

// Phase 10: File Transfer
export interface FileTransferRequest {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  direction: 'desktop_to_mobile' | 'mobile_to_desktop';
  transferToken?: string;
}

export interface FileTransferAcceptPayload {
  transferId: string;
  port: number;
  hostIp: string;
  transferToken: string;
}

export interface FileTransferProgress {
  transferId: string;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

