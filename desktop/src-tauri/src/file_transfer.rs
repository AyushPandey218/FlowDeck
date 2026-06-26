use std::fs::File;
use std::io::Read;
use std::net::{TcpListener, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::oneshot;
use tauri::{AppHandle, Manager, Emitter};
use sha2::{Sha256, Digest};
use serde::Serialize;

use crate::db;
use crate::websocket::WSMessageEnvelope;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTransferInfo {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub direction: String,
    pub bytes_transferred: u64,
    pub received_bytes: u64,
    pub avg_speed: f64,
    pub peak_speed: f64,
    pub duration_ms: u64,
    pub status: String,
}

pub struct ActiveTransfer {
    pub id: String,
    pub file_name: String,
    pub file_size: u64,
    pub direction: String,
    pub bytes_transferred: u64,
    pub received_bytes: u64,
    pub file_path: PathBuf,
    pub file_hash: String,
    pub transfer_token: String,
    pub avg_speed: f64,
    pub peak_speed: f64,
    pub duration_ms: u64,
    pub status: String,
    pub cancel_tx: Option<oneshot::Sender<()>>,
}

pub struct FileTransferManager {
    pub active_transfer: Mutex<Option<ActiveTransfer>>,
}

impl FileTransferManager {
    pub fn new() -> Self {
        Self {
            active_transfer: Mutex::new(None),
        }
    }
}

fn get_active_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip().to_string())
}

fn compute_sha256(file_path: &Path) -> Result<String, String> {
    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 32768]; // 32 KB
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn get_current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

// Control message dispatcher helper
fn send_ws_control_message(app_handle: &AppHandle, msg_type: &str, payload: serde_json::Value) {
    if let Some(ws_state) = app_handle.try_state::<crate::WsState>() {
        let envelope = WSMessageEnvelope {
            msg_type: msg_type.to_string(),
            payload,
            timestamp: get_current_epoch_ms(),
        };
        if let Ok(msg_str) = serde_json::to_string(&envelope) {
            ws_state.manager.broadcast_message(&msg_str, app_handle);
        }
    }
}

pub fn start_file_transfer(app_handle: &AppHandle, file_path_str: &str) -> Result<(), String> {
    let file_path = PathBuf::from(file_path_str);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }

    let file_size = std::fs::metadata(&file_path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())?;

    // Rule: Reject > 100 MB
    if file_size > 100 * 1024 * 1024 {
        return Err("File exceeds size limit of 100 MB".to_string());
    }

    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();
    if active.is_some() {
        return Err("Another transfer is already active.".to_string());
    }

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string();

    // 1. Calculate SHA-256 before starting
    let file_hash = compute_sha256(&file_path)?;
    let transfer_id = uuid::Uuid::new_v4().to_string();
    let transfer_token = uuid::Uuid::new_v4().to_string();

    // Log to DB as pending
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::log_transfer(
            &conn,
            db::TransferLogParam {
                transfer_id: &transfer_id,
                file_name: &file_name,
                direction: "desktop_to_mobile",
                file_size: file_size as i64,
                file_hash: Some(&file_hash),
                integrity_verified: false,
                status: "pending",
                avg_speed: None,
                peak_speed: None,
                duration_ms: None,
            },
        )?;
    }

    *active = Some(ActiveTransfer {
        id: transfer_id.clone(),
        file_name: file_name.clone(),
        file_size,
        direction: "desktop_to_mobile".to_string(),
        bytes_transferred: 0,
        received_bytes: 0,
        file_path: file_path.clone(),
        file_hash: file_hash.clone(),
        transfer_token: transfer_token.clone(),
        avg_speed: 0.0,
        peak_speed: 0.0,
        duration_ms: 0,
        status: "pending".to_string(),
        cancel_tx: None,
    });

    // Notify control channel
    send_ws_control_message(app_handle, "FILE_TRANSFER_REQUEST", serde_json::json!({
        "transferId": transfer_id,
        "fileName": file_name,
        "fileSize": file_size,
        "mimeType": "application/octet-stream",
        "fileHash": file_hash,
        "direction": "desktop_to_mobile",
        "transferToken": transfer_token
    }));

    let _ = app_handle.emit("file-transfer-updated", ());

    Ok(())
}

