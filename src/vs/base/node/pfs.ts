/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join, dirname, basename } from 'vs/base/common/path';
import { Queue } from 'vs/base/common/async';
import * as fs from 'fs';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import { Event } from 'vs/base/common/event';
import { endsWith } from 'vs/base/common/strings';
import { promisify } from 'util';
import { CancellationToken } from 'vs/base/common/cancellation';
import { isRootOrDriveLetter } from 'vs/base/common/extpath';
import { generateUuid } from 'vs/base/common/uuid';
import { normalizeNFC } from 'vs/base/common/normalization';
import { toDisposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { encode, encodeStream } from 'vs/base/node/encoding';

export enum RimRafMode {

	/**
	 * Slow version that unlinks each file and folder.
	 */
	UNLINK,

	/**
	 * Fast version that first moves the file/folder
	 * into a temp directory and then deletes that
	 * without waiting for it.
	 */
	MOVE
}

export async function rimraf(path: string, mode = RimRafMode.UNLINK): Promise<void> {
	if (isRootOrDriveLetter(path)) {
		throw new Error('rimraf - will refuse to recursively delete root');
	}

	// delete: via unlink
	if (mode === RimRafMode.UNLINK) {
		return rimrafUnlink(path);
	}

	// delete: via move
	return rimrafMove(path);
}

async function rimrafUnlink(path: string): Promise<void> {
	try {
		const stat = await lstat(path);

		// Folder delete (recursive) - NOT for symbolic links though!
		if (stat.isDirectory() && !stat.isSymbolicLink()) {

			// Children
			const children = await readdir(path);
			await Promise.all(children.map(child => rimrafUnlink(join(path, child))));

			// Folder
			await promisify(fs.rmdir)(path);
		}

		// Single file delete
		else {

			// chmod as needed to allow for unlink
			const mode = stat.mode;
			if (!(mode & 128)) { // 128 === 0200
				await chmod(path, mode | 128);
			}

			return unlink(path);
		}
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}
}

async function rimrafMove(path: string): Promise<void> {
	try {
		const pathInTemp = join(os.tmpdir(), generateUuid());
		try {
			await rename(path, pathInTemp);
		} catch (error) {
			return rimrafUnlink(path); // if rename fails, delete without tmp dir
		}

		// Delete but do not return as promise
		rimrafUnlink(pathInTemp);
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}
}

export function rimrafSync(path: string): void {
	if (isRootOrDriveLetter(path)) {
		throw new Error('rimraf - will refuse to recursively delete root');
	}

	try {
		const stat = fs.lstatSync(path);

		// Folder delete (recursive) - NOT for symbolic links though!
		if (stat.isDirectory() && !stat.isSymbolicLink()) {

			// Children
			const children = readdirSync(path);
			children.map(child => rimrafSync(join(path, child)));

			// Folder
			fs.rmdirSync(path);
		}

		// Single file delete
		else {

			// chmod as needed to allow for unlink
			const mode = stat.mode;
			if (!(mode & 128)) { // 128 === 0200
				fs.chmodSync(path, mode | 128);
			}

			return fs.unlinkSync(path);
		}
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}
}

export async function readdir(path: string): Promise<string[]> {
	return handleDirectoryChildren(await promisify(fs.readdir)(path));
}

export function readdirSync(path: string): string[] {
	return handleDirectoryChildren(fs.readdirSync(path));
}

function handleDirectoryChildren(children: string[]): string[] {
	// Mac: uses NFD unicode form on disk, but we want NFC
	// See also https://github.com/nodejs/node/issues/2165
	if (platform.isMacintosh) {
		return children.map(child => normalizeNFC(child));
	}

	return children;
}

export function exists(path: string): Promise<boolean> {
	return promisify(fs.exists)(path);
}

export function chmod(path: string, mode: number): Promise<void> {
	return promisify(fs.chmod)(path, mode);
}

export function stat(path: string): Promise<fs.Stats> {
	return promisify(fs.stat)(path);
}

export interface IStatAndLink {
	stat: fs.Stats;
	isSymbolicLink: boolean;
}

export async function statLink(path: string): Promise<IStatAndLink> {

	// First stat the link
	let linkStat: fs.Stats | undefined;
	let linkStatError: NodeJS.ErrnoException | undefined;
	try {
		linkStat = await lstat(path);
	} catch (error) {
		linkStatError = error;
	}

	// Then stat the target and return that
	const isLink = !!(linkStat && linkStat.isSymbolicLink());
	if (linkStatError || isLink) {
		const fileStat = await stat(path);

		return { stat: fileStat, isSymbolicLink: isLink };
	}

	return { stat: linkStat!, isSymbolicLink: false };
}

export function lstat(path: string): Promise<fs.Stats> {
	return promisify(fs.lstat)(path);
}

export function rename(oldPath: string, newPath: string): Promise<void> {
	return promisify(fs.rename)(oldPath, newPath);
}

export function renameIgnoreError(oldPath: string, newPath: string): Promise<void> {
	return new Promise(resolve => {
		fs.rename(oldPath, newPath, () => resolve());
	});
}

export function unlink(path: string): Promise<void> {
	return promisify(fs.unlink)(path);
}

export function symlink(target: string, path: string, type?: string): Promise<void> {
	return promisify(fs.symlink)(target, path, type);
}

export function readlink(path: string): Promise<string> {
	return promisify(fs.readlink)(path);
}

export function truncate(path: string, len: number): Promise<void> {
	return promisify(fs.truncate)(path, len);
}

export function readFile(path: string): Promise<Buffer>;
export function readFile(path: string, encoding: string): Promise<string>;
export function readFile(path: string, encoding?: string): Promise<Buffer | string> {
	return promisify(fs.readFile)(path, encoding);
}

// According to node.js docs (https://nodejs.org/docs/v6.5.0/api/fs.html#fs_fs_writefile_file_data_options_callback)
// it is not safe to call writeFile() on the same path multiple times without waiting for the callback to return.
// Therefor we use a Queue on the path that is given to us to sequentialize calls to the same path properly.
const writeFilePathQueue: { [path: string]: Queue<void> } = Object.create(null);

export function writeFile(path: string, data: string, options?: IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: Buffer, options?: IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: Uint8Array, options?: IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: NodeJS.ReadableStream, options?: IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: string | Buffer | NodeJS.ReadableStream | Uint8Array, options?: IWriteFileOptions): Promise<void>;
export function writeFile(path: string, data: string | Buffer | NodeJS.ReadableStream | Uint8Array, options?: IWriteFileOptions): Promise<void> {
	const queueKey = toQueueKey(path);

	return ensureWriteFileQueue(queueKey).queue(() => writeFileAndFlush(path, data, options));
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

export interface IWriteFileOptions {
	mode?: number;
	flag?: string;
	encoding?: {
		charset: string;
		addBOM: boolean;
	};
}

interface IEnsuredWriteFileOptions extends IWriteFileOptions {
	mode: number;
	flag: string;
}

let canFlush = true;
function writeFileAndFlush(path: string, data: string | Buffer | NodeJS.ReadableStream | Uint8Array, options: IWriteFileOptions | undefined): Promise<void> {
	const ensuredOptions = ensureWriteOptions(options);

	return new Promise((resolve, reject) => {
		if (typeof data === 'string' || Buffer.isBuffer(data) || data instanceof Uint8Array) {
			doWriteFileAndFlush(path, data, ensuredOptions, error => error ? reject(error) : resolve());
		} else {
			doWriteFileStreamAndFlush(path, data, ensuredOptions, error => error ? reject(error) : resolve());
		}
	});
}

function doWriteFileStreamAndFlush(path: string, reader: NodeJS.ReadableStream, options: IEnsuredWriteFileOptions, callback: (error?: Error) => void): void {

	// finish only once
	let finished = false;
	const finish = (error?: Error) => {
		if (!finished) {
			finished = true;

			// in error cases we need to manually close streams
			// if the write stream was successfully opened
			if (error) {
				if (isOpen) {
					writer.once('close', () => callback(error));
					writer.destroy();
				} else {
					callback(error);
				}
			}

			// otherwise just return without error
			else {
				callback();
			}
		}
	};

	// create writer to target. we set autoClose: false because we want to use the streams
	// file descriptor to call fs.fdatasync to ensure the data is flushed to disk
	const writer = fs.createWriteStream(path, { mode: options.mode, flags: options.flag, autoClose: false });

	// Event: 'open'
	// Purpose: save the fd for later use and start piping
	// Notes: will not be called when there is an error opening the file descriptor!
	let fd: number;
	let isOpen: boolean;
	writer.once('open', descriptor => {
		fd = descriptor;
		isOpen = true;

		// if an encoding is provided, we need to pipe the stream through
		// an encoder stream and forward the encoding related options
		if (options.encoding) {
			reader = reader.pipe(encodeStream(options.encoding.charset, { addBOM: options.encoding.addBOM }));
		}

		// start data piping only when we got a successful open. this ensures that we do
		// not consume the stream when an error happens and helps to fix this issue:
		// https://github.com/Microsoft/vscode/issues/42542
		reader.pipe(writer);
	});

	// Event: 'error'
	// Purpose: to return the error to the outside and to close the write stream (does not happen automatically)
	reader.once('error', error => finish(error));
	writer.once('error', error => finish(error));

	// Event: 'finish'
	// Purpose: use fs.fdatasync to flush the contents to disk
	// Notes: event is called when the writer has finished writing to the underlying resource. we must call writer.close()
	// because we have created the WriteStream with autoClose: false
	writer.once('finish', () => {

		// flush to disk
		if (canFlush && isOpen) {
			fs.fdatasync(fd, (syncError: Error) => {

				// In some exotic setups it is well possible that node fails to sync
				// In that case we disable flushing and warn to the console
				if (syncError) {
					console.warn('[node.js fs] fdatasync is now disabled for this session because it failed: ', syncError);
					canFlush = false;
				}

				writer.destroy();
			});
		} else {
			writer.destroy();
		}
	});

	// Event: 'close'
	// Purpose: signal we are done to the outside
	// Notes: event is called when the writer's filedescriptor is closed
	writer.once('close', () => finish());
}

// Calls fs.writeFile() followed by a fs.sync() call to flush the changes to disk
// We do this in cases where we want to make sure the data is really on disk and
// not in some cache.
//
// See https://github.com/nodejs/node/blob/v5.10.0/lib/fs.js#L1194
function doWriteFileAndFlush(path: string, data: string | Buffer | Uint8Array, options: IEnsuredWriteFileOptions, callback: (error?: Error) => void): void {
	if (options.encoding) {
		data = encode(data instanceof Uint8Array ? Buffer.from(data) : data, options.encoding.charset, { addBOM: options.encoding.addBOM });
	}

	if (!canFlush) {
		return fs.writeFile(path, data, { mode: options.mode, flag: options.flag }, callback);
	}

	// Open the file with same flags and mode as fs.writeFile()
	fs.open(path, options.flag, options.mode, (openError, fd) => {
		if (openError) {
			return callback(openError);
		}

		// It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
		fs.writeFile(fd, data, writeError => {
			if (writeError) {
				return fs.close(fd, () => callback(writeError)); // still need to close the handle on error!
			}

			// Flush contents (not metadata) of the file to disk
			fs.fdatasync(fd, (syncError: Error) => {

				// In some exotic setups it is well possible that node fails to sync
				// In that case we disable flushing and warn to the console
				if (syncError) {
					console.warn('[node.js fs] fdatasync is now disabled for this session because it failed: ', syncError);
					canFlush = false;
				}

				return fs.close(fd, closeError => callback(closeError));
			});
		});
	});
}

export function writeFileSync(path: string, data: string | Buffer, options?: IWriteFileOptions): void {
	const ensuredOptions = ensureWriteOptions(options);

	if (ensuredOptions.encoding) {
		data = encode(data, ensuredOptions.encoding.charset, { addBOM: ensuredOptions.encoding.addBOM });
	}

	if (!canFlush) {
		return fs.writeFileSync(path, data, { mode: ensuredOptions.mode, flag: ensuredOptions.flag });
	}

	// Open the file with same flags and mode as fs.writeFile()
	const fd = fs.openSync(path, ensuredOptions.flag, ensuredOptions.mode);

	try {

		// It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
		fs.writeFileSync(fd, data);

		// Flush contents (not metadata) of the file to disk
		try {
			fs.fdatasyncSync(fd);
		} catch (syncError) {
			console.warn('[node.js fs] fdatasyncSync is now disabled for this session because it failed: ', syncError);
			canFlush = false;
		}
	} finally {
		fs.closeSync(fd);
	}
}

function ensureWriteOptions(options?: IWriteFileOptions): IEnsuredWriteFileOptions {
	if (!options) {
		return { mode: 0o666, flag: 'w' };
	}

	return {
		mode: typeof options.mode === 'number' ? options.mode : 0o666,
		flag: typeof options.flag === 'string' ? options.flag : 'w',
		encoding: options.encoding
	};
}

export async function readDirsInDir(dirPath: string): Promise<string[]> {
	const children = await readdir(dirPath);
	const directories: string[] = [];

	for (const child of children) {
		if (await dirExists(join(dirPath, child))) {
			directories.push(child);
		}
	}

	return directories;
}

export async function dirExists(path: string): Promise<boolean> {
	try {
		const fileStat = await stat(path);

		return fileStat.isDirectory();
	} catch (error) {
		return false;
	}
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		const fileStat = await stat(path);

		return fileStat.isFile();
	} catch (error) {
		return false;
	}
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
			await rimraf(source, RimRafMode.MOVE);
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
			await mkdirp(dirname(path), mode);

			return mkdir();
		}

		// Any other error
		return Promise.reject(error);
	}
}

