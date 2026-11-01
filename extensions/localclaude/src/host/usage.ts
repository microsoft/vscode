// Your plan's usage limits (5-hour session, weekly, per-model), as Claude Code reports them.
// The SDK marks this API experimental, so every field is treated as optional.
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { query } from './sdk'
import { homedir } from 'node:os'
import type { PlanUsage, UsageWindow } from '../shared/types'
import { resolveClaudeBinary, subscriptionEnv } from './claude'

type Raw = Awaited<ReturnType<Query['usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET']>>

const LABELS: Record<string, string> = {
  five_hour: 'Current session (5-hour limit)',
  seven_day: 'Weekly · all models',
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
  seven_day_oauth_apps: 'Weekly · apps'
}

export function mapUsage(r: Raw | null | undefined): PlanUsage {
  const base = { subscription: r?.subscription_type ?? null, fetchedAt: Date.now() }
  const limits = r?.rate_limits
  if (!r || !r.rate_limits_available || !limits) return { ...base, available: false, windows: [], extra: null }
  const windows: UsageWindow[] = []
  for (const key of Object.keys(LABELS)) {
    const w = (limits as Record<string, { utilization: number | null; resets_at: string | null } | null | undefined>)[key]
    if (w && (w.utilization !== null || w.resets_at)) windows.push({ key, label: LABELS[key], utilization: w.utilization, resetsAt: w.resets_at })
  }
  for (const m of limits.model_scoped ?? [])
    windows.push({ key: 'model:' + m.display_name, label: `Weekly · ${m.display_name}`, utilization: m.utilization, resetsAt: m.resets_at })
  const x = limits.extra_usage
  return {
    ...base,
    available: true,
    windows,
    extra: x ? { enabled: x.is_enabled, utilization: x.utilization, used: x.used_credits, limit: x.monthly_limit, currency: x.currency ?? null } : null
  }
}

/** Read usage from a running chat if there is one, else from a short-lived Claude Code process. */
export async function fetchUsage(live?: () => Promise<Raw>): Promise<PlanUsage> {
  try {
    if (live) return mapUsage(await live())
    return mapUsage(await probe())
  } catch (e) {
    return { available: false, subscription: null, windows: [], extra: null, fetchedAt: Date.now(), error: e instanceof Error ? e.message : String(e) }
  }
}

async function probe(): Promise<Raw> {
  let stop: () => void = () => {}
  // A prompt stream that never sends anything: the process only answers the usage request.
  const idle: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<SDKUserMessage>>((resolve) => (stop = () => resolve({ done: true, value: undefined }))) })
  }
  const abort = new AbortController()
  const q = query({
    prompt: idle,
    options: {
      cwd: homedir(),
      env: subscriptionEnv(),
      pathToClaudeCodeExecutable: resolveClaudeBinary(),
      settingSources: [],
      persistSession: false,
      abortController: abort
    }
  })
  const drain = (async () => {
    try {
      for await (const _ of q) void _
    } catch {
      /* closed */
    }
  })()
  try {
    return await Promise.race([
      q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Claude Code took too long to report usage')), 30000))
    ])
  } finally {
    stop()
    abort.abort()
    void drain
  }
}
