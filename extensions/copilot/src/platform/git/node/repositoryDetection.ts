/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lstat, realpath } from 'fs/promises';
import { getCaseInsensitive } from '../../../util/vs/base/common/objects';
import { dirname, isEqual, joinPath } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Whether git might find a repository root for a folder. A `false` answer lets the caller skip
 * starting git for a folder outside any repository.
 *
 * Git searches upwards from the folder's real path for a `.git` entry, which is either a directory
 * or the file that linked worktrees and submodules use. It also accepts a folder that is itself a
 * git directory, which holds a `HEAD` entry and can name a working tree with `core.worktree`.
 * Unless `GIT_DIR` or `GIT_WORK_TREE` names a repository, a folder with neither entry at or above
 * it has no repository root.
 *
 * Answers `true` when unsure, because a wrong `false` silently skips whatever depends on the
 * repository, such as content exclusion.
 */
export async function mayBeInRepository(folder: URI, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
	if (getCaseInsensitive(env, 'GIT_DIR') !== undefined || getCaseInsensitive(env, 'GIT_WORK_TREE') !== undefined) {
		return true;
	}

	let current: URI;
	try {
		current = URI.file(await realpath(folder.fsPath));
	} catch {
		return true;
	}

	while (true) {
		if (await hasEntry(joinPath(current, '.git')) || await hasEntry(joinPath(current, 'HEAD'))) {
			return true;
		}
		const parent = dirname(current);
		if (isEqual(parent, current)) {
			return false;
		}
		current = parent;
	}
}

/** Whether `resource` exists. Any error other than "not found" counts as yes, so git decides. */
async function hasEntry(resource: URI): Promise<boolean> {
	try {
		await lstat(resource.fsPath);
		return true;
	} catch (error) {
		return error.code !== 'ENOENT' && error.code !== 'ENOTDIR';
	}
}
