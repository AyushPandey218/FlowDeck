use std::sync::Mutex;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc::UnboundedSender;
use tokio_tungstenite::tungstenite::Message;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use crate::db;

fn get_current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn get_formatted_time() -> String {
    // Return simple HH:MM:SS format
    let total_secs = get_current_timestamp();
    let seconds = total_secs % 60;
    let minutes = (total_secs / 60) % 60;
    let hours = (total_secs / 3600 + 5) % 24; // Simple timezone offset approximation
    format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
}

fn get_current_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone)]
#[allow(dead_code)]
pub struct ClientConnection {
    pub address: String,
    pub device_id: String,
    pub sender: UnboundedSender<Message>,
}

pub struct ConnectionManager {
    clients: Mutex<HashMap<String, ClientConnection>>,
    messages_sent: Mutex<u64>,
    messages_received: Mutex<u64>,
    last_ping: Mutex<String>,
    last_pong: Mutex<String>,
    server_started_at: u64,
    pairing_token: Mutex<Option<(String, std::time::SystemTime)>>,
    latest_stats: Mutex<Option<serde_json::Value>>,
    latency_ms: Mutex<u32>,
    last_ping_timestamp: Mutex<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolStats {
    pub connected_clients: usize,
    pub messages_sent: u64,
    pub messages_received: u64,
    pub last_ping: String,
    pub last_pong: String,
    pub server_started_at: u64,
    pub uptime_seconds: u64,
}

impl ConnectionManager {
    pub fn new() -> Self {
        ConnectionManager {
            clients: Mutex::new(HashMap::new()),
            messages_sent: Mutex::new(0),
            messages_received: Mutex::new(0),
            last_ping: Mutex::new("N/A".to_string()),
            last_pong: Mutex::new("N/A".to_string()),
            server_started_at: get_current_timestamp(),
            pairing_token: Mutex::new(None),
            latest_stats: Mutex::new(None),
            latency_ms: Mutex::new(0),
            last_ping_timestamp: Mutex::new(0),
        }
    }

    pub fn generate_pairing_token(&self) -> String {
        let token = uuid::Uuid::new_v4().to_string();
        let mut guard = self.pairing_token.lock().unwrap();
        *guard = Some((token.clone(), std::time::SystemTime::now()));
        token
    }

    pub fn validate_pairing_token(&self, token: &str) -> bool {
        let guard = self.pairing_token.lock().unwrap();
        if let Some((ref stored_token, created_at)) = *guard {
            if stored_token == token {
                if let Ok(elapsed) = std::time::SystemTime::now().duration_since(created_at) {
                    return elapsed.as_secs() < 300; // 5 minutes
                }
            }
        }
        false
    }

    pub fn destroy_pairing_token(&self) {
        let mut guard = self.pairing_token.lock().unwrap();
        *guard = None;
    }

    pub fn register_client(&self, address: String, device_id: String, sender: UnboundedSender<Message>, app_handle: &AppHandle) {
        println!("[SERVER] Registering client address: {}, deviceId: {}", address, device_id);
        {
            let mut clients = self.clients.lock().unwrap();
            if !clients.is_empty() {
                println!("[CLIENT] Replacing existing active connection");
                for (_, client) in clients.iter() {
                    let _ = client.sender.send(Message::Close(None));
                }
                clients.clear();
            }
            clients.insert(address.clone(), ClientConnection {
                address,
                device_id,
                sender,
            });
        }
        self.emit_stats(app_handle);
    }

    pub fn disconnect_device(&self, device_id: &str, app_handle: &AppHandle) {
        let senders_to_close: Vec<UnboundedSender<Message>> = {
            let mut clients = self.clients.lock().unwrap();
            let mut to_remove = Vec::new();
            for (addr, client) in clients.iter() {
                if client.device_id == device_id {
                    to_remove.push(addr.clone());
                }
            }
            let mut senders = Vec::new();
            for addr in to_remove {
                if let Some(c) = clients.remove(&addr) {
                    println!("[SERVER] Disconnecting client on unpair: {}", addr);
                    senders.push(c.sender);
                }
            }
            senders
        };
        for sender in senders_to_close {
            let _ = sender.send(Message::Close(None));
        }
        self.emit_stats(app_handle);
    }

