/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { RepositoryProperties } from './chatSessionMetadataStore';
import { ChatSessionWorktreeProperties } from './chatSessionWorktreeService';

export interface IWorkspaceInfo {
	/**
	 * The folder URI selected for this session.
	 * This could be a workspace folder or a git repository root.
	 */
	readonly folder: vscode.Uri | undefined;

	/**
	 * The git repository root URI if the selected folder contains a git repository.
	 * `undefined` if the folder is not a git repository.
	 */
	readonly repository: vscode.Uri | undefined;

	/**
	 * The git repository properties associated with this session.
	 */
	readonly repositoryProperties?: RepositoryProperties;

	/**
	 * The worktree path if a worktree was created for this session.
	 * `undefined` if no worktree exists (e.g., plain folder or worktree creation failed).
	 */
	readonly worktree: vscode.Uri | undefined;

	/**
	 * The worktree properties associated with this session.
	 */
	readonly worktreeProperties: ChatSessionWorktreeProperties | undefined;
}

export function getWorkingDirectory(workspaceInfo: IWorkspaceInfo): vscode.Uri | undefined {
	// Give the folder higher priority over repository, as the user may have selected the folder directly,
	// & if we don't create a worktree, then the folder is the working directory.
	return workspaceInfo.worktree ?? workspaceInfo.folder ?? workspaceInfo.repository;
}

export function isIsolationEnabled(workspaceInfo: IWorkspaceInfo): boolean {
	return !!workspaceInfo.worktreeProperties;
}

export function emptyWorkspaceInfo(): IWorkspaceInfo {
	return {
		folder: undefined,
		repository: undefined,
		repositoryProperties: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
	};
}

/**
 * Given a file URI, finds which workspace (primary or additional) owns it.
 * Returns the matching IWorkspaceInfo or undefined if no match.
 */
export function findOwningWorkspace(
	file: vscode.Uri,
	primaryWorkspace: IWorkspaceInfo,
	additionalWorkspaces: IWorkspaceInfo[]
): IWorkspaceInfo | undefined {
	for (const ws of [primaryWorkspace, ...additionalWorkspaces]) {
		const wd = getWorkingDirectory(ws);
		if (wd && extUriBiasedIgnorePathCase.isEqualOrParent(file, wd)) {
			return ws;
		}
		if (ws.folder && extUriBiasedIgnorePathCase.isEqualOrParent(file, ws.folder)) {
			return ws;
		}
		if (ws.worktree && ws.repository && extUriBiasedIgnorePathCase.isEqualOrParent(file, ws.repository)) {
			return ws;
		}
	}
	return undefined;
}
