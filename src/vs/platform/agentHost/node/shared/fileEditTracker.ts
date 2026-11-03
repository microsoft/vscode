/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, isThenable, SequencerByKey } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { IDiffComputeService, IOffsetEdit } from '../../common/diffComputeService.js';
import { AttributedToolResultFileEditContent, FILE_EDIT_ATTRIBUTION_PROPERTY, IAgentEditAttributionService, IFileEditAttributionMarker } from '../../common/fileEditAttribution.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { buildSessionDbUri } from '../../common/sessionDbUri.js';
import { FileEditKind, ToolResultContentType, type ToolResultFileEditContent } from '../../common/state/sessionState.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { IAgentHostFileEditCoordinator } from '../agentHostFileEditCoordinator.js';
import { getFileEditPathKey } from '../fileEditIdentity.js';
import { extractAiChunks } from './editChunkExtractor.js';
import { IEditSurvivalReporterFactory } from './editSurvivalReporter.js';
import { IEditArcReporterService } from './editArcReporter.js';
import { createArcTextEditFromDiff, extractArcTextEdit } from './arcToolEdit.js';

/** A file's content at some point, and whether the file existed then. */
interface IFileSnapshot {
	readonly content: VSBuffer;
	readonly existed: boolean;
}

interface IEditIdentity {
	readonly filePath: string;
	readonly toolInput: unknown;
}

/** An edit tool call on a file that started and hasn't completed. */
interface IPendingEdit extends IEditIdentity {
	/** The content and completion watermark captured after the edit lease is acquired. */
	readonly before: Promise<IFileSnapshot & { readonly completionsBefore: number }>;
	readonly mode: string | undefined;
	readonly lease: DisposableStore;
}

interface ICompletedEdit extends IEditIdentity {
	readonly order: number;
	readonly beforeContent: VSBuffer;
	readonly beforeExisted: boolean;
	readonly afterContent: VSBuffer;
	readonly mode: string | undefined;
	readonly lease: IDisposable;
}

interface IEditOperation extends IEditIdentity {
	readonly settled: DeferredPromise<void>;
	resultReserved: boolean;
	completion?: IEditIdentity & { readonly order: number };
	state:
	| { readonly kind: 'pending'; readonly edit: IPendingEdit }
	| { readonly kind: 'completing'; readonly edit: IPendingEdit }
	| { readonly kind: 'completed'; readonly edit: ICompletedEdit }
	| { readonly kind: 'failed' }
	| { readonly kind: 'claimed' };
}

/**
 * The edit tool calls on one host file, oldest first.
 * Callbacks for one spelling are ordered, but aliases can finish out of order.
 */
interface IFileEdits {
	readonly operations: IEditOperation[];
	/** How many edits of the file completed. */
	completions: number;
	nextCompletionOrder: number;
	/** The file's content after the edit that completed last, while edits that started before it are pending. */
	lastAfter: IFileSnapshot | undefined;
}

/**
 * Claims each completion once, including a failed start's post-tool callback.
 */
function findCompletionOperation(edits: IFileEdits, toolInput: unknown, filePath: string): IEditOperation | undefined {
	const candidates = edits.operations.filter(operation => !operation.completion
		&& (operation.state.kind === 'pending' || operation.state.kind === 'failed')
		&& (toolInput === undefined || equals(operation.toolInput, toolInput)));
	return (toolInput === undefined ? undefined : candidates.find(operation => operation.filePath === filePath)) ?? candidates[0];
}

/** Failed and live operations with the same raw identity share one result FIFO. */
function findResultOperation(edits: IFileEdits, toolInput: unknown, filePath: string): IEditOperation | undefined {
	const candidates: IEditOperation[] = [];
	for (const operation of edits.operations) {
		if (operation.state.kind === 'claimed' || operation.resultReserved
			|| (toolInput !== undefined && !equals(operation.toolInput, toolInput) && (!operation.completion || !equals(operation.completion.toolInput, toolInput)))) {
			continue;
		}
		if (!candidates.some(candidate => candidate.filePath === operation.filePath && equals(candidate.toolInput, operation.toolInput))) {
			candidates.push(operation);
		}
	}
	const matches = (identity: IEditIdentity) => identity.filePath === filePath && (toolInput === undefined || equals(identity.toolInput, toolInput));
	const priority = (operation: IEditOperation) => (operation.state.kind === 'pending' ? 3 : 0)
		+ (operation.completion && matches(operation.completion) ? 0 : matches(operation) ? 1 : 2);
	candidates.sort((a, b) => priority(a) - priority(b)
		|| (a.completion?.order ?? Number.MAX_SAFE_INTEGER) - (b.completion?.order ?? Number.MAX_SAFE_INTEGER));
	return candidates[0];
}

