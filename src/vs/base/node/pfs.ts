/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extfs from 'vs/base/node/extfs';
import { join, dirname } from 'vs/base/common/path';
import { nfcall, Queue } from 'vs/base/common/async';
import * as fs from 'fs';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';
import { endsWith } from 'vs/base/common/strings';
import { promisify } from 'util';
import { CancellationToken } from 'vs/base/common/cancellation';

export function readdir(path: string): Promise<string[]> {
	return nfcall(extfs.readdir, path);
}

export function exists(path: string): Promise<boolean> {
	return new Promise(c => fs.exists(path, c));
}

export function chmod(path: string, mode: number): Promise<boolean> {
	return nfcall(fs.chmod, path, mode);
}

export function rimraf(path: string): Promise<void> {
	return lstat(path).then(stat => {
		if (stat.isDirectory() && !stat.isSymbolicLink()) {
			return readdir(path)
				.then(children => Promise.all(children.map(child => rimraf(join(path, child)))))
				.then(() => rmdir(path));
		} else {
			return unlink(path);
		}
	}, (err: NodeJS.ErrnoException) => {
		if (err.code === 'ENOENT') {
			return undefined;
		}

		return Promise.reject(err);
	});
}

export function realpath(path: string): Promise<string> {
	return nfcall(extfs.realpath, path);
}

export function stat(path: string): Promise<fs.Stats> {
	return nfcall(fs.stat, path);
}

export function statLink(path: string): Promise<{ stat: fs.Stats, isSymbolicLink: boolean }> {
	return nfcall(extfs.statLink, path);
}

export function lstat(path: string): Promise<fs.Stats> {
	return nfcall(fs.lstat, path);
}

export function rename(oldPath: string, newPath: string): Promise<void> {
	return nfcall(fs.rename, oldPath, newPath);
}

export function renameIgnoreError(oldPath: string, newPath: string): Promise<void> {
	return new Promise(resolve => {
		fs.rename(oldPath, newPath, () => resolve());
	});
}

export function rmdir(path: string): Promise<void> {
	return nfcall(fs.rmdir, path);
}

export function unlink(path: string): Promise<void> {
	return nfcall(fs.unlink, path);
}

export function symlink(target: string, path: string, type?: string): Promise<void> {
	return nfcall<void>(fs.symlink, target, path, type);
}

export function readlink(path: string): Promise<string> {
	return nfcall<string>(fs.readlink, path);
}

export function truncate(path: string, len: number): Promise<void> {
	return nfcall(fs.truncate, path, len);
}

export function readFile(path: string): Promise<Buffer>;
export function readFile(path: string, encoding: string): Promise<string>;
export function readFile(path: string, encoding?: string): Promise<Buffer | string> {
	return nfcall(fs.readFile, path, encoding);
}

// According to node.js docs (https://nodejs.org/docs/v6.5.0/api/fs.html#fs_fs_writefile_file_data_options_callback)
// it is not safe to call writeFile() on the same path multiple times without waiting for the callback to return.
// Therefor we use a Queue on the path that is given to us to sequentialize calls to the same path properly.
const writeFilePathQueue: { [path: string]: Queue<void> } = Object.create(null);

export function writeFile(path: string, data: string, options?: extfs.IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: Buffer, options?: extfs.IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: Uint8Array, options?: extfs.IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: NodeJS.ReadableStream, options?: extfs.IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: string | Buffer | NodeJS.ReadableStream | Uint8Array, options?: extfs.IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: string | Buffer | NodeJS.ReadableStream | Uint8Array, options?: extfs.IWriteFileOptions): Promise<void> {
	const queueKey = toQueueKey(path);

	return ensureWriteFileQueue(queueKey).queue(() => nfcall(extfs.writeFileAndFlush, path, data, options));
}

function toQueueKey(path: string): string {
	let queueKey = path;
	if (platform.isWindows || platform.isMacintosh) {
		queueKey = queueKey.toLowerCase(); // accomodate for case insensitive file systems
	}

	return queueKey;
}

function ensureWriteFileQueue(queueKey: string): Queue<void> {
	let writeFileQueue = writeFilePathQueue[queueKey];
	if (!writeFileQueue) {
		writeFileQueue = new Queue<void>();
		writeFilePathQueue[queueKey] = writeFileQueue;

		const onFinish = Event.once(writeFileQueue.onFinished);
		onFinish(() => {
			delete writeFilePathQueue[queueKey];
			writeFileQueue.dispose();
		});
	}

	return writeFileQueue;
}

/**
* Read a dir and return only subfolders
*/
export function readDirsInDir(dirPath: string): Promise<string[]> {
	return readdir(dirPath).then(children => {
		return Promise.all(children.map(c => dirExists(join(dirPath, c)))).then(exists => {
			return children.filter((_, i) => exists[i]);
		});
	});
}

