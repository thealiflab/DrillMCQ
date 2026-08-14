import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { loadAppearance } from './services/storage'
import { applyAppearance } from './utils/appearance'

// Applied before the first render so the app never paints at the default font
// size and then jumps. Deliberately not an inline script in index.html: that
// would put a storage key outside services/storage.ts. `useAppearance` re-applies
// the same values in its effect, which is a no-op.
applyAppearance(document.documentElement, loadAppearance())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
