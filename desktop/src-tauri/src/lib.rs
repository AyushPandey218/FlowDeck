mod db;
mod plugins;
mod connection_manager;
mod websocket;
mod network;
mod executor;
mod monitor;
mod clipboard;
mod file_transfer;
mod app_discovery;
mod url_metadata;


#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingPayload {
    protocol_version: u32,
    host: String,
    port: u16,
    pairing_token: String,
}

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

pub struct WsState {
    pub manager: Arc<connection_manager::ConnectionManager>,
}

#[derive(serde::Serialize)]
struct AppInfo {
    version: &'static str,
    #[serde(rename = "desktopId")]
    desktop_id: String,
    #[serde(rename = "dbInitialized")]
    db_initialized: bool,
}

#[tauri::command]
fn get_app_info(app_handle: AppHandle) -> Result<AppInfo, String> {
    let db_state = app_handle
        .state::<db::DbState>();
        
    let conn = db_state
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;
    
    let desktop_id = db::get_or_create_desktop_id(&conn)?;
    
    Ok(AppInfo {
        version: "0.1.0-alpha",
        desktop_id,
        db_initialized: true,
    })
}

#[tauri::command]
fn get_protocol_stats(
    ws_state: tauri::State<'_, WsState>,
) -> Result<connection_manager::ProtocolStats, String> {
    Ok(ws_state.manager.get_stats())
}

#[tauri::command]
fn get_setting(app_handle: AppHandle, key: String) -> Result<String, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1;")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([&key])
        .map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let val: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(val)
    } else {
        Ok("".to_string())
    }
}

#[tauri::command]
fn set_setting(app_handle: AppHandle, key: String, value: String) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2);",
        [&key, &value],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn generate_pairing_payload(ws_state: tauri::State<'_, WsState>) -> Result<PairingPayload, String> {
    let pairing_token = ws_state.manager.generate_pairing_token();
    let host_ip = network::get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    Ok(PairingPayload {
        protocol_version: 1,
        host: host_ip,
        port: 45667,
        pairing_token,
    })
}

#[tauri::command]
fn get_trusted_devices(app_handle: AppHandle) -> Result<Vec<db::TrustedDevice>, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::get_trusted_devices(&conn)
}

#[tauri::command]
fn remove_trusted_device(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    device_id: String,
) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::remove_trusted_device(&conn, &device_id)?;
    ws_state.manager.disconnect_device(&device_id, &app_handle);
    Ok(())
}

#[tauri::command]
fn get_actions(app_handle: AppHandle) -> Result<Vec<db::Action>, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::get_actions(&conn)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddActionArgs {
    category_id: String,
    name: String,
    action_type: String,
    payload: Option<String>,
    icon: Option<String>,
}

#[tauri::command]
fn add_action(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    args: AddActionArgs,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        let a_type = db::ActionType::from_str(&args.action_type)?;
        db::add_action(
            &conn,
            db::AddActionParam {
                category_id: &args.category_id,
                name: &args.name,
                action_type: a_type,
                payload: args.payload.as_deref(),
                icon: args.icon.as_deref(),
            },
        )?;
    }
    
    // Broadcast ACTIONS_SYNC to all connected companions
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateActionArgs {
    id: String,
    category_id: String,
    name: String,
    action_type: String,
    payload: Option<String>,
    icon: Option<String>,
}

#[tauri::command]
fn update_action(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    args: UpdateActionArgs,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        let a_type = db::ActionType::from_str(&args.action_type)?;
        db::update_action(
            &conn,
            db::UpdateActionParam {
                id: &args.id,
                category_id: &args.category_id,
                name: &args.name,
                action_type: a_type,
                payload: args.payload.as_deref(),
                icon: args.icon.as_deref(),
            },
        )?;
    }
    
    // Broadcast ACTIONS_SYNC to all connected companions
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn delete_action(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    id: String,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::delete_action(&conn, &id)?;
    }
    
    // Broadcast ACTIONS_SYNC to all connected companions
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn reorder_actions(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    ids: Vec<String>,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::reorder_actions(&conn, &ids)?;
    }
    
    // Broadcast ACTIONS_SYNC to all connected companions
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn get_layout(app_handle: AppHandle) -> Result<Vec<db::Page>, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::get_layout(&conn)
}

#[tauri::command]
fn add_page(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    name: String,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::add_page(&conn, &name)?;
        let _ = db::increment_layout_version(&conn);
    }
    ws_state.manager.broadcast_layout_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn delete_page(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    id: String,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::delete_page(&conn, &id)?;
        let _ = db::increment_layout_version(&conn);
    }
    ws_state.manager.broadcast_layout_sync(&app_handle);
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn add_category(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    page_id: String,
    name: String,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::add_category(&conn, &page_id, &name)?;
        let _ = db::increment_layout_version(&conn);
    }
    ws_state.manager.broadcast_layout_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn delete_category(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    id: String,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::delete_category(&conn, &id)?;
        let _ = db::increment_layout_version(&conn);
    }
    ws_state.manager.broadcast_layout_sync(&app_handle);
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn move_action(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    action_id: String,
    category_id: String,
    order_index: i32,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::move_action(&conn, &action_id, &category_id, order_index)?;
    }
    ws_state.manager.broadcast_actions_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn reorder_pages(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    ids: Vec<String>,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::reorder_pages(&conn, &ids)?;
        let _ = db::increment_layout_version(&conn);
    }
    ws_state.manager.broadcast_layout_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn reorder_categories(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
    ids: Vec<String>,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::reorder_categories(&conn, &ids)?;
        let _ = db::increment_layout_version(&conn);
    }
    ws_state.manager.broadcast_layout_sync(&app_handle);
    Ok(())
}

#[tauri::command]
fn test_action(app_handle: AppHandle, id: String) -> Result<(), String> {
    let action = {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::get_action_by_id(&conn, &id)?
    };
    
    let start_time = std::time::Instant::now();
    let exec_res = executor::execute_action(action.action_type, action.payload.as_deref());
    let duration_ms = start_time.elapsed().as_millis() as i64;
    
    // Log execution
    let db_state = app_handle.state::<db::DbState>();
    if let Ok(conn) = db_state.conn.lock() {
        let success = exec_res.is_ok();
        let message = exec_res.as_ref().err().map(|e| e.as_str());
        let _ = db::log_execution(&conn, &action.id, &action.name, success, message, duration_ms);
        
        if let Err(ref e) = exec_res {
            let _ = db::log_execution_error(
                &conn,
                "ERROR",
                "ACTION_EXECUTION",
                &format!("Failed to execute action '{}': {}", action.name, e),
                None,
            );
        }
    }
    
    exec_res
}

#[tauri::command]
fn get_clipboard_history(app_handle: AppHandle) -> Result<Vec<db::ClipboardEntry>, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::get_clipboard_history(&conn)
}

#[tauri::command]
fn delete_clipboard_entry(app_handle: AppHandle, id: String) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_clipboard_entry(&conn, &id)
}

#[tauri::command]
fn clear_clipboard_history(app_handle: AppHandle) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::clear_clipboard_history(&conn)
}

#[tauri::command]
fn set_clipboard_sync_enabled(app_handle: AppHandle, enabled: bool) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('clipboard_sync_enabled', ?1);",
        [if enabled { "true" } else { "false" }],
    ).map_err(|e| e.to_string())?;

    let clip_state = app_handle.state::<clipboard::ClipboardState>();
    *clip_state.enabled.lock().unwrap() = enabled;

    println!("[CLIPBOARD] Sync toggled: {}", if enabled { "ON" } else { "OFF" });
    Ok(())
}

#[tauri::command]
fn get_clipboard_sync_enabled(app_handle: AppHandle) -> Result<bool, String> {
    let clip_state = app_handle.state::<clipboard::ClipboardState>();
    let val = *clip_state.enabled.lock().unwrap();
    Ok(val)
}

#[tauri::command]
fn clipboard_write_text(text: String) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsInfo {
    desktop_id: String,
    database_status: String,
    database_size_bytes: u64,
    websocket_status: String,
    websocket_port: u16,
    websocket_client_count: usize,
    clipboard_status: String,
    clipboard_last_sync_time: Option<i64>,
    clipboard_last_hash: Option<String>,
    connected_devices: Vec<db::TrustedDevice>,
    app_version: String,
    protocol_version: String,
    layout_version: i32,
    telemetry_version: String,
}

