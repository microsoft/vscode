/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { IDiffComputeService, IOffsetEdit } from '../../common/diffComputeService.js';
import { AttributedToolResultFileEditContent, FILE_EDIT_ATTRIBUTION_PROPERTY, IAgentEditAttributionService, IFileEditAttributionMarker } from '../../common/fileEditAttribution.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { buildSessionDbUri } from '../../common/sessionDbUri.js';
import { FileEditKind, ToolResultContentType, type ToolResultFileEditContent } from '../../common/state/sessionState.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { extractAiChunks } from './editChunkExtractor.js';
import { IEditSurvivalReporterFactory } from './editSurvivalReporter.js';
import { IEditArcReporterService } from './editArcReporter.js';
import { createArcTextEditFromDiff, extractArcTextEdit } from './arcToolEdit.js';

/**
 * Tracks file edits made by tools in a session by snapshotting file content
 * before and after each edit tool invocation, persisting snapshots into the
 * session database.
 */
export class FileEditTracker {

	/**
	 * Pending edits keyed by file path. Populated by {@link trackEditStart}
	 * before the edit tool runs; popped by {@link completeEdit} when it
	 * finishes.
	 */
	private readonly _pendingEdits = new Map<string, { beforeContent: VSBuffer; beforeExisted: boolean; mode: string | undefined; snapshotDone: Promise<void> }>();

	/**
	 * Completed edits keyed by file path. Populated by {@link completeEdit};
	 * drained by {@link takeCompletedEdit}, which persists the entry to
	 * the database.
	 */
	private readonly _completedEdits = new Map<string, { beforeContent: VSBuffer; beforeExisted: boolean; afterContent: VSBuffer; mode: string | undefined }>();

	constructor(
		private readonly _sessionUri: string,
		private readonly _db: ISessionDatabase,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IDiffComputeService private readonly _diffComputeService: IDiffComputeService,
		@IEditSurvivalReporterFactory private readonly _editSurvivalReporterFactory: IEditSurvivalReporterFactory,
		@IAgentEditAttributionService private readonly _editAttributionService: IAgentEditAttributionService,
		@IEditArcReporterService private readonly _editArcReporterService: IEditArcReporterService,
	) { }

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
		const snapshotDone = this._readFileWithExistence(filePath);
		const entry = {
			beforeContent: VSBuffer.fromString(''),
			beforeExisted: false,
			mode,
			snapshotDone: snapshotDone.then(({ content, existed }) => {
				entry.beforeContent = content;
				entry.beforeExisted = existed;
			}),
		};
		this._pendingEdits.set(filePath, entry);
		await entry.snapshotDone;
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

		this._completedEdits.set(filePath, {
			beforeContent: pending.beforeContent,
			beforeExisted: pending.beforeExisted,
			afterContent,
			mode: pending.mode,
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
	async takeCompletedEdit(turnId: string, toolCallId: string, filePath: string, toolName: string, toolInput: unknown, modelId: string | undefined, clientContext?: IAgentHostClientTelemetryContext): Promise<ToolResultFileEditContent | undefined> {
		const edit = this._completedEdits.get(filePath);
		if (!edit) {
			return undefined;
		}
		this._completedEdits.delete(filePath);

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
		try {
			const counts = await this._diffComputeService.computeDiffCounts(beforeText, afterText);
			addedLines = counts.added;
			removedLines = isCreate ? 0 : counts.removed;
			changes = counts.changes;
		} catch (err) {
			this._logService.warn(`[FileEditTracker] Failed to compute diff counts: ${filePath}`, err);
		}

		try {
			await this._db.storeFileEdit({
				turnId,
				toolCallId,
				filePath,
				kind: isCreate ? FileEditKind.Create : FileEditKind.Edit,
				beforeContent: beforeBytes,
				afterContent: afterBytes,
				addedLines,
				removedLines,
			});
		} catch (err) {
			this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err);
		}

		this._editSurvivalReporterFactory.launch({
			clientContext,
			sessionUri: this._sessionUri,
			turnId,
			toolCallId,
			filePath,
			beforeText,
			afterText,
			isCreate,
			modelId,
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
				turnId,
				toolCallId,
				filePath,
				beforeText,
				afterText,
				changes,
				modelId,
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
			turnId,
			toolCallId,
			filePath,
			beforeText,
			afterText,
			initialEdit,
			modelId,
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
