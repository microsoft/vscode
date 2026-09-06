/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { Uri } from 'vscode';
import { Change, DiffChange } from '../vscode/git';
import { RepoContext } from '../common/gitService';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { isEqual, relativePath } from '../../../util/vs/base/common/resources';

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

export function getUncommittedFilePaths(repository: RepoContext): string[] {
	const resources = new ResourceSet();

	const allChanges = [
		...repository.changes?.indexChanges ?? [],
		...repository.changes?.workingTree ?? [],
		...repository.changes?.untrackedChanges ?? []
	];

	for (const change of allChanges) {
		resources.add(change.uri);
		if (
			change.originalUri &&
			!isEqual(change.uri, change.originalUri)
		) {
			resources.add(change.originalUri);
		}
	}

	const relativePaths = coalesce(Array.from(resources)
		.map(uri => relativePath(repository.rootUri, uri)));

	// Git expects forward slashes even on Windows
	return relativePaths.map(p => p.replace(/\\/g, '/'));
}

export function buildTempIndexEnv(repository: RepoContext, indexFile: string): Record<string, string> {
	if (!repository.isUsingVirtualFileSystem) {
		return { GIT_INDEX_FILE: indexFile };
	}

	// In GVFS repos, the command hook acquires a lock that blocks file writes  while
	// any git command runs. By setting COMMAND_HOOK_LOCK, temp index operations (ex:
	// add, read-tree, write-tree, diff --cached) won't hold the main lock.
	return {
		COMMAND_HOOK_LOCK: '1',
		GIT_INDEX_FILE: indexFile
	};
}
