/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import { ExecOptions, ExecResult } from '../../kernel/host';
import { PathOutsideWorkspaceError, resolveInside } from './nodeFileSystem';

const DEFAULT_MAX_OUTPUT = 1024 * 1024;
/** Every run ends eventually; long-lived servers (OpenOCD, GDB) will get their own handle API. */
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const KILL_GRACE_MS = 2000;
/** After the child exits, how long to wait for pipes held open by its own children. */
const DRAIN_MS = 1000;
/** Extra bytes kept past the cap so a secret straddling it is still recognised and redacted. */
const REDACT_SLACK = 512;
const REPLACEMENT = '�';

export interface RunProcessOptions extends ExecOptions {
	/** Environment the child starts from (default: this process's). `env` is merged on top. */
	readonly baseEnv?: Readonly<Record<string, string | undefined>>;
	/** Applied to every `onOutput` chunk and to the captured output before it is capped. */
	readonly redact?: (text: string) => string;
}

const failed = (spawnError: string): ExecResult => ({ exitCode: null, stdout: '', stderr: '', timedOut: false, cancelled: false, truncated: false, spawnError });

/** Children still running; killed when this process exits (see {@link killAllChildren}). */
const liveChildren = new Set<ChildProcess>();
let exitHookInstalled = false;

/**
 * Kills every running child tree. Children run in their own process groups, so a terminal
 * Ctrl-C no longer reaches them: hosts that handle SIGINT/SIGTERM (the CLI, the MCP server)
 * must call this from their handler. A normal process `exit` calls it automatically.
 */
export function killAllChildren(): void {
	for (const child of liveChildren) {
		killTree(child, 'SIGKILL');
	}
	liveChildren.clear();
}

/** Kills the child and everything it started (its process group on POSIX, its tree on Windows). */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
	if (child.pid === undefined) {
		return;
	}
	try {
		if (process.platform === 'win32') {
			spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => { });
		} else {
			process.kill(-child.pid, signal);
		}
	} catch {
		try {
			child.kill(signal);
		} catch {
			// already gone
		}
	}
}

/** Cuts `text` to at most `maxBytes` of UTF-8 without splitting a character. */
function capBytes(text: string, maxBytes: number): { value: string; truncated: boolean } {
	if (Buffer.byteLength(text) <= maxBytes) {
		return { value: text, truncated: false };
	}
	let cut = Buffer.from(text).subarray(0, Math.max(maxBytes, 0)).toString('utf8');
	if (cut.endsWith(REPLACEMENT) && !text.startsWith(cut)) {
		cut = cut.slice(0, -1); // the cap split a character
	}
	return { value: cut, truncated: true };
}

/**
 * Runs a program **without a shell** (arguments are never re-parsed, so model-provided strings
 * cannot inject commands), in its own process group, so that timeouts, cancellation and normal
 * completion also stop anything it started. Captures output up to a cap and never rejects:
 * start failures come back as `spawnError`. The working directory must resolve inside `root`,
 * symlinks included.
 */
export async function runProcess(root: string, command: string, args: readonly string[], options: RunProcessOptions = {}): Promise<ExecResult> {
	let cwd: string;
	try {
		cwd = await resolveInside(root, options.cwd ?? '.');
	} catch (err) {
		return failed(err instanceof PathOutsideWorkspaceError ? `Working directory "${options.cwd}" is outside the workspace` : String(err instanceof Error ? err.message : err));
	}
	const maxOutput = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
	const redact = options.redact ?? ((text: string) => text);

	return new Promise<ExecResult>(resolve => {
		const raw = { stdout: '', stderr: '' };
		let overflow = false;
		let timedOut = false;
		let cancelled = false;
		let settled = false;
		let exitCode: number | null = null;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		let drainTimer: ReturnType<typeof setTimeout> | undefined;

		let child: ChildProcess;
		try {
			child = spawn(command, [...args], {
				cwd,
				env: { ...(options.baseEnv ?? process.env), ...options.env },
				shell: false,
				detached: process.platform !== 'win32', // own process group, see killTree
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		} catch (err) {
			resolve(failed(err instanceof Error ? err.message : String(err)));
			return;
		}
		liveChildren.add(child);
		if (!exitHookInstalled) {
			exitHookInstalled = true;
			process.once('exit', killAllChildren);
		}

		const stop = () => {
			if (settled || killTimer) {
				return;
			}
			killTree(child, 'SIGTERM');
			killTimer = setTimeout(() => killTree(child, 'SIGKILL'), KILL_GRACE_MS);
		};
		const onAbort = () => {
			cancelled = true;
			stop();
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			stop();
		}, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

		const finish = (result: { exitCode: number | null; spawnError?: string }) => {
			if (settled) {
				return;
			}
			settled = true;
			liveChildren.delete(child);
			// Nothing the command started may outlive it (background `&` jobs, daemons).
			if (process.platform !== 'win32') {
				killTree(child, 'SIGTERM');
			}
			clearTimeout(timeout);
			clearTimeout(killTimer);
			clearTimeout(drainTimer);
			options.signal?.removeEventListener('abort', onAbort);
			// Redact the whole capture first, then cap: a secret cut by the cap would no longer match.
			const stdout = capBytes(redact(raw.stdout), maxOutput);
			const stderr = capBytes(redact(raw.stderr), maxOutput);
			resolve({ ...result, stdout: stdout.value, stderr: stderr.value, timedOut, cancelled, truncated: overflow || stdout.truncated || stderr.truncated });
		};

		const append = (stream: 'stdout' | 'stderr', text: string) => {
			if (options.onOutput) {
				try {
					options.onOutput(stream, redact(text));
				} catch {
					// a faulty listener must not take the host down
				}
			}
			const next = capBytes(raw[stream] + text, maxOutput + REDACT_SLACK);
			overflow ||= next.truncated;
			raw[stream] = next.value;
		};
		child.stdout!.setEncoding('utf8');
		child.stderr!.setEncoding('utf8');
		child.stdout!.on('data', (d: string) => append('stdout', d));
		child.stderr!.on('data', (d: string) => append('stderr', d));

		if (options.signal?.aborted) {
			onAbort();
		} else {
			options.signal?.addEventListener('abort', onAbort, { once: true });
		}

		child.on('error', err => finish({ exitCode: null, spawnError: err.message }));
		child.on('exit', code => {
			exitCode = code;
			// A background grandchild may keep the pipes open forever; don't wait for it.
			drainTimer = setTimeout(() => {
				child.stdout?.destroy();
				child.stderr?.destroy();
				finish({ exitCode });
			}, DRAIN_MS);
		});
		child.on('close', code => finish({ exitCode: code ?? exitCode }));
	});
}
