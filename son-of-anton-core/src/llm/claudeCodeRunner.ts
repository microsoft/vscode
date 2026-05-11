/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';

/**
 * Adapter for the Claude Code CLI. When the user has Claude Code installed and
 * signed in (with a subscription), this lets Son of Anton route Anthropic
 * traffic through the CLI — same auth, same quota, no API key needed in
 * settings. Mirrors Cline's approach: spawn `claude --output-format stream-json
 * -p`, write messages on stdin, parse JSON events from stdout.
 */

const STREAM_JSON_TIMEOUT_MS = 10 * 60 * 1000;
// stream-json events can be large (full assistant turns) — give the buffer
// plenty of headroom.
const BUFFER_SIZE = 64 * 1024 * 1024;

export interface ClaudeCodeMessage {
	role: 'user' | 'assistant';
	content: string | Array<{ type: string;[key: string]: unknown }>;
}

export interface ClaudeCodeRunOptions {
	readonly systemPrompt: string;
	readonly messages: ReadonlyArray<ClaudeCodeMessage>;
	readonly modelId: string;
	readonly cwd?: string;
	readonly claudePath?: string;
}

export type ClaudeCodeChunk =
	| { type: 'text'; text: string }
	| { type: 'system'; subtype: string; data?: unknown }
	| { type: 'rate_limit_event'; data?: unknown }
	| { type: 'usage'; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheCreationTokens?: number; cost?: number }
	| { type: 'error'; message: string }
	| { type: 'done' };

/**
 * Returns true if the `claude` CLI is on PATH. Cached after first call to
 * avoid a `spawn` per chat turn.
 */
let claudeAvailableCache: boolean | undefined;
export function isClaudeCodeAvailable(): boolean {
	if (claudeAvailableCache !== undefined) {
		return claudeAvailableCache;
	}
	const candidates = process.env.PATH?.split(path.delimiter) ?? [];
	const exeNames = process.platform === 'win32' ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];
	for (const dir of candidates) {
		for (const name of exeNames) {
			try {
				const full = path.join(dir, name);
				fs.accessSync(full, fs.constants.X_OK);
				claudeAvailableCache = true;
				return true;
			} catch {
				// not in this dir, keep looking
			}
		}
	}
	claudeAvailableCache = false;
	return false;
}

/**
 * Reset the cache. Tests / explicit "I just installed Claude Code" recovery.
 */
export function resetClaudeCodeAvailability(): void {
	claudeAvailableCache = undefined;
}

/**
 * Stream Claude Code CLI output as a sequence of structured chunks. Yields
 * `text` events for assistant prose (live token-by-token) and `usage` /
 * `error` / `done` events for the lifecycle.
 *
 * Throws if Claude Code isn't installed — callers should check
 * {@link isClaudeCodeAvailable} first and route around to the API-key path.
 */
export async function* runClaudeCode(options: ClaudeCodeRunOptions): AsyncGenerator<ClaudeCodeChunk> {
	if (!isClaudeCodeAvailable()) {
		yield { type: 'error', message: 'Claude Code CLI is not installed or not on PATH. Install it from https://docs.anthropic.com/en/docs/claude-code or add an Anthropic API key in settings.' };
		return;
	}

	const claudePath = options.claudePath?.trim() || 'claude';
	const cwd = options.cwd || process.cwd();

	// stream-json -p mode: read prompt + messages from stdin, emit JSON events
	// on stdout. `--max-turns 1` keeps the CLI from running its own agent loop
	// (we orchestrate that on our side). `--include-partial-messages` makes
	// the CLI emit per-delta `stream_event` chunks so the chat surface sees
	// tokens flowing as Claude generates them; without it the CLI emits ONE
	// consolidated `assistant` event per turn and the response appears as a
	// single snap instead of a stream.
	const args = [
		'--system-prompt', options.systemPrompt,
		'--verbose',
		'--output-format', 'stream-json',
		'--include-partial-messages',
		'--max-turns', '1',
		'--model', options.modelId,
		'-p',
	];

	// Strip ANTHROPIC_API_KEY so Claude Code falls back to its own subscription
	// auth (the whole point of routing through the CLI). Keep everything else.
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.ANTHROPIC_API_KEY;
	env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1';
	env.DISABLE_NON_ESSENTIAL_MODEL_CALLS = env.DISABLE_NON_ESSENTIAL_MODEL_CALLS ?? '1';

	const proc = spawn(claudePath, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

	// Send the message history as a JSON array on stdin.
	proc.stdin.write(JSON.stringify(options.messages));
	proc.stdin.end();

	let stderrBuf = '';
	proc.stderr.on('data', (data: Buffer) => { stderrBuf += data.toString(); });

	const timeout = setTimeout(() => {
		try { proc.kill('SIGTERM'); } catch { /* already exited */ }
	}, STREAM_JSON_TIMEOUT_MS);

	const rl = readline.createInterface({ input: proc.stdout });
	// `sawDelta` is tracked across the whole CLI invocation so the
	// consolidated `assistant` event can suppress its (duplicate) text
	// emission whenever any partial-message delta has already streamed.
	const ctx = { sawDelta: false };

	try {
		for await (const line of rl) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			let parsed: ParsedChunk;
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				// Skip malformed lines — the CLI occasionally interleaves a
				// non-JSON status banner. Real protocol breakage will surface
				// as `error` from the close handler below.
				continue;
			}
			yield* mapChunkToEvents(parsed, ctx);
		}
		yield { type: 'done' };
	} finally {
		clearTimeout(timeout);
		try { proc.stdout.destroy(); } catch { /* */ }
	}

	// Surface non-zero exit as an error event so callers can distinguish
	// "no output, clean exit" from "process crashed".
	const exitCode: number | null = await new Promise(resolve => {
		if (proc.exitCode !== null) resolve(proc.exitCode);
		else proc.once('close', code => resolve(code));
	});
	if (exitCode !== 0 && exitCode !== null) {
		yield { type: 'error', message: `Claude Code CLI exited ${exitCode}: ${stderrBuf.trim() || '(no stderr)'}` };
	}
}

