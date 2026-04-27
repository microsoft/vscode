/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { ChatSessionWorktreeProperties } from './chatSessionWorktreeService';
import type { IWorkspaceInfo } from './workspaceInfo';

export interface WorkspaceFolderEntry {
	readonly folderPath: string;
	readonly timestamp: number;
}

export interface RepositoryProperties {
	readonly repositoryPath: string;
	readonly branchName?: string;
	readonly baseBranchName?: string;
	readonly baseCommit?: string;
	readonly upstreamBranchName?: string;
	readonly mergeBaseCommit?: string;
	readonly hasGitHubRemote?: boolean;
	readonly incomingChanges?: number;
	readonly outgoingChanges?: number;
	readonly uncommittedChanges?: number;
}

/**
 * Serializable subset of ChatRequestModeInstructions (excludes toolReferences).
 */
export interface StoredModeInstructions {
	readonly uri?: string;
	readonly name: string;
	readonly content: string;
	readonly metadata?: Record<string, boolean | string | number>;
	readonly isBuiltin?: boolean;
}

export interface RequestDetails {
	/** VS Code request ID — always available, serves as primary key. */
	readonly vscodeRequestId: string;
	/** Copilot SDK request ID — may not be available until the request completes. */
	copilotRequestId?: string;
	/**
	 * Map of tool call id to VS Code edit id, used to correlate edits to the tool call that created them.
	 */
	toolIdEditMap: { [copilotToolId: string]: string };

	/**
	 * @deprecated This field is deprecated in favor of modeInstructions.
	 * Agent used for this request.
	 * */
	agentId?: string;

	/** Mode instructions for this request (excluding toolReferences). */
	modeInstructions?: StoredModeInstructions;

	/** Checkpoint reference for this request (primary workspace). */
	checkpointRef?: string;

	/** Checkpoint references for additional workspaces, keyed by folder fsPath. */
	additionalCheckpointRefs?: { [folderPath: string]: string };
}

export interface ChatSessionMetadataFile {
	repositoryProperties?: RepositoryProperties;
	worktreeProperties?: ChatSessionWorktreeProperties;
	workspaceFolder?: WorkspaceFolderEntry;
	additionalWorkspaces?: {
		worktreeProperties?: ChatSessionWorktreeProperties;
		workspaceFolder?: WorkspaceFolderEntry;
	}[];
	/**
	 * Whether the session metadata has been written to the Copilot CLI session state directory.
	 */
	writtenToDisc?: boolean;
	/** The first user message sent in the session, used as the session label. */
	firstUserMessage?: string;
	/** Custom title set by the user or generated for the session. */
	customTitle?: string;
	/** The creator of this session. */
	origin?: 'vscode' | 'other';
	/**
	 * The kind of session, which can be used to determine how the session was created and possibly how it should be displayed in the UI.
	 */
	kind?: 'forked' | 'sub-session';
	/**
	 * The ID of the parent session, if this session was forked from another
	 * session or if the session is a child session created from the Agents app.
	 */
	parentSessionId?: string;
	/** Milliseconds since epoch when this metadata was first written. */
	created?: number;
	/** Milliseconds since epoch of the last write. Used for top-N trim sort and cross-process merge. */
	modified?: number;
}

/**
 * One line in `~/.copilot/vscode.session.worktree.jsonl`. Maps a session id
 * to the path of its worktree so folder → session lookups work even when the
 * session has been evicted from the bulk metadata cache.
 */
export interface WorktreeSessionEntry {
	readonly id: string;
	readonly path: string;
	readonly created: number;
}

export const IChatSessionMetadataStore = createServiceIdentifier<IChatSessionMetadataStore>('IChatSessionMetadataStore');

export interface IChatSessionMetadataStore {
	readonly _serviceBrand: undefined;
	getMetadataFileUri(sessionId: string): vscode.Uri;
	deleteSessionMetadata(sessionId: string): Promise<void>;
	storeWorktreeInfo(sessionId: string, properties: ChatSessionWorktreeProperties): Promise<void>;
	storeWorkspaceFolderInfo(sessionId: string, entry: WorkspaceFolderEntry): Promise<void>;
	storeRepositoryProperties(sessionId: string, properties: RepositoryProperties): Promise<void>;
	getRepositoryProperties(sessionId: string): Promise<RepositoryProperties | undefined>;
	getWorktreeProperties(sessionId: string): Promise<ChatSessionWorktreeProperties | undefined>;
	getSessionWorkspaceFolder(sessionId: string): Promise<vscode.Uri | undefined>;
	getSessionWorkspaceFolderEntry(sessionId: string): Promise<WorkspaceFolderEntry | undefined>;
	getAdditionalWorkspaces(sessionId: string): Promise<IWorkspaceInfo[]>;
	setAdditionalWorkspaces(sessionId: string, workspaces: IWorkspaceInfo[]): Promise<void>;
	getSessionFirstUserMessage(sessionId: string): Promise<string | undefined>;
	setSessionFirstUserMessage(sessionId: string, message: string): Promise<void>;
	getCustomTitle(sessionId: string): Promise<string | undefined>;
	setCustomTitle(sessionId: string, title: string): Promise<void>;
	getRequestDetails(sessionId: string): Promise<RequestDetails[]>;
	updateRequestDetails(sessionId: string, details: (Partial<RequestDetails> & { vscodeRequestId: string })[]): Promise<void>;
	getSessionAgent(sessionId: string): Promise<string | undefined>;
	/**
	 * Copy all VS Code-specific metadata (workspace info, request details, etc.) from
	 * an existing session to a newly forked session, overriding the custom title.
	 */
	storeForkedSessionMetadata(sourceSessionId: string, targetSessionId: string, customTitle: string): Promise<void>;
	setSessionOrigin(sessionId: string): Promise<void>;
	getSessionOrigin(sessionId: string): Promise<'vscode' | 'other'>;
	setSessionParentId(sessionId: string, parentSessionId: string): Promise<void>;
	getSessionParentId(sessionId: string): Promise<string | undefined>;
	/**
	 * Re-read the shared bulk metadata file from disk and merge into the in-memory cache.
	 * Wired to the chat-sessions UI refresh action so cross-process writes become visible
	 * on demand. Concurrent calls collapse: at most one in-flight + one pending.
	 */
	refresh(): Promise<void>;
	/**
	 * Returns session IDs whose working directory (worktree path or workspace folder)
	 * matches the given folder URI.
	 */
	getSessionIdsForFolder(folder: vscode.Uri): string[];
	/**
	 * Returns session IDs that have a worktree whose path matches the given folder URI.
	 */
	getWorktreeSessions(folder: vscode.Uri): string[];
}
