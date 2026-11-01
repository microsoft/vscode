import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled fonts (all OFL) so they work offline. Source Serif 4 uses its optical-size axis for text sizes.
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/source-serif-4/opsz.css'
import '@fontsource-variable/source-serif-4/opsz-italic.css'
import 'highlight.js/styles/github-dark.css'
import './styles.css'
import App from './App'

// errors in the window go to the log file too
const report = (what: unknown): void => void window.api?.logError(String((what as Error)?.stack ?? what)).catch(() => {})
window.addEventListener('error', (e) => report(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => report(e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
