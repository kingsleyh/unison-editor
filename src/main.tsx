import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './doc-syntax.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
