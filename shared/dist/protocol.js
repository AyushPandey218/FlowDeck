// Helper generators for quick WS packet creation
export function createWSMessage(type, payload) {
    return {
        type,
        payload,
        timestamp: Date.now(),
    };
}
