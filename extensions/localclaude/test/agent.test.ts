// Bridge tests: (1) synthetic SDK stream -> history, (2) real Claude Code spawn without credentials.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { PROJECT_KNOWLEDGE_LIMIT, SessionManager, systemAppend } from '../src/host/agent'
import { ARTIFACT_TOOLS, createArtifactServer, renderArtifactPage } from '../src/host/artifacts'
import { designPrompt, withDesignBridge } from '../src/host/design'
import { streamingFields } from '../src/shared/partialJson'
import { backupDue, backupFileName, backupZip, createBackup, decryptBackup, encryptBackup, isEncryptedBackup, pruneBackups, writeBackupTo } from '../src/host/backup'
import { buildChatsExport, buildFullExport, buildProjectExport, chatMarkdown, importBackup, importedContext, parseBackup, readBackup } from '../src/host/exporter'
import { MEMORY_TOOLS, addMemory, createMemoryServer, editMemory, getMemory, removeMemory } from '../src/host/memory'
import { createZip, readZip } from '../src/host/zip'
import { branchName, createWorktree, gitStatus } from '../src/host/git'
import { testMcpServer } from '../src/host/mcpCheck'
import { addProjectDir, createProject, removeProjectDir, setProjectMainDir } from '../src/host/projects'
import { RemoteControl, isFolderTrusted, readRemoteOutput, trustFolder } from '../src/host/remoteControl'
import { fakeRemoteCommand } from '../src/host/fakeRemote'
import type { RemoteState } from '../src/shared/types'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { CHAT_TOOLS, ChatIndex, chatText, createChatsServer, snippet, terms } from '../src/host/chatSearch'
import { imageSize, referencedImages, resultImages, sniffImageType, storeImage } from '../src/host/images'
import { docxText, extractBuffer, pptxText, xlsxText } from '../src/host/extract'
import { KNOWLEDGE_TOOLS, KnowledgeIndex, KnowledgeService, NOTE_TOOL, createKnowledgeServer, passages, tokenize } from '../src/host/knowledge'
import { VaultSync, appFolder, detectVaults, obsidianUri } from '../src/host/obsidian'
import { notificationFor } from '../src/host/notify'
import { cleanTitle } from '../src/host/titles'
import { projectDirName, transcriptExists } from '../src/host/transcripts'
import { mapUsage } from '../src/host/usage'
import { resolveStyle } from '../src/shared/styles'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DEFAULT_EXPORT_OPTIONS } from '../src/shared/types'
import type { AgentEvent, ChatMessage, SessionMeta, AppSettings } from '../src/shared/types'
import { DEFAULT_SETTINGS } from '../src/shared/types'
import { applyEvent } from '../src/shared/reducer'
import { COMPUTER_TOOL, stepText, summarize } from '../src/shared/steps'
import { countChanges, diffStrings, linesFromPatch } from '../src/shared/diff'
import assert from 'node:assert/strict'

const sessions: SessionMeta[] = []
const savedImages = new Map<string, Buffer>()
const store: any = {
  saveImage: (sid: string, id: string, data: Buffer) => savedImages.set(`${sid}/${id}`, data),
  loadImage: (sid: string, id: string) => savedImages.get(`${sid}/${id}`) ?? null,
  pruneImages: () => 0,
  getSettings: (): AppSettings => ({ ...DEFAULT_SETTINGS, defaultCwd: process.cwd(), loadUserSettings: false, loadProjectSettings: false }),
  getSession: (id: string) => sessions.find((s) => s.id === id),
  upsertSession: (m: SessionMeta) => { const i = sessions.findIndex((s) => s.id === m.id); i >= 0 ? (sessions[i] = m) : sessions.push(m) },
  loadHistory: () => [],
  saveHistory: () => {},
  deleteSession: () => {},
  getGlobalMemory: () => [],
  setGlobalMemory: () => {},
  getProject: () => undefined
}
const events: AgentEvent[] = []
let rendererView: ChatMessage[] = []
// these tests use made-up Claude Code session ids, so pretend their transcripts exist
const mgr = new SessionManager(store, (e) => { events.push(e); if ('sessionId' in e) rendererView = applyEvent(rendererView, e) }, { transcriptExists: () => true })

async function synthetic() {
  const meta = mgr.create(process.cwd())
  const s: any = (mgr as any).get(meta.id)
  const sid = meta.id
  const h = (m: any) => s.handle(m)
  h({ type: 'system', subtype: 'init', session_id: 'sdk-123', model: 'claude-test', cwd: '/x', tools: ['Bash'], slash_commands: ['review'], skills: [], mcp_servers: [], apiKeySource: 'none', claude_code_version: '9', permissionMode: 'default' })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'm1' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 1, content_block: { type: 'text' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hello ' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'world' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 't1', name: 'Bash' } } })
  h({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"command":"ls"' } } })
  // Claude Code emits complete assistant messages per block with the same API id
  h({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm1', content: [{ type: 'thinking', thinking: 'hmm' }] } })
  h({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm1', content: [{ type: 'text', text: 'Hello world' }] } })
  h({ type: 'assistant', parent_tool_use_id: null, message: { id: 'm1', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } })
  h({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'a.txt' }] }] } })
  // subagent message without streaming
  h({ type: 'assistant', parent_tool_use_id: 't1', message: { id: 'm2', content: [{ type: 'text', text: 'sub step' }] } })
  h({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', utilization: 0.8, rateLimitType: 'five_hour', resetsAt: 1 } })
  h({ type: 'result', subtype: 'success', is_error: false, result: 'Hello world', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 }, duration_ms: 1000, num_turns: 1 })

  const hist: ChatMessage[] = s.history
  assert.equal(hist.length, 2, 'two assistant messages')
  const m1 = hist[0]
  assert.deepEqual(m1.parts.map((p) => p.kind), ['thinking', 'text', 'tool'])
  assert.equal((m1.parts[1] as any).text, 'Hello world')
  const tool = m1.parts[2] as any
  assert.equal(tool.result, 'a.txt'); assert.equal(tool.done, true); assert.deepEqual(tool.input, { command: 'ls' })
  assert.equal(hist[1].parentToolUseId, 't1')
  assert.equal(s.meta.sdkSessionId, 'sdk-123')
  assert.deepEqual(rendererView, hist, 'renderer reducer view matches main history')
  assert.ok(events.some((e) => e.type === 'rate-limit'))
  assert.ok(events.some((e) => e.type === 'turn-done'))
  console.log('✓ synthetic stream: history, streaming merge, tool results, subagents, renderer parity')

  // permission round-trip
  let decided: any
  const p = s.canUseTool('Bash', { command: 'rm x' }, { signal: new AbortController().signal, suggestions: [{ type: 'addRules' }] })
  const req = events.filter((e) => e.type === 'permission').pop() as any
  assert.equal(req.request.toolName, 'Bash'); assert.equal(req.request.hasSuggestions, true)
  mgr.respond(sid, req.request.requestId, { behavior: 'allow', always: true })
  decided = await p
  assert.equal(decided.behavior, 'allow'); assert.ok(decided.updatedPermissions)
  const p2 = s.canUseTool('Write', {}, { signal: new AbortController().signal })
  const req2 = events.filter((e) => e.type === 'permission').pop() as any
  mgr.respond(sid, req2.request.requestId, { behavior: 'deny', message: 'no' })
  assert.deepEqual(await p2, { behavior: 'deny', message: 'no' })
  // AskUserQuestion answers flow back as updatedInput
  const p3 = s.canUseTool('AskUserQuestion', { questions: [{ question: 'Q?' }] }, { signal: new AbortController().signal })
  const req3 = events.filter((e) => e.type === 'permission').pop() as any
  mgr.respond(sid, req3.request.requestId, { behavior: 'allow', updatedInput: { questions: [{ question: 'Q?' }], answers: { 'Q?': 'A' } } })
  assert.deepEqual((await p3).updatedInput.answers, { 'Q?': 'A' })
  // abort cancels
  const ac = new AbortController()
  const p4 = s.canUseTool('Bash', {}, { signal: ac.signal }); ac.abort()
  assert.equal((await p4).behavior, 'deny')
  console.log('✓ permissions: allow/always, deny with message, AskUserQuestion answers, abort')
}

async function checkpointsAndRewind() {
  const meta = mgr.create(process.cwd())
  const s: any = (mgr as any).get(meta.id)
  const sid = meta.id
  const h = (m: any) => s.handle(m)
  // don't spawn Claude Code: capture what would be sent
  const sent: any[] = []
  s.ensureStarted = () => { s.queue ??= { push: (m: any) => sent.push(m), close() {} } }

  // first message of a fresh chat: forks at "start", carries a checkpoint uuid
  mgr.send({ sessionId: sid, text: 'make a file', attachments: [] })
  const u1 = s.history[0]
  assert.equal(u1.forkAt, 'start'); assert.ok(u1.uuid); assert.equal(sent[0].uuid, u1.uuid)

  h({ type: 'system', subtype: 'init', session_id: 'sdk-rw', model: 'm', cwd: '/x', tools: [], slash_commands: [], skills: [], mcp_servers: [], apiKeySource: 'none', claude_code_version: '9', permissionMode: 'default' })
  h({ type: 'assistant', uuid: 'a-uuid-1', parent_tool_use_id: null, message: { id: 'r1', content: [{ type: 'tool_use', id: 'e1', name: 'Edit', input: { file_path: 'a.ts', old_string: 'x', new_string: 'y' } }] } })
  const patch = [{ oldStart: 3, oldLines: 1, newStart: 3, newLines: 1, lines: ['-x', '+y'] }]
  h({ type: 'user', uuid: 'u-uuid-1', parent_tool_use_id: null, tool_use_result: { filePath: 'a.ts', structuredPatch: patch }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'e1', content: 'ok' }] } })
  h({ type: 'assistant', uuid: 'a-uuid-2', parent_tool_use_id: null, message: { id: 'r2', content: [{ type: 'text', text: 'Done' }] } })
  h({ type: 'result', subtype: 'success', is_error: false, result: 'Done', total_cost_usd: 0, usage: {}, duration_ms: 1, num_turns: 1 })
  const edit = s.history.find((m: any) => m.id === 'a-r1').parts[0]
  assert.deepEqual(edit.patch, patch, 'structured patch attached to the Edit result')
  assert.equal(s.meta.tip, 'a-uuid-2', 'tip = last top-level transcript entry of the turn')

  // second message forks at the first turn's tip
  mgr.send({ sessionId: sid, text: 'now change it', attachments: [] })
  const u2 = s.history[s.history.length - 1]
  assert.equal(u2.forkAt, 'a-uuid-2')
  h({ type: 'result', subtype: 'success', is_error: false, result: '', total_cost_usd: 0, usage: {}, duration_ms: 1, num_turns: 1 })

  // code-only rewind asks Claude Code to restore files and keeps the conversation
  const calls: any[] = []
  s.q = { rewindFiles: async (id: string, o?: any) => (calls.push([id, o]), { canRewind: true, filesChanged: ['a.ts'], insertions: 1, deletions: 1 }), interrupt: async () => {} }
  const prev = await mgr.rewindPreview(sid, u2.id)
  assert.deepEqual(calls[0], [u2.uuid, { dryRun: true }]); assert.equal(prev.filesChanged?.length, 1)
  const before = s.history.length
  const rc = await mgr.rewind(sid, { messageId: u2.id, code: true, conversation: false })
  assert.ok(rc.ok); assert.equal(calls[2][0], u2.uuid); assert.equal(calls[2][1], undefined, 'real (non-dry) rewind')
  assert.equal(rc.filesChanged, 1); assert.equal(s.history.length, before + 1, 'adds a "Restored" note')

  // conversation rewind drops the message and everything after; next start resumes at the fork point
  events.length = 0
  s.running = false
  const rv = await mgr.rewind(sid, { messageId: u2.id, code: false, conversation: true })
  assert.ok(rv.ok); assert.equal(rv.text, 'now change it')
  assert.ok(!s.history.some((m: any) => m.id === u2.id))
  assert.equal(s.meta.resumeAt, 'a-uuid-2'); assert.equal(s.meta.sdkSessionId, 'sdk-rw')
  assert.ok(events.some((e) => e.type === 'history-reset'))
  delete s.ensureStarted
  const opts = s.buildOptions()
  assert.equal(opts.resume, 'sdk-rw'); assert.equal(opts.resumeSessionAt, 'a-uuid-2'); assert.equal(opts.enableFileCheckpointing, true)

  // rewinding the first message starts a fresh transcript
  s.ensureStarted = () => {}
  const r0 = await mgr.rewind(sid, { messageId: u1.id, code: false, conversation: true })
  assert.ok(r0.ok); assert.equal(s.history.length, 0); assert.equal(s.meta.sdkSessionId, undefined); assert.equal(s.meta.resumeAt, undefined)
  console.log('✓ checkpoints: uuids, fork points, structured diffs, code rewind, conversation rewind, resumeSessionAt')
}

