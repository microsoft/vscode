import type { AppSettings } from '../shared/types'

// Bundled fonts (OFL) are imported in main.tsx; the others are system fonts on Windows.
export const REPLY_FONTS: { value: AppSettings['replyFont']; label: string; stack: string }[] = [
  { value: 'source-serif', label: 'Source Serif 4', stack: "'Source Serif 4 Variable', Georgia, serif" },
  { value: 'newsreader', label: 'Newsreader', stack: "'Newsreader Variable', Georgia, serif" },
  { value: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { value: 'georgia', label: 'Georgia', stack: 'Georgia, serif' },
  { value: 'cambria', label: 'Cambria', stack: 'Cambria, Georgia, serif' },
  { value: 'sans', label: 'Same as interface (sans-serif)', stack: 'var(--sans)' }
]

export const UI_FONTS: { value: AppSettings['uiFont']; label: string; stack: string }[] = [
  { value: 'dm-sans', label: 'DM Sans', stack: "'DM Sans Variable', system-ui, 'Segoe UI', sans-serif" },
  { value: 'system', label: 'System (Segoe UI)', stack: "system-ui, 'Segoe UI', Roboto, 'Noto Sans', sans-serif" }
]

/** Point the --serif / --sans CSS variables at the chosen fonts. */
export function applyFonts(s: Pick<AppSettings, 'replyFont' | 'uiFont'>): void {
  const root = document.documentElement.style
  root.setProperty('--sans', (UI_FONTS.find((f) => f.value === s.uiFont) ?? UI_FONTS[0]).stack)
  root.setProperty('--serif', (REPLY_FONTS.find((f) => f.value === s.replyFont) ?? REPLY_FONTS[0]).stack)
}