export function watchFile(path: string, onChange: (type: 'changed' | 'deleted', path: string) => void, onError: (error: string) => void): IDisposable {
	return doWatchNonRecursive({ path, isDirectory: false }, onChange, onError);
}

export function watchFolder(path: string, onChange: (type: 'added' | 'changed' | 'deleted', path: string) => void, onError: (error: string) => void): IDisposable {
	return doWatchNonRecursive({ path, isDirectory: true }, onChange, onError);
}

function doWatchNonRecursive(file: { path: string, isDirectory: boolean }, onChange: (type: 'added' | 'changed' | 'deleted', path: string) => void, onError: (error: string) => void): IDisposable {
	const mapPathToStatDisposable = new Map<string, IDisposable>();

	let disposed = false;
	let watcherDisposables: IDisposable[] = [];

	const originalFileName = basename(file.path);

	try {

		// Creating watcher can fail with an exception
		const watcher = fs.watch(file.path);
		watcherDisposables.push(toDisposable(() => {
			watcher.removeAllListeners();
			watcher.close();
		}));

		// Folder: resolve children to emit proper events
		const folderChildren: Set<string> = new Set<string>();
		if (file.isDirectory) {
			readdir(file.path).then(children => children.forEach(child => folderChildren.add(child)));
		}

		watcher.on('error', (code: number, signal: string) => {
			if (!disposed) {
				onError(`Failed to watch ${file.path} for changes using fs.watch() (${code}, ${signal})`);
			}
		});

		watcher.on('change', (type, raw) => {
			if (disposed) {
				return; // ignore if already disposed
			}

			// Normalize file name
			let changedFileName: string = '';
			if (raw) { // https://github.com/Microsoft/vscode/issues/38191
				changedFileName = raw.toString();
				if (platform.isMacintosh) {
					// Mac: uses NFD unicode form on disk, but we want NFC
					// See also https://github.com/nodejs/node/issues/2165
					changedFileName = normalizeNFC(changedFileName);
				}
			}

			if (!changedFileName || (type !== 'change' && type !== 'rename')) {
				return; // ignore unexpected events
			}

			// File path: use path directly for files and join with changed file name otherwise
			const changedFilePath = file.isDirectory ? join(file.path, changedFileName) : file.path;

			// File
			if (!file.isDirectory) {
				if (type === 'rename' || changedFileName !== originalFileName) {
					// The file was either deleted or renamed. Many tools apply changes to files in an
					// atomic way ("Atomic Save") by first renaming the file to a temporary name and then
					// renaming it back to the original name. Our watcher will detect this as a rename
					// and then stops to work on Mac and Linux because the watcher is applied to the
					// inode and not the name. The fix is to detect this case and trying to watch the file
					// again after a certain delay.
					// In addition, we send out a delete event if after a timeout we detect that the file
					// does indeed not exist anymore.

					// Wait a bit and try to install watcher again, assuming that the file was renamed quickly ("Atomic Save")
					const timeoutHandle = setTimeout(async () => {
						const fileExists = await exists(changedFilePath);

						if (disposed) {
							return; // ignore if disposed by now
						}

						// File still exists, so emit as change event and reapply the watcher
						if (fileExists) {
							onChange('changed', changedFilePath);

							watcherDisposables = [doWatchNonRecursive(file, onChange, onError)];
						}

						// File seems to be really gone, so emit a deleted event
						else {
							onChange('deleted', changedFilePath);
						}
					}, 300);

					// Very important to dispose the watcher which now points to a stale inode
					// and wire in a new disposable that tracks our timeout that is installed
					dispose(watcherDisposables);
					watcherDisposables = [toDisposable(() => clearTimeout(timeoutHandle))];
				} else {
					onChange('changed', changedFilePath);
				}
			}

			// Folder
			else {

				// Children add/delete
				if (type === 'rename') {

					// Cancel any previous stats for this file path if existing
					const statDisposable = mapPathToStatDisposable.get(changedFilePath);
					if (statDisposable) {
						dispose(statDisposable);
					}

					// Wait a bit and try see if the file still exists on disk to decide on the resulting event
					const timeoutHandle = setTimeout(async () => {
						mapPathToStatDisposable.delete(changedFilePath);

						const fileExists = await exists(changedFilePath);

						if (disposed) {
							return; // ignore if disposed by now
						}

						// Figure out the correct event type:
						// File Exists: either 'added' or 'changed' if known before
						// File Does not Exist: always 'deleted'
						let type: 'added' | 'deleted' | 'changed';
						if (fileExists) {
							if (folderChildren.has(changedFileName)) {
								type = 'changed';
							} else {
								type = 'added';
								folderChildren.add(changedFileName);
							}
						} else {
							folderChildren.delete(changedFileName);
							type = 'deleted';
						}

						onChange(type, changedFilePath);
					}, 100);

					mapPathToStatDisposable.set(changedFilePath, toDisposable(() => clearTimeout(timeoutHandle)));
				}

				// Other events
				else {

					// Figure out the correct event type: if this is the
					// first time we see this child, it can only be added
					let type: 'added' | 'changed';
					if (folderChildren.has(changedFileName)) {
						type = 'changed';
					} else {
						type = 'added';
						folderChildren.add(changedFileName);
					}

					onChange(type, changedFilePath);
				}
			}
		});
	} catch (error) {
		fs.exists(file.path, exists => {
			if (exists && !disposed) {
				onError(`Failed to watch ${file.path} for changes using fs.watch() (${error.toString()})`);
			}
		});
	}

	return toDisposable(() => {
		disposed = true;

		watcherDisposables = dispose(watcherDisposables);

		mapPathToStatDisposable.forEach(disposable => dispose(disposable));
		mapPathToStatDisposable.clear();
	});
}