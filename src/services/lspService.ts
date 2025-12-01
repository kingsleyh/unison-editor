import * as lsp from 'vscode-languageserver-protocol';
import { invoke } from '@tauri-apps/api/core';
import { logger } from './loggingService';

/**
 * LSP Service for connecting to UCM's Language Server
 *
 * UCM runs an LSP server on port 5757 (configurable via UNISON_LSP_PORT)
 * This service manages the connection and provides methods for LSP operations
 */
export class LSPService {
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (result: any) => void;
    reject: (error: any) => void;
  }>();

  private diagnosticsCallbacks: ((diagnostics: lsp.PublishDiagnosticsParams) => void)[] = [];
  private connectionCallbacks: ((connected: boolean) => void)[] = [];

  private host: string;
  private port: number;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000; // 1 second base delay
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Background polling for server notifications
  private pollingInterval: number | null = null;

  constructor(host = 'localhost', port = 5757) {
    this.host = host;
    this.port = port;
  }

  /**
   * Connect to UCM's LSP server via Tauri TCP bridge
   */
  async connect(): Promise<void> {
    // Cancel any pending reconnect
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    const connectOp = logger.startOperation('lsp', 'Connecting to LSP server', { host: this.host, port: this.port });
    try {
      await invoke('lsp_connect', { host: this.host, port: this.port });
      connectOp.complete();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.notifyConnectionChange(true);

      // Send initialize request
      await this.initialize();

      // Note: Since we're using request/response pattern,
      // we won't receive push notifications from the server.
      // For a full LSP implementation, you'd need a background thread
      // in Rust that continuously reads from the socket.
    } catch (error) {
      connectOp.fail(error);
      this.isConnected = false;
      this.notifyConnectionChange(false);

      // Attempt to reconnect with exponential backoff
      this.scheduleReconnect();

      throw error;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('lsp', 'Max reconnection attempts reached');
      return;
    }

    // Cancel any existing reconnect timer
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    // Calculate delay with exponential backoff (1s, 2s, 4s, 8s, 16s)
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info('lsp', `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`, { delay });

    this.reconnectTimeoutId = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Error already logged in connect()
      }
    }, delay);
  }

  /**
   * Disconnect from LSP server
   */
  async disconnect(): Promise<void> {
    try {
      // Stop any reconnection attempts
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect

      await invoke('lsp_disconnect');
      this.isConnected = false;
      this.pendingRequests.clear();

      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
    } catch (error) {
      console.error('Error disconnecting from LSP:', error);
    }
  }

  /**
   * Reset reconnection state to allow reconnecting
   */
  resetReconnect(): void {
    this.reconnectAttempts = 0;
  }

  /**
   * Check if connected to LSP server
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Send LSP initialize request
   */
  private async initialize(): Promise<void> {
    const initParams: lsp.InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: false,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: false,
          },
          hover: {
            dynamicRegistration: false,
            contentFormat: ['plaintext', 'markdown'],
          },
          completion: {
            dynamicRegistration: false,
            completionItem: {
              snippetSupport: false,
            },
          },
          publishDiagnostics: {
            relatedInformation: true,
            tagSupport: { valueSet: [1, 2] },
          },
        },
        workspace: {
          workspaceFolders: false,
          configuration: false,
        },
      },
      workspaceFolders: null,
    };

    const result = await this.sendRequest<lsp.InitializeResult>('initialize', initParams);
    console.log('LSP initialized:', result);

    // Send initialized notification
    this.sendNotification('initialized', {});
  }

  /**
   * Send an LSP request and wait for response
   */
  private async sendRequest<T>(method: string, params: any): Promise<T> {
    if (!this.isConnected) {
      throw new Error('LSP connection not open');
    }

    const id = ++this.messageId;
    const message: lsp.RequestMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    try {
      const responseStr = await invoke<string>('lsp_send_request', {
        message: JSON.stringify(message)
      });

      const response = JSON.parse(responseStr);

      if ('error' in response) {
        throw new Error(response.error.message || 'LSP request failed');
      }

      return response.result;
    } catch (error) {
      throw new Error(`LSP request ${method} failed: ${error}`);
    }
  }

  /**
   * Send an LSP notification (no response expected)
   */
  private async sendNotification(method: string, params: any): Promise<void> {
    if (!this.isConnected) {
      console.warn('Cannot send notification, LSP not connected');
      return;
    }

    const message: lsp.NotificationMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    try {
      // Notifications don't expect a response, but we still need to send them
      await invoke('lsp_send_request', { message: JSON.stringify(message) });
    } catch (error) {
      console.error(`Failed to send notification ${method}:`, error);
    }
  }

  /**
   * Notify document opened
   */
  didOpen(uri: string, languageId: string, version: number, text: string): void {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    } as lsp.DidOpenTextDocumentParams);
  }

  /**
   * Notify document changed
   */
  didChange(uri: string, version: number, text: string): void {
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri,
        version,
      },
      contentChanges: [{ text }],
    } as lsp.DidChangeTextDocumentParams);
  }

  /**
   * Notify document closed
   */
  didClose(uri: string): void {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    } as lsp.DidCloseTextDocumentParams);
  }

  /**
   * Request hover information at a position
   */
  async hover(uri: string, line: number, character: number): Promise<lsp.Hover | null> {
    try {
      const result = await this.sendRequest<lsp.Hover | null>('textDocument/hover', {
        textDocument: { uri },
        position: { line, character },
      } as lsp.HoverParams);
      return result;
    } catch (error) {
      console.error('Hover request failed:', error);
      return null;
    }
  }

  /**
   * Request completions at a position
   */
  async completion(uri: string, line: number, character: number): Promise<lsp.CompletionItem[]> {
    try {
      const result = await this.sendRequest<lsp.CompletionList | lsp.CompletionItem[] | null>(
        'textDocument/completion',
        {
          textDocument: { uri },
          position: { line, character },
        } as lsp.CompletionParams
      );

      if (!result) return [];
      if (Array.isArray(result)) return result;
      return result.items;
    } catch (error) {
      console.error('Completion request failed:', error);
      return [];
    }
  }

  /**
   * Request definition location at a position
   */
  async definition(uri: string, line: number, character: number): Promise<lsp.Location | lsp.Location[] | null> {
    try {
      const result = await this.sendRequest<lsp.Location | lsp.Location[] | null>(
        'textDocument/definition',
        {
          textDocument: { uri },
          position: { line, character },
        } as lsp.DefinitionParams
      );
      return result;
    } catch (error) {
      console.error('Definition request failed:', error);
      return null;
    }
  }

  /**
   * Request signature help at a position
   */
  async signatureHelp(uri: string, line: number, character: number): Promise<lsp.SignatureHelp | null> {
    try {
      const result = await this.sendRequest<lsp.SignatureHelp | null>(
        'textDocument/signatureHelp',
        {
          textDocument: { uri },
          position: { line, character },
        } as lsp.SignatureHelpParams
      );
      return result;
    } catch (error) {
      console.error('SignatureHelp request failed:', error);
      return null;
    }
  }

  /**
   * Request references to a symbol at a position
   */
  async references(uri: string, line: number, character: number, includeDeclaration: boolean = false): Promise<lsp.Location[]> {
    try {
      const result = await this.sendRequest<lsp.Location[] | null>(
        'textDocument/references',
        {
          textDocument: { uri },
          position: { line, character },
          context: { includeDeclaration },
        } as lsp.ReferenceParams
      );
      return result || [];
    } catch (error) {
      console.error('References request failed:', error);
      return [];
    }
  }

  /**
   * Request document symbols (outline)
   */
  async documentSymbol(uri: string): Promise<lsp.DocumentSymbol[] | lsp.SymbolInformation[]> {
    try {
      const result = await this.sendRequest<lsp.DocumentSymbol[] | lsp.SymbolInformation[] | null>(
        'textDocument/documentSymbol',
        {
          textDocument: { uri },
        } as lsp.DocumentSymbolParams
      );
      return result || [];
    } catch (error) {
      console.error('DocumentSymbol request failed:', error);
      return [];
    }
  }

  /**
   * Prepare rename - check if rename is valid at position
   */
  async prepareRename(uri: string, line: number, character: number): Promise<lsp.Range | { range: lsp.Range; placeholder: string } | null> {
    try {
      const result = await this.sendRequest<lsp.Range | { range: lsp.Range; placeholder: string } | null>(
        'textDocument/prepareRename',
        {
          textDocument: { uri },
          position: { line, character },
        }
      );
      return result;
    } catch (error) {
      console.error('PrepareRename request failed:', error);
      return null;
    }
  }

  /**
   * Request rename edits
   */
  async rename(uri: string, line: number, character: number, newName: string): Promise<lsp.WorkspaceEdit | null> {
    try {
      const result = await this.sendRequest<lsp.WorkspaceEdit | null>(
        'textDocument/rename',
        {
          textDocument: { uri },
          position: { line, character },
          newName,
        } as lsp.RenameParams
      );
      return result;
    } catch (error) {
      console.error('Rename request failed:', error);
      return null;
    }
  }

  /**
   * Request document formatting
   */
  async formatting(uri: string, tabSize: number, insertSpaces: boolean): Promise<lsp.TextEdit[]> {
    try {
      const result = await this.sendRequest<lsp.TextEdit[] | null>(
        'textDocument/formatting',
        {
          textDocument: { uri },
          options: {
            tabSize,
            insertSpaces,
          },
        } as lsp.DocumentFormattingParams
      );
      return result || [];
    } catch (error) {
      console.error('Formatting request failed:', error);
      return [];
    }
  }

  /**
   * Request code actions (quick fixes)
   */
  async codeAction(uri: string, range: lsp.Range, diagnostics: lsp.Diagnostic[]): Promise<(lsp.Command | lsp.CodeAction)[]> {
    try {
      const result = await this.sendRequest<(lsp.Command | lsp.CodeAction)[] | null>(
        'textDocument/codeAction',
        {
          textDocument: { uri },
          range,
          context: {
            diagnostics,
          },
        } as lsp.CodeActionParams
      );
      return result || [];
    } catch (error) {
      console.error('CodeAction request failed:', error);
      return [];
    }
  }

  /**
   * Request folding ranges
   */
  async foldingRange(uri: string): Promise<lsp.FoldingRange[]> {
    try {
      const result = await this.sendRequest<lsp.FoldingRange[] | null>(
        'textDocument/foldingRange',
        {
          textDocument: { uri },
        } as lsp.FoldingRangeParams
      );
      return result || [];
    } catch (error) {
      console.error('FoldingRange request failed:', error);
      return [];
    }
  }

  /**
   * Request inlay hints
   */
  async inlayHint(uri: string, range: lsp.Range): Promise<lsp.InlayHint[]> {
    try {
      const result = await this.sendRequest<lsp.InlayHint[] | null>(
        'textDocument/inlayHint',
        {
          textDocument: { uri },
          range,
        } as lsp.InlayHintParams
      );
      return result || [];
    } catch (error) {
      console.error('InlayHint request failed:', error);
      return [];
    }
  }

  /**
   * Subscribe to diagnostics updates
   */
  onDiagnostics(callback: (diagnostics: lsp.PublishDiagnosticsParams) => void): () => void {
    this.diagnosticsCallbacks.push(callback);
    return () => {
      const index = this.diagnosticsCallbacks.indexOf(callback);
      if (index > -1) {
        this.diagnosticsCallbacks.splice(index, 1);
      }
    };
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
let lspService: LSPService | null = null;

export function getLSPService(host?: string, port?: number): LSPService {
  // If specific host/port provided or service doesn't exist, create/recreate
  if (!lspService || (host !== undefined && port !== undefined)) {
    lspService = new LSPService(host || 'localhost', port || 5757);
  }
  return lspService;
}

/**
 * Reset the LSP service singleton (useful when UCM restarts with new ports)
 */
export function resetLSPService(): void {
  if (lspService) {
    lspService.disconnect();
    lspService = null;
  }
}
