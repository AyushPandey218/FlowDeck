import { z } from 'zod';
export declare const AuthRequestSchema: z.ZodObject<{
    deviceId: z.ZodString;
    deviceName: z.ZodString;
    pairingToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    deviceId: string;
    deviceName: string;
    pairingToken: string;
}, {
    deviceId: string;
    deviceName: string;
    pairingToken: string;
}>;
export declare const AuthResponseSchema: z.ZodObject<{
    success: z.ZodBoolean;
    persistentToken: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    persistentToken?: string | undefined;
    error?: string | undefined;
}, {
    success: boolean;
    persistentToken?: string | undefined;
    error?: string | undefined;
}>;
export declare const ExecuteActionSchema: z.ZodObject<{
    actionId: z.ZodString;
    actionType: z.ZodEnum<["APP", "GAME", "FOLDER", "URL", "POWERSHELL", "BATCH", "CMD", "MEDIA", "SYSTEM"]>;
    payload: z.ZodString;
}, "strip", z.ZodTypeAny, {
    actionId: string;
    actionType: "APP" | "GAME" | "FOLDER" | "URL" | "POWERSHELL" | "BATCH" | "CMD" | "MEDIA" | "SYSTEM";
    payload: string;
}, {
    actionId: string;
    actionType: "APP" | "GAME" | "FOLDER" | "URL" | "POWERSHELL" | "BATCH" | "CMD" | "MEDIA" | "SYSTEM";
    payload: string;
}>;
export declare const ActionStatusSchema: z.ZodObject<{
    actionId: z.ZodString;
    success: z.ZodBoolean;
    exitCode: z.ZodOptional<z.ZodNumber>;
    error: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    actionId: string;
    error?: string | undefined;
    exitCode?: number | undefined;
}, {
    success: boolean;
    actionId: string;
    error?: string | undefined;
    exitCode?: number | undefined;
}>;
export declare const SystemStatsSchema: z.ZodObject<{
    cpu: z.ZodNumber;
    ram: z.ZodNumber;
    gpu: z.ZodNumber;
    disk: z.ZodNumber;
    networkUp: z.ZodNumber;
    networkDown: z.ZodNumber;
    uptime: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    cpu: number;
    ram: number;
    gpu: number;
    disk: number;
    networkUp: number;
    networkDown: number;
    uptime: number;
}, {
    cpu: number;
    ram: number;
    gpu: number;
    disk: number;
    networkUp: number;
    networkDown: number;
    uptime: number;
}>;
export declare const FileTransferRequestSchema: z.ZodObject<{
    transferId: z.ZodString;
    fileName: z.ZodString;
    fileSize: z.ZodNumber;
    mimeType: z.ZodString;
    fileHash: z.ZodString;
    direction: z.ZodEnum<["desktop_to_mobile", "mobile_to_desktop"]>;
    transferToken: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    transferId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileHash: string;
    direction: "desktop_to_mobile" | "mobile_to_desktop";
    transferToken?: string | undefined;
}, {
    transferId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileHash: string;
    direction: "desktop_to_mobile" | "mobile_to_desktop";
    transferToken?: string | undefined;
}>;
export declare const FileTransferAcceptSchema: z.ZodObject<{
    transferId: z.ZodString;
    port: z.ZodNumber;
    hostIp: z.ZodString;
    transferToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    transferId: string;
    transferToken: string;
    port: number;
    hostIp: string;
}, {
    transferId: string;
    transferToken: string;
    port: number;
    hostIp: string;
}>;
export declare const FileTransferProgressSchema: z.ZodObject<{
    transferId: z.ZodString;
    bytesTransferred: z.ZodNumber;
    totalBytes: z.ZodNumber;
    percentage: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    transferId: string;
    bytesTransferred: number;
    totalBytes: number;
    percentage: number;
}, {
    transferId: string;
    bytesTransferred: number;
    totalBytes: number;
    percentage: number;
}>;
export declare const FileTransferSimpleSchema: z.ZodObject<{
    transferId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    transferId: string;
    reason?: string | undefined;
}, {
    transferId: string;
    reason?: string | undefined;
}>;
export declare const WSMessageEnvelopeSchema: z.ZodObject<{
    type: z.ZodEnum<["AUTH_REQUEST", "AUTH_RESPONSE", "EXECUTE_ACTION", "ACTION_STATUS", "SYSTEM_STATS", "PING", "PONG", "PAIR_REQUEST", "PAIR_RESPONSE", "LAYOUT_SYNC", "ACTIONS_SYNC", "FILE_TRANSFER_REQUEST", "FILE_TRANSFER_ACCEPT", "FILE_TRANSFER_REJECT", "FILE_TRANSFER_PROGRESS", "FILE_TRANSFER_COMPLETE", "FILE_TRANSFER_CANCEL"]>;
    payload: z.ZodAny;
    timestamp: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "PING" | "PONG" | "PAIR_REQUEST" | "PAIR_RESPONSE" | "LAYOUT_SYNC" | "ACTIONS_SYNC" | "EXECUTE_ACTION" | "ACTION_STATUS" | "SYSTEM_STATS" | "FILE_TRANSFER_REQUEST" | "FILE_TRANSFER_ACCEPT" | "FILE_TRANSFER_REJECT" | "FILE_TRANSFER_PROGRESS" | "FILE_TRANSFER_COMPLETE" | "FILE_TRANSFER_CANCEL" | "AUTH_REQUEST" | "AUTH_RESPONSE";
    timestamp: number;
    payload?: any;
}, {
    type: "PING" | "PONG" | "PAIR_REQUEST" | "PAIR_RESPONSE" | "LAYOUT_SYNC" | "ACTIONS_SYNC" | "EXECUTE_ACTION" | "ACTION_STATUS" | "SYSTEM_STATS" | "FILE_TRANSFER_REQUEST" | "FILE_TRANSFER_ACCEPT" | "FILE_TRANSFER_REJECT" | "FILE_TRANSFER_PROGRESS" | "FILE_TRANSFER_COMPLETE" | "FILE_TRANSFER_CANCEL" | "AUTH_REQUEST" | "AUTH_RESPONSE";
    timestamp: number;
    payload?: any;
}>;
export declare function validateWSMessage(data: unknown): {
    success: boolean;
    error: Error;
    data?: undefined;
} | {
    success: boolean;
    error: z.ZodError<any>;
    data?: undefined;
} | {
    success: boolean;
    data: {
        type: "PING" | "PONG" | "PAIR_REQUEST" | "PAIR_RESPONSE" | "LAYOUT_SYNC" | "ACTIONS_SYNC" | "EXECUTE_ACTION" | "ACTION_STATUS" | "SYSTEM_STATS" | "FILE_TRANSFER_REQUEST" | "FILE_TRANSFER_ACCEPT" | "FILE_TRANSFER_REJECT" | "FILE_TRANSFER_PROGRESS" | "FILE_TRANSFER_COMPLETE" | "FILE_TRANSFER_CANCEL" | "AUTH_REQUEST" | "AUTH_RESPONSE";
        timestamp: number;
        payload?: any;
    };
    error?: undefined;
};
