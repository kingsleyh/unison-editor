use anyhow::{Context, Result};
use futures::{SinkExt, StreamExt};
use log::{error, info, warn};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::{accept_async, tungstenite::Message};

/// LSP Proxy Server that bridges WebSocket (for Monaco) to TCP (for UCM LSP)
///
/// Architecture:
/// Monaco (WebSocket) <-> Proxy (this) <-> UCM LSP Server (TCP)
///
/// This proxy:
/// 1. Accepts WebSocket connections from Monaco/browser
/// 2. Maintains a TCP connection to UCM's LSP server (localhost:5757)
/// 3. Bidirectionally forwards all LSP messages (JSON-RPC over Content-Length headers)
pub struct LspProxy {
    ws_port: u16,
    lsp_host: String,
    lsp_port: u16,
}

impl LspProxy {
    pub fn new(ws_port: u16, lsp_host: String, lsp_port: u16) -> Self {
        Self {
            ws_port,
            lsp_host,
            lsp_port,
        }
    }

    /// Start the WebSocket proxy server
    pub async fn start(self: Arc<Self>) -> Result<()> {
        let addr = format!("127.0.0.1:{}", self.ws_port);
        let listener = TcpListener::bind(&addr)
            .await
            .context(format!("Failed to bind WebSocket server to {}", addr))?;

        info!("LSP WebSocket proxy listening on {}", addr);
        info!("Will forward to UCM LSP at {}:{}", self.lsp_host, self.lsp_port);

        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    info!("New WebSocket connection from {}", addr);
                    let proxy = self.clone();
                    tokio::spawn(async move {
                        if let Err(e) = proxy.handle_connection(stream).await {
                            error!("Connection error: {}", e);
                        }
                    });
                }
                Err(e) => {
                    error!("Failed to accept connection: {}", e);
                }
            }
        }
    }

    /// Handle a single WebSocket connection
    async fn handle_connection(&self, stream: TcpStream) -> Result<()> {
        // Upgrade to WebSocket
        let ws_stream = accept_async(stream)
            .await
            .context("Failed to accept WebSocket")?;

        info!("WebSocket handshake completed");

        // Connect to UCM LSP server
        let lsp_addr = format!("{}:{}", self.lsp_host, self.lsp_port);
        let lsp_stream = TcpStream::connect(&lsp_addr)
            .await
            .context(format!("Failed to connect to LSP server at {}", lsp_addr))?;

        info!("Connected to UCM LSP server at {}", lsp_addr);

        // Split streams for bidirectional communication
        let (ws_write, ws_read) = ws_stream.split();
        let (lsp_read, lsp_write) = lsp_stream.into_split();

        let ws_write = Arc::new(Mutex::new(ws_write));
        let lsp_write = Arc::new(Mutex::new(lsp_write));

        // Spawn task to forward WebSocket -> LSP
        let ws_to_lsp = {
            let lsp_write = lsp_write.clone();
            tokio::spawn(async move {
                if let Err(e) = Self::forward_ws_to_lsp(ws_read, lsp_write).await {
                    error!("WebSocket->LSP forwarding error: {}", e);
                }
            })
        };

        // Spawn task to forward LSP -> WebSocket
        let lsp_to_ws = {
            let ws_write = ws_write.clone();
            tokio::spawn(async move {
                if let Err(e) = Self::forward_lsp_to_ws(lsp_read, ws_write).await {
                    error!("LSP->WebSocket forwarding error: {}", e);
                }
            })
        };

        // Wait for either direction to finish
        tokio::select! {
            _ = ws_to_lsp => info!("WebSocket->LSP task completed"),
            _ = lsp_to_ws => info!("LSP->WebSocket task completed"),
        }

        Ok(())
    }

    /// Forward messages from WebSocket to LSP (Monaco -> UCM)
    async fn forward_ws_to_lsp(
        mut ws_read: futures::stream::SplitStream<tokio_tungstenite::WebSocketStream<TcpStream>>,
        lsp_write: Arc<Mutex<tokio::net::tcp::OwnedWriteHalf>>,
    ) -> Result<()> {
        while let Some(msg) = ws_read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    info!("WS->LSP: Received message of {} bytes", text.len());
                    info!("WS->LSP: Message: {}", &text[..text.len().min(200)]);

                    // LSP uses Content-Length header format
                    let content_length = text.len();
                    let lsp_message = format!("Content-Length: {}\r\n\r\n{}", content_length, text);

                    let mut writer = lsp_write.lock().await;
                    writer
                        .write_all(lsp_message.as_bytes())
                        .await
                        .context("Failed to write to LSP")?;
                    writer.flush().await.context("Failed to flush LSP write")?;
                    info!("WS->LSP: Forwarded {} bytes to LSP", lsp_message.len());
                }
                Ok(Message::Close(_)) => {
                    info!("WebSocket closed by client");
                    break;
                }
                Ok(_) => {
                    // Ignore binary, ping, pong messages
                }
                Err(e) => {
                    error!("WebSocket read error: {}", e);
                    break;
                }
            }
        }
        Ok(())
    }

    /// Forward messages from LSP to WebSocket (UCM -> Monaco)
    async fn forward_lsp_to_ws(
        mut lsp_read: tokio::net::tcp::OwnedReadHalf,
        ws_write: Arc<Mutex<futures::stream::SplitSink<tokio_tungstenite::WebSocketStream<TcpStream>, Message>>>,
    ) -> Result<()> {
        loop {
            // Read LSP message (Content-Length header format)
            match Self::read_lsp_message(&mut lsp_read).await {
                Ok(content) => {
                    info!("LSP->WS: Received {} bytes from LSP", content.len());
                    info!("LSP->WS: Message: {}", &content[..content.len().min(200)]);

                    // Forward to WebSocket as text message
                    let mut writer = ws_write.lock().await;
                    writer
                        .send(Message::Text(content.clone()))
                        .await
                        .context("Failed to send to WebSocket")?;
                    info!("LSP->WS: Forwarded {} bytes to WebSocket", content.len());
                }
                Err(e) => {
                    if e.to_string().contains("unexpected end of file") {
                        info!("LSP connection closed");
                    } else {
                        error!("LSP read error: {}", e);
                    }
                    break;
                }
            }
        }
        Ok(())
    }

    /// Read a single LSP message from TCP stream (handles Content-Length header)
    async fn read_lsp_message(stream: &mut tokio::net::tcp::OwnedReadHalf) -> Result<String> {
        // Read headers until we find Content-Length and reach \r\n\r\n
        let mut headers = Vec::new();
        let mut buffer = [0u8; 1];

        loop {
            stream
                .read_exact(&mut buffer)
                .await
                .context("Failed to read header byte")?;

            headers.push(buffer[0] as char);

            // Check for end of headers (\r\n\r\n)
            if headers.len() >= 4 {
                let last_four: String = headers.iter().rev().take(4).rev().collect();
                if last_four == "\r\n\r\n" {
                    break;
                }
            }
        }

        // Parse Content-Length
        let headers_str: String = headers.iter().collect();
        let content_length = headers_str
            .lines()
            .find(|line| line.starts_with("Content-Length:"))
            .and_then(|line| line.split(':').nth(1))
            .and_then(|s| s.trim().parse::<usize>().ok())
            .context("Missing or invalid Content-Length header")?;

        // Read the content
        let mut content = vec![0u8; content_length];
        stream
            .read_exact(&mut content)
            .await
            .context("Failed to read message content")?;

        String::from_utf8(content).context("Invalid UTF-8 in message content")
    }
}