/**
* `path` exists and is a directory
*/
export function dirExists(path: string): Promise<boolean> {
	return stat(path).then(stat => stat.isDirectory(), () => false);
}

/**
* `path` exists and is a file.
*/
export function fileExists(path: string): Promise<boolean> {
	return stat(path).then(stat => stat.isFile(), () => false);
}

/**
 * Deletes a path from disk.
 */
let _tmpDir: string | null = null;
function getTmpDir(): string {
	if (!_tmpDir) {
		_tmpDir = os.tmpdir();
	}
	return _tmpDir;
}
export function del(path: string, tmp = getTmpDir()): Promise<void> {
	return nfcall(extfs.del, path, tmp);
}

export function whenDeleted(path: string): Promise<void> {

	// Complete when wait marker file is deleted
	return new Promise<void>(resolve => {
		let running = false;
		const interval = setInterval(() => {
			if (!running) {
				running = true;
				fs.exists(path, exists => {
					running = false;

					if (!exists) {
						clearInterval(interval);
						resolve(undefined);
					}
				});
			}
		}, 1000);
	});
}

export async function move(source: string, target: string): Promise<void> {
	if (source === target) {
		return Promise.resolve();
	}

	async function updateMtime(path: string): Promise<void> {
		const stat = await lstat(path);
		if (stat.isDirectory() || stat.isSymbolicLink()) {
			return Promise.resolve(); // only for files
		}

		const fd = await promisify(fs.open)(path, 'a');
		try {
			await promisify(fs.futimes)(fd, stat.atime, new Date());
		} catch (error) {
			//ignore
		}

		return promisify(fs.close)(fd);
	}

	try {
		await rename(source, target);
		await updateMtime(target);
	} catch (error) {

		// In two cases we fallback to classic copy and delete:
		//
		// 1.) The EXDEV error indicates that source and target are on different devices
		// In this case, fallback to using a copy() operation as there is no way to
		// rename() between different devices.
		//
		// 2.) The user tries to rename a file/folder that ends with a dot. This is not
		// really possible to move then, at least on UNC devices.
		if (source.toLowerCase() !== target.toLowerCase() && error.code === 'EXDEV' || endsWith(source, '.')) {
			await copy(source, target);
			await del(source);
			await updateMtime(target);
		} else {
			throw error;
		}
	}
}

export async function copy(source: string, target: string, copiedSourcesIn?: { [path: string]: boolean }): Promise<void> {
	const copiedSources = copiedSourcesIn ? copiedSourcesIn : Object.create(null);

	const fileStat = await stat(source);
	if (!fileStat.isDirectory()) {
		return doCopyFile(source, target, fileStat.mode & 511);
	}

	if (copiedSources[source]) {
		return Promise.resolve(); // escape when there are cycles (can happen with symlinks)
	}

	copiedSources[source] = true; // remember as copied

	// Create folder
	await mkdirp(target, fileStat.mode & 511);

	// Copy each file recursively
	const files = await readdir(source);
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		await copy(join(source, file), join(target, file), copiedSources);
	}
}

async function doCopyFile(source: string, target: string, mode: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const reader = fs.createReadStream(source);
		const writer = fs.createWriteStream(target, { mode });

		let finished = false;
		const finish = (error?: Error) => {
			if (!finished) {
				finished = true;

				// in error cases, pass to callback
				if (error) {
					return reject(error);
				}

				// we need to explicitly chmod because of https://github.com/nodejs/node/issues/1104
				fs.chmod(target, mode, error => error ? reject(error) : resolve());
			}
		};

		// handle errors properly
		reader.once('error', error => finish(error));
		writer.once('error', error => finish(error));

		// we are done (underlying fd has been closed)
		writer.once('close', () => finish());

		// start piping
		reader.pipe(writer);
	});
}

export async function mkdirp(path: string, mode?: number, token?: CancellationToken): Promise<void> {
	const mkdir = async () => {
		try {
			await promisify(fs.mkdir)(path, mode);
		} catch (error) {

			// ENOENT: a parent folder does not exist yet
			if (error.code === 'ENOENT') {
				return Promise.reject(error);
			}

			// Any other error: check if folder exists and
			// return normally in that case if its a folder
			try {
				const fileStat = await stat(path);
				if (!fileStat.isDirectory()) {
					return Promise.reject(new Error(`'${path}' exists and is not a directory.`));
				}
			} catch (statError) {
				throw error; // rethrow original error
			}
		}
	};

	// stop at root
	if (path === dirname(path)) {
		return Promise.resolve();
	}

	try {
		await mkdir();
	} catch (error) {

		// Respect cancellation
		if (token && token.isCancellationRequested) {
			return Promise.resolve();
		}

		// ENOENT: a parent folder does not exist yet, continue
		// to create the parent folder and then try again.
		if (error.code === 'ENOENT') {
			return mkdirp(dirname(path), mode).then(mkdir);
		}

		// Any other error
		return Promise.reject(error);
	}
}