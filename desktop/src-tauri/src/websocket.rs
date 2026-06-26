use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{StreamExt, SinkExt};
use serde::{Serialize, Deserialize};
use tauri::{AppHandle, Manager};

use crate::connection_manager::ConnectionManager;
use crate::db;

pub fn get_current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WSMessageEnvelope {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub payload: serde_json::Value,
    pub timestamp: u64,
}

pub async fn start_websocket_server(
    host: &str,
    port: u16,
    manager: Arc<ConnectionManager>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let address = format!("{}:{}", host, port);
    let listener = TcpListener::bind(&address)
        .await
        .map_err(|e| format!("Failed to bind TCP listener: {}", e))?;

    println!("[SERVER] WebSocket server listening on {}", address);

    // Spawn Heartbeat loop (Desktop owns heartbeat, sends PING every 5s)
    let heartbeat_manager = manager.clone();
    let heartbeat_handle = app_handle.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            let count = heartbeat_manager.get_client_count();
            if count > 0 {
                println!("[HEARTBEAT] Sending PING to {} connected client(s)", count);
                let now_ms = get_current_epoch_ms();
                heartbeat_manager.set_last_ping_timestamp(now_ms);
                
                let envelope = WSMessageEnvelope {
                    msg_type: "PING".to_string(),
                    payload: serde_json::Value::Null,
                    timestamp: now_ms,
                };
                
                if let Ok(msg_str) = serde_json::to_string(&envelope) {
                    heartbeat_manager.broadcast_message(&msg_str, &heartbeat_handle);
                    heartbeat_manager.record_ping(&heartbeat_handle);
                }
            }
        }
    });

    // Accept loop
    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let manager = manager.clone();
                let app_handle = app_handle.clone();
                tokio::spawn(async move {
                    let app_handle_clone = app_handle.clone();
                    let addr_clone = addr.to_string();
                    if let Err(e) = handle_connection(stream, addr.to_string(), manager, app_handle).await {
                        eprintln!("[SERVER] Error handling connection from {}: {}", addr_clone, e);
                        db::log_error_to_db(&app_handle_clone, "WARN", "WEBSOCKET_CONNECTION", &format!("Error handling connection from {}: {}", addr_clone, e));
                    }
                });
            }
            Err(e) => {
                eprintln!("[SERVER] Accept failed: {}", e);
                db::log_error_to_db(&app_handle, "ERROR", "WEBSOCKET_ACCEPT", &format!("WebSocket accept failed: {}", e));
            }
        }
    }
}

