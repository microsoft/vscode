/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import * as extfs from 'vs/base/node/extfs';
import { join } from 'path';
import { nfcall, Queue } from 'vs/base/common/async';
import * as fs from 'fs';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import { once } from 'vs/base/common/event';

export function readdir(path: string): TPromise<string[]> {
	return nfcall(extfs.readdir, path);
}

export function exists(path: string): TPromise<boolean> {
	return new TPromise(c => fs.exists(path, c), () => { });
}

export function chmod(path: string, mode: number): TPromise<boolean> {
	return nfcall(fs.chmod, path, mode);
}

export import mkdirp = extfs.mkdirp;

export function rimraf(path: string): TPromise<void> {
	return lstat(path).then(stat => {
		if (stat.isDirectory() && !stat.isSymbolicLink()) {
			return readdir(path)
				.then(children => TPromise.join(children.map(child => rimraf(join(path, child)))))
				.then(() => rmdir(path));
		} else {
			return unlink(path);
		}
	}, (err: NodeJS.ErrnoException) => {
		if (err.code === 'ENOENT') {
			return void 0;
		}

		return TPromise.wrapError<void>(err);
	});
}

export function realpath(path: string): TPromise<string> {
	return nfcall(extfs.realpath, path);
}

export function stat(path: string): TPromise<fs.Stats> {
	return nfcall(fs.stat, path);
}

export function statLink(path: string): TPromise<{ stat: fs.Stats, isSymbolicLink: boolean }> {
	return nfcall(extfs.statLink, path);
}

export function lstat(path: string): TPromise<fs.Stats> {
	return nfcall(fs.lstat, path);
}

export function rename(oldPath: string, newPath: string): TPromise<void> {
	return nfcall(fs.rename, oldPath, newPath);
}

export function rmdir(path: string): TPromise<void> {
	return nfcall(fs.rmdir, path);
}

export function unlink(path: string): TPromise<void> {
	return nfcall(fs.unlink, path);
}

export function symlink(target: string, path: string, type?: string): TPromise<void> {
	return nfcall<void>(fs.symlink, target, path, type);
}

export function readlink(path: string): TPromise<string> {
	return nfcall<string>(fs.readlink, path);
}

export function touch(path: string): TPromise<void> {
	const now = Date.now() / 1000; // the value should be a Unix timestamp in seconds

	return nfcall(fs.utimes, path, now, now);
}

export function truncate(path: string, len: number): TPromise<void> {
	return nfcall(fs.truncate, path, len);
}

export function readFile(path: string): TPromise<Buffer>;
export function readFile(path: string, encoding: string): TPromise<string>;
export function readFile(path: string, encoding?: string): TPromise<Buffer | string> {
	return nfcall(fs.readFile, path, encoding);
}

// According to node.js docs (https://nodejs.org/docs/v6.5.0/api/fs.html#fs_fs_writefile_file_data_options_callback)
// it is not safe to call writeFile() on the same path multiple times without waiting for the callback to return.
// Therefor we use a Queue on the path that is given to us to sequentialize calls to the same path properly.
const writeFilePathQueue: { [path: string]: Queue<void> } = Object.create(null);

export function writeFile(path: string, data: string, options?: extfs.IWriteFileOptions): TPromise<void>;
export function writeFile(path: string, data: NodeBuffer, options?: extfs.IWriteFileOptions): TPromise<void>;
export function writeFile(path: string, data: NodeJS.ReadableStream, options?: extfs.IWriteFileOptions): TPromise<void>;
export function writeFile(path: string, data: any, options?: extfs.IWriteFileOptions): TPromise<void> {
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

		const onFinish = once(writeFileQueue.onFinished);
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
export function readDirsInDir(dirPath: string): TPromise<string[]> {
	return readdir(dirPath).then(children => {
		return TPromise.join(children.map(c => dirExists(join(dirPath, c)))).then(exists => {
			return children.filter((_, i) => exists[i]);
		});
	});
}

/**
* `path` exists and is a directory
*/
export function dirExists(path: string): TPromise<boolean> {
	return stat(path).then(stat => stat.isDirectory(), () => false);
}

/**
* `path` exists and is a file.
*/
export function fileExists(path: string): TPromise<boolean> {
	return stat(path).then(stat => stat.isFile(), () => false);
}

/**
 * Deletes a path from disk.
 */
let _tmpDir: string = null;
function getTmpDir(): string {
	if (!_tmpDir) {
		_tmpDir = os.tmpdir();
	}
	return _tmpDir;
}
export function del(path: string, tmp = getTmpDir()): TPromise<void> {
	return nfcall(extfs.del, path, tmp);
}

export function whenDeleted(path: string): TPromise<void> {

	// Complete when wait marker file is deleted
	return new TPromise<void>(c => {
		let running = false;
		const interval = setInterval(() => {
			if (!running) {
				running = true;
				fs.exists(path, exists => {
					running = false;

					if (!exists) {
						clearInterval(interval);
						c(null);
					}
				});
			}
		}, 1000);
	});
}