pub fn handle_accept_received(app_handle: &AppHandle, transfer_id: &str) -> Result<(), String> {
    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();

    let transfer = match active.as_mut() {
        Some(t) if t.id == transfer_id => t,
        _ => return Err("No matching transfer found".to_string()),
    };

    if transfer.direction != "desktop_to_mobile" {
        return Err("Direction mismatch".to_string());
    }

    let host_ip = get_active_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    
    // Bind temporary TCP server on the resolved LAN IP
    let listener = TcpListener::bind(format!("{}:0", host_ip))
        .map_err(|e| format!("Failed to bind TCP transfer socket: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    transfer.status = "transferring".to_string();

    // Log to DB
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        let _ = db::log_transfer(
            &conn,
            db::TransferLogParam {
                transfer_id: &transfer.id,
                file_name: &transfer.file_name,
                direction: &transfer.direction,
                file_size: transfer.file_size as i64,
                file_hash: Some(&transfer.file_hash),
                integrity_verified: false,
                status: "transferring",
                avg_speed: None,
                peak_speed: None,
                duration_ms: None,
            },
        );
    }

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    transfer.cancel_tx = Some(cancel_tx);

    let transfer_id_clone = transfer.id.clone();
    let transfer_token_clone = transfer.transfer_token.clone();
    let file_path_clone = transfer.file_path.clone();
    let file_size = transfer.file_size;
    let app_handle_clone = app_handle.clone();

    // Spawn server stream
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        
        let socket_future = listener.accept();
        tokio::select! {
            _ = &mut cancel_rx => {
                println!("[TRANSFER_SERVER] Cancelled before mobile connection");
            }
            res = socket_future => {
                if let Ok((mut socket, _addr)) = res {
                    let mut headers_buf = Vec::new();
                    let mut chunk = [0u8; 1024];
                    let mut validated = false;
                    
                    // 1. Read HTTP headers
                    loop {
                        tokio::select! {
                            _ = &mut cancel_rx => break,
                            read_res = socket.read(&mut chunk) => {
                                match read_res {
                                    Ok(0) | Err(_) => break,
                                    Ok(n) => {
                                        headers_buf.extend_from_slice(&chunk[..n]);
                                        if find_subsequence(&headers_buf, b"\r\n\r\n").is_some() {
                                            validated = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !validated {
                        let _ = socket.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n").await;
                        return;
                    }

                    let headers_str = String::from_utf8_lossy(&headers_buf);
                    
                    // Verify Path and X-Transfer-Token
                    let has_valid_path = headers_str.contains(&transfer_id_clone);
                    let mut has_valid_token = false;
                    for line in headers_str.lines() {
                        if line.to_lowercase().starts_with("x-transfer-token:") {
                            let parts: Vec<&str> = line.splitn(2, ':').collect();
                            if parts.len() == 2 && parts[1].trim() == transfer_token_clone {
                                has_valid_token = true;
                                break;
                            }
                        }
                    }

                    if !has_valid_path || !has_valid_token {
                        println!("[TRANSFER_SERVER] Forbidden client attempt: path={} token={}", has_valid_path, has_valid_token);
                        let _ = socket.write_all(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n").await;
                        return;
                    }

                    // 2. Start HTTP GET stream response
                    let response_header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
                        file_size
                    );
                    if socket.write_all(response_header.as_bytes()).await.is_err() {
                        return;
                    }

                    // Stream file in 32 KB blocks asynchronously
                    let mut file = match tokio::fs::File::open(&file_path_clone).await {
                        Ok(f) => f,
                        Err(e) => {
                            eprintln!("Failed to open file for streaming: {}", e);
                            return;
                        }
                    };

                    let mut buffer = [0u8; 32768]; // 32 KB
                    let mut bytes_sent = 0;
                    let start_time = Instant::now();
                    let mut last_check = Instant::now();
                    let mut last_bytes = 0;
                    let mut peak_speed = 0.0;

                    loop {
                        tokio::select! {
                            _ = &mut cancel_rx => {
                                break;
                            }
                            read_res = file.read(&mut buffer) => {
                                let n = match read_res {
                                    Ok(0) => break,
                                    Ok(num) => num,
                                    Err(_) => break,
                                };

                                if socket.write_all(&buffer[..n]).await.is_err() {
                                    break;
                                }

                                bytes_sent += n as u64;

                                // Compute speed and remaining time every 500ms
                                let elapsed_ms = start_time.elapsed().as_millis() as u64;
                                let duration_sec = elapsed_ms as f64 / 1000.0;
                                let avg_speed = if duration_sec > 0.0 {
                                    (bytes_sent as f64 / duration_sec) / (1024.0 * 1024.0)
                                } else {
                                    0.0
                                };

                                if last_check.elapsed() >= Duration::from_millis(500) {
                                    let delta_bytes = bytes_sent - last_bytes;
                                    let delta_sec = last_check.elapsed().as_secs_f64();
                                    let current_speed = if delta_sec > 0.0 {
                                        (delta_bytes as f64 / delta_sec) / (1024.0 * 1024.0)
                                    } else {
                                        0.0
                                    };
                                    peak_speed = f64::max(peak_speed, current_speed);

                                    last_bytes = bytes_sent;
                                    last_check = Instant::now();
                                }

                                let percentage = ((bytes_sent as f64 / file_size as f64) * 100.0) as u32;

                                // Update state
                                {
                                    let manager_inner = app_handle_clone.state::<FileTransferManager>();
                                    let mut active_inner = manager_inner.active_transfer.lock().unwrap();
                                    if let Some(ref mut t) = *active_inner {
                                        t.bytes_transferred = bytes_sent;
                                        t.avg_speed = avg_speed;
                                        t.peak_speed = peak_speed;
                                        t.duration_ms = elapsed_ms;
                                    }
                                }

                                // Send WebSocket progress updates
                                send_ws_control_message(&app_handle_clone, "FILE_TRANSFER_PROGRESS", serde_json::json!({
                                    "transferId": transfer_id_clone,
                                    "bytesTransferred": bytes_sent,
                                    "totalBytes": file_size,
                                    "percentage": percentage
                                }));

                                let _ = app_handle_clone.emit("file-transfer-updated", ());
                            }
                        }
                    }

                    let final_duration_ms = start_time.elapsed().as_millis() as u64;
                    let final_avg_speed = if final_duration_ms > 0 {
                        (bytes_sent as f64 / (final_duration_ms as f64 / 1000.0)) / (1024.0 * 1024.0)
                    } else {
                        0.0
                    };

                    let db_state = app_handle_clone.state::<db::DbState>();
                    let conn = db_state.conn.lock().unwrap();

                    if bytes_sent == file_size {
                        println!("[TRANSFER_SERVER] File stream completed successfully!");
                        let _ = db::log_transfer(
                            &conn,
                            db::TransferLogParam {
                                transfer_id: &transfer_id_clone,
                                file_name: &transfer_id_clone,
                                direction: "desktop_to_mobile",
                                file_size: file_size as i64,
                                file_hash: None,
                                integrity_verified: true,
                                status: "completed",
                                avg_speed: Some(final_avg_speed),
                                peak_speed: Some(peak_speed),
                                duration_ms: Some(final_duration_ms as i64),
                            },
                        );
                        
                        send_ws_control_message(&app_handle_clone, "FILE_TRANSFER_COMPLETE", serde_json::json!({
                            "transferId": transfer_id_clone
                        }));

                        let manager = app_handle_clone.state::<FileTransferManager>();
                        let mut active_inner = manager.active_transfer.lock().unwrap();
                        *active_inner = None;
                    } else {
                        println!("[TRANSFER_SERVER] Stream closed prematurely. Sent {} / {} bytes", bytes_sent, file_size);
                        let _ = db::log_transfer(
                            &conn,
                            db::TransferLogParam {
                                transfer_id: &transfer_id_clone,
                                file_name: &transfer_id_clone,
                                direction: "desktop_to_mobile",
                                file_size: file_size as i64,
                                file_hash: None,
                                integrity_verified: false,
                                status: "failed",
                                avg_speed: Some(final_avg_speed),
                                peak_speed: Some(peak_speed),
                                duration_ms: Some(final_duration_ms as i64),
                            },
                        );
                        
                        let manager = app_handle_clone.state::<FileTransferManager>();
                        let mut active_inner = manager.active_transfer.lock().unwrap();
                        *active_inner = None;
                    }
                    let _ = app_handle_clone.emit("file-transfer-updated", ());
                }
            }
        }
    });

    // Share ACCEPT status with Mobile, supplying server bound IP, Port and Token
    send_ws_control_message(app_handle, "FILE_TRANSFER_ACCEPT", serde_json::json!({
        "transferId": transfer.id,
        "port": port,
        "hostIp": host_ip,
        "transferToken": transfer.transfer_token
    }));

    let _ = app_handle.emit("file-transfer-updated", ());

    Ok(())
}

pub fn handle_incoming_request(app_handle: &AppHandle, request: &serde_json::Value) -> Result<(), String> {
    let transfer_id = request.get("transferId").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let file_name = request.get("fileName").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let file_size = request.get("fileSize").and_then(|v| v.as_u64()).unwrap_or_default();
    let file_hash = request.get("fileHash").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let _direction = request.get("direction").and_then(|v| v.as_str()).unwrap_or_default().to_string();

    if transfer_id.is_empty() || file_name.is_empty() || file_size == 0 || file_hash.is_empty() {
        return Err("Malformed transfer request".to_string());
    }

    // Limit check
    if file_size > 100 * 1024 * 1024 {
        send_ws_control_message(app_handle, "FILE_TRANSFER_REJECT", serde_json::json!({
            "transferId": transfer_id,
            "reason": "File exceeds size limit of 100 MB"
        }));
        return Ok(());
    }

    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();
    if active.is_some() {
        send_ws_control_message(app_handle, "FILE_TRANSFER_REJECT", serde_json::json!({
            "transferId": transfer_id,
            "reason": "Another transfer is already active."
        }));
        return Ok(());
    }

    let downloads_dir = db::get_downloads_dir(app_handle)?;
    let temp_file_path = downloads_dir.join(format!("flowdeck_trans_{}.tmp", transfer_id));
    let transfer_token = uuid::Uuid::new_v4().to_string();

    // Log to DB
    {
        let db_state = app_handle.state::<db::DbState>();
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        db::log_transfer(
            &conn,
            db::TransferLogParam {
                transfer_id: &transfer_id,
                file_name: &file_name,
                direction: "mobile_to_desktop",
                file_size: file_size as i64,
                file_hash: Some(&file_hash),
                integrity_verified: false,
                status: "pending",
                avg_speed: None,
                peak_speed: None,
                duration_ms: None,
            },
        )?;
    }

    *active = Some(ActiveTransfer {
        id: transfer_id.clone(),
        file_name: file_name.clone(),
        file_size,
        direction: "mobile_to_desktop".to_string(),
        bytes_transferred: 0,
        received_bytes: 0,
        file_path: temp_file_path.clone(),
        file_hash: file_hash.clone(),
        transfer_token: transfer_token.clone(),
        avg_speed: 0.0,
        peak_speed: 0.0,
        duration_ms: 0,
        status: "pending".to_string(),
        cancel_tx: None,
    });

    let host_ip = get_active_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    
    // Bind temporary TCP server to receive data (POST) bound to active LAN IP
    let listener = TcpListener::bind(format!("{}:0", host_ip))
        .map_err(|e| format!("Failed to bind TCP server for receiving: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    if let Some(ref mut t) = *active {
        t.status = "transferring".to_string();
    }

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    if let Some(ref mut t) = *active {
        t.cancel_tx = Some(cancel_tx);
    }

    let transfer_id_clone = transfer_id.clone();
    let transfer_token_clone = transfer_token.clone();
    let temp_file_path_clone = temp_file_path.clone();
    let file_name_clone = file_name.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn upload stream server
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::from_std(listener).unwrap();
        
        let socket_future = listener.accept();
        tokio::select! {
            _ = &mut cancel_rx => {
                println!("[RECEIVE_SERVER] Cancelled before connection");
                let _ = std::fs::remove_file(&temp_file_path_clone);
            }
            res = socket_future => {
                if let Ok((mut socket, _addr)) = res {
                    let mut headers_buf = Vec::new();
                    let mut chunk = [0u8; 1024];
                    let mut validated = false;
                    
                    // 1. Read HTTP headers
                    loop {
                        tokio::select! {
                            _ = &mut cancel_rx => break,
                            read_res = socket.read(&mut chunk) => {
                                match read_res {
                                    Ok(0) | Err(_) => break,
                                    Ok(n) => {
                                        headers_buf.extend_from_slice(&chunk[..n]);
                                        if find_subsequence(&headers_buf, b"\r\n\r\n").is_some() {
                                            validated = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !validated {
                        let _ = socket.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n").await;
                        let _ = std::fs::remove_file(&temp_file_path_clone);
                        return;
                    }

                    let headers_str = String::from_utf8_lossy(&headers_buf);
                    
                    // Verify Path and X-Transfer-Token
                    let has_valid_path = headers_str.contains(&transfer_id_clone);
                    let mut has_valid_token = false;
                    for line in headers_str.lines() {
                        if line.to_lowercase().starts_with("x-transfer-token:") {
                            let parts: Vec<&str> = line.splitn(2, ':').collect();
                            if parts.len() == 2 && parts[1].trim() == transfer_token_clone {
                                has_valid_token = true;
                                break;
                            }
                        }
                    }

                    if !has_valid_path || !has_valid_token {
                        println!("[RECEIVE_SERVER] Forbidden connection attempt!");
                        let _ = socket.write_all(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n").await;
                        let _ = std::fs::remove_file(&temp_file_path_clone);
                        return;
                    }

                    // Open file for writing asynchronously
                    let mut file = match tokio::fs::OpenOptions::new()
                        .write(true)
                        .create(true)
                        .truncate(true)
                        .open(&temp_file_path_clone)
                        .await
                    {
                        Ok(f) => f,
                        Err(e) => {
                            eprintln!("Failed to create temp file: {}", e);
                            let _ = std::fs::remove_file(&temp_file_path_clone);
                            return;
                        }
                    };

                    // Extract body start
                    let headers_end = headers_str.find("\r\n\r\n").unwrap_or(headers_buf.len());
                    let body_start = headers_end + 4;
                    let initial_body = &headers_buf[body_start..];
                    
                    let mut bytes_written = 0;
                    let mut hasher = Sha256::new();

                    if !initial_body.is_empty() && file.write_all(initial_body).await.is_ok() {
                        bytes_written += initial_body.len() as u64;
                        hasher.update(initial_body);
                    }

                    let start_time = Instant::now();
                    let mut last_check = Instant::now();
                    let mut last_bytes = bytes_written;
                    let mut peak_speed = 0.0;
                    let mut socket_buf = [0u8; 32768]; // 32 KB chunk size

                    loop {
                        if bytes_written >= file_size {
                            break;
                        }
                        tokio::select! {
                            _ = &mut cancel_rx => {
                                break;
                            }
                            read_res = socket.read(&mut socket_buf) => {
                                let n = match read_res {
                                    Ok(0) => break,
                                    Ok(num) => num,
                                    Err(_) => break,
                                };

                                if file.write_all(&socket_buf[..n]).await.is_err() {
                                    break;
                                }

                                bytes_written += n as u64;
                                hasher.update(&socket_buf[..n]);

                                // Calculate speed and ETA
                                let elapsed_ms = start_time.elapsed().as_millis() as u64;
                                let duration_sec = elapsed_ms as f64 / 1000.0;
                                let avg_speed = if duration_sec > 0.0 {
                                    (bytes_written as f64 / duration_sec) / (1024.0 * 1024.0)
                                } else {
                                    0.0
                                };

                                if last_check.elapsed() >= Duration::from_millis(500) {
                                    let delta_bytes = bytes_written - last_bytes;
                                    let delta_sec = last_check.elapsed().as_secs_f64();
                                    let current_speed = if delta_sec > 0.0 {
                                        (delta_bytes as f64 / delta_sec) / (1024.0 * 1024.0)
                                    } else {
                                        0.0
                                    };
                                    peak_speed = f64::max(peak_speed, current_speed);

                                    last_bytes = bytes_written;
                                    last_check = Instant::now();
                                }

                                let percentage = ((bytes_written as f64 / file_size as f64) * 100.0) as u32;

                                // Update state
                                {
                                    let manager_inner = app_handle_clone.state::<FileTransferManager>();
                                    let mut active_inner = manager_inner.active_transfer.lock().unwrap();
                                    if let Some(ref mut t) = *active_inner {
                                        t.bytes_transferred = bytes_written;
                                        t.avg_speed = avg_speed;
                                        t.peak_speed = peak_speed;
                                        t.duration_ms = elapsed_ms;
                                    }
                                }

                                // Send WebSocket progress update
                                send_ws_control_message(&app_handle_clone, "FILE_TRANSFER_PROGRESS", serde_json::json!({
                                    "transferId": transfer_id_clone,
                                    "bytesTransferred": bytes_written,
                                    "totalBytes": file_size,
                                    "percentage": percentage
                                }));

                                let _ = app_handle_clone.emit("file-transfer-updated", ());

                                if bytes_written >= file_size {
                                    break;
                                }
                            }
                        }
                    }

                    let final_duration_ms = start_time.elapsed().as_millis() as u64;
                    let final_avg_speed = if final_duration_ms > 0 {
                        (bytes_written as f64 / (final_duration_ms as f64 / 1000.0)) / (1024.0 * 1024.0)
                    } else {
                        0.0
                    };

                    let hash_result = format!("{:x}", hasher.finalize());
                    
                    // Retrieve expected file hash
                    let expected_hash = {
                        let manager = app_handle_clone.state::<FileTransferManager>();
                        let active_inner = manager.active_transfer.lock().unwrap();
                        active_inner.as_ref().map(|t| t.file_hash.clone()).unwrap_or_default()
                    };

                    let success = if bytes_written == file_size && hash_result == expected_hash {
                        // Rename temp file to final location
                        let final_dest = temp_file_path_clone.parent().unwrap().join(&file_name_clone);
                        if std::fs::rename(&temp_file_path_clone, &final_dest).is_ok() {
                            println!("[RECEIVE_SERVER] File written and verified successfully!");
                            true
                        } else {
                            let _ = std::fs::remove_file(&temp_file_path_clone);
                            false
                        }
                    } else {
                        let _ = std::fs::remove_file(&temp_file_path_clone);
                        false
                    };

                    // Log transfer within its own block to drop database lock before socket .await write
                    {
                        let db_state = app_handle_clone.state::<db::DbState>();
                        let conn = db_state.conn.lock().unwrap();
                        let status = if success { "completed" } else { "failed" };
                        let _ = db::log_transfer(
                            &conn,
                            db::TransferLogParam {
                                transfer_id: &transfer_id_clone,
                                file_name: &file_name_clone,
                                direction: "mobile_to_desktop",
                                file_size: file_size as i64,
                                file_hash: Some(&hash_result),
                                integrity_verified: success,
                                status,
                                avg_speed: Some(final_avg_speed),
                                peak_speed: Some(peak_speed),
                                duration_ms: Some(final_duration_ms as i64),
                            },
                        );
                    }

                    if success {
                        let _ = socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"success\":true}").await;
                    } else {
                        let _ = socket.write_all(b"HTTP/1.1 400 Integrity Check Failed\r\nConnection: close\r\n\r\n").await;
                    }

                    // Clear active transfer
                    {
                        let manager = app_handle_clone.state::<FileTransferManager>();
                        let mut active_inner = manager.active_transfer.lock().unwrap();
                        *active_inner = None;
                    }
                    let _ = app_handle_clone.emit("file-transfer-updated", ());
                }
            }
        }
    });

    // Send FILE_TRANSFER_ACCEPT back via WS control
    send_ws_control_message(app_handle, "FILE_TRANSFER_ACCEPT", serde_json::json!({
        "transferId": transfer_id,
        "port": port,
        "hostIp": host_ip,
        "transferToken": transfer_token
    }));

    let _ = app_handle.emit("file-transfer-updated", ());

    Ok(())
}

pub fn handle_reject_received(app_handle: &AppHandle, transfer_id: &str) -> Result<(), String> {
    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();

    if let Some(ref t) = *active {
        if t.id == transfer_id {
            // Log to DB
            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            let _ = db::log_transfer(
                &conn,
                db::TransferLogParam {
                    transfer_id: &t.id,
                    file_name: &t.file_name,
                    direction: &t.direction,
                    file_size: t.file_size as i64,
                    file_hash: Some(&t.file_hash),
                    integrity_verified: false,
                    status: "rejected",
                    avg_speed: None,
                    peak_speed: None,
                    duration_ms: None,
                },
            );
        }
    }

    *active = None;
    let _ = app_handle.emit("file-transfer-updated", ());
    Ok(())
}

pub fn cancel_active_transfer(app_handle: &AppHandle, transfer_id: &str) -> Result<(), String> {
    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();

    let mut clear_state = false;

    if let Some(ref mut t) = *active {
        if t.id == transfer_id {
            // Signal cancellation
            if let Some(cancel_tx) = t.cancel_tx.take() {
                let _ = cancel_tx.send(());
            }

            // Remove file if exists
            if t.direction == "mobile_to_desktop" && t.file_path.exists() {
                let _ = std::fs::remove_file(&t.file_path);
            }

            // Log status
            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            let _ = db::log_transfer(
                &conn,
                db::TransferLogParam {
                    transfer_id: &t.id,
                    file_name: &t.file_name,
                    direction: &t.direction,
                    file_size: t.file_size as i64,
                    file_hash: Some(&t.file_hash),
                    integrity_verified: false,
                    status: "cancelled",
                    avg_speed: Some(t.avg_speed),
                    peak_speed: Some(t.peak_speed),
                    duration_ms: Some(t.duration_ms as i64),
                },
            );

            // Notify other device
            send_ws_control_message(app_handle, "FILE_TRANSFER_CANCEL", serde_json::json!({
                "transferId": transfer_id
            }));

            clear_state = true;
        }
    }

    if clear_state {
        *active = None;
        let _ = app_handle.emit("file-transfer-updated", ());
    }

    Ok(())
}

pub fn handle_cancel_received(app_handle: &AppHandle, transfer_id: &str) -> Result<(), String> {
    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();

    let mut clear_state = false;

    if let Some(ref mut t) = *active {
        if t.id == transfer_id {
            if let Some(cancel_tx) = t.cancel_tx.take() {
                let _ = cancel_tx.send(());
            }
            if t.direction == "mobile_to_desktop" && t.file_path.exists() {
                let _ = std::fs::remove_file(&t.file_path);
            }

            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            let _ = db::log_transfer(
                &conn,
                db::TransferLogParam {
                    transfer_id: &t.id,
                    file_name: &t.file_name,
                    direction: &t.direction,
                    file_size: t.file_size as i64,
                    file_hash: Some(&t.file_hash),
                    integrity_verified: false,
                    status: "cancelled",
                    avg_speed: Some(t.avg_speed),
                    peak_speed: Some(t.peak_speed),
                    duration_ms: Some(t.duration_ms as i64),
                },
            );

            clear_state = true;
        }
    }

    if clear_state {
        *active = None;
        let _ = app_handle.emit("file-transfer-updated", ());
    }

    Ok(())
}

pub fn handle_client_disconnect(app_handle: &AppHandle, device_id: &str) {
    let manager = app_handle.state::<FileTransferManager>();
    let mut active = manager.active_transfer.lock().unwrap();

    let mut clear_state = false;

    if let Some(ref mut t) = *active {
        // Since we only support single connected mobile client, any active transfer fails on disconnect
        println!("[FILE_TRANSFER] Active transfer failed due to client disconnect: {}", device_id);
        if let Some(cancel_tx) = t.cancel_tx.take() {
            let _ = cancel_tx.send(());
        }
        if t.direction == "mobile_to_desktop" && t.file_path.exists() {
            let _ = std::fs::remove_file(&t.file_path);
        }

        let db_state = app_handle.state::<db::DbState>();
        if let Ok(conn) = db_state.conn.lock() {
            let _ = db::log_transfer(
                &conn,
                db::TransferLogParam {
                    transfer_id: &t.id,
                    file_name: &t.file_name,
                    direction: &t.direction,
                    file_size: t.file_size as i64,
                    file_hash: Some(&t.file_hash),
                    integrity_verified: false,
                    status: "failed",
                    avg_speed: Some(t.avg_speed),
                    peak_speed: Some(t.peak_speed),
                    duration_ms: Some(t.duration_ms as i64),
                },
            );
        }

        clear_state = true;
    }

    if clear_state {
        *active = None;
        let _ = app_handle.emit("file-transfer-updated", ());
    }
}
