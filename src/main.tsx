import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './doc-syntax.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/ErrorBoundary'

// Don't configure Monaco at all - let @monaco-editor/react handle it
// The library will load Monaco from CDN which works in both dev and production

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
