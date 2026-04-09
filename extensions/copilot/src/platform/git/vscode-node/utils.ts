/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as path from 'path';
import { Uri } from 'vscode';
import { IGitService, RepoContext } from '../common/gitService';
import { Change, DiffChange } from '../vscode/git';

export function parseGitChangesRaw(repositoryRoot: string, raw: string): DiffChange[] {
	const changes: Change[] = [];
	const numStats = new Map<string, { insertions: number; deletions: number }>();

	let index = 0;
	const segments = raw.trim().split('\x00').filter(s => s);

	segmentsLoop:
	while (index < segments.length) {
		const segment = segments[index++];
		if (!segment) {
			break;
		}

		if (segment.startsWith(':')) {
			// Parse --raw output
			const [, , , , change] = segment.split(' ');
			const filePath = segments[index++];
			const originalUri = Uri.file(path.isAbsolute(filePath) ? filePath : path.join(repositoryRoot, filePath));

			let uri = originalUri;
			let renameUri = originalUri;
			let status = 7; /* Status.UNTRACKED */

			switch (change[0]) {
				case 'A':
					status = 1; /* Status.INDEX_ADDED */
					break;
				case 'M':
					status = 5; /* Status.MODIFIED */
					break;
				case 'D':
					status = 6; /* Status.DELETED */
					break;
				case 'R': {
					if (index >= segments.length) {
						break;
					}
					const newPath = segments[index++];
					if (!newPath) {
						break;
					}

					status = 3; /* Status.INDEX_RENAMED */
					uri = renameUri = Uri.file(path.isAbsolute(newPath) ? newPath : path.join(repositoryRoot, newPath));
					break;
				}
				default:
					// Unknown status
					break segmentsLoop;
			}

			changes.push({ status, uri, originalUri, renameUri });
		} else {
			// Parse --numstat output
			const [insertions, deletions, filePath] = segment.split('\t');

			let numstatPath: string;
			if (filePath === '') {
				// For renamed files, filePath is empty and the old/new paths
				// are in the next two null-terminated segments. We skip the
				// old path and use the new path for the stats key.
				index++;

				const renamePath = segments[index++];
				numstatPath = path.isAbsolute(renamePath) ? renamePath : path.join(repositoryRoot, renamePath);
			} else {
				numstatPath = path.isAbsolute(filePath) ? filePath : path.join(repositoryRoot, filePath);
			}

			numStats.set(numstatPath, {
				insertions: insertions === '-' ? 0 : parseInt(insertions),
				deletions: deletions === '-' ? 0 : parseInt(deletions),
			});
		}
	}

	return changes.map(change => ({
		...change,
		insertions: numStats.get(change.uri.fsPath)?.insertions ?? 0,
		deletions: numStats.get(change.uri.fsPath)?.deletions ?? 0,
	}));
}

/**
 * Build the environment variables for git commands that use a temporary index file.
 * Sets GIT_INDEX_FILE and COMMAND_HOOK_LOCK to prevent the GVFS command hook from
 * holding the main lock when operating on a temporary index.
 *
 * Background: In GVFS repos, the command hook acquires a lock that blocks file writes
 * while any git command runs. By setting COMMAND_HOOK_LOCK, temp-index operations
 * (read-tree, add, write-tree, diff --cached) won't hold the main lock.
 * On non-GVFS repos this env var is simply ignored.
 */
export function buildTempIndexEnv(indexFile: string): Record<string, string> {
	return {
		GIT_INDEX_FILE: indexFile,
		COMMAND_HOOK_LOCK: '1',
	};
}

/**
 * Get the list of changed file paths from a repository's change tracker.
 * Returns paths relative to the repository root, suitable for use with
 * `--pathspec-from-file`. Includes both sides of renames so the deletion
 * of the old path is staged.
 *
 * Background: We use the VS Code git extension's already-computed change state
 * (repository.changes) rather than running `git status --porcelain` ourselves,
 * because (a) the git extension already runs status efficiently (and uses
 * GVFS-optimized code paths), and (b) gitService.exec() trims stdout which
 * corrupts porcelain v1 output (leading spaces in the XY status column).
 */
export function getChangedFilePaths(repository: RepoContext): string[] {
	if (!repository.changes) {
		return [];
	}

	const allChanges = [
		...repository.changes.indexChanges,
		...repository.changes.workingTree,
		...repository.changes.untrackedChanges,
		...repository.changes.mergeChanges,
	];

	const seen = new Set<string>();
	const result: string[] = [];
	const rootPath = repository.rootUri.fsPath;

	for (const change of allChanges) {
		const relativePath = path.relative(rootPath, change.uri.fsPath);
		if (relativePath && !seen.has(relativePath)) {
			seen.add(relativePath);
			result.push(relativePath);
		}
		// Include originalUri when it differs, so rename deletions are staged
		if (change.originalUri && change.originalUri.fsPath !== change.uri.fsPath) {
			const origRelativePath = path.relative(rootPath, change.originalUri.fsPath);
			if (origRelativePath && !seen.has(origRelativePath)) {
				seen.add(origRelativePath);
				result.push(origRelativePath);
			}
		}
	}

	return result;
}

/**
 * Stage specific changed files into a temporary index using `--pathspec-from-file`,
 * replacing `git add -A -- .` which scans the entire directory tree.
 *
 * Performance: In GVFS (VFSForGit) repos, `git add -A -- .` hydrates every
 * directory to enumerate all files, taking >10 minutes on large repos. By staging
 * only the files that actually changed (as reported by the git extension's status),
 * this drops to ~0.5 seconds. On non-GVFS repos the behavior is identical.
 *
 * We write paths to a temp file and use `--pathspec-from-file` rather than passing
 * files as command-line arguments to avoid OS command-line length limits, and because
 * gitService.exec() uses execFile which doesn't support stdin piping.
 *
 * @param pathspecFile Temp file path to write the pathspec list into. Caller
 *   is responsible for cleanup of the parent directory.
 */
export async function stageChangedFiles(
	gitService: IGitService,
	repositoryUri: Uri,
	changedFiles: string[],
	env: Record<string, string>,
	pathspecFile: string,
): Promise<void> {
	if (changedFiles.length === 0) {
		return;
	}
	await fs.writeFile(pathspecFile, changedFiles.join('\n'), 'utf8');
	await gitService.exec(repositoryUri, ['add', '-A', '--pathspec-from-file=' + pathspecFile], env);
}

// Cache for GVFS detection per repository root
const gvfsCache = new Map<string, boolean>();

/**
 * Detect whether a repository uses GVFS (VFSForGit) by checking for the
 * `core.virtualfilesystem` git config setting. Results are cached per
 * repository root for the lifetime of the extension.
 *
 * This follows the same detection pattern used in repoInfoTelemetry.ts:
 * any non-empty value for core.virtualfilesystem means VFS is active
 * (the value is a path to a hook script).
 */
export async function isGvfsRepository(
	gitService: IGitService,
	repositoryUri: Uri,
): Promise<boolean> {
	const key = repositoryUri.toString();
	const cached = gvfsCache.get(key);
	if (cached !== undefined) {
		return cached;
	}

	try {
		// Any non-empty value means VFS is active (the value is a path to a hook script)
		const value = await gitService.exec(repositoryUri, ['config', '--get', 'core.virtualfilesystem']);
		const isGvfs = value.length > 0;
		gvfsCache.set(key, isGvfs);
		return isGvfs;
	} catch {
		// git config --get exits non-zero when the key is absent
		gvfsCache.set(key, false);
		return false;
	}
}
