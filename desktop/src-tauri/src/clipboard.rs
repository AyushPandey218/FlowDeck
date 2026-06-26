use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sha2::{Sha256, Digest};
use tauri::{AppHandle, Manager, Emitter};

use crate::connection_manager::ConnectionManager;
use crate::db;

/// Maximum clipboard text payload size in bytes (100 KB).
const MAX_PAYLOAD_BYTES: usize = 100 * 1024;

/// Polling interval for clipboard changes.
const POLL_INTERVAL_MS: u64 = 1000;

/// Shared state for the clipboard sync subsystem.
pub struct ClipboardState {
    /// The sync-id of the last clipboard message we sent or applied,
    /// used to prevent infinite sync loops.
    pub last_sync_id: Mutex<Option<String>>,
    /// The content-hash of the last clipboard text we synced (sent or applied),
    /// used as a secondary loop-prevention mechanism across reconnects.
    pub last_clipboard_hash: Mutex<Option<String>>,
    /// Whether clipboard sync is currently enabled.
    pub enabled: Mutex<bool>,
}

impl ClipboardState {
    pub fn new() -> Self {
        ClipboardState {
            last_sync_id: Mutex::new(None),
            last_clipboard_hash: Mutex::new(None),
            enabled: Mutex::new(false),
        }
    }
}

/// Compute a hex-encoded SHA-256 hash for the given text.
pub fn sha256_hex(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn get_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Start the clipboard monitoring loop.
/// Polls the system clipboard every `POLL_INTERVAL_MS` milliseconds and
/// broadcasts changes to connected mobile clients via WebSocket.
pub fn start_clipboard_monitor(
    manager: Arc<ConnectionManager>,
    app_handle: AppHandle,
) {
    // Read initial enabled state from DB
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn_result = db_state.conn.lock();
        if let Ok(conn) = conn_result {
            let val: String = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'clipboard_sync_enabled';",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "false".to_string());
            let clip_state = app_handle.state::<ClipboardState>();
            *clip_state.enabled.lock().unwrap() = val == "true";
        }
    }

    tauri::async_runtime::spawn(async move {
        // arboard::Clipboard is not Send, so we must stay on a single blocking thread.
        let manager_clone = manager.clone();
        let handle_clone = app_handle.clone();

        tokio::task::spawn_blocking(move || {
            let mut clipboard = match arboard::Clipboard::new() {
                Ok(c) => c,
                Err(e) => {
                    let msg = format!("Failed to initialize clipboard: {}", e);
                    eprintln!("[CLIPBOARD] {}", msg);
                    db::log_error_to_db(&handle_clone, "CRITICAL", "CLIPBOARD_MONITOR", &msg);
                    return;
                }
            };

            let mut last_text: Option<String> = None;

            // Seed last_text with whatever is already on the clipboard so we
            // don't fire a sync immediately on startup.
            if let Ok(current) = clipboard.get_text() {
                last_text = Some(current);
            }

            loop {
                std::thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));

                // Check if clipboard sync is enabled
                let enabled = {
                    let clip_state = handle_clone.state::<ClipboardState>();
                    let val = *clip_state.enabled.lock().unwrap();
                    val
                };
                if !enabled {
                    continue;
                }

                // Check if there are any connected clients
                if manager_clone.get_client_count() == 0 {
                    continue;
                }

                // Read current clipboard text
                let current_text = match clipboard.get_text() {
                    Ok(t) => t,
                    Err(_) => continue,
                };

                // Detect change
                let changed = match &last_text {
                    Some(prev) => *prev != current_text,
                    None => true,
                };

                if !changed {
                    continue;
                }

                // Enforce 100 KB payload limit
                if current_text.len() > MAX_PAYLOAD_BYTES {
                    println!(
                        "[CLIPBOARD] Skipping sync: clipboard text size ({} bytes) exceeds 100 KB limit",
                        current_text.len()
                    );
                    last_text = Some(current_text);
                    continue;
                }

                let content_hash = sha256_hex(&current_text);

                // Loop prevention: check if this hash matches the last synced clipboard
                let hash_matches = {
                    let clip_state = handle_clone.state::<ClipboardState>();
                    let last_hash = clip_state.last_clipboard_hash.lock().unwrap();
                    match *last_hash {
                        Some(ref lh) => *lh == content_hash,
                        None => false,
                    }
                };
                if hash_matches {
                    // This clipboard content was written by a remote sync – skip
                    last_text = Some(current_text);
                    continue;
                }

                let sync_id = uuid::Uuid::new_v4().to_string();

                // Get desktop_id for source_device_id
                let desktop_id = {
                    let db_state = handle_clone.state::<db::DbState>();
                    let conn_result = db_state.conn.lock();
                    match conn_result {
                        Ok(conn) => db::get_or_create_desktop_id(&conn).unwrap_or_else(|_| "desktop".to_string()),
                        Err(_) => "desktop".to_string(),
                    }
                };

                let now_ms = get_epoch_ms() as i64;

                // Insert into clipboard_history (with deduplication)
                {
                    let db_state = handle_clone.state::<db::DbState>();
                    let conn_result = db_state.conn.lock();
                    if let Ok(conn) = conn_result {
                        let entry_id = uuid::Uuid::new_v4().to_string();
                        let _ = db::insert_clipboard_entry(
                            &conn,
                            db::ClipboardEntryParam {
                                id: &entry_id,
                                text: &current_text,
                                content_hash: &content_hash,
                                direction: "desktop_to_mobile",
                                is_local: true,
                                source_device_id: &desktop_id,
                                created_at: now_ms,
                            },
                        );
                    }
                }

                // Broadcast CLIPBOARD_SYNC to connected mobile clients
                let envelope = serde_json::json!({
                    "type": "CLIPBOARD_SYNC",
                    "payload": {
                        "text": current_text,
                        "sourceDeviceId": desktop_id,
                        "timestamp": now_ms,
                        "syncId": sync_id,
                        "version": 1,
                        "direction": "desktop_to_mobile"
                    },
                    "timestamp": now_ms
                });

                if let Ok(msg_str) = serde_json::to_string(&envelope) {
                    println!("[CLIPBOARD] Broadcasting clipboard change ({} bytes)", current_text.len());
                    manager_clone.broadcast_message(&msg_str, &handle_clone);
                }

                // Update loop-prevention state
                {
                    let clip_state = handle_clone.state::<ClipboardState>();
                    *clip_state.last_sync_id.lock().unwrap() = Some(sync_id);
                    *clip_state.last_clipboard_hash.lock().unwrap() = Some(content_hash);
                }

                // Emit event to desktop frontend for live UI update
                let _ = handle_clone.emit("clipboard-history-updated", ());

                last_text = Some(current_text);
            }
        });
    });
}