    pub fn deregister_client(&self, address: &str, app_handle: &AppHandle) {
        println!("[SERVER] Deregistering client address: {}", address);
        {
            let mut clients = self.clients.lock().unwrap();
            clients.remove(address);
        }
        self.emit_stats(app_handle);
    }

    pub fn get_client_count(&self) -> usize {
        let clients = self.clients.lock().unwrap();
        clients.len()
    }

    pub fn increment_sent(&self, app_handle: &AppHandle) {
        {
            let mut sent = self.messages_sent.lock().unwrap();
            *sent += 1;
        }
        self.emit_stats(app_handle);
    }

    pub fn increment_received(&self, app_handle: &AppHandle) {
        {
            let mut rec = self.messages_received.lock().unwrap();
            *rec += 1;
        }
        self.emit_stats(app_handle);
    }

    pub fn record_ping(&self, app_handle: &AppHandle) {
        {
            let mut ping = self.last_ping.lock().unwrap();
            *ping = get_formatted_time();
        }
        self.emit_stats(app_handle);
    }

    pub fn record_pong(&self, app_handle: &AppHandle) {
        {
            let mut pong = self.last_pong.lock().unwrap();
            *pong = get_formatted_time();
        }
        self.emit_stats(app_handle);
    }

    pub fn broadcast_message(&self, msg_str: &str, app_handle: &AppHandle) {
        let senders: Vec<(String, UnboundedSender<Message>)> = {
            let clients = self.clients.lock().unwrap();
            clients.iter().map(|(addr, c)| (addr.clone(), c.sender.clone())).collect()
        };
        let msg = Message::Text(msg_str.to_string());
        for (addr, sender) in senders {
            println!("[WS] Broadcasting to client {}: {}", addr, msg_str);
            if let Err(e) = sender.send(msg.clone()) {
                eprintln!("[SERVER] Failed to send message to {}: {}", addr, e);
            } else {
                self.increment_sent(app_handle);
            }
        }
    }

    pub fn send_to_client(&self, address: &str, msg_str: &str, app_handle: &AppHandle) {
        let sender = {
            let clients = self.clients.lock().unwrap();
            clients.get(address).map(|c| c.sender.clone())
        };
        if let Some(sender) = sender {
            let msg = Message::Text(msg_str.to_string());
            if let Err(e) = sender.send(msg) {
                eprintln!("[SERVER] Failed to send to {}: {}", address, e);
            } else {
                self.increment_sent(app_handle);
            }
        }
    }

    pub fn get_stats(&self) -> ProtocolStats {
        let connected_clients = self.get_client_count();
        let messages_sent = *self.messages_sent.lock().unwrap();
        let messages_received = *self.messages_received.lock().unwrap();
        let last_ping = self.last_ping.lock().unwrap().clone();
        let last_pong = self.last_pong.lock().unwrap().clone();
        let current_time = get_current_timestamp();
        let uptime_seconds = current_time.saturating_sub(self.server_started_at);

        ProtocolStats {
            connected_clients,
            messages_sent,
            messages_received,
            last_ping,
            last_pong,
            server_started_at: self.server_started_at,
            uptime_seconds,
        }
    }

    pub fn emit_stats(&self, app_handle: &AppHandle) {
        let stats = self.get_stats();
        // Emit Tauri Event to React frontend
        if let Err(e) = app_handle.emit("protocol-stats-update", stats) {
            eprintln!("[SERVER] Failed to emit protocol stats event: {}", e);
        }
    }

