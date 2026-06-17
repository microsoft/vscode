/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { URI } from '../../../../util/vs/base/common/uri';
import { IFolderRepositoryManager } from '../../../chatSessions/common/folderRepositoryManager';

// #region Slug Computation

/**
 * Compute the workspace slug from a folder URI.
 * Matches the Claude Code slug format.
 *
 * @example
 * // Windows: drive letter is uppercased, path separators become hyphens
 * '/c:/Users/test/project' → 'C--Users-test-project'
 *
 * // macOS/Linux: leading slash becomes hyphen, path separators become hyphens
 * '/Users/test/project' → '-Users-test-project'
 */
export function computeFolderSlug(folderUri: URI): string {
	return folderUri.path
		.replace(/^\/([a-z]):/i, (_, driveLetter: string) => driveLetter.toUpperCase() + '-')
		.replace(/[\/ .]/g, '-');
}

// #endregion

// #region Project Folder Discovery

export interface ProjectFolder {
	readonly slug: string;
	readonly folderUri: URI;
}

/**
 * Get the project directory slugs to scan for sessions, along with their
 * original folder URIs (needed for badge display).
 *
 * - Single-root: slug for that one folder
 * - Multi-root: slug for every workspace folder
 * - Empty workspace: slug for every folder known to the folder repository manager
 */
export async function getProjectFolders(
	workspace: IWorkspaceService,
	folderRepositoryManager: IFolderRepositoryManager
): Promise<ProjectFolder[]> {
	const folders = workspace.getWorkspaceFolders();

	if (folders.length > 0) {
		return folders.map(folder => ({ slug: computeFolderSlug(folder), folderUri: folder }));
	}

	// Empty workspace: use all known folders from the folder repository manager
	const mruEntries = await folderRepositoryManager.getFolderMRU();
	if (mruEntries.length > 0) {
		return mruEntries.map(entry => ({ slug: computeFolderSlug(entry.folder), folderUri: entry.folder }));
	}

	return [];
}

// #endregion
