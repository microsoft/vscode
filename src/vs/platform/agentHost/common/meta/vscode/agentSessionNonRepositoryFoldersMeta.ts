/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code-owned session metadata listing the folders of a session of several folders, other than its first, that the
 * host read and found not to be Git repositories, by working-directory key. A folder absent from it has not been read
 * yet, or is a repository. Absent metadata, from another or an older host, means nothing is known.
 */
export const VSCODE_SESSION_NON_REPOSITORY_FOLDERS_META_KEY = 'vscode.nonRepositoryFolders';

const MAX_FOLDERS = 64;

/** Reads the folder keys, dropping a malformed value entirely. */
export function readSessionNonRepositoryFolders(meta: Record<string, unknown> | undefined): readonly string[] {
	const value = meta?.[VSCODE_SESSION_NON_REPOSITORY_FOLDERS_META_KEY];
	return Array.isArray(value) && value.length <= MAX_FOLDERS && value.every(folder => typeof folder === 'string' && folder.length > 0) ? value : [];
}

/** Returns `meta` listing `folders`, without the slot when there are none; preserves every other entry. */
export function withSessionNonRepositoryFolders(meta: Record<string, unknown> | undefined, folders: readonly string[]): Record<string, unknown> | undefined {
	const next: Record<string, unknown> = { ...meta };
	if (folders.length > 0) {
		next[VSCODE_SESSION_NON_REPOSITORY_FOLDERS_META_KEY] = [...folders];
	} else {
		delete next[VSCODE_SESSION_NON_REPOSITORY_FOLDERS_META_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
