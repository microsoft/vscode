/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { basename, joinPath, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { isAbsolute, dirname } from '../../../../../../base/common/path.js';
import { isWindows } from '../../../../../../base/common/platform.js';

/**
 * Resolve a file path to an absolute URI
 * Handles both absolute and relative paths
 * Ensures the path is within the workspace for security
 */
export function resolveFilePath(
	path: string,
	workspaceContextService: IWorkspaceContextService
): URI {
	const workspace = workspaceContextService.getWorkspace();

	// If path is absolute, verify it's within workspace
	if (isAbsolute(path)) {
		const uri = URI.file(path);
		const pathDir = dirname(path);

		// Check if path points to root filesystem (like /pp2.tex) - this is likely a mistake
		// On Unix, root is "/", on Windows it's "C:\" etc.
		if (pathDir === '/' || pathDir === '\\' || (isWindows && /^[A-Z]:\\?$/.test(pathDir))) {
			if (workspace.folders.length > 0) {
				// Extract just the filename
				return joinPath(workspace.folders[0].uri, basename(uri));
			}
		}

		// Verify the absolute path is within a workspace folder
		if (workspace.folders.length > 0) {
			for (const folder of workspace.folders) {
				if (isEqualOrParent(uri, folder.uri)) {
					return uri;
				}
			}

			// Path is absolute but outside workspace - treat as relative
			return joinPath(workspace.folders[0].uri, basename(uri));
		}

		// No workspace, use absolute path as-is (may fail)
		return uri;
	}

	// Path is relative - resolve relative to workspace folders
	if (workspace.folders.length > 0) {
		// Use the first workspace folder (or could use the active one)
		return joinPath(workspace.folders[0].uri, path);
	}

	// Fallback: treat as absolute (may fail, but at least we try)
	return URI.file(path);
}

