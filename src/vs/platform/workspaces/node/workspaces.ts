/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStoredWorkspaceFolder, isRawFileWorkspaceFolder, IStoredWorkspace, isStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { isAbsolute, relative, posix, resolve } from 'path';
import { normalize, isEqualOrParent } from 'vs/base/common/paths';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { URI } from 'vs/base/common/uri';
import { fsPath, dirname } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import * as jsonEdit from 'vs/base/common/jsonEdit';
import * as json from 'vs/base/common/json';

const SLASH = '/';

/**
 * Given the absolute path to a folder, massage it in a way that it fits
 * into an existing set of workspace folders of a workspace.
 *
 * @param absoluteFolderPath the absolute path of a workspace folder
 * @param targetConfigFolder the folder where the workspace is living in
 * @param existingFolders a set of existing folders of the workspace
 */
export function massageFolderPathForWorkspace(absoluteFolderPath: string, targetConfigFolderURI: URI, existingFolders: IStoredWorkspaceFolder[]): string {

	if (targetConfigFolderURI.scheme === Schemas.file) {
		const targetFolderPath = fsPath(targetConfigFolderURI);
		// Convert path to relative path if the target config folder
		// is a parent of the path.
		if (isEqualOrParent(absoluteFolderPath, targetFolderPath, !isLinux)) {
			absoluteFolderPath = relative(targetFolderPath, absoluteFolderPath) || '.';
		}

		// Windows gets special treatment:
		// - normalize all paths to get nice casing of drive letters
		// - convert to slashes if we want to use slashes for paths
		if (isWindows) {
			if (isAbsolute(absoluteFolderPath)) {
				if (shouldUseSlashForPath(existingFolders)) {
					absoluteFolderPath = normalize(absoluteFolderPath, false /* do not use OS path separator */);
				}

				absoluteFolderPath = normalizeDriveLetter(absoluteFolderPath);
			} else if (shouldUseSlashForPath(existingFolders)) {
				absoluteFolderPath = absoluteFolderPath.replace(/[\\]/g, SLASH);
			}
		}
	} else {
		if (isEqualOrParent(absoluteFolderPath, targetConfigFolderURI.path)) {
			absoluteFolderPath = posix.relative(absoluteFolderPath, targetConfigFolderURI.path) || '.';
		}
	}

	return absoluteFolderPath;
}

/**
 * Rewrites the content of a workspace file to be saved at a new location.
 * Throws an exception if file is not a valid workspace file
 */
export function rewriteWorkspaceFileForNewLocation(rawWorkspaceContents: string, configPathURI: URI, targetConfigPathURI: URI) {
	let storedWorkspace = doParseStoredWorkspace(configPathURI, rawWorkspaceContents);

	const sourceConfigFolder = dirname(configPathURI)!;
	const targetConfigFolder = dirname(targetConfigPathURI)!;

	// Rewrite absolute paths to relative paths if the target workspace folder
	// is a parent of the location of the workspace file itself. Otherwise keep
	// using absolute paths.
	for (const folder of storedWorkspace.folders) {
		if (isRawFileWorkspaceFolder(folder)) {
			if (sourceConfigFolder.scheme === Schemas.file) {
				if (!isAbsolute(folder.path)) {
					folder.path = resolve(fsPath(sourceConfigFolder), folder.path); // relative paths get resolved against the workspace location
				}
				folder.path = massageFolderPathForWorkspace(folder.path, targetConfigFolder, storedWorkspace.folders);
			}
		}
	}

	// Preserve as much of the existing workspace as possible by using jsonEdit
	// and only changing the folders portion.
	let newRawWorkspaceContents = rawWorkspaceContents;
	const edits = jsonEdit.setProperty(rawWorkspaceContents, ['folders'], storedWorkspace.folders, { insertSpaces: false, tabSize: 4, eol: (isLinux || isMacintosh) ? '\n' : '\r\n' });
	edits.forEach(edit => {
		newRawWorkspaceContents = jsonEdit.applyEdit(rawWorkspaceContents, edit);
	});
	return newRawWorkspaceContents;
}

function doParseStoredWorkspace(path: URI, contents: string): IStoredWorkspace {

	// Parse workspace file
	let storedWorkspace: IStoredWorkspace = json.parse(contents); // use fault tolerant parser

	// Filter out folders which do not have a path or uri set
	if (Array.isArray(storedWorkspace.folders)) {
		storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
	}

	// Validate
	if (!Array.isArray(storedWorkspace.folders)) {
		throw new Error(`${path} looks like an invalid workspace file.`);
	}

	return storedWorkspace;
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
