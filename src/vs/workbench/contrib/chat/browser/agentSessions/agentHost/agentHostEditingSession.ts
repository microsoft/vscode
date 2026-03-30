/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { constObservable, derived, derivedOpts, IObservable, IReader, ObservablePromise, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../../nls.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ContentEncoding, IWriteFileParams } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getToolFileEdits, ToolCallStatus, type IToolCallState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { EditorActivation } from '../../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IEditorPane } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { MultiDiffEditor } from '../../../../multiDiffEditor/browser/multiDiffEditor.js';
import { MultiDiffEditorInput } from '../../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { IChatProgress, IChatWorkspaceEdit } from '../../../common/chatService/chatService.js';
import { ChatEditingSessionState, emptySessionEntryDiff, getMultiDiffSourceUri, IChatEditingSession, IEditSessionDiffStats, IEditSessionEntryDiff, IModifiedFileEntry, IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration, IStreamingEdits, ModifiedFileEntryState } from '../../../common/editing/chatEditingService.js';
import { IChatRequestDisablement, IChatResponseModel } from '../../../common/model/chatModel.js';
import { fileEditsToExternalEdits, type IToolCallFileEdit } from './stateToProgressAdapter.js';

// ---- Internal data model ----------------------------------------------------

interface IAgentHostFileEdit {
	readonly resource: URI;
	readonly beforeContentUri: URI;
	readonly afterContentUri: URI;
	readonly undoStopId: string;
	readonly diff?: { added?: number; removed?: number };
}

interface IAgentHostCheckpoint {
	readonly requestId: string;
	readonly undoStopId: string;
	readonly edits: IAgentHostFileEdit[];
}

// ---- Modified file entry ----------------------------------------------------

class AgentHostModifiedFileEntry implements IModifiedFileEntry {

	readonly entryId: string;
	readonly originalURI: URI;
	readonly modifiedURI: URI;
	readonly lastModifyingRequestId: string;

	readonly state = constObservable(ModifiedFileEntryState.Accepted);
	readonly isCurrentlyBeingModifiedBy = constObservable<{ responseModel: IChatResponseModel; undoStopId: string | undefined } | undefined>(undefined);
	readonly lastModifyingResponse = constObservable<IChatResponseModel | undefined>(undefined);
	readonly rewriteRatio = constObservable(1);
	readonly waitsForLastEdits = constObservable(false);
	readonly reviewMode = constObservable(false);
	readonly autoAcceptController = constObservable<{ total: number; remaining: number; cancel(): void } | undefined>(undefined);
	readonly changesCount = constObservable(0);
	readonly diffInfo?: IObservable<IDocumentDiff>;
	readonly linesAdded?: IObservable<number>;
	readonly linesRemoved?: IObservable<number>;

	constructor(
		resource: URI,
		beforeContentUri: URI,
		lastModifyingRequestId: string,
		added: number,
		removed: number,
	) {
		this.entryId = `agenthost-${resource.toString()}`;
		this.modifiedURI = resource;
		this.originalURI = beforeContentUri;
		this.lastModifyingRequestId = lastModifyingRequestId;
		if (added > 0 || removed > 0) {
			this.linesAdded = constObservable(added);
			this.linesRemoved = constObservable(removed);
		}
	}

	async accept(): Promise<void> { /* no-op */ }
	async reject(): Promise<void> { /* no-op */ }
	enableReviewModeUntilSettled(): void { /* no-op */ }

	getEditorIntegration(_editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		return {
			currentIndex: observableValue('currentIndex', 0),
			reveal(): void { /* no-op */ },
			next(): boolean { return false; },
			previous(): boolean { return false; },
			enableAccessibleDiffView(): void { /* no-op */ },
			async acceptNearestChange(_change?: IModifiedFileEntryChangeHunk): Promise<void> { /* no-op */ },
			async rejectNearestChange(_change?: IModifiedFileEntryChangeHunk): Promise<void> { /* no-op */ },
			async toggleDiff(_change: IModifiedFileEntryChangeHunk | undefined, _show?: boolean): Promise<void> { /* no-op */ },
			dispose(): void { /* no-op */ },
		};
	}
}

// ---- Editing session --------------------------------------------------------

export class AgentHostEditingSession extends Disposable implements IChatEditingSession {

