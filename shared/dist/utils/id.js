/**
 * Central utility to generate unique identifiers (UUID v4) for nodes, actions, and devices.
 * Uses native Web Crypto randomUUID where available, with a standard RFC4122 v4 math fallback
 * for restricted environments (like older React Native JS engines).
 */
export const createId = () => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    // Fallback RFC4122 v4 compliant UUID generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};
