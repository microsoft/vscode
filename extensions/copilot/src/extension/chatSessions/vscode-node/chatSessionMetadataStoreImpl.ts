/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { createDirectoryIfNotExists, IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { findLast } from '../../../util/vs/base/common/arraysFind';
import { SequencerByKey, ThrottledDelayer } from '../../../util/vs/base/common/async';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { dirname, isEqual } from '../../../util/vs/base/common/resources';
import { ChatSessionMetadataFile, IChatSessionMetadataStore, RepositoryProperties, RequestDetails, WorkspaceFolderEntry } from '../common/chatSessionMetadataStore';
import { ChatSessionWorktreeData, ChatSessionWorktreeProperties } from '../common/chatSessionWorktreeService';
import { isUntitledSessionId } from '../common/utils';
import { IWorkspaceInfo } from '../common/workspaceInfo';
import { getCopilotCLISessionDir } from '../copilotcli/node/cliHelpers';
import { ICopilotCLIAgents } from '../copilotcli/node/copilotCli';

const WORKSPACE_FOLDER_MEMENTO_KEY = 'github.copilot.cli.sessionWorkspaceFolders';
const WORKTREE_MEMENTO_KEY = 'github.copilot.cli.sessionWorktrees';
const BULK_METADATA_FILENAME = 'copilotcli.session.metadata.json';
const REQUEST_MAPPING_FILENAME = 'vscode.requests.metadata.json';

export class ChatSessionMetadataStore extends Disposable implements IChatSessionMetadataStore {
	declare _serviceBrand: undefined;
	private _cache: Record<string, ChatSessionMetadataFile> = {};
	private readonly _cacheDirectory: Uri;
	private readonly _cacheFile: Uri;
	private readonly _intialize: Lazy<Promise<void>>;
	private readonly _updateStorageDebouncer = this._register(new ThrottledDelayer<void>(1_000));
	private readonly _requestMappingWriteSequencer = new SequencerByKey<string>();
	private readonly _metadataWriteSequencer = new SequencerByKey<string>();
	constructor(
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
	) {
		super();

		this._cacheDirectory = Uri.joinPath(this.extensionContext.globalStorageUri, 'copilotcli');
		this._cacheFile = Uri.joinPath(this._cacheDirectory, BULK_METADATA_FILENAME);
		this._intialize = new Lazy<Promise<void>>(this.initializeStorage.bind(this));
		this._intialize.value.catch(error => {
			this.logService.error('[ChatSessionMetadataStore] Initialization failed: ', error);
		});
	}

	private async initializeStorage(): Promise<void> {
		try {
			this._cache = await this.getGlobalStorageData();
			// In case user closed vscode early or we couldn't save the session information for some reason.
			for (const [sessionId, metadata] of Object.entries(this._cache)) {
				if (sessionId.startsWith('untitled-')) {
					delete this._cache[sessionId];
					continue;
				}
				if (!metadata.writtenToDisc) {
					if ((metadata.workspaceFolder || metadata.worktreeProperties || metadata.additionalWorkspaces?.length)) {
						this.updateSessionMetadata(sessionId, metadata, false).catch(ex => {
							this.logService.error(ex, `[ChatSessionMetadataStore] Failed to write metadata for session ${sessionId} to session state: `);
						});
					} else {
						// invalid data, we don't need this in our cache.
						delete this._cache[sessionId];
					}
				}
			}
			// Dont' exit from here, keep reaading from global storage.
			// Possible we had a bug and we missed writing some metadata to disc.
		} catch {
			//
		}

		let cacheUpdated = false;
		// Collect workspace folder entries from global state
		const workspaceFolderData = this.extensionContext.globalState.get<Record<string, Partial<WorkspaceFolderEntry>>>(WORKSPACE_FOLDER_MEMENTO_KEY, {});
		for (const [sessionId, entry] of Object.entries(workspaceFolderData)) {
			if (typeof entry === 'string' || !entry.folderPath || !entry.timestamp) {
				continue;
			}
			if (sessionId.startsWith('untitled-')) {
				continue;
			}
			if (sessionId in this._cache && this._cache[sessionId].workspaceFolder) {
				continue;
			}
			cacheUpdated = true;
			this._cache[sessionId] = { workspaceFolder: { folderPath: entry.folderPath, timestamp: entry.timestamp } };
		}

		// Collect worktree entries from global state
		const worktreeData = this.extensionContext.globalState.get<Record<string, string | ChatSessionWorktreeData>>(WORKTREE_MEMENTO_KEY, {});
		for (const [sessionId, value] of Object.entries(worktreeData)) {
			if (typeof value === 'string') {
				continue;
			}
			if (sessionId.startsWith('untitled-')) {
				continue;
			}
			if (sessionId in this._cache && this._cache[sessionId].worktreeProperties) {
				const parsedData: ChatSessionWorktreeProperties = value.version === 1 ? { ...JSON.parse(value.data), version: 1 } : JSON.parse(value.data);
				const changesInFileStorage = this._cache[sessionId].worktreeProperties?.changes;
				const changesInGlobalState = parsedData.changes;
				// There was a bug that resulted in changes not being written to file storage, but they were written to global state.
				// In that case we want to keep the changes from global state, otherwise we might lose data.
				if ((changesInGlobalState || []).length === (changesInFileStorage || []).length) {
					continue;
				}
			}
			cacheUpdated = true;
			{
				const parsedData: ChatSessionWorktreeProperties = value.version === 1 ? { ...JSON.parse(value.data), version: 1 } : JSON.parse(value.data);
				this._cache[sessionId] = { ...this._cache[sessionId], workspaceFolder: undefined, worktreeProperties: parsedData, writtenToDisc: false };
			}
		}

		for (const [sessionId, metadata] of Object.entries(this._cache)) {
			// These promises can run in background and no need to wait for them.
			// Even if user exits early we have all the data in the global storage and we'll restore from that next time.
			if (!metadata.writtenToDisc) {
				if ((metadata.workspaceFolder || metadata.worktreeProperties || metadata.additionalWorkspaces?.length)) {
					this.updateSessionMetadata(sessionId, metadata, false).catch(ex => {
						this.logService.error(ex, `[ChatSessionMetadataStore] Failed to write metadata for session ${sessionId} to session state: `);
					});
				}
			}
		}

		if (cacheUpdated) {
			// Writing to file is most important.
			await this.writeToGlobalStorage(this._cache);
		}

		// To be enabled after testing. So we dont' blow away the data.
		// this.extensionContext.globalState.update(WORKSPACE_FOLDER_MEMENTO_KEY, undefined);
		// this.extensionContext.globalState.update(WORKTREE_MEMENTO_KEY, undefined);
	}

	public getMetadataFileUri(sessionId: string): vscode.Uri {
		return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), 'vscode.metadata.json');
	}

	private getRequestMappingFileUri(sessionId: string): vscode.Uri {
		return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), REQUEST_MAPPING_FILENAME);
	}

	async deleteSessionMetadata(sessionId: string): Promise<void> {
		await this._intialize.value;
		if (sessionId in this._cache) {
			delete this._cache[sessionId];
			const data = await this.getGlobalStorageData();
			delete data[sessionId];
			await this.writeToGlobalStorage(data);
		}
		try {
			await this.fileSystemService.delete(this.getMetadataFileUri(sessionId));
			await this.fileSystemService.delete(this.getRequestMappingFileUri(sessionId));
		} catch {
			// File may not exist, ignore.
		}
	}

	private async updateMetadataFields(sessionId: string, fields: Partial<ChatSessionMetadataFile>): Promise<void> {
		if (isUntitledSessionId(sessionId)) {
			return;
		}
		await this._intialize.value;
		const existing = this._cache[sessionId] ?? {};
		const metadata: ChatSessionMetadataFile = { ...existing, ...fields };
		this._cache[sessionId] = metadata;
		await this.updateSessionMetadata(sessionId, metadata);
		this.updateGlobalStorage();
	}

	async storeWorktreeInfo(sessionId: string, properties: ChatSessionWorktreeProperties): Promise<void> {
		await this.updateMetadataFields(sessionId, { worktreeProperties: properties });
	}

	async storeWorkspaceFolderInfo(sessionId: string, entry: WorkspaceFolderEntry): Promise<void> {
		await this.updateMetadataFields(sessionId, { workspaceFolder: entry });
	}

	async storeRepositoryProperties(sessionId: string, properties: RepositoryProperties): Promise<void> {
		await this.updateMetadataFields(sessionId, { repositoryProperties: properties });
	}

	async getRepositoryProperties(sessionId: string): Promise<RepositoryProperties | undefined> {
		const metadata = await this.getSessionMetadata(sessionId);
		return metadata?.repositoryProperties;
	}

	getWorktreeProperties(sessionId: string): Promise<ChatSessionWorktreeProperties | undefined>;
	getWorktreeProperties(folder: Uri): Promise<ChatSessionWorktreeProperties | undefined>;
	async getWorktreeProperties(sessionId: string | Uri): Promise<ChatSessionWorktreeProperties | undefined> {
		await this._intialize.value;
		if (typeof sessionId === 'string') {
			const metadata = await this.getSessionMetadata(sessionId);
			return metadata?.worktreeProperties;
		} else {
			const folder = sessionId;
			for (const metadata of Object.values(this._cache)) {
				if (!metadata.worktreeProperties?.worktreePath) {
					continue;
				}
				if (isEqual(Uri.file(metadata.worktreeProperties.worktreePath), folder)) {
					return metadata.worktreeProperties;
				}
			}
		}
	}
	async getSessionIdForWorktree(folder: vscode.Uri): Promise<string | undefined> {
		await this._intialize.value;
		for (const [sessionId, value] of Object.entries(this._cache)) {
			if (value.worktreeProperties?.worktreePath && isEqual(vscode.Uri.file(value.worktreeProperties.worktreePath), folder)) {
				return sessionId;
			}
		}
		return undefined;
	}

	async getSessionWorkspaceFolder(sessionId: string): Promise<vscode.Uri | undefined> {
		const metadata = await this.getSessionMetadata(sessionId);
		if (!metadata) {
			return undefined;
		}
		// Prefer worktree properties when both exist (this isn't possible, but if this happens).
		if (metadata.worktreeProperties) {
			return undefined;
		}
		return metadata.workspaceFolder?.folderPath ? Uri.file(metadata.workspaceFolder.folderPath) : undefined;
	}

	async getSessionWorkspaceFolderEntry(sessionId: string): Promise<WorkspaceFolderEntry | undefined> {
		const metadata = await this.getSessionMetadata(sessionId);
		if (!metadata) {
			return undefined;
		}
		return metadata.workspaceFolder;
	}

	async getAdditionalWorkspaces(sessionId: string): Promise<IWorkspaceInfo[]> {
		const metadata = await this.getSessionMetadata(sessionId);
		if (!metadata?.additionalWorkspaces?.length) {
			return [];
		}
		return metadata.additionalWorkspaces.map(ws => ({
			folder: !ws.worktreeProperties && ws.workspaceFolder?.folderPath ? Uri.file(ws.workspaceFolder.folderPath) : undefined,
			repository: ws.worktreeProperties?.repositoryPath ? Uri.file(ws.worktreeProperties.repositoryPath) : undefined,
			repositoryProperties: undefined,
			worktree: ws.worktreeProperties?.worktreePath ? Uri.file(ws.worktreeProperties.worktreePath) : undefined,
			worktreeProperties: ws.worktreeProperties,
		}));
	}

	async setAdditionalWorkspaces(sessionId: string, workspaces: IWorkspaceInfo[]): Promise<void> {
		const additionalWorkspaces = workspaces.map(ws => ({
			worktreeProperties: ws.worktreeProperties,
			workspaceFolder: !ws.worktreeProperties && ws.folder ? { folderPath: ws.folder.fsPath, timestamp: Date.now() } : undefined,
		}));
		await this.updateMetadataFields(sessionId, { additionalWorkspaces });
	}

	async getSessionFirstUserMessage(sessionId: string): Promise<string | undefined> {
		const metadata = await this.getSessionMetadata(sessionId);
		return metadata?.firstUserMessage;
	}

	async getCustomTitle(sessionId: string): Promise<string | undefined> {
		const metadata = await this.getSessionMetadata(sessionId);
		return metadata?.customTitle;
	}

	async setCustomTitle(sessionId: string, title: string): Promise<void> {
		await this.updateMetadataFields(sessionId, { customTitle: title });
	}

	async setSessionFirstUserMessage(sessionId: string, message: string): Promise<void> {
		await this.updateMetadataFields(sessionId, { firstUserMessage: message });
	}

	async getRequestDetails(sessionId: string): Promise<RequestDetails[]> {
		await this._intialize.value;
		const fileUri = this.getRequestMappingFileUri(sessionId);
		try {
			const content = await this.fileSystemService.readFile(fileUri);
			return JSON.parse(new TextDecoder().decode(content)) as RequestDetails[];
		} catch {
			return [];
		}
	}

	async updateRequestDetails(sessionId: string, details: (Partial<RequestDetails> & { vscodeRequestId: string })[]): Promise<void> {
		await this._intialize.value;
		if (isUntitledSessionId(sessionId)) {
			return;
		}

		await this._requestMappingWriteSequencer.queue(sessionId, async () => {
			const existing = await this.getRequestDetails(sessionId);

			for (const item of details) {
				const existingDetails = existing.find(e => e.vscodeRequestId === item.vscodeRequestId);
				if (existingDetails) {
					// Ensure we don't override any existing data.
					const defined = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
					Object.assign(existingDetails, defined);
				} else {
					const newEntry = { ...item, toolIdEditMap: item.toolIdEditMap ?? {} };
					existing.push(newEntry);
				}
			}
			await this.writeRequestDetails(sessionId, existing);
		});
	}

	async getSessionAgent(sessionId: string): Promise<string | undefined> {
		const details = await this.getRequestDetails(sessionId);
		return findLast(details, d => !!d.agentId)?.agentId ?? this.copilotCLIAgents.getSessionAgent(sessionId);
	}

	private async writeRequestDetails(sessionId: string, details: RequestDetails[]): Promise<void> {
		await this._intialize.value;
		if (isUntitledSessionId(sessionId)) {
			return;
		}
		const fileUri = this.getRequestMappingFileUri(sessionId);
		const dirUri = dirname(fileUri);
		await createDirectoryIfNotExists(this.fileSystemService, dirUri);
		const content = new TextEncoder().encode(JSON.stringify(details, null, 2));
		await this.fileSystemService.writeFile(fileUri, content);
		this.logService.trace(`[ChatSessionMetadataStore] Wrote request details for session ${sessionId}`);
	}

	async storeForkedSessionMetadata(sourceSessionId: string, targetSessionId: string, customTitle: string): Promise<void> {
		await this._intialize.value;
		const sourceMetadata = await this.getSessionMetadata(sourceSessionId);
		const forkedMetadata: ChatSessionMetadataFile = {
			...sourceMetadata,
			customTitle,
			writtenToDisc: true,
			parentSessionId: sourceSessionId,
			origin: 'vscode',
			kind: 'forked',
		};
		await this.updateMetadataFields(targetSessionId, forkedMetadata);
	}

	public async setSessionOrigin(sessionId: string): Promise<void> {
		await this._intialize.value;
		await this.updateMetadataFields(sessionId, { origin: 'vscode' });
	}

	public async getSessionOrigin(sessionId: string): Promise<'vscode' | 'other'> {
		const metadata = await this.getSessionMetadata(sessionId, false);
		if (!metadata || Object.keys(metadata).length === 0) {
			// We always store some metadata
			return 'other';
		}
		if (metadata.origin) {
			return metadata.origin;
		}
		// Older sessions, guess.
		if (metadata?.repositoryProperties || metadata?.worktreeProperties || metadata?.workspaceFolder) {
			return 'vscode';
		}
		return 'other';
	}

	public async setSessionParentId(sessionId: string, parentSessionId: string): Promise<void> {
		await this._intialize.value;
		await this.updateMetadataFields(sessionId, { parentSessionId, kind: 'sub-session' });
	}

	public async getSessionParentId(sessionId: string): Promise<string | undefined> {
		const metadata = await this.getSessionMetadata(sessionId, false);
		return metadata?.parentSessionId;
	}

	private async getSessionMetadata(sessionId: string, createMetadataFileIfNotFound = true): Promise<ChatSessionMetadataFile | undefined> {
		if (isUntitledSessionId(sessionId)) {
			return undefined;
		}
		await this._intialize.value;
		if (sessionId in this._cache) {
			return this._cache[sessionId];
		}

		const fileUri = this.getMetadataFileUri(sessionId);
		try {
			const content = await this.fileSystemService.readFile(fileUri);
			const metadata: ChatSessionMetadataFile = JSON.parse(new TextDecoder().decode(content));
			this._cache[sessionId] = metadata;
			return metadata;
		} catch {
			// So we don't try again.
			this._cache[sessionId] = {};
			if (createMetadataFileIfNotFound) {
				await this.updateSessionMetadata(sessionId, { origin: 'other' });
				this.updateGlobalStorage();
			}
			return undefined;
		}
	}

	private async updateSessionMetadata(sessionId: string, metadata: ChatSessionMetadataFile, createDirectoryIfNotFound = true): Promise<void> {
		if (isUntitledSessionId(sessionId)) {
			// Don't write metadata for untitled sessions, as they are temporary and can be created in large numbers.
			return;
		}

		await this._metadataWriteSequencer.queue(sessionId, async () => {
			const fileUri = this.getMetadataFileUri(sessionId);
			const dirUri = dirname(fileUri);

			// Try to read existing file first (will succeed 99% of the time).
			// This preserves data written by other processes when merging.
			let existing: ChatSessionMetadataFile = {};
			try {
				const rawContent = await this.fileSystemService.readFile(fileUri);
				existing = JSON.parse(new TextDecoder().decode(rawContent));
			} catch {
				// File doesn't exist yet — check if the directory exists.
				try {
					await this.fileSystemService.stat(dirUri);
				} catch {
					if (!createDirectoryIfNotFound) {
						// Lets not delete the session from our storage, but mark it as written to session state so that we won't try to write to session state again and again.
						this._cache[sessionId] = { ...metadata, writtenToDisc: true };
						this.updateGlobalStorage();
						return;
					}
					await this.fileSystemService.createDirectory(dirUri);
				}
			}

			// Merge: overwrite fields that are explicitly provided, delete fields set to undefined.
			// This preserves data written by other processes.
			const merged: ChatSessionMetadataFile = { ...existing };
			for (const [key, value] of Object.entries(metadata)) {
				if (value === undefined) {
					delete (merged as Record<string, unknown>)[key];
				} else {
					(merged as Record<string, unknown>)[key] = value;
				}
			}

			const content = new TextEncoder().encode(JSON.stringify(merged, null, 2));
			await this.fileSystemService.writeFile(fileUri, content);
			this._cache[sessionId] = { ...merged, writtenToDisc: true };
			this.updateGlobalStorage();
			this.logService.trace(`[ChatSessionMetadataStore] Wrote metadata for session ${sessionId}`);
		});
	}

	private async getGlobalStorageData() {
		const data = await this.fileSystemService.readFile(this._cacheFile);
		return JSON.parse(new TextDecoder().decode(data)) as Record<string, ChatSessionMetadataFile>;
	}

	private updateGlobalStorage() {
		this._updateStorageDebouncer.trigger(() => this.updateGlobalStorageImpl()).catch(() => { /* expected on dispose */ });
	}

	private async updateGlobalStorageImpl() {
		try {
			const data = this._cache;
			try {
				const storageData = await this.getGlobalStorageData();
				for (const [sessionId, metadata] of Object.entries(storageData)) {
					if (sessionId in data) {
						// Ignore this.
					} else {
						data[sessionId] = metadata;
					}
				}
			} catch {
				//
			}
			await this.writeToGlobalStorage(data);
		} catch (error) {
			this.logService.error('[ChatSessionMetadataStore] Failed to update global storage: ', error);
		}
	}

	private async writeToGlobalStorage(allMetadata: Record<string, ChatSessionMetadataFile>): Promise<void> {
		try {
			await this.fileSystemService.stat(this._cacheDirectory);
		} catch {
			await this.fileSystemService.createDirectory(this._cacheDirectory);
		}

		const content = new TextEncoder().encode(JSON.stringify(allMetadata, null, 2));
		await this.fileSystemService.writeFile(this._cacheFile, content);
		this.logService.trace(`[ChatSessionMetadataStore] Wrote bulk metadata file with ${Object.keys(allMetadata).length} session(s)`);
	}
}