/**
 * Snapshots file content before and after each edit tool invocation.
 * Persistence holds its own database reference independently of the session's lifetime.
 */
export class FileEditTracker extends Disposable {

	private readonly _runningEdits = this._register(new DisposableStore());

	/**
	 * The edit tool calls on each file, keyed by host file identity. Populated by
	 * {@link trackEditStart} before the edit tool runs, completed by
	 * {@link completeEdit} when it finishes, and drained by
	 * {@link takeCompletedEdit}, which persists the edit to the database.
	 */
	private readonly _edits = new Map<string, IFileEdits>();
	/** Orders snapshot reads and revision reservations for aliases of the same host file. */
	private readonly _snapshotSequencer = new SequencerByKey<string>();
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
		for (const edits of this._edits.values()) {
			for (const operation of edits.operations) {
				operation.state = { kind: 'claimed' };
				operation.settled.complete();
			}
		}
		this._edits.clear();
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
	 * @param toolInput - Input of the edit tool call, which tells its edit
	 * apart from other edits of the file that run meanwhile, as in a batch of
	 * tool calls. Pass the same input to {@link completeEdit} and
	 * {@link takeCompletedEdit}.
	 */
	async trackEditStart(filePath: string, mode?: string, toolInput?: unknown): Promise<void> {
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const lease = this._runningEdits.add(new DisposableStore());
		const resource = URI.file(filePath);
		const acquired = this._fileEditCoordinator.isCoordinatedProvider(this._provider)
			? this._fileEditCoordinator.beginEdit(resource)
			: this._fileEditCoordinator.markEditing(resource);
		const edits = this._getEdits(filePath);
		const snapshot = async (edit: IDisposable) => {
			if (lease.isDisposed) {
				edit.dispose();
				throw new CancellationError();
			}
			lease.add(edit);
			const completionsBefore = edits.completions;
			const before = await this._readFileWithExistence(filePath);
			return { ...before, completionsBefore };
		};
		const entry: IPendingEdit = {
			filePath,
			before: isThenable(acquired) ? acquired.then(snapshot) : snapshot(acquired),
			toolInput,
			mode,
			lease,
		};
		const operation: IEditOperation = { filePath, toolInput, settled: new DeferredPromise<void>(), resultReserved: false, state: { kind: 'pending', edit: entry } };
		edits.operations.push(operation);
		try {
			await entry.before;
		} catch (error) {
			if (operation.state.kind !== 'claimed') {
				operation.state = { kind: 'failed' };
			}
			this._runningEdits.delete(lease);
			this._deleteIfSettled(filePath, edits);
			throw error;
		}
	}

