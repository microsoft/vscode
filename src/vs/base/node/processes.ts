/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { readdirSync, readFileSync, Stats, promises } from 'fs';
import { getCaseInsensitive } from '../common/objects.js';
import * as path from '../common/path.js';
import * as Platform from '../common/platform.js';
import * as processCommon from '../common/process.js';
import { CommandOptions, ForkOptions, Source, SuccessData, TerminateResponse, TerminateResponseCode } from '../common/processes.js';
import * as Types from '../common/types.js';
import * as pfs from './pfs.js';
import { FileAccess } from '../common/network.js';
import Stream from 'stream';
export { Source, TerminateResponseCode, type CommandOptions, type ForkOptions, type SuccessData, type TerminateResponse };

export type ValueCallback<T> = (value: T | Promise<T>) => void;
export type ErrorCallback = (error?: any) => void;
export type ProgressCallback<T> = (progress: T) => void;


export function getWindowsShell(env = processCommon.env): string {
	return env['comspec'] || 'cmd.exe';
}

export interface IQueuedSender {
	send: (msg: any) => void;
}

// Wrapper around process.send() that will queue any messages if the internal node.js
// queue is filled with messages and only continue sending messages when the internal
// queue is free again to consume messages.
// On Windows we always wait for the send() method to return before sending the next message
// to workaround https://github.com/nodejs/node/issues/7657 (IPC can freeze process)
export function createQueuedSender(childProcess: cp.ChildProcess): IQueuedSender {
	let msgQueue: string[] = [];
	let useQueue = false;

	const send = function (msg: any): void {
		if (useQueue) {
			msgQueue.push(msg); // add to the queue if the process cannot handle more messages
			return;
		}

		const result = childProcess.send(msg, (error: Error | null) => {
			if (error) {
				console.error(error); // unlikely to happen, best we can do is log this error
			}

			useQueue = false; // we are good again to send directly without queue

			// now send all the messages that we have in our queue and did not send yet
			if (msgQueue.length > 0) {
				const msgQueueCopy = msgQueue.slice(0);
				msgQueue = [];
				msgQueueCopy.forEach(entry => send(entry));
			}
		});

		if (!result || Platform.isWindows /* workaround https://github.com/nodejs/node/issues/7657 */) {
			useQueue = true;
		}
	};

	return { send };
}

async function fileExistsDefault(path: string): Promise<boolean> {
	if (await pfs.Promises.exists(path)) {
		let statValue: Stats | undefined;
		try {
			statValue = await promises.stat(path);
		} catch (e) {
			if (e.message.startsWith('EACCES')) {
				// it might be symlink
				statValue = await promises.lstat(path);
			}
		}
		return statValue ? !statValue.isDirectory() : false;
	}
	return false;
}

export async function findExecutable(command: string, cwd?: string, paths?: string[], env: Platform.IProcessEnvironment = processCommon.env, fileExists: (path: string) => Promise<boolean> = fileExistsDefault): Promise<string | undefined> {
	// If we have an absolute path then we take it.
	if (path.isAbsolute(command)) {
		return await fileExists(command) ? command : undefined;
	}
	if (cwd === undefined) {
		cwd = processCommon.cwd();
	}
	const dir = path.dirname(command);
	if (dir !== '.') {
		// We have a directory and the directory is relative (see above). Make the path absolute
		// to the current working directory.
		const fullPath = path.join(cwd, command);
		return await fileExists(fullPath) ? fullPath : undefined;
	}
	const envPath = getCaseInsensitive(env, 'PATH');
	if (paths === undefined && Types.isString(envPath)) {
		paths = envPath.split(path.delimiter);
	}
	// No PATH environment. Make path absolute to the cwd.
	if (paths === undefined || paths.length === 0) {
		const fullPath = path.join(cwd, command);
		return await fileExists(fullPath) ? fullPath : undefined;
	}

	// We have a simple file name. We get the path variable from the env
	// and try to find the executable on the path.
	for (const pathEntry of paths) {
		// The path entry is absolute.
		let fullPath: string;
		if (path.isAbsolute(pathEntry)) {
			fullPath = path.join(pathEntry, command);
		} else {
			fullPath = path.join(cwd, pathEntry, command);
		}
		if (Platform.isWindows) {
			const pathExt = getCaseInsensitive(env, 'PATHEXT') as string || '.COM;.EXE;.BAT;.CMD';
			const pathExtsFound = pathExt.split(';').map(async ext => {
				const withExtension = fullPath + ext;
				return await fileExists(withExtension) ? withExtension : undefined;
			});
			for (const foundPromise of pathExtsFound) {
				const found = await foundPromise;
				if (found) {
					return found;
				}
			}
		}

		if (await fileExists(fullPath)) {
			return fullPath;
		}
	}
	const fullPath = path.join(cwd, command);
	return await fileExists(fullPath) ? fullPath : undefined;
}

/**
 * Kills a process and all its children.
 * @param pid the process id to kill
 * @param forceful whether to forcefully kill the process (default: false). Note
 * that on Windows, terminal processes can _only_ be killed forcefully and this
 * will throw when not forceful.
 */