#[tauri::command]
fn get_diagnostics(app_handle: AppHandle) -> Result<DiagnosticsInfo, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;

    let desktop_id = db::get_or_create_desktop_id(&conn).unwrap_or_else(|_| "Unknown".to_string());
    let db_path = db::get_db_path(&app_handle)?;
    let db_size = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    
    let ws_state = app_handle.state::<WsState>();
    let client_count = ws_state.manager.get_client_count();
    let ws_status = if client_count > 0 {
        format!("Active ({} connected)", client_count)
    } else {
        "Listening (Idle)".to_string()
    };

    let clip_state = app_handle.state::<clipboard::ClipboardState>();
    let clipboard_enabled = *clip_state.enabled.lock().unwrap();
    let clipboard_status = if clipboard_enabled {
        "Active".to_string()
    } else {
        "Disabled".to_string()
    };
    let clipboard_last_hash = clip_state.last_clipboard_hash.lock().unwrap().clone();
    let clipboard_last_sync_time = conn.query_row(
        "SELECT created_at FROM clipboard_history ORDER BY created_at DESC LIMIT 1;",
        [],
        |row| row.get::<_, i64>(0),
    ).ok();

    let connected_devices = db::get_trusted_devices(&conn).unwrap_or_default();
    let app_version = app_handle.package_info().version.to_string();
    let layout_version = db::get_layout_version(&conn);

    Ok(DiagnosticsInfo {
        desktop_id,
        database_status: "Healthy".to_string(),
        database_size_bytes: db_size,
        websocket_status: ws_status,
        websocket_port: 45667,
        websocket_client_count: client_count,
        clipboard_status,
        clipboard_last_sync_time,
        clipboard_last_hash,
        connected_devices,
        app_version,
        protocol_version: "v1".to_string(),
        layout_version,
        telemetry_version: "v1".to_string(),
    })
}

#[tauri::command]
fn get_execution_errors(app_handle: AppHandle) -> Result<Vec<db::ExecutionError>, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::get_execution_errors(&conn)
}

#[tauri::command]
fn clear_execution_errors(app_handle: AppHandle) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::clear_execution_errors(&conn)
}

#[tauri::command]
fn export_configuration(app_handle: AppHandle) -> Result<String, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::export_config(&conn)
}

#[tauri::command]
fn import_configuration(app_handle: AppHandle, json: String) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let mut conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    let db_path = db::get_db_path(&app_handle)?;
    db::import_config(&mut conn, &json, &db_path)
}

#[tauri::command]
fn reset_to_defaults(app_handle: AppHandle) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::reset_layout_to_defaults(&conn)
}

#[tauri::command]
fn factory_reset(
    app_handle: AppHandle,
    ws_state: tauri::State<'_, WsState>,
) -> Result<(), String> {
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::factory_reset(&conn)?;
    }
    
    // Broadcast FACTORY_RESET to all connected companions so they wipe their storage too
    let msg = serde_json::to_string(&websocket::WSMessageEnvelope {
        msg_type: "FACTORY_RESET".to_string(),
        payload: serde_json::json!({}),
        timestamp: websocket::get_current_epoch_ms(),
    }).unwrap_or_default();
    ws_state.manager.broadcast_message(&msg, &app_handle);
    
    Ok(())
}

#[tauri::command]
fn start_file_transfer(app_handle: AppHandle, file_path: String) -> Result<(), String> {
    file_transfer::start_file_transfer(&app_handle, &file_path)
}

#[tauri::command]
fn cancel_file_transfer(app_handle: AppHandle, transfer_id: String) -> Result<(), String> {
    file_transfer::cancel_active_transfer(&app_handle, &transfer_id)
}

#[tauri::command]
fn get_transfer_history(app_handle: AppHandle) -> Result<Vec<db::TransferRow>, String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::get_transfer_history(&conn)
}

#[tauri::command]
fn clear_transfer_history(app_handle: AppHandle) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
    db::clear_transfer_history(&conn)
}

