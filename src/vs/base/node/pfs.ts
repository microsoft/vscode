/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Promise, TPromise } from 'vs/base/common/winjs.base';
import extfs = require('vs/base/node/extfs');
import paths = require('vs/base/common/paths');
import { dirname, join } from 'path';
import { nfcall } from 'vs/base/common/async';
import fs = require('fs');

export function isRoot(path: string): boolean {
	return path === dirname(path);
}

export function readdir(path: string): TPromise<string[]> {
	return nfcall(extfs.readdir, path);
}

export function exists(path: string): TPromise<boolean> {
	return new Promise(c => fs.exists(path, c));
}

export function chmod(path: string, mode: number): TPromise<boolean> {
	return nfcall(fs.chmod, path, mode);
}

export function mkdirp(path: string, mode?: number): TPromise<boolean> {
	const mkdir = () => nfcall(fs.mkdir, path, mode)
		.then(null, (err: NodeJS.ErrnoException) => {
			if (err.code === 'EEXIST') {
				return nfcall(fs.stat, path)
					.then((stat:fs.Stats) => stat.isDirectory
						? null
						: Promise.wrapError(new Error(`'${ path }' exists and is not a directory.`)));
			}

			return TPromise.wrapError<boolean>(err);
		});

	if (isRoot(path)) {
		return TPromise.as(true);
	}

	return mkdir().then(null, (err: NodeJS.ErrnoException) => {
		if (err.code === 'ENOENT') {
			return mkdirp(dirname(path), mode).then(mkdir);
		}

		return TPromise.wrapError<boolean>(err);
	});
}

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
			return;
		}

		return TPromise.wrapError<void>(err);
	});
}

export function realpath(path: string): TPromise<string> {
	return nfcall(fs.realpath, path, null);
}

export function stat(path: string): TPromise<fs.Stats> {
	return nfcall(fs.stat, path);
}

export function lstat(path: string): TPromise<fs.Stats> {
	return nfcall(fs.lstat, path);
}

export function mstat(paths: string[]): TPromise<{ path: string; stats: fs.Stats; }> {
	return doStatMultiple(paths.slice(0));
}

export function rename(oldPath: string, newPath: string): Promise {
	return nfcall(fs.rename, oldPath, newPath);
}

export function rmdir(path: string): Promise {
	return nfcall(fs.rmdir, path);
}

export function unlink(path: string): Promise {
	return nfcall(fs.unlink, path);
}

export function symlink(target: string, path: string, type?: string): TPromise<void> {
	return nfcall<void>(fs.symlink, target, path, type);
}

export function readlink(path: string): TPromise<string> {
	return nfcall<string>(fs.readlink, path);
}

function doStatMultiple(paths: string[]): TPromise<{ path: string; stats: fs.Stats; }> {
	let path = paths.shift();
	return stat(path).then((value) => {
		return {
			path: path,
			stats: value
		};
	}, (err) => {
		if (paths.length === 0) {
			return err;
		}
		return mstat(paths);
	});
}

export function readFile(path: string): TPromise<Buffer>;
export function readFile(path: string, encoding: string): TPromise<string>;
export function readFile(path: string, encoding?: string): TPromise<Buffer | string> {
	return nfcall(fs.readFile, path, encoding);
}

export function writeFile(path: string, data: string, encoding?: string): Promise;
export function writeFile(path: string, data: NodeBuffer, encoding?: string): Promise;
export function writeFile(path: string, data: any, encoding: string = 'utf8'): Promise {
	return nfcall(fs.writeFile, path, data, encoding);
}

/**
* Read a dir and return only subfolders
*/
export function readDirsInDir(dirPath: string): TPromise<string[]> {
	return readdir(dirPath).then((children) => {
		return TPromise.join(
			children.map((child) => dirExistsWithResult(paths.join(dirPath, child), child))
		).then((subdirs) => {
			return removeNull(subdirs);
		});
	});
}

function dirExistsWithResult<T>(path: string, successResult: T): TPromise<T> {
	return dirExists(path).then((exists) => {
		return exists ? successResult : null;
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
* Read dir at `path` and return only files matching `pattern`
*/
export function readFiles(path: string, pattern: RegExp): TPromise<string[]> {
	return readdir(path).then((children) => {
		children = children.filter((child) => {
			return pattern.test(child);
		});
		let fileChildren = children.map((child) => {
			return fileExistsWithResult(paths.join(path, child), child);
		});
		return TPromise.join(fileChildren).then((subdirs) => {
			return removeNull(subdirs);
		});
	});
}

export function fileExistsWithResult<T>(path: string, successResult: T): TPromise<T> {
	return fileExists(path).then((exists) => {
		return exists ? successResult : null;
	}, (err) => {
		return TPromise.wrapError(err);
	});
}


function removeNull<T>(arr: T[]): T[] {
	return arr.filter(item => (item !== null));
}