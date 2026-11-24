/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import * as nodePath from 'path';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { timeout } from '../../../util/vs/base/common/async';
import { CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { dirname } from '../../../util/vs/base/common/resources';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { ChatSessionMetadataFile, WorkspaceFolderEntry } from '../common/chatSessionMetadataStore';
import { ChatSessionWorktreeData, ChatSessionWorktreeProperties } from '../common/chatSessionWorktreeService';
import { sessionMetadataFileWriteSequencer } from '../common/sessionMetadataFileWriteSequencer';
import { isUntitledSessionId } from '../common/utils';
import { getCopilotBulkMetadataFile, getCopilotCLISessionDir } from '../copilotcli/node/cliHelpers';

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
/** Entry cap of the shared bulk metadata file; reported so evictions from it are visible. */
const MAX_BULK_STORAGE_ENTRIES = 1000;
const SAFE_SESSION_ID = /^[\w.-]+$/;

type BulkMetadataFileStatus = 'present' | 'missing' | 'invalid';
type SessionMetadataBackfillResult = 'exists' | 'missingSessionDirectory' | 'written' | 'failed';

/**
 * One-time backfill of per-session `vscode.metadata.json` files for legacy
 * extension-host Copilot CLI sessions, so the agent host can still discover and
 * migrate them. It does not depend on the extension-host Copilot CLI session
 * provider, so it keeps running after that provider is removed.
 */
export class LegacySessionMetadataBackfill extends Disposable {

	/** Path of the shared bulk metadata cache file in `~/.copilot/`. */
	private readonly _sharedBulkFile = Uri.file(getCopilotBulkMetadataFile());
	/** Background one-time backfill of per-session metadata files; see {@link backfillSessionMetadataFiles}. */
	private readonly _sessionMetadataBackfill: Promise<void>;
	/** Cancelled on dispose so the backfill's delays and loop stop promptly. */
	private readonly _sessionMetadataBackfillCancellation = new CancellationTokenSource();
	/**
	 * Whether the per-install bulk file had been merged on an earlier start. Read at
	 * construction, before the extension-host session metadata store merges it on this start.
	 */
	private readonly _legacyBulkMigratedBeforeStartup: boolean;

	constructor(
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ILogService private readonly logService: ILogService,
		@IVSCodeExtensionContext private readonly extensionContext: IVSCodeExtensionContext,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._legacyBulkMigratedBeforeStartup = this.extensionContext.globalState.get<boolean>(LEGACY_BULK_MIGRATED_KEY) === true;
		this._register(toDisposable(() => this._sessionMetadataBackfillCancellation.dispose(true)));
		this._sessionMetadataBackfill = this.backfillSessionMetadataFilesAfterStartup()
			.catch(error => {
				this.logService.error('[LegacySessionMetadataBackfill] Session metadata backfill failed: ', error);
			});
	}

	/** Resolves once the one-time per-session metadata backfill has finished. */
	public whenSessionMetadataBackfilled(): Promise<void> {
		return this._sessionMetadataBackfill;
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
	 * It only adds missing per-session files: the bulk files and the session list
	 * are left untouched (the SDK derives a session's modified time from its event
	 * log, so adding a file does not reorder sessions). Files
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
			this.readBulkMetadataFile(this._sharedBulkFile),
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
			// Queued behind the session metadata store's writes in this window; create-only, so the
			// store's data (from this or another window) always wins.
			const result = await sessionMetadataFileWriteSequencer.queue(sessionId, () => this.backfillSessionMetadataFile(sessionId, entry, counts.failed < SESSION_METADATA_BACKFILL_MAX_LOGGED_FAILURES));
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
		this.logService.info(`[LegacySessionMetadataBackfill] Session metadata backfill: attempt=${attempt}, completed=${completed}, aborted=${aborted}, shared=${shared.status}(${Object.keys(shared.data).length}), perInstall=${perInstall.status}(${Object.keys(perInstall.data).length}), globalState=${Object.keys(globalStateData).length}, candidates=${candidates.size}, notVSCode=${counts.notVSCode}, exists=${counts.exists}, missingSessionDirectory=${counts.missingSessionDirectory}, written=${counts.written}, failed=${counts.failed}`);

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
		const fileUri = getSessionMetadataFileUri(sessionId);
		const fail = (error: unknown): SessionMetadataBackfillResult => {
			if (logFailure) {
				this.logService.error(error instanceof Error ? error : String(error), `[LegacySessionMetadataBackfill] Failed to backfill metadata for session ${sessionId}`);
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

function getSessionMetadataFileUri(sessionId: string): vscode.Uri {
	return Uri.joinPath(Uri.file(getCopilotCLISessionDir(sessionId)), 'vscode.metadata.json');
}
