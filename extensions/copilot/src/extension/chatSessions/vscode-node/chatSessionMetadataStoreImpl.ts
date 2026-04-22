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
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { dirname, isEqual } from '../../../util/vs/base/common/resources';
import { ChatSessionMetadataFile, IChatSessionMetadataStore, RepositoryProperties, RequestDetails, WorkspaceFolderEntry, WorktreeSessionEntry } from '../common/chatSessionMetadataStore';
import { ChatSessionWorktreeProperties } from '../common/chatSessionWorktreeService';
import { isUntitledSessionId } from '../common/utils';
import { IWorkspaceInfo } from '../common/workspaceInfo';
import { getCopilotBulkMetadataFile, getCopilotCLISessionDir, getCopilotCLISessionStateDir, getCopilotWorktreeSessionsFile } from '../copilotcli/node/cliHelpers';
import { ICopilotCLIAgents } from '../copilotcli/node/copilotCli';
import { WorktreeSessionIndex } from './worktreeSessionIndex';

// const WORKSPACE_FOLDER_MEMENTO_KEY = 'github.copilot.cli.sessionWorkspaceFolders';
// const WORKTREE_MEMENTO_KEY = 'github.copilot.cli.sessionWorktrees';
const LEGACY_BULK_METADATA_FILENAME = 'copilotcli.session.metadata.json';
const LEGACY_BULK_MIGRATED_KEY = 'github.copilot.cli.legacyBulkMigrated';
const JSONL_SCAN_DONE_KEY = 'github.copilot.cli.events.jsonl.scaned';
const REQUEST_MAPPING_FILENAME = 'vscode.requests.metadata.json';
const SESSION_SCAN_BATCH_SIZE = 20;

/**
 * Maximum number of sessions kept in the shared bulk metadata cache file
 * (`~/.copilot/vscode.session.metadata.cache.json`). Older entries (by `modified`)
 * are evicted from the file but remain available via the per-session metadata files
 * (`~/.copilot/session-state/{id}/vscode.metadata.json`) and the JSONL worktree index.
 */
const MAX_BULK_STORAGE_ENTRIES = 1000;

/** Single-key sequencer key used to serialize bulk-file flush against {@link refresh}. */
const BULK_SEQUENCER_KEY = 'bulk';

export class ChatSessionMetadataStore extends Disposable implements IChatSessionMetadataStore {
	declare _serviceBrand: undefined;

	/**
	 * In-memory mirror of the bulk metadata file plus on-demand entries hydrated by
	 * {@link getSessionMetadata}. Always retains everything it has seen; only the on-disk
	 * file is trimmed to {@link MAX_BULK_STORAGE_ENTRIES}.
	 */
	private _cache: Record<string, ChatSessionMetadataFile> = {};

	/** Maps session id → JSONL entry and folder path → session id. Owns JSONL file persistence. */
	private readonly _worktreeSessions: WorktreeSessionIndex;

	/** Path of the shared bulk metadata cache file in `~/.copilot/`. */
	private readonly _cacheFile = Uri.file(getCopilotBulkMetadataFile());

	/**
	 * Single-promise gate. Initially set to `initializeStorage()`; {@link refresh} chains
	 * a {@link reloadBulkFromDisk} call onto it so concurrent refreshes collapse to at
	 * most one in-flight + one pending. Reads and writes both `await` this so they queue
	 * behind any in-flight refresh.
	 */
	private _ready: Promise<void>;

	private readonly _updateStorageDebouncer = this._register(new ThrottledDelayer<void>(1_000));
	private readonly _requestMappingWriteSequencer = new SequencerByKey<string>();
	private readonly _metadataWriteSequencer = new SequencerByKey<string>();
	/** Serializes bulk-file flush against {@link reloadBulkFromDisk}. */
	private readonly _bulkSequencer = new SequencerByKey<string>();

