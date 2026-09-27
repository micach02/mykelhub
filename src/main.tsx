import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initFileSync } from './lib/fileSync'
import './index.css'

// Reconnects to the data file, if one was chosen, before anything renders.
void initFileSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