#[tauri::command]
fn get_active_transfer(app_handle: AppHandle) -> Result<Option<file_transfer::ActiveTransferInfo>, String> {
    let manager = app_handle.state::<file_transfer::FileTransferManager>();
    let active = manager.active_transfer.lock().unwrap();
    if let Some(ref t) = *active {
        Ok(Some(file_transfer::ActiveTransferInfo {
            transfer_id: t.id.clone(),
            file_name: t.file_name.clone(),
            file_size: t.file_size,
            direction: t.direction.clone(),
            bytes_transferred: t.bytes_transferred,
            received_bytes: t.received_bytes,
            avg_speed: t.avg_speed,
            peak_speed: t.peak_speed,
            duration_ms: t.duration_ms,
            status: t.status.clone(),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn open_downloads_folder(app_handle: AppHandle) -> Result<(), String> {
    let dir = db::get_downloads_dir(&app_handle)?;
    tauri_plugin_opener::open_path(dir, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_containing_folder(app_handle: AppHandle, transfer_id: String) -> Result<(), String> {
    let db_state = app_handle.state::<db::DbState>();
    let conn = db_state.conn.lock().map_err(|e| format!("DB Lock error: {}", e))?;
    
    // Query file_name from transfer_history table
    let mut stmt = conn.prepare("SELECT file_name FROM transfer_history WHERE transfer_id = ?1 LIMIT 1;")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([&transfer_id]).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let file_name: String = row.get(0).map_err(|e| e.to_string())?;
        
        let mut file_path = db::get_downloads_dir(&app_handle)?;
        file_path.push(&file_name);
        
        if !file_path.exists() {
            return Err("File does not exist".to_string());
        }
        
        // Open parent folder
        if let Some(parent) = file_path.parent() {
            tauri_plugin_opener::open_path(parent.to_string_lossy().to_string(), None::<&str>)
                .map_err(|e| e.to_string())
        } else {
            Err("Parent folder not found".to_string())
        }
    } else {
        Err("Transfer record not found".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let manager = Arc::new(connection_manager::ConnectionManager::new());
    let manager_for_setup = manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle();
                let minimize_to_tray = {
                    if let Some(db_state) = app_handle.try_state::<db::DbState>() {
                        if let Ok(conn) = db_state.conn.lock() {
                            let stmt = conn.prepare("SELECT value FROM settings WHERE key = 'minimize_to_tray';").ok();
                            if let Some(mut stmt) = stmt {
                                let val: Option<String> = stmt.query_row([], |row| row.get(0)).ok();
                                val == Some("true".to_string())
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    } else {
                        false
                    }
                };

                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            // Initialize SQLite Database and inject state
            let conn = db::initialize_database(app.handle())?;

            // Auto-create Downloads/Flow Deck directory on startup if missing
            let _ = db::get_downloads_dir(app.handle());

            // Check and seed developer_mode setting if it doesn't exist
            {
                let dev_mode_exists = conn.prepare("SELECT 1 FROM settings WHERE key = 'developer_mode';")
                    .and_then(|mut stmt| stmt.exists([]))
                    .unwrap_or(false);
                if !dev_mode_exists {
                    let default_dev_mode = if cfg!(debug_assertions) { "true" } else { "false" };
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO settings (key, value) VALUES ('developer_mode', ?1);",
                        [default_dev_mode],
                    );
                }
            }

            // Check and seed is_first_run setting if it doesn't exist
            {
                let first_run_exists = conn.prepare("SELECT 1 FROM settings WHERE key = 'is_first_run';")
                    .and_then(|mut stmt| stmt.exists([]))
                    .unwrap_or(false);
                if !first_run_exists {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO settings (key, value) VALUES ('is_first_run', 'true');",
                        [],
                    );
                }
            }

            // Check and seed onboarding_version setting if it doesn't exist
            {
                let onboarding_version_exists = conn.prepare("SELECT 1 FROM settings WHERE key = 'onboarding_version';")
                    .and_then(|mut stmt| stmt.exists([]))
                    .unwrap_or(false);
                if !onboarding_version_exists {
                    // Check if they already dismissed first run
                    let is_first_run_val: String = conn.query_row(
                        "SELECT value FROM settings WHERE key = 'is_first_run';",
                        [],
                        |row| row.get(0),
                    ).unwrap_or_else(|_| "true".to_string());
                    
                    let initial_version = if is_first_run_val == "false" { "1" } else { "0" };
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarding_version', ?1);",
                        [initial_version],
                    );
                }
            }

            // Check and seed feedback_github_url setting if it doesn't exist
            {
                let exists = conn.prepare("SELECT 1 FROM settings WHERE key = 'feedback_github_url';")
                    .and_then(|mut stmt| stmt.exists([]))
                    .unwrap_or(false);
                if !exists {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO settings (key, value) VALUES ('feedback_github_url', '');",
                        [],
                    );
                }
            }

            // Check and seed feedback_email setting if it doesn't exist
            {
                let exists = conn.prepare("SELECT 1 FROM settings WHERE key = 'feedback_email';")
                    .and_then(|mut stmt| stmt.exists([]))
                    .unwrap_or(false);
                if !exists {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO settings (key, value) VALUES ('feedback_email', '');",
                        [],
                    );
                }
            }
            
            // Check allow_lan_connections setting
            let allow_lan = {
                let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'allow_lan_connections';")
                    .map_err(|e| e.to_string())?;
                let mut rows = stmt.query([])
                    .map_err(|e| e.to_string())?;
                if let Some(row) = rows.next().map_err(|e| e.to_string())? {
                    let val: String = row.get(0).map_err(|e| e.to_string())?;
                    val != "false"
                } else {
                    true
                }
            };

            // Check start_minimized setting
            let start_minimized = {
                let stmt = conn.prepare("SELECT value FROM settings WHERE key = 'start_minimized';").ok();
                if let Some(mut stmt) = stmt {
                    let val: Option<String> = stmt.query_row([], |row| row.get(0)).ok();
                    val == Some("true".to_string())
                } else {
                    false
                }
            };

            app.manage(clipboard::ClipboardState::new());

            app.manage(db::DbState {
                conn: Mutex::new(conn),
            });

            // Register WsState
            app.manage(WsState {
                manager: manager_for_setup.clone(),
            });

            // Register FileTransferManager state
            app.manage(file_transfer::FileTransferManager::new());

            // Register AppCatalog state
            app.manage(app_discovery::AppCatalog::new());

            // Start system telemetry monitoring loop
            monitor::start_monitoring(manager_for_setup.clone(), app.handle().clone());

            // Start clipboard sync monitoring loop
            clipboard::start_clipboard_monitor(manager_for_setup.clone(), app.handle().clone());

            // Spawn background task to scan installed apps on startup
            let app_handle_for_scan = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(catalog) = app_handle_for_scan.try_state::<app_discovery::AppCatalog>() {
                    let scanned = app_discovery::scan_installed_applications();
                    if let Ok(mut apps) = catalog.apps.lock() {
                        *apps = scanned;
                        println!("[CATALOG] Scanned applications catalog successfully.");
                    }
                }
            });

            // Spawn WebSocket Server (default loopback unless Allow LAN setting is active)
            let ws_host = if allow_lan { "0.0.0.0" } else { "127.0.0.1" };
            let ws_port = 45667;
            let ws_manager = manager_for_setup.clone();
            let ws_handle = app.handle().clone();
            
            tauri::async_runtime::spawn(async move {
                let ws_handle_clone = ws_handle.clone();
                if let Err(e) = websocket::start_websocket_server(ws_host, ws_port, ws_manager, ws_handle).await {
                    eprintln!("[SERVER] WebSocket server crash error: {}", e);
                    db::log_error_to_db(&ws_handle_clone, "CRITICAL", "WEBSOCKET_SERVER", &format!("WebSocket server crashed: {}", e));
                }
            });

            // Set up System Tray Menu
            let handle = app.handle();
            let open = MenuItem::with_id(handle, "open", "Open Dashboard", true, None::<&str>)?;
            let settings = MenuItem::with_id(handle, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(handle, "quit", "Exit", true, None::<&str>)?;
            
            let menu = Menu::with_items(handle, &[&open, &settings, &quit])?;
            
            let tray_icon = app.default_window_icon().cloned();
            
            let mut builder = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("navigate", "settings");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                });
                
            if let Some(icon) = tray_icon {
                builder = builder.icon(icon);
            }
            
            let _tray = builder.build(app)?;

            // If not starting minimized, show the window
            let main_window = app.get_webview_window("main");
            if let Some(window) = main_window {
                if !start_minimized {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info, 
            get_protocol_stats, 
            get_setting, 
            set_setting,
            generate_pairing_payload,
            get_trusted_devices,
            remove_trusted_device,
            get_actions,
            add_action,
            update_action,
            delete_action,
            reorder_actions,
            test_action,
            get_layout,
            add_page,
            delete_page,
            add_category,
            delete_category,
            move_action,
            reorder_pages,
            reorder_categories,
            get_clipboard_history,
            delete_clipboard_entry,
            clear_clipboard_history,
            set_clipboard_sync_enabled,
            get_clipboard_sync_enabled,
            clipboard_write_text,
            get_diagnostics,
            get_execution_errors,
            clear_execution_errors,
            export_configuration,
            import_configuration,
            reset_to_defaults,
            factory_reset,
            start_file_transfer,
            cancel_file_transfer,
            get_transfer_history,
            clear_transfer_history,
            get_active_transfer,
            open_downloads_folder,
            open_containing_folder,
            app_discovery::get_installed_applications,
            app_discovery::refresh_installed_applications,
            app_discovery::set_run_on_startup,
            url_metadata::fetch_url_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
