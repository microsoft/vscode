// A scripted stand-in for Claude Code, used only by the end-to-end tests (LOCALCLAUDE_FAKE_AGENT=1).
// It speaks the same message protocol as the Agent SDK, calls LocalClaude's in-process MCP tools
// (artifacts, memory, chat search, knowledge) for real, and asks for permissions through canUseTool.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'

type Msg = Record<string, unknown>
type UserMsg = { message: { content: string | { type: string; text?: string }[] }; uuid?: string }
type Options = {
  resume?: string
  model?: string
  cwd?: string
  permissionMode?: string
  mcpServers?: Record<string, { type?: string; instance?: { connect: (t: unknown) => Promise<void> } }>
  canUseTool?: (name: string, input: Record<string, unknown>, o: { signal: AbortSignal; suggestions?: unknown[] }) => Promise<{ behavior: string; message?: string }>
  abortController?: AbortController
}

class Channel<T> {
  private items: T[] = []
  private waiters: ((r: IteratorResult<T>) => void)[] = []
  private done = false
  push(v: T): void {
    const w = this.waiters.shift()
    if (w) w({ value: v, done: false })
    else this.items.push(v)
  }
  end(): void {
    this.done = true
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true })
  }
  next(): Promise<IteratorResult<T>> {
    if (this.items.length) return Promise.resolve({ value: this.items.shift() as T, done: false })
    if (this.done) return Promise.resolve({ value: undefined as never, done: true })
    return new Promise((r) => this.waiters.push(r))
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function imageCount(m: UserMsg): number {
  const c = m.message.content
  return Array.isArray(c) ? c.filter((b) => b.type === 'image').length : 0
}

/** A 640x400 gradient PNG standing in for a screenshot. */
function fakeScreenshot(): string {
  const w = 640
  const h = 400
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      px[i] = Math.round(120 + (x * 100) / w)
      px[i + 1] = Math.round(90 + (y * 80) / h)
      px[i + 2] = 200
      px[i + 3] = 255
    }
  return nativeImage.createFromBitmap(px, { width: w, height: h }).toPNG().toString('base64')
}

function lastText(m: UserMsg): string {
  const c = m.message.content
  if (typeof c === 'string') return c
  const texts = c.filter((b) => b.type === 'text').map((b) => b.text ?? '')
  return texts[texts.length - 1] ?? ''
}

export function fakeQuery({ prompt, options = {} }: { prompt: string | AsyncIterable<UserMsg>; options?: Options }) {
  const out = new Channel<Msg>()
  const sessionId = options.resume ?? randomUUID()
  const clients = new Map<string, Client>()
  let interrupted = false
  options.abortController?.signal.addEventListener('abort', () => out.end())

  const tool = async (server: string, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> => {
    let c = clients.get(server)
    if (!c) {
      const cfg = options.mcpServers?.[server]
      if (!cfg?.instance) return { text: `No ${server} server`, isError: true }
      const [a, b] = InMemoryTransport.createLinkedPair()
      await cfg.instance.connect(a)
      c = new Client({ name: 'fake-claude', version: '1' })
      await c.connect(b)
      clients.set(server, c)
    }
    const r = (await c.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean }
    return { text: r.content.map((x) => x.text ?? '').join('\n'), isError: !!r.isError }
  }

  /** One assistant turn: optional tool calls, then streamed text, then a result. */
  const turn = async (text: string, images = 0): Promise<void> => {
    interrupted = false
    const t = text.toLowerCase()
    const callTool = async (name: string, input: Record<string, unknown>, run: () => Promise<{ text: string; isError: boolean }>, extra?: Msg): Promise<void> => {
      const id = 'toolu_' + randomUUID().slice(0, 8)
      out.push({ type: 'assistant', uuid: randomUUID(), parent_tool_use_id: null, message: { id: 'msg_' + randomUUID().slice(0, 8), content: [{ type: 'tool_use', id, name, input }] } })
      const r = await run()
      out.push({
        type: 'user',
        uuid: randomUUID(),
        parent_tool_use_id: null,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: r.text, is_error: r.isError }] },
        ...extra
      })
    }
    /** A tool call whose input streams in small pieces, as Claude Code sends a long one. */
    const streamTool = async (name: string, input: Record<string, unknown>, run: () => Promise<{ text: string; isError: boolean }>): Promise<void> => {
      const id = 'toolu_' + randomUUID().slice(0, 8)
      const mid = 'msg_' + randomUUID().slice(0, 8)
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: mid } } })
      out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name } } })
      const json = JSON.stringify(input)
      for (let i = 0; i < json.length && !interrupted; i += 40) {
        out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 40) } } })
        await sleep(60)
      }
      out.push({ type: 'assistant', uuid: randomUUID(), parent_tool_use_id: null, message: { id: mid, content: [{ type: 'tool_use', id, name, input }] } })
      const r = await run()
      out.push({ type: 'user', uuid: randomUUID(), parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: r.text, is_error: r.isError }] } })
    }
    let reply = `Echo: ${text}` + (images ? ` (with ${images} image${images === 1 ? '' : 's'})` : '')
    if (t.includes('design a travel app')) {
      // several frames: a design system written live, then two subagents writing their screens at the same time
      const design = {
        id: 'design-system',
        type: 'html',
        title: 'Design system',
        section: 'Design system',
        width: 1200,
        height: 900,
        content:
          '<!doctype html><html><head><meta charset="utf-8"><style>:root{--sun:#e8a35b;--ink:#2b2118;--paper:#fbf4ea}body{margin:0;padding:48px;font-family:Georgia,serif;background:var(--paper);color:var(--ink)}.swatch{display:inline-block;width:120px;height:120px;border-radius:16px;margin-right:16px}</style></head>' +
          '<body><h1 id="ds-title">Golden hour</h1><div class="swatch" style="background:var(--sun)"></div><div class="swatch" style="background:var(--ink)"></div><h2>Type scale</h2><p>Fraunces for headings, Plus Jakarta Sans for text.</p></body></html>'
      }
      await streamTool('mcp__artifacts__create_artifact', design, () => tool('artifacts', 'create_artifact', design))
      const screens = [
        { id: 'home', title: 'Home', line: 'Coorg monsoon ride · 3 days to go' },
        { id: 'trip', title: 'Trip details', line: 'Mysuru → Kushalnagar → Madikeri' }
      ]
      const agents = screens.map(() => 'toolu_' + randomUUID().slice(0, 8))
      out.push({
        type: 'assistant',
        uuid: randomUUID(),
        parent_tool_use_id: null,
        message: { id: 'msg_' + randomUUID().slice(0, 8), content: screens.map((s, i) => ({ type: 'tool_use', id: agents[i], name: 'Agent', input: { description: s.title, subagent_type: 'design-screen', prompt: `Make the ${s.title} frame: ${s.line}` } })) }
      })
      await Promise.all(
        screens.map(async (s, i) => {
          const parent = agents[i]
          const sub = async (name: string, input: Record<string, unknown>): Promise<void> => {
            const id = 'toolu_' + randomUUID().slice(0, 8)
            out.push({ type: 'assistant', uuid: randomUUID(), parent_tool_use_id: parent, message: { id: 'msg_' + randomUUID().slice(0, 8), content: [{ type: 'tool_use', id, name, input }] } })
            const r = await tool('artifacts', name.replace('mcp__artifacts__', ''), input)
            out.push({ type: 'user', uuid: randomUUID(), parent_tool_use_id: parent, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: r.text, is_error: r.isError }] } })
          }
          await sub('mcp__artifacts__read_artifact', { id: 'design-system' })
          // long enough to see the placeholders on the board
          await sleep(1500 + i * 300)
          await sub('mcp__artifacts__create_artifact', {
            id: s.id,
            type: 'html',
            title: s.title,
            section: 'Mockups',
            width: 390,
            height: 844,
            content: `<!doctype html><html><head><meta charset="utf-8"><style>:root{--sun:#e8a35b;--ink:#2b2118}body{margin:0;padding:32px 24px;font-family:Georgia,serif;color:var(--ink);background:#fff}</style></head><body><h1 id="${s.id}-title">${s.title}</h1><p>${s.line}</p></body></html>`
          })
          out.push({ type: 'user', uuid: randomUUID(), parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: parent, content: `Made the ${s.title} frame.` }] } })
        })
      )
      reply = 'I made a design system and two screens.'
    } else if (t.startsWith('comment on the frame')) {
      // a comment from the design canvas names the element; this design has one headline to change
      const input = { id: 'bakery-landing', old_str: 'Fresh bread daily', new_str: 'Warm bread, every morning' }
      await callTool('mcp__artifacts__update_artifact', input, () => tool('artifacts', 'update_artifact', input))
      reply = 'Changed the headline.'
    } else if (t.includes('design a bakery')) {
      // written slowly enough to watch it appear on the canvas; the script at the end only runs in the finished page
      const loaves = ['Country sourdough', 'Seeded rye', 'Brioche', 'Olive fougasse', 'Cinnamon knots', 'Baguette']
      const content =
        '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Georgia,serif;background:#fbf6ee;color:#3b2a1a}header{padding:56px 40px}h1{font-size:44px;margin:0 0 12px}button{background:#b4542d;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:16px}.menu{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 40px 56px}.loaf{background:#fff;border-radius:12px;padding:20px}</style></head>' +
        '<body><header><h1 id="hero">Fresh bread daily</h1><p class="lead">Order by 8 pm, pick it up warm at 7 am.</p><button>Pre-order</button></header>' +
        `<section class="menu">${loaves.map((l, i) => `<div class="loaf"><h3>${l}</h3><p>Baked every morning from stone-ground flour, with a long slow rise for flavour. ₹${180 + i * 40}</p></div>`).join('')}</section>` +
        '<script>document.body.dataset.ready="yes"</script></body></html>'
      const input = { id: 'bakery-landing', type: 'html', title: 'Bakery landing page', content }
      await streamTool('mcp__artifacts__create_artifact', input, () => tool('artifacts', 'create_artifact', input))
      reply = 'I designed a landing page for the bakery.'
    } else if (t.includes('make broken artifact')) {
      const input = { id: 'broken-page', type: 'html', title: 'Broken page', content: '<h1>Broken</h1><script>throw new Error("boom from the page")</script>' }
      await callTool('mcp__artifacts__create_artifact', input, () => tool('artifacts', 'create_artifact', input))
      reply = 'I made a page (it has a bug).'
    } else if (t.includes('make artifact')) {
      await callTool('mcp__artifacts__create_artifact', { id: 'demo-page', type: 'html', title: 'Demo page', content: '<h1>Hello from the demo</h1>' }, () =>
        tool('artifacts', 'create_artifact', { id: 'demo-page', type: 'html', title: 'Demo page', content: '<h1>Hello from the demo</h1>' })
      )
      reply = 'I made a demo page.'
    } else if (t.startsWith('remember ')) {
      const fact = text.slice(9)
      await callTool('mcp__memory__remember', { text: fact }, () => tool('memory', 'remember', { text: fact }))
      reply = 'Noted.'
    } else if (t.includes('ask permission')) {
      const input = { command: 'echo hi', description: 'Say hi' }
      const id = 'toolu_' + randomUUID().slice(0, 8)
      out.push({ type: 'assistant', uuid: randomUUID(), parent_tool_use_id: null, message: { id: 'msg_' + randomUUID().slice(0, 8), content: [{ type: 'tool_use', id, name: 'Bash', input }] } })
      const d = (await options.canUseTool?.('Bash', input, { signal: new AbortController().signal, suggestions: [] })) ?? { behavior: 'allow' }
      const ok = d.behavior === 'allow'
      out.push({ type: 'user', uuid: randomUUID(), parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: ok ? 'hi' : d.message ?? 'denied', is_error: !ok }] } })
      reply = ok ? 'Permission granted, the command ran.' : 'Permission denied.'
    } else if (t.includes('edit file')) {
      const input = { file_path: 'C:/demo/app.ts', old_string: 'old line', new_string: 'new line' }
      await callTool('Edit', input, async () => ({ text: 'ok', isError: false }), {
        tool_use_result: { filePath: input.file_path, structuredPatch: [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-old line', '+new line'] }] }
      })
      reply = 'Edited app.ts.'
    } else if (t.startsWith('search my chats for ')) {
      const q = text.slice('search my chats for '.length)
      let found = ''
      await callTool('mcp__chats__search_chats', { query: q }, async () => {
        const r = await tool('chats', 'search_chats', { query: q })
        found = r.text
        return r
      })
      reply = `Found: ${found.split('\n')[0] ?? ''}`
    } else if (t.startsWith('search knowledge for ')) {
      const q = text.slice('search knowledge for '.length)
      let found = ''
      await callTool('mcp__knowledge__search_knowledge', { query: q }, async () => {
        const r = await tool('knowledge', 'search_knowledge', { query: q })
        found = r.text
        return r
      })
      reply = `Knowledge: ${found.slice(0, 200)}`
    } else if (t.startsWith('save a note titled ')) {
      const title = text.slice('save a note titled '.length).trim()
      const input = { title, content: `Plans for ${title}. See [[Ideas]].` }
      let saved = ''
      await callTool('mcp__knowledge__save_note', input, async () => {
        const r = await tool('knowledge', 'save_note', input)
        saved = r.text
        return r
      })
      reply = `Note: ${saved}`
    } else if (t.includes('plan tasks')) {
      const todos = [
        { content: 'Read the code', activeForm: 'Reading the code', status: 'completed' },
        { content: 'Write tests', activeForm: 'Writing tests', status: 'in_progress' },
        { content: 'Fix the bug', activeForm: 'Fixing the bug', status: 'pending' }
      ]
      await callTool('TodoWrite', { todos }, async () => ({ text: 'Todos updated', isError: false }))
      // work on them for a moment, so the task list can be seen
      for (let i = 0; i < 25 && !interrupted; i++) await sleep(100)
      reply = 'Tasks planned.'
    } else if (t.includes('take a screenshot')) {
      const id = 'toolu_' + randomUUID().slice(0, 8)
      out.push({ type: 'assistant', uuid: randomUUID(), parent_tool_use_id: null, message: { id: 'msg_' + randomUUID().slice(0, 8), content: [{ type: 'tool_use', id, name: 'mcp__computer-use__computer', input: { action: 'screenshot' } }] } })
      const shot = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: fakeScreenshot() } }
      out.push({ type: 'user', uuid: randomUUID(), parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: [shot] }] } })
      reply = 'Here is your screen.'
    } else if (t.includes('slow')) {
      for (let i = 0; i < 30 && !interrupted; i++) await sleep(100)
    }
    if (interrupted) {
      out.push({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['interrupted'], usage: {}, duration_ms: 1, num_turns: 1 })
      return
    }
    const mid = 'msg_' + randomUUID().slice(0, 8)
    out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: mid } } })
    out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } })
    for (const chunk of reply.match(/.{1,12}/g) ?? [reply]) out.push({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } } })
    out.push({ type: 'assistant', uuid: randomUUID(), parent_tool_use_id: null, message: { id: mid, content: [{ type: 'text', text: reply }] } })
    out.push({ type: 'result', subtype: 'success', is_error: false, result: reply, total_cost_usd: 0, usage: { input_tokens: 12, output_tokens: 6 }, duration_ms: 5, num_turns: 1 })
  }

  void (async () => {
    if (typeof prompt === 'string') {
      // one-off requests (chat titles)
      const user = /<user>\n?([\s\S]*?)\n?<\/user>/.exec(prompt)?.[1] ?? prompt
      const title = 'Chat about ' + user.split(/\s+/).slice(0, 3).join(' ')
      out.push({ type: 'result', subtype: 'success', is_error: false, result: title, usage: {}, duration_ms: 1, num_turns: 1 })
      out.end()
      return
    }
    out.push({
      type: 'system',
      subtype: 'init',
      session_id: sessionId,
      model: options.model || 'claude-fake-1',
      cwd: options.cwd ?? '',
      tools: ['Read', 'Edit', 'Bash'],
      slash_commands: ['compact', 'context'],
      skills: [],
      mcp_servers: Object.keys(options.mcpServers ?? {}).map((name) => ({ name, status: 'connected' })),
      apiKeySource: 'none',
      claude_code_version: 'fake',
      permissionMode: options.permissionMode ?? 'default'
    })
    for await (const m of prompt) await turn(lastText(m), imageCount(m))
    out.end()
  })()

  const it = {
    next: () => out.next(),
    return: async () => {
      out.end()
      return { value: undefined, done: true }
    },
    [Symbol.asyncIterator]() {
      return this
    },
    interrupt: async () => {
      interrupted = true
    },
    setPermissionMode: async () => {},
    setModel: async () => {},
    supportedCommands: async () => [
      { name: 'compact', description: 'Summarize the conversation to free up context', argumentHint: '' },
      { name: 'context', description: 'Show context usage', argumentHint: '' }
    ],
    supportedModels: async () => [{ value: 'fake', displayName: 'Fake model', description: 'Used in tests' }],
    accountInfo: async () => ({ email: 'e2e@example.com', subscriptionType: 'max' }),
    mcpServerStatus: async () => Object.keys(options.mcpServers ?? {}).map((name) => ({ name, status: 'connected' })),
    toggleMcpServer: async () => {},
    reconnectMcpServer: async () => {},
    getContextUsage: async () => ({ percentage: 12, totalTokens: 24000, maxTokens: 200000, rawMaxTokens: 200000, categories: [{ name: 'Messages', tokens: 20000, color: '', kind: 'used' }] }),
    rewindFiles: async (_id: string, o?: { dryRun?: boolean }) => (o?.dryRun ? { canRewind: true, filesChanged: [], insertions: 0, deletions: 0 } : { canRewind: true, filesChanged: [] }),
    usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async () => ({
      subscription_type: 'max',
      rate_limits_available: true,
      rate_limits: { five_hour: { utilization: 37, resets_at: new Date(Date.now() + 7200000).toISOString() }, seven_day: { utilization: 12, resets_at: null } },
      session: {},
      behaviors: null
    })
  }
  return it
}
