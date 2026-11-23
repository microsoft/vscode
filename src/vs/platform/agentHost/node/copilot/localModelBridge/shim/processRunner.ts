/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import type { IDisposable } from '../../../../../../base/common/lifecycle.js';

/* One-shot process execution for the on-device model bridge (probes and OS tools); the server uses {@link NodeLongLivedProcessSpawner}, orphan checks {@link NodeProcessControl}. */

/** Options for {@link IProcessRunner.run}. */
export interface IProcessRunOptions {
	/** Working directory. Probes pass a VS Code temp directory, never a workspace. */
	readonly cwd?: string;
	/** Full environment of the child. `undefined` inherits the host environment. */
	readonly env?: Readonly<Record<string, string>>;
	/** Kill the process after this many milliseconds. */
	readonly timeoutMs: number;
	/** Stop collecting (and kill the process) once stdout + stderr exceed this many bytes. */
	readonly maxOutputBytes: number;
	/** Kills the process when aborted. */
	readonly signal?: AbortSignal;
	/** Written to stdin, which is then closed. Without it stdin is ignored. */
	readonly stdin?: string;
}

/** Outcome of one process run. Never rejects for process failures; inspect the fields. */
export interface IProcessRunResult {
	/** Exit code, normalized to an unsigned 32-bit value on Windows; `undefined` when the process did not exit normally. */
	readonly exitCode: number | undefined;
	/** Terminating signal, when killed. */
	readonly signal: string | undefined;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
	/** Output exceeded {@link IProcessRunOptions.maxOutputBytes}; the process was killed. */
	readonly truncated: boolean;
	readonly aborted: boolean;
	/** Spawn failure (`ENOENT`, `EPERM`, `EACCES`, ...). */
	readonly spawnErrorCode?: string;
}

/** Runs a process to completion with bounded time and output. */
export interface IProcessRunner {
	run(file: string, args: readonly string[], options: IProcessRunOptions): Promise<IProcessRunResult>;
}

/** Node {@link IProcessRunner}: `spawn` without a shell, `windowsHide`, hard timeout and output cap, abortable. */
export class NodeProcessRunner implements IProcessRunner {

	run(file: string, args: readonly string[], options: IProcessRunOptions): Promise<IProcessRunResult> {
		return new Promise<IProcessRunResult>(resolve => {
			if (options.signal?.aborted) {
				resolve({ exitCode: undefined, signal: undefined, stdout: '', stderr: '', timedOut: false, truncated: false, aborted: true });
				return;
			}
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			let outputBytes = 0;
			let timedOut = false;
			let truncated = false;
			let aborted = false;
			let settled = false;

			let child: ReturnType<typeof spawn>;
			try {
				child = spawn(file, [...args], {
					cwd: options.cwd,
					env: options.env,
					windowsHide: true,
					shell: false,
					stdio: [options.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
				});
			} catch (error) {
				resolve({ exitCode: undefined, signal: undefined, stdout: '', stderr: '', timedOut: false, truncated: false, aborted: false, spawnErrorCode: errorCode(error) ?? 'ESPAWN' });
				return;
			}

			const kill = () => {
				try {
					child.kill('SIGKILL');
				} catch {
					// Already exited.
				}
			};
			const timer = setTimeout(() => {
				timedOut = true;
				kill();
			}, options.timeoutMs);
			const onAbort = () => {
				aborted = true;
				kill();
			};
			options.signal?.addEventListener('abort', onAbort);

			const collect = (target: Buffer[]) => (chunk: Buffer) => {
				if (truncated) {
					return;
				}
				const remaining = options.maxOutputBytes - outputBytes;
				if (chunk.byteLength > remaining) {
					target.push(chunk.subarray(0, Math.max(0, remaining)));
					outputBytes = options.maxOutputBytes;
					truncated = true;
					kill();
					return;
				}
				outputBytes += chunk.byteLength;
				target.push(chunk);
			};
			child.stdout?.on('data', collect(stdout));
			child.stderr?.on('data', collect(stderr));

			const finish = (exitCode: number | null | undefined, signal: NodeJS.Signals | null | undefined, spawnErrorCode?: string) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				options.signal?.removeEventListener('abort', onAbort);
				resolve({
					exitCode: typeof exitCode === 'number' ? exitCode >>> 0 : undefined,
					signal: signal ?? undefined,
					stdout: Buffer.concat(stdout).toString('utf8'),
					stderr: Buffer.concat(stderr).toString('utf8'),
					timedOut,
					truncated,
					aborted,
					...(spawnErrorCode ? { spawnErrorCode } : {}),
				});
			};
			child.on('error', error => finish(undefined, undefined, errorCode(error) ?? 'ESPAWN'));
			child.on('close', (code, signal) => finish(code, signal));

			if (options.stdin !== undefined && child.stdin) {
				child.stdin.on('error', () => { /* the child may exit before reading */ });
				child.stdin.end(options.stdin, 'utf8');
			}
		});
	}
}

