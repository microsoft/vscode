/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { IWorkspaceInfo } from './workspaceInfo';

/**
 * The isolation mode for a chat session.
 * - `worktree`: Creates an isolated git worktree for the session.
 * - `workspace`: Works directly in the workspace directory without isolation.
 * Do not change these values, they are stored in global storage.
 */
export enum IsolationMode {
	Workspace = 'workspace',
	Worktree = 'worktree',
}


/**
 * Options for initializing a folder/repository for a session.
 */
export interface InitializeFolderRepositoryOptions {
	readonly branch?: string;
	readonly folder: vscode.Uri | undefined;
	readonly isolation?: IsolationMode;
	readonly stream: vscode.ChatResponseStream;
	readonly toolInvocationToken: vscode.ChatParticipantToolToken;
	readonly newBranch?: Promise<string | undefined>;
}

/**
 * Result of folder/repository resolution for a chat session.
 */
export interface FolderRepositoryInfo extends IWorkspaceInfo {
	/**
	 * Trust status of the folder/repository.
	 * - `true`: The folder/repository is trusted
	 * - `false`: Trust was requested but denied by user
	 * - `undefined`: Trust was not requested (options.promptForTrust was not set)
	 */
	readonly trusted: boolean | undefined;

	/**
	 * Whether the user cancelled the operation (e.g., cancelled uncommitted changes prompt).
	 */
	readonly cancelled?: boolean;
}

/**
 * Options for getting folder/repository information.
 */
export interface GetFolderRepositoryOptions {
	/**
	 * If true, prompts the user for trust if the folder is not already trusted.
	 */
	readonly promptForTrust: true;

	readonly stream: vscode.ChatResponseStream;
}

/**
 * MRU (Most Recently Used) folder/repository entry.
 */
export interface FolderRepositoryMRUEntry {
	/**
	 * The folder URI.
	 */
	readonly folder: vscode.Uri;

	/**
	 * The repository URI if this is a git repository, undefined for plain folders.
	 */
	readonly repository: vscode.Uri | undefined;

	/**
	 * Timestamp of last access (milliseconds since epoch).
	 */
	readonly lastAccessed: number;
}

export const IFolderRepositoryManager = createServiceIdentifier<IFolderRepositoryManager>('IFolderRepositoryManager');

export interface IFolderRepositoryManager {
	readonly _serviceBrand: undefined;

	/**
	 * @deprecated
	 */
	setNewSessionFolder(sessionId: string, folderUri: vscode.Uri): void;

	/**
	 * Delete the tracked folder for an untitled session.
	 */
	deleteNewSessionFolder(sessionId: string): void;

	/**
	 * Get folder/repository/worktree/trust information for a session.
	 *
	 * This method resolves folder information using the following priority:
	 * 1. Worktree properties (if session has a worktree)
	 * 2. Session workspace folder (if tracked)
	 * 3. CLI session working directory (from session metadata)
	 *
	 * Trust checking is performed on the repository path (if git repo) or folder path
	 * (if plain folder). Worktree paths are NOT used for trust checking as they inherit
	 * trust from their parent repository.
	 */
	getFolderRepository(
		sessionId: string,
		options: GetFolderRepositoryOptions | undefined,
		token: vscode.CancellationToken
	): Promise<FolderRepositoryInfo>;

	/**
	 * Initialize folder/repository for a session, creating a worktree if applicable.
	 *
	 * This method should be called when starting a request for an untitled session.
	 * It will:
	 * 1. Get the selected folder from memory or workspace folder service
	 * 2. Check if the folder contains a git repository
	 * 3. Verify trust on the repository/folder
	 * 4. Check for uncommitted changes and prompt the user via the provided callback
	 * 5. Create a worktree if a git repo is found
	 * 6. Migrate uncommitted changes to worktree if requested
	 */
	initializeFolderRepository(
		sessionId: string | undefined,
		options: InitializeFolderRepositoryOptions,
		token: vscode.CancellationToken
	): Promise<FolderRepositoryInfo>;

	/**
	 * Initialize all folders for a multi-root session as a batch.
	 *
	 * Unlike calling `initializeFolderRepository` per folder, this method:
	 * 1. Resolves all folder/repo info in one pass
	 * 2. Verifies trust for all folders together
	 * 3. Collects uncommitted changes across ALL git repos
	 * 4. Shows ONE combined prompt listing all repos with uncommitted changes
	 * 5. Applies the same action (move/copy/skip/cancel) to all repos
	 * 6. Creates worktrees for all git repos in parallel
	 * 7. Migrates changes to all worktrees with the same action
	 */
	initializeMultiRootFolderRepositories(
		sessionId: string,
		primaryFolder: vscode.Uri,
		additionalFolders: vscode.Uri[],
		options: InitializeFolderRepositoryOptions,
		token: vscode.CancellationToken
	): Promise<{ primary: FolderRepositoryInfo; additional: FolderRepositoryInfo[] }>;

	/**
	 * Get repository information for a folder.
	 *
	 * Resolves whether the folder contains a git repository and returns
	 * the repository URI and HEAD branch name.
	 *
	 * @param folder The folder URI to check
	 * @param token Cancellation token
	 * @returns Repository URI and HEAD branch name
	 */
	getRepositoryInfo(
		folder: vscode.Uri,
		token: vscode.CancellationToken
	): Promise<{ repository: vscode.Uri | undefined; headBranchName: string | undefined }>;

	/**
	 * @deprecated
	 * Get list of most recently used folders and repositories.
	 *
	 * This is used for empty workspaces to show a list of previously used
	 * folders/repos in the folder selection dropdown.
	 *
	 * @returns Array of MRU entries sorted by last accessed time (newest first),
	 *          limited to 10 items, with non-existent paths filtered out
	 */
	getFolderMRU(): Promise<FolderRepositoryMRUEntry[]>;
}