/// Handle an incoming CLIPBOARD_SYNC message from a mobile device.
/// Writes the text to the system clipboard if loop-prevention checks pass.
pub fn handle_incoming_clipboard_sync(
    payload: &serde_json::Value,
    app_handle: &AppHandle,
) {
    let text = match payload.get("text").and_then(|v| v.as_str()) {
        Some(t) => t.to_string(),
        None => return,
    };
    let sync_id = payload
        .get("syncId")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let content_hash_from_payload = payload
        .get("contentHash")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let source_device_id = payload
        .get("sourceDeviceId")
        .and_then(|v| v.as_str())
        .unwrap_or("mobile")
        .to_string();
    let direction = payload
        .get("direction")
        .and_then(|v| v.as_str())
        .unwrap_or("mobile_to_desktop")
        .to_string();

    // Check enabled
    {
        let clip_state = app_handle.state::<ClipboardState>();
        let is_enabled = *clip_state.enabled.lock().unwrap();
        if !is_enabled {
            println!("[CLIPBOARD] Ignoring incoming sync – clipboard sync disabled");
            return;
        }
    }

    // Enforce 100 KB payload limit
    if text.len() > MAX_PAYLOAD_BYTES {
        println!(
            "[CLIPBOARD] Rejecting incoming sync: text size ({} bytes) exceeds 100 KB limit",
            text.len()
        );
        return;
    }

    let content_hash = content_hash_from_payload.unwrap_or_else(|| sha256_hex(&text));

    // Loop prevention #1: check syncId
    {
        let clip_state = app_handle.state::<ClipboardState>();
        let last_sid = clip_state.last_sync_id.lock().unwrap();
        if let Some(ref ls) = *last_sid {
            if *ls == sync_id {
                println!("[CLIPBOARD] Ignoring incoming sync – syncId matches (loop prevention)");
                return;
            }
        }
    }

    // Loop prevention #2: check content hash
    {
        let clip_state = app_handle.state::<ClipboardState>();
        let last_hash = clip_state.last_clipboard_hash.lock().unwrap();
        if let Some(ref lh) = *last_hash {
            if *lh == content_hash {
                println!("[CLIPBOARD] Ignoring incoming sync – content hash matches (loop prevention)");
                return;
            }
        }
    }

    // Write to system clipboard
    match arboard::Clipboard::new() {
        Ok(mut clipboard) => {
            if let Err(e) = clipboard.set_text(&text) {
                let msg = format!("Failed to write to system clipboard: {}", e);
                eprintln!("[CLIPBOARD] {}", msg);
                db::log_error_to_db(app_handle, "ERROR", "CLIPBOARD_WRITE", &msg);
                return;
            }
            println!("[CLIPBOARD] Applied incoming clipboard text ({} bytes) from {}", text.len(), source_device_id);
        }
        Err(e) => {
            let msg = format!("Failed to open clipboard for writing: {}", e);
            eprintln!("[CLIPBOARD] {}", msg);
            db::log_error_to_db(app_handle, "ERROR", "CLIPBOARD_WRITE", &msg);
            return;
        }
    }

    let now_ms = get_epoch_ms() as i64;

    // Insert into clipboard_history
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn_result = db_state.conn.lock();
        if let Ok(conn) = conn_result {
            let entry_id = uuid::Uuid::new_v4().to_string();
            let _ = db::insert_clipboard_entry(
                &conn,
                db::ClipboardEntryParam {
                    id: &entry_id,
                    text: &text,
                    content_hash: &content_hash,
                    direction: &direction,
                    is_local: false,
                    source_device_id: &source_device_id,
                    created_at: now_ms,
                },
            );
        }
    }

    // Update loop-prevention state
    {
        let clip_state = app_handle.state::<ClipboardState>();
        *clip_state.last_sync_id.lock().unwrap() = Some(sync_id);
        *clip_state.last_clipboard_hash.lock().unwrap() = Some(content_hash);
    }

    // Emit event to desktop frontend for live UI update
    let _ = app_handle.emit("clipboard-history-updated", ());
}
