# Flow Deck: Development Roadmap

A structured timeline showing the status, goals, and deliverables for each milestone of **Flow Deck**.

---

## Roadmap Overview

| Phase | Title | Focus Area | Status |
|---|---|---|---|
| **Phase 1** | Project Setup & Architecture | Folder structure, doc layouts, env configurations, shared types, Zod validators. | **In Progress** |
| **Phase 2** | Desktop Shell & Database | Tauri v2 project initialization, SQLite tables setup, base frontend layout (dark mode). | *Pending* |
| **Phase 3** | Mobile Shell & Navigation | Expo project setup, navigation, basic screens, NativeWind integrations. | *Pending* |
| **Phase 4** | WebSocket Communication | Tauri Rust WebSocket server thread, Expo WebSocket connection wrapper. | *Pending* |
| **Phase 5** | Pairing System | Local host IP/port lookup, QR code generation, camera scan handshake validation. | *Pending* |
| **Phase 6** | Action Execution System | Execution wrappers (processes, folders, web URLs, PowerShell scripts, system functions). | *Pending* |
| **Phase 7** | Dashboard Builder | Multi-page editing interface on desktop, action grids grid synchronization. | *Pending* |
| **Phase 8** | Monitoring System | Host telemetry monitoring (sysinfo), mobile stats charts and monitoring screens. | *Pending* |
| **Phase 9** | Security & Permissions | Token authentication, local network whitelists, client script execution checks. | *Pending* |
| **Phase 10** | Polish & Delivery | System tray optimization, performance diagnostics, compiling release builds. | *Pending* |

---

## Detailed Deliverables per Phase

### Phase 1: Setup (Current)
- Scaffolding monorepo structures.
- Documentation layouts detailing architecture.
- Shared models and Zod validations definitions.
- Initial global configs files.

### Phase 2: Desktop Shell
- Scaffold Tauri workspace, Rust project configuration.
- SQLite database migrations configuration, database helper modules.
- Modern Glassmorphism Tailwind React layout setup on host.

### Phase 3: Mobile Shell
- Initialize Expo + TypeScript.
- Set up React Navigation screens: Home, Monitor, Devices, Settings.
- Styling elements with Tailwind/NativeWind.

### Phase 4: WebSockets
- Rust WebSocket Server setup (`tokio-tungstenite`).
- WebSocket management engine on client (handling reconnections, latency checks).

### Phase 5: Pairing Setup
- Secure temporary tokens creation system.
- Camera scanner implementation.
- Handshake protocols and token generation helper.

### Phase 6: System Commands
- Spawning local applications and file locations safely in Windows.
- Standard Media controls execution.
- Command execution inside PowerShell and Batch shells.

### Phase 7: Sync Engine
- Core actions builder database operations.
- Layout data syncing and rendering controls on phone.

### Phase 8: Telemetry
- Core monitoring thread implementation in Rust.
- Real-time graphics display rendering on mobile.

### Phase 9: Encryption & Security
- Pairing validation validations.
- Authorization settings (e.g. prompt permission warning checks on host).

### Phase 10: Production Release
- Building release configurations.
- System tray minimization.
- Performance fine-tuning.
