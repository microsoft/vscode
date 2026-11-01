// Short AI-written chat titles, like the Claude app's, from the first exchange.
import { query } from './sdk'
import { tmpdir } from 'node:os'
import { resolveClaudeBinary, subscriptionEnv } from './claude'

/** Tidy a model-written title: one line, no quotes or markdown, no trailing period, at most 60 characters. */
export function cleanTitle(raw: string): string | null {
  const unquote = (s: string): string => s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
  let t = (raw.split('\n').find((l) => l.trim()) ?? '').trim()
  t = unquote(t.replace(/^[#>*\s]+/, '').replace(/[*_`]+/g, ''))
  t = unquote(t.replace(/^(title|chat title)\s*[:\-–]\s*/i, ''))
  t = t.replace(/[.。!]+$/, '').trim()
  if (t.length > 60) t = t.slice(0, 57).replace(/\s+\S*$/, '') + '…'
  return t.length >= 2 ? t : null
}

/** Ask Haiku for a 3–7 word title. Tool-free, not saved as a Claude Code session. */
export async function generateTitle(firstUser: string, firstReply: string): Promise<string | null> {
  const prompt =
    'Write a short, specific title (3 to 7 words) for a chat that starts like this. Reply with the title only.\n\n' +
    `<user>\n${firstUser.slice(0, 1500)}\n</user>\n<assistant>\n${firstReply.slice(0, 1500)}\n</assistant>`
  const q = query({
    prompt,
    options: {
      model: 'haiku',
      tools: [],
      maxTurns: 1,
      persistSession: false,
      settingSources: [],
      cwd: tmpdir(),
      env: subscriptionEnv(),
      pathToClaudeCodeExecutable: resolveClaudeBinary(),
      systemPrompt: 'You write concise, specific titles for chat conversations. Reply with the title only.',
      settings: { autoMemoryEnabled: false, enableArtifact: false }
    }
  })
  let out: string | null = null
  for await (const m of q) if (m.type === 'result' && m.subtype === 'success' && !m.is_error) out = cleanTitle(m.result ?? '')
  return out
}
