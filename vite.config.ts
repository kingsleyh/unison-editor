import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Optimize dependencies for proper bundling
  optimizeDeps: {
    include: [
      'monaco-editor',
      'vscode-ws-jsonrpc',
    ],
  },

  // Build configuration
  build: {
    // Increase chunk size warning limit for Monaco editor
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting
        manualChunks: {
          monaco: ['monaco-editor'],
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },

  // Resolve configuration
  resolve: {
    dedupe: ['monaco-editor'],
  },

  // Worker configuration for Monaco
  worker: {
    format: 'es',
  },
})
