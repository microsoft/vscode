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
					.then((stat: fs.Stats) => stat.isDirectory
						? null
						: Promise.wrapError(new Error(`'${path}' exists and is not a directory.`)));
			}

			return TPromise.wrapError<boolean>(err);
		});

	// is root?
	if (path === dirname(path)) {
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

export function utimes(path: string, atime: Date, mtime: Date): TPromise<void> {
	return nfcall(fs.utimes, path, atime, mtime);
}

export function readFile(path: string): TPromise<Buffer>;
export function readFile(path: string, encoding: string): TPromise<string>;
export function readFile(path: string, encoding?: string): TPromise<Buffer | string> {
	return nfcall(fs.readFile, path, encoding);
}

export function writeFile(path: string, data: string, encoding?: string): TPromise<void>;
export function writeFile(path: string, data: NodeBuffer, encoding?: string): TPromise<void>;
export function writeFile(path: string, data: any, encoding: string = 'utf8'): TPromise<void> {
	return nfcall(fs.writeFile, path, data, encoding);
}

export function writeFileAndFlush(path: string, data: string, encoding?: string): TPromise<void>;
export function writeFileAndFlush(path: string, data: NodeBuffer, encoding?: string): TPromise<void>;
export function writeFileAndFlush(path: string, data: any, encoding: string = 'utf8'): TPromise<void> {
	return nfcall(extfs.writeFileAndFlush, path, data, encoding);
}

/**
* Read a dir and return only subfolders
*/
export function readDirsInDir(dirPath: string): TPromise<string[]> {
	return readdir(dirPath).then(children => {
		return TPromise.join(children.map(c => dirExists(paths.join(dirPath, c)))).then(exists => {
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
