import { z } from 'zod';
// Schema for AUTH_REQUEST payloads
export const AuthRequestSchema = z.object({
    deviceId: z.string().uuid('deviceId must be a valid UUID'),
    deviceName: z.string().min(1, 'deviceName cannot be empty').max(64, 'deviceName exceeds 64 characters'),
    pairingToken: z.string().min(8, 'pairingToken is too short'),
});
// Schema for AUTH_RESPONSE payloads
export const AuthResponseSchema = z.object({
    success: z.boolean(),
    persistentToken: z.string().optional(),
    error: z.string().optional(),
});
// Schema for EXECUTE_ACTION payloads
export const ExecuteActionSchema = z.object({
    actionId: z.string().min(1, 'actionId cannot be empty'),
    actionType: z.enum([
        'APP',
        'GAME',
        'FOLDER',
        'URL',
        'POWERSHELL',
        'BATCH',
        'CMD',
        'MEDIA',
        'SYSTEM',
    ]),
    payload: z.string().max(65536, 'Payload length exceeds maximum bounds'),
});
// Schema for ACTION_STATUS payloads
export const ActionStatusSchema = z.object({
    actionId: z.string().min(1, 'actionId cannot be empty'),
    success: z.boolean(),
    exitCode: z.number().optional(),
    error: z.string().optional(),
});
// Schema for SYSTEM_STATS payloads
export const SystemStatsSchema = z.object({
    cpu: z.number().min(0).max(100),
    ram: z.number().min(0).max(100),
    gpu: z.number().min(0).max(100),
    disk: z.number().min(0).max(100),
    networkUp: z.number().nonnegative(),
    networkDown: z.number().nonnegative(),
    uptime: z.number().nonnegative(),
});
// Schema for FILE_TRANSFER_REQUEST payloads
export const FileTransferRequestSchema = z.object({
    transferId: z.string().uuid(),
    fileName: z.string().min(1),
    fileSize: z.number().int().nonnegative(),
    mimeType: z.string(),
    fileHash: z.string().min(64).max(64),
    direction: z.enum(['desktop_to_mobile', 'mobile_to_desktop']),
    transferToken: z.string().optional(),
});
// Schema for FILE_TRANSFER_ACCEPT payloads
export const FileTransferAcceptSchema = z.object({
    transferId: z.string().uuid(),
    port: z.number().int().nonnegative(),
    hostIp: z.string(),
    transferToken: z.string(),
});
// Schema for FILE_TRANSFER_PROGRESS payloads
export const FileTransferProgressSchema = z.object({
    transferId: z.string().uuid(),
    bytesTransferred: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
    percentage: z.number().min(0).max(100),
});
// Schema for simple FILE_TRANSFER cancellations, completions, and rejections
export const FileTransferSimpleSchema = z.object({
    transferId: z.string().uuid(),
    reason: z.string().optional(),
});
// Generic validator that checks type and validates corresponding payload
export const WSMessageEnvelopeSchema = z.object({
    type: z.enum([
        'AUTH_REQUEST',
        'AUTH_RESPONSE',
        'EXECUTE_ACTION',
        'ACTION_STATUS',
        'SYSTEM_STATS',
        'PING',
        'PONG',
        'PAIR_REQUEST',
        'PAIR_RESPONSE',
        'LAYOUT_SYNC',
        'ACTIONS_SYNC',
        'FILE_TRANSFER_REQUEST',
        'FILE_TRANSFER_ACCEPT',
        'FILE_TRANSFER_REJECT',
        'FILE_TRANSFER_PROGRESS',
        'FILE_TRANSFER_COMPLETE',
        'FILE_TRANSFER_CANCEL',
    ]),
    payload: z.any(),
    timestamp: z.number().nonnegative(),
});
// Helper utility to validate complete envelopes based on their message type
export function validateWSMessage(data) {
    const envelopeResult = WSMessageEnvelopeSchema.safeParse(data);
    if (!envelopeResult.success) {
        return { success: false, error: envelopeResult.error };
    }
    const { type, payload } = envelopeResult.data;
    let payloadResult;
    switch (type) {
        case 'AUTH_REQUEST':
            payloadResult = AuthRequestSchema.safeParse(payload);
            break;
        case 'AUTH_RESPONSE':
            payloadResult = AuthResponseSchema.safeParse(payload);
            break;
        case 'EXECUTE_ACTION':
            payloadResult = ExecuteActionSchema.safeParse(payload);
            break;
        case 'ACTION_STATUS':
            payloadResult = ActionStatusSchema.safeParse(payload);
            break;
        case 'SYSTEM_STATS':
            payloadResult = SystemStatsSchema.safeParse(payload);
            break;
        case 'FILE_TRANSFER_REQUEST':
            payloadResult = FileTransferRequestSchema.safeParse(payload);
            break;
        case 'FILE_TRANSFER_ACCEPT':
            payloadResult = FileTransferAcceptSchema.safeParse(payload);
            break;
        case 'FILE_TRANSFER_PROGRESS':
            payloadResult = FileTransferProgressSchema.safeParse(payload);
            break;
        case 'FILE_TRANSFER_REJECT':
        case 'FILE_TRANSFER_COMPLETE':
        case 'FILE_TRANSFER_CANCEL':
            payloadResult = FileTransferSimpleSchema.safeParse(payload);
            break;
        case 'PING':
        case 'PONG':
        case 'PAIR_REQUEST':
        case 'PAIR_RESPONSE':
        case 'LAYOUT_SYNC':
        case 'ACTIONS_SYNC':
            payloadResult = z.any().safeParse(payload);
            break;
        default:
            return { success: false, error: new Error('Unknown message type') };
    }
    if (!payloadResult.success) {
        return { success: false, error: payloadResult.error };
    }
    return { success: true, data: envelopeResult.data };
}
