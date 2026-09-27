/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { isDescendant } from './util';

export type WorktreeSymlinkStatus = 'created' | 'sourceContainsWorktree' | 'targetExists';

/**
 * Returns the ancestor directories of files that are both git-ignored and
 * matched by the configured patterns.
 */
export function getWorktreeSymlinkFolderCandidates(ignoredOutput: string, matchedOutput: string): string[] {
	const matchedFiles = new Set(splitNulSeparated(matchedOutput));
	const candidates = new Set<string>();

	for (const file of splitNulSeparated(ignoredOutput)) {
		if (!matchedFiles.has(file)) {
			continue;
		}

		let index = file.lastIndexOf('/');
		while (index !== -1) {
			candidates.add(file.slice(0, index));
			index = file.lastIndexOf('/', index - 1);
		}
	}

	return Array.from(candidates);
}

/**
 * Selects candidate directories that are themselves ignored by git, match the
 * configured patterns, and contain no tracked files.
 */
export function filterWorktreeSymlinkFolders(candidates: readonly string[], ignoredOutput: string, matchedOutput: string, directoryOutput: string): string[] {
	const ignoredDirectories = new Set(splitNulSeparated(ignoredOutput));
	const matchedDirectories = new Set(splitNulSeparated(matchedOutput));
	const whollyIgnoredDirectories = new Set(splitNulSeparated(directoryOutput).filter(directory => directory.endsWith('/')));

	const directories = candidates.filter(directory =>
		ignoredDirectories.has(`${directory}/`) &&
		matchedDirectories.has(`${directory}/`) &&
		hasContainingDirectory(directory, whollyIgnoredDirectories)
	);
	const directorySet = new Set(directories.map(directory => `${directory}/`));

	return directories.filter(directory =>
		!hasContainingDirectory(directory, directorySet, false)
	);
}

/**
 * Creates a symlink in a worktree to a directory in the repository.
 */
export async function createWorktreeSymlink(repositoryRoot: string, worktreeRoot: string, folder: string): Promise<WorktreeSymlinkStatus> {
	folder = folder.split('/').join(path.sep);
	const sourcePath = path.join(repositoryRoot, folder);
	const targetPath = path.join(worktreeRoot, folder);

	const [sourceRealPath, worktreeRealPath] = await Promise.all([
		fsPromises.realpath(sourcePath),
		fsPromises.realpath(worktreeRoot)
	]);
	if (isDescendant(sourceRealPath, worktreeRealPath)) {
		return 'sourceContainsWorktree';
	}

	await assertTargetParentDoesNotContainSymlink(worktreeRoot, folder);

	try {
		await fsPromises.lstat(targetPath);
		return 'targetExists';
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw err;
		}
	}

	await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
	await fsPromises.symlink(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
	return 'created';
}

async function assertTargetParentDoesNotContainSymlink(worktreeRoot: string, folder: string): Promise<void> {
	const parentDirectory = path.dirname(folder);
	if (parentDirectory === '.') {
		return;
	}

	let currentPath = worktreeRoot;
	for (const pathSegment of parentDirectory.split(path.sep)) {
		currentPath = path.join(currentPath, pathSegment);

		try {
			const stat = await fsPromises.lstat(currentPath);
			if (stat.isSymbolicLink()) {
				throw new Error(`Cannot create worktree symlink because target parent '${currentPath}' is a symbolic link.`);
			}
			if (!stat.isDirectory()) {
				throw new Error(`Cannot create worktree symlink because target parent '${currentPath}' is not a directory.`);
			}
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				return;
			}
			throw err;
		}
	}
}

function splitNulSeparated(output: string): string[] {
	return output.split('\x00').filter(entry => entry.length > 0);
}

function hasContainingDirectory(directory: string, directories: ReadonlySet<string>, includeSelf = true): boolean {
	let index = includeSelf ? directory.length : directory.lastIndexOf('/');
	while (index > 0) {
		if (directories.has(`${directory.slice(0, index)}/`)) {
			return true;
		}
		index = directory.lastIndexOf('/', index - 1);
	}
	return false;
}
