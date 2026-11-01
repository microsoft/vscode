// "Test" for an MCP server in Settings: connect the way Claude Code would, list its tools, disconnect.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpServerEntry, McpTestResult } from '../shared/types'

function within<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([p, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)))]).finally(() => clearTimeout(timer))
}

export async function testMcpServer(entry: McpServerEntry, opts: { cwd?: string; timeoutMs?: number } = {}): Promise<McpTestResult> {
  const timeout = opts.timeoutMs ?? 45_000
  const started = Date.now()
  let stderr = ''
  let transport: Transport
  try {
    if (entry.type === 'http' || entry.type === 'sse') {
      if (!entry.url) return { ok: false, error: 'Add the server’s URL.' }
      const url = new URL(entry.url)
      const requestInit = { headers: entry.headers ?? {} }
      transport = entry.type === 'http' ? new StreamableHTTPClientTransport(url, { requestInit }) : new SSEClientTransport(url, { requestInit })
    } else {
      if (!entry.command) return { ok: false, error: 'Add the command that starts the server.' }
      const stdio = new StdioClientTransport({ command: entry.command, args: entry.args ?? [], env: { ...getDefaultEnvironment(), ...entry.env }, cwd: opts.cwd, stderr: 'pipe' })
      // what the server prints on stderr explains most failures
      stdio.stderr?.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)))
      transport = stdio
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const client = new Client({ name: 'localclaude-check', version: '1.0.0' })
  try {
    const seconds = Math.round(timeout / 1000)
    await within(client.connect(transport), timeout, `The server didn’t answer within ${seconds} seconds.`)
    const { tools } = await within(client.listTools(), timeout, `The server didn’t list its tools within ${seconds} seconds.`)
    return { ok: true, tools: tools.map((t) => t.name), server: client.getServerVersion()?.name, ms: Date.now() - started }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // a server that crashed may still be flushing why
    if (!stderr) await new Promise((r) => setTimeout(r, 150))
    const detail = stderr.trim().split('\n').slice(-4).join('\n')
    return { ok: false, error: detail && !msg.includes(detail) ? `${msg}\n${detail}` : msg }
  } finally {
    await client.close().catch(() => {})
  }
}
