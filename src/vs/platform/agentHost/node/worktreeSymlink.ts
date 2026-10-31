/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from '../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

export async function createWorktreeSymlink(sourceRoot: URI, worktree: URI, folder: string): Promise<boolean> {
	const relativeFolder = folder.split('/').join(path.sep);
	const sourcePath = path.join(sourceRoot.fsPath, relativeFolder);
	const targetPath = path.join(worktree.fsPath, relativeFolder);
	const [sourceRealPath, worktreeRealPath] = await Promise.all([
		fs.realpath(sourcePath),
		fs.realpath(worktree.fsPath),
	]);
	if (extUriBiasedIgnorePathCase.isEqualOrParent(URI.file(worktreeRealPath), URI.file(sourceRealPath))) {
		return false;
	}

	await assertTargetParentDoesNotContainSymlink(worktree.fsPath, relativeFolder);

	try {
		await fs.lstat(targetPath);
		return false;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
	}

	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	await fs.symlink(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
	return true;
}

async function assertTargetParentDoesNotContainSymlink(worktreeRoot: string, folder: string): Promise<void> {
	const parentFolder = path.dirname(folder);
	if (parentFolder === '.') {
		return;
	}

	let currentPath = worktreeRoot;
	for (const pathSegment of parentFolder.split(path.sep)) {
		currentPath = path.join(currentPath, pathSegment);
		try {
			const stat = await fs.lstat(currentPath);
			if (stat.isSymbolicLink()) {
				throw new Error(`Cannot create worktree symlink because target parent '${currentPath}' is a symbolic link.`);
			}
			if (!stat.isDirectory()) {
				throw new Error(`Cannot create worktree symlink because target parent '${currentPath}' is not a directory.`);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return;
			}
			throw error;
		}
	}
}
