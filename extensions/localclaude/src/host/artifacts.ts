// Artifacts: an in-process MCP tool Claude uses to create and update standalone
// content (web pages, React apps, SVG, diagrams, documents, code), like artifacts
// in the Claude app. Every version is kept, encrypted with the chat.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { Artifact, ArtifactFrame, ArtifactType } from '../shared/types'
import type { SecureStore } from './store'

export const ARTIFACT_TOOLS = ['mcp__artifacts__create_artifact', 'mcp__artifacts__update_artifact', 'mcp__artifacts__read_artifact']

/** Design canvas placement (only designs use it; chats ignore it). */
const FRAME_FIELDS = {
  section: z.string().max(80).optional().describe('Design canvas only: the section (row) this frame belongs to, e.g. "Mockups · Home"'),
  width: z.number().int().min(64).max(4096).optional().describe('Design canvas only: frame width in px, e.g. 390 for a phone screen'),
  height: z.number().int().min(64).max(8192).optional().describe('Design canvas only: frame height in px, e.g. 844 for a phone screen')
}

function frameOf(args: { section?: string; width?: number; height?: number }, base?: ArtifactFrame): ArtifactFrame | undefined {
  const f = { ...base }
  if (args.section !== undefined) f.section = args.section.trim() || undefined
  if (args.width !== undefined) f.width = args.width
  if (args.height !== undefined) f.height = args.height
  return f.section || f.width || f.height ? f : undefined
}

const TYPES = ['html', 'react', 'svg', 'markdown', 'code', 'mermaid'] as const

const GUIDE = `Artifacts appear in a panel next to the chat, where the user can preview, copy and download them; every update is kept as a new version.
Use an artifact for substantial, self-contained content the user will likely reuse or iterate on: web pages, interactive apps, games, visualizations, diagrams, documents/reports over ~15 lines, and standalone code files or scripts the user asked for. Do NOT use one for short answers, explanations, small snippets, or for files in the user's project (edit those with the normal file tools).
Types:
- html: a complete single-file page (HTML, CSS and JS together). Scripts and styles may load from public CDNs.
- react: one component file with a default export and no required props. Tailwind classes work. Import any npm package (react, lucide-react, recharts, d3, three, …); they load from esm.sh. No local files.
- svg: a single <svg> element.
- mermaid: Mermaid diagram source only (no fences).
- markdown: a document.
- code: source code in any language; set "language".
After creating or updating an artifact, do not repeat its content in your reply; briefly say what it is or what changed. To change an existing artifact, call update_artifact with its id: use old_str/new_str for small edits, or content to rewrite it.`