	readonly supportsKeepUndo = true;
	readonly isGlobalEditingSession = false;

	private readonly _state = observableValue<ChatEditingSessionState>(this, ChatEditingSessionState.Idle);
	readonly state: IObservable<ChatEditingSessionState> = this._state;

	private readonly _entriesObs = observableValue<readonly AgentHostModifiedFileEntry[]>(this, []);
	readonly entries: IObservable<readonly IModifiedFileEntry[]> = this._entriesObs;

	readonly requestDisablement: IObservable<IChatRequestDisablement[]> = constObservable([]);

	private readonly _onDidDispose = this._register(new Emitter<void>());
	readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly _onDidRequestFileWrite = this._register(new Emitter<IWriteFileParams>());
	readonly onDidRequestFileWrite: Event<IWriteFileParams> = this._onDidRequestFileWrite.event;

	private readonly _checkpoints: IAgentHostCheckpoint[] = [];
	private readonly _currentCheckpointIndex = observableValue<number>(this, -1);
	private readonly _diffCache = new Map<string, IEditSessionEntryDiff>();
	private readonly _undoRedoSequencer = new Sequencer();

	private _editorPane: MultiDiffEditor | undefined;
	private _hasExplanations = false;

	readonly canUndo: IObservable<boolean> = derived(this, r => this._currentCheckpointIndex.read(r) >= 0);
	readonly canRedo: IObservable<boolean> = derived(this, r => this._currentCheckpointIndex.read(r) < this._checkpoints.length - 1);

	constructor(
		readonly chatSessionResource: URI,
		private readonly _connectionAuthority: string,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IFileService private readonly _fileService: IFileService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();
	}

	// ---- Hydration from protocol state --------------------------------------

	addToolCallEdits(requestId: string, tc: IToolCallState): IChatProgress[] {
		if (tc.status !== ToolCallStatus.Completed) {
			return [];
		}

		// Deduplicate: ignore if this tool call was already added
		if (this._checkpoints.some(cp => cp.undoStopId === tc.toolCallId)) {
			return [];
		}

		const fileEdits = fileEditsToExternalEdits(tc);
		if (fileEdits.length === 0) {
			return [];
		}

		const authority = this._connectionAuthority;
		const protocolEdits = getToolFileEdits(tc);

		const edits: IAgentHostFileEdit[] = fileEdits.map((edit: IToolCallFileEdit, i: number) => ({
			resource: toAgentHostUri(edit.resource, authority),
			beforeContentUri: toAgentHostUri(edit.beforeContentUri, authority),
			afterContentUri: toAgentHostUri(edit.afterContentUri, authority),
			undoStopId: edit.undoStopId,
			diff: protocolEdits[i]?.diff,
		}));

		const checkpoint: IAgentHostCheckpoint = {
			requestId,
			undoStopId: tc.toolCallId,
			edits,
		};

		this._checkpoints.push(checkpoint);

		transaction(tx => {
			this._currentCheckpointIndex.set(this._checkpoints.length - 1, tx);
			if (this._state.get() === ChatEditingSessionState.Initial) {
				this._state.set(ChatEditingSessionState.Idle, tx);
			}
		});

		this._rebuildEntries();

		// Build progress parts for the file edit pills in the chat response
		const progressParts: IChatProgress[] = [];
		for (const edit of edits) {
			progressParts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
			progressParts.push({ kind: 'codeblockUri', uri: edit.resource, isEdit: true, undoStopId: tc.toolCallId });
			progressParts.push({ kind: 'textEdit', uri: edit.resource, edits: [], done: false, isExternalEdit: true });
			progressParts.push({ kind: 'textEdit', uri: edit.resource, edits: [], done: true, isExternalEdit: true });
			progressParts.push({ kind: 'markdownContent', content: new MarkdownString('\n````\n') });
		}
		return progressParts;
	}

	// ---- Show diff editor ---------------------------------------------------

	async show(previousChanges?: boolean): Promise<void> {
		if (this._editorPane?.isVisible()) {
			return;
		}

		if (this._editorPane?.input) {
			await this._editorService.openEditor(this._editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
			return;
		}

		const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
			multiDiffSource: getMultiDiffSourceUri(this, previousChanges),
			label: localize('multiDiffEditorInput.name', "Suggested Edits")
		}, this._instantiationService);

