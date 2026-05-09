/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { CoreHost, Notifier } from '../host';

/**
 * Lifecycle events recognised by the hook runner. Kept as a frozen tuple so
 * the management CLI can validate `sota hooks add <event>` against the same
 * source of truth the runner uses, without a second declaration drifting.
 */
export const HOOK_EVENTS = [
	'pre-prompt',
	'post-response',
	'pre-tool-call',
	'post-tool-call',
	'pre-write-file',
	'pre-shell-command',
	'session-start',
	'session-end',
] as const;

export type HookEvent = typeof HOOK_EVENTS[number];

/**
 * `pre-*` events that can rewrite their payload via the last script's stdout.
 * Kept narrow on purpose — letting `pre-tool-call` mutate inputs would mean
 * the harness has to re-validate tool input shapes, which we don't want yet.
 */
const REPLACEMENT_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
	'pre-prompt',
	'pre-write-file',
]);

const HOOKS_RELATIVE_PATH = path.join('.son-of-anton', 'hooks.json');
const HOOK_TIMEOUT_MS = 5000;

/** Per-script execution result. Captured even when the runner times the script out. */
export interface HookScriptResult {
	readonly path: string;
	readonly exit: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut?: boolean;
}

/**
 * Aggregate result of firing all scripts for one event.
 *
 * - `allowed` is `false` if any pre-* script exited non-zero. Informational
 *   events are always allowed.
 * - `replacement` is the trimmed stdout of the last script that produced any,
 *   but only for the events listed in {@link REPLACEMENT_EVENTS}. Callers
 *   read it directly without consulting `scriptResults`.
 */
export interface HookFireResult {
	readonly allowed: boolean;
	readonly replacement?: string;
	readonly scriptResults: ReadonlyArray<HookScriptResult>;
}

/** On-disk shape of `.son-of-anton/hooks.json`. */
export type HooksFile = Partial<Record<HookEvent, ReadonlyArray<string>>>;

/**
 * Resolve the workspace root the runner should anchor against. The CLI host
 * always populates at least one folder (the cwd), so we treat the first
 * folder as the workspace root.
 */
function resolveWorkspaceRoot(host: CoreHost): string {
	const folder = host.workspace.folders[0];
	return folder ? folder.fsPath : process.cwd();
}

/**
 * Absolute path to the hooks file for the given workspace root. Exported so
 * the management command writes through the exact same location the runner
 * reads from.
 */
export function hooksFilePath(workspaceRoot: string): string {
	return path.join(workspaceRoot, HOOKS_RELATIVE_PATH);
}

/**
 * Read and shape-validate the hooks file. Anything that doesn't match the
 * declared schema (`{ "<event>": ["script", ...] }`) is silently dropped so
 * a partially-broken file can't kill the session.
 */
function readHooksFile(workspaceRoot: string): HooksFile {
	const filePath = hooksFilePath(workspaceRoot);
	let raw: string;
	try {
		raw = fs.readFileSync(filePath, 'utf8');
	} catch {
		return {};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return {};
	}
	const out: HooksFile = {};
	for (const event of HOOK_EVENTS) {
		const value = (parsed as Record<string, unknown>)[event];
		if (!Array.isArray(value)) {
			continue;
		}
		const scripts = value.filter((s): s is string => typeof s === 'string' && s.length > 0);
		if (scripts.length > 0) {
			out[event] = scripts;
		}
	}
	return out;
}

/**
 * Resolve a configured script path against the workspace root. Absolute
 * paths are returned untouched so users can reference shared toolchains
 * outside the workspace when they really mean to.
 */
function resolveScriptPath(workspaceRoot: string, script: string): string {
	return path.isAbsolute(script) ? script : path.resolve(workspaceRoot, script);
}

/**
 * Spawn one hook script with the JSON-stringified payload on stdin. The
 * child gets a fresh copy of the parent env so authors can read e.g.
 * `$SOTA_WORKSPACE_ROOT` without leaking unrelated harness state.
 *
 * The timeout is enforced manually rather than via `spawn`'s `timeout`
 * option so we can capture whatever stdout/stderr arrived before the kill
 * and still surface it to the caller.
 */
