/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { RepositoryProperties, WorkspaceFolderEntry } from './chatSessionMetadataStore';
import { ChatSessionWorktreeFile } from './chatSessionWorktreeService';

export const IChatSessionWorkspaceFolderService = createServiceIdentifier<IChatSessionWorkspaceFolderService>('IChatSessionWorkspaceFolderService');

/**
 * Service for tracking workspace folder selections for chat sessions.
 * This is used in multi-root workspaces where some folders may not have git repositories.
 * In such cases, we track the workspace folder URI instead of a git repository.
 */
export interface IChatSessionWorkspaceFolderService {
	readonly _serviceBrand: undefined;
	deleteTrackedWorkspaceFolder(sessionId: string): Promise<void>;
	/**
	 * Track workspace folder selection for a session (for folders without git repos in multi-root workspaces)
	 */
	trackSessionWorkspaceFolder(sessionId: string, workspaceFolderUri: string, repositoryProperties?: RepositoryProperties): Promise<void>;

	/**
	 * Get the workspace folder associated with a session (if a workspace folder without git repo was selected)
	 */
	getSessionWorkspaceFolder(sessionId: string): Promise<vscode.Uri | undefined>;

	/**
	 * Get the workspace folder entry associated with a session (if a workspace folder without git repo was selected)
	 */
	getSessionWorkspaceFolderEntry(sessionId: string): Promise<WorkspaceFolderEntry | undefined>;

	/**
	 * Get the repository properties associated with a session.
	 */
	getRepositoryProperties(sessionId: string): Promise<RepositoryProperties | undefined>;

	/**
	 * Handle the completion of a request for a session.
	 */
	handleRequestCompleted(sessionId: string): Promise<void>;

	/**
	 * Get the changes in the workspace folder for a session.
	 */
	getWorkspaceChanges(sessionId: string): Promise<readonly ChatSessionWorktreeFile[] | undefined>;

	/**
	 * Clear the cached changes for a session.
	 * Returns the affected session IDs.
	 */
	clearWorkspaceChanges(sessionId: string): string[];

	/**
	 * Clear cached changes for all sessions associated with a workspace folder.
	 * Returns the affected session IDs.
	 */
	clearWorkspaceChanges(folderUri: vscode.Uri): string[];

	hasCachedChanges(sessionId: string): Promise<boolean>;
}
