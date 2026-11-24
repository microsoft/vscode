/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, isEqual, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../../../platform/files/common/files.js';

/**
 * Walks up from `folder` to the root of the git repository that contains it: the nearest folder
 * with a `.git` entry (a folder, or a file for worktrees and submodules).
 *
 * Returns `undefined` without looking further when the next folder up is the filesystem root, the
 * user's home folder, or a folder for which `stopAt` returns `true`, and when a `.git` entry can't
 * be read for a reason other than it not existing. The home folder is only checked when the walk
 * starts there, so a dotfiles repository in it doesn't contain every folder in the home folder.
 */
export async function findRepositoryRoot(fileService: Pick<IFileService, 'stat'>, folder: URI, userHome: URI, stopAt?: (folder: URI) => boolean): Promise<URI | undefined> {
	let current = folder;
	while (true) {
		try {
			const stat = await fileService.stat(joinPath(current, '.git'));
			if (stat.isDirectory || stat.isFile) {
				return current;
			}
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				return undefined;
			}
		}
		const parent = dirname(current);
		if (isEqual(current, parent) || current.path === '/' || isEqual(userHome, parent) || stopAt?.(parent)) {
			return undefined;
		}
		current = parent;
	}
}
