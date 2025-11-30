use std::net::TcpListener;

/// Find an available port starting from the given port.
/// Searches up to 100 ports from the starting port.
pub fn find_available_port(starting_port: u16) -> Option<u16> {
    (starting_port..starting_port + 100).find(|port| {
        TcpListener::bind(("127.0.0.1", *port)).is_ok()
    })
}

/// Find multiple distinct available ports.
/// Returns None if not enough ports can be found.
#[allow(dead_code)]
pub fn find_available_ports(count: usize, starting_port: u16) -> Option<Vec<u16>> {
    let mut ports = Vec::with_capacity(count);
    let mut current = starting_port;

    while ports.len() < count && current < starting_port + 100 {
        if TcpListener::bind(("127.0.0.1", current)).is_ok() {
            ports.push(current);
        }
        current += 1;
    }

    if ports.len() == count {
        Some(ports)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_available_port() {
        // Should find some port
        let port = find_available_port(50000);
        assert!(port.is_some());
    }

    #[test]
    fn test_find_multiple_ports() {
        // Should find 3 distinct ports
        let ports = find_available_ports(3, 50000);
        assert!(ports.is_some());
        let ports = ports.unwrap();
        assert_eq!(ports.len(), 3);
        // All ports should be distinct
        assert_ne!(ports[0], ports[1]);
        assert_ne!(ports[1], ports[2]);
        assert_ne!(ports[0], ports[2]);
    }
}
