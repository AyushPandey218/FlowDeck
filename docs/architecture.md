# Flow Deck: System Architecture

This document describes the high-level system architecture of **Flow Deck**, a system consisting of a Windows Desktop host (running Tauri v2 + Rust) and a Mobile client (running React Native via Expo).

## Core Architecture Design Principles
1. **Local-First Security**: Communication occurs entirely over the local network (LAN) with no external cloud servers or internet dependencies.
2. **Strict Validation**: All network inputs (WebSocket packets) are validated on arrival using strict parser/validators (Zod on JS/TS layers, struct validations in Rust).
3. **Decoupled Responsibilities**:
   - **Tauri Core (Rust)**: Manages low-level OS operations, WebSocket serving, SQLite DB persistence, system metrics polling, and execution of OS/shell instructions.
   - **Tauri UI (React/TS)**: Serves as the dashboard configuration builder, displays connected clients, connection QR codes, and system tray options.
   - **Mobile Client (React Native/Expo)**: Serves as a remote control touchpad, action grid controller, and live stats receiver.

---

## Component Layout & Data Flow

### 1. Pairing Flow
```
[Desktop UI] ──(Generates Temp Token)──> [QR Code Displayed]
                                                 │
                                           (Mobile scans QR)
                                                 ▼
[Mobile Client] ──(WS: AUTH_REQUEST)──> [Rust WS Server]
                                                 │
                                     (Validates Temp Token)
                                                 ▼
[Mobile Client] <──(WS: AUTH_SUCCESS)── [Rust WS Server]
       │                                         │
(Saves Persistence Token)             (Saves Client Device details)
```

### 2. Command Execution Flow
When a user presses a button on the Mobile Client action grid:
1. **Client Action Dispatch**: Mobile app sends an `EXECUTE_ACTION` frame through the WebSocket client to the desktop host's local IP address and port.
2. **Payload Parsing**: The Rust WebSocket Server parses the incoming JSON, reads the `deviceId`, validates the associated cryptographically paired session token in SQLite, and invokes the Action Execution handler.
3. **OS System Call**: The action handler executes the target payload:
   - For applications/folders/websites: Spawns a process.
   - For custom scripts: Runs PowerShell or Batch scripts inside a subshell.
   - For system controls: Issues Win32 calls (lock workspace, sleep, shutdown).
4. **Response Notification**: An execution acknowledgement is returned to the client to confirm success or signal failures (e.g. executable not found).

### 3. Metric Monitoring Flow
1. **Sampling Loop**: A lightweight background Rust thread queries hardware usage (CPU, RAM, GPU, Disk, Network) every 1.5 seconds.
2. **Socket Broadcast**: The system stats payload is sent via the active WebSocket connection to all authorized connected clients.
3. **Visual updates**: The Mobile client receives the stats frame, validates the data, updates the Zustand store, and triggers re-renders in visual trend graphs.
