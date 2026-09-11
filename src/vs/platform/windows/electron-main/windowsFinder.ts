/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Schemas } from '../../../base/common/network.js';
import { resolve } from '../../../base/common/path.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IResolvedWorkspace, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, IWorkspaceIdentifier } from '../../workspace/common/workspace.js';

// Matches paths pointing into a git linked worktree's private metadata
// directory, e.g. `<main-worktree>/.git/worktrees/<name>/COMMIT_EDITMSG`.
// Captures the full path of the worktree's metadata directory itself, i.e.
// everything up to and including `.git/worktrees/<name>`. Accepts both `/`
// and `\` as path separators.
const gitWorktreeFilePathRegex = /^(.*[\\/]\.git[\\/]worktrees[\\/][^\\/]+)[\\/]/;

/**
 * Git linked worktrees store their private per-worktree files (such as
 * `COMMIT_EDITMSG` or `rebase-merge/git-rebase-todo`) inside the *main*
 * worktree's `.git/worktrees/<name>` directory, even though the corresponding
 * working directory lives elsewhere on disk. A plain parent-folder match on
 * such a file's path therefore always resolves to the window that has the
 * main worktree open, never the window with the linked worktree the file
 * actually belongs to.
 *
 * This detects that case and, if the linked worktree is open in one of the
 * candidate windows, returns that window instead. Returns `undefined` when
 * the path is not a git worktree metadata path, or when no candidate window
 * has the corresponding linked worktree open, so callers can fall back to
 * their normal matching logic.
 */
async function findWindowOnGitWorktreeFile(windows: ICodeWindow[], fileUri: URI): Promise<ICodeWindow | undefined> {
	if (fileUri.scheme !== Schemas.file) {
		return undefined;
	}

	const worktreeMatch = gitWorktreeFilePathRegex.exec(fileUri.fsPath);
	if (!worktreeMatch) {
		return undefined;
	}

	// The exact directory the file's worktree metadata lives in, e.g.
	// `/path/to/main/.git/worktrees/linked`. Candidate windows are matched
	// against this full path rather than just the trailing `<name>` segment,
	// so that two unrelated repositories that happen to use the same worktree
	// name (e.g. both named `linked`) cannot be confused with one another.
	const worktreeGitDir = URI.file(worktreeMatch[1]);

	for (const window of windows) {
		const openedFolder = isSingleFolderWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace.uri : undefined;
		if (!openedFolder || openedFolder.scheme !== Schemas.file) {
			continue;
		}

		// A linked worktree's working directory contains a plain-text `.git`
		// *file* (not a directory) of the form `gitdir: /path/to/main/.git/worktrees/<name>`.
		// Reading this will fail (and is safely skipped) for ordinary repositories,
		// where `.git` is a directory, and for folders that are not a git repository at all.
		let gitFileContents: string;
		try {
			gitFileContents = await fs.promises.readFile(URI.joinPath(openedFolder, '.git').fsPath, 'utf8');
		} catch {
			continue;
		}

		const gitDirMatch = /^gitdir:\s*(.+)$/m.exec(gitFileContents);
		if (!gitDirMatch) {
			continue;
		}

		// The pointer is usually absolute, but resolve it relative to the
		// worktree's own folder in case it is ever written as a relative path.
		const resolvedGitDir = URI.file(resolve(openedFolder.fsPath, gitDirMatch[1].trim()));
		if (extUriBiasedIgnorePathCase.isEqual(resolvedGitDir, worktreeGitDir)) {
			return window;
		}
	}

	return undefined;
}

export async function findWindowOnFile(windows: ICodeWindow[], fileUri: URI, localWorkspaceResolver: (workspace: IWorkspaceIdentifier) => Promise<IResolvedWorkspace | undefined>): Promise<ICodeWindow | undefined> {

	// First, check whether the file is a git linked worktree's private metadata
	// file and, if so, prefer the window that has that linked worktree open
	// (see `findWindowOnGitWorktreeFile` for why this needs special handling)
	const gitWorktreeWindow = await findWindowOnGitWorktreeFile(windows, fileUri);
	if (gitWorktreeWindow) {
		return gitWorktreeWindow;
	}

	// Then check for windows with workspaces that have a parent folder of the provided path opened
	for (const window of windows) {
		const workspace = window.openedWorkspace;
		if (isWorkspaceIdentifier(workspace)) {
			const resolvedWorkspace = await localWorkspaceResolver(workspace);

			// resolved workspace: folders are known and can be compared with
			if (resolvedWorkspace) {
				if (resolvedWorkspace.folders.some(folder => extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, folder.uri))) {
					return window;
				}
			}

			// unresolved: can only compare with workspace location
			else {
				if (extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, workspace.configPath)) {
					return window;
				}
			}
		}
	}

	// Then go with single folder windows that are parent of the provided file path
	const singleFolderWindowsOnFilePath = windows.filter(window => isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, window.openedWorkspace.uri));
	if (singleFolderWindowsOnFilePath.length) {
		return singleFolderWindowsOnFilePath.sort((windowA, windowB) => -((windowA.openedWorkspace as ISingleFolderWorkspaceIdentifier).uri.path.length - (windowB.openedWorkspace as ISingleFolderWorkspaceIdentifier).uri.path.length))[0];
	}

	return undefined;
}

export function findWindowOnWorkspaceOrFolder(windows: ICodeWindow[], folderOrWorkspaceConfigUri: URI): ICodeWindow | undefined {

	for (const window of windows) {

		// check for workspace config path
		if (isWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.configPath, folderOrWorkspaceConfigUri)) {
			return window;
		}

		// check for folder path
		if (isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.uri, folderOrWorkspaceConfigUri)) {
			return window;
		}
	}

	return undefined;
}


export function findWindowOnExtensionDevelopmentPath(windows: ICodeWindow[], extensionDevelopmentPaths: string[]): ICodeWindow | undefined {

	const matches = (uriString: string): boolean => {
		return extensionDevelopmentPaths.some(path => extUriBiasedIgnorePathCase.isEqual(URI.file(path), URI.file(uriString)));
	};

	for (const window of windows) {

		// match on extension development path. the path can be one or more paths
		// so we check if any of the paths match on any of the provided ones
		if (window.config?.extensionDevelopmentPath?.some(path => matches(path))) {
			return window;
		}
	}

	return undefined;
}
