/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Stats, promises } from 'fs';
import { getCaseInsensitive } from '../common/objects.js';
import * as path from '../common/path.js';
import * as Platform from '../common/platform.js';
import * as processCommon from '../common/process.js';
import { CommandOptions, ForkOptions, Source, SuccessData, TerminateResponse, TerminateResponseCode } from '../common/processes.js';
import * as Types from '../common/types.js';
import * as pfs from './pfs.js';
import { FileAccess } from '../common/network.js';
import Stream from 'stream';
import { inspect } from 'util';
import { DeferredPromise, raceTimeout, timeout } from '../common/async.js';
import { getErrorCode } from '../common/errors.js';
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
export async function killTree(pid: number, forceful = false, timeoutMs?: number) {
	let child: cp.ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
	if (Platform.isWindows) {
		const windir = process.env['WINDIR'] || 'C:\\Windows';
		const taskKill = path.join(windir, 'System32', 'taskkill.exe');

		const args = ['/T'];
		if (forceful) {
			args.push('/F');
		}
		args.push('/PID', String(pid));
		child = cp.spawn(taskKill, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
	} else {
		const killScript = FileAccess.asFileUri('vs/base/node/terminateProcess.sh').fsPath;
		child = cp.spawn('/bin/sh', [killScript, String(pid), forceful ? '9' : '15'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs });
	}

	return new Promise<void>((resolve, reject) => {
		const stdout: Buffer[] = [];
		child.stdout.on('data', (data) => stdout.push(data));
		child.stderr.on('data', (data) => stdout.push(data));
		child.on('error', reject);
		child.on('close', (code, signal) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Failed to kill process tree ${pid} (code=${code}, signal=${signal}): ${Buffer.concat(stdout).toString()}`));
			}
		});
	});
}

function isProcessRunning(pid: number, probeProcess: (pid: number) => void): boolean {
	try {
		probeProcess(pid);
		return true;
	} catch (error) {
		const code = getErrorCode(error);
		if (code === 'ESRCH') {
			return false;
		}
		if (code === 'EPERM') {
			return true;
		}
		throw error;
	}
}

/** Sends EOF, waits for process exit, and reaps owned Windows descendants before returning. */
export async function shutdownProcessTree(
	child: cp.ChildProcess,
	graceTimeMs: number,
	killTimeMs = 2_000,
	probeProcess: (pid: number) => void = pid => { process.kill(pid, 0); },
): Promise<void> {
	if ((child.exitCode !== null || child.signalCode !== null) && child.stdout?.closed !== false && child.stderr?.closed !== false) {
		return;
	}

	const pid = child.pid;
	const isRunning = (pid: number) => isProcessRunning(pid, probeProcess);
	const descendants: number[] = [];
	const errors: unknown[] = [];
	const stdinErrors: unknown[] = [];
	let closed = false;
	const processClosed = new DeferredPromise<void>();
	const whenClosed = processClosed.p;
	const onClose = () => {
		closed = true;
		void processClosed.complete();
	};
	child.once('close', onClose);
	const onError = (error: Error) => errors.push(error);
	const onStdinError = (error: Error) => stdinErrors.push(error);
	child.on('error', onError);
	child.stdin?.on('error', onStdinError);
	const graceDeadline = Date.now() + graceTimeMs;

	try {
		if (pid !== undefined && graceTimeMs > 0) {
			if (Platform.isWindows) {
				try {
					const snapshot = await raceTimeout((async () => {
						const { getProcessList } = await import('@vscode/windows-process-tree');
						return new Promise<number[]>((resolve, reject) => getProcessList(pid, processes => {
							if (!processes && child.exitCode === null && child.signalCode === null) {
								reject(new Error(`Could not record descendants of running process ${pid}`));
								return;
							}
							resolve(processes ? processes.filter(process => process.pid !== pid).map(process => process.pid) : []);
						}));
					})(), graceTimeMs);
					if (snapshot === undefined) {
						throw new Error(`Timed out recording descendants of process ${pid}`);
					}
					descendants.push(...snapshot);
				} catch (error) {
					errors.push(error);
				}
			}
			try {
				child.stdin?.end();
			} catch (error) {
				stdinErrors.push(error);
			}
			await raceTimeout(whenClosed, Math.max(0, graceDeadline - Date.now()));
		}

		const killDeadline = Date.now() + killTimeMs;
		const killOwned = async (ownedPid: number): Promise<void> => {
			if (!isRunning(ownedPid)) {
				return;
			}
			try {
				await killTree(ownedPid, true, Math.max(1, killDeadline - Date.now()));
			} catch (error) {
				// A process can exit between the liveness check and taskkill.
				if (isRunning(ownedPid)) {
					errors.push(error);
				}
			}
		};
		if (!closed && pid !== undefined) {
			await killOwned(pid);
		}
		await Promise.all(descendants.map(killOwned));
		if (!closed && !await raceTimeout(whenClosed.then(() => true), Math.max(0, killDeadline - Date.now()))) {
			errors.push(new Error(`Process ${pid} did not close within ${killTimeMs}ms of forced shutdown`));
		}
		let remaining = descendants.filter(isRunning);
		while (remaining.length > 0 && Date.now() < killDeadline) {
			await timeout(Math.min(20, killDeadline - Date.now()));
			remaining = remaining.filter(isRunning);
		}
		if (remaining.length > 0) {
			errors.push(new Error(`Owned descendants still running: ${remaining.join(', ')}`));
		}
		// EOF can race process exit; a closed pipe is benign only once the process has closed.
		errors.push(...stdinErrors.filter(error => {
			const code = getErrorCode(error);
			return !closed || (code !== 'EPIPE' && code !== 'ERR_STREAM_DESTROYED');
		}));
		if (errors.length > 0) {
			throw new AggregateError(errors, `Failed to shut down process tree (pid=${pid}, code=${child.exitCode}, signal=${child.signalCode}, descendants=${descendants.join(', ')}):\n${errors.map(error => inspect(error, { depth: 5 })).join('\n')}`);
		}
	} finally {
		child.removeListener('close', onClose);
		child.removeListener('error', onError);
		child.stdin?.removeListener('error', onStdinError);
	}
}
