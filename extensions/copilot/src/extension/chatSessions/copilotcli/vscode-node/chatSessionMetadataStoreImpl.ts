/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as nodePath from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { createDirectoryIfNotExists, IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../../platform/log/common/logService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { findLast } from '../../../../util/vs/base/common/arraysFind';
import { disposableTimeout, SequencerByKey, ThrottledDelayer, timeout } from '../../../../util/vs/base/common/async';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Disposable, DisposableMap, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { generateUuid } from '../../../../util/vs/base/common/uuid';
import { dirname } from '../../../../util/vs/base/common/resources';
import { ChatSessionMetadataFile, IChatSessionMetadataStore, RepositoryProperties, RequestDetails, WorkspaceFolderEntry } from '../../common/chatSessionMetadataStore';
import { ChatSessionWorktreeData, ChatSessionWorktreeProperties } from '../../common/chatSessionWorktreeService';
import { isUntitledSessionId } from '../../common/utils';
import { IWorkspaceInfo } from '../../common/workspaceInfo';
import { getCopilotBulkMetadataFile, getCopilotCLISessionDir } from '../../copilotcli/node/cliHelpers';
import { ICopilotCLIAgents } from '../../copilotcli/node/copilotCli';

/** Original `globalState` stores, read only by the one-time per-session backfill. */
const LEGACY_WORKSPACE_FOLDER_MEMENTO_KEY = 'github.copilot.cli.sessionWorkspaceFolders';
const LEGACY_WORKTREE_MEMENTO_KEY = 'github.copilot.cli.sessionWorktrees';
const LEGACY_BULK_METADATA_FILENAME = 'copilotcli.session.metadata.json';
const LEGACY_BULK_MIGRATED_KEY = 'github.copilot.cli.legacyBulkMigrated';
const SESSION_METADATA_BACKFILLED_KEY = 'github.copilot.cli.sessionMetadataBackfilled.v1';
const SESSION_METADATA_BACKFILL_ATTEMPTS_KEY = 'github.copilot.cli.sessionMetadataBackfillAttempts.v1';
/** Delay before the one-time backfill starts, so it does not compete with startup session listing and restore. */
const SESSION_METADATA_BACKFILL_DELAY_MS = 60_000;
/** The backfill pauses after every batch so catalogs with thousands of sessions are processed at a bounded rate. */
const SESSION_METADATA_BACKFILL_BATCH_SIZE = 100;
const SESSION_METADATA_BACKFILL_BATCH_PAUSE_MS = 50;
/** A run stops after this many consecutive write failures (e.g. a read-only file system) and retries on a later start. */
const SESSION_METADATA_BACKFILL_MAX_CONSECUTIVE_FAILURES = 20;
/** Incomplete runs are retried on later starts up to this many times. */
const SESSION_METADATA_BACKFILL_MAX_ATTEMPTS = 3;
const SESSION_METADATA_BACKFILL_MAX_LOGGED_FAILURES = 10;
const REQUEST_MAPPING_FILENAME = 'vscode.requests.metadata.json';
const SAFE_SESSION_ID = /^[\w.-]+$/;

type BulkMetadataFileStatus = 'present' | 'missing' | 'invalid';
type SessionMetadataBackfillResult = 'exists' | 'missingSessionDirectory' | 'written' | 'failed';

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

	/** Session ID → indexed path and kind, for reverse-lookup cleanup. */
	private readonly _sessionFolderEntry = new Map<string, { path: string; kind: 'worktree' | 'folder' }>();
	/** Folder path → set of session IDs (worktree path or workspace folder path). */
	private readonly _folderToSessions = new Map<string, Set<string>>();

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
	private readonly _requestMappingReadSequencer = new SequencerByKey<string>();
	private readonly _metadataWriteSequencer = new SequencerByKey<string>();
	private readonly _metadataReadSequencer = new SequencerByKey<string>();
	private readonly _requestDetailsCache = new Map<string, RequestDetails[]>();
	/** Per-session eviction timers for {@link _requestDetailsCache}. Keyed by sessionId so a new timer replaces (and disposes) the previous one and entries are dropped on fire. */
	private readonly _requestDetailsCacheTimers = this._register(new DisposableMap<string>());

	/** Serializes bulk-file flush against {@link reloadBulkFromDisk}. */
	private readonly _bulkSequencer = new SequencerByKey<string>();

	/** Background one-time backfill of per-session metadata files; see {@link backfillSessionMetadataFiles}. */
	private readonly _sessionMetadataBackfill: Promise<void>;
	/** Cancelled on dispose so the backfill's delays and loop stop promptly. */
	private readonly _sessionMetadataBackfillCancellation = new CancellationTokenSource();
	/** Whether the per-install bulk file had been merged on an earlier start, captured before {@link initializeStorage} merges it. */
	private readonly _legacyBulkMigratedBeforeStartup: boolean;

	constructor(
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ICopilotCLIAgents private readonly copilotCLIAgents: ICopilotCLIAgents,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._legacyBulkMigratedBeforeStartup = this.extensionContext.globalState.get<boolean>(LEGACY_BULK_MIGRATED_KEY) === true;
		this._ready = this.initializeStorage();
		this._ready.catch(error => {
			this.logService.error('[ChatSessionMetadataStore] Initialization failed: ', error);
		});
		// Deferred past startup; reads and writes never wait for it.
		this._register(toDisposable(() => this._sessionMetadataBackfillCancellation.dispose(true)));
		this._sessionMetadataBackfill = this._ready.catch(() => undefined)
			.then(() => this.backfillSessionMetadataFilesAfterStartup())
			.catch(error => {
				this.logService.error('[ChatSessionMetadataStore] Session metadata backfill failed: ', error);
			});
	}

	/** Resolves once the one-time per-session metadata backfill has finished. */
	public whenSessionMetadataBackfilled(): Promise<void> {
		return this._sessionMetadataBackfill;
	}

	public refresh(): Promise<void> {
		// Chain onto the existing `_ready` — concurrent calls collapse to at most one
		// in-flight + one pending. `.catch(() => undefined)` ensures a failed prior
		// step does not poison subsequent reads/writes.
		this._ready = this._ready.catch(() => undefined).then(() => this.reloadBulkFromDisk());
		return this._ready;
	}

	public getSessionIdsForFolder(folder: vscode.Uri): string[] {
		return Array.from(this._folderToSessions.get(folder.fsPath) ?? []);
	}

	public getWorktreeSessions(folder: vscode.Uri): string[] {
		const sessions = this._folderToSessions.get(folder.fsPath);
		if (!sessions) {
			return [];
		}
		const result: string[] = [];
		for (const sessionId of sessions) {
			if (this._sessionFolderEntry.get(sessionId)?.kind === 'worktree') {
				result.push(sessionId);
			}
		}
		return result;
	}

	/**
	 * Maintains {@link _sessionFolderEntry} and {@link _folderToSessions} so
	 * that {@link getSessionIdsForFolder} and {@link getWorktreeSessions}
	 * are O(1) lookups instead of full-cache scans.
	 */
	private _updateFolderIndex(sessionId: string, metadata: ChatSessionMetadataFile | undefined): void {
		// Remove old entry
		const old = this._sessionFolderEntry.get(sessionId);
		if (old) {
			const set = this._folderToSessions.get(old.path);
			if (set) {
				set.delete(sessionId);
				if (set.size === 0) {
					this._folderToSessions.delete(old.path);
				}
			}
			this._sessionFolderEntry.delete(sessionId);
		}

		if (!metadata) {
			return;
		}

		// Prefer worktree path over workspace folder path
		const worktreePath = metadata.worktreeProperties?.worktreePath;
		const folderPath = metadata.workspaceFolder?.folderPath;
		const path = worktreePath ?? folderPath;
		if (!path) {
			return;
		}

		const kind: 'worktree' | 'folder' = worktreePath ? 'worktree' : 'folder';
		this._sessionFolderEntry.set(sessionId, { path, kind });
		let set = this._folderToSessions.get(path);
		if (!set) {
			set = new Set();
			this._folderToSessions.set(path, set);
		}
		set.add(sessionId);
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

		// Build folder index from the cleaned cache.
		for (const [sessionId, metadata] of Object.entries(this._cache)) {
			this._updateFolderIndex(sessionId, metadata);
		}

		// this.extensionContext.globalState.update(WORKTREE_MEMENTO_KEY, undefined);
		// this.extensionContext.globalState.update(WORKSPACE_FOLDER_MEMENTO_KEY, undefined);
	}

	public getMetadataFileUri(sessionId: string): vscode.Uri {
		return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), 'vscode.metadata.json');
	}

	private getRequestMappingFileUri(sessionId: string): vscode.Uri {
		return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), REQUEST_MAPPING_FILENAME);
	}

	async deleteSessionMetadata(sessionId: string): Promise<void> {
		await this._ready;
		this._requestDetailsCache.delete(sessionId);
		this._requestDetailsCacheTimers.deleteAndDispose(sessionId);
		if (sessionId in this._cache) {
			delete this._cache[sessionId];
			this._updateFolderIndex(sessionId, undefined);
			const data = await this.getGlobalStorageData().catch(() => ({} as Record<string, ChatSessionMetadataFile>));
			delete data[sessionId];
			await this.writeToGlobalStorage(data);
		}
		try {
			await Promise.allSettled([
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
		this._updateFolderIndex(sessionId, this._cache[sessionId]);
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

	async getWorktreeProperties(sessionId: string): Promise<ChatSessionWorktreeProperties | undefined> {
		await this._ready;
		const metadata = await this.getSessionMetadata(sessionId);
		return metadata?.worktreeProperties;
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
		const details = this._requestDetailsCache.get(sessionId);
		if (details) {
			this.cacheRequestDetails(sessionId, details);
			return details;
		}
		return this._requestMappingReadSequencer.queue(sessionId, async () => {
			await this._ready;
			const fileUri = this.getRequestMappingFileUri(sessionId);
			try {
				const content = await this.fileSystemService.readFile(fileUri);
				const details = JSON.parse(new TextDecoder().decode(content)) as RequestDetails[];
				this.cacheRequestDetails(sessionId, details);
				return details;
			} catch {
				return [];
			}
		});
	}

	private cacheRequestDetails(sessionId: string, details: RequestDetails[]): void {
		this._requestDetailsCache.set(sessionId, details);
		// Cache for the next 5s, if not used, delete from cache. Storing in a DisposableMap
		// keyed by sessionId means a re-cache disposes the previous timer (extending TTL),
		// and the handler removes its own map entry so timers do not accumulate over time.
		this._requestDetailsCacheTimers.set(sessionId, disposableTimeout(() => {
			this._requestDetailsCache.delete(sessionId);
			this._requestDetailsCacheTimers.deleteAndLeak(sessionId);
		}, 5_000));
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
		return findLast(details, d => !!d.modeInstructions)?.modeInstructions?.uri ?? findLast(details, d => !!d.agentId)?.agentId ?? this.copilotCLIAgents.getSessionAgent(sessionId);
	}

	private async writeRequestDetails(sessionId: string, details: RequestDetails[]): Promise<void> {
		await this._ready;
		if (isUntitledSessionId(sessionId)) {
			return;
		}
		this.cacheRequestDetails(sessionId, details);
		const fileUri = this.getRequestMappingFileUri(sessionId);
		const dirUri = dirname(fileUri);
		await createDirectoryIfNotExists(this.fileSystemService, dirUri);
		const content = new TextEncoder().encode(JSON.stringify(details, null, 2));
		await this.fileSystemService.writeFile(fileUri, content);
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
			archived: false,
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

	public async getSessionParentId(sessionId: string): Promise<{ parentSessionId: string; kind: 'forked' | 'sub-session' } | undefined> {
		const metadata = await this.getSessionMetadata(sessionId, false);
		if (!metadata?.parentSessionId || !metadata.kind) {
			return undefined;
		}
		return { parentSessionId: metadata.parentSessionId, kind: metadata.kind };
	}

	public async setSessionArchived(sessionId: string, archived: boolean): Promise<void> {
		await this._ready;
		await this.updateMetadataFields(sessionId, { archived });
	}

	public async getSessionArchived(sessionId: string): Promise<boolean> {
		const metadata = await this.getSessionMetadata(sessionId, false);
		return metadata?.archived === true;
	}

	private async getSessionMetadata(sessionId: string, createMetadataFileIfNotFound = true): Promise<ChatSessionMetadataFile | undefined> {
		if (isUntitledSessionId(sessionId)) {
			return undefined;
		}
		if (sessionId in this._cache) {
			return this._cache[sessionId];
		}
		await this._ready;
		if (sessionId in this._cache) {
			return this._cache[sessionId];
		}

		const metadata = await this.readSessionMetadataFile(sessionId);
		if (metadata) {
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
		return this._metadataReadSequencer.queue(sessionId, async () => {
			try {
				const fileUri = this.getMetadataFileUri(sessionId);
				const content = await this.fileSystemService.readFile(fileUri);
				const metadata = JSON.parse(new TextDecoder().decode(content)) as ChatSessionMetadataFile;
				if (metadata) {
					this._cache[sessionId] = metadata;
					this._updateFolderIndex(sessionId, metadata);
					return metadata;
				}

				// So we don't try again.
				this._cache[sessionId] = {};
				return undefined;
			} catch {
				// So we don't try again.
				this._cache[sessionId] = {};
				return undefined;
			}
		});
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
						this._updateFolderIndex(sessionId, this._cache[sessionId]);
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

			const content = new TextEncoder().encode(JSON.stringify(merged, null, 2));
			await this.fileSystemService.writeFile(fileUri, content);

			this._cache[sessionId] = { ...merged, writtenToDisc: true };
			this._updateFolderIndex(sessionId, this._cache[sessionId]);
			this.updateGlobalStorage();
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
							this._updateFolderIndex(sessionId, diskEntry);
							continue;
						}
						const localModified = local.modified ?? 0;
						const diskModified = diskEntry.modified ?? 0;
						if (diskModified > localModified) {
							data[sessionId] = diskEntry;
							this._cache[sessionId] = diskEntry;
							this._updateFolderIndex(sessionId, diskEntry);
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
					this._updateFolderIndex(id, diskEntry);
					continue;
				}
				const localModified = local.modified ?? 0;
				const diskModified = diskEntry.modified ?? 0;
				if (diskModified > localModified) {
					this._cache[id] = diskEntry;
					this._updateFolderIndex(id, diskEntry);
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

		const legacyCacheFile = this.getLegacyBulkFileUri();
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
	 * Reads the original pre-file metadata store: two extension `globalState`
	 * keys that were never cleared. Users who skipped every build that copied them
	 * into the per-install file (2026-02 to 2026-04) have their oldest sessions'
	 * metadata only here. Parsed the way that copy did; worktree data wins.
	 */
	private readGlobalStateMetadata(): Record<string, ChatSessionMetadataFile> {
		const result: Record<string, ChatSessionMetadataFile> = {};
		const folders = this.extensionContext.globalState.get<Record<string, string | Partial<WorkspaceFolderEntry> | undefined>>(LEGACY_WORKSPACE_FOLDER_MEMENTO_KEY, {});
		for (const [sessionId, entry] of Object.entries(folders ?? {})) {
			if (entry && typeof entry === 'object' && typeof entry.folderPath === 'string' && entry.folderPath && typeof entry.timestamp === 'number' && entry.timestamp) {
				result[sessionId] = { workspaceFolder: { folderPath: entry.folderPath, timestamp: entry.timestamp } };
			}
		}
		const worktrees = this.extensionContext.globalState.get<Record<string, string | Partial<ChatSessionWorktreeData> | undefined>>(LEGACY_WORKTREE_MEMENTO_KEY, {});
		for (const [sessionId, value] of Object.entries(worktrees ?? {})) {
			if (!value || typeof value !== 'object' || typeof value.data !== 'string') {
				continue;
			}
			try {
				const parsed = JSON.parse(value.data);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					result[sessionId] = { worktreeProperties: (value.version === 1 ? { ...parsed, version: 1 } : parsed) as ChatSessionWorktreeProperties };
				}
			} catch {
				// Unreadable entry; skip it.
			}
		}
		return result;
	}

	private getLegacyBulkFileUri(): vscode.Uri {
		return Uri.joinPath(this.extensionContext.globalStorageUri, 'copilotcli', LEGACY_BULK_METADATA_FILENAME);
	}

	private isSessionMetadataBackfilled(): boolean {
		return this.extensionContext.globalState.get<boolean>(SESSION_METADATA_BACKFILLED_KEY) === true;
	}

	private async backfillSessionMetadataFilesAfterStartup(): Promise<void> {
		if (this.isSessionMetadataBackfilled()) {
			return;
		}
		if (await this.waitForSessionMetadataBackfill(SESSION_METADATA_BACKFILL_DELAY_MS)) {
			await this.backfillSessionMetadataFiles();
		}
	}

	/** Waits unless the store is disposed first; returns whether the backfill may continue. */
	private async waitForSessionMetadataBackfill(millis: number): Promise<boolean> {
		const token = this._sessionMetadataBackfillCancellation.token;
		try {
			await timeout(millis, token);
		} catch {
			// Cancelled on dispose.
		}
		return !token.isCancellationRequested;
	}

	/**
	 * One-time backfill of per-session `vscode.metadata.json` files from both bulk
	 * stores (the shared `~/.copilot/` cache and the older per-install globalStorage
	 * file).
	 *
	 * The agent host identifies legacy VS Code Copilot CLI sessions solely by the
	 * per-session file, so a session whose metadata only exists in a bulk file
	 * (e.g. an older session whose per-session write never landed) would not be
	 * migrated once the extension-host provider is retired. Existing per-session
	 * files are never overwritten, non-VS Code entries are skipped, and the entry
	 * is written as stored so `created`/`modified` keep their original values.
	 *
	 * It only adds missing per-session files: the in-memory cache, the bulk file
	 * and the session list are left untouched (the SDK derives a session's modified
	 * time from its event log, so adding a file does not reorder sessions). Files
	 * are processed one at a time with a short pause after every batch, so large
	 * catalogs are handled at a bounded rate. Every window runs it until one
	 * completes, so it stops early once another window has recorded completion.
	 */
	private async backfillSessionMetadataFiles(): Promise<void> {
		if (this.isSessionMetadataBackfilled()) {
			return;
		}
		const startTime = Date.now();
		const [shared, perInstall] = await Promise.all([
			this.readBulkMetadataFile(this._cacheFile),
			this.readBulkMetadataFile(this.getLegacyBulkFileUri()),
		]);
		const globalStateData = this.readGlobalStateMetadata();

		// Newest `modified` wins when a session is in both files.
		const candidates = new Map<string, ChatSessionMetadataFile>();
		for (const data of [shared.data, perInstall.data]) {
			for (const [sessionId, entry] of Object.entries(data)) {
				const existing = candidates.get(sessionId);
				if (!existing || (entry?.modified ?? 0) > (existing.modified ?? 0)) {
					candidates.set(sessionId, entry);
				}
			}
		}
		// The oldest store only fills gaps: the bulk files hold newer copies of the same sessions.
		let globalStateOnly = 0;
		for (const [sessionId, entry] of Object.entries(globalStateData)) {
			if (!candidates.has(sessionId)) {
				candidates.set(sessionId, entry);
				globalStateOnly++;
			}
		}

		const counts: Record<SessionMetadataBackfillResult | 'notVSCode', number> = { notVSCode: 0, exists: 0, missingSessionDirectory: 0, written: 0, failed: 0 };
		let checked = 0;
		let consecutiveFailures = 0;
		let aborted = false;
		for (const [sessionId, entry] of candidates) {
			if (this._sessionMetadataBackfillCancellation.token.isCancellationRequested || this.isSessionMetadataBackfilled()) {
				return;
			}
			if (!isBackfillableSessionMetadata(sessionId, entry)) {
				counts.notVSCode++;
				continue;
			}
			if (checked > 0 && checked % SESSION_METADATA_BACKFILL_BATCH_SIZE === 0 && !await this.waitForSessionMetadataBackfill(SESSION_METADATA_BACKFILL_BATCH_PAUSE_MS)) {
				return;
			}
			checked++;
			const result = await this._metadataWriteSequencer.queue(sessionId, () => this.backfillSessionMetadataFile(sessionId, entry, counts.failed < SESSION_METADATA_BACKFILL_MAX_LOGGED_FAILURES));
			counts[result]++;
			consecutiveFailures = result === 'failed' ? consecutiveFailures + 1 : 0;
			if (consecutiveFailures >= SESSION_METADATA_BACKFILL_MAX_CONSECUTIVE_FAILURES) {
				aborted = true;
				break;
			}
		}

		// Incomplete runs retry on later starts, but only a bounded number of times.
		const attempt = (this.extensionContext.globalState.get<number>(SESSION_METADATA_BACKFILL_ATTEMPTS_KEY) ?? 0) + 1;
		const completed = !aborted && counts.failed === 0 && shared.status !== 'invalid' && perInstall.status !== 'invalid';
		if (completed || attempt >= SESSION_METADATA_BACKFILL_MAX_ATTEMPTS) {
			await this.extensionContext.globalState.update(SESSION_METADATA_BACKFILLED_KEY, true);
		} else {
			await this.extensionContext.globalState.update(SESSION_METADATA_BACKFILL_ATTEMPTS_KEY, attempt);
		}
		this.logService.info(`[ChatSessionMetadataStore] Session metadata backfill: attempt=${attempt}, completed=${completed}, aborted=${aborted}, shared=${shared.status}(${Object.keys(shared.data).length}), perInstall=${perInstall.status}(${Object.keys(perInstall.data).length}), globalState=${Object.keys(globalStateData).length}, candidates=${candidates.size}, notVSCode=${counts.notVSCode}, exists=${counts.exists}, missingSessionDirectory=${counts.missingSessionDirectory}, written=${counts.written}, failed=${counts.failed}`);

		/* __GDPR__
			"copilotcli.sessionMetadataBackfill" : {
				"owner": "vijayupadya",
				"comment": "One-time backfill of per-session Copilot CLI metadata files from the bulk metadata stores, so legacy sessions stay discoverable by the agent host after the extension-host provider is retired. Contains counts only.",
				"sharedBulkFile" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the shared ~/.copilot bulk metadata file was present, missing or unreadable." },
				"perInstallBulkFile" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the older per-install globalStorage bulk metadata file was present, missing or unreadable." },
				"legacyBulkMigrated" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the per-install bulk file had already been merged into the shared file on an earlier start (captured before this start's merge)." },
				"sharedAtCap" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the shared bulk metadata file holds at least its 1000-entry cap, so older entries may have been evicted from it." },
				"completed" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether this run finished without failures." },
				"aborted" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether this run stopped early after repeated consecutive write failures." },
				"attempt" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Which run this is; incomplete runs are retried on later starts up to a fixed limit." },
				"sharedEntryCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of entries in the shared bulk metadata file." },
				"perInstallEntryCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of entries in the per-install bulk metadata file." },
				"globalStateEntryCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of sessions in the original extension globalState metadata store." },
				"globalStateOnlyCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Sessions found only in the original globalState store and in neither bulk file." },
				"candidateCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of distinct sessions across both bulk files." },
				"notVSCodeCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Entries skipped because they are not VS Code-created sessions or have an invalid session id." },
				"existingFileCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "VS Code sessions that already had a per-session metadata file." },
				"missingSessionDirectoryCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "VS Code sessions whose session-state directory no longer exists." },
				"writtenCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "VS Code sessions whose missing per-session metadata file was written by the backfill." },
				"failedCount" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Per-session metadata files that could not be written." },
				"durationMs" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Time taken by the backfill in milliseconds." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('copilotcli.sessionMetadataBackfill', {
			sharedBulkFile: shared.status,
			perInstallBulkFile: perInstall.status,
			legacyBulkMigrated: String(this._legacyBulkMigratedBeforeStartup),
			sharedAtCap: String(Object.keys(shared.data).length >= MAX_BULK_STORAGE_ENTRIES),
			completed: String(completed),
			aborted: String(aborted),
		}, {
			attempt,
			sharedEntryCount: Object.keys(shared.data).length,
			perInstallEntryCount: Object.keys(perInstall.data).length,
			globalStateEntryCount: Object.keys(globalStateData).length,
			globalStateOnlyCount: globalStateOnly,
			candidateCount: candidates.size,
			notVSCodeCount: counts.notVSCode,
			existingFileCount: counts.exists,
			missingSessionDirectoryCount: counts.missingSessionDirectory,
			writtenCount: counts.written,
			failedCount: counts.failed,
			durationMs: Date.now() - startTime,
		});
	}

	private async backfillSessionMetadataFile(sessionId: string, entry: ChatSessionMetadataFile, logFailure: boolean): Promise<SessionMetadataBackfillResult> {
		const fileUri = this.getMetadataFileUri(sessionId);
		const fail = (error: unknown): SessionMetadataBackfillResult => {
			if (logFailure) {
				this.logService.error(error instanceof Error ? error : String(error), `[ChatSessionMetadataStore] Failed to backfill metadata for session ${sessionId}`);
			}
			return 'failed';
		};
		try {
			const sessionDirectory = await this.fileSystemService.stat(dirname(fileUri));
			if ((sessionDirectory.type & FileType.Directory) === 0) {
				return 'missingSessionDirectory';
			}
		} catch (error) {
			return isFileNotFoundError(error) ? 'missingSessionDirectory' : fail(error);
		}
		const { writtenToDisc: _writtenToDisc, ...metadata } = entry;
		try {
			// Create-only: another window or app may write this file concurrently, and its data must win.
			const created = await this.createSessionMetadataFileIfAbsent(fileUri, new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
			return created ? 'written' : 'exists';
		} catch (error) {
			return isFileNotFoundError(error) ? 'missingSessionDirectory' : fail(error);
		}
	}

	/** Atomically creates the file unless it already exists; returns whether it was created. */
	protected createSessionMetadataFileIfAbsent(uri: vscode.Uri, content: Uint8Array): Promise<boolean> {
		return writeFileIfAbsent(uri.fsPath, content);
	}

	private async readBulkMetadataFile(uri: vscode.Uri): Promise<{ status: BulkMetadataFileStatus; data: Record<string, ChatSessionMetadataFile> }> {
		let raw: Uint8Array;
		try {
			// Bulk files can exceed the default read limit; they are read once, in the background.
			raw = await this.fileSystemService.readFile(uri, true);
		} catch (error) {
			return { status: isFileNotFoundError(error) ? 'missing' : 'invalid', data: {} };
		}
		try {
			const data = JSON.parse(new TextDecoder().decode(raw));
			return data && typeof data === 'object' && !Array.isArray(data)
				? { status: 'present', data: data as Record<string, ChatSessionMetadataFile> }
				: { status: 'invalid', data: {} };
		} catch {
			return { status: 'invalid', data: {} };
		}
	}
}

/** File operations used by {@link writeFileIfAbsent}; injectable for fault-injection tests. */
export type WriteFileIfAbsentFileSystem = Pick<typeof fs, 'writeFile' | 'link' | 'unlink' | 'open'>;

/**
 * Creates a file with its complete contents only if it does not exist yet, so a
 * concurrent writer is never overwritten and an interrupted write never leaves
 * a partial file behind. Returns `false` if it already exists.
 *
 * The contents are written to a temporary file that is then hard-linked into
 * place; `link` fails with `EEXIST` instead of replacing an existing file. File
 * systems without hard links fall back to an exclusive create that removes its
 * own partial file if the write fails.
 */
export async function writeFileIfAbsent(path: string, content: Uint8Array, fileSystem: WriteFileIfAbsentFileSystem = fs): Promise<boolean> {
	const temp = nodePath.join(nodePath.dirname(path), `.${nodePath.basename(path)}.${generateUuid()}.tmp`);
	try {
		await fileSystem.writeFile(temp, content, { flag: 'wx' });
		try {
			await fileSystem.link(temp, path);
			return true;
		} catch (error) {
			const code = getErrorCode(error);
			if (code === 'EEXIST') {
				return false;
			}
			if (code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'ENOSYS' && code !== 'EXDEV') {
				throw error;
			}
		}
	} finally {
		await fileSystem.unlink(temp).catch(() => undefined);
	}
	return writeFileExclusively(path, content, fileSystem);
}

async function writeFileExclusively(path: string, content: Uint8Array, fileSystem: WriteFileIfAbsentFileSystem): Promise<boolean> {
	let handle: fs.FileHandle;
	try {
		handle = await fileSystem.open(path, 'wx');
	} catch (error) {
		if (getErrorCode(error) === 'EEXIST') {
			return false;
		}
		throw error;
	}
	let written = false;
	try {
		await handle.writeFile(content);
		written = true;
	} finally {
		await handle.close();
		if (!written) {
			// The file was created by this call, so removing it cannot discard another writer's data.
			await fileSystem.unlink(path).catch(() => undefined);
		}
	}
	return true;
}

function getErrorCode(error: unknown): unknown {
	return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

/** Whether an error from the file system service or Node means the path does not exist. */
function isFileNotFoundError(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === 'FileNotFound' || code === 'ENOENT' || (error instanceof Error && error.message.startsWith('ENOENT'));
}

/**
 * Whether a bulk metadata entry describes a session created by VS Code and is
 * safe to backfill. Mirrors `getSessionOrigin` (and the agent host's legacy
 * marker check): an explicit `origin` wins, and origin-less entries (written
 * before `origin` existed) count only when they carry VS Code-specific
 * workspace properties.
 */
function isBackfillableSessionMetadata(sessionId: string, entry: ChatSessionMetadataFile | undefined): entry is ChatSessionMetadataFile {
	if (!SAFE_SESSION_ID.test(sessionId) || sessionId === '.' || sessionId === '..' || isUntitledSessionId(sessionId)) {
		return false;
	}
	if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
		return false;
	}
	if (entry.origin !== undefined) {
		return entry.origin === 'vscode';
	}
	return entry.repositoryProperties !== undefined
		|| entry.worktreeProperties !== undefined
		|| entry.workspaceFolder !== undefined;
}
