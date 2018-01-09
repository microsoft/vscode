/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IStoredWorkspaceFolder, isRawFileWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { isWindows, isLinux } from 'vs/base/common/platform';
import { isAbsolute, relative } from 'path';
import { isEqualOrParent, normalize } from 'vs/base/common/paths';
import { normalizeDriveLetter } from 'vs/base/common/labels';

const SLASH = '/';

/**
 * Given the absolute path to a folder, massage it in a way that it fits
 * into an existing set of workspace folders of a workspace.
 *
 * @param absoluteFolderPath the absolute path of a workspace folder
 * @param targetConfigFolder the folder where the workspace is living in
 * @param existingFolders a set of existing folders of the workspace
 */
export function massageFolderPathForWorkspace(absoluteFolderPath: string, targetConfigFolder: string, existingFolders: IStoredWorkspaceFolder[]): string {
	const useSlashesForPath = shouldUseSlashForPath(existingFolders);

	// Convert path to relative path if the target config folder
	// is a parent of the path.
	if (isEqualOrParent(absoluteFolderPath, targetConfigFolder, !isLinux)) {
		absoluteFolderPath = relative(targetConfigFolder, absoluteFolderPath) || '.';
	}

	// Windows gets special treatment:
	// - normalize all paths to get nice casing of drive letters
	// - convert to slashes if we want to use slashes for paths
	if (isWindows) {
		if (isAbsolute(absoluteFolderPath)) {
			if (useSlashesForPath) {
				absoluteFolderPath = normalize(absoluteFolderPath, false /* do not use OS path separator */);
			}

			absoluteFolderPath = normalizeDriveLetter(absoluteFolderPath);
		} else if (useSlashesForPath) {
			absoluteFolderPath = absoluteFolderPath.replace(/[\\]/g, SLASH);
		}
	}

	return absoluteFolderPath;
}

function shouldUseSlashForPath(storedFolders: IStoredWorkspaceFolder[]): boolean {

	// Determine which path separator to use:
	// - macOS/Linux: slash
	// - Windows: use slash if already used in that file
	let useSlashesForPath = !isWindows;
	if (isWindows) {
		storedFolders.forEach(folder => {
			if (isRawFileWorkspaceFolder(folder) && !useSlashesForPath && folder.path.indexOf(SLASH) >= 0) {
				useSlashesForPath = true;
			}
		});
	}

	return useSlashesForPath;
}