function errorCode(error: unknown): string | undefined {
	const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
	return typeof code === 'string' ? code : undefined;
}

// #region Windows registry (reg.exe)

/** One value from `reg query` output. */
export interface IRegistryValue {
	readonly key: string;
	readonly name: string;
	readonly type: string;
	readonly data: string;
}

const REG_VALUE_LINE = /^ {4}(?<name>.+?) {4}(?<type>REG_[A-Z_]+)(?: {4}(?<data>.*))?$/;

/** Parses `reg query` output into values, keyed by the full key path they belong to. Pure. */
export function parseRegQueryOutput(output: string): IRegistryValue[] {
	const values: IRegistryValue[] = [];
	let key: string | undefined;
	for (const rawLine of output.split(/\r?\n/)) {
		if (/^HKEY_[A-Z_]+/.test(rawLine)) {
			key = rawLine.trim();
			continue;
		}
		const match = REG_VALUE_LINE.exec(rawLine);
		if (match?.groups && key) {
			values.push({ key, name: match.groups.name.trim(), type: match.groups.type, data: match.groups.data ?? '' });
		}
	}
	return values;
}

/** Parses a `REG_DWORD`/`REG_QWORD` (`0x...`) value. Pure. */
export function parseRegistryInteger(value: IRegistryValue): number | undefined {
	if ((value.type === 'REG_DWORD' || value.type === 'REG_QWORD') && /^0x[0-9a-f]+$/i.test(value.data)) {
		const parsed = Number.parseInt(value.data.slice(2), 16);
		return Number.isSafeInteger(parsed) ? parsed : undefined;
	}
	if (value.type === 'REG_BINARY' && /^[0-9a-f]{2,16}$/i.test(value.data) && value.data.length % 2 === 0) {
		// Little-endian byte string.
		let result = 0;
		for (let i = value.data.length - 2; i >= 0; i -= 2) {
			result = result * 256 + Number.parseInt(value.data.slice(i, i + 2), 16);
		}
		return Number.isSafeInteger(result) ? result : undefined;
	}
	return undefined;
}

/** Path of `reg.exe`, never resolved through `PATH`. */
export function getRegExePath(env: Readonly<Record<string, string | undefined>>): string {
	return `${env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'}\\System32\\reg.exe`;
}

/** Runs `reg query <key> [/s] [/v <value>]` with a short timeout; returns the parsed values (empty on failure). */
export async function queryRegistry(runner: IProcessRunner, env: Readonly<Record<string, string | undefined>>, key: string, options: { readonly value?: string; readonly recursive?: boolean; readonly signal?: AbortSignal } = {}): Promise<IRegistryValue[]> {
	const args = ['query', key];
	if (options.recursive) {
		args.push('/s');
	}
	if (options.value) {
		args.push('/v', options.value);
	}
	const result = await runner.run(getRegExePath(env), args, { timeoutMs: 10_000, maxOutputBytes: 256 * 1024, signal: options.signal });
	return result.exitCode === 0 ? parseRegQueryOutput(result.stdout) : [];
}

// #endregion

// #region Process identity

/** A process identity: pid plus start time, so pid reuse is detected. */
export interface IProcessIdentity {
	readonly pid: number;
	/** Process start time in ms since the epoch (approximate, +/-2 s). */
	readonly processStartTime: number;
}