async function slashCommandOutput() {
  const meta = mgr.create(process.cwd())
  const s: any = (mgr as any).get(meta.id)
  const h = (m: any) => s.handle(m)
  // built-in commands like /model report through local_command_output
  h({ type: 'system', subtype: 'local_command_output', content: 'Current model: Opus', uuid: 'c1', session_id: 'x' })
  h({ type: 'result', subtype: 'success', is_error: false, result: '', total_cost_usd: 0, usage: {}, duration_ms: 1, num_turns: 0 })
  assert.equal(s.history.at(-1).parts[0].text, 'Current model: Opus')
  // others only answer through the result text
  h({ type: 'result', subtype: 'success', is_error: false, result: 'Compacted.', total_cost_usd: 0, usage: {}, duration_ms: 1, num_turns: 0 })
  assert.equal(s.history.at(-1).parts[0].text, 'Compacted.')
  // a normal turn's result is not duplicated
  const n = s.history.length
  h({ type: 'assistant', uuid: 'q', parent_tool_use_id: null, message: { id: 'z1', content: [{ type: 'text', text: 'Hi' }] } })
  h({ type: 'result', subtype: 'success', is_error: false, result: 'Hi', total_cost_usd: 0, usage: {}, duration_ms: 1, num_turns: 1 })
  assert.equal(s.history.length, n + 1)
  console.log('✓ slash commands: local command output and result-only replies are shown')
}

async function computerUseOption() {
  const st = store.getSettings
  store.getSettings = () => ({ ...st(), computerUse: true })
  const meta = mgr.create(process.cwd())
  const opts = (mgr as any).get(meta.id).buildOptions()
  assert.equal(opts.mcpServers['computer-use']?.type, 'sdk', 'computer-use server registered in-process')
  store.getSettings = st
  const off = (mgr as any).get(mgr.create(process.cwd()).id).buildOptions()
  assert.equal(off.mcpServers['computer-use'], undefined)
  console.log('✓ computer use: in-process MCP server only when enabled')
}

async function artifactTool() {
  const saved: Record<string, any[]> = {}
  const changes: any[] = []
  const fakeStore: any = { loadArtifacts: (sid: string) => saved[sid] ?? [], saveArtifacts: (sid: string, list: any[]) => (saved[sid] = JSON.parse(JSON.stringify(list))) }
  const srv: any = createArtifactServer({ sessionId: 'chat1', store: fakeStore, onChange: (a) => changes.push(a) })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await srv.instance.connect(a)
  const client = new Client({ name: 't', version: '1' })
  await client.connect(b)
  const names = (await client.listTools()).tools.map((t) => t.name).sort()
  assert.deepEqual(names, ['create_artifact', 'read_artifact', 'update_artifact'])
  const call = async (name: string, args: any) => (await client.callTool({ name, arguments: args })) as any
  await call('create_artifact', { id: 'todo-app', type: 'react', title: 'Todo app', content: 'export default () => <p>hi</p>' })
  assert.equal(saved.chat1[0].versions.length, 1); assert.equal(changes.at(-1).title, 'Todo app')
  const up = await call('update_artifact', { id: 'todo-app', old_str: '<p>hi</p>', new_str: '<p>hello</p>' })
  assert.ok(!up.isError); assert.equal(saved.chat1[0].versions.at(-1).content, 'export default () => <p>hello</p>')
  assert.ok((await call('update_artifact', { id: 'todo-app', old_str: 'nope', new_str: 'x' })).isError, 'missing old_str fails')
  assert.ok((await call('update_artifact', { id: 'other', content: 'x' })).isError, 'unknown id fails')
  await call('update_artifact', { id: 'todo-app', content: 'v3', title: 'Todos' })
  assert.equal(saved.chat1[0].versions.length, 3); assert.equal(saved.chat1[0].title, 'Todos')
  // design frames: a section and a size; moving one doesn't make a version; read_artifact gives it back
  await call('create_artifact', { id: 'home', type: 'html', title: 'Home', section: 'Mockups', width: 390, height: 844, content: '<h1>Home</h1>' })
  assert.deepEqual(saved.chat1[1].frame, { section: 'Mockups', width: 390, height: 844 })
  assert.equal(saved.chat1[0].frame, undefined, 'chats have no frames')
  assert.ok(!(await call('update_artifact', { id: 'home', section: 'Final' })).isError)
  assert.deepEqual(saved.chat1[1].frame, { section: 'Final', width: 390, height: 844 }); assert.equal(saved.chat1[1].versions.length, 1)
  assert.equal((await call('read_artifact', { id: 'home' })).content[0].text, '<h1>Home</h1>')
  assert.equal((await call('read_artifact', { id: 'todo-app', version: 1 })).content[0].text, 'export default () => <p>hi</p>')
  assert.match((await call('read_artifact', {})).content[0].text, /home: "Home" \(html, 1 version, section "Final"\)/)
  assert.ok((await call('read_artifact', { id: 'nope' })).isError)
  assert.match(renderArtifactPage('react', 'export default function A(){}'), /importmap/)
  assert.match(renderArtifactPage('svg', '<svg/>'), /<svg\/>/)
  // every preview tells the panel when it throws (for "Fix with Claude")
  for (const type of ['html', 'svg', 'react', 'mermaid'] as const) assert.match(renderArtifactPage(type, 'x'), /__lcArtifactError/, type)
  assert.match(renderArtifactPage('html', '<html><head><title>t</title></head><body>hi</body></html>'), /^<html><head><script>\(function\(\)\{var n=0;[\s\S]*<title>t<\/title>/)
  assert.match(renderArtifactPage('mermaid', 'graph TD; A-->B'), /mermaid\.run\(/)
  assert.ok(!renderArtifactPage('mermaid', 'graph TD; A-->B</script>').includes('A-->B</script>'), 'mermaid source is escaped')
  console.log('✓ artifacts: create, edit by snippet, rewrite, versions, errors, preview pages')
}

function projectPrompt() {
  const project: any = { id: 'p1', name: 'Firmware', description: 'F29 board', instructions: 'Answer in C.', files: [{ id: 'f1', name: 'spec.md', size: 5, addedAt: 0 }, { id: 'f2', name: 'big.txt', size: 9, addedAt: 0 }] }
  const files = { f1: 'SPEC', f2: 'small' }
  const out = systemAppend('Be brief.', project, { loadProjectFiles: () => files })!
  assert.ok(out.startsWith('Be brief.'))
  assert.match(out, /<project name="Firmware">/); assert.match(out, /Answer in C\./); assert.match(out, /<file name="spec.md">\nSPEC\n<\/file>/)
  const huge = systemAppend('', project, { loadProjectFiles: () => ({ f1: 'SPEC', f2: 'x'.repeat(PROJECT_KNOWLEDGE_LIMIT + 50) }) })!
  assert.match(huge, /<knowledge_files count="2">\n- spec\.md \(4 characters\)\n- big\.txt \(400,050 characters\)/); assert.ok(!huge.includes('xxxx'), 'too much: searched, not sent')
  assert.match(huge, /use search_knowledge/i)
  assert.equal(systemAppend('', undefined, { loadProjectFiles: () => ({}) }), undefined)
  // chats created in a project use its folder and get the artifacts tool without prompts
  const st = store.getSettings
  store.getProject = (id: string) => (id === 'p1' ? { ...project, cwd: 'C:\\proj' } : undefined)
  store.loadProjectFiles = () => files
  const meta = mgr.create(undefined, 'p1')
  assert.equal(meta.projectId, 'p1'); assert.equal(meta.cwd, 'C:\\proj')
  const opts = (mgr as any).get(meta.id).buildOptions()
  assert.equal(opts.mcpServers.artifacts?.type, 'sdk'); assert.equal(opts.mcpServers.memory?.type, 'sdk'); assert.equal(opts.mcpServers.chats?.type, 'sdk')
  assert.deepEqual(opts.allowedTools, [...ARTIFACT_TOOLS, ...MEMORY_TOOLS, ...CHAT_TOOLS], 'artifacts, memory and chat search never prompt')
  assert.deepEqual(opts.settings, { autoMemoryEnabled: false, enableArtifact: false }, "Claude Code's own memory files and cloud Artifact tool stay off")
  assert.match(opts.systemPrompt.append, /Answer in C\./)
  store.getSettings = st
  console.log('✓ projects: instructions + knowledge in the system prompt, size limit, project folder, artifacts tool')
}

/** In-memory stand-in for SecureStore, enough for memory/export/import. */
function memStore() {
  const s = { sessions: [] as SessionMeta[], projects: [] as any[], memory: [] as any[], hist: {} as any, arts: {} as any, files: {} as any, images: new Map<string, Buffer>(), notes: {} as Record<string, string>, settings: { ...DEFAULT_SETTINGS, defaultCwd: process.cwd(), loadUserSettings: false, loadProjectSettings: false } as AppSettings }
  const upsert = (list: any[], x: any) => {
    const i = list.findIndex((y) => y.id === x.id)
    i >= 0 ? (list[i] = x) : list.push(x)
  }
  return {
    _s: s,
    listSessions: () => [...s.sessions],
    getSession: (id: string) => s.sessions.find((x) => x.id === id),
    upsertSession: (m: SessionMeta) => upsert(s.sessions, m),
    upsertSessions: (l: SessionMeta[]) => l.forEach((m) => upsert(s.sessions, m)),
    loadHistory: (id: string) => s.hist[id] ?? [],
    saveHistory: (id: string, h: any) => (s.hist[id] = h),
    loadArtifacts: (id: string) => s.arts[id] ?? [],
    saveArtifacts: (id: string, a: any) => (s.arts[id] = a),
    listProjects: () => [...s.projects],
    getProject: (id: string) => s.projects.find((p) => p.id === id),
    upsertProject: (p: any) => upsert(s.projects, p),
    loadProjectFiles: (id: string) => s.files[id] ?? {},
    saveProjectFiles: (id: string, f: any) => (s.files[id] = f),
    getGlobalMemory: () => s.memory,
    setGlobalMemory: (m: any[]) => (s.memory = m),
    getSettings: (): AppSettings => s.settings,
    getNotePath: (id: string) => s.notes[id],
    setNotePath: (id: string, rel: string | undefined) => (rel ? (s.notes[id] = rel) : delete s.notes[id]),
    saveImage: (sid: string, id: string, data: Buffer) => s.images.set(`${sid}/${id}`, data),
    loadImage: (sid: string, id: string) => s.images.get(`${sid}/${id}`) ?? null,
    pruneImages: (sid: string, keep: Set<string>) => {
      let n = 0
      for (const k of [...s.images.keys()])
        if (k.startsWith(sid + '/') && !keep.has(k.slice(sid.length + 1))) {
          s.images.delete(k)
          n++
        }
      return n
    }
  }
}

async function memoryTool() {
  const st: any = memStore()
  st.upsertProject({ id: 'p1', name: 'Firmware', description: '', instructions: '', files: [], createdAt: 1, updatedAt: 1 })
  const changed: (string | undefined)[] = []
  const srv: any = createMemoryServer({ store: st, sessionId: 'c1', projectId: 'p1', onChange: (pid) => changed.push(pid) })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await srv.instance.connect(a)
  const client = new Client({ name: 't', version: '1' })
  await client.connect(b)
  const call = async (name: string, args: any) => (await client.callTool({ name, arguments: args })) as any
  await call('remember', { text: 'Boards use the F29 bootloader.' })
  assert.equal(st.getProject('p1').memory.length, 1, 'defaults to project memory inside a project')
  await call('remember', { text: 'User prefers short answers', scope: 'global' })
  assert.equal(st.getGlobalMemory().length, 1)
  const dup = await call('remember', { text: 'boards use the F29 bootloader' })
  assert.match(dup.content[0].text, /Already in project memory/)
  const id = st.getProject('p1').memory[0].id
  assert.ok(!(await call('forget', { id })).isError)
  assert.equal(st.getProject('p1').memory.length, 0)
  assert.ok((await call('forget', { id: 'nope' })).isError)
  assert.deepEqual(changed, ['p1', undefined, 'p1'])
  // user edits from the app
  addMemory(st, undefined, 'Lives in Bengaluru', 'you')
  const gid = st.getGlobalMemory()[1].id
  assert.ok(editMemory(st, undefined, gid, 'Works in Bengaluru'))
  assert.equal(getMemory(st, undefined)[1].text, 'Works in Bengaluru')
  assert.ok(removeMemory(st, undefined, gid))
  // memory goes into the system prompt only when memory is on
  const proj = { ...st.getProject('p1'), memory: [{ id: 'm1', text: 'Use C99', source: 'you', createdAt: 1 }] }
  const withMem = systemAppend('', proj, { loadProjectFiles: () => ({}) }, { global: st.getGlobalMemory() })!
  assert.match(withMem, /<memory>/); assert.match(withMem, /\[m1\] Use C99/); assert.match(withMem, /User prefers short answers/)
  assert.ok(!(systemAppend('', proj, { loadProjectFiles: () => ({}) }, null) ?? '').includes('<memory>'))
  console.log('✓ memory: project/global scope, duplicates, forget, user edits, system prompt')
}

function sampleData(st: any) {
  const now = Date.now()
  st.upsertProject({ id: 'p1', name: 'Weather app', description: 'Dashboards', instructions: 'Use TypeScript.', files: [{ id: 'f1', name: 'spec.md', size: 4, addedAt: now }], memory: [{ id: 'm1', text: 'API key lives in .env', source: 'claude', createdAt: now }], pinned: true, createdAt: now, updatedAt: now })
  st.saveProjectFiles('p1', { f1: 'SPEC' })
  st.setGlobalMemory([{ id: 'g1', text: 'Prefers dark mode', source: 'you', createdAt: now }])
  const chat = (id: string, title: string, projectId?: string) => st.upsertSession({ id, sdkSessionId: 'sdk-' + id, title, cwd: 'C:/x', additionalDirs: [], model: '', permissionMode: 'default', projectId, createdAt: now, updatedAt: now, artifactCount: 1 })
  chat('c1', 'Forecast page', 'p1')
  chat('c2', 'Loose chat')
  const hist = [
    { id: 'u1', role: 'user', uuid: 'U1', forkAt: 'start', ts: now, parts: [{ kind: 'text', text: 'Make a page' }] },
    { id: 'a1', role: 'assistant', ts: now, parts: [
      { kind: 'thinking', text: 'secret plan' },
      { kind: 'tool', toolUseId: 't1', name: 'Bash', input: { command: 'npm test' }, result: 'ok 3 tests', done: true },
      { kind: 'tool', toolUseId: 't2', name: 'Edit', input: { file_path: 'a.ts', old_string: 'x', new_string: 'y' }, result: 'ok', done: true },
      { kind: 'tool', toolUseId: 't3', name: 'mcp__artifacts__create_artifact', input: { id: 'page', type: 'html', title: 'Page' }, result: 'ok', done: true },
      { kind: 'text', text: 'Done! Here is `code` with ``` fences.' }
    ] }
  ]
  st.saveHistory('c1', hist)
  st.saveHistory('c2', [hist[0]])
  st.saveArtifacts('c1', [{ id: 'page', sessionId: 'c1', title: 'Page', type: 'html', versions: [{ content: '<h1>v1</h1>', ts: now }, { content: '<h1>v2</h1>', ts: now }], createdAt: now, updatedAt: now }])
  st.saveArtifacts('c2', [{ id: 'app', sessionId: 'c2', title: 'App', type: 'react', versions: [{ content: 'export default () => null', ts: now }], createdAt: now, updatedAt: now }])
}

function exportAndImport() {
  const st: any = memStore()
  sampleData(st)
  const base = { ...DEFAULT_EXPORT_OPTIONS }
  // one chat → Markdown
  const md = chatMarkdown(st.getSession('c1'), st.loadHistory('c1'), base, { project: st.getProject('p1'), artifacts: st.loadArtifacts('c1') })
  assert.match(md, /^# Forecast page/); assert.match(md, /## You/); assert.match(md, /## Claude/)
  assert.match(md, /_Ran a command, edited a\.ts_|_Edited a\.ts, ran a command_/); assert.ok(!md.includes('secret plan'), 'thinking off by default')
  assert.match(md, /Created artifact:\*\* Page · Web page \(see Artifacts below\)/); assert.match(md, /## Artifacts[\s\S]*<h1>v2<\/h1>/)
  assert.ok(!md.includes('<h1>v1</h1>'), 'latest version only by default')
  const full = chatMarkdown(st.getSession('c1'), st.loadHistory('c1'), { ...base, tools: 'full', thinking: true, artifacts: 'all' }, { artifacts: st.loadArtifacts('c1') })
  assert.match(full, /<summary>Ran a command<\/summary>[\s\S]*\$ npm test[\s\S]*ok 3 tests/); assert.match(full, /```diff\n-x\n\+y\n```/)
  assert.match(full, /secret plan/); assert.match(full, /#### Version 1/)
  // ZIP round trip
  const z = readZip(createZip([{ name: 'a/ü.txt', data: 'héllo' }, { name: 'b.bin', data: Buffer.alloc(5000, 7) }]))
  assert.deepEqual(z.map((e) => e.name), ['a/ü.txt', 'b.bin']); assert.equal(z[0].data.toString(), 'héllo'); assert.equal(z[1].data.length, 5000)
  // everything → ZIP with README, project folder, knowledge, memory, linked artifacts, backup
  const built = buildFullExport(st, base)
  const names = built.entries.map((e) => e.name)
  const root = built.name + '/'
  for (const n of ['README.md', 'memory.md', 'projects/Weather app/README.md', 'projects/Weather app/knowledge/spec.md', 'projects/Weather app/memory.md', 'projects/Weather app/instructions.md', 'localclaude-backup.json'])
    assert.ok(names.includes(root + n), 'missing ' + n)
  assert.ok(names.some((n) => /projects\/Weather app\/chats\/\d{4}-\d\d-\d\d Forecast page\.md$/.test(n)))
  assert.ok(names.some((n) => /artifacts\/.* Loose chat\/App\.preview\.html$/.test(n)), 'react artifacts get a browser preview page')
  const chatMd = String(built.entries.find((e) => /Forecast page\.md$/.test(e.name))!.data)
  assert.match(chatMd, /\[Page\]\(<\.\.\/artifacts\/\d{4}-\d\d-\d\d Forecast page\/Page\.html>\)/, 'chat links to its artifact file')
  assert.deepEqual(built.stats, { chats: 2, artifacts: 2, files: 1 })
  // import the backup into an empty store: everything comes back, nothing is duplicated on a second import
  const zip = createZip(built.entries)
  const fresh: any = memStore()
  const r = importBackup(fresh, parseBackup(zip), new Set(['sdk-c2']))
  assert.equal(r.ok, true); assert.equal(r.chats, 2); assert.equal(r.projects, 1); assert.equal(r.artifacts, 2); assert.equal(r.memory, 1)
  assert.equal(r.withoutTranscript, 1, 'c1 has no transcript on this machine')
  const c1 = fresh.getSession('c1')
  assert.equal(c1.imported, true); assert.equal(c1.sdkSessionId, undefined); assert.equal(fresh.loadHistory('c1')[0].uuid, undefined)
  assert.equal(fresh.getSession('c2').sdkSessionId, 'sdk-c2', 'transcript present: resume as normal')
  assert.equal(fresh.loadProjectFiles('p1').f1, 'SPEC'); assert.equal(fresh.getProject('p1').memory[0].text, 'API key lives in .env')
  const again = importBackup(fresh, parseBackup(zip), new Set())
  assert.equal(again.chats, 0); assert.equal(again.skipped, 3)
  assert.throws(() => parseBackup(Buffer.from('{"hello":1}')), /not a LocalClaude export/)
  // an imported chat sends its earlier messages once, as context
  const ctx = importedContext(c1, fresh.loadHistory('c1'))
  assert.match(ctx, /<previous_conversation>[\s\S]*Make a page[\s\S]*<\/previous_conversation>/)
  // project export
  const pz = buildProjectExport(st, st.getProject('p1'), { ...base, backup: true })
  assert.ok(pz.entries.some((e) => e.name === 'Weather app/README.md')); assert.equal(pz.stats.chats, 1)
  const pb = parseBackup(createZip(pz.entries))
  assert.equal(pb.sessions.length, 1); assert.equal(pb.memory.length, 0, 'project backups leave global memory out')
  // chats you selected: just those, and a backup of just those
  const some = buildChatsExport(st, ['c2', 'missing'], base)
  assert.equal(some.stats.chats, 1); assert.ok(some.entries.some((e) => /chats\/\d{4}-\d\d-\d\d Loose chat\.md$/.test(e.name)))
  const sb = parseBackup(createZip(some.entries))
  assert.deepEqual(sb.sessions.map((s) => s.meta.id), ['c2']); assert.equal(sb.projects.length, 0); assert.equal(sb.memory.length, 0)
  const readme = String(pz.entries.find((e) => e.name === 'Weather app/README.md')!.data)
  assert.match(readme, /## Context/); assert.match(readme, /Use TypeScript\./); assert.match(readme, /API key lives in \.env/)
  console.log('✓ export: chat Markdown (summary/full/thinking/versions), ZIP, project + full exports, backup import round trip')
}

async function reliabilityAndUx() {
  // --- Claude Code deleted the transcript (30-day cleanup): the chat continues with its history as context
  const ev: AgentEvent[] = []
  const st: any = { ...store, getSettings: store.getSettings, getSession: store.getSession, upsertSession: store.upsertSession }
  const titles: string[] = []
  const gone = new SessionManager(st, (e) => ev.push(e), {
    transcriptExists: () => false,
    titleFor: async (u) => (titles.push(u), 'Planning a garden')
  })
  const meta = gone.create(process.cwd())
  const s: any = (gone as any).get(meta.id)
  const sent: any[] = []
  s.ensureStarted = () => { s.queue ??= { push: (m: any) => sent.push(m), close() {} } }
  s.history = [
    { id: 'u-old', role: 'user', uuid: 'U-OLD', forkAt: 'start', ts: 1, parts: [{ kind: 'text', text: 'What should I plant in spring?' }] },
    { id: 'a-old', role: 'assistant', ts: 2, parts: [{ kind: 'text', text: 'Peas and lettuce do well.' }] }
  ]
  s.meta = { ...s.meta, sdkSessionId: 'deleted-session', tip: 'T1', title: 'What should I plant in spring?', titleSource: 'user' }
  gone.send({ sessionId: meta.id, text: 'And in summer?', attachments: [] })
  assert.equal(s.meta.sdkSessionId, undefined, 'stale session id dropped'); assert.equal(s.meta.imported, true)
  assert.match(sent[0].message.content[0].text, /<previous_conversation>[\s\S]*Peas and lettuce[\s\S]*<\/previous_conversation>/)
  assert.equal(sent[0].message.content[1].text, 'And in summer?')
  assert.equal(s.history.find((m: any) => m.id === 'u-old').uuid, undefined, 'old checkpoints are gone with the transcript')
  assert.equal(s.history.at(-1).forkAt, 'start', 'rewinding the new message starts fresh')
  assert.ok(s.history.some((m: any) => m.role === 'system' && /cleaned up/.test(m.parts[0].text)))
  // ...and if it vanishes mid-way, the error is explained and the chat recovers for the next message
  s.meta = { ...s.meta, sdkSessionId: 'another-gone', imported: undefined }
  s.handle({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID: another-gone'], usage: {}, duration_ms: 1, num_turns: 0 })
  assert.equal(s.meta.sdkSessionId, undefined); assert.equal(s.meta.imported, true)
  assert.match(ev.filter((e) => e.type === 'error').at(-1)!.text as string, /Send your message again/)

  // --- AI titles: only for chats still named after their first message, and never over your rename
  const fresh = gone.create(process.cwd())
  const f: any = (gone as any).get(fresh.id)
  f.ensureStarted = () => { f.queue ??= { push: () => {}, close() {} } }
  gone.send({ sessionId: fresh.id, text: 'help me plan my vegetable garden', attachments: [] })
  f.handle({ type: 'assistant', uuid: 'x', parent_tool_use_id: null, message: { id: 'g1', content: [{ type: 'text', text: 'Sure! Start with the sunniest spot.' }] } })
  f.handle({ type: 'result', subtype: 'success', is_error: false, result: 'ok', usage: {}, duration_ms: 1, num_turns: 1 })
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(f.meta.title, 'Planning a garden'); assert.equal(f.meta.titleSource, 'ai'); assert.deepEqual(titles, ['help me plan my vegetable garden'])
  gone.updateMeta(fresh.id, { title: 'My garden' })
  assert.equal(f.meta.titleSource, 'user', 'renaming marks the title as yours')
  assert.equal(cleanTitle('"Title: Planning a Vegetable Garden."'), 'Planning a Vegetable Garden')
  assert.equal(cleanTitle('**Kubernetes pod restart loop**\nextra'), 'Kubernetes pod restart loop')
  assert.equal(cleanTitle(' '), null)

  // --- styles: chosen per chat, added to the system prompt
  gone.setStyle(fresh.id, 'concise')
  assert.equal(f.meta.style, 'concise')
  const opts = f.buildOptions()
  assert.match(opts.systemPrompt.append, /<response_style name="Concise">/)
  gone.setStyle(fresh.id, 'default')
  assert.ok(!(f.buildOptions().systemPrompt.append ?? '').includes('response_style'))
  assert.equal(resolveStyle(undefined, 'learning', [])?.name, 'Learning', 'falls back to the default style')
  assert.equal(resolveStyle(undefined, 'mine', [{ id: 'mine', name: 'Mine', description: '', prompt: 'p' }])?.prompt, 'p')

  // --- transcript lookup on disk
  const dir = mkdtempSync(join(tmpdir(), 'lc-tx-'))
  mkdirSync(join(dir, projectDirName('C:\\Users\\me\\code')), { recursive: true })
  writeFileSync(join(dir, projectDirName('C:\\Users\\me\\code'), 'abc.jsonl'), '{}')
  mkdirSync(join(dir, 'shortened-long-path-1234'))
  writeFileSync(join(dir, 'shortened-long-path-1234', 'def.jsonl'), '{}')
  assert.equal(projectDirName('C:\\Users\\me\\code'), 'C--Users-me-code')
  assert.ok(transcriptExists('abc', 'C:\\Users\\me\\code', dir)); assert.ok(transcriptExists('def', 'D:\\elsewhere', dir), 'found in another folder')
  assert.ok(!transcriptExists('zzz', 'C:\\Users\\me\\code', dir)); assert.ok(!transcriptExists('abc', 'x', join(dir, 'missing')))
  rmSync(dir, { recursive: true, force: true })

  // --- notifications
  const done: any = { type: 'turn-done', sessionId: 's', isError: false, stats: {} }
  assert.deepEqual(notificationFor(done, { chatTitle: 'Garden', lastReply: 'Plant   peas\nfirst.' }), { sessionId: 's', title: 'Garden', body: 'Plant peas first.' })
  assert.equal(notificationFor({ ...done, isError: true }, {})!.body, 'Claude stopped with an error.')
  const ask: any = { type: 'permission', request: { sessionId: 's', toolName: 'AskUserQuestion', input: {} } }
  assert.equal(notificationFor(ask, { chatTitle: 'Garden' })!.body, 'Claude has a question for you.')
  assert.equal(notificationFor({ type: 'status', sessionId: 's', status: 'idle' } as any, {}), null)

  // --- usage
  const u = mapUsage({
    subscription_type: 'max',
    rate_limits_available: true,
    rate_limits: { five_hour: { utilization: 42, resets_at: '2026-10-06T20:00:00Z' }, seven_day: { utilization: 10, resets_at: null }, seven_day_opus: null, model_scoped: [{ display_name: 'Fable', utilization: 3, resets_at: null }] },
    session: {} as any,
    behaviors: null
  } as any)
  assert.deepEqual(u.windows.map((w) => [w.label, w.utilization]), [['Current session (5-hour limit)', 42], ['Weekly · all models', 10], ['Weekly · Fable', 3]])
  assert.equal(mapUsage({ rate_limits_available: false } as any).available, false)
  console.log('✓ reliability & UX: 30-day transcript recovery, AI titles, styles, notifications, usage')
}

async function chatSearch() {
  const st: any = memStore()
  const msg = (id: string, role: string, text: string, extra: any = {}) => ({ id, role, ts: 1, parts: [{ kind: 'text', text }], ...extra })
  const chat = (id: string, title: string, updatedAt: number, projectId: string | undefined, history: any[]) => {
    st.upsertSession({ id, title, cwd: 'C:\\x', createdAt: 1, updatedAt, projectId })
    st.saveHistory(id, history)
  }
  chat('c1', 'Garden plans', 100, undefined, [msg('1', 'user', 'What should I plant in spring?'), msg('2', 'assistant', 'Peas and lettuce do well in cool weather.')])
  chat('c2', 'Router setup', 200, 'p1', [
    msg('3', 'user', 'My teal router keeps dropping wifi'),
    { id: '4', role: 'assistant', ts: 1, parts: [{ kind: 'tool', id: 't', name: 'Bash', input: {}, result: 'teal teal teal', done: true }, { kind: 'text', text: 'Try changing the wifi channel.' }] },
    msg('5', 'assistant', 'teal teal teal from a subagent', { parentToolUseId: 't' })
  ])
  chat('c3', 'Teal paint', 50, 'p1', [msg('6', 'user', 'Which teal paint for the kitchen?'), msg('7', 'assistant', 'A muted teal works well with wood.')])

  assert.deepEqual(terms('Router "wifi Channel" a'), ['router', 'wifi channel'], 'quoted phrases stay together, 1-letter words dropped')
  assert.equal(chatText(st.loadHistory('c2')), 'My teal router keeps dropping wifi\n\nTry changing the wifi channel.', 'tool output and subagents are not searched')
  const long = 'x'.repeat(200) + ' needle ' + 'y'.repeat(200)
  assert.match(snippet(long, long, ['needle']), /^….*needle.*…$/)

  const index = new ChatIndex(st, () => undefined)
  const ids = (h: any[]) => h.map((x) => x.sessionId)
  assert.deepEqual(ids(index.search('teal')), ['c3', 'c2'], 'title matches first')
  assert.deepEqual(ids(index.search('teal wifi')), ['c2'], 'every word must match')
  assert.deepEqual(ids(index.search('"wifi channel"')), ['c2']); assert.deepEqual(ids(index.search('"channel wifi"')), [])
  assert.deepEqual(ids(index.search('well')), ['c1', 'c3'], 'same score: most recent first')
  assert.deepEqual(ids(index.search('well', { projectId: 'p1' })), ['c3']); assert.deepEqual(ids(index.search('well', { projectId: null })), ['c1'])
  assert.deepEqual(ids(index.search('teal', { excludeId: 'c3' })), ['c2'])
  assert.equal(index.search('teal')[1].matches, 1); assert.match(index.search('peas')[0].snippet, /Peas and lettuce/)
  assert.deepEqual(index.search(' a '), [], 'nothing to search for')
  // cached until the chat changes
  st.saveHistory('c1', [msg('8', 'user', 'tomatoes now')])
  assert.deepEqual(ids(index.search('tomatoes')), [])
  st.upsertSession({ ...st.getSession('c1'), updatedAt: 300 })
  assert.deepEqual(ids(index.search('tomatoes')), ['c1'])
  // open chats are searched from memory (fresher than disk)
  const live = new ChatIndex(st, (id) => (id === 'c3' ? [msg('9', 'user', 'unsaved zebra')] : undefined))
  assert.deepEqual(ids(live.search('zebra')), ['c3'])

  // the tools Claude uses: scoped to the project, never the chat it's in
  chat('c4', 'Big log', 10, 'p1', [msg('10', 'user', 'teal ' + 'z'.repeat(5000))])
  const srv: any = createChatsServer({ index, store: st, sessionId: 'c2', projectId: 'p1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await srv.instance.connect(a)
  const client = new Client({ name: 't', version: '1' })
  await client.connect(b)
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), ['read_chat', 'search_chats'])
  const call = async (name: string, args: any) => (await client.callTool({ name, arguments: args })) as any
  const text = (r: any) => r.content[0].text as string
  const inProject = text(await call('search_chats', { query: 'teal' }))
  assert.match(inProject, /^\[c3\] Teal paint · \d{4}-\d\d-\d\d\n {2}.*teal/); assert.match(inProject, /\[c4\] Big log/)
  assert.ok(!inProject.includes('[c2]'), 'the current chat is left out')
  assert.match(text(await call('search_chats', { query: 'peas' })), /No earlier chats match/, 'project scope by default')
  assert.match(text(await call('search_chats', { query: 'tomatoes', scope: 'all' })), /\[c1\] Garden plans/)
  const read = text(await call('read_chat', { id: 'c3' }))
  assert.match(read, /Teal paint/); assert.match(read, /A muted teal works well with wood\./)
  assert.match(text(await call('read_chat', { id: 'c4', max_chars: 1000 })), /more characters; ask with a larger max_chars/)
  assert.ok((await call('read_chat', { id: 'c2' })).isError, 'not the chat it is in'); assert.ok((await call('read_chat', { id: 'nope' })).isError)
  const step: any = { kind: 'tool', id: 's1', name: 'mcp__chats__search_chats', input: { query: 'teal router' }, done: true }
  assert.equal(stepText(step).title, 'Searched your chats for “teal router”')
  assert.equal(summarize([step, { ...step, id: 's2', name: 'mcp__chats__read_chat', input: { id: 'c3' } }]), 'Looked through past chats')
  console.log('✓ chat search: terms, phrases, ranking, project scope, cache, live chats, search_chats/read_chat tools')
}

/** The start of a PNG: enough for type and size checks (and for storing). */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

async function imagesInChats() {
  // --- what an image is and how big, from its header
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x32, 0x00, 0x64, 0x03, 0, 0, 0, 0, 0, 0, 0, 0])
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x40, 0x01, 0xc8, 0x00])])
  const webp = Buffer.alloc(30)
  webp.write('RIFF', 0, 'ascii'); webp.write('WEBP', 8, 'ascii'); webp.write('VP8X', 12, 'ascii'); webp.writeUIntLE(799, 24, 3); webp.writeUIntLE(599, 27, 3)
  assert.deepEqual([png(1, 1), jpeg, gif, webp, Buffer.from('hello world!')].map((b) => sniffImageType(b)), ['image/png', 'image/jpeg', 'image/gif', 'image/webp', null])
  assert.deepEqual(imageSize(png(1280, 800)), { width: 1280, height: 800 })
  assert.deepEqual(imageSize(jpeg), { width: 100, height: 50 }); assert.deepEqual(imageSize(gif), { width: 320, height: 200 }); assert.deepEqual(imageSize(webp), { width: 800, height: 600 })
  assert.equal(imageSize(Buffer.from([0xff, 0xd8, 0xff])), undefined, 'truncated')
  // tool results carry images as API blocks or MCP blocks
  const b64 = png(2, 2).toString('base64')
  assert.equal(resultImages([{ type: 'text', text: 'x' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } }, { type: 'image', data: b64, mimeType: 'image/png' }]).length, 2)
  assert.deepEqual(resultImages('just text'), [])
  const kept: any = { saveImage: () => {} }
  assert.equal(storeImage(kept, 'c', Buffer.from('not an image')), null)
  assert.deepEqual({ ...storeImage(kept, 'c', png(64, 32)), id: 'x' }, { id: 'x', mediaType: 'image/png', width: 64, height: 32 })

  // --- a chat: attach an image, a tool returns a screenshot, an edit sends the image again
  const meta = mgr.create(process.cwd())
  const s: any = (mgr as any).get(meta.id)
  const sent: any[] = []
  s.ensureStarted = () => { s.queue ??= { push: (m: any) => sent.push(m), close() {} } }
  const pic = png(64, 32)
  mgr.send({ sessionId: meta.id, text: 'what is this?', attachments: [{ kind: 'image', mediaType: 'image/png', base64: pic.toString('base64'), name: 'x.png' }] })
  const user = s.history.at(-1)
  assert.equal(user.images, 1); assert.deepEqual(user.imageRefs.map((r: any) => [r.mediaType, r.width, r.height]), [['image/png', 64, 32]])
  assert.deepEqual(sent[0].message.content.map((c: any) => c.type), ['image', 'text'])
  assert.ok(savedImages.get(`${meta.id}/${user.imageRefs[0].id}`)?.equals(pic), 'saved with the chat')
  mgr.send({ sessionId: meta.id, text: 'and this', attachments: [{ kind: 'image', mediaType: 'image/png', base64: Buffer.from('nope').toString('base64'), name: 'y.png' }] })
  assert.equal(s.history.at(-1).imageRefs, undefined, 'not an image: not kept'); assert.equal(sent[1].message.content.length, 1, 'and not sent')
  s.handle({ type: 'assistant', parent_tool_use_id: null, message: { id: 'shot-msg', content: [{ type: 'tool_use', id: 'shot1', name: COMPUTER_TOOL, input: { action: 'screenshot' } }] } })
  s.handle({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'shot1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png(1280, 800).toString('base64') } }] }] } })
  const shot = s.history.find((m: any) => m.id === 'a-shot-msg').parts[0]
  assert.equal(shot.images.length, 1); assert.equal(shot.images[0].width, 1280); assert.equal(shot.result, '[image]')
  assert.deepEqual(rendererView.find((m) => m.id === 'a-shot-msg'), s.history.find((m: any) => m.id === 'a-shot-msg'), 'the window sees the screenshot too')
  // a replayed result (or a second final message) doesn't drop the images
  s.handle({ type: 'assistant', parent_tool_use_id: null, message: { id: 'shot-msg', content: [{ type: 'tool_use', id: 'shot1', name: COMPUTER_TOOL, input: { action: 'screenshot' } }] } })
  assert.equal(s.history.find((m: any) => m.id === 'a-shot-msg').parts[0].images.length, 1)
  mgr.send({ sessionId: meta.id, text: 'look again', attachments: [], reuseImages: user.imageRefs })
  assert.equal(sent.at(-1).message.content[0].source.data, pic.toString('base64')); assert.deepEqual(s.history.at(-1).imageRefs, user.imageRefs)
  assert.equal(referencedImages(s.history).length, 3)

  // --- opening a chat clears out images nothing points to any more (after rewinds and edits)
  const st: any = memStore()
  const keep = { id: '0b5f1f8e-1111-4222-8333-944455556666', mediaType: 'image/png', width: 64, height: 32 }
  const screen = { id: '0b5f1f8e-1111-4222-8333-944455557777', mediaType: 'image/png' }
  st.upsertSession({ id: 'ci', title: 'Pictures', cwd: 'C:\\x', createdAt: 1, updatedAt: 2 })
  const history = [
    { id: 'u', role: 'user', ts: 1, parts: [{ kind: 'text', text: 'see' }], images: 1, imageRefs: [keep] },
    { id: 'a', role: 'assistant', ts: 2, parts: [{ kind: 'tool', toolUseId: 't', name: COMPUTER_TOOL, input: { action: 'screenshot' }, result: '[image]', done: true, images: [screen] }, { kind: 'text', text: 'ok' }] }
  ]
  st.saveHistory('ci', history)
  st.saveImage('ci', keep.id, png(64, 32)); st.saveImage('ci', screen.id, png(10, 10)); st.saveImage('ci', 'gone', png(5, 5))
  ;(new SessionManager(st, () => {}, { transcriptExists: () => true }) as any).get('ci')
  assert.deepEqual([...st._s.images.keys()].sort(), [`ci/${keep.id}`, `ci/${screen.id}`])

  // --- exports carry the images; a backup brings them back
  const one = chatMarkdown(st.getSession('ci'), history as any, DEFAULT_EXPORT_OPTIONS)
  assert.match(one, /_\(1 image attached\)_/, 'a single Markdown file has nowhere to put images')
  const built = buildFullExport(st, DEFAULT_EXPORT_OPTIONS)
  const names = built.entries.map((e) => e.name)
  assert.ok(names.includes(`${built.name}/images/${keep.id}.png`)); assert.ok(names.includes(`${built.name}/images/${screen.id}.png`), 'screenshots go in for the backup')
  const md = String(built.entries.find((e) => e.name.endsWith('Pictures.md'))!.data)
  assert.ok(md.includes(`![image](<../images/${keep.id}.png>)`), 'your image shows in the chat')
  const fullMd = buildFullExport(st, { ...DEFAULT_EXPORT_OPTIONS, tools: 'full', backup: false })
  assert.ok(String(fullMd.entries.find((e) => e.name.endsWith('Pictures.md'))!.data).includes(`![screenshot](<../images/${screen.id}.png>)`))
  assert.ok(!buildFullExport(st, { ...DEFAULT_EXPORT_OPTIONS, backup: false }).entries.some((e) => e.name.endsWith(`${screen.id}.png`)), 'no backup, summary steps: no screenshots')
  const { backup, images } = readBackup(createZip(built.entries))
  assert.equal(images.size, 2)
  const fresh: any = memStore()
  importBackup(fresh, backup, new Set(), images)
  assert.ok(fresh.loadImage('ci', keep.id)?.equals(png(64, 32))); assert.ok(fresh.loadImage('ci', screen.id))
  console.log('✓ images: types and sizes, attach, screenshots, resend on edit, pruning, exports and backups')
}

async function backups() {
  // --- the encrypted file
  const data = Buffer.from('hello backup '.repeat(200))
  const enc = await encryptBackup(data, 'correct horse')
  assert.ok(isEncryptedBackup(enc)); assert.ok(!isEncryptedBackup(data)); assert.ok(!enc.includes(Buffer.from('hello backup')), 'nothing readable inside')
  assert.ok((await decryptBackup(enc, 'correct horse')).equals(data))
  await assert.rejects(decryptBackup(enc, 'correct horsf'), /Wrong password/)
  const damaged = Buffer.from(enc)
  damaged[damaged.length - 5] ^= 1
  await assert.rejects(decryptBackup(damaged, 'correct horse'), /damaged/)
  await assert.rejects(decryptBackup(createZip([{ name: 'a', data: 'b' }]), 'correct horse'), /not a LocalClaude backup/)
  assert.ok(!(await encryptBackup(data, 'correct horse')).equals(enc), 'fresh salt and nonce every time')

  // --- what's inside: the backup JSON and each image once; restoring brings everything back
  const st: any = memStore()
  sampleData(st)
  const img = { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', mediaType: 'image/png', width: 3, height: 3 }
  const withImage = (id: string) => ({ id, role: 'user', ts: 5, parts: [{ kind: 'text', text: 'look' }], images: 1, imageRefs: [img] })
  st.saveHistory('c2', [...st.loadHistory('c2'), withImage('u8'), withImage('u9')])
  st.saveImage('c2', img.id, png(3, 3))
  assert.deepEqual(readZip(backupZip(st)).map((e) => e.name), ['localclaude-backup.json', `images/${img.id}.png`])
  const file = await createBackup(st, 'correct horse')
  const { backup, images } = readBackup(await decryptBackup(file, 'correct horse'))
  const fresh: any = memStore()
  const r = importBackup(fresh, backup, new Set(), images)
  assert.equal(r.chats, 2); assert.equal(r.projects, 1); assert.equal(r.memory, 1); assert.equal(r.artifacts, 2)
  assert.ok(fresh.loadImage('c2', img.id)?.equals(png(3, 3))); assert.equal(fresh.loadProjectFiles('p1').f1, 'SPEC')

  // --- automatic backups: when they're due, their names, and keeping the newest few
  const hour = 3600_000
  assert.ok(backupDue(undefined, 'daily')); assert.ok(!backupDue(Date.now() - 2 * hour, 'daily')); assert.ok(backupDue(Date.now() - 23.5 * hour, 'daily'))
  assert.ok(!backupDue(Date.now() - 3 * 24 * hour, 'weekly')); assert.ok(backupDue(Date.now() - 7 * 24 * hour, 'weekly'))
  assert.equal(backupFileName(new Date(2026, 9, 6, 21, 5)), 'LocalClaude backup 2026-10-06 2105.lcbackup')
  const dir = mkdtempSync(join(tmpdir(), 'lc-bk-'))
  for (const d of [1, 2, 3, 4, 5]) writeFileSync(join(dir, backupFileName(new Date(2026, 9, d, 10, 0))), 'x')
  writeFileSync(join(dir, 'notes.txt'), 'mine'); writeFileSync(join(dir, 'LocalClaude backup (manual).lcbackup'), 'mine')
  assert.deepEqual(pruneBackups(dir, 3), [backupFileName(new Date(2026, 9, 2, 10, 0)), backupFileName(new Date(2026, 9, 1, 10, 0))])
  assert.ok(existsSync(join(dir, 'notes.txt')) && existsSync(join(dir, 'LocalClaude backup (manual).lcbackup')), "other files aren't touched")
  const at = new Date(2026, 9, 6, 10, 0)
  const w1 = await writeBackupTo(st, dir, 'correct horse', 3, at)
  const w2 = await writeBackupTo(st, dir, 'correct horse', 3, at)
  assert.notEqual(w1.path, w2.path, 'same minute: a second file'); assert.match(w2.path, / \(2\)\.lcbackup$/)
  assert.equal(statSync(w2.path).size, w2.size)
  const left = readdirSync(dir).filter((f) => f.endsWith('.lcbackup') && !f.includes('manual')).sort()
  assert.deepEqual(left, [backupFileName(new Date(2026, 9, 5, 10, 0)), backupFileName(at).replace('.lcbackup', ' (2).lcbackup'), backupFileName(at)].sort(), 'the newest 3 are kept')
  assert.ok(isEncryptedBackup(readFileSync(w2.path)), 'written encrypted')
  rmSync(dir, { recursive: true, force: true })
  console.log('✓ backups: encryption, wrong password, damage, contents with images, restore, schedule, naming, cleanup')
}

/** A small valid PDF with one line of text per page. */
function makePdf(pages: string[]): Buffer {
  const objs: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`]
  const font = 3 + pages.length * 2
  pages.forEach((text, i) => {
    const stream = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

async function knowledgeAndObsidian() {
  // --- text out of documents
  const pdf = makePdf(['Quarterly revenue grew 12 percent', 'Page two mentions the giraffe budget'])
  assert.equal(await extractBuffer(pdf, '.pdf'), '[Page 1]\nQuarterly revenue grew 12 percent\n\n[Page 2]\nPage two mentions the giraffe budget')
  const docx = createZip([
    {
      name: 'word/document.xml',
      data: '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Launch plan</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Ship on </w:t></w:r><w:r><w:t>Friday &amp; celebrate</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Book the room</w:t></w:r></w:p></w:body></w:document>'
    }
  ])
  assert.equal(docxText(docx), '# Launch plan\n\nShip on Friday & celebrate\n- Book the room')
  const pptx = createZip([
    { name: 'ppt/slides/slide2.xml', data: '<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>' },
    { name: 'ppt/slides/slide1.xml', data: '<p:sld><a:p><a:r><a:t>Hello </a:t></a:r><a:r><a:t>deck</a:t></a:r></a:p><a:p><a:r><a:t>Point two</a:t></a:r></a:p></p:sld>' }
  ])
  assert.equal(pptxText(pptx), '## Slide 1\n\nHello deck\nPoint two\n\n## Slide 2\n\nSecond')
  const xlsx = createZip([
    { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/sharedStrings.xml', data: '<sst><si><t>Item</t></si><si><t>Cost</t></si><si><r><t>Tea</t></r><r><t>pot</t></r></si></sst>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12.5</v></c><c r="C2" t="inlineStr"><is><t>note</t></is></c></row></sheetData></worksheet>' }
  ])
  assert.equal(xlsxText(xlsx), '## Budget\n\nItem | Cost\nTeapot | 12.5 | note')
  assert.equal(await extractBuffer(Buffer.from('\uFEFFplain notes'), '.md'), 'plain notes')
  await assert.rejects(extractBuffer(Buffer.from([1, 0, 2, 3]), '.bin'), /not a text file/)
  await assert.rejects(extractBuffer(Buffer.from('nope'), '.pdf'), /not a readable PDF/)
  await assert.rejects(extractBuffer(createZip([{ name: 'a.txt', data: 'a' }]), '.docx'), /not a Word document/)

  // --- passages and ranking
  // plurals fold the same way in questions and notes (so "Paris" becomes "pari" on both sides)
  assert.deepEqual(tokenize('The Bicycles of Paris, and 2 cafés'), ['bicycle', 'pari', 'café'])
  const longDoc = '# Intro\n\nSome intro words.\n\n# Budget\n\n' + 'The giraffe budget is large. '.repeat(10) + '\n\n' + 'Filler about nothing much at all. '.repeat(80)
  const ps = passages(longDoc)
  assert.equal(ps[0].heading, 'Intro'); assert.ok(ps.some((p) => p.heading === 'Budget')); assert.ok(ps.every((p) => p.end - p.start <= 1200))
  const idx = new KnowledgeIndex([
    { name: 'report.pdf', source: 'project files', text: await extractBuffer(pdf, '.pdf') },
    { name: 'Daily/2026-10-01.md', source: 'vault', text: 'Bought a red bicycle today.\n\nThe bicycles were cheap.' },
    { name: 'Ideas.md', source: 'vault', text: 'A solar kettle. Also a bicycle bell.' },
    { name: 'Giraffe facts.md', source: 'vault', text: 'Tall animals.' }
  ])
  assert.equal(idx.search('bicycle')[0].doc.name, 'Daily/2026-10-01.md', 'more mentions rank higher')
  assert.equal(idx.search('bicycle').length, 2)
  assert.deepEqual(new Set(idx.search('giraffe').map((h) => h.doc.name)), new Set(['report.pdf', 'Giraffe facts.md']), 'file names count')
  assert.equal(idx.search('revenue')[0].passage.heading, '[Page 1]')
  assert.equal(idx.search('"red bicycle"')[0].doc.name, 'Daily/2026-10-01.md')
  assert.deepEqual(idx.search('the of and'), [], 'only common words')

  // --- the tools: search, read, list, and writing notes into the vault
  const dir = mkdtempSync(join(tmpdir(), 'lc-kb-'))
  const vault = join(dir, 'Brain')
  mkdirSync(join(vault, '.obsidian'), { recursive: true })
  const saved: string[] = []
  const srv: any = createKnowledgeServer({ indexes: async () => [idx], describe: 'test knowledge', notes: { root: vault, folder: 'LocalClaude' }, onNoteSaved: (f) => saved.push(f) })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await srv.instance.connect(a)
  const client = new Client({ name: 't', version: '1' })
  await client.connect(b)
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), ['list_knowledge', 'read_knowledge', 'save_note', 'search_knowledge'])
  const call = async (name: string, args: any) => (await client.callTool({ name, arguments: args })) as any
  const text = (r: any) => r.content[0].text as string
  assert.match(text(await call('search_knowledge', { query: 'bicycle' })), /^\[1\] Daily\/2026-10-01\.md \(vault; chars 0-\d+\)\nBought a red bicycle/)
  assert.match(text(await call('search_knowledge', { query: 'unicorn' })), /Nothing matches/)
  assert.match(text(await call('read_knowledge', { name: 'ideas' })), /^Ideas\.md \(vault; chars 0-36 of 36\)\n\nA solar kettle/)
  assert.match(text(await call('read_knowledge', { name: 'report.pdf', offset: 9, max_chars: 500 })), /chars 9-\d+ of \d+/)
  assert.ok((await call('read_knowledge', { name: 'nope' })).isError)
  assert.match(text(await call('list_knowledge', { filter: 'daily' })), /^- Daily\/2026-10-01\.md \(vault, 53 chars\)$/)
  assert.match(text(await call('save_note', { title: 'Kettle plans', content: 'Solar kettle, see [[Ideas]].' })), /Saved LocalClaude\/Notes\/Kettle plans\.md/)
  const note = join(vault, 'LocalClaude', 'Notes', 'Kettle plans.md')
  assert.match(readFileSync(note, 'utf8'), /^---\ncreated: .*\nsource: LocalClaude\n---\n\nSolar kettle, see \[\[Ideas\]\]\.\n$/); assert.deepEqual(saved, [note])
  assert.ok((await call('save_note', { title: 'Kettle plans', content: 'again' })).isError, "existing notes aren't overwritten")
  await call('save_note', { title: 'Kettle plans', content: 'Buy a panel.', append: true })
  assert.match(readFileSync(note, 'utf8'), /Solar kettle[\s\S]*_Added by Claude, .*_\n\nBuy a panel\.\n$/)
  await call('save_note', { title: 'Escape', content: 'x', subfolder: '../../..' })
  assert.ok(existsSync(join(vault, 'LocalClaude', 'Notes', '_', '_', '_', 'Escape.md')), 'notes stay inside the notes folder')

  // --- linked folders are read live; hidden folders and dependencies are skipped
  const folder = join(dir, 'kb')
  mkdirSync(join(folder, 'sub'), { recursive: true }); mkdirSync(join(folder, '.obsidian')); mkdirSync(join(folder, 'node_modules'))
  writeFileSync(join(folder, 'a.md'), 'alpha zebra'); writeFileSync(join(folder, 'sub', 'b.txt'), 'beta'); writeFileSync(join(folder, 'sub', 'deck.pptx'), pptx)
  writeFileSync(join(folder, '.obsidian', 'x.md'), 'hidden zebra'); writeFileSync(join(folder, 'node_modules', 'y.md'), 'zebra'); writeFileSync(join(folder, 'pic.png'), png(1, 1))
  const svc = new KnowledgeService()
  let f = await svc.folder(folder, 'folder kb')
  assert.deepEqual(f.index.docs.map((d) => d.name).sort(), ['a.md', 'sub/b.txt', 'sub/deck.pptx']); assert.equal(f.index.search('zebra').length, 1)
  assert.equal(f.index.search('deck')[0].doc.name, 'sub/deck.pptx')
  writeFileSync(join(folder, 'c.md'), 'zebra again')
  svc.invalidate(folder)
  f = await svc.folder(folder, 'folder kb')
  assert.equal(f.index.search('zebra').length, 2, 'new notes are found')
  assert.equal(svc.project('p', 1, [{ id: 'f', name: 'x.md' }], () => ({ f: 'okapi' })).search('okapi').length, 1)

  // --- Obsidian: finding vaults, links, and keeping chats and memory as notes
  writeFileSync(join(dir, 'obsidian.json'), JSON.stringify({ vaults: { a: { path: vault, ts: 2, open: true }, b: { path: join(dir, 'gone'), ts: 3 } } }))
  assert.deepEqual(detectVaults(join(dir, 'obsidian.json')), [{ path: vault, name: 'Brain', open: true }], 'vaults that no longer exist are left out')
  assert.deepEqual(detectVaults(join(dir, 'none.json')), [])
  assert.equal(obsidianUri('C:\\v\\a b.md'), 'obsidian://open?path=C%3A%5Cv%5Ca%20b.md')
  assert.equal(appFolder(vault, '../../outside'), join(vault, 'outside')); assert.equal(appFolder(vault, ''), join(vault, 'LocalClaude'))
  const st: any = memStore()
  const day = new Date(2026, 9, 6, 9, 30).getTime()
  const img = { id: '9f3c1b2a-1111-4222-8333-944455556666', mediaType: 'image/png' }
  st.upsertSession({ id: 'v1', title: 'Garden plans', cwd: 'C:\\x', createdAt: day, updatedAt: day })
  st.saveHistory('v1', [
    { id: 'u', role: 'user', ts: day, parts: [{ kind: 'text', text: 'What should I plant?' }], images: 1, imageRefs: [img] },
    { id: 'a', role: 'assistant', ts: day, parts: [{ kind: 'text', text: 'Peas and lettuce.' }] }
  ])
  st.saveImage('v1', img.id, png(2, 2))
  st.s = st._s
  const settings = { ...st.getSettings(), obsidianVault: vault, obsidianSyncChats: true, obsidianSyncMemory: true }
  const sync = new VaultSync(st, () => settings, 0)
  const chatFile = sync.writeChat('v1')!
  assert.equal(chatFile, join(vault, 'LocalClaude', 'Chats', '2026-10-06 Garden plans.md'))
  const chatNoteText = readFileSync(chatFile, 'utf8')
  assert.match(chatNoteText, /^---\ntitle: "Garden plans"\ncreated: 2026-10-06 09:30\n/); assert.match(chatNoteText, /tags: \[localclaude, chat\]\nlocalclaude_id: v1\n---\n\n# Garden plans/)
  assert.ok(chatNoteText.includes(`![image](<attachments/${img.id}.png>)`)); assert.match(chatNoteText, /Peas and lettuce\./)
  assert.ok(existsSync(join(vault, 'LocalClaude', 'Chats', 'attachments', img.id + '.png')))
  assert.equal(st.getNotePath('v1'), 'LocalClaude/Chats/2026-10-06 Garden plans.md')
  st.upsertSession({ ...st.getSession('v1'), title: 'Vegetable garden' })
  const renamed = sync.writeChat('v1')!
  assert.ok(renamed.endsWith('2026-10-06 Vegetable garden.md') && existsSync(renamed) && !existsSync(chatFile), 'renaming the chat renames its note')
  assert.equal(sync.notePath('v1'), renamed)
  // another chat with the same title on the same day gets its own note
  st.upsertSession({ id: 'v2', title: 'Vegetable garden', cwd: 'C:\\x', createdAt: day, updatedAt: day })
  st.saveHistory('v2', [{ id: 'w', role: 'user', ts: day, parts: [{ kind: 'text', text: 'A different garden' }] }])
  const twin = sync.writeChat('v2')!
  assert.ok(twin.endsWith('2026-10-06 Vegetable garden (2).md'), twin); assert.match(readFileSync(renamed, 'utf8'), /localclaude_id: v1\n/, "the first chat's note is untouched")
  assert.equal(sync.writeChat('v2'), twin, 'and it stays put'); assert.equal(sync.writeChat('v1'), renamed)
  st.setGlobalMemory([{ id: 'g', text: 'Likes kettles', source: 'you', createdAt: 1 }])
  st.upsertProject({ id: 'p9', name: 'Allotment', description: '', instructions: '', files: [], memory: [{ id: 'm', text: 'Plot 14', source: 'claude', createdAt: 1 }], createdAt: 1, updatedAt: 1 })
  assert.match(readFileSync(sync.writeMemory()!, 'utf8'), /## Everywhere\n\n- Likes kettles\n\n## Allotment\n\n- Plot 14\n$/)
  st.saveHistory('v1', [...st.loadHistory('v1'), { id: 'u2', role: 'user', ts: day, parts: [{ kind: 'text', text: 'And tomatoes?' }] }])
  sync.chatChanged('v1')
  await new Promise((r) => setTimeout(r, 30))
  assert.match(readFileSync(renamed, 'utf8'), /And tomatoes\?/, 'updated after a change')
  settings.obsidianSyncChats = false
  st.saveHistory('v1', [...st.loadHistory('v1'), { id: 'u3', role: 'user', ts: day, parts: [{ kind: 'text', text: 'Radishes?' }] }])
  sync.chatChanged('v1')
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(!readFileSync(renamed, 'utf8').includes('Radishes'), 'off: notes are left alone')

  // --- chats get the knowledge tools when there's something to search
  const kmgr = new SessionManager(st, () => {}, { transcriptExists: () => true, knowledge: svc })
  st.upsertProject({ id: 'pk', name: 'Research', description: '', instructions: '', files: [], folders: [folder], createdAt: 1, updatedAt: 1 })
  const plain = kmgr.create(process.cwd())
  assert.equal((kmgr as any).get(plain.id).buildOptions().mcpServers.knowledge, undefined, 'nothing to search: no tools')
  const inProject = kmgr.create(undefined, 'pk')
  const po = (kmgr as any).get(inProject.id).buildOptions()
  assert.equal(po.mcpServers.knowledge?.type, 'sdk'); assert.ok(KNOWLEDGE_TOOLS.every((t) => po.allowedTools.includes(t))); assert.ok(!po.allowedTools.includes(NOTE_TOOL))
  assert.match(po.systemPrompt.append, /<linked_folders>\n- .*kb\n<\/linked_folders>/)
  assert.equal(po.agents, undefined, 'Claude-powered knowledge search is off by default')
  // Claude-powered knowledge search: the research helper joins chats that have knowledge, with the knowledge tools only
  Object.assign(st._s.settings, { smartKnowledge: true, smartResearcher: true })
  const so = (kmgr as any).get(inProject.id).buildOptions()
  assert.deepEqual(Object.keys(so.agents ?? {}), ['knowledge-researcher'])
  assert.deepEqual(so.agents['knowledge-researcher'].tools, KNOWLEDGE_TOOLS); assert.equal(so.agents['knowledge-researcher'].model, 'inherit')
  assert.equal((kmgr as any).get(plain.id).buildOptions().agents, undefined, 'no knowledge, no helper')
  st._s.settings.smartResearcher = false
  assert.equal((kmgr as any).get(inProject.id).buildOptions().agents, undefined, 'the helper can be switched off on its own')
  Object.assign(st._s.settings, { smartKnowledge: false, smartResearcher: true })
  Object.assign(st._s.settings, { obsidianVault: vault, obsidianSearch: true, obsidianWrite: true })
  const vo = (kmgr as any).get(plain.id).buildOptions()
  assert.equal(vo.mcpServers.knowledge?.type, 'sdk'); assert.ok(vo.allowedTools.includes(NOTE_TOOL))
  assert.match(vo.systemPrompt.append, /<obsidian>\nThe user's Obsidian vault "Brain" is linked[\s\S]*save_note \(it goes in LocalClaude\/Notes\)/)
  // switched off: nothing in the vault is searched, written or synced, but the link stays
  st._s.settings.obsidianEnabled = false
  const off = (kmgr as any).get(plain.id).buildOptions()
  assert.equal(off.mcpServers.knowledge, undefined); assert.ok(!(off.systemPrompt.append ?? '').includes('<obsidian>'))
  assert.equal(st._s.settings.obsidianVault, vault, 'the link is kept')
  Object.assign(settings, { obsidianEnabled: false, obsidianSyncChats: true })
  assert.equal(sync.writeChat('v1'), null); assert.equal(sync.writeMemory(), null); assert.equal(sync.notePath('v1'), null)
  rmSync(dir, { recursive: true, force: true })
  console.log('✓ knowledge & Obsidian: PDF/Word/PowerPoint/Excel text, passages, ranking, tools, notes, linked folders, vaults, chat and memory notes')
}

async function gitHelpers() {
  assert.equal(branchName(' fix the login bug '), 'fix-the-login-bug'); assert.equal(branchName('feature//x'), 'feature/x'); assert.equal(branchName('-x.lock'), 'x')
  const dir = mkdtempSync(join(tmpdir(), 'lc-git-'))
  const repo = join(dir, 'app')
  mkdirSync(repo)
  assert.equal(await gitStatus(repo), null, 'not a repository')
  assert.equal(await gitStatus(join(dir, 'missing')), null)
  const g = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  g('init', '-b', 'main'); g('config', 'user.email', 't@example.com'); g('config', 'user.name', 'T')
  writeFileSync(join(repo, 'a.txt'), 'one'); g('add', '.'); g('commit', '-m', 'first')
  let st = (await gitStatus(repo))!
  assert.equal(st.branch, 'main'); assert.equal(st.changed, 0); assert.equal(st.worktree, false)
  writeFileSync(join(repo, 'new.txt'), 'x'); writeFileSync(join(repo, 'a.txt'), 'two')
  st = (await gitStatus(repo))!
  assert.deepEqual(st.files.map((f) => [f.status, f.path]).sort(), [['??', 'new.txt'], ['M', 'a.txt']])
  const wt = await createWorktree(repo, 'try it')
  assert.equal(wt.branch, 'try-it'); assert.ok(existsSync(join(wt.path, 'a.txt'))); assert.equal(basename(wt.path), 'try-it'); assert.equal(basename(join(wt.path, '..')), 'app-worktrees')
  const ws = (await gitStatus(wt.path))!
  assert.equal(ws.branch, 'try-it'); assert.equal(ws.worktree, true); assert.equal(ws.changed, 0, "your uncommitted changes stay in your checkout")
  await assert.rejects(createWorktree(repo, 'try it'), /already exists/)
  await assert.rejects(createWorktree(repo, '   '), /Choose a branch name/)
  g('worktree', 'remove', '--force', wt.path)
  rmSync(dir, { recursive: true, force: true })
  console.log('✓ git: branch and changes, not a repository, worktrees on their own branch')
}

async function mcpServerCheck() {
  const dir = mkdtempSync(join(tmpdir(), 'lc-mcp-'))
  const sdk = (p: string) => pathToFileURL(join(process.cwd(), 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', p)).href
  writeFileSync(
    join(dir, 'server.mjs'),
    [
      `import { Server } from '${sdk('server/index.js')}'`,
      `import { StdioServerTransport } from '${sdk('server/stdio.js')}'`,
      `import { ListToolsRequestSchema } from '${sdk('types.js')}'`,
      `const server = new Server({ name: 'test-weather', version: '1.0.0' }, { capabilities: { tools: {} } })`,
      `server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'get_forecast', inputSchema: { type: 'object' } }, { name: 'get_alerts', inputSchema: { type: 'object' } }] }))`,
      `await server.connect(new StdioServerTransport())`
    ].join('\n')
  )
  writeFileSync(join(dir, 'silent.mjs'), 'setInterval(() => {}, 1000)')
  writeFileSync(join(dir, 'crash.mjs'), "console.error('missing API_TOKEN'); process.exit(1)")
  const ok = await testMcpServer({ command: process.execPath, args: [join(dir, 'server.mjs')] })
  assert.ok(ok.ok, ok.error); assert.deepEqual(ok.tools, ['get_forecast', 'get_alerts']); assert.equal(ok.server, 'test-weather')
  const silent = await testMcpServer({ command: process.execPath, args: [join(dir, 'silent.mjs')] }, { timeoutMs: 1500 })
  assert.equal(silent.ok, false); assert.match(silent.error!, /didn’t answer within 2 seconds/)
  const crash = await testMcpServer({ command: process.execPath, args: [join(dir, 'crash.mjs')] }, { timeoutMs: 5000 })
  assert.equal(crash.ok, false); assert.match(crash.error!, /missing API_TOKEN/, 'what the server printed explains the failure')
  assert.match((await testMcpServer({ type: 'http' })).error!, /URL/); assert.match((await testMcpServer({ command: '' })).error!, /command/)
  assert.equal((await testMcpServer({ type: 'http', url: 'http://127.0.0.1:9/mcp' }, { timeoutMs: 5000 })).ok, false)
  rmSync(dir, { recursive: true, force: true })
  console.log('✓ MCP test: connects and lists tools, timeouts, crashes with their output, missing settings')
}

function projectFolders() {
  const st: any = memStore()
  st.upsertProject({ id: 'pf', name: 'Doraemon', description: '', instructions: '', files: [], createdAt: 1, updatedAt: 1 })
  const dir = mkdtempSync(join(tmpdir(), 'lc-pf-'))
  const [app, docs, gone] = ['app', 'docs', 'gone'].map((n) => join(dir, n))
  mkdirSync(app)
  mkdirSync(docs)
  let p = addProjectDir(st, 'pf', app)
  assert.equal(p.cwd, app, 'the first folder is the main one'); assert.equal(p.dirs, undefined)
  p = addProjectDir(st, 'pf', docs)
  p = addProjectDir(st, 'pf', docs)
  p = addProjectDir(st, 'pf', app)
  assert.deepEqual([p.cwd, p.dirs], [app, [docs]], 'no duplicates')
  p = addProjectDir(st, 'pf', gone)
  // every chat in the project can work in the project's folders, also one that started elsewhere
  const pm = new SessionManager(st, () => {}, { transcriptExists: () => true })
  const fresh = pm.create(undefined, 'pf')
  assert.equal(fresh.cwd, app, 'new chats start in the main folder')
  assert.deepEqual((pm as any).get(fresh.id).buildOptions().additionalDirectories, [docs], 'not its own folder, not folders that are gone')
  const older = pm.create(process.cwd(), 'pf')
  pm.setDirs(older.id, [docs])
  assert.deepEqual((pm as any).get(older.id).buildOptions().additionalDirectories, [docs, app], 'its own extra folders, then the project’s')
  const outside = pm.create(process.cwd())
  assert.deepEqual((pm as any).get(outside.id).buildOptions().additionalDirectories, [], 'chats outside the project get nothing')
  // removing the main folder makes the next one the main folder
  p = removeProjectDir(st, 'pf', app)
  assert.deepEqual([p.cwd, p.dirs], [docs, [gone]])
  p = removeProjectDir(st, 'pf', gone)
  p = setProjectMainDir(st, 'pf', app)
  assert.deepEqual([p.cwd, p.dirs], [app, []], 'a new main folder replaces the old one')
  p = removeProjectDir(st, 'pf', app)
  assert.ok(!('cwd' in p), 'no folders left: chats use the default folder')
  assert.equal(createProject(st, { name: 'Gadgets', cwd: docs }).cwd, docs, 'a project can start from a folder')
  rmSync(dir, { recursive: true, force: true })
  console.log('✓ project folders: main folder, more folders, every chat in the project gets them, removing and replacing')
}

function yourName() {
  const st: any = memStore()
  st._s.settings.userName = '  Paartha '
  const m = new SessionManager(st, () => {}, { transcriptExists: () => true })
  const chat = m.create(process.cwd())
  assert.match((m as any).get(chat.id).buildOptions().systemPrompt.append, /^The user's name is Paartha\./)
  st._s.settings.userName = ''
  assert.ok(!((m as any).get(chat.id).buildOptions().systemPrompt.append ?? '').includes("user's name"), 'not set: nothing said')
  console.log('✓ your name: Claude is told what to call you')
}

function designMode() {
  const st: any = memStore()
  st._s.settings.artifacts = false
  const m = new SessionManager(st, () => {}, { transcriptExists: () => true })
  const shop = join(tmpdir(), 'lc-design-shop')
  const d = m.create(shop, undefined, { kind: 'slides', matchStyle: true })
  assert.equal(d.title, 'New design')
  assert.deepEqual(d.design, { kind: 'slides', matchStyle: true })
  // a design is an artifact: it has the tool (without prompts) even when artifacts are off for chats
  const opts = (m as any).get(d.id).buildOptions()
  assert.equal(opts.mcpServers.artifacts?.type, 'sdk')
  assert.ok(ARTIFACT_TOOLS.every((t) => opts.allowedTools.includes(t)), 'the artifact tool never prompts in a design')
  const prompt: string = opts.systemPrompt.append
  assert.match(prompt, /<design kind="slides">/)
  assert.match(prompt, /each slide is its own 1920×1080 frame/)
  assert.ok(prompt.includes(`Match the product in the working folder (${shop})`), 'told to match the folder’s design system')
  assert.match(prompt, /ONE create_artifact call/, 'written in one go, not in pieces')
  assert.match(prompt, /visible without JavaScript/)
  // several frames are written by subagents at the same time, in the foreground so the turn lasts until they're done
  assert.match(prompt, /subagent_type "design-screen"/)
  assert.deepEqual(Object.keys(opts.agents), ['design-screen'])
  assert.deepEqual(opts.agents['design-screen'].tools, ['mcp__artifacts__read_artifact', 'mcp__artifacts__create_artifact', 'mcp__artifacts__update_artifact'])
  assert.equal(opts.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1')
  assert.ok(Number(opts.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS) >= 6)
  assert.equal(opts.env.ANTHROPIC_API_KEY, undefined, 'still your subscription only')
  // only LocalClaude's own tools: your MCP servers, Chrome and computer use would slow it down
  st._s.settings.mcpServers = { github: { command: 'gh-mcp' } }
  st._s.settings.chromeIntegration = true
  st._s.settings.computerUse = true
  const lean = (m as any).get(d.id).buildOptions()
  assert.equal(lean.mcpServers.github, undefined)
  assert.equal(lean.mcpServers['computer-use'], undefined)
  assert.equal(lean.extraArgs, undefined)
  assert.equal(lean.strictMcpConfig, true, "MCP servers from Claude Code's settings stay out too")
  const chat = (m as any).get(m.create(process.cwd()).id).buildOptions()
  assert.equal(chat.mcpServers.artifacts, undefined, 'chats still follow the setting')
  assert.ok(chat.mcpServers.github && chat.mcpServers['computer-use'] && chat.extraArgs && !chat.strictMcpConfig, 'chats keep every tool')
  assert.ok(!chat.agents && !chat.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, 'chats are unchanged')
  assert.ok(!(chat.systemPrompt.append ?? '').includes('<design'))
  assert.equal(m.create(process.cwd(), undefined, { kind: 'prototype' }).design?.matchStyle, undefined)
  // each kind has its own guidance; matching a codebase is only asked for when chosen
  const kinds = ['prototype', 'slides', 'wireframe', 'onepager', 'other'] as const
  const prompts = kinds.map((k) => designPrompt({ kind: k }, '/x'))
  assert.equal(new Set(prompts).size, kinds.length)
  assert.ok(prompts.every((p) => p.includes('update_artifact') && !p.includes('Match the product')))
  // comment mode goes into the canvas's preview page, at the end of its body
  const page = withDesignBridge(renderArtifactPage('html', '<html><body><h1>Hi</h1></body></html>'))
  assert.match(page, /<h1>Hi<\/h1><script>\(function\(\)\{[\s\S]*__lcDesignPick[\s\S]*\}\)\(\)<\/script><\/body><\/html>$/)
  assert.ok(withDesignBridge('<svg/>').startsWith('<svg/><script>'), 'no body: added at the end')
  console.log('✓ design: own title, artifact tool and instructions per kind, only its own tools, matching a codebase, comment mode in the canvas page')
}

function streamingJson() {
  const full = JSON.stringify({ id: 'shop', type: 'html', n: 3, opts: { a: '}', b: [1, '"'] }, title: 'Tea "Shop"', content: '<h1>Hi</h1>\n<p>Ünïcode ☕ \\ done</p>' })
  // every cut-off point reads without throwing, and what's there so far is right
  for (let i = 0; i <= full.length; i++) {
    const f = streamingFields(full.slice(0, i))
    for (const [k, v] of Object.entries(f)) {
      const want = String((JSON.parse(full) as any)[k])
      assert.ok(want.startsWith(v.value), `${k} at ${i}: ${JSON.stringify(v.value)}`)
      const raw = typeof (JSON.parse(full) as any)[k] === 'string' ? JSON.stringify(want) : want + ','
      assert.equal(v.done, v.value === want && full.slice(0, i).includes(raw), `${k} done at ${i}`)
    }
  }
  const f = streamingFields(full)
  assert.deepEqual(Object.keys(f), ['id', 'type', 'n', 'title', 'content'], 'numbers are read as text, objects skipped')
  assert.deepEqual(f.n, { value: '3', done: true })
  assert.deepEqual(streamingFields('{"id":"a","width":39'), { id: { value: 'a', done: true }, width: { value: '39', done: false } }, 'a number may still be growing')
  assert.equal(f.title.value, 'Tea "Shop"')
  assert.equal(f.content.value, '<h1>Hi</h1>\n<p>Ünïcode ☕ \\ done</p>')
  assert.deepEqual(streamingFields('{"id":"a","content":"<p>half\\'), { id: { value: 'a', done: true }, content: { value: '<p>half', done: false } }, 'a cut-off escape waits')
  assert.deepEqual(streamingFields('{"x":"\\u00e'), { x: { value: '', done: false } })
  assert.deepEqual(streamingFields(''), {})
  console.log('✓ streaming JSON: tool input read field by field while it arrives, at every cut-off point')
}

async function remoteControl() {
  // what the real `claude remote-control` printed (captured from Claude Code 2.1.291)
  let st: RemoteState = { status: 'starting', log: [] }
  st = readRemoteOutput(
    st,
    'Take this session with you and pick up right where you left off on any device.\nThe session keeps running on this machine. Use your other devices as a remote\ncontrol. Press Ctrl+C to stop.\nEnable Remote Control? (y/n) '
  )
  assert.equal(st.status, 'consent')
  st = readRemoteOutput(st, '\n\x1b[2m·|·\x1b[0m Connecting · lc-rc-test · HEAD\n')
  assert.equal(st.status, 'connecting')
  const block = '·✔︎· Connected · lc-rc-test · HEAD\n    Single session · exits when complete\nContinue coding in the Claude mobile app or https://claude.ai/code/session_015abc\nspace to show QR code\n'
  st = readRemoteOutput(st, block)
  assert.equal(st.status, 'connected'); assert.equal(st.url, 'https://claude.ai/code/session_015abc'); assert.equal(st.where, 'lc-rc-test · HEAD')
  const lines = st.log.length
  st = readRemoteOutput(st, block)
  assert.equal(st.log.length, lines, 'the status block it prints again on every change is kept once')
  st = readRemoteOutput(st, '·✔︎· lc-test · lc-rc-test · HEAD\n[08:33:24] Session failed: Process exited with error cse_01\n')
  assert.equal(st.where, 'lc-rc-test · HEAD', 'the session name takes the place of "Connected"'); assert.equal(st.problem, 'Process exited with error cse_01')
  assert.ok(!st.log.some((l) => /space to show QR code|Press Ctrl\+C/.test(l)), 'terminal-only hints are left out')
  assert.equal(readRemoteOutput({ status: 'starting', log: [] }, 'Error: Workspace not trusted. Please run `claude` in C:\\x first to review and accept the workspace trust dialog.\n').status, 'untrusted')
  assert.equal(readRemoteOutput({ status: 'starting', log: [] }, 'Error: You must be logged in\n').error, 'You must be logged in')

  // trusting a folder: the flag Claude Code's own prompt sets, other settings untouched
  const dir = mkdtempSync(join(tmpdir(), 'lc-rc-'))
  const cfg = join(dir, 'claude.json')
  const work = join(dir, 'Work')
  mkdirSync(join(work, 'sub'), { recursive: true })
  writeFileSync(cfg, JSON.stringify({ numStartups: 5, projects: { 'D:/other': { hasTrustDialogAccepted: true, allowedTools: [] } } }, null, 2))
  assert.equal(isFolderTrusted(work, cfg), false)
  trustFolder(work, cfg)
  const after = JSON.parse(readFileSync(cfg, 'utf8'))
  assert.equal(after.numStartups, 5); assert.deepEqual(after.projects['D:/other'], { hasTrustDialogAccepted: true, allowedTools: [] }, 'other settings are kept')
  const key = Object.keys(after.projects).find((k) => k.endsWith('/Work'))
  assert.ok(key && !key.includes('\\'), 'the full path with forward slashes, the way Claude Code writes it')
  assert.ok(isFolderTrusted(work, cfg)); assert.ok(isFolderTrusted(join(work, 'sub'), cfg), 'folders inside a trusted one count')
  if (process.platform === 'win32') assert.ok(isFolderTrusted(work.toUpperCase(), cfg), 'Windows paths ignore case')

  // the server process (a stand-in that prints what the real one prints): trust, consent, connected, stop
  const until = async (what: string, ok: () => boolean): Promise<void> => {
    for (let t = 0; t < 200 && !ok(); t++) await new Promise((r) => setTimeout(r, 50))
    assert.ok(ok(), 'timed out waiting for ' + what)
  }
  process.env.LOCALCLAUDE_CLAUDE_CONFIG = cfg
  const phone = join(dir, 'Phone')
  mkdirSync(phone)
  const seen: string[] = []
  const rc = new RemoteControl((s) => seen.push(s.status), fakeRemoteCommand)
  rc.start({ cwd: phone, name: 'Phone', spawn: 'same-dir' })
  await until('the trust question', () => rc.state.status === 'untrusted')
  rc.trustAndRetry()
  await until('the consent question', () => rc.state.status === 'consent')
  rc.consent(true)
  await until('connected', () => rc.state.status === 'connected' && !!rc.state.url)
  assert.equal(rc.state.url, 'https://claude.ai/code/session_e2eFake01'); assert.equal(rc.state.where, 'Phone · main')
  assert.ok(seen.includes('connecting'))
  rc.stop()
  assert.equal(rc.state.status, 'off'); assert.equal(rc.running, false)
  rc.start({ cwd: phone, spawn: 'session' })
  await until('the consent question again', () => rc.state.status === 'consent')
  rc.consent(false)
  await until('stopped after "no"', () => rc.state.status === 'off' && !rc.running)
  delete process.env.LOCALCLAUDE_CLAUDE_CONFIG
  await new Promise((r) => setTimeout(r, 300))
  rmSync(dir, { recursive: true, force: true })
  console.log('✓ remote control: reading the server, trusting a folder, consent, connected with a link, stop')
}

function diffHelpers() {
  const lines = diffStrings('a\nb\nc', 'a\nB\nc\nd')
  assert.deepEqual(lines.map((l) => l.kind), ['ctx', 'del', 'add', 'ctx', 'add'])
  assert.deepEqual(countChanges(lines), { added: 2, removed: 1 })
  const fromPatch = linesFromPatch([{ oldStart: 10, oldLines: 2, newStart: 10, newLines: 2, lines: [' keep', '-old', '+new'] }])
  assert.deepEqual(fromPatch.map((l) => [l.kind, l.oldNo, l.newNo]), [['ctx', 10, 10], ['del', 11, undefined], ['add', undefined, 11]])
  console.log('✓ diff helpers: LCS line diff and structured patch numbering')
}

async function realSpawn() {
  const meta = mgr.create(process.cwd())
  events.length = 0
  mgr.send({ sessionId: meta.id, text: 'Say hi', attachments: [] })
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    if (events.some((e) => e.type === 'turn-done' && e.sessionId === meta.id) && !mgr.isRunning(meta.id)) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const types = [...new Set(events.filter((e: any) => e.sessionId === meta.id || e.meta?.id === meta.id).map((e) => e.type))]
  const init = events.find((e) => e.type === 'init') as any
  const errs = events.filter((e) => e.type === 'error').map((e: any) => e.text.slice(0, 300))
  console.log('event types:', types.join(', '))
  if (init) console.log('init: claude code', init.info.claudeCodeVersion, '| apiKeySource', init.info.apiKeySource, '| tools', init.info.tools.length)
  console.log('errors:', errs)
  assert.ok(types.includes('status'))
  assert.ok(types.includes('turn-done') || errs.length, 'turn finished or errored')
  console.log('✓ real Claude Code process spawned via the SDK and completed a turn')
  mgr.shutdownAll()
}

await synthetic()
await checkpointsAndRewind()
await slashCommandOutput()
await computerUseOption()
diffHelpers()
await artifactTool()
projectPrompt()
await memoryTool()
exportAndImport()
await reliabilityAndUx()
await chatSearch()
await imagesInChats()
await backups()
await knowledgeAndObsidian()
await gitHelpers()
await mcpServerCheck()
projectFolders()
yourName()
designMode()
streamingJson()
await remoteControl()
// The live test sends one tiny real prompt through Claude Code (uses your plan). Opt in with LOCALCLAUDE_E2E=1.
if (process.env.LOCALCLAUDE_E2E) await realSpawn()
else console.log('(skipping live test; set LOCALCLAUDE_E2E=1 to run it)')
process.exit(0)