    pub fn send_actions_sync(&self, address: &str, app_handle: &AppHandle) {
        let actions = {
            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            db::get_actions(&conn).unwrap_or_default()
        };

        let envelope = serde_json::json!({
            "type": "ACTIONS_SYNC",
            "payload": {
                "actions": actions,
            },
            "timestamp": get_current_timestamp() * 1000
        });

        if let Ok(msg_str) = serde_json::to_string(&envelope) {
            self.send_to_client(address, &msg_str, app_handle);
        }
    }

    pub fn broadcast_actions_sync(&self, app_handle: &AppHandle) {
        let actions = {
            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            db::get_actions(&conn).unwrap_or_default()
        };

        let envelope = serde_json::json!({
            "type": "ACTIONS_SYNC",
            "payload": {
                "actions": actions,
            },
            "timestamp": get_current_timestamp() * 1000
        });

        if let Ok(msg_str) = serde_json::to_string(&envelope) {
            self.broadcast_message(&msg_str, app_handle);
        }
    }

    pub fn send_layout_sync(&self, address: &str, app_handle: &AppHandle) {
        let (pages, layout_version) = {
            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            let pages = db::get_layout(&conn).unwrap_or_default();
            let version = db::get_layout_version(&conn);
            (pages, version)
        };

        let envelope = serde_json::json!({
            "type": "LAYOUT_SYNC",
            "payload": {
                "layoutVersion": layout_version,
                "pages": pages,
            },
            "timestamp": get_current_timestamp() * 1000
        });

        if let Ok(msg_str) = serde_json::to_string(&envelope) {
            self.send_to_client(address, &msg_str, app_handle);
        }
    }

    pub fn broadcast_layout_sync(&self, app_handle: &AppHandle) {
        let (pages, layout_version) = {
            let db_state = app_handle.state::<db::DbState>();
            let conn = db_state.conn.lock().unwrap();
            let pages = db::get_layout(&conn).unwrap_or_default();
            let version = db::get_layout_version(&conn);
            (pages, version)
        };

        let envelope = serde_json::json!({
            "type": "LAYOUT_SYNC",
            "payload": {
                "layoutVersion": layout_version,
                "pages": pages,
            },
            "timestamp": get_current_timestamp() * 1000
        });

        if let Ok(msg_str) = serde_json::to_string(&envelope) {
            self.broadcast_message(&msg_str, app_handle);
        }
    }

    pub fn get_latency_ms(&self) -> u32 {
        *self.latency_ms.lock().unwrap()
    }

    pub fn set_latency_ms(&self, ms: u32) {
        *self.latency_ms.lock().unwrap() = ms;
    }

    pub fn get_last_ping_timestamp(&self) -> u64 {
        *self.last_ping_timestamp.lock().unwrap()
    }

    pub fn set_last_ping_timestamp(&self, timestamp: u64) {
        *self.last_ping_timestamp.lock().unwrap() = timestamp;
    }

    pub fn broadcast_system_stats(&self, stats: serde_json::Value, app_handle: &AppHandle) {
        {
            let mut guard = self.latest_stats.lock().unwrap();
            *guard = Some(stats.clone());
        }

        let _ = app_handle.emit("system-stats-update", stats.clone());

        let envelope = serde_json::json!({
            "type": "SYSTEM_STATS",
            "payload": stats,
            "timestamp": get_current_epoch_ms()
        });

        if let Ok(msg_str) = serde_json::to_string(&envelope) {
            self.broadcast_message(&msg_str, app_handle);
        }
    }

    pub fn send_cached_system_stats(&self, address: &str, app_handle: &AppHandle) {
        let stats_opt = {
            let guard = self.latest_stats.lock().unwrap();
            guard.clone()
        };

        if let Some(stats) = stats_opt {
            let envelope = serde_json::json!({
                "type": "SYSTEM_STATS",
                "payload": stats,
                "timestamp": get_current_epoch_ms()
            });

            if let Ok(msg_str) = serde_json::to_string(&envelope) {
                self.send_to_client(address, &msg_str, app_handle);
            }
        }
    }
}