/** Tolerance when comparing start times recorded by different means. */
export const PROCESS_START_TIME_TOLERANCE_MS = 2_000;

// #endregion

// #region Long-lived processes (server supervisor)

/** Options for {@link ILongLivedProcessSpawner.spawn}. */
export interface ILongLivedProcessOptions {
	/** Working directory of the child (the model version directory). */
	readonly cwd: string;
	/** Full environment of the child. */
	readonly env: Readonly<Record<string, string>>;
	/** POSIX only: start the child in its own process group so the whole group can be signalled. Ignored on Windows. */
	readonly detached: boolean;
}

/** How a long-lived process ended. */
export interface ILongLivedProcessExit {
	/** Exit code, normalized to an unsigned 32-bit value on Windows. */
	readonly exitCode: number | undefined;
	readonly signal: string | undefined;
	/** Spawn failure (`ENOENT`, `EPERM`, `EACCES`, ...). */
	readonly spawnErrorCode?: string;
}

/** A running child process with piped stdout/stderr and ignored stdin. */
export interface ILongLivedProcess {
	/** `undefined` when the spawn failed. */
	readonly pid: number | undefined;
	/** Settles once, when the process has exited (or failed to spawn). Never rejects. */
	readonly exited: Promise<ILongLivedProcessExit>;
	onStdout(listener: (chunk: string) => void): IDisposable;
	onStderr(listener: (chunk: string) => void): IDisposable;
	/** Signals only the child itself (trees go through {@link IProcessControl.terminateTree}); `false` when the signal wasn't delivered and the process may still run. */
	kill(signal: 'SIGTERM' | 'SIGKILL'): boolean;
}

/** Spawns long-lived children. Injected so the supervisor can be tested without processes. */
export interface ILongLivedProcessSpawner {
	spawn(file: string, args: readonly string[], options: ILongLivedProcessOptions): ILongLivedProcess;
}

/** Node {@link ILongLivedProcessSpawner}: no shell, stdin ignored, `windowsHide` on Windows, own process group on macOS/Linux. */
export class NodeLongLivedProcessSpawner implements ILongLivedProcessSpawner {

	constructor(
		private readonly _platform: NodeJS.Platform = process.platform,
		private readonly _spawn: (file: string, args: readonly string[], options: SpawnOptions) => ChildProcess = (file, args, options) => spawn(file, [...args], options),
	) { }

