import * as monaco from 'monaco-editor';

/**
 * LSP Diagnostic (from server)
 */
export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number; // 1 = Error, 2 = Warning, 3 = Info, 4 = Hint
  source?: string;
  code?: string | number;
}

/**
 * Published diagnostics from LSP server
 */
export interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

/**
 * Simple LSP Client for Unison using WebSocket
 *
 * Connects Monaco Editor to the Unison Language Server via WebSocket proxy.
 * The WebSocket proxy (running in Tauri/Rust on port 5758) forwards messages
 * to UCM's TCP LSP server on port 5757.
 */

export class MonacoLspClient {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private messageId = 0;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
  private connectionCallbacks: ((connected: boolean) => void)[] = [];
  private diagnosticsCallbacks: ((params: PublishDiagnosticsParams) => void)[] = [];

  /**
   * Connect to the LSP server via WebSocket proxy
   */
  async connect(wsPort: number = 5758): Promise<void> {
    try {
      const wsUrl = `ws://127.0.0.1:${wsPort}`;
      console.log(`Connecting to LSP WebSocket proxy at ${wsUrl}...`);

      this.ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        if (!this.ws) {
          reject(new Error('WebSocket is null'));
          return;
        }

        this.ws.addEventListener('open', () => {
          console.log('WebSocket connection opened');
          this.isConnected = true;
          this.sendInitialize();
          resolve();
        });

        this.ws.addEventListener('error', (event) => {
          console.error('WebSocket error:', event);
          this.isConnected = false;
          reject(new Error('WebSocket connection failed'));
        });

        this.ws.addEventListener('message', (event) => {
          this.handleMessage(event.data);
        });

        this.ws.addEventListener('close', () => {
          console.log('WebSocket connection closed');
          this.isConnected = false;
          this.notifyConnectionChange(false);
        });
      });

      this.notifyConnectionChange(true);
      console.log('LSP client connected successfully');
    } catch (error) {
      console.error('Failed to connect to LSP:', error);
      this.isConnected = false;
      this.notifyConnectionChange(false);
      throw error;
    }
  }

  /**
   * Send LSP initialize request
   */
  private sendInitialize() {
    // Use the current working directory or home as workspace root
    // In a real implementation, this should come from the project configuration
    const workspaceRoot = 'file:///Users/kings/dev/projects/uni-conveynow';

    const initializeParams = {
      processId: null,
      clientInfo: {
        name: 'Unison Editor',
        version: '1.0.0',
      },
      rootUri: workspaceRoot,
      workspaceFolders: [{
        uri: workspaceRoot,
        name: 'uni-conveynow'
      }],
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['plaintext', 'markdown'] },
          completion: {
            completionItem: {
              snippetSupport: true,
            },
          },
          publishDiagnostics: {},
        },
        workspace: {
          workspaceFolders: true,
        },
      },
    };

    this.sendRequest('initialize', initializeParams).then((result) => {
      console.log('LSP initialized:', result);
      this.sendNotification('initialized', {});
    });
  }

  /**
   * Send LSP request (public method for providers)
   */
  sendLspRequest(method: string, params: any): Promise<any> {
    return this.sendRequest(method, params);
  }

  /**
   * Send LSP notification (public method, no response expected)
   */
  sendLspNotification(method: string, params: any) {
    this.sendNotification(method, params);
  }

  /**
   * Send LSP request (internal)
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = ++this.messageId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const json = JSON.stringify(message);
      console.log(`[LSP Client] Sending request: ${method}, length: ${json.length}`);
      console.log(`[LSP Client] Message: ${json.substring(0, 200)}`);

      // Send raw JSON - the WebSocket proxy will add Content-Length headers
      this.ws.send(json);
    });
  }

  /**
   * Send LSP notification (no response expected)
   */
  private sendNotification(method: string, params: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    // Send raw JSON - the WebSocket proxy will add Content-Length headers
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string) {
    try {
      // Parse LSP message (strip Content-Length header if present)
      let jsonContent = data;
      const headerEnd = data.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        jsonContent = data.substring(headerEnd + 4);
      }

      const message = JSON.parse(jsonContent);

      // Handle response to a request
      if (message.id !== undefined && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id)!;
        this.pendingRequests.delete(message.id);

        console.log(`[LSP Client] Response for id ${message.id}:`, message.result || message.error);

        if (message.error) {
          pending.reject(message.error);
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      // Handle server notifications
      if (message.method) {
        console.log(`LSP notification: ${message.method}`, message.params);

        // Handle publishDiagnostics notifications
        if (message.method === 'textDocument/publishDiagnostics') {
          this.handleDiagnostics(message.params as PublishDiagnosticsParams);
        }
      }
    } catch (error) {
      console.error('Failed to parse LSP message:', error);
    }
  }

  /**
   * Handle incoming diagnostics from LSP server
   */
  private handleDiagnostics(params: PublishDiagnosticsParams) {
    console.log('[LSP Client] Received diagnostics:', params.uri, params.diagnostics.length, 'issues');
    this.diagnosticsCallbacks.forEach(cb => cb(params));
  }

  /**
   * Subscribe to diagnostics updates
   */
  onDiagnostics(callback: (params: PublishDiagnosticsParams) => void): () => void {
    this.diagnosticsCallbacks.push(callback);
    return () => {
      const index = this.diagnosticsCallbacks.indexOf(callback);
      if (index > -1) {
        this.diagnosticsCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Disconnect from the LSP server
   */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.notifyConnectionChange(false);
    console.log('LSP client disconnected');
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      const index = this.connectionCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionCallbacks.splice(index, 1);
      }
    };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(cb => cb(connected));
  }
}

// Singleton instance
let monacoLspClient: MonacoLspClient | null = null;

/**
 * Get the singleton LSP client instance
 */
export function getMonacoLspClient(): MonacoLspClient {
  if (!monacoLspClient) {
    monacoLspClient = new MonacoLspClient();
  }
  return monacoLspClient;
}
