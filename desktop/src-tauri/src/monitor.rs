use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use serde_json::json;
use sysinfo::{System, Disks, Networks};
use crate::connection_manager::ConnectionManager;

pub fn start_monitoring(manager: Arc<ConnectionManager>, app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Initialize sysinfo System and Networks structures.
        let mut sys = System::new_all();
        let mut networks = Networks::new();

        // Initial refresh so the next refreshes have diffs
        sys.refresh_cpu();
        sys.refresh_memory();
        networks.refresh_list();

        loop {
            // Check count of active clients
            let client_count = manager.get_client_count();

            if client_count > 0 {
                // Refresh system stats
                sys.refresh_cpu();
                sys.refresh_memory();
                networks.refresh_list();

                // CPU
                let cpu_usage = sys.global_cpu_info().cpu_usage() as f64;

                // RAM
                let total_mem = sys.total_memory();
                let used_mem = sys.used_memory();
                let ram_usage = if total_mem > 0 {
                    (used_mem as f64 / total_mem as f64) * 100.0
                } else {
                    0.0
                };

                // Disk
                let disks = Disks::new_with_refreshed_list();
                let mut total_space = 0;
                let mut available_space = 0;
                for disk in &disks {
                    total_space += disk.total_space();
                    available_space += disk.available_space();
                }
                let disk_usage = if total_space > 0 {
                    ((total_space - available_space) as f64 / total_space as f64) * 100.0
                } else {
                    0.0
                };

                // Network
                let mut network_up = 0;
                let mut network_down = 0;
                for (_name, net) in &networks {
                    network_up += net.transmitted();
                    network_down += net.received();
                }

                // Uptime
                let uptime = System::uptime();

                // Latency
                let latency_ms = manager.get_latency_ms();

                // Construct payload according to SYSTEM_STATS protocol
                let stats = json!({
                    "telemetryVersion": 1,
                    "cpu": cpu_usage,
                    "ram": ram_usage,
                    "gpu": null,
                    "disk": disk_usage,
                    "networkUp": network_up,
                    "networkDown": network_down,
                    "uptime": uptime,
                    "latencyMs": latency_ms,
                });

                // Broadcast
                manager.broadcast_system_stats(stats, &app_handle);
            }

            // Exactly 1 second delay
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}
