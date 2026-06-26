use std::process::Command;
use crate::db::ActionType;

extern "system" {
    fn LockWorkStation() -> i32;
    fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
}

/// Executes the given action type with the provided payload.
/// Avoids arbitrary shell passthroughs and runs commands directly.
pub fn execute_action(action_type: ActionType, payload: Option<&str>) -> Result<(), String> {
    match action_type {
        ActionType::OpenApp => {
            let raw_path = payload.ok_or_else(|| "Missing payload for OPEN_APP".to_string())?;
            if raw_path.is_empty() {
                return Err("Executable path is empty".to_string());
            }

            // Expand environment variables
            let mut expanded = raw_path.to_string();
            if expanded.contains("%USERPROFILE%") {
                if let Ok(profile) = std::env::var("USERPROFILE") {
                    expanded = expanded.replace("%USERPROFILE%", &profile);
                }
            }
            if expanded.contains("%LOCALAPPDATA%") {
                if let Ok(local) = std::env::var("LOCALAPPDATA") {
                    expanded = expanded.replace("%LOCALAPPDATA%", &local);
                }
            }
            if expanded.contains("%APPDATA%") {
                if let Ok(appdata) = std::env::var("APPDATA") {
                    expanded = expanded.replace("%APPDATA%", &appdata);
                }
            }

            // Parse executable path and arguments
            let mut exe_path = expanded.clone();
            let mut args = Vec::new();

            // Handle Windows UWP apps via shell:AppsFolder
            if expanded.starts_with("shell:AppsFolder\\") {
                println!("[EXECUTOR] Spawning UWP app via explorer: {}", expanded);
                Command::new("explorer.exe")
                    .arg(&expanded)
                    .spawn()
                    .map_err(|e| format!("Failed to spawn explorer for {}: {}", expanded, e))?;
                return Ok(());
            }

            if let Some(stripped) = expanded.strip_prefix('"') {
                if let Some(end_quote_idx) = stripped.find('"') {
                    exe_path = stripped[0..end_quote_idx].to_string();
                    let remaining = &stripped[end_quote_idx + 1..];
                    args = remaining.split_whitespace().map(|s| s.to_string()).collect();
                }
            } else {
                let parts: Vec<&str> = expanded.split_whitespace().collect();
                let mut found = false;
                for i in (1..=parts.len()).rev() {
                    let candidate = parts[0..i].join(" ");
                    let candidate_path = std::path::Path::new(&candidate);
                    if candidate_path.exists() {
                        exe_path = candidate;
                        args = parts[i..].iter().map(|s| s.to_string()).collect();
                        found = true;
                        break;
                    }
                }
                if !found && !parts.is_empty() {
                    exe_path = parts[0].to_string();
                    args = parts[1..].iter().map(|s| s.to_string()).collect();
                }
            }

            let path_buf = std::path::Path::new(&exe_path);
            let has_separator = exe_path.contains('\\') || exe_path.contains('/');
            if has_separator && !path_buf.exists() {
                eprintln!("[EXECUTOR] Executable not found: {}", exe_path);
                return Err("Executable not found".to_string());
            }

            // Detect directories, shortcuts, scripts, or non-exe files
            let exe_lower = exe_path.to_lowercase();
            let is_special = (path_buf.exists() && path_buf.is_dir())
                || exe_lower.ends_with(".lnk")
                || exe_lower.ends_with(".bat")
                || exe_lower.ends_with(".cmd")
                || exe_lower.ends_with(".url")
                || (path_buf.exists() && !exe_lower.ends_with(".exe"));

            if is_special {
                println!("[EXECUTOR] Special path (dir/lnk/script) detected: {}. Spawning via cmd.exe /c start...", exe_path);
                let cmd_res = Command::new("cmd")
                    .args(["/c", "start", "", &exe_path])
                    .spawn();

                match cmd_res {
                    Ok(_) => return Ok(()),
                    Err(e) => {
                        println!("[EXECUTOR] cmd.exe launch failed: {}. Trying explorer.exe...", e);
                        Command::new("explorer.exe")
                            .arg(&exe_path)
                            .spawn()
                            .map_err(|err| {
                                eprintln!("[EXECUTOR] Explorer fallback launch failed: {}", err);
                                format!("Failed to launch application: {}", err)
                            })?;
                        return Ok(());
                    }
                }
            }

            println!("[EXECUTOR] Launching application: {} with args: {:?}", exe_path, args);
            
            let spawn_res = Command::new(&exe_path)
                .args(&args)
                .spawn();

            match spawn_res {
                Ok(_) => Ok(()),
                Err(e) => {
                    println!("[EXECUTOR] Direct launch failed: {}. Trying cmd.exe /c start...", e);
                    let cmd_res = Command::new("cmd")
                        .args(["/c", "start", "", &exe_path])
                        .spawn();
                    match cmd_res {
                        Ok(_) => Ok(()),
                        Err(err2) => {
                            println!("[EXECUTOR] cmd.exe fallback failed: {}. Trying explorer.exe...", err2);
                            Command::new("explorer.exe")
                                .arg(&exe_path)
                                .spawn()
                                .map_err(|err3| {
                                    eprintln!("[EXECUTOR] Final explorer fallback failed: {}", err3);
                                    format!("Failed to launch application: {}", err3)
                                })?;
                            Ok(())
                        }
                    }
                }
            }
        }
        ActionType::OpenUrl => {
            let payload_str = payload.ok_or_else(|| "Missing payload for OPEN_URL".to_string())?;
            if payload_str.is_empty() {
                return Err("URL is empty".to_string());
            }

            // Try to parse as JSON for custom browser selection
            #[derive(serde::Deserialize)]
            struct UrlPayload {
                url: String,
                browser: Option<String>,
            }

            let (url, browser) = match serde_json::from_str::<UrlPayload>(payload_str) {
                Ok(data) => (data.url, data.browser),
                Err(_) => (payload_str.to_string(), None),
            };

            println!("[EXECUTOR] Opening URL: {} with browser: {:?}", url, browser);

            if let Some(browser_path) = browser {
                Command::new(&browser_path)
                    .arg(&url)
                    .spawn()
                    .map_err(|e| format!("Failed to spawn browser {}: {}", browser_path, e))?;
            } else {
                tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| {
                    eprintln!("[EXECUTOR] Failed to open URL: {}", e);
                    format!("Failed to open URL: {}", e)
                })?;
            }
            Ok(())
        }
        ActionType::VolumeUp => {
            println!("[EXECUTOR] Volume Up");
            unsafe {
                keybd_event(0xAF, 0, 0, 0); // VK_VOLUME_UP key down
                keybd_event(0xAF, 0, 2, 0); // VK_VOLUME_UP key up
            }
            Ok(())
        }
        ActionType::VolumeDown => {
            println!("[EXECUTOR] Volume Down");
            unsafe {
                keybd_event(0xAE, 0, 0, 0); // VK_VOLUME_DOWN key down
                keybd_event(0xAE, 0, 2, 0); // VK_VOLUME_DOWN key up
            }
            Ok(())
        }
        ActionType::ToggleMute => {
            println!("[EXECUTOR] Toggle Mute");
            unsafe {
                keybd_event(0xAD, 0, 0, 0); // VK_VOLUME_MUTE key down
                keybd_event(0xAD, 0, 2, 0); // VK_VOLUME_MUTE key up
            }
            Ok(())
        }
        ActionType::LockPc => {
            println!("[EXECUTOR] Lock PC");
            unsafe {
                LockWorkStation();
            }
            Ok(())
        }
        ActionType::HideAllWindows => {
            println!("[EXECUTOR] Hide All Windows (Win+D)");
            unsafe {
                keybd_event(0x5B, 0, 0, 0); // VK_LWIN down
                keybd_event(0x44, 0, 0, 0); // 'D' down
                keybd_event(0x44, 0, 2, 0); // 'D' up
                keybd_event(0x5B, 0, 2, 0); // VK_LWIN up
            }
            Ok(())
        }
        ActionType::CloseAllWindows => {
            println!("[EXECUTOR] Close All Windows (Powershell)");
            Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-Command",
                    "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.CloseMainWindow() }"
                ])
                .spawn()
                .map_err(|e| format!("Failed to spawn CloseAllWindows process: {}", e))?;
            Ok(())
        }
        ActionType::SwitchDesktop => {
            let direction = payload.unwrap_or("right");
            println!("[EXECUTOR] Cycle Virtual Desktop ({})", direction);
            let key = if direction == "left" { 0x25 } else { 0x27 }; // VK_LEFT = 0x25, VK_RIGHT = 0x27
            unsafe {
                keybd_event(0x11, 0, 0, 0); // VK_CONTROL down
                keybd_event(0x5B, 0, 0, 0); // VK_LWIN down
                keybd_event(key, 0, 0, 0);  // Arrow down
                keybd_event(key, 0, 2, 0);  // Arrow up
                keybd_event(0x5B, 0, 2, 0); // VK_LWIN up
                keybd_event(0x11, 0, 2, 0); // VK_CONTROL up
            }
            Ok(())
        }
        ActionType::Hotkey => {
            let hotkey_str = payload.unwrap_or("");
            if hotkey_str.is_empty() {
                return Err("No hotkey payload provided".to_string());
            }
            println!("[EXECUTOR] Injecting Hotkey: {}", hotkey_str);
            let keys = parse_hotkey_string(hotkey_str);
            if keys.is_empty() {
                return Err("Failed to parse hotkey payload".to_string());
            }
            unsafe {
                // Press down
                for &k in &keys {
                    keybd_event(k, 0, 0, 0);
                }
                // Release in reverse
                for &k in keys.iter().rev() {
                    keybd_event(k, 0, 2, 0); // 2 is KEYEVENTF_KEYUP
                }
            }
            Ok(())
        }
    }
}

