/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import type { IDisposable } from '../../../../../../base/common/lifecycle.js';
import * as path from '../../../../../../base/common/path.js';

/*
 * An exclusive lock owned by the operating system, like VS Code's single
 * instance check (`claimInstance` in `code/electron-main/main.ts`): the holder
 * listens on a static IPC handle, so the lock is released when the holder's
 * process dies. Windows uses a named pipe and Linux an abstract socket: both
 * vanish with their holder. Elsewhere (macOS) the handle is a socket file that
 * a holder which died leaves behind: such a stale lock is reported and only
 * removed by an explicit user action ({@link clearStaleProcessLock}).
 */

/** A held lock; disposing it releases the lock. */
export interface IProcessLock extends IDisposable { }

/** Test seams; each defaults to Node. */
export interface IProcessLockOptions {
	/** Whose handle rules apply. */
	readonly platform?: NodeJS.Platform;
	/** Listens on `handle`: the listening server, or `undefined` while the handle is in use. */
	readonly listen?: (handle: string) => Promise<IDisposable | undefined>;
	/** Connects to `handle`: `undefined` when something answered, else why connecting failed (`ECONNREFUSED`, ...). */
	readonly probe?: (handle: string) => Promise<string | undefined>;
	readonly unlink?: (file: string) => Promise<void>;
}

const PROCESS_LOCK_VERSION = '1';
/** Keeps `<scope>/<version>-<type>.sock` within the Unix socket path limit (103 bytes on macOS). */
const MAX_SCOPE_DIR_LENGTH = 80;
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Takes the lock `type` of `scopeDir`, or returns `'busy'` while a live
 * process (this one included) holds it, or `'stale'` for a socket file that
 * nothing listens on: its holder died (macOS). Rejects when the handle cannot
 * be listened on for another reason.
 */
export async function acquireProcessLock(scopeDir: string, type: string, options: IProcessLockOptions = {}): Promise<IProcessLock | 'busy' | 'stale'> {
	const platform = options.platform ?? process.platform;
	const handle = await lockHandle(scopeDir, type, platform);
	const lock = await (options.listen ?? listen)(handle);
	if (lock) {
		return lock;
	}
	return leavesSocketFile(platform) && isRefused(await (options.probe ?? probe)(handle)) ? 'stale' : 'busy';
}

/**
 * Removes the socket file of a `'stale'` lock, only once a fresh probe finds
 * nothing answering on it; `false` when something answers (a live holder) or
 * the file could not be removed. Only for an explicit user action: two
 * instances clearing at the same moment could still remove each other's new
 * socket (accepted).
 */
export async function clearStaleProcessLock(scopeDir: string, type: string, options: IProcessLockOptions = {}): Promise<boolean> {
	const platform = options.platform ?? process.platform;
	if (!leavesSocketFile(platform)) {
		return true;
	}
	const handle = await lockHandle(scopeDir, type, platform);
	if (!isRefused(await (options.probe ?? probe)(handle))) {
		return false;
	}
	try {
		await (options.unlink ?? (file => fs.promises.unlink(file)))(handle);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'ENOENT';
	}
}

/**
 * The lock's handle, derived from the canonical identity of `scopeDir` so
 * every spelling of one directory shares it: its real path (created first),
 * lowercased where file systems are case-insensitive by default (on a rare
 * case-sensitive volume that can only cause a false `busy`).
 */
async function lockHandle(scopeDir: string, type: string, platform: NodeJS.Platform): Promise<string> {
	let dir: string;
	try {
		await fs.promises.mkdir(scopeDir, { recursive: true });
		dir = await fs.promises.realpath(scopeDir);
	} catch {
		dir = path.resolve(scopeDir);
	}
	const identity = platform === 'win32' || platform === 'darwin' ? dir.toLowerCase() : dir;
	const name = `vscode-${createHash('sha256').update(identity).digest('hex').slice(0, 16)}-${PROCESS_LOCK_VERSION}-${type}`;
	if (platform === 'win32') {
		return `\\\\.\\pipe\\${name}-sock`;
	}
	if (platform === 'linux') {
		// The abstract namespace: no file is created, and the kernel frees the name with its holder.
		return `\0${name}`;
	}
	return dir.length <= MAX_SCOPE_DIR_LENGTH ? path.join(dir, `${PROCESS_LOCK_VERSION}-${type}.sock`) : path.join(os.tmpdir(), `${name}.sock`);
}

/** Whether the handle is a socket file that outlives a holder which died (not a named pipe or an abstract socket). */
function leavesSocketFile(platform: NodeJS.Platform): boolean {
	return platform !== 'win32' && platform !== 'linux';
}

/** Nothing listens on the socket file (or it was removed meanwhile). */
function isRefused(code: string | undefined): boolean {
	return code === 'ECONNREFUSED' || code === 'ENOENT';
}

/** Listens on `handle`; `undefined` when it is in use. */
function listen(handle: string): Promise<IDisposable | undefined> {
	const server = net.createServer(socket => {
		socket.on('error', () => { /* the prober went away */ });
		socket.end();
	});
	server.unref();
	server.on('error', () => { /* accept failures never end the lock */ });
	return new Promise<IDisposable | undefined>((resolve, reject) => {
		server.once('error', (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE' ? resolve(undefined) : reject(error));
		server.listen(handle, () => resolve({ dispose: () => server.close() }));
	});
}

/** Connects to `handle`: `undefined` once something answers, else why connecting failed. */
function probe(handle: string): Promise<string | undefined> {
	return new Promise<string | undefined>(resolve => {
		const socket = net.connect(handle);
		const done = (code: string | undefined) => {
			clearTimeout(timer);
			socket.destroy();
			resolve(code);
		};
		const timer = setTimeout(() => done('ETIMEDOUT'), PROBE_TIMEOUT_MS);
		socket.on('connect', () => done(undefined));
		socket.on('error', (error: NodeJS.ErrnoException) => done(error.code ?? 'ERROR'));
	});
}

