/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lstat, opendir } from 'fs/promises';
import type { Dir, Stats } from 'fs';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorCode } from '../../../base/common/errors.js';
import { join } from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';

interface IWorktreeFileSystem {
	lstat(path: string): Promise<Stats>;
	opendir(path: string): Promise<Dir>;
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

function isMissing(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === 'ENOENT' || code === 'ENOTDIR';
}

async function measureFiles(paths: string[], token: CancellationToken, fileSystem: IWorktreeFileSystem): Promise<number> {
	throwIfCancelled(token);
	const sizes = await Promise.all(paths.map(async path => {
		const stat = await fileSystem.lstat(path).catch(error => {
			if (isMissing(error)) {
				return undefined;
			}
			throw error;
		});
		return stat?.isFile() ? stat.size : 0;
	}));
	return sizes.reduce((total, size) => total + size, 0);
}

/** Counts regular-file bytes on the host without following symlinks or issuing per-file RPCs. */
export async function measureWorktreeDiskUsage(root: URI, token: CancellationToken, fileSystem: IWorktreeFileSystem = { lstat, opendir }): Promise<number | undefined> {
	throwIfCancelled(token);
	const rootStat = await fileSystem.lstat(root.fsPath).catch(error => {
		if (isMissing(error)) {
			return undefined;
		}
		throw error;
	});
	if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
		return undefined;
	}

	const pending = [root.fsPath];
	let total = 0;
	while (pending.length > 0) {
		throwIfCancelled(token);
		const directory = await fileSystem.opendir(pending.pop()!).catch(error => {
			if (isMissing(error)) {
				return undefined;
			}
			throw error;
		});
		if (!directory) {
			continue;
		}
		let files: string[] = [];
		for await (const entry of directory) {
			throwIfCancelled(token);
			const path = join(directory.path, entry.name);
			if (entry.isDirectory()) {
				pending.push(path);
			} else if (entry.isFile()) {
				files.push(path);
				if (files.length === 8) {
					total += await measureFiles(files, token, fileSystem);
					files = [];
				}
			}
		}
		total += await measureFiles(files, token, fileSystem);
	}
	throwIfCancelled(token);
	return total;
}