/**
 * Top-level CLI chunk shape we care about. `event` carries the nested
 * Anthropic SSE event when `chunk.type === 'stream_event'` — that's where
 * the per-delta `text_delta` payloads live when `--include-partial-messages`
 * is enabled.
 */
interface ParsedChunk {
	type?: string;
	subtype?: string;
	message?: { content?: unknown };
	usage?: Record<string, number>;
	total_cost_usd?: number;
	event?: {
		type?: string;
		delta?: { type?: string; text?: string };
	};
}

function* mapChunkToEvents(chunk: ParsedChunk, ctx: { sawDelta: boolean }): IterableIterator<ClaudeCodeChunk> {
	if (!chunk.type) return;
	if (chunk.type === 'system') {
		yield { type: 'system', subtype: String(chunk.subtype ?? ''), data: chunk };
		return;
	}
	if (chunk.type === 'rate_limit_event') {
		yield { type: 'rate_limit_event', data: chunk };
		return;
	}
	// Per-token streaming: `--include-partial-messages` makes the CLI emit
	// nested Anthropic SSE events. Only `content_block_delta` with a
	// `text_delta` payload carries the user-visible token text; everything
	// else (message_start, content_block_stop, message_delta, message_stop)
	// is structural and ignored.
	if (chunk.type === 'stream_event' && chunk.event) {
		if (chunk.event.type === 'content_block_delta' && chunk.event.delta?.type === 'text_delta') {
			const text = chunk.event.delta.text;
			if (typeof text === 'string' && text.length > 0) {
				ctx.sawDelta = true;
				yield { type: 'text', text };
			}
		}
		return;
	}
	// Consolidated `assistant` event arrives at the end of each turn with
	// the full assembled text. With `--include-partial-messages` enabled the
	// caller has already streamed every delta — re-emitting here would
	// double-render the reply. We only fall back to emitting from this
	// event when no deltas were observed (older Claude CLI or a future
	// release that drops the partial-message stream).
	if (chunk.type === 'assistant' && chunk.message && Array.isArray(chunk.message.content)) {
		if (ctx.sawDelta) {
			return;
		}
		for (const block of chunk.message.content) {
			if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
				const text = (block as { text?: string }).text;
				if (typeof text === 'string') {
					yield { type: 'text', text };
				}
			}
		}
		return;
	}
	if (chunk.type === 'result') {
		const usage = chunk.usage;
		yield {
			type: 'usage',
			inputTokens: Number(usage?.input_tokens ?? 0),
			outputTokens: Number(usage?.output_tokens ?? 0),
			cacheReadTokens: Number(usage?.cache_read_input_tokens ?? 0),
			cacheCreationTokens: Number(usage?.cache_creation_input_tokens ?? 0),
			cost: typeof chunk.total_cost_usd === 'number' ? chunk.total_cost_usd : undefined,
		};
	}
}

/**
 * Surface "is the user signed in?" state. The CLI itself reports this via the
 * `system/init` event's `apiKeySource` field — when it's `"none"`, the user is
 * on a subscription. We expose the static "is installed" check here; the
 * runtime "is signed in" check happens implicitly by attempting a streamed
 * call and observing whether it errors before producing tokens.
 */
export function describeClaudeCodeAvailability(): { installed: boolean; hint?: string } {
	if (!isClaudeCodeAvailable()) {
		return {
			installed: false,
			hint: 'Install Claude Code from https://docs.anthropic.com/en/docs/claude-code to sign in with your subscription.',
		};
	}
	return { installed: true };
}

// Suppress TS unused-import warning for `os` — kept in case a future revision
// needs to read `~/.claude/.credentials.json` directly (Cline-style fallback).
void os;