	/**
	 * Call after an edit tool finishes. Reads the file content again as
	 * the "after" state and stores the result for later retrieval via
	 * {@link takeCompletedEdit}.
	 *
	 * @param filePath - Absolute path of the file that was edited.
	 * @param toolInput - Input of the edit tool call, as passed to {@link trackEditStart}.
	 */
	async completeEdit(filePath: string, toolInput?: unknown): Promise<void> {
		const key = getFileEditPathKey(filePath, this._fileEditCoordinator.uriIdentity);
		const edits = this._edits.get(key);
		if (!edits) {
			return;
		}
		const operation = findCompletionOperation(edits, toolInput, filePath);
		if (!operation) {
			this._logService.trace(`[FileEditTracker] No matching pending edit: ${filePath}`);
			return;
		}
		operation.completion = { filePath, toolInput, order: edits.nextCompletionOrder++ };
		if (operation.state.kind !== 'pending') {
			return;
		}
		this._discardEarlierOperations(edits, operation, 'pending');
		const pending = operation.state.edit;
		operation.state = { kind: 'completing', edit: pending };
		const isCancelled = () => this._store.isDisposed || operation.state.kind === 'claimed';
		return this._snapshotSequencer.queue(key, async () => {
			try {
				const snapshot = await pending.before;
				if (isCancelled()) {
					return;
				}
				const after = await this._readFileWithExistence(filePath);
				if (isCancelled()) {
					return;
				}
				// An edit that started before others of the file completed starts from what the last of them wrote.
				const before = edits.lastAfter && edits.completions > snapshot.completionsBefore ? edits.lastAfter : snapshot;
				edits.completions++;
				edits.lastAfter = edits.operations.some(other => other !== operation && (other.state.kind === 'pending' || other.state.kind === 'completing')) ? after : undefined;
				const ref = this._sessionDataService.openDatabase(URI.parse(this._sessionUri));
				let order: number;
				try {
					order = await ref.object.reserveFileEditOrder();
				} finally {
					ref.dispose();
				}
				if (isCancelled()) {
					return;
				}
				operation.state = {
					kind: 'completed',
					edit: {
						filePath: pending.filePath,
						order,
						beforeContent: before.content,
						beforeExisted: before.existed,
						afterContent: after.content,
						toolInput: pending.toolInput,
						mode: pending.mode,
						lease: pending.lease,
					},
				};
			} catch (error) {
				if (operation.state.kind !== 'claimed') {
					operation.state = { kind: 'failed' };
				}
				this._runningEdits.delete(pending.lease);
				throw error;
			} finally {
				operation.settled.complete();
				this._deleteIfSettled(filePath, edits);
			}
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
	 * whole-file scoring. `toolInput` also tells the edit apart from other
	 * edits of the file, as passed to {@link trackEditStart}.
	 */
	takeCompletedEdit(turnId: string, toolCallId: string, filePath: string, toolName: string, toolInput: unknown, modelId: string | undefined, isSubagent: boolean, clientContext?: IAgentHostClientTelemetryContext, chatUri?: string, autoTierSnapshot?: string | Promise<string | undefined>, fusionModel?: string): Promise<ToolResultFileEditContent | undefined> {
		const key = getFileEditPathKey(filePath, this._fileEditCoordinator.uriIdentity);
		const edits = this._edits.get(key);
		if (!edits) {
			return Promise.resolve(undefined);
		}
		const operation = findResultOperation(edits, toolInput, filePath);
		if (!operation) {
			this._logService.trace(`[FileEditTracker] No matching edit result: ${filePath}`);
			return Promise.resolve(undefined);
		}
		operation.resultReserved = true;
		const claim = (): Promise<ToolResultFileEditContent | undefined> => {
			const state = operation.state;
			if (state.kind === 'completing') {
				return operation.settled.p.then(claim);
			}
			if (state.kind === 'claimed') {
				return Promise.resolve(undefined);
			}
			if (state.kind === 'pending' || state.kind === 'completed') {
				this._discardEarlierOperations(edits, operation, state.kind);
			}
			operation.state = { kind: 'claimed' };
			operation.settled.complete();
			const index = edits.operations.indexOf(operation);
			if (index !== -1) {
				edits.operations.splice(index, 1);
			}
			this._deleteIfSettled(filePath, edits);
			if (state.kind !== 'completed') {
				if (state.kind === 'pending') {
					this._runningEdits.delete(state.edit.lease);
				}
				return Promise.resolve(undefined);
			}
			const edit = state.edit;
			// Claimed persistence can outlive the tracker, so its promise now owns the lease.
			this._runningEdits.deleteAndLeak(edit.lease);
			return this._completedEditSequencer.queue(key, () => this._processCompletedEdit(edit, turnId, toolCallId, filePath, toolName, toolInput, modelId, isSubagent, clientContext, chatUri, autoTierSnapshot, fusionModel))
				.finally(() => edit.lease.dispose());
		};
		return claim();
	}

	private _getEdits(filePath: string): IFileEdits {
		const key = getFileEditPathKey(filePath, this._fileEditCoordinator.uriIdentity);
		let edits = this._edits.get(key);
		if (!edits) {
			edits = { operations: [], completions: 0, nextCompletionOrder: 0, lastAfter: undefined };
			this._edits.set(key, edits);
		}
		return edits;
	}

	/** Forgets the edits of a file once none is left, which releases the content they hold. */
	private _deleteIfSettled(filePath: string, edits: IFileEdits): void {
		const key = getFileEditPathKey(filePath, this._fileEditCoordinator.uriIdentity);
		if (!edits.operations.some(operation => operation.state.kind === 'pending' || operation.state.kind === 'completing')) {
			edits.lastAfter = undefined;
		}
		if (!edits.operations.length && this._edits.get(key) === edits) {
			this._edits.delete(key);
		}
	}

	private _discardEarlierOperations(edits: IFileEdits, operation: IEditOperation, kind: 'pending' | 'completed'): void {
		for (let i = edits.operations.indexOf(operation) - 1; i >= 0; i--) {
			const earlier = edits.operations[i];
			const state = earlier.state;
			if (!earlier.resultReserved && earlier.filePath === operation.filePath && (state.kind === 'pending' || state.kind === 'completed') && state.kind === kind) {
				earlier.state = { kind: 'claimed' };
				earlier.settled.complete();
				edits.operations.splice(i, 1);
				this._runningEdits.delete(state.edit.lease);
			}
		}
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
				}, edit.order);
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err);
			throw err;
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

	private async _readFileWithExistence(filePath: string): Promise<IFileSnapshot> {
		try {
			const content = await this._fileService.readFile(URI.file(filePath));
			return { content: content.value, existed: true };
		} catch (err) {
			if (toFileOperationResult(err) === FileOperationResult.FILE_NOT_FOUND) {
				return { content: VSBuffer.fromString(''), existed: false };
			}
			this._logService.warn(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
			throw err;
		}
	}
}
