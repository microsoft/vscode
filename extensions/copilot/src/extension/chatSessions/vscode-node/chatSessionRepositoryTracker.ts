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
		private readonly sessionItemProvider: ICopilotCLIChatSessionItemProvider,
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
		this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangeRepositoryState] Repository state changed for ${uri.toString()}. Updating session properties.`);

		const sessionIds = await this.metadataStore.getSessionIdsForFolder(uri);
		const workspaceSessionIds = this.workspaceFolderService.clearWorkspaceChanges(uri);
		sessionIds.push(...workspaceSessionIds);
		await Promise.all(Array.from(new Set(sessionIds)).map(async sessionId => {
			// Worktree
			const worktreeProperties = await this.worktreeService.getWorktreeProperties(sessionId);
			if (worktreeProperties) {
				await this.worktreeService.setWorktreeProperties(sessionId, {
					...worktreeProperties,
					changes: undefined
				});
			}
		}));
		await this.sessionItemProvider.refreshSession({ reason: 'update', sessionIds });
		this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangeRepositoryState] Updated session properties for worktree ${uri.toString()}.`);
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