		this._editorPane = await this._editorService.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE }) as MultiDiffEditor | undefined;
	}

	// ---- Entry lookups ------------------------------------------------------

	getEntry(uri: URI): IModifiedFileEntry | undefined {
		return this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
	}

	readEntry(uri: URI, reader: IReader): IModifiedFileEntry | undefined {
		return this._entriesObs.read(reader).find(e => isEqual(e.modifiedURI, uri));
	}

	// ---- Accept / Reject (no-op) --------------------------------------------

	async accept(..._uris: URI[]): Promise<void> { /* no-op */ }
	async reject(..._uris: URI[]): Promise<void> { /* no-op */ }

	// ---- Snapshots ----------------------------------------------------------

	private _findCheckpointIndex(requestId: string, stopId: string | undefined): number {
		if (stopId !== undefined) {
			return this._checkpoints.findIndex(cp => cp.requestId === requestId && cp.undoStopId === stopId);
		}
		// No specific stop: use the last checkpoint for this request
		for (let i = this._checkpoints.length - 1; i >= 0; i--) {
			if (this._checkpoints[i].requestId === requestId) {
				return i;
			}
		}
		return -1;
	}

	private _findCheckpoint(requestId: string, stopId: string | undefined): IAgentHostCheckpoint | undefined {
		const idx = this._findCheckpointIndex(requestId, stopId);
		return idx >= 0 ? this._checkpoints[idx] : undefined;
	}

	async restoreSnapshot(requestId: string, stopId: string | undefined): Promise<void> {
		const idx = this._findCheckpointIndex(requestId, stopId);
		if (idx < 0) {
			this._logService.warn(`[AgentHostEditingSession] No checkpoint found for requestId=${requestId}${stopId ? `, stopId=${stopId}` : ''}`);
			return;
		}

		// Navigate to the target checkpoint
		const currentIdx = this._currentCheckpointIndex.get();
		if (idx < currentIdx) {
			// Undo forward checkpoints
			for (let i = currentIdx; i > idx; i--) {
				await this._writeCheckpointContent(this._checkpoints[i], 'before');
			}
		} else if (idx > currentIdx) {
			// Redo to reach the target
			for (let i = currentIdx + 1; i <= idx; i++) {
				await this._writeCheckpointContent(this._checkpoints[i], 'after');
			}
		}

		transaction(tx => {
			this._currentCheckpointIndex.set(idx, tx);
		});
		this._rebuildEntries();
	}

	getSnapshotUri(requestId: string, uri: URI, stopId: string | undefined): URI | undefined {
		const cp = this._findCheckpoint(requestId, stopId);
		if (!cp) {
			return undefined;
		}

		const uriStr = uri.toString();
		const edit = cp.edits.find(e => e.resource.toString() === uriStr);
		if (!edit) {
			return undefined;
		}

		return URI.from({
			scheme: Schemas.chatEditingSnapshotScheme,
			path: uri.path,
			query: JSON.stringify({ session: this.chatSessionResource.toString(), requestId, undoStop: stopId ?? '' }),
		});
	}

	async getSnapshotContents(requestId: string, uri: URI, stopId: string | undefined): Promise<VSBuffer | undefined> {
		const cp = this._findCheckpoint(requestId, stopId);
		if (!cp) {
			return undefined;
		}

		const uriStr = uri.toString();
		const edit = cp.edits.find(e => e.resource.toString() === uriStr);
		if (!edit) {
			return undefined;
		}

		try {
			const content = await this._fileService.readFile(edit.afterContentUri);
			return content.value;
		} catch (err) {
			this._logService.warn(`[AgentHostEditingSession] Failed to fetch snapshot content`, err);
			return undefined;
		}
	}

	async getSnapshotModel(_requestId: string, _undoStop: string | undefined, _snapshotUri: URI): Promise<ITextModel | null> {
		return null;
	}

	// ---- Diffs --------------------------------------------------------------

	getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> | undefined {
		// Find the checkpoint for this stop
		const startIdx = requestId !== undefined
			? this._checkpoints.findIndex(cp => cp.requestId === requestId && (stopId === undefined || cp.undoStopId === stopId))
			: -1;
		if (startIdx < 0 && requestId !== undefined) {
			return undefined;
		}

		// fromIdx is the boundary *before* the range, toIdx is the last
		// checkpoint in the range. For a single stop, the stop checkpoint
		// should be the range, so fromIdx is one before it.
		const fromIdx = requestId !== undefined ? startIdx - 1 : -1;
		const toIdx = requestId !== undefined ? startIdx : (this._checkpoints.length > 0 ? 0 : -1);
		if (toIdx < 0) {
			return undefined;
		}

		return this._getFileDiffObservable(uri, fromIdx, toIdx);
	}

	getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> {
		const startIndices = this._checkpoints
			.map((cp, i) => cp.requestId === startRequestId ? i : -1)
			.filter(i => i >= 0);
		const stopIndices = this._checkpoints
			.map((cp, i) => cp.requestId === stopRequestId ? i : -1)
			.filter(i => i >= 0);

		if (startIndices.length === 0 || stopIndices.length === 0) {
			return constObservable(undefined);
		}

		const fromIdx = startIndices[0];
		const toIdx = stopIndices[stopIndices.length - 1];

		return this._getFileDiffObservable(uri, fromIdx - 1, toIdx);
	}

	/**
	 * Returns an observable diff for a single file between two checkpoint
	 * boundary positions. `fromIdx` is the checkpoint *before* the range
	 * (use -1 for "from baseline"), `toIdx` is the last checkpoint in the range.
	 */
	private _getFileDiffObservable(uri: URI, fromIdx: number, toIdx: number): IObservable<IEditSessionEntryDiff | undefined> {
		const uriStr = uri.toString();

		// Determine the "before" content URI: the state of the file at the
		// fromIdx boundary. If fromIdx >= 0, this is the afterContentUri of
		// the last edit at or before that checkpoint. If fromIdx is -1
		// (baseline), it's the first edit's beforeContentUri.
		let beforeContentUri: URI | undefined;
		if (fromIdx >= 0) {
			for (let i = fromIdx; i >= 0; i--) {
				for (const edit of this._checkpoints[i].edits) {
					if (edit.resource.toString() === uriStr) {
						beforeContentUri = edit.afterContentUri;
						break;
					}
				}
				if (beforeContentUri) {
					break;
				}
			}
		}

		// Determine the "after" content URI: the state after the last edit
		// in the range. Also pick up the first beforeContentUri if we didn't
		// find one above (file wasn't edited before fromIdx).
		let afterContentUri: URI | undefined;
		for (let i = Math.max(0, fromIdx); i <= toIdx && i < this._checkpoints.length; i++) {
			for (const edit of this._checkpoints[i].edits) {
				if (edit.resource.toString() === uriStr) {
					if (!beforeContentUri) {
						beforeContentUri = edit.beforeContentUri;
					}
					if (i > fromIdx) {
						afterContentUri = edit.afterContentUri;
					}
				}
			}
		}

		if (!beforeContentUri || !afterContentUri) {
			return constObservable(undefined);
		}

		return this._computeFileDiffObservable(beforeContentUri, afterContentUri, uri);
	}

	/**
	 * Returns a cached observable that computes the diff between two content URIs.
	 * The result is cached by the URI pair since content is immutable.
	 */
	private _computeFileDiffObservable(beforeUri: URI, afterUri: URI, fileUri: URI): IObservable<IEditSessionEntryDiff | undefined> {
		const cacheKey = `${beforeUri.toString()}\0${afterUri.toString()}`;
		const cached = this._diffCache.get(cacheKey);
		if (cached) {
			return constObservable(cached);
		}

		const promise = new ObservablePromise(this._computeFileDiff(beforeUri, afterUri, fileUri));

		return derivedOpts({ owner: this }, reader => {
			const result = promise.promiseResult.read(reader);
			if (!result) {
				return { ...emptySessionEntryDiff(beforeUri, afterUri), isBusy: true };
			}
			if (result.data) {
				this._diffCache.set(cacheKey, result.data);
				return result.data;
			}
			return emptySessionEntryDiff(beforeUri, afterUri);
		});
	}

	/**
	 * Fetches before/after content, creates temporary text models, computes
	 * the diff via {@link IEditorWorkerService}, and returns the result.
	 */
	private async _computeFileDiff(beforeUri: URI, afterUri: URI, fileUri: URI): Promise<IEditSessionEntryDiff> {
		const refs = new DisposableStore();
		try {
			const beforeRef = await this._textModelService.createModelReference(beforeUri);
			refs.add(beforeRef);
			const afterRef = await this._textModelService.createModelReference(afterUri);
			refs.add(afterRef);

			const diff = await this._editorWorkerService.computeDiff(
				beforeRef.object.textEditorModel.uri,
				afterRef.object.textEditorModel.uri,
				{ ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3000 },
				'advanced',
			);

			const entryDiff: IEditSessionEntryDiff = {
				originalURI: beforeUri,
				modifiedURI: fileUri,
				identical: !!diff?.identical,
				isFinal: true,
				quitEarly: !diff || diff.quitEarly,
				added: 0,
				removed: 0,
				isBusy: false,
			};

			if (diff) {
				for (const change of diff.changes) {
					entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
					entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
				}
			}

			return entryDiff;
		} catch (err) {
			this._logService.warn('[AgentHostEditingSession] diff computation failed', err);
			return { ...emptySessionEntryDiff(beforeUri, afterUri), isFinal: true };
		} finally {
			refs.dispose();
		}
	}

	getDiffsForFilesInSession(): IObservable<readonly IEditSessionEntryDiff[]> {
		return derived(this, r => {
			const currentIdx = this._currentCheckpointIndex.read(r);
			return this._readDiffsFromCheckpoints(-1, currentIdx);
		}).map((diffs, r) => diffs.read(r));
	}

	getDiffsForFilesInRequest(requestId: string): IObservable<readonly IEditSessionEntryDiff[]> {
		return derived(this, r => {
			const currentIdx = this._currentCheckpointIndex.read(r);
			const filteredCheckpoints: number[] = [];
			for (let i = 0; i <= currentIdx && i < this._checkpoints.length; i++) {
				if (this._checkpoints[i].requestId === requestId) {
					filteredCheckpoints.push(i);
				}
			}
			if (filteredCheckpoints.length === 0) {
				return undefined;
			}
			return this._readDiffsFromCheckpoints(filteredCheckpoints[0] - 1, filteredCheckpoints[filteredCheckpoints.length - 1]);
		}).map((diffs, r) => diffs?.read(r) || []);
	}

	hasEditsInRequest(requestId: string, _reader?: IReader): boolean {
		return this._checkpoints.some(cp => cp.requestId === requestId);
	}

	getDiffForSession(): IObservable<IEditSessionDiffStats> {
		const sessionDiffs = this.getDiffsForFilesInSession();
		return derived(this, r => {
			const diffs = sessionDiffs.read(r);
			let added = 0;
			let removed = 0;
			for (const diff of diffs) {
				added += diff.added;
				removed += diff.removed;
			}
			return { added, removed };
		});
	}

	// ---- Undo / Redo --------------------------------------------------------

	async undoInteraction(): Promise<void> {
		return this._undoRedoSequencer.queue(() => this._undoInteractionImpl());
	}

	async redoInteraction(): Promise<void> {
		return this._undoRedoSequencer.queue(() => this._redoInteractionImpl());
	}

	private async _undoInteractionImpl(): Promise<void> {
		const idx = this._currentCheckpointIndex.get();
		if (idx < 0) {
			return;
		}

		await this._writeCheckpointContent(this._checkpoints[idx], 'before');

		transaction(tx => {
			this._currentCheckpointIndex.set(idx - 1, tx);
		});
		this._rebuildEntries();
	}

	private async _redoInteractionImpl(): Promise<void> {
		const idx = this._currentCheckpointIndex.get();
		if (idx >= this._checkpoints.length - 1) {
			return;
		}

		const nextIdx = idx + 1;
		await this._writeCheckpointContent(this._checkpoints[nextIdx], 'after');

		transaction(tx => {
			this._currentCheckpointIndex.set(nextIdx, tx);
		});
		this._rebuildEntries();
	}

	// ---- Explanations (stubs) -----------------------------------------------

	async triggerExplanationGeneration(): Promise<void> {
		this._hasExplanations = true;
	}

	clearExplanations(): void {
		this._hasExplanations = false;
	}

	hasExplanations(): boolean {
		return this._hasExplanations;
	}

	// ---- Unsupported operations (agent host owns edits server-side) ----------

	startStreamingEdits(_resource: URI, _responseModel: IChatResponseModel, _inUndoStop: string | undefined): IStreamingEdits {
		throw new Error('Not supported for agent host sessions');
	}

	applyWorkspaceEdit(_edit: IChatWorkspaceEdit, _responseModel: IChatResponseModel, _undoStopId: string): void {
		throw new Error('Not supported for agent host sessions');
	}

	async startExternalEdits(_responseModel: IChatResponseModel, _operationId: number, _resources: URI[], _undoStopId: string, _contentFor?: URI[]): Promise<IChatProgress[]> {
		throw new Error('Not supported for agent host sessions');
	}

	async stopExternalEdits(_responseModel: IChatResponseModel, _operationId: number, _contentFor?: URI[]): Promise<IChatProgress[]> {
		throw new Error('Not supported for agent host sessions');
	}

	// ---- Stop / Dispose -----------------------------------------------------

	async stop(_clearState?: boolean): Promise<void> {
		this.dispose();
	}

	override dispose(): void {
		this._state.set(ChatEditingSessionState.Disposed, undefined);
		this._onDidDispose.fire();
		this._diffCache.clear();
		super.dispose();
	}

	// ---- Private helpers ----------------------------------------------------

	private _rebuildEntries(): void {
		const currentIdx = this._currentCheckpointIndex.get();
		const resourceMap = new Map<string, { resource: URI; beforeContentUri: URI; afterContentUri: URI; requestId: string; added: number; removed: number }>();

		for (let i = 0; i <= currentIdx && i < this._checkpoints.length; i++) {
			const cp = this._checkpoints[i];
			for (const edit of cp.edits) {
				const key = edit.resource.toString();
				const existing = resourceMap.get(key);
				if (existing) {
					// Update after-content to the latest, accumulate diff counts
					existing.afterContentUri = edit.afterContentUri;
					existing.requestId = cp.requestId;
					existing.added += edit.diff?.added ?? 0;
					existing.removed += edit.diff?.removed ?? 0;
				} else {
					resourceMap.set(key, {
						resource: edit.resource,
						beforeContentUri: edit.beforeContentUri,
						afterContentUri: edit.afterContentUri,
						requestId: cp.requestId,
						added: edit.diff?.added ?? 0,
						removed: edit.diff?.removed ?? 0,
					});
				}
			}
		}

		const entries = [...resourceMap.values()].map(v =>
			new AgentHostModifiedFileEntry(v.resource, v.beforeContentUri, v.requestId, v.added, v.removed)
		);

		this._entriesObs.set(entries, undefined);
	}

	private async _writeCheckpointContent(checkpoint: IAgentHostCheckpoint, direction: 'before' | 'after'): Promise<void> {
		const writes = checkpoint.edits.map(async edit => {
			const contentUri = direction === 'before' ? edit.beforeContentUri : edit.afterContentUri;
			try {
				const file = await this._fileService.readFile(contentUri);
				this._onDidRequestFileWrite.fire({
					uri: edit.resource.toString(),
					data: file.value.toString(),
					encoding: ContentEncoding.Utf8,
				});
			} catch (err) {
				this._logService.warn(`[AgentHostEditingSession] Failed to fetch content for ${direction}`, contentUri.toString(), err);
			}
		});
		await Promise.all(writes);
	}

	/**
	 * Collects unique file URIs from checkpoints in the given range and
	 * computes diffs for each via {@link _getFileDiffObservable}.
	 */
	private _readDiffsFromCheckpoints(
		fromIdx: number,
		toIdx: number,
	): IObservable<IEditSessionEntryDiff[]> {
		// Collect unique resource URIs from checkpoints in the range
		const seen = new Set<string>();
		const uris: URI[] = [];
		for (let i = Math.max(0, fromIdx + 1); i <= toIdx && i < this._checkpoints.length; i++) {
			for (const edit of this._checkpoints[i].edits) {
				const key = edit.resource.toString();
				if (!seen.has(key)) {
					seen.add(key);
					uris.push(edit.resource);
				}
			}
		}

		const observables = uris.map(uri => this._getFileDiffObservable(uri, fromIdx, toIdx));

		return derived(reader => observables.flatMap(o => o.read(reader)).filter(isDefined));
	}
}
