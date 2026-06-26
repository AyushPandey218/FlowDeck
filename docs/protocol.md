# Flow Deck: WebSocket API Protocol

Flow Deck utilizes WebSockets to achieve sub-100ms response latencies for controlling PC states and executing custom triggers.

- **Transport**: WebSockets (RFC 6455)
- **Content Encoding**: JSON
- **Default Port**: `45667`

---

## Packet Anatomy
Every WebSocket packet must match the global wrapper structure:

```typescript
interface WSMessage<T = any> {
  type: string;        // Packet type identifier
  payload: T;          // Associated payload object
  timestamp: number;   // Epoch millisecond timestamp of the sender
}
```

---

## Message Interface Definitions

### 1. `AUTH_REQUEST` (Client -> Host)
Dispatched immediately when the mobile client connects. Needs either a temporary token scanned from the QR code (for initial pairing) or a saved persistence token (for normal connections).

```typescript
interface AuthRequest {
  deviceId: string;     // Unique UUID generated on installation
  deviceName: string;   // Human-readable device tag (e.g., "Galaxy S23")
  pairingToken: string; // The token to validate
}
```

### 2. `AUTH_RESPONSE` (Host -> Client)
Sent back by the host. If pairing succeeds for a temporary token, the host generates a persistent secure token and returns it in the payload.

```typescript
interface AuthResponse {
  success: boolean;
  persistentToken?: string; // Stored locally on mobile device for subsequent connections
  error?: string;           // Failure reason
}
```

### 3. `EXECUTE_ACTION` (Client -> Host)
Dispatched by the mobile client when a button is tapped.

```typescript
interface ExecuteAction {
  actionId: string;
  actionType: 'APP' | 'GAME' | 'FOLDER' | 'URL' | 'POWERSHELL' | 'BATCH' | 'CMD' | 'MEDIA' | 'SYSTEM';
  payload: string;          // Action configuration details
}
```

### 4. `SYSTEM_STATS` (Host -> Client)
Broadcasted by the host to authorized clients every 1.5 seconds.

```typescript
interface SystemStats {
  cpu: number;          // CPU load percentage (0.0 to 100.0)
  ram: number;          // RAM usage percentage (0.0 to 100.0)
  gpu: number;          // GPU usage percentage (0.0 to 100.0)
  disk: number;         // Root disk load percentage (0.0 to 100.0)
  networkUp: number;    // Upstream speed in bytes/sec
  networkDown: number;  // Downstream speed in bytes/sec
  uptime: number;       // OS uptime in seconds
}
```

### 5. `PING` and `PONG` (Heartbeats)
- **Host** sends `{"type": "PING", "payload": {}, "timestamp": ...}` every 5 seconds.
- **Client** must immediately reply with `{"type": "PONG", "payload": {}, "timestamp": ...}`.
- If no PONG is received within 3 seconds, or the socket breaks, the connection is closed.