function short(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function createArtifactServer(ctx: { sessionId: string; store: SecureStore; onChange: (a: Artifact, count: number) => void }) {
  const load = (): Artifact[] => ctx.store.loadArtifacts(ctx.sessionId)
  const save = (list: Artifact[], a: Artifact): void => {
    ctx.store.saveArtifacts(ctx.sessionId, list)
    ctx.onChange(a, list.length)
  }
  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] })
  const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true })

  return createSdkMcpServer({
    name: 'artifacts',
    version: '1.0.0',
    instructions: GUIDE,
    tools: [
      tool(
        'create_artifact',
        'Create an artifact shown in a side panel next to the chat. ' + GUIDE,
        {
          id: z
            .string()
            .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
            .describe('Short kebab-case id, unique in this chat, e.g. "budget-dashboard"'),
          type: z.enum(TYPES),
          title: z.string().min(1).max(120),
          // before content, so the canvas knows where a frame goes while it's still being written
          ...FRAME_FIELDS,
          content: z.string(),
          language: z.string().optional().describe('Language for type "code", e.g. "python"')
        },
        async (args) => {
          const list = load()
          const now = Date.now()
          const existing = list.find((a) => a.id === args.id)
          if (existing) {
            // Re-creating an id is a full rewrite: keep history as a new version.
            existing.versions.push({ content: args.content, ts: now })
            Object.assign(existing, { title: args.title, type: args.type as ArtifactType, language: args.language ?? existing.language, frame: frameOf(args, existing.frame), updatedAt: now })
            save(list, existing)
            return ok(`Artifact "${existing.title}" (${existing.id}) already existed; saved this as version ${existing.versions.length}.`)
          }
          const a: Artifact = {
            id: args.id,
            sessionId: ctx.sessionId,
            title: args.title,
            type: args.type as ArtifactType,
            language: args.language,
            versions: [{ content: args.content, ts: now }],
            frame: frameOf(args),
            createdAt: now,
            updatedAt: now
          }
          list.push(a)
          save(list, a)
          return ok(`Created artifact "${a.title}" (${a.id}, version 1). The user can see it in the artifact panel.`)
        },
        // Loaded up front (not behind tool search) so Claude reaches for it like the Claude app does.
        { alwaysLoad: true, searchHint: 'artifact web page app diagram document', annotations: { title: 'Create artifact' } }
      ),
      tool(
        'update_artifact',
        'Update an existing artifact, creating a new version. Either replace one exact snippet (old_str → new_str; old_str must appear exactly once) or rewrite it entirely with content.',
        {
          id: z.string(),
          old_str: z.string().optional(),
          new_str: z.string().optional(),
          content: z.string().optional().describe('Full new content (rewrite)'),
          title: z.string().max(120).optional(),
          ...FRAME_FIELDS
        },
        async (args) => {
          const list = load()
          const a = list.find((x) => x.id === args.id)
          if (!a) return fail(`No artifact with id "${args.id}" in this chat. Existing ids: ${list.map((x) => x.id).join(', ') || 'none'}.`)
          const current = a.versions[a.versions.length - 1].content
          const moved = args.section !== undefined || args.width !== undefined || args.height !== undefined
          let next: string
          if (args.content !== undefined) next = args.content
          else if (args.old_str !== undefined) {
            const count = current.split(args.old_str).length - 1
            if (count === 0) return fail(`old_str was not found in "${a.title}". Copy it exactly from the latest version, or pass content to rewrite.`)
            if (count > 1) return fail(`old_str appears ${count} times in "${a.title}"; include more surrounding text so it is unique.`)
            next = current.replace(args.old_str, () => args.new_str ?? '')
          } else if (moved && !args.title) {
            // only the frame's place or size changed: no new version
            a.frame = frameOf(args, a.frame)
            save(list, a)
            return ok(`Moved or resized "${short(a.title)}".`)
          } else if (args.title) next = current
          else return fail('Pass old_str/new_str, content, title, or the frame’s section, width and height.')
          if (moved) a.frame = frameOf(args, a.frame)
          const now = Date.now()
          a.versions.push({ content: next, ts: now })
          a.updatedAt = now
          if (args.title) a.title = args.title
          save(list, a)
          return ok(`Updated "${short(a.title)}" to version ${a.versions.length}.`)
        },
        { alwaysLoad: true, searchHint: 'update edit artifact', annotations: { title: 'Update artifact' } }
      ),
      tool(
        'read_artifact',
        "Read an artifact's latest content (or one version), e.g. to reuse a design system's styles. Without an id, lists this chat's artifacts.",
        { id: z.string().optional(), version: z.number().int().min(1).optional().describe('1 = the first version; default the latest') },
        async (args) => {
          const list = load()
          if (!args.id)
            return ok(
              list.length
                ? list.map((a) => `${a.id}: "${a.title}" (${a.type}, ${a.versions.length} version${a.versions.length === 1 ? '' : 's'}${a.frame?.section ? `, section "${a.frame.section}"` : ''})`).join('\n')
                : 'No artifacts yet.'
            )
          const a = list.find((x) => x.id === args.id)
          if (!a) return fail(`No artifact with id "${args.id}". Existing ids: ${list.map((x) => x.id).join(', ') || 'none'}.`)
          const v = a.versions[(args.version ?? a.versions.length) - 1]
          if (!v) return fail(`"${a.title}" has ${a.versions.length} version(s).`)
          return ok(v.content)
        },
        { alwaysLoad: true, searchHint: 'read artifact content', annotations: { title: 'Read artifact', readOnlyHint: true } }
      )
    ]
  })
}

// ---------------------------------------------------------------- preview pages
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Safe to drop inside a <script> block as a JS string literal. */
const jsString = (s: string): string => JSON.stringify(s).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--')

