/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IClaudeWorkspaceFolderService = createServiceIdentifier<IClaudeWorkspaceFolderService>('IClaudeWorkspaceFolderService');

/**
 * Service for computing and caching workspace file changes for Claude chat sessions.
 */
export interface IClaudeWorkspaceFolderService {
	readonly _serviceBrand: undefined;
	/**
	 * Computes file changes for a workspace directory by diffing the current branch against a base branch.
	 * Results are cached per unique (cwd, gitBranch, gitBaseBranch) combination.
	 *
	 * @param cwd The working directory of the session.
	 * @param gitBranch The current git branch name, or `undefined` if unknown.
	 * @param gitBaseBranch The base branch to diff against, or `undefined` to diff against HEAD.
	 * @param forceRefresh When `true`, bypasses the cache and recomputes changes.
	 */
	getWorkspaceChanges(cwd: string, gitBranch: string | undefined, gitBaseBranch: string | undefined, forceRefresh?: boolean): Promise<vscode.ChatSessionChangedFile[]>;
}
