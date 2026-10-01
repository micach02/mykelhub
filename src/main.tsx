import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initFileSync } from './lib/fileSync'
import { initCloudSync } from './lib/cloudSync'
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import './index.css'

// Reconnect to wherever the data lives before anything renders. Both are
// optional: without either, the store stays in browser storage.
void initFileSync()
void initCloudSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
