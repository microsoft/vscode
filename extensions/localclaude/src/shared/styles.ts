// Response styles, like the Claude app's: a short instruction added to Claude's system prompt.
import type { ResponseStyle } from './types'

export const BUILTIN_STYLES: ResponseStyle[] = [
  {
    id: 'conversational',
    name: 'Conversational',
    description: 'Warm, well-organized prose, like the Claude app',
    prompt:
      'Respond the way the Claude app does: warm, conversational, well-organized prose. Explain your reasoning in plain language, use headings and lists only when they genuinely help, and keep code blocks for actual code.'
  },
  {
    id: 'concise',
    name: 'Concise',
    description: 'Shorter, more direct answers',
    prompt: 'Be brief and direct. Lead with the answer, skip preamble and recaps, and prefer short sentences and short lists.'
  },
  {
    id: 'explanatory',
    name: 'Explanatory',
    description: 'Explains the why behind each step',
    prompt:
      'Explain as you go: briefly share the reasoning behind your choices and the concepts involved, so the user learns the "why" as well as the "what".'
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Guides you to work it out yourself',
    prompt:
      'Act as a patient teacher. Guide the user to understand and do things themselves: break problems into small steps, ask them to try parts on their own, check their understanding, and explain concepts step by step.'
  },
  {
    id: 'formal',
    name: 'Formal',
    description: 'Clear, professional tone',
    prompt: 'Use a clear, professional, formal tone suited to documentation and business communication. Avoid slang and casual phrasing.'
  }
]

export function allStyles(custom: ResponseStyle[]): ResponseStyle[] {
  return [...BUILTIN_STYLES, ...custom]
}

/**
 * The style a chat uses: its own choice, else the default from settings.
 * 'default' (or '') means Claude Code's normal style, i.e. no extra instruction.
 */
export function resolveStyle(chatStyle: string | undefined, defaultStyle: string, custom: ResponseStyle[]): ResponseStyle | undefined {
  const id = chatStyle ?? defaultStyle
  if (!id || id === 'default') return undefined
  return allStyles(custom).find((s) => s.id === id)
}
