import { useState, useEffect } from 'react';
import { getMonacoLspClient } from '../services/monacoLspClient';
import { ucmContext } from '../services/ucmContext';
import { getUCMLifecycleService } from '../services/ucmLifecycle';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface StatusDotProps {
  label: string;
  state: ConnectionState;
  onClick?: () => void;
}

function StatusDot({ label, state, onClick }: StatusDotProps) {
  const colors = {
    connected: '#4ec9b0',    // teal (matches project status indicator)
    connecting: '#ff9800',   // orange
    disconnected: '#f44336', // red
  };

  const titles = {
    connected: `${label}: Connected`,
    connecting: `${label}: Connecting...`,
    disconnected: `${label}: Disconnected - Click to reconnect`,
  };

  return (
    <div
      className={`status-dot ${state} ${onClick && state === 'disconnected' ? 'clickable' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        cursor: onClick && state === 'disconnected' ? 'pointer' : 'default',
      }}
      title={titles[state]}
      onClick={state === 'disconnected' ? onClick : undefined}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: colors[state],
          display: 'inline-block',
        }}
      />
      <span style={{ fontSize: '11px', color: '#999' }}>{label}</span>
    </div>
  );
}

export function ConnectionStatus() {
  const [lspState, setLspState] = useState<ConnectionState>('disconnected');
  const [ucmState, setUcmState] = useState<ConnectionState>('disconnected');

  const lspClient = getMonacoLspClient();

  useEffect(() => {
    // Initialize LSP state
    if (lspClient.connected) {
      setLspState('connected');
    }

    // Subscribe to LSP connection changes
    const unsubscribe = lspClient.onConnectionChange((connected) => {
      setLspState(connected ? 'connected' : 'disconnected');
    });

    return () => unsubscribe();
  }, [lspClient]);

  useEffect(() => {
    // Check UCM state - it's "connected" if we have a valid context
    async function checkUcm() {
      setUcmState('connecting');
      try {
        await ucmContext.initialize();
        const context = ucmContext.getContext();
        setUcmState(context ? 'connected' : 'disconnected');
      } catch {
        setUcmState('disconnected');
      }
    }

    // If UCM context already has data, we're connected
    const context = ucmContext.getContext();
    if (context) {
      setUcmState('connected');
    } else {
      checkUcm();
    }

    // Subscribe to context changes
    const unsubscribe = ucmContext.onChange(() => {
      setUcmState('connected');
    });

    return () => unsubscribe();
  }, []);

  async function handleLspReconnect() {
    setLspState('connecting');
    try {
      // Get the dynamically allocated LSP proxy port from UCM lifecycle
      const ucmLifecycle = getUCMLifecycleService();
      const ports = ucmLifecycle.getPorts();
      const wsPort = ports?.lspProxyPort ?? 5758; // Fallback to default if not available

      await lspClient.connect(wsPort);
    } catch (error) {
      console.error('Failed to reconnect LSP:', error);
      setLspState('disconnected');
    }
  }

  async function handleUcmReconnect() {
    setUcmState('connecting');
    try {
      await ucmContext.refresh();
      const context = ucmContext.getContext();
      setUcmState(context ? 'connected' : 'disconnected');
    } catch (error) {
      console.error('Failed to reconnect UCM:', error);
      setUcmState('disconnected');
    }
  }

  return (
    <div className="connection-status" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <StatusDot label="UCM" state={ucmState} onClick={handleUcmReconnect} />
      <StatusDot label="LSP" state={lspState} onClick={handleLspReconnect} />
    </div>
  );
}
