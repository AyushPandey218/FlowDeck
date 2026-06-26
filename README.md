# FlowDeck 📡

[![Rust](https://img.shields.io/badge/rust-%23E32F26.svg?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=FFFFFF)](https://tauri.app/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![Expo](https://img.shields.io/badge/expo-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**FlowDeck** is a local-first remote control system that turns your phone into a powerful desktop controller. Pair via QR code, then execute actions, view live hardware telemetry, transfer files, and sync clipboard — all over your local network with no cloud dependency.

---

## ✨ Features

- **🔒 100% Private**: All communication stays on your LAN. Your data never touches the cloud.
- **⚡ Blazing Fast**: Real-time WebSocket commands with sub-second latency over your local network.
- **📱 Phone ↔ PC**: Full bidirectional control — launch apps, send hotkeys, switch desktops, lock PC.
- **📊 Live Monitoring**: Real-time CPU, RAM, Disk, Network, GPU, and latency telemetry at 1.5s refresh.
- **📁 File Transfers**: Send/receive files up to 100 MB over TCP with SHA-256 integrity verification.
- **📋 Clipboard Sync**: Bidirectional clipboard with deduplication, history, and loop prevention.
- **🎨 Custom Dashboard**: Organize actions into pages & categories via the desktop builder, synced instantly.
- **🌈 Dark Glassmorphism UI**: Sleek, frosted-glass interface with violet accents across both platforms.

---

## 🚀 Installation

1. Go to the [Releases](https://github.com/AyushPandey218/FlowDeck/releases) page.
2. Download the latest `FlowDeck_x64-setup.exe` (desktop host) and `FlowDeck.apk` (mobile controller).
3. Install the desktop app on your Windows PC and the APK on your Android phone.
4. Open the desktop app, scan the QR code from your phone, and you're paired!

---

## 🛠️ Technical Architecture

FlowDeck uses a multi-layered architecture for maximum performance and privacy:
- **Desktop App**: Tauri v2 (Rust + React) — hosts a WebSocket server over LAN, handles action execution via Win32 API / PowerShell, manages SQLite database, and streams system telemetry.
- **Mobile App**: Expo (React Native + NativeWind) — connects to the desktop over WebSocket, displays a glassmorphism UI with real-time updates, cameras for QR pairing, and manages file transfers.
- **Shared Package**: `@flowdeck/shared` — Zod-validated protocol types, message envelopes, and constants used by both platforms to ensure type safety.
- **Communication**: Bidirectional WebSocket with JSON envelope protocol, PING/PONG heartbeat (5s/15s), and token-based QR pairing.

---

## 💻 Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/tools/install)
- [Android SDK](https://developer.android.com/studio) (for mobile)
- [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (for Windows)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 + MSVC toolchain)

### Setup
```bash
# Clone the repository
git clone https://github.com/AyushPandey218/FlowDeck.git
cd FlowDeck

# Install dependencies
npm install
cd desktop && npm install
cd ../mobile && npm install
cd ../shared && npm install
cd ..
```

### Run
```bash
# Desktop dev (Tauri + Vite)
npm run desktop

# Mobile dev (Expo)
npm run mobile
```

### Build
```bash
# Desktop installer
cd desktop && npm run tauri build

# Mobile APK
cd mobile && npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙌 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request if you have ideas for new features or optimizations.

*Made with ❤️ by [Ayush](https://github.com/AyushPandey218)*