/// Helper to convert a string like "Ctrl+Shift+S" or "Win+D" into a list of Virtual Key Codes
fn parse_hotkey_string(s: &str) -> Vec<u8> {
    let mut vks = Vec::new();
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    for p in parts {
        let vk = match p.to_lowercase().as_str() {
            "ctrl" | "control" => 0x11, // VK_CONTROL
            "shift" => 0x10, // VK_SHIFT
            "alt" => 0x12, // VK_MENU
            "win" | "windows" | "meta" | "cmd" => 0x5B, // VK_LWIN
            "enter" | "return" => 0x0D,
            "esc" | "escape" => 0x1B,
            "space" => 0x20,
            "tab" => 0x09,
            "backspace" => 0x08,
            "delete" | "del" => 0x2E,
            "insert" | "ins" => 0x2D,
            "home" => 0x24,
            "end" => 0x23,
            "pageup" | "pgup" => 0x21,
            "pagedown" | "pgdn" => 0x22,
            "up" => 0x26,
            "down" => 0x28,
            "left" => 0x25,
            "right" => 0x27,
            "f1" => 0x70, "f2" => 0x71, "f3" => 0x72, "f4" => 0x73,
            "f5" => 0x74, "f6" => 0x75, "f7" => 0x76, "f8" => 0x77,
            "f9" => 0x78, "f10" => 0x79, "f11" => 0x7A, "f12" => 0x7B,
            other => {
                if other.len() == 1 {
                    let c = other.chars().next().unwrap().to_ascii_uppercase();
                    c as u8
                } else {
                    0
                }
            }
        };
        if vk != 0 {
            vks.push(vk);
        }
    }
    vks
}

