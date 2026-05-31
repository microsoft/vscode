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
