/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { Event } from '../../../util/vs/base/common/event';
import { Disposable, DisposableResourceMap, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { relative } from '../../../util/vs/base/common/path';
import { IChatSessionWorkspaceFolderService } from '../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';
import { ICopilotCLIChatSessionItemProvider } from './copilotCLIChatSessions';

export class ChatSessionRepositoryTracker extends Disposable {
	private readonly watchers = new DisposableResourceMap();

	constructor(
		private readonly sessionItemProvider: ICopilotCLIChatSessionItemProvider,
		@IChatSessionWorktreeService private readonly worktreeService: IChatSessionWorktreeService,
		@IChatSessionWorkspaceFolderService private readonly workspaceFolderService: IChatSessionWorkspaceFolderService,
		@ILogService private readonly logService: ILogService
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

		// Add trackers
		for (const added of e.added) {
			this.createWorkspaceFolderWatcher(added.uri);
		}

		// Dispose trackers
		for (const removed of e.removed) {
			this.disposeWorkspaceFolderWatcher(removed.uri);
		}
	}

	private createWorkspaceFolderWatcher(uri: vscode.Uri): void {
		if (this.watchers.has(uri)) {
			this.logService.trace(`[ChatSessionRepositoryTracker][createWorkspaceFolderWatcher] Already tracking file changes for workspace ${uri.toString()}.`);
			return;
		}

		const disposables = new DisposableStore();

		// Setup file system watcher to track changes in the workspace folder
		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '**'));
		disposables.add(watcher);

		// Consolidation file watcher events
		const onDidChangeWorkspaceFile = Event.any<vscode.Uri>(
			watcher.onDidChange as Event<vscode.Uri>,
			watcher.onDidCreate as Event<vscode.Uri>,
			watcher.onDidDelete as Event<vscode.Uri>);

		// Filter out events from the .git and node_modules folders
		const onDidChangeRepositoryFile = Event.filter(onDidChangeWorkspaceFile, changedUri => {
			const relativePath = relative(uri.fsPath, changedUri.fsPath);
			return !/\.git($|\\|\/)/.test(relativePath) && !/(^|\\|\/)node_modules($|\\|\/)/.test(relativePath);
		});

		// Debounce file change events to avoid rapid consecutive updates (3 seconds)
		const debouncedOnDidChangeRepositoryFile = Event.debounce(onDidChangeRepositoryFile, () => { }, 3_000, true);
		debouncedOnDidChangeRepositoryFile(() => this.onDidChangesWorkspaceFile(uri), this, disposables);

		this.watchers.set(uri, disposables);
	}

	private async onDidChangesWorkspaceFile(uri: vscode.Uri): Promise<void> {
		this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangesWorkspaceFile] File changed in workspace ${uri.toString()}. Updating session properties.`);

		const worktreeSessionId = await this.worktreeService.getSessionIdForWorktree(uri);
		const workspaceSessionIds = this.workspaceFolderService.clearWorkspaceChanges(uri);

		if (worktreeSessionId) {
			// Worktree
			const worktreeProperties = await this.worktreeService.getWorktreeProperties(worktreeSessionId);
			if (!worktreeProperties) {
				return;
			}

			await this.worktreeService.setWorktreeProperties(worktreeSessionId, {
				...worktreeProperties,
				changes: undefined
			});

			await this.sessionItemProvider.refreshSession({ reason: 'update', sessionId: worktreeSessionId });
			this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangesWorkspaceFile] Updated session properties for worktree ${uri.toString()}.`);
		} else if (workspaceSessionIds.length > 0) {
			// Workspace
			// This is still using the old ChatSessionItem API so there is no need to refresh each session
			// associated with the workspace folder. When the new controller API is fully adopted we will
			// have to refresh each session.
			await this.sessionItemProvider.refreshSession({ reason: 'update', sessionIds: workspaceSessionIds });
			this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangesWorkspaceFile] Updated session properties for workspace ${uri.toString()}.`);
		} else {
			this.logService.trace(`[ChatSessionRepositoryTracker][onDidChangesWorkspaceFile] No session associated with workspace ${uri.toString()}.`);
		}
	}

	private disposeWorkspaceFolderWatcher(uri: vscode.Uri): void {
		if (!this.watchers.has(uri)) {
			return;
		}

		this.logService.trace(`[ChatSessionRepositoryTracker][disposeWorkspaceFolderWatcher] Disposing file watcher for ${uri.toString()}.`);
		this.watchers.deleteAndDispose(uri);
	}

	override dispose(): void {
		this.watchers.dispose();
		super.dispose();
	}
}