const BASE_STYLE = `<style>html,body{margin:0;background:#fff;color:#1f1e1d;font-family:system-ui,'Segoe UI',sans-serif}</style>`

/** Builds the HTML page that previews an artifact inside the sandboxed panel frame. */
/** Tells the panel when the page throws, so it can offer "Fix with Claude" (a few reports at most). */
const REPORTER = `<script>(function(){var n=0;function r(m){if(n++>4)return;try{parent.postMessage({__lcArtifactError:String(m&&m.stack||m).slice(0,3000)},'*')}catch(e){}}window.__lcReport=r;window.addEventListener('error',function(e){r(e.error||e.message)});window.addEventListener('unhandledrejection',function(e){r(e.reason)})})()</script>`

function withReporter(html: string): string {
  if (/<head[\s>]/i.test(html)) return html.replace(/<head(\s[^>]*)?>/i, (m) => m + REPORTER)
  if (/<html[\s>]/i.test(html)) return html.replace(/<html(\s[^>]*)?>/i, (m) => m + '<head>' + REPORTER + '</head>')
  return REPORTER + html
}

export function renderArtifactPage(type: ArtifactType, content: string): string {
  switch (type) {
    case 'html':
      return /<html[\s>]/i.test(content) ? withReporter(content) : `<!doctype html><html><head><meta charset="utf-8">${REPORTER}${BASE_STYLE}</head><body>${content}</body></html>`
    case 'svg':
      return `<!doctype html><html><head><meta charset="utf-8">${REPORTER}<style>html,body{margin:0;height:100%;background:#fff}body{display:grid;place-items:center}svg{max-width:100%;max-height:100vh}</style></head><body>${content}</body></html>`
    case 'mermaid':
      return `<!doctype html><html><head><meta charset="utf-8">${REPORTER}${BASE_STYLE}<style>body{padding:16px;display:flex;justify-content:center}</style></head><body>
<pre class="mermaid">${esc(content)}</pre>
<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';mermaid.initialize({startOnLoad:false,securityLevel:'strict'});mermaid.run({querySelector:'.mermaid'}).catch((e)=>window.__lcReport(e&&e.message||e));</script>
</body></html>`
    case 'react':
      return `<!doctype html><html><head><meta charset="utf-8">${REPORTER}${BASE_STYLE}
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
<script type="importmap">{"imports":{
"react":"https://esm.sh/react@18.3.1","react/":"https://esm.sh/react@18.3.1/",
"react-dom":"https://esm.sh/react-dom@18.3.1","react-dom/":"https://esm.sh/react-dom@18.3.1/"}}</script>
</head><body><div id="root"></div>
<pre id="err" style="display:none;color:#b4372e;white-space:pre-wrap;padding:16px;font:13px ui-monospace,Consolas,monospace"></pre>
<script type="module">
const showError = (e) => { const el = document.getElementById('err'); el.style.display = 'block'; el.textContent = String(e && e.stack || e); window.__lcReport(e) }
window.addEventListener('error', (e) => showError(e.error || e.message))
try {
  let code = Babel.transform(${jsString(content)}, { presets: [['react', { runtime: 'automatic' }]], filename: 'App.jsx' }).code
  // Bare imports other than React load from esm.sh, sharing this page's React.
  code = code.replace(/(from\\s+|import\\s*\\(\\s*|import\\s+)(["'])([^"'./][^"']*)\\2/g, (m, pre, q, spec) =>
    /^(react|react-dom)(\\/|$)/.test(spec) || /^https?:/.test(spec) ? m : pre + q + 'https://esm.sh/' + spec + '?external=react,react-dom' + q)
  const mod = await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
  const App = mod.default
  if (typeof App !== 'function') throw new Error('The artifact needs a default-exported React component.')
  const { createRoot } = await import('react-dom/client')
  const { createElement } = await import('react')
  createRoot(document.getElementById('root')).render(createElement(App))
} catch (e) { showError(e) }
</script></body></html>`
    default:
      return `<!doctype html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body><pre style="padding:16px">${esc(content)}</pre></body></html>`
  }
}
