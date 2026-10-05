/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Removes the patterns that contain line breaks. Each `git.worktreeIncludeFiles`
 * entry must stay a single `.gitignore` line; an embedded line break would
 * inject additional patterns (e.g. a `!` negation).
 */
export function sanitizeWorktreeIncludePatterns(patterns: readonly string[]): string[] {
	return patterns.filter(pattern => !/[\r\n]/.test(pattern));
}

/**
 * Selects the git-ignored paths to copy into a worktree from the NUL-separated
 * `git ls-files` outputs, collapsing wholly-ignored directories whose every
 * ignored file is included into a single recursive entry.
 *
 * @param ignoredOutput `git ls-files --others --ignored --exclude-standard -z` in the repository.
 * @param includedOutput `git ls-files --others --ignored --exclude-from=<patterns> -z` in the repository.
 * @param directoryOutput `git ls-files --others --ignored --exclude-standard -z --directory --no-empty-directory` in the repository.
 * @param worktreeOutput `git ls-files -z` in the newly created worktree.
 * @param excludedFolders Repository-relative folders already symlinked into the worktree.
 * @returns Repository-relative, forward-slash paths (files and folders) to copy.
 */
export function resolveWorktreeIncludePaths(ignoredOutput: string, includedOutput: string, directoryOutput: string | undefined, worktreeOutput: string, excludedFolders: readonly string[] = []): string[] {
	const ignoredFiles = splitNulSeparated(ignoredOutput);
	if (ignoredFiles.length === 0) {
		return [];
	}

	// Keep only the ignored files that also match one of the configured
	// `git.worktreeIncludeFiles` patterns, and — in the same pass — tally
	// which wholly-ignored directories contain an ignored file that cannot
	// be copied (and therefore cannot be collapsed). `git ls-files
	// --directory` reports a wholly-ignored directory as a single `dir/`
	// entry and never nests these entries (it stops descending once a
	// directory is wholly ignored), so each file has at most one containing
	// directory and no de-duplication of the directory set is required.
	const includedFiles = new Set(splitNulSeparated(includedOutput));
	const wholeDirectories = new Set(splitNulSeparated(directoryOutput).filter(entry => entry.endsWith('/')));
	const worktreeFiles = new Set(splitNulSeparated(worktreeOutput));
	const excludedDirectories = new Set(excludedFolders.map(folder => folder.endsWith('/') ? folder : `${folder}/`));

	// Every ancestor directory of a tracked path, with the trailing `/` used
	// by `git ls-files --directory`, so a source path can be checked against
	// the shape (file vs directory) of its destination.
	const worktreeDirectories = new Set<string>();
	for (const file of worktreeFiles) {
		let index = file.indexOf('/');
		while (index !== -1) {
			worktreeDirectories.add(file.slice(0, index + 1));
			index = file.indexOf('/', index + 1);
		}
	}

	const matchedFiles: string[] = [];
	const nonCollapsibleDirectories = new Set<string>();
	for (const file of ignoredFiles) {
		if (includedFiles.has(file) && findContainingDirectory(file, excludedDirectories) === undefined && !hasWorktreePathCollision(file, worktreeFiles, worktreeDirectories)) {
			matchedFiles.push(file);
		} else if (wholeDirectories.size > 0) {
			const containingDirectory = findContainingDirectory(file, wholeDirectories);
			if (containingDirectory !== undefined) {
				nonCollapsibleDirectories.add(containingDirectory);
			}
		}
	}

	if (matchedFiles.length === 0) {
		return [];
	}

	// Collapse matched files into their containing directory when the whole
	// directory can be copied as a single recursive unit — i.e. it is
	// wholly ignored (so it has no tracked files a recursive copy would
	// clobber) and every ignored file it contains matched a pattern (so
	// nothing unwanted is copied, tracked by `nonCollapsibleDirectories` above).
	// This turns a large tree such as `node_modules/` into one copy instead
	// of one per file, while a partially-matched or partially-tracked
	// directory falls back to its individual matched files. `--directory`
	// with `--no-empty-directory` never reports an empty directory, so every
	// entry in `wholeDirectories` is known to contain at least one ignored file.
	const collapsedDirectories = new Set<string>();
	for (const dir of wholeDirectories) {
		if (!nonCollapsibleDirectories.has(dir)) {
			collapsedDirectories.add(dir);
		}
	}

	const filePaths = collapsedDirectories.size > 0
		? matchedFiles.filter(file => findContainingDirectory(file, collapsedDirectories) === undefined)
		: matchedFiles;

	return [
		...Array.from(collapsedDirectories, dir => dir.slice(0, -1)),
		...filePaths
	];
}

function splitNulSeparated(output: string | undefined): string[] {
	return (output ?? '').split('\x00').filter(entry => entry.length > 0);
}

/**
 * Returns the shallowest directory from `directories` that contains `file`, or
 * `undefined` if none does. `file` is a repository-relative, forward-slash path
 * and every entry in `directories` is expected to end with a trailing `/` (as
 * produced by `git ls-files --directory`). Walking the path's `/` boundaries
 * and probing the set is O(path depth) per file, avoiding an O(directories)
 * scan for each file.
 */
function findContainingDirectory(file: string, directories: ReadonlySet<string>): string | undefined {
	let index = file.indexOf('/');
	while (index !== -1) {
		const prefix = file.slice(0, index + 1);
		if (directories.has(prefix)) {
			return prefix;
		}
		index = file.indexOf('/', index + 1);
	}
	return undefined;
}

/**
 * Returns whether copying a source path would overwrite a tracked worktree path
 * or conflict with the file/directory shape of its destination. `file` and both
 * sets use repository-relative, forward-slash paths, with `worktreeDirectories`
 * entries carrying a trailing `/`.
 */
function hasWorktreePathCollision(file: string, worktreeFiles: ReadonlySet<string>, worktreeDirectories: ReadonlySet<string>): boolean {
	// The destination is a tracked file, which the copy would overwrite, or a
	// tracked directory, which a file cannot take the place of.
	if (worktreeFiles.has(file) || worktreeDirectories.has(`${file}/`)) {
		return true;
	}

	// An ancestor of the destination is a tracked file, so the directories
	// leading up to it cannot be created.
	let index = file.indexOf('/');
	while (index !== -1) {
		if (worktreeFiles.has(file.slice(0, index))) {
			return true;
		}
		index = file.indexOf('/', index + 1);
	}
	return false;
}