	constructor(
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
	) {
		super();

		this._worktreeSessions = new WorktreeSessionIndex(
			this.fileSystemService,
			this.logService,
			getCopilotWorktreeSessionsFile(),
		);

		this._ready = this.initializeStorage();
		this._ready.catch(error => {
			this.logService.error('[ChatSessionMetadataStore] Initialization failed: ', error);
		});
	}

	public refresh(): Promise<void> {
		// Chain onto the existing `_ready` — concurrent calls collapse to at most one
		// in-flight + one pending. `.catch(() => undefined)` ensures a failed prior
		// step does not poison subsequent reads/writes.
		this._ready = this._ready.catch(() => undefined).then(() => this.reloadBulkFromDisk());
		return this._ready;
	}

	private async initializeStorage(): Promise<void> {
		// One-time migration from the legacy per-install bulk file in
		// globalStorageUri to the shared `~/.copilot/` location.
		await this.migrateLegacyBulkFile();

		this._cache = await this.getGlobalStorageData().catch(() => ({} as Record<string, ChatSessionMetadataFile>));
		// In case user closed vscode early or we couldn't save the session information for some reason.
		for (const [sessionId, metadata] of Object.entries(this._cache)) {
			if (sessionId.startsWith('untitled-')) {
				delete this._cache[sessionId];
				continue;
			}
			if (!(metadata.workspaceFolder || metadata.worktreeProperties || metadata.additionalWorkspaces?.length)) {
				// invalid data, we don't need this in our cache.
				delete this._cache[sessionId];
			}
		}

		// this.extensionContext.globalState.update(WORKTREE_MEMENTO_KEY, undefined);
		// this.extensionContext.globalState.update(WORKSPACE_FOLDER_MEMENTO_KEY, undefined);


		// Ensure every cached session with a worktreePath has a JSONL
		// entry. Only appends entries that are missing; falls back to a full rewrite when
		// the load detected duplicates or malformed lines.
		await this.topUpJsonlIndexFromCache();
	}

	public getMetadataFileUri(sessionId: string): vscode.Uri {
		return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), 'vscode.metadata.json');
	}

	private getRequestMappingFileUri(sessionId: string): vscode.Uri {
		return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), REQUEST_MAPPING_FILENAME);
	}

	async deleteSessionMetadata(sessionId: string): Promise<void> {
		await this._ready;
		if (sessionId in this._cache) {
			delete this._cache[sessionId];
			const data = await this.getGlobalStorageData().catch(() => ({} as Record<string, ChatSessionMetadataFile>));
			delete data[sessionId];
			await this.writeToGlobalStorage(data);
		}
		try {
			await Promise.allSettled([
				this._worktreeSessions.removeAndWriteToDisk(sessionId),
				this.fileSystemService.delete(this.getMetadataFileUri(sessionId)),
				this.fileSystemService.delete(this.getRequestMappingFileUri(sessionId))
			]);
		} catch {
			// File may not exist, ignore.
		}
	}

	private async updateMetadataFields(sessionId: string, fields: Partial<ChatSessionMetadataFile>): Promise<void> {
		if (isUntitledSessionId(sessionId)) {
			return;
		}
		await this._ready;
		// Optimistically update in-memory cache so callers in the same process observe
		// the change immediately. We pass only the partial `fields` to
		// `updateSessionMetadata` — that method reads fresh from disk and merges, so it
		// cannot stomp fields written by other processes (Step 3b: stale-cache fix).
		const existing = this._cache[sessionId] ?? {};
		this._cache[sessionId] = { ...existing, ...fields };
		await this.updateSessionMetadata(sessionId, fields);
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
		await this._ready;
		if (typeof sessionId === 'string') {
			const metadata = await this.getSessionMetadata(sessionId);
			return metadata?.worktreeProperties;
		}
		const folder = sessionId;
		// First check the in-memory cache.
		for (const metadata of Object.values(this._cache)) {
			if (metadata.worktreeProperties?.worktreePath && isEqual(Uri.file(metadata.worktreeProperties.worktreePath), folder)) {
				return metadata.worktreeProperties;
			}
		}
		// Fallback to the JSONL worktree index → hydrate from the per-session file.
		const id = await this.findSessionIdForWorktree(folder);
		if (id) {
			const metadata = await this.getSessionMetadata(id);
			return metadata?.worktreeProperties;
		}
		return undefined;
	}
	async getSessionIdForWorktree(folder: vscode.Uri): Promise<string | undefined> {
		await this._ready;
		for (const [sessionId, value] of Object.entries(this._cache)) {
			if (value.worktreeProperties?.worktreePath && isEqual(vscode.Uri.file(value.worktreeProperties.worktreePath), folder)) {
				return sessionId;
			}
		}
		return this.findSessionIdForWorktree(folder);
	}

	/** Looks up a session id for a worktree folder via the JSONL index, with a throttled disk reload. */
	private async findSessionIdForWorktree(folder: vscode.Uri): Promise<string | undefined> {
		const cached = this._worktreeSessions.getSessionIdForFolder(folder);
		if (cached) {
			return cached;
		}
		await this._worktreeSessions.reloadIfStale();
		return this._worktreeSessions.getSessionIdForFolder(folder);
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
		await this._ready;
		const fileUri = this.getRequestMappingFileUri(sessionId);
		try {
			const content = await this.fileSystemService.readFile(fileUri);
			return JSON.parse(new TextDecoder().decode(content)) as RequestDetails[];
		} catch {
			return [];
		}
	}

	async updateRequestDetails(sessionId: string, details: (Partial<RequestDetails> & { vscodeRequestId: string })[]): Promise<void> {
		await this._ready;
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
		await this._ready;
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
		await this._ready;
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
		await this._ready;
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
		await this._ready;
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
		await this._ready;
		if (sessionId in this._cache) {
			return this._cache[sessionId];
		}

		const metadata = await this.readSessionMetadataFile(sessionId);
		if (metadata) {
			this._cache[sessionId] = metadata;
			return metadata;
		}

		// So we don't try again.
		this._cache[sessionId] = {};
		if (createMetadataFileIfNotFound) {
			await this.updateSessionMetadata(sessionId, { origin: 'other' });
			this.updateGlobalStorage();
		}
		return undefined;
	}

	/** Reads a per-session metadata file directly. Returns `undefined` if it doesn't exist or is invalid. */
	private async readSessionMetadataFile(sessionId: string): Promise<ChatSessionMetadataFile | undefined> {
		try {
			const fileUri = this.getMetadataFileUri(sessionId);
			const content = await this.fileSystemService.readFile(fileUri);
			return JSON.parse(new TextDecoder().decode(content)) as ChatSessionMetadataFile;
		} catch {
			return undefined;
		}
	}

	private async updateSessionMetadata(sessionId: string, updates: Partial<ChatSessionMetadataFile>, createDirectoryIfNotFound = true): Promise<void> {
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
			let diskFileExisted = true;
			try {
				const rawContent = await this.fileSystemService.readFile(fileUri);
				existing = JSON.parse(new TextDecoder().decode(rawContent));
			} catch {
				diskFileExisted = false;
				// File doesn't exist yet — check if the directory exists.
				try {
					await this.fileSystemService.stat(dirUri);
				} catch {
					if (!createDirectoryIfNotFound) {
						// Lets not delete the session from our storage, but mark it as written to session state so that we won't try to write to session state again and again.
						this._cache[sessionId] = { ...updates, writtenToDisc: true };
						this.updateGlobalStorage();
						return;
					}
					await this.fileSystemService.createDirectory(dirUri);
				}
			}

			// Merge order: cache (locally-known fields not yet flushed to disk)
			//             → disk existing (cross-process writes win over stale cache, Step 3b)
			//             → explicit `metadata` fields from this call (caller wins).
			// `undefined` values in `metadata` delete the corresponding key.
			const cacheExisting = diskFileExisted ? {} : (this._cache[sessionId] ?? {});
			const merged: ChatSessionMetadataFile = { ...cacheExisting, ...existing };
			for (const [key, value] of Object.entries(updates)) {
				if (value === undefined) {
					delete (merged as Record<string, unknown>)[key];
				} else {
					(merged as Record<string, unknown>)[key] = value;
				}
			}

			// Stamp timestamps. `created` is set only on first write; `modified` is
			// bumped on every write.
			const now = Date.now();
			merged.modified = now;
			if (merged.created === undefined) {
				merged.created = now;
			}

			const promises: Promise<unknown>[] = [];

			// Maintain the JSONL worktree index based on the post-merge worktreePath:
			//   - new entry → append a line and remember it
			//   - changed path → rewrite the file (rare)
			//   - cleared path → remove via rewrite
			const worktreePath = merged.worktreeProperties?.worktreePath;
			const indexed = this._worktreeSessions.getSessionEntry(sessionId);
			if (worktreePath) {
				if (!indexed) {
					promises.push(this._worktreeSessions.appendBatchToDisk([{ id: sessionId, path: worktreePath, created: merged.created }]));
				} else if (indexed.path !== worktreePath && !merged.kind) {
					this._worktreeSessions.addEntry({ id: sessionId, path: worktreePath, created: indexed.created });
					promises.push(this._worktreeSessions.writeToDisk());
				}
			} else if (indexed) {
				promises.push(this._worktreeSessions.removeAndWriteToDisk(sessionId));
			}

			const content = new TextEncoder().encode(JSON.stringify(merged, null, 2));
			promises.push(this.fileSystemService.writeFile(fileUri, content));

			await Promise.all(promises);

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
			// Serialize against `refresh()` and other bulk-file flushes via the shared
			// single-key sequencer. Inside the queue we re-read the on-disk file and
			// merge it with the in-memory cache using last-modified-wins semantics so
			// concurrent writers in another process do not lose data.
			await this._bulkSequencer.queue(BULK_SEQUENCER_KEY, async () => {
				const data: Record<string, ChatSessionMetadataFile> = { ...this._cache };
				try {
					const storageData = await this.getGlobalStorageData();
					for (const [sessionId, diskEntry] of Object.entries(storageData)) {
						const local = data[sessionId];
						if (!local) {
							data[sessionId] = diskEntry;
							this._cache[sessionId] = diskEntry;
							continue;
						}
						const localModified = local.modified ?? 0;
						const diskModified = diskEntry.modified ?? 0;
						if (diskModified > localModified) {
							data[sessionId] = diskEntry;
							this._cache[sessionId] = diskEntry;
						}
					}
				} catch {
					//
				}
				await this.writeToGlobalStorage(data);
			});
		} catch (error) {
			this.logService.error('[ChatSessionMetadataStore] Failed to update global storage: ', error);
		}
	}

	private async writeToGlobalStorage(allMetadata: Record<string, ChatSessionMetadataFile>): Promise<void> {
		// Make a shallow copy and trim to the top MAX_BULK_STORAGE_ENTRIES by `modified` desc.
		// The in-memory `_cache` is unaffected — only the on-disk file is bounded.
		// Per-session files in `~/.copilot/session-state/{id}/vscode.metadata.json` remain
		// the source of truth for evicted entries.
		const entries = Object.entries(allMetadata);
		let toWrite: Record<string, ChatSessionMetadataFile>;
		if (entries.length <= MAX_BULK_STORAGE_ENTRIES) {
			toWrite = { ...allMetadata };
		} else {
			entries.sort(([, a], [, b]) => (b.modified ?? 0) - (a.modified ?? 0));
			toWrite = Object.fromEntries(entries.slice(0, MAX_BULK_STORAGE_ENTRIES));
		}

		const dirUri = dirname(this._cacheFile);
		try {
			await this.fileSystemService.stat(dirUri);
		} catch {
			await this.fileSystemService.createDirectory(dirUri);
		}

		const content = new TextEncoder().encode(JSON.stringify(toWrite, null, 2));
		await this.fileSystemService.writeFile(this._cacheFile, content);
		this.logService.trace(`[ChatSessionMetadataStore] Wrote bulk metadata file with ${Object.keys(toWrite).length} session(s)`);
	}

	/**
	 * Re-reads the shared bulk file from disk and merges into `_cache` using
	 * last-modified-wins. Runs inside the bulk sequencer so it is serialized
	 * against {@link updateGlobalStorageImpl}. Never drops in-memory entries.
	 */
	private async reloadBulkFromDisk(): Promise<void> {
		return this._bulkSequencer.queue(BULK_SEQUENCER_KEY, async () => {
			let onDisk: Record<string, ChatSessionMetadataFile>;
			try {
				onDisk = await this.getGlobalStorageData();
			} catch {
				return;
			}
			for (const [id, diskEntry] of Object.entries(onDisk)) {
				const local = this._cache[id];
				if (!local) {
					this._cache[id] = diskEntry;
					continue;
				}
				const localModified = local.modified ?? 0;
				const diskModified = diskEntry.modified ?? 0;
				if (diskModified > localModified) {
					this._cache[id] = diskEntry;
				}
			}
		});
	}

	/**
	 * Merges the per-install legacy bulk file (`globalStorageUri/copilotcli/…`) into
	 * the shared `~/.copilot/` bulk file using last-modified-wins. This handles:
	 *   - First-run: shared file missing → copy legacy content into the shared file.
	 *   - Late-joiner: Process A already created the shared file → merge so entries
	 *     unique to this install are not lost.
	 *   - No legacy file: nothing to do.
	 */
	private async migrateLegacyBulkFile(): Promise<void> {
		// Skip if this install already migrated.
		if (this.extensionContext.globalState.get<boolean>(LEGACY_BULK_MIGRATED_KEY)) {
			return;
		}

		const legacyCacheFile = Uri.joinPath(this.extensionContext.globalStorageUri, 'copilotcli', LEGACY_BULK_METADATA_FILENAME);
		let legacyData: Record<string, ChatSessionMetadataFile>;
		try {
			const raw = await this.fileSystemService.readFile(legacyCacheFile);
			legacyData = JSON.parse(new TextDecoder().decode(raw));
		} catch {
			// No legacy file — mark as migrated so we don't retry.
			await this.extensionContext.globalState.update(LEGACY_BULK_MIGRATED_KEY, true);
			return;
		}

		try {
			await createDirectoryIfNotExists(this.fileSystemService, dirname(this._cacheFile));

			// Try to read the shared file (may or may not exist yet).
			let sharedData: Record<string, ChatSessionMetadataFile> = {};
			try {
				const raw = await this.fileSystemService.readFile(this._cacheFile);
				sharedData = JSON.parse(new TextDecoder().decode(raw));
			} catch {
				// Shared file doesn't exist yet — start empty.
			}

			// Merge legacy into shared using last-modified-wins.
			let merged = false;
			for (const [id, legacyEntry] of Object.entries(legacyData)) {
				const sharedEntry = sharedData[id];
				if (!sharedEntry) {
					sharedData[id] = legacyEntry;
					merged = true;
				} else {
					const sharedModified = sharedEntry.modified ?? 0;
					const legacyModified = legacyEntry.modified ?? 0;
					if (legacyModified > sharedModified) {
						sharedData[id] = legacyEntry;
						merged = true;
					}
				}
			}

			if (merged) {
				const content = new TextEncoder().encode(JSON.stringify(sharedData, null, 2));
				await this.fileSystemService.writeFile(this._cacheFile, content);
			}

			// Mark as migrated so subsequent startups skip this path.
			await this.extensionContext.globalState.update(LEGACY_BULK_MIGRATED_KEY, true);
			this.logService.info('[ChatSessionMetadataStore] Migrated legacy bulk metadata file to ~/.copilot/');
		} catch (err) {
			this.logService.error('[ChatSessionMetadataStore] Failed to migrate legacy bulk file: ', err);
		}
	}

	/**
	 * For every cached session with a `worktreePath`, ensure a JSONL entry exists.
	 */
	private async topUpJsonlIndexFromCache(): Promise<void> {
		// Load the JSONL worktree index from disk first so the scan below can
		// tell which entries already exist and avoid re-appending duplicates.
		let { rewriteNeeded } = await this._worktreeSessions.loadFromDisk();

		const toAppend: WorktreeSessionEntry[] = [];
		for (const [id, metadata] of Object.entries(this._cache)) {
			const path = metadata.worktreeProperties?.worktreePath;
			if (!path || metadata.kind) {
				continue;
			}
			const existing = this._worktreeSessions.getSessionEntry(id);
			if (existing && existing.path === path) {
				continue;
			}
			const entry: WorktreeSessionEntry = { id, path, created: existing?.created ?? metadata.created ?? Date.now() };
			this._worktreeSessions.addEntry(entry);
			if (existing) {
				// Path changed — a full rewrite is needed.
				rewriteNeeded = true;
			} else {
				toAppend.push(entry);
			}
		}

		if (rewriteNeeded) {
			await this._worktreeSessions.writeToDisk();
		} else if (toAppend.length > 0) {
			await this._worktreeSessions.appendBatchToDisk(toAppend);
		}

		// One-time full scan of ~/.copilot/session-state/ to discover worktree
		// sessions that were never recorded in the JSONL (e.g. sessions created
		// before the JSONL index existed, or evicted from the bulk cache).
		await this.scanSessionStateDirForWorktrees();
	}

	/**
	 * One-time scan of `~/.copilot/session-state/` to discover worktree sessions
	 * not yet in the JSONL index. Reads per-session metadata files in batches of
	 * {@link SESSION_SCAN_BATCH_SIZE} to avoid saturating I/O. Gated by a memento
	 * so it only runs once per install.
	 */
	private async scanSessionStateDirForWorktrees(): Promise<void> {
		if (this.extensionContext.globalState.get<boolean>(JSONL_SCAN_DONE_KEY)) {
			return;
		}

		const sessionStateDir = Uri.file(getCopilotCLISessionStateDir());
		let entries: [string, number][];
		try {
			entries = await this.fileSystemService.readDirectory(sessionStateDir);
		} catch {
			// Directory doesn't exist — nothing to scan.
			await this.extensionContext.globalState.update(JSONL_SCAN_DONE_KEY, true);
			return;
		}

		// Collect session IDs we don't already know about.
		const unknownIds: string[] = [];
		for (const [name] of entries) {
			if (name in this._cache || this._worktreeSessions.has(name)) {
				continue;
			}
			unknownIds.push(name);
		}

		if (unknownIds.length === 0) {
			await this.extensionContext.globalState.update(JSONL_SCAN_DONE_KEY, true);
			return;
		}

		// Read metadata files in batches.
		let discovered = false;
		for (let i = 0; i < unknownIds.length; i += SESSION_SCAN_BATCH_SIZE) {
			const batch = unknownIds.slice(i, i + SESSION_SCAN_BATCH_SIZE);
			const results = await Promise.all(batch.map(async id => {
				const metadata = await this.readSessionMetadataFile(id);
				return { id, metadata };
			}));
			for (const { id, metadata } of results) {
				if (!metadata?.worktreeProperties?.worktreePath || metadata.kind) {
					continue;
				}
				const path = metadata.worktreeProperties.worktreePath;
				if (!this._worktreeSessions.has(id)) {
					this._worktreeSessions.addEntry({ id, path, created: metadata.created ?? Date.now() });
					discovered = true;
				}
			}
		}

		if (discovered) {
			await this._worktreeSessions.writeToDisk();
		}
		await this.extensionContext.globalState.update(JSONL_SCAN_DONE_KEY, true);
		this.logService.info(`[ChatSessionMetadataStore] Session-state scan complete: checked ${unknownIds.length} unknown session(s)`);
	}
}
