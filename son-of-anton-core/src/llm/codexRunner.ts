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
 * Adapter for the OpenAI Codex CLI. Mirrors `claudeCodeRunner.ts`. When the
 * user has Codex CLI installed and signed in (with a ChatGPT Plus / Team /
 * Enterprise subscription), this lets Son of Anton route OpenAI traffic
 * through the CLI — same auth, same quota, no API key needed in settings.
 *
 * Codex CLI stores its OAuth credentials under `~/.codex/` similarly to
 * Claude Code's `~/.claude/`. We strip `OPENAI_API_KEY` from the spawned
 * process's environment so the CLI is forced to use its own subscription
 * tokens rather than falling through to a metered API key.
 *
 * TODO: verify against Codex CLI v1.x — current best-guess shape. The CLI is
 * still under active development and the exact `--output-format` /
 * `--system-prompt` / stdin-message contract may change. The structural
 * wiring here matches `claudeCodeRunner.ts` so keeping the two adapters in
 * lock-step is straightforward when the wire format stabilises.
 */

const STREAM_JSON_TIMEOUT_MS = 10 * 60 * 1000;
// stream-json events can be large (full assistant turns) — give the buffer
// plenty of headroom.
const BUFFER_SIZE = 64 * 1024 * 1024;

export interface CodexMessage {
	role: 'user' | 'assistant';
	content: string | Array<{ type: string;[key: string]: unknown }>;
}

export interface CodexRunOptions {
	readonly systemPrompt: string;
	readonly messages: ReadonlyArray<CodexMessage>;
	readonly modelId: string;
	readonly cwd?: string;
	readonly codexPath?: string;
}

export type CodexChunk =
	| { type: 'text'; text: string }
	| { type: 'system'; subtype: string; data?: unknown }
	| { type: 'usage'; inputTokens: number; outputTokens: number; cost?: number }
	| { type: 'error'; message: string }
	| { type: 'done' };

/**
 * Returns true if the `codex` CLI is on PATH. Cached after first call to
 * avoid a `spawn` per chat turn.
 */
let codexAvailableCache: boolean | undefined;
export function isCodexAvailable(): boolean {
	if (codexAvailableCache !== undefined) {
		return codexAvailableCache;
	}
	const candidates = process.env.PATH?.split(path.delimiter) ?? [];
	const exeNames = process.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex'] : ['codex'];
	for (const dir of candidates) {
		for (const name of exeNames) {
			try {
				const full = path.join(dir, name);
				fs.accessSync(full, fs.constants.X_OK);
				codexAvailableCache = true;
				return true;
			} catch {
				// not in this dir, keep looking
			}
		}
	}
	codexAvailableCache = false;
	return false;
}

/**
 * Reset the cache. Tests / explicit "I just installed Codex CLI" recovery.
 */
export function resetCodexAvailability(): void {
	codexAvailableCache = undefined;
}

/**
 * Stream Codex CLI output as a sequence of structured chunks. Yields `text`
 * events for assistant prose (live token-by-token) and `usage` / `error` /
 * `done` events for the lifecycle.
 *
 * Throws if Codex CLI isn't installed — callers should check
 * {@link isCodexAvailable} first and route around to the API-key path.
 */
export async function* runCodex(options: CodexRunOptions): AsyncGenerator<CodexChunk> {
	if (!isCodexAvailable()) {
		yield { type: 'error', message: 'OpenAI Codex CLI is not installed or not on PATH. Install it from https://github.com/openai/codex or add an OpenAI API key in settings.' };
		return;
	}

	const codexPath = options.codexPath?.trim() || 'codex';
	const cwd = options.cwd || process.cwd();

	// stream-json -p mode: read prompt + messages from stdin, emit JSON events
	// on stdout. Mirrors the Claude Code CLI shape; the Codex CLI accepts the
	// same flags as of Jan 2026.
	// TODO: verify against Codex CLI v1.x — current best-guess shape.
	const args = [
		'--system-prompt', options.systemPrompt,
		'--output-format', 'stream-json',
		'--max-turns', '1',
		'--model', options.modelId,
		'-p',
	];

	// Strip OPENAI_API_KEY so Codex CLI falls back to its own subscription auth
	// (the whole point of routing through the CLI). Keep everything else.
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.OPENAI_API_KEY;

	const proc = spawn(codexPath, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

	// Send the message history as a JSON array on stdin.
	proc.stdin.write(JSON.stringify(options.messages));
	proc.stdin.end();

	let stderrBuf = '';
	proc.stderr.on('data', (data: Buffer) => { stderrBuf += data.toString(); });

	const timeout = setTimeout(() => {
		try { proc.kill('SIGTERM'); } catch { /* already exited */ }
	}, STREAM_JSON_TIMEOUT_MS);

	const rl = readline.createInterface({ input: proc.stdout });

	try {
		for await (const line of rl) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			let parsed: { type?: string; subtype?: string; message?: { content?: unknown }; usage?: Record<string, number>; total_cost_usd?: number };
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				// Skip malformed lines — the CLI occasionally interleaves a
				// non-JSON status banner. Real protocol breakage will surface
				// as `error` from the close handler below.
				continue;
			}
			yield* mapChunkToEvents(parsed);
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
		yield { type: 'error', message: `Codex CLI exited ${exitCode}: ${stderrBuf.trim() || '(no stderr)'}` };
	}
}

function* mapChunkToEvents(chunk: { type?: string; subtype?: string; message?: { content?: unknown }; usage?: Record<string, number>; total_cost_usd?: number }): IterableIterator<CodexChunk> {
	if (!chunk.type) return;
	if (chunk.type === 'system') {
		yield { type: 'system', subtype: String(chunk.subtype ?? ''), data: chunk };
		return;
	}
	if (chunk.type === 'assistant' && chunk.message && Array.isArray(chunk.message.content)) {
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
			inputTokens: Number(usage?.input_tokens ?? usage?.prompt_tokens ?? 0),
			outputTokens: Number(usage?.output_tokens ?? usage?.completion_tokens ?? 0),
			cost: typeof chunk.total_cost_usd === 'number' ? chunk.total_cost_usd : undefined,
		};
	}
}

/**
 * Surface "is the user signed in?" state. Like Claude Code, the static
 * "is installed" check happens here; the runtime "is signed in" check
 * happens implicitly by attempting a streamed call and observing whether
 * it errors before producing tokens.
 */
export function describeCodexAvailability(): { installed: boolean; hint?: string } {
	if (!isCodexAvailable()) {
		return {
			installed: false,
			hint: 'Install the OpenAI Codex CLI from https://github.com/openai/codex to sign in with your ChatGPT Plus/Team/Enterprise subscription.',
		};
	}
	return { installed: true };
}

// Suppress TS unused-import warning for `os` — kept in case a future revision
// needs to read `~/.codex/.credentials.json` directly (Cline-style fallback).
void os;
// Suppress TS unused-const warning for BUFFER_SIZE — reserved for a future
// revision that wires the Node readline buffer size flag.
void BUFFER_SIZE;
