/**
 * Central utility to generate unique identifiers (UUID v4) for nodes, actions, and devices.
 * Uses native Web Crypto randomUUID where available, with a standard RFC4122 v4 math fallback
 * for restricted environments (like older React Native JS engines).
 */
export declare const createId: () => string;
