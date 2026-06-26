import { ActionType, Page } from './types';
export type WSMessageType = 'PING' | 'PONG' | 'CLIENT_CONNECTED' | 'CLIENT_DISCONNECTED' | 'SERVER_STATUS' | 'PAIR_REQUEST' | 'PAIR_RESPONSE' | 'LAYOUT_SYNC' | 'ACTIONS_SYNC' | 'EXECUTE_ACTION' | 'ACTION_STATUS';
export interface WSMessageEnvelope<T = any> {
    type: WSMessageType;
    payload: T;
    timestamp: number;
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
export interface AuthRequestPayload {
    deviceId: string;
    deviceName: string;
    pairingToken: string;
}
export interface AuthResponsePayload {
    success: boolean;
    persistentToken?: string;
    error?: string;
}
export interface ExecuteActionPayload {
    actionId: string;
    actionType: ActionType;
    payload: string;
}
export interface ActionStatusPayload {
    actionId: string;
    success: boolean;
    exitCode?: number;
    error?: string;
}
export declare function createWSMessage<T>(type: WSMessageType, payload: T): WSMessageEnvelope<T>;
