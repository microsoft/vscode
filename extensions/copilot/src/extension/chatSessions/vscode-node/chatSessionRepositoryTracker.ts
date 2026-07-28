/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable, DisposableResourceMap, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { ICopilotCLIChatSessionItemProvider } from './copilotCLIChatSessions';
import { IGitService } from '../../../platform/git/common/gitService';
import { IChatSessionMetadataStore } from '../common/chatSessionMetadataStore';

export class ChatSessionRepositoryTracker extends Disposable {
	private readonly repositories = new DisposableResourceMap();

	constructor(
		// This is only required in non-controller code paths.
		private readonly sessionItemProvider: ICopilotCLIChatSessionItemProvider | undefined,
		@IChatSessionWorktreeService private readonly worktreeService: IChatSessionWorktreeService,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@IGitService private readonly gitService: IGitService,
		@ILogService private readonly logService: ILogService,
		@IChatSessionMetadataStore private readonly metadataStore: IChatSessionMetadataStore
	) {
		super();

		// Only track repository changes in the sessions app
		if (vscode.workspace.isAgentSessionsWorkspace) {
			this.logService.trace('[ChatSessionRepositoryTracker][constructor] Initializing workspace folder event handler');
			this._register(vscode.workspace.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));
			this.onDidChangeWorkspaceFolders({ added: vscode.workspace.workspaceFolders ?? [], removed: [] });
		}
	}

	private async onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent): Promise<void> {
		this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangeWorkspaceFolders] Workspace folders changed. Added: ${e.added.map(f => f.uri.fsPath).join(', ')}, Removed: ${e.removed.map(f => f.uri.fsPath).join(', ')}`);

		// Add watchers
		for (const added of e.added) {
			await this.createRepositoryWatcher(added.uri);
		}

		// Dispose watchers
		for (const removed of e.removed) {
			this.disposeRepositoryWatcher(removed.uri);
		}
	}

	private async createRepositoryWatcher(uri: vscode.Uri): Promise<void> {
		if (this.repositories.has(uri)) {
			this.logService.trace(`[ChatSessionRepositoryTracker][createRepositoryWatcher] Already tracking repository changes for ${uri.toString()}.`);
			return;
		}

		const repository = await this.gitService.openRepository(uri);
		if (!repository) {
			this.logService.trace(`[ChatSessionRepositoryTracker][createRepositoryWatcher] No repository found at ${uri.toString()}.`);
			return;
		}

		const disposables = new DisposableStore();
		disposables.add(repository.state.onDidChange(() => this.onDidChangeRepositoryState(uri)));
		this.repositories.set(uri, disposables);

		// Trigger an initial update to set the session
		// properties based on the current repository state
		void this.onDidChangeRepositoryState(uri);
	}

	private async onDidChangeRepositoryState(uri: vscode.Uri): Promise<void> {
		await clearChangesCacheForAffectedSessions(uri, [], this.logService, this.metadataStore, this.workspaceFolderService, this.worktreeService, this.sessionItemProvider);
	}

	private disposeRepositoryWatcher(uri: vscode.Uri): void {
		if (!this.repositories.has(uri)) {
			return;
		}

		this.logService.trace(`[ChatSessionRepositoryTracker][disposeRepositoryWatcher] Disposing repository watcher for ${uri.toString()}.`);
		this.repositories.deleteAndDispose(uri);
	}

	override dispose(): void {
		this.repositories.dispose();
		super.dispose();
	}
}

/**
 * Invalidates the cache for sessions affected by a repository change, and triggers a refresh of those sessions.
 * You can optionally provide a list of sessions that should not be refreshed.
 * E.g. if you know that those sessions are not affected or are already up to date, you can exclude them from the refresh to avoid unnecessary work.
 */
export async function clearChangesCacheForAffectedSessions(folder: vscode.Uri, sessionsToIgnore: string[], logService: ILogService, metadataStore: IChatSessionMetadataStore, workspaceFolderService: IChatSessionWorkspaceFolderService, worktreeService: IChatSessionWorktreeService, sessionItemProvider?: ICopilotCLIChatSessionItemProvider): Promise<void> {
	logService.trace(`[ChatSessionRepositoryTracker][onDidChangeRepositoryState] Repository state changed for ${folder.toString()}. Updating session properties.`);

	const sessionIds = metadataStore.getSessionIdsForFolder(folder).filter(id => !sessionsToIgnore.includes(id));
	const workspaceSessionIds = workspaceFolderService.clearWorkspaceChanges(folder).filter(id => !sessionsToIgnore.includes(id));
	sessionIds.forEach(id => workspaceFolderService.clearWorkspaceChanges(id));
	sessionIds.push(...workspaceSessionIds);
	await Promise.all(Array.from(new Set(sessionIds)).map(async sessionId => {
		// Worktree
		const worktreeProperties = await worktreeService.getWorktreeProperties(sessionId);
		if (worktreeProperties) {
			await worktreeService.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				changes: undefined
			});
		}
	}));
	// Will be passed in non-controller code paths.
	if (sessionItemProvider) {
		await sessionItemProvider.refreshSession({ reason: 'update', sessionIds });
	}
	logService.trace(`[ChatSessionRepositoryTracker][onDidChangeRepositoryState] Updated session properties for worktree ${folder.toString()}.`);
}