	spawn(file: string, args: readonly string[], options: ILongLivedProcessOptions): ILongLivedProcess {
		let resolveExit!: (exit: ILongLivedProcessExit) => void;
		const exited = new Promise<ILongLivedProcessExit>(resolve => resolveExit = resolve);
		let settled = false;
		const settle = (exit: ILongLivedProcessExit) => {
			if (!settled) {
				settled = true;
				resolveExit(exit);
			}
		};
		let child: ChildProcess | undefined;
		try {
			child = this._spawn(file, args, {
				cwd: options.cwd,
				env: options.env,
				shell: false,
				stdio: ['ignore', 'pipe', 'pipe'],
				windowsHide: true,
				detached: this._platform !== 'win32' && options.detached,
			});
		} catch (error) {
			settle({ exitCode: undefined, signal: undefined, spawnErrorCode: errorCode(error) ?? 'ESPAWN' });
		}
		// Node also emits `error` when a signal cannot be delivered (`kill` failing with `EPERM`,
		// for example): only a spawn that never produced a process is an exit. After a
		// successful spawn the process is gone only once `exit` is emitted.
		const spawnedPid = child?.pid;
		child?.on('error', error => {
			if (spawnedPid === undefined) {
				settle({ exitCode: undefined, signal: undefined, spawnErrorCode: errorCode(error) ?? 'ESPAWN' });
			}
		});
		child?.on('exit', (code, signal) => settle({ exitCode: typeof code === 'number' ? code >>> 0 : undefined, signal: signal ?? undefined }));
		const listen = (stream: NodeJS.ReadableStream | null | undefined, listener: (chunk: string) => void): IDisposable => {
			if (!stream) {
				return { dispose: () => { } };
			}
			const onData = (chunk: Buffer | string) => listener(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
			stream.on('data', onData);
			return { dispose: () => stream.removeListener('data', onData) };
		};
		return {
			pid: child?.pid,
			exited,
			onStdout: listener => listen(child?.stdout, listener),
			onStderr: listener => listen(child?.stderr, listener),
			kill: signal => {
				try {
					return child?.kill(signal) ?? false;
				} catch {
					return false;
				}
			},
		};
	}
}

/** What the OS reports about a live process, for orphan verification. */
export interface IProcessInfo {
	/** Process start time in ms since the epoch; `undefined` when it could not be read. */
	readonly startTime: number | undefined;
	/** Absolute path of the process image; `undefined` when it could not be read. */
	readonly imagePath: string | undefined;
}

/** Inspects and terminates processes by pid. Never by image name. */
export interface IProcessControl {
	/** `undefined` when no process with `pid` exists. */
	inspect(pid: number): Promise<IProcessInfo | undefined>;
	/**
	 * Terminates `pid` and its children: `taskkill /T /F` on Windows; `SIGTERM` to the process group on macOS/Linux, then
	 * `SIGKILL` after {@link POSIX_SIGKILL_GRACE_MS}. `true` when it succeeded or the process is gone; callers still confirm the exit.
	 */
	terminateTree(pid: number): Promise<boolean>;
}

/** Grace between `SIGTERM` and `SIGKILL` for a process group. */
export const POSIX_SIGKILL_GRACE_MS = 5_000;

/** `taskkill` exit codes meaning the process tree is gone: success, and "process not found". */
const TASKKILL_GONE_EXIT_CODES: readonly number[] = [0, 128];

/** `kill(2)`-like signal sender; injectable for tests. */
export type ProcessSignalSender = (pid: number, signal: NodeJS.Signals | 0) => void;

function powerShellPath(env: Readonly<Record<string, string | undefined>>): string {
	return `${env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

/** The argv that terminates a process tree on Windows. Pure. */
export function getWindowsTerminateCommand(pid: number, env: Readonly<Record<string, string | undefined>>): { readonly file: string; readonly args: readonly string[] } {
	return { file: `${env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows'}\\System32\\taskkill.exe`, args: ['/T', '/F', '/PID', String(pid)] };
}

/** Parses `<unix ms>|<image path>` from the Windows CIM query. Pure. */
export function parseWindowsProcessInfo(output: string): IProcessInfo | undefined {
	const text = output.trim();
	if (!text) {
		return undefined;
	}
	const separator = text.indexOf('|');
	const start = Number.parseInt(separator >= 0 ? text.slice(0, separator) : text, 10);
	const image = separator >= 0 ? text.slice(separator + 1).trim() : '';
	return { startTime: Number.isFinite(start) ? start : undefined, imagePath: image || undefined };
}

/** Process start time from `/proc/<pid>/stat` field 22 (clock ticks since boot, `CLK_TCK` = 100) and `/proc/uptime`. Pure. */
export function parseLinuxProcessStartTime(stat: string, uptime: string, now: number): number | undefined {
	const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
	// Field 22 overall; fields 1 (pid) and 2 (comm) precede the slice, so it is index 19.
	const startTicks = Number.parseInt(fields[19], 10);
	const uptimeSeconds = Number.parseFloat(uptime.split(' ')[0]);
	return Number.isFinite(startTicks) && Number.isFinite(uptimeSeconds) ? Math.round(now - uptimeSeconds * 1000 + startTicks * 10) : undefined;
}

/**
 * Node {@link IProcessControl}. Start times come from
 * `Win32_Process.CreationDate` via PowerShell CIM (Windows),
 * `ps -o lstart= -p <pid>` (macOS) or `/proc/<pid>/stat` field 22 (Linux).
 */
export class NodeProcessControl implements IProcessControl {

	constructor(
		private readonly _runner: IProcessRunner = new NodeProcessRunner(),
		private readonly _platform: NodeJS.Platform = process.platform,
		private readonly _env: Readonly<Record<string, string | undefined>> = process.env,
		private readonly _signal: ProcessSignalSender = (pid, signal) => { process.kill(pid, signal); },
		private readonly _delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
		private readonly _now: () => number = Date.now,
	) { }

	async inspect(pid: number): Promise<IProcessInfo | undefined> {
		if (!this._exists(pid)) {
			return undefined;
		}
		try {
			if (this._platform === 'win32') {
				const result = await this._runner.run(powerShellPath(this._env), [
					'-NoProfile', '-NonInteractive', '-Command',
					`$p = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { [Console]::Out.Write([DateTimeOffset]::new($p.CreationDate).ToUnixTimeMilliseconds().ToString() + '|' + $p.ExecutablePath) }`,
				], { timeoutMs: 15_000, maxOutputBytes: 8192 });
				if (result.exitCode !== 0) {
					return { startTime: undefined, imagePath: undefined };
				}
				return parseWindowsProcessInfo(result.stdout) ?? (this._exists(pid) ? { startTime: undefined, imagePath: undefined } : undefined);
			}
			if (this._platform === 'darwin') {
				const start = await this._runner.run('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { timeoutMs: 5_000, maxOutputBytes: 4096 });
				const image = await this._runner.run('/bin/ps', ['-o', 'comm=', '-p', String(pid)], { timeoutMs: 5_000, maxOutputBytes: 8192 });
				const startTime = Date.parse(start.stdout.trim());
				const imagePath = image.stdout.trim();
				return { startTime: start.exitCode === 0 && Number.isFinite(startTime) ? startTime : undefined, imagePath: image.exitCode === 0 && imagePath.startsWith('/') ? imagePath : undefined };
			}
			if (this._platform === 'linux') {
				const stat = await fs.promises.readFile(`/proc/${pid}/stat`, 'utf8');
				const uptime = await fs.promises.readFile('/proc/uptime', 'utf8');
				const imagePath = await fs.promises.readlink(`/proc/${pid}/exe`).catch(() => undefined);
				return { startTime: parseLinuxProcessStartTime(stat, uptime, this._now()), imagePath };
			}
		} catch {
			// Unreadable: the caller treats unknown values as unverifiable.
		}
		return this._exists(pid) ? { startTime: undefined, imagePath: undefined } : undefined;
	}

	async terminateTree(pid: number): Promise<boolean> {
		if (this._platform === 'win32') {
			const command = getWindowsTerminateCommand(pid, this._env);
			const result = await this._runner.run(command.file, command.args, { timeoutMs: 15_000, maxOutputBytes: 8192 });
			return (result.exitCode !== undefined && TASKKILL_GONE_EXIT_CODES.includes(result.exitCode)) || !this._exists(pid);
		}
		// The server leads its own process group: every wait, the escalation and the final
		// answer probe the group, so a surviving descendant keeps it alive.
		this._signalTree(pid, 'SIGTERM');
		const deadline = this._now() + POSIX_SIGKILL_GRACE_MS;
		while (this._now() < deadline && this._treeAlive(pid)) {
			await this._delay(100);
		}
		if (this._treeAlive(pid)) {
			this._signalTree(pid, 'SIGKILL');
			const killDeadline = this._now() + 1_000;
			while (this._now() < killDeadline && this._treeAlive(pid)) {
				await this._delay(50);
			}
		}
		return !this._treeAlive(pid);
	}

	/** Whether `pid`'s process group (or `pid` itself) still has a live process. */
	private _treeAlive(pid: number): boolean {
		return this._exists(-pid) || this._exists(pid);
	}

	/** Signals `pid`'s process group, or `pid` itself when it leads no group. */
	private _signalTree(pid: number, signal: NodeJS.Signals): void {
		if (this._exists(-pid)) {
			this._send(-pid, signal);
		} else {
			this._send(pid, signal);
		}
	}

	private _exists(pid: number): boolean {
		try {
			this._signal(pid, 0);
			return true;
		} catch (error) {
			return errorCode(error) === 'EPERM';
		}
	}

	private _send(target: number, signal: NodeJS.Signals): void {
		try {
			this._signal(target, signal);
		} catch {
			// Already gone.
		}
	}
}

// #endregion
