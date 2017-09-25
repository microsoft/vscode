/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { dirname } from 'path';
var rimraf = require('rimraf');

/**
 * Contains methods that are commonly used across test areas.
 */
export class Util {
	constructor() {
		// noop
	}

	public removeFile(filePath: string): void {
		try {
			fs.unlinkSync(`${filePath}`);
		} catch (e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}
	}

	public rimraf(directory: string): Promise<any> {
		return new Promise((res, rej) => {
			rimraf(directory, (err) => {
				if (err) {
					rej(err);
				}
				res();
			});
		});
	}

	public static rimraf(directory: string): Promise<any> {
		return new Promise((res, rej) => {
			rimraf(directory, (err) => {
				if (err) {
					rej(err);
				}
				res();
			});
		});
	}

	public static removeFile(filePath: string): void {
		try {
			fs.unlinkSync(`${filePath}`);
		} catch (e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}
	}
}

export function nfcall<R>(fn: Function, ...args): Promise<R> {
	return new Promise<R>((c, e) => fn(...args, (err, r) => err ? e(err) : c(r)));
}

export async function mkdirp(path: string, mode?: number): Promise<boolean> {
	const mkdir = async () => {
		try {
			await nfcall(fs.mkdir, path, mode);
		} catch (err) {
			if (err.code === 'EEXIST') {
				const stat = await nfcall<fs.Stats>(fs.stat, path);

				if (stat.isDirectory) {
					return;
				}

				throw new Error(`'${path}' exists and is not a directory.`);
			}

			throw err;
		}
	};

	// is root?
	if (path === dirname(path)) {
		return true;
	}

	try {
		await mkdir();
	} catch (err) {
		if (err.code !== 'ENOENT') {
			throw err;
		}

		await mkdirp(dirname(path), mode);
		await mkdir();
	}

	return true;
}