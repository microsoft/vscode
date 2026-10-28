/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isThenable, SequencerByKey } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { IDiffComputeService, IOffsetEdit } from '../../common/diffComputeService.js';
import { AttributedToolResultFileEditContent, FILE_EDIT_ATTRIBUTION_PROPERTY, IAgentEditAttributionService, IFileEditAttributionMarker } from '../../common/fileEditAttribution.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { buildSessionDbUri } from '../../common/sessionDbUri.js';
import { FileEditKind, ToolResultContentType, type ToolResultFileEditContent } from '../../common/state/sessionState.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { IAgentHostFileEditCoordinator } from '../agentHostFileEditCoordinator.js';
import { extractAiChunks } from './editChunkExtractor.js';
import { IEditSurvivalReporterFactory } from './editSurvivalReporter.js';
import { IEditArcReporterService } from './editArcReporter.js';
import { createArcTextEditFromDiff, extractArcTextEdit } from './arcToolEdit.js';

interface ICompletedEdit {
	readonly beforeContent: VSBuffer;
	readonly beforeExisted: boolean;
	readonly afterContent: VSBuffer;
	readonly mode: string | undefined;
	readonly lease: IDisposable;
}

/**
 * Snapshots file content before and after each edit tool invocation.
 * Persistence holds its own database reference independently of the session's lifetime.
 */
export class FileEditTracker extends Disposable {

	private readonly _runningEdits = this._register(new DisposableStore());

	/**
	 * Pending edits keyed by file path. Populated by {@link trackEditStart}
	 * before the edit tool runs; popped by {@link completeEdit} when it
	 * finishes.
	 */
	private readonly _pendingEdits = new Map<string, { beforeContent: VSBuffer; beforeExisted: boolean; mode: string | undefined; snapshotDone: Promise<void>; lease: IDisposable }>();

	/**
	 * Completed edits keyed by file path. Populated by {@link completeEdit};
	 * drained by {@link takeCompletedEdit}, which persists the entry to
	 * the database.
	 */
	private readonly _completedEdits = new Map<string, ICompletedEdit>();
	/** Processes each file's completed edits in claim order, so attribution never sees them reordered. */
	private readonly _completedEditSequencer = new SequencerByKey<string>();

	constructor(
		private readonly _sessionUri: string,
		/** The session that owns the chat, read when an edit is attributed: it can change while the chat runs. */
		private readonly _owner: () => string,
		private readonly _provider: string | undefined,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
		@IEditSurvivalReporterFactory private readonly _editSurvivalReporterFactory: IEditSurvivalReporterFactory,
		@IAgentEditAttributionService private readonly _editAttributionService: IAgentEditAttributionService,
		@IEditArcReporterService private readonly _editArcReporterService: IEditArcReporterService,
		@IAgentHostFileEditCoordinator private readonly _fileEditCoordinator: IAgentHostFileEditCoordinator,
	) {
		super();
	}

	override dispose(): void {
		this._pendingEdits.clear();
		this._completedEdits.clear();
		super.dispose();
	}

	/**
	 * Call before an edit tool runs. Reads the file's current content
	 * into memory as the "before" state. Callers should await this so
	 * the snapshot captures pre-edit content before the tool writes to
	 * disk.
	 *
	 * @param filePath - Absolute path of the file being edited.
	 * @param mode - Provider execution mode when the edit started.
	 */
	async trackEditStart(filePath: string, mode?: string): Promise<void> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const lease = this._runningEdits.add(new DisposableStore());
		const resource = URI.file(filePath);
		const acquired = this._fileEditCoordinator.isCoordinatedProvider(this._provider)
			? this._fileEditCoordinator.beginEdit(resource)
			: this._fileEditCoordinator.markEditing(resource);
		const snapshot = (edit: IDisposable) => {
			if (lease.isDisposed) {
				edit.dispose();
				throw new CancellationError();
			}
			lease.add(edit);
			return this._readFileWithExistence(filePath);
		};
		const snapshotDone = isThenable(acquired) ? acquired.then(snapshot) : snapshot(acquired);
		const entry = {
			beforeContent: VSBuffer.fromString(''),
			beforeExisted: false,
			mode,
			lease,
			snapshotDone: snapshotDone.then(({ content, existed }) => {
				entry.beforeContent = content;
				entry.beforeExisted = existed;
			}),
		};
		this._pendingEdits.set(filePath, entry);
		try {
			await entry.snapshotDone;
		} catch (error) {
			if (this._pendingEdits.get(filePath) === entry) {
				this._pendingEdits.delete(filePath);
			}
			this._runningEdits.delete(lease);
			throw error;
		}
	}

	/**
	 * Call after an edit tool finishes. Reads the file content again as
	 * the "after" state and stores the result for later retrieval via
	 * {@link takeCompletedEdit}.
	 *
	 * @param filePath - Absolute path of the file that was edited.
	 */
	async completeEdit(filePath: string): Promise<void> {
		const pending = this._pendingEdits.get(filePath);
		if (!pending) {
			return;
		}
		this._pendingEdits.delete(filePath);
		await pending.snapshotDone;

		const afterContent = await this._readFile(filePath);
		if (this._store.isDisposed) {
			return;
		}
		this._completedEdits.set(filePath, {
			beforeContent: pending.beforeContent,
			beforeExisted: pending.beforeExisted,
			afterContent,
			mode: pending.mode,
			lease: pending.lease,
		});
	}

	/**
	 * Retrieves and removes a completed edit for the given file path,
	 * persists it to the session database with computed diff counts,
	 * and returns the result as an {@link ToolResultFileEditContent}
	 * for inclusion in the tool result.
	 *
	 * `toolName` and `toolInput` are forwarded to {@link extractAiChunks}
	 * for region-based survival scoring; unknown shapes fall back to
	 * whole-file scoring.
	 */
	takeCompletedEdit(turnId: string, toolCallId: string, filePath: string, toolName: string, toolInput: unknown, modelId: string | undefined, isSubagent: boolean, clientContext?: IAgentHostClientTelemetryContext, chatUri?: string, autoTierSnapshot?: string | Promise<string | undefined>, fusionModel?: string): Promise<ToolResultFileEditContent | undefined> {
		const edit = this._completedEdits.get(filePath);
		if (!edit) {
			const pending = this._pendingEdits.get(filePath);
			if (pending) {
				this._pendingEdits.delete(filePath);
				this._runningEdits.delete(pending.lease);
			}
			return Promise.resolve(undefined);
		}
		this._completedEdits.delete(filePath);
		return this._completedEditSequencer.queue(filePath, () => this._processCompletedEdit(edit, turnId, toolCallId, filePath, toolName, toolInput, modelId, isSubagent, clientContext, chatUri, autoTierSnapshot, fusionModel))
			.finally(() => this._runningEdits.delete(edit.lease));
	}

	private async _processCompletedEdit(edit: ICompletedEdit, turnId: string, toolCallId: string, filePath: string, toolName: string, toolInput: unknown, modelId: string | undefined, isSubagent: boolean, clientContext: IAgentHostClientTelemetryContext | undefined, chatUri: string | undefined, autoTierSnapshot: string | Promise<string | undefined> | undefined, fusionModel: string | undefined): Promise<ToolResultFileEditContent | undefined> {

		if (!modelId) {
			this._logService.warn(`[FileEditTracker] No modelId for completed edit: ${filePath} (turn=${turnId}, toolCall=${toolCallId}, tool=${toolName || '<unknown>'}). Edit-survival telemetry will be emitted with an empty modelId.`);
		}

		const beforeBytes = edit.beforeContent.buffer;
		const afterBytes = edit.afterContent.buffer;
		const beforeText = edit.beforeContent.toString();
		const afterText = edit.afterContent.toString();
		const completionTime = Date.now();

		const isCreate = !edit.beforeExisted && afterBytes.length > 0;

		let addedLines: number | undefined;
		let removedLines: number | undefined;
		let changes: readonly IOffsetEdit[] = [];
		let diffHitTimeout = false;
		try {
			const counts = await this._diffComputeService.computeDiffCounts(beforeText, afterText);
			addedLines = counts.added;
			removedLines = isCreate ? 0 : counts.removed;
			changes = counts.changes;
			diffHitTimeout = counts.hitTimeout ?? false;
		} catch (err) {
			this._logService.warn(`[FileEditTracker] Failed to compute diff counts: ${filePath}`, err);
		}

		try {
			const ref = this._sessionDataService.openDatabase(URI.parse(this._sessionUri));
			try {
				await ref.object.storeFileEdit({
					turnId,
					toolCallId,
					filePath,
					kind: isCreate ? FileEditKind.Create : FileEditKind.Edit,
					beforeContent: beforeBytes,
					afterContent: afterBytes,
					addedLines,
					removedLines,
				});
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err);
		}

		const autoTier = isThenable<string | undefined>(autoTierSnapshot) ? await autoTierSnapshot : autoTierSnapshot;

		this._editSurvivalReporterFactory.launch({
			clientContext,
			sessionUri: this._sessionUri,
			ownerSessionUri: this._owner(),
			...(this._provider ? { provider: this._provider } : {}),
			turnId,
			toolCallId,
			filePath,
			beforeText,
			afterText,
			isCreate,
			modelId,
			...(autoTier !== undefined ? { autoTier } : {}),
			...(fusionModel !== undefined ? { fusionModel } : {}),
			toolName,
			aiChunks: extractAiChunks(toolName, toolInput, filePath),
		});

		const content: ToolResultFileEditContent = {
			type: ToolResultContentType.FileEdit,
			before: {
				uri: URI.file(filePath).toString(),
				content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, 'before') },
			},
			after: {
				uri: URI.file(filePath).toString(),
				content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, 'after') },
			},
			diff: addedLines !== undefined ? { added: addedLines, removed: removedLines } : undefined,
		};
		let marker: IFileEditAttributionMarker | undefined;
		try {
			marker = await this._editAttributionService.recordEdit({
				sessionUri: this._sessionUri,
				ownerSessionUri: this._owner(),
				...(this._provider ? { provider: this._provider } : {}),
				chatUri,
				turnId,
				toolCallId,
				filePath,
				beforeText,
				afterText,
				changes,
				diffHitTimeout,
				modelId,
				...(autoTier !== undefined ? { autoTier } : {}),
				...(fusionModel !== undefined ? { fusionModel } : {}),
				toolName,
			});
		} catch (error) {
			this._logService.warn(`[FileEditTracker] Failed to record edit attribution for ${filePath}: ${error}`);
		}

		const initialEdit = extractArcTextEdit(toolName, toolInput, beforeText, afterText)
			?? createArcTextEditFromDiff(changes, beforeText, afterText);
		this._editArcReporterService.reportEdit({
			clientContext,
			sessionUri: this._sessionUri,
			ownerSessionUri: this._owner(),
			isSubagent,
			...(this._provider ? { provider: this._provider } : {}),
			turnId,
			toolCallId,
			filePath,
			beforeText,
			afterText,
			initialEdit,
			modelId,
			...(autoTier !== undefined ? { autoTier } : {}),
			...(fusionModel !== undefined ? { fusionModel } : {}),
			toolName,
			mode: edit.mode,
			completionTime,
		}).catch(error => {
			this._logService.warn(`[FileEditTracker] Failed to start ARC telemetry: ${filePath}`, error);
		});

		if (!marker) {
			return content;
		}
		const attributedContent: AttributedToolResultFileEditContent = {
			...content,
			[FILE_EDIT_ATTRIBUTION_PROPERTY]: marker,
		};
		return attributedContent;
	}

	async flushAttribution(): Promise<void> {
		await this._editAttributionService.flushSession(this._sessionUri);
	}

	private async _readFile(filePath: string): Promise<VSBuffer> {
		try {
			const content = await this._fileService.readFile(URI.file(filePath));
			return content.value;
		} catch (err) {
			this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
			return VSBuffer.fromString('');
		}
	}

	private async _readFileWithExistence(filePath: string): Promise<{ content: VSBuffer; existed: boolean }> {
		try {
			const content = await this._fileService.readFile(URI.file(filePath));
			return { content: content.value, existed: true };
		} catch (err) {
			this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
			return { content: VSBuffer.fromString(''), existed: false };
		}
	}
}