export async function killTree(pid: number, forceful = false) {
	let child: cp.ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
	if (Platform.isWindows) {
		const windir = process.env['WINDIR'] || 'C:\\Windows';
		const taskKill = path.join(windir, 'System32', 'taskkill.exe');

		const args = ['/T'];
		if (forceful) {
			args.push('/F');
		}
		args.push('/PID', String(pid));
		child = cp.spawn(taskKill, args, { stdio: ['ignore', 'pipe', 'pipe'] });
	} else {
		const killScript = FileAccess.asFileUri('vs/base/node/terminateProcess.sh').fsPath;
		child = cp.spawn('/bin/sh', [killScript, String(pid), forceful ? '9' : '15'], { stdio: ['ignore', 'pipe', 'pipe'] });
	}

	return new Promise<void>((resolve, reject) => {
		const stdout: Buffer[] = [];
		child.stdout.on('data', (data) => stdout.push(data));
		child.stderr.on('data', (data) => stdout.push(data));
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`taskkill exited with code ${code}: ${Buffer.concat(stdout).toString()}`));
			}
		});
	});
}

/** A process's parent and one-letter scheduler state, as reported by Linux `/proc/<pid>/status`. */
export interface ILinuxProcessInfo {
	readonly pid: number;
	readonly ppid: number;
	/** For example `R` (running), `S` (sleeping), `D` (uninterruptible), `T` (stopped), or `Z` (zombie). */
	readonly state: string;
}

/** The process-table operations {@link freezeAndKillTree} uses, replaceable in tests. */
export interface ILinuxProcessTable {
	list(): readonly ILinuxProcessInfo[];
	/** Returns `undefined` when the process no longer exists. */
	state(pid: number): string | undefined;
	/** Throws when the process no longer exists. */
	signal(pid: number, signal: 'SIGSTOP' | 'SIGKILL'): void;
	now(): number;
	sleep(ms: number): void;
}

export function parseLinuxProcessStatus(pid: number, status: string): ILinuxProcessInfo | undefined {
	const state = /^State:\s*(?<state>\S)/m.exec(status)?.groups?.state;
	const ppid = /^PPid:\s*(?<ppid>\d+)/m.exec(status)?.groups?.ppid;
	return state && ppid ? { pid, ppid: Number(ppid), state } : undefined;
}

function readLinuxProcessInfo(pid: number): ILinuxProcessInfo | undefined {
	try {
		// eslint-disable-next-line local/code-no-sync-fs -- Reads kernel-generated /proc state for freezeAndKillTree, which must finish before returning; see its documentation.
		return parseLinuxProcessStatus(pid, readFileSync(`/proc/${pid}/status`, 'utf8'));
	} catch {
		return undefined;
	}
}

const linuxProcessTable: ILinuxProcessTable = {
	list: () => {
		const processes: ILinuxProcessInfo[] = [];
		// eslint-disable-next-line local/code-no-sync-fs -- Lists kernel-generated /proc entries for freezeAndKillTree, which must finish before returning; see its documentation.
		for (const entry of readdirSync('/proc')) {
			const info = /^\d+$/.test(entry) ? readLinuxProcessInfo(Number(entry)) : undefined;
			if (info) {
				processes.push(info);
			}
		}
		return processes;
	},
	state: pid => readLinuxProcessInfo(pid)?.state,
	signal: (pid, signal) => { process.kill(pid, signal); },
	now: () => Date.now(),
	sleep: ms => {
		try {
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
		} catch {
			// Blocking waits are unavailable here; the caller polls until its deadline instead.
		}
	},
};

/** States in which a process can no longer run, and so can no longer create children. */
function isLinuxProcessQuiescent(state: string | undefined): boolean {
	return state === undefined || state === 'T' || state === 't' || state === 'Z' || state === 'X';
}

/**
 * Forcefully kills a Linux process and all of its descendants, without letting
 * any descendant escape by being orphaned during the kill.
 *
 * {@link killTree} signals a snapshot of the tree, asynchronously and on every
 * platform, and is best-effort: a process can create a child after the snapshot,
 * and a killed parent can leave behind a child that does not die with it. This
 * function instead freezes the tree first. Each process is stopped, and observed
 * to have stopped, before its children are listed, so none can create a child
 * unseen; then every stopped process is killed, deepest first. Use it when a
 * descendant would otherwise outlive its parent, such as a sandbox child blocked
 * waiting for a parent that was killed.
 *
 * It runs synchronously, so nothing else in this process can interleave, and an
 * exiting process cannot abandon a half-frozen tree. The tree is small in
 * practice; each level costs one scan of `/proc`. A process that does not stop
 * within `stopTimeoutMs` (for example, one in uninterruptible sleep) is still
 * killed. Throws when `/proc` cannot be read, after killing what it had stopped.
 */
export function freezeAndKillTree(pid: number, stopTimeoutMs = 100, table = linuxProcessTable): void {
	const deadline = table.now() + stopTimeoutMs;
	const stopped: number[] = [];
	const seen = new Set<number>([pid]);
	try {
		let level = [pid];
		while (level.length > 0) {
			const parents = new Set<number>();
			for (const candidate of level) {
				try {
					table.signal(candidate, 'SIGSTOP');
				} catch {
					// Exited; any children were reparented outside the tree.
					continue;
				}
				stopped.push(candidate);
				parents.add(candidate);
			}
			// SIGSTOP is delivered asynchronously: a process inside clone() completes it first.
			for (const parent of parents) {
				while (!isLinuxProcessQuiescent(table.state(parent)) && table.now() < deadline) {
					table.sleep(1);
				}
			}
			level = [];
			for (const child of table.list()) {
				if (parents.has(child.ppid) && !seen.has(child.pid)) {
					seen.add(child.pid);
					level.push(child.pid);
				}
			}
		}
	} finally {
		for (let index = stopped.length - 1; index >= 0; index--) {
			try {
				table.signal(stopped[index], 'SIGKILL');
			} catch {
				// Already exited.
			}
		}
	}
}