async function runOneScript(
	workspaceRoot: string,
	scriptPath: string,
	payload: unknown,
	notifier: Notifier,
): Promise<HookScriptResult> {
	const absolute = resolveScriptPath(workspaceRoot, scriptPath);
	return await new Promise<HookScriptResult>((resolve) => {
		const child = spawn(absolute, [], {
			cwd: workspaceRoot,
			env: { ...process.env, SOTA_WORKSPACE_ROOT: workspaceRoot },
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let settled = false;

		const settle = (result: HookScriptResult) => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};

		const timer = setTimeout(() => {
			timedOut = true;
			notifier.warn(`hook ${scriptPath} exceeded ${HOOK_TIMEOUT_MS}ms — proceeding without its output`);
			try { child.kill('SIGKILL'); } catch { /* already gone */ }
			settle({ path: scriptPath, exit: null, stdout, stderr, timedOut: true });
		}, HOOK_TIMEOUT_MS);

		child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
		child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

		child.on('error', (err) => {
			settle({
				path: scriptPath,
				exit: null,
				stdout,
				stderr: stderr + (stderr.endsWith('\n') || stderr === '' ? '' : '\n') + `spawn error: ${err.message}`,
			});
		});

		child.on('close', (code) => {
			if (timedOut) {
				return;
			}
			settle({ path: scriptPath, exit: code, stdout, stderr });
		});

		try {
			child.stdin?.end(JSON.stringify(payload ?? {}));
		} catch {
			// Stream already closed (rare race); the close handler will resolve us.
		}
	});
}

/**
 * Workspace-trust-gated runner for `.son-of-anton/hooks.json`. Built once at
 * session start; reads its config at construction time so a user editing
 * `hooks.json` mid-session won't see the new rules until the next session —
 * the same contract Claude Code's hooks promise.
 */
export class HookRunner {
	private readonly workspaceRoot: string;
	private readonly trusted: boolean;
	private readonly hooks: HooksFile;
	private readonly notifier: Notifier;

	constructor(host: CoreHost) {
		this.workspaceRoot = resolveWorkspaceRoot(host);
		this.trusted = host.workspace.isTrusted;
		this.hooks = this.trusted ? readHooksFile(this.workspaceRoot) : {};
		this.notifier = host.notifier;
	}

	/** Whether the workspace was trusted when this runner was constructed. */
	get isTrusted(): boolean {
		return this.trusted;
	}

	/** Snapshot of the configured scripts per event, useful for diagnostics. */
	get configured(): HooksFile {
		return this.hooks;
	}

	/**
	 * Fire every script registered for `event` in declaration order. Returns
	 * an aggregate `HookFireResult`; never throws — script failures and
	 * timeouts are captured in the per-script result records.
	 *
	 * For untrusted workspaces this is a no-op that returns `allowed: true`
	 * so the chat flow can call it unconditionally without branching.
	 */
	async fire(event: HookEvent, payload: unknown): Promise<HookFireResult> {
		const scripts = this.hooks[event];
		if (!this.trusted || !scripts || scripts.length === 0) {
			return { allowed: true, scriptResults: [] };
		}

		const results: HookScriptResult[] = [];
		let allowed = true;
		let replacement: string | undefined;
		const isPre = event.startsWith('pre-');
		const supportsReplacement = REPLACEMENT_EVENTS.has(event);

		for (const script of scripts) {
			const result = await runOneScript(this.workspaceRoot, script, payload, this.notifier);
			results.push(result);
			if (isPre && result.exit !== null && result.exit !== 0) {
				allowed = false;
			}
			if (supportsReplacement && !result.timedOut) {
				const trimmed = result.stdout.replace(/\s+$/u, '');
				if (trimmed.length > 0) {
					replacement = trimmed;
				}
			}
		}

		return { allowed, replacement, scriptResults: results };
	}
}
