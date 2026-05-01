/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IChatSessionMetadataStore, StoredModeInstructions } from '../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { getWorkingDirectory, isIsolationEnabled, IWorkspaceInfo } from '../common/workspaceInfo';
import { IPullRequestDetectionService } from './pullRequestDetectionService';
import { clearChangesCacheForAffectedSessions } from './chatSessionRepositoryTracker';

export interface ISessionRequestLifecycle {
	readonly _serviceBrand: undefined;

	/**
	 * Begin tracking a request for a session. Creates a baseline checkpoint
	 * if this is the first request in the session. Records request details
	 * (agent, mode instructions) in the metadata store.
	 */
	startRequest(sessionId: string, request: vscode.ChatRequest, isFirstRequest: boolean, workspace: IWorkspaceInfo, agentName?: string): Promise<void>;

	/**
	 * Finalize a request: commit worktree changes, create checkpoints, detect
	 * pull requests, and remove the request from tracking. Defers completion
	 * work until the last in-flight request for a session completes (to support
	 * steering).
	 */
	endRequest(sessionId: string, request: vscode.ChatRequest, session: SessionCompletionInfo, token: vscode.CancellationToken): Promise<void>;
}

export interface SessionCompletionInfo {
	readonly status: vscode.ChatSessionStatus | undefined;
	readonly workspace: IWorkspaceInfo;
	readonly createdPullRequestUrl: string | undefined;
}

export const ISessionRequestLifecycle = createServiceIdentifier<ISessionRequestLifecycle>('ISessionRequestLifecycle');

export class SessionRequestLifecycle extends Disposable implements ISessionRequestLifecycle {
	declare readonly _serviceBrand: undefined;

	/**
	 * Tracks in-flight requests per session so we can coordinate worktree
	 * commit / PR handling and cleanup.
	 *
	 * We generally cannot have parallel requests for the same session, but when
	 * steering is involved there can be multiple requests in flight for a
	 * single session (the original request continues running while steering
	 * requests are processed). This map records all active requests for each
	 * session so that any worktree-related actions are deferred until the last
	 * in-flight request for that session has completed.
	 */
	private readonly pendingRequestBySession = new Map<string, Set<vscode.ChatRequest>>();

	constructor(
		@IChatSessionWorktreeService private readonly worktreeService: IChatSessionWorktreeService,
		@IChatSessionWorktreeCheckpointService private readonly checkpointService: IChatSessionWorktreeCheckpointService,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IPullRequestDetectionService private readonly prDetectionService: IPullRequestDetectionService,
		@IChatSessionMetadataStore private readonly metadataStore: IChatSessionMetadataStore,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async startRequest(sessionId: string, request: vscode.ChatRequest, isFirstRequest: boolean, workspace: IWorkspaceInfo, agentName?: string): Promise<void> {
		if (isFirstRequest) {
			if (workspace.worktreeProperties) {
				void this.worktreeService.setWorktreeProperties(sessionId, workspace.worktreeProperties);
			}
			const workingDirectory = getWorkingDirectory(workspace);
			if (workingDirectory && !isIsolationEnabled(workspace)) {
				void this.workspaceFolderService.trackSessionWorkspaceFolder(sessionId, workingDirectory.fsPath, workspace.repositoryProperties);
			}
		}

		const modeInstructions: StoredModeInstructions | undefined = request.modeInstructions2 ? {
			uri: request.modeInstructions2.uri?.toString(),
			name: request.modeInstructions2.name,
			content: request.modeInstructions2.content,
			metadata: request.modeInstructions2.metadata,
			isBuiltin: request.modeInstructions2.isBuiltin,
		} : undefined;
		this.metadataStore.updateRequestDetails(sessionId, [{ vscodeRequestId: request.id, modeInstructions }]).catch(ex => this.logService.error(ex, 'Failed to update request details'));

		const requests = this.pendingRequestBySession.get(sessionId) ?? new Set<vscode.ChatRequest>();
		requests.add(request);
		this.pendingRequestBySession.set(sessionId, requests);

		if (isFirstRequest) {
			await this.checkpointService.handleRequest(sessionId);
		}
	}

	async endRequest(sessionId: string, request: vscode.ChatRequest, session: SessionCompletionInfo, token: vscode.CancellationToken): Promise<void> {
		const pendingRequests = this.pendingRequestBySession.get(sessionId);
		if (pendingRequests && pendingRequests.size > 1) {
			// We still have pending requests for this session, which means the user has done some steering.
			// Wait for all requests to complete, the last request to complete will handle the commit.
			pendingRequests.delete(request);
			return;
		}

		if (token.isCancellationRequested) {
			this.untrackRequest(sessionId, request);
			return;
		}

		try {
			if (session.status === vscode.ChatSessionStatus.Completed) {
				const workingDirectory = getWorkingDirectory(session.workspace);
				if (isIsolationEnabled(session.workspace)) {
					// When isolation is enabled and we are using a git worktree, so we commit
					// all the changes in the worktree directory when the session is completed.
					// Note that if the worktree supports checkpoints, then the commit will be
					// done in the checkpoint so that users can easily see the changes made in
					// the worktree and also revert back if needed.
					await this.worktreeService.handleRequestCompleted(sessionId);
				} else if (workingDirectory) {
					// When isolation is not enabled, we are operating in the workspace directly,
					// so we stage all the changes in the workspace directory when the session is
					// completed
					await this.workspaceFolderService.handleRequestCompleted(sessionId);
				}

				// Create checkpoint - we create a checkpoint for the worktree changes so that users
				// can easily see the changes made in the worktree and also revert back if needed. This
				// is used if worktree isolation is enabled, and auto-commit is disabled or workspace
				// isolation is enabled.
				await this.checkpointService.handleRequestCompleted(sessionId, request.id);

				// Clear the changes (diff) cache for sessions associated with the same folder.
				if (workingDirectory) {
					void clearChangesCacheForAffectedSessions(workingDirectory, [sessionId], this.logService, this.metadataStore, this.workspaceFolderService, this.worktreeService).catch(ex => this.logService.error(ex, 'Failed to clear changes cache after request completion'));
				}
			}

			this.prDetectionService.handlePullRequestCreated(sessionId, session.createdPullRequestUrl);
		} finally {
			this.untrackRequest(sessionId, request);
		}
	}

	private untrackRequest(sessionId: string, request: vscode.ChatRequest): void {
		const requests = this.pendingRequestBySession.get(sessionId);
		if (requests) {
			requests.delete(request);
			if (requests.size === 0) {
				this.pendingRequestBySession.delete(sessionId);
			}
		}
	}
}
