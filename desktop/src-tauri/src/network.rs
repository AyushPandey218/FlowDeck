use std::net::UdpSocket;

/// Resolves the local active LAN IP address by querying routing paths to an external address.
/// This does not actually transmit network packets.
pub fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local_addr = socket.local_addr().ok()?;
    Some(local_addr.ip().to_string())
}

/// Resolves the local host IP and formats it with the server port.
#[allow(dead_code)]
pub fn get_server_address(port: u16) -> String {
    let ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    format!("{}:{}", ip, port)
}
