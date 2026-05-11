/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IChatSessionMetadataStore, RepositoryProperties, RequestDetails, WorkspaceFolderEntry } from '../chatSessionMetadataStore';
import { ChatSessionWorktreeProperties } from '../chatSessionWorktreeService';
import { IWorkspaceInfo } from '../workspaceInfo';

export class MockChatSessionMetadataStore implements IChatSessionMetadataStore {
	getMetadataFileUri(sessionId: string): vscode.Uri {
		throw new Error('Method not implemented.');
	}
	declare _serviceBrand: undefined;

	private readonly _worktreeProperties = new Map<string, ChatSessionWorktreeProperties>();
	private readonly _workspaceFolders = new Map<string, WorkspaceFolderEntry>();
	private readonly _additionalWorkspaces = new Map<string, IWorkspaceInfo[]>();
	private readonly _firstUserMessages = new Map<string, string>();
	private readonly _customTitles = new Map<string, string>();
	private readonly _requestDetails = new Map<string, RequestDetails[]>();
	private readonly _sessionOrigins = new Map<string, 'vscode' | 'other'>();

	async deleteSessionMetadata(sessionId: string): Promise<void> {
		this._worktreeProperties.delete(sessionId);
		this._workspaceFolders.delete(sessionId);
		this._additionalWorkspaces.delete(sessionId);
		this._firstUserMessages.delete(sessionId);
		this._customTitles.delete(sessionId);
		this._requestDetails.delete(sessionId);
	}

	async refresh(): Promise<void> {
		// no-op in mock — there is no on-disk state to reload.
	}

	async storeWorktreeInfo(sessionId: string, properties: ChatSessionWorktreeProperties): Promise<void> {
		this._worktreeProperties.set(sessionId, properties);
	}

	async storeWorkspaceFolderInfo(sessionId: string, entry: WorkspaceFolderEntry): Promise<void> {
		this._workspaceFolders.set(sessionId, entry);
	}

	async storeRepositoryProperties(_sessionId: string, _properties: RepositoryProperties): Promise<void> {
	}

	async getRepositoryProperties(_sessionId: string): Promise<RepositoryProperties | undefined> {
		return undefined;
	}

	async getSessionIdForWorktree(_folder: vscode.Uri): Promise<string | undefined> {
		return undefined;
	}

	async getWorktreeProperties(sessionId: string): Promise<ChatSessionWorktreeProperties | undefined> {
		return this._worktreeProperties.get(sessionId);
	}

	async getSessionWorkspaceFolder(_sessionId: string): Promise<vscode.Uri | undefined> {
		return undefined;
	}

	async getSessionWorkspaceFolderEntry(sessionId: string): Promise<WorkspaceFolderEntry | undefined> {
		return undefined;
	}

	async getAdditionalWorkspaces(sessionId: string): Promise<IWorkspaceInfo[]> {
		return this._additionalWorkspaces.get(sessionId) ?? [];
	}

	async setAdditionalWorkspaces(sessionId: string, workspaces: IWorkspaceInfo[]): Promise<void> {
		this._additionalWorkspaces.set(sessionId, workspaces);
	}

	async getSessionFirstUserMessage(sessionId: string): Promise<string | undefined> {
		return this._firstUserMessages.get(sessionId);
	}

	async setSessionFirstUserMessage(sessionId: string, message: string): Promise<void> {
		this._firstUserMessages.set(sessionId, message);
	}

	async getCustomTitle(sessionId: string): Promise<string | undefined> {
		return this._customTitles.get(sessionId);
	}

	async setCustomTitle(sessionId: string, title: string): Promise<void> {
		this._customTitles.set(sessionId, title);
	}

	async getRequestDetails(sessionId: string): Promise<RequestDetails[]> {
		return this._requestDetails.get(sessionId) ?? [];
	}

	async updateRequestDetails(sessionId: string, details: (Partial<RequestDetails> & { vscodeRequestId: string })[]): Promise<void> {
		const existing = this._requestDetails.get(sessionId) ?? [];
		for (const item of details) {
			const entry = existing.find(e => e.vscodeRequestId === item.vscodeRequestId);
			if (entry) {
				Object.assign(entry, item);
			} else {
				existing.push({ ...item, toolIdEditMap: item.toolIdEditMap ?? {} } as RequestDetails);
			}
		}
		this._requestDetails.set(sessionId, existing);
	}

	async getSessionAgent(sessionId: string): Promise<string | undefined> {
		const details = this._requestDetails.get(sessionId) ?? [];
		for (let i = details.length - 1; i >= 0; i--) {
			if (details[i].agentId) {
				return details[i].agentId;
			}
		}
		return undefined;
	}

	async storeForkedSessionMetadata(sourceSessionId: string, targetSessionId: string, customTitle: string): Promise<void> {
		await this.setCustomTitle(targetSessionId, customTitle);
		const worktree = this._worktreeProperties.get(sourceSessionId);
		if (worktree) {
			this._worktreeProperties.set(targetSessionId, worktree);
		}
		const folder = this._workspaceFolders.get(sourceSessionId);
		if (folder) {
			this._workspaceFolders.set(targetSessionId, folder);
		}
		const additional = this._additionalWorkspaces.get(sourceSessionId);
		if (additional) {
			this._additionalWorkspaces.set(targetSessionId, additional);
		}
		const firstMsg = this._firstUserMessages.get(sourceSessionId);
		if (firstMsg) {
			this._firstUserMessages.set(targetSessionId, firstMsg);
		}
	}

	async setSessionOrigin(sessionId: string): Promise<void> {
		this._sessionOrigins.set(sessionId, 'vscode');
	}

	async getSessionOrigin(sessionId: string): Promise<'vscode' | 'other'> {
		return this._sessionOrigins.get(sessionId) ?? 'vscode';
	}

	setSessionParentId(_sessionId: string, _parentSessionId: string): Promise<void> {
		return Promise.resolve();
	}

	getSessionParentId(_sessionId: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	getSessionIdsForFolder(folder: vscode.Uri): string[] {
		const folderPath = folder.fsPath;
		const sessionIds: string[] = [];
		for (const [sessionId, props] of this._worktreeProperties) {
			if (props.worktreePath === folderPath) {
				sessionIds.push(sessionId);
			}
		}
		for (const [sessionId, entry] of this._workspaceFolders) {
			if (entry.folderPath === folderPath && !sessionIds.includes(sessionId)) {
				sessionIds.push(sessionId);
			}
		}
		return sessionIds;
	}

	getWorktreeSessions(folder: vscode.Uri): string[] {
		const folderPath = folder.fsPath;
		const sessionIds: string[] = [];
		for (const [sessionId, props] of this._worktreeProperties) {
			if (props.worktreePath === folderPath) {
				sessionIds.push(sessionId);
			}
		}
		return sessionIds;
	}
}