pub async fn handle_connection(
    stream: TcpStream,
    addr: String,
    manager: Arc<ConnectionManager>,
    app_handle: AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("[CLIENT] New connection received from: {}", addr);

    // Perform WebSocket handshake
    let ws_stream = accept_async(stream).await?;
    println!("[CLIENT] WebSocket handshake succeeded for client: {}", addr);

    // Split stream into reader and writer halves
    let (mut ws_writer, mut ws_reader) = ws_stream.split();

    // We will wait for the PAIR_REQUEST message. We set a timeout of 5 seconds.
    let pair_request_future = ws_reader.next();
    let envelope_opt = match tokio::time::timeout(std::time::Duration::from_secs(5), pair_request_future).await {
        Ok(Some(Ok(msg))) => {
            if msg.is_text() {
                let text = msg.to_text().unwrap_or_default();
                serde_json::from_str::<WSMessageEnvelope>(text).ok()
            } else {
                None
            }
        }
        _ => None,
    };

    let envelope = match envelope_opt {
        Some(env) if env.msg_type == "PAIR_REQUEST" => env,
        _ => {
            println!("[CLIENT] Connection rejected for client {}: missing or invalid initial PAIR_REQUEST", addr);
            let _ = ws_writer.close().await;
            return Ok(());
        }
    };

    // Parse PAIR_REQUEST payload
    let payload = envelope.payload;
    let device_id = payload.get("deviceId").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let device_name = payload.get("deviceName").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let device_nickname = payload.get("deviceNickname").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let pairing_token = payload.get("pairingToken").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let unpair = payload.get("unpair").and_then(|v| v.as_bool()).unwrap_or(false);

    if device_id.is_empty() {
        println!("[CLIENT] Connection rejected: deviceId is missing");
        let _ = ws_writer.close().await;
        return Ok(());
    }

    if unpair {
        println!("[CLIENT] Received unpair request in handshake from device: {} ({})", device_name, device_id);
        {
            let db_state = app_handle.state::<db::DbState>();
            let lock_res = db_state.conn.lock();
            if let Ok(conn) = lock_res {
                let _ = db::remove_trusted_device(&conn, &device_id);
            }
        }
        let response_envelope = WSMessageEnvelope {
            msg_type: "PAIR_RESPONSE".to_string(),
            payload: serde_json::json!({
                "success": true
            }),
            timestamp: get_current_epoch_ms(),
        };
        if let Ok(res_str) = serde_json::to_string(&response_envelope) {
            let _ = ws_writer.send(Message::Text(res_str)).await;
        }
        let _ = ws_writer.close().await;
        return Ok(());
    }

    // Validate Device Trust using small, synchronous scopes to prevent holding MutexGuards across await points
    let is_trusted = {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| format!("DB Lock error: {}", e))?;
        let trusted = db::is_device_trusted(&conn, &device_id).unwrap_or(false);
        if trusted {
            let _ = db::update_device_last_active(&conn, &device_id);
            println!("[CLIENT] Trusted device reconnected: {} ({})", device_name, device_id);
        }
        trusted
    };

    if !is_trusted {
        // Device not trusted. Validate temporary pairing token.
        if pairing_token.is_empty() {
            println!("[CLIENT] Reconnect rejected: device_id {} is not trusted", device_id);
            let reject_envelope = WSMessageEnvelope {
                msg_type: "PAIR_RESPONSE".to_string(),
                payload: serde_json::json!({
                    "success": false,
                    "error": "Device is not paired or trusted"
                }),
                timestamp: get_current_epoch_ms(),
            };
            if let Ok(res_str) = serde_json::to_string(&reject_envelope) {
                let _ = ws_writer.send(Message::Text(res_str)).await;
            }
            let _ = ws_writer.close().await;
            return Ok(());
        }

        let is_pairing_valid = manager.validate_pairing_token(&pairing_token);
        if is_pairing_valid {
            // Save device in database. Nickname defaults to deviceName if nickname is empty
            let nickname = if device_nickname.is_empty() { &device_name } else { &device_nickname };
            
            let save_success = {
                let db_state = app_handle.state::<db::DbState>();
                let conn = db_state.conn.lock().map_err(|e| format!("DB Lock error: {}", e))?;
                db::add_trusted_device(&conn, &device_id, &device_name, nickname).is_ok()
            };

            if !save_success {
                eprintln!("[SERVER] Failed to save trusted device to DB");
                let _ = ws_writer.close().await;
                return Ok(());
            }

            println!("[CLIENT] Device successfully paired: {} ({})", nickname, device_id);

            // Destroy the pairing token in memory immediately!
            manager.destroy_pairing_token();
        } else {
            println!("[CLIENT] Pairing rejected: Invalid or expired pairing token");
            let reject_envelope = WSMessageEnvelope {
                msg_type: "PAIR_RESPONSE".to_string(),
                payload: serde_json::json!({
                    "success": false,
                    "error": "Invalid or expired pairing token"
                }),
                timestamp: get_current_epoch_ms(),
            };
            if let Ok(res_str) = serde_json::to_string(&reject_envelope) {
                let _ = ws_writer.send(Message::Text(res_str)).await;
            }
            let _ = ws_writer.close().await;
            return Ok(());
        }
    }

    // Handshake successful! Send PAIR_RESPONSE success
    let success_envelope = WSMessageEnvelope {
        msg_type: "PAIR_RESPONSE".to_string(),
        payload: serde_json::json!({
            "success": true
        }),
        timestamp: get_current_epoch_ms(),
    };
    if let Ok(res_str) = serde_json::to_string(&success_envelope) {
        let _ = ws_writer.send(Message::Text(res_str)).await;
    }

    // Now instantiate client worker channel and register with connection manager
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    manager.register_client(addr.clone(), device_id.clone(), tx, &app_handle);

    // Spawn the writer task
    let writer_addr = addr.clone();
    let writer_task = tokio::spawn(async move {
        while let Some(message) = rx.recv().await {
            if let Err(e) = ws_writer.send(message).await {
                eprintln!("[CLIENT] Write error to client {}: {}", writer_addr, e);
                break;
            }
        }
        println!("[CLIENT] Writer task finished for client: {}", writer_addr);
        let _ = ws_writer.close().await;
    });

    // Send SERVER_STATUS message as connection acknowledgment
    let db_state = app_handle.state::<db::DbState>();
    let (feedback_github_url, feedback_email) = {
        if let Ok(conn) = db_state.conn.lock() {
            let github: String = conn.query_row(
                "SELECT value FROM settings WHERE key = 'feedback_github_url';",
                [],
                |row| row.get(0),
            ).unwrap_or_default();
            let email: String = conn.query_row(
                "SELECT value FROM settings WHERE key = 'feedback_email';",
                [],
                |row| row.get(0),
            ).unwrap_or_default();
            (github, email)
        } else {
            ("".to_string(), "".to_string())
        }
    };

    let status_envelope = WSMessageEnvelope {
        msg_type: "SERVER_STATUS".to_string(),
        payload: serde_json::json!({
            "protocolVersion": 1,
            "connected": true,
            "status": "active",
            "clientsCount": manager.get_client_count(),
            "feedbackGithubUrl": feedback_github_url,
            "feedbackEmail": feedback_email,
        }),
        timestamp: get_current_epoch_ms(),
    };
    if let Ok(status_str) = serde_json::to_string(&status_envelope) {
        manager.send_to_client(&addr, &status_str, &app_handle);
    }

    // Send initial actions configuration synchronization packet
    manager.send_actions_sync(&addr, &app_handle);
    // Send initial layout configuration synchronization packet
    manager.send_layout_sync(&addr, &app_handle);
    // Send initial system telemetry stats packet if cached
    manager.send_cached_system_stats(&addr, &app_handle);

    // Normal client read loop (PONG, heartbeat, disconnect threshold)
    let loop_device_id = device_id.clone();
    let loop_app_handle = app_handle.clone();
    loop {
        let read_future = ws_reader.next();
        match tokio::time::timeout(std::time::Duration::from_secs(15), read_future).await {
            Ok(Some(result)) => {
                match result {
                    Ok(msg) => {
                        if msg.is_text() {
                            let text = msg.to_text().unwrap_or_default();
                            manager.increment_received(&app_handle);

                            // Decode message envelope
                            match serde_json::from_str::<WSMessageEnvelope>(text) {
                                Ok(envelope) => {
                                    println!("[WS] Received message type: {} from {}", envelope.msg_type, addr);
                                    match envelope.msg_type.as_str() {
                                        "PONG" => {
                                            println!("[HEARTBEAT] Received PONG from client {}", addr);
                                            manager.record_pong(&app_handle);
                                            
                                            let last_ping = manager.get_last_ping_timestamp();
                                            if last_ping > 0 {
                                                let now = get_current_epoch_ms();
                                                let latency = now.saturating_sub(last_ping) as u32;
                                                manager.set_latency_ms(latency);
                                                println!("[HEARTBEAT] Computed latency: {} ms", latency);
                                            }
                                            
                                            // Scoped lock update for last active
                                            if let Ok(db_state) = loop_app_handle.state::<db::DbState>().conn.lock() {
                                                let _ = db::update_device_last_active(&db_state, &loop_device_id);
                                            }
                                        }
                                        "PAIR_REQUEST" => {
                                            let unpair = envelope.payload.get("unpair").and_then(|v| v.as_bool()).unwrap_or(false);
                                            if unpair {
                                                println!("[CLIENT] Received unpair request from active client: {}", addr);
                                                {
                                                    let db_state = loop_app_handle.state::<db::DbState>();
                                                    let lock_res = db_state.conn.lock();
                                                    if let Ok(conn) = lock_res {
                                                        let _ = db::remove_trusted_device(&conn, &loop_device_id);
                                                    }
                                                }
                                                break;
                                            }
                                        }
                                        "EXECUTE_ACTION" => {
                                            let action_id = envelope.payload.get("actionId").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                                            if !action_id.is_empty() {
                                                println!("[WS] Executing action ID: {}", action_id);
                                                
                                                // 1. Look up action from SQLite database
                                                let action_opt = {
                                                    let db_state = loop_app_handle.state::<db::DbState>();
                                                    let lock_res = db_state.conn.lock();
                                                    if let Ok(conn) = lock_res {
                                                        db::get_action_by_id(&conn, &action_id).ok()
                                                    } else {
                                                        None
                                                    }
                                                };
                                                
                                                let start_time = std::time::Instant::now();
                                                let response_payload = match action_opt {
                                                    Some(action) => {
                                                        // 2. Execute via the whitelist system executor
                                                        let exec_res = crate::executor::execute_action(action.action_type, action.payload.as_deref());
                                                        let duration_ms = start_time.elapsed().as_millis() as i64;
                                                        
                                                        // Log execution
                                                        let db_state = loop_app_handle.state::<db::DbState>();
                                                        if let Ok(conn) = db_state.conn.lock() {
                                                            let success = exec_res.is_ok();
                                                            let message = exec_res.as_ref().err().map(|e| e.as_str());
                                                            let _ = db::log_execution(&conn, &action.id, &action.name, success, message, duration_ms);
                                                        }
                                                        
                                                        match exec_res {
                                                            Ok(_) => {
                                                                serde_json::json!({
                                                                    "success": true,
                                                                    "message": "Action executed successfully"
                                                                })
                                                            }
                                                            Err(e) => {
                                                                // Log to execution_errors table
                                                                let db_state = loop_app_handle.state::<db::DbState>();
                                                                if let Ok(conn) = db_state.conn.lock() {
                                                                    let _ = db::log_execution_error(
                                                                        &conn,
                                                                        "ERROR",
                                                                        "ACTION_EXECUTION",
                                                                        &format!("Failed to execute action '{}': {}", action.name, e),
                                                                        None,
                                                                    );
                                                                }
                                                                serde_json::json!({
                                                                    "success": false,
                                                                    "message": e
                                                                })
                                                            }
                                                        }
                                                    }
                                                    None => {
                                                        serde_json::json!({
                                                            "success": false,
                                                            "message": "Action not found"
                                                        })
                                                    }
                                                };
                                                
                                                // 3. Dispatch ACTION_STATUS envelope
                                                let status_envelope = WSMessageEnvelope {
                                                    msg_type: "ACTION_STATUS".to_string(),
                                                    payload: response_payload,
                                                    timestamp: get_current_epoch_ms(),
                                                };
                                                
                                                if let Ok(status_str) = serde_json::to_string(&status_envelope) {
                                                    manager.send_to_client(&addr, &status_str, &loop_app_handle);
                                                }
                                            }
                                        }
                                        "OPEN_TASK_MANAGER" => {
                                            println!("[WS] Received OPEN_TASK_MANAGER from {}", addr);
                                            let _ = std::process::Command::new("taskmgr.exe").spawn();
                                        }
                                        "CLIPBOARD_SYNC" => {
                                            println!("[WS] Received CLIPBOARD_SYNC from {}", addr);
                                            crate::clipboard::handle_incoming_clipboard_sync(
                                                &envelope.payload,
                                                &loop_app_handle,
                                            );
                                        }
                                        "FILE_TRANSFER_REQUEST" => {
                                            println!("[WS] Received FILE_TRANSFER_REQUEST from {}", addr);
                                            if let Err(e) = crate::file_transfer::handle_incoming_request(&loop_app_handle, &envelope.payload) {
                                                eprintln!("[FILE_TRANSFER] Request handling error: {}", e);
                                            }
                                        }
                                        "FILE_TRANSFER_ACCEPT" => {
                                            println!("[WS] Received FILE_TRANSFER_ACCEPT from {}", addr);
                                            let transfer_id = envelope.payload.get("transferId").and_then(|v| v.as_str()).unwrap_or_default();
                                            if let Err(e) = crate::file_transfer::handle_accept_received(&loop_app_handle, transfer_id) {
                                                eprintln!("[FILE_TRANSFER] Accept handling error: {}", e);
                                            }
                                        }
                                        "FILE_TRANSFER_REJECT" => {
                                            println!("[WS] Received FILE_TRANSFER_REJECT from {}", addr);
                                            let transfer_id = envelope.payload.get("transferId").and_then(|v| v.as_str()).unwrap_or_default();
                                            if let Err(e) = crate::file_transfer::handle_reject_received(&loop_app_handle, transfer_id) {
                                                eprintln!("[FILE_TRANSFER] Reject handling error: {}", e);
                                            }
                                        }
                                        "FILE_TRANSFER_CANCEL" => {
                                            println!("[WS] Received FILE_TRANSFER_CANCEL from {}", addr);
                                            let transfer_id = envelope.payload.get("transferId").and_then(|v| v.as_str()).unwrap_or_default();
                                            if let Err(e) = crate::file_transfer::handle_cancel_received(&loop_app_handle, transfer_id) {
                                                eprintln!("[FILE_TRANSFER] Cancel handling error: {}", e);
                                            }
                                        }
                                        _ => {
                                            println!("[WS] Warning: Unrecognized protocol message type: {}", envelope.msg_type);
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[WS] Failed to parse message envelope from client {}: {}. Raw text: {}", addr, e, text);
                                }
                            }
                        } else if msg.is_close() {
                            println!("[CLIENT] Client {} sent close frame", addr);
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("[CLIENT] Read error from client {}: {}", addr, e);
                        break;
                    }
                }
            }
            Ok(None) => {
                break;
            }
            Err(_) => {
                println!("[CLIENT] Connection timeout for client {} (no activity for 15s)", addr);
                break;
            }
        }
    }

    // Client disconnected
    println!("[CLIENT] Client disconnected: {}", addr);
    crate::file_transfer::handle_client_disconnect(&app_handle, &loop_device_id);
    manager.deregister_client(&addr, &app_handle);
    writer_task.abort();

    Ok(())
}
