/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { findFirst, findLast, findLastIdx } from '../../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { derived, derivedOpts, IObservable, IReader, ITransaction, ObservablePromise, observableSignalFromEvent, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { Mutable } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { CellEditType, CellUri, INotebookTextModel } from '../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { IEditSessionEntryDiff, IModifiedEntryTelemetryInfo } from '../../common/chatEditingService.js';
import { IChatRequestDisablement } from '../../common/chatModel.js';
import { IChatEditingCheckpointTimeline } from './chatEditingCheckpointTimeline.js';
import { FileOperation, FileOperationType, IChatEditingTimelineState, ICheckpoint, IFileBaseline, IReconstructedFileExistsState, IReconstructedFileNotExistsState, IReconstructedFileState } from './chatEditingOperations.js';
import { ChatEditingSnapshotTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { createSnapshot as createNotebookSnapshot, restoreSnapshot as restoreNotebookSnapshot } from './notebook/chatEditingModifiedNotebookSnapshot.js';

const START_REQUEST_EPOCH = '$$start';
const STOP_ID_EPOCH_PREFIX = '__epoch_';

type IReconstructedFileStateWithNotebook = IReconstructedFileNotExistsState | (Mutable<IReconstructedFileExistsState> & { notebook?: INotebookTextModel });

/**
 * A filesystem delegate used by the checkpointing timeline such that
 * navigating in the timeline tracks the changes as agent-initiated.
 */
export interface IChatEditingTimelineFsDelegate {
	/** Creates a file with initial content. */
	createFile: (uri: URI, initialContent: string) => Promise<unknown>;
	/** Delete a URI */
	deleteFile: (uri: URI) => Promise<void>;
	/** Rename a URI, retaining contents */
	renameFile: (fromUri: URI, toUri: URI) => Promise<void>;
	/** Set a URI contents, should create it if it does not already exist */
	setContents(uri: URI, content: string, telemetryInfo: IModifiedEntryTelemetryInfo): Promise<void>;
}

/**
 * Implementation of the checkpoint-based timeline system.
 *
 * Invariants:
 * - There is at most one checkpoint or operation per epoch
 * - _checkpoints and _operations are always sorted in ascending order by epoch
 * - _currentEpoch being equal to the epoch of an operation means that
 *   operation is _not_ currently applied
 */
export class ChatEditingCheckpointTimelineImpl implements IChatEditingCheckpointTimeline {

	private _epochCounter = 0;
	private readonly _checkpoints = observableValue<readonly ICheckpoint[]>(this, []);
	private readonly _currentEpoch = observableValue<number>(this, 0);
	private readonly _operations = observableValueOpts<FileOperation[]>({ equalsFn: () => false }, []); // mutable
	private readonly _fileBaselines = new Map<string, IFileBaseline>(); // key: `${uri}::${requestId}`

	/** Gets the checkpoint, if any, we can 'undo' to. */
	private readonly _willUndoToCheckpoint = derived(reader => {
		const currentEpoch = this._currentEpoch.read(reader);
		const checkpoints = this._checkpoints.read(reader);
		if (checkpoints.length < 2 || currentEpoch <= checkpoints[1].epoch) {
			return undefined;
		}

		const operations = this._operations.read(reader);

		// Undo either to right before the current request...
		const currentCheckpointIdx = findLastIdx(checkpoints, cp => cp.epoch < currentEpoch);
		const startOfRequest = currentCheckpointIdx === -1 ? undefined : findLast(checkpoints, cp => cp.undoStopId === undefined, currentCheckpointIdx);

		// Or to the checkpoint before the last operation in this request
		const previousOperation = findLast(operations, op => op.epoch < currentEpoch);
		const previousCheckpoint = previousOperation && findLast(checkpoints, cp => cp.epoch < previousOperation.epoch);

		if (!startOfRequest) {
			return previousCheckpoint;
		}
		if (!previousCheckpoint) {
			return startOfRequest;
		}

		// Special case: if we're undoing the first edit operation, undo the entire request
		if (!operations.some(op => op.epoch > startOfRequest.epoch && op.epoch < previousCheckpoint!.epoch)) {
			return startOfRequest;
		}

		return previousCheckpoint.epoch > startOfRequest.epoch ? previousCheckpoint : startOfRequest;
	});

	public readonly canUndo: IObservable<boolean> = this._willUndoToCheckpoint.map(cp => !!cp);


	/**
	 * Gets the epoch we'll redo this. Unlike undo this doesn't only use checkpoints
	 * because we could potentially redo to a 'tip' operation that's not checkpointed yet.
	 */
	private readonly _willRedoToEpoch = derived(reader => {
		const currentEpoch = this._currentEpoch.read(reader);
		const operations = this._operations.read(reader);
		const checkpoints = this._checkpoints.read(reader);
		const maxEncounteredEpoch = Math.max(operations.at(-1)?.epoch || 0, checkpoints.at(-1)?.epoch || 0);
		if (currentEpoch > maxEncounteredEpoch) {
			return undefined;
		}

		// Find the next edit operation that would be applied...
		const nextOperation = operations.find(op => op.epoch >= currentEpoch);
		const nextCheckpoint = nextOperation && checkpoints.find(op => op.epoch > nextOperation.epoch);

		// And figure out where we're going if we're navigating across request
		// 1. If there is no next request or if the next target checkpoint is in
		//    the next request, navigate there.
		// 2. Otherwise, navigate to the end of the next request.
		const currentCheckpoint = findLast(checkpoints, cp => cp.epoch < currentEpoch);
		if (currentCheckpoint && nextOperation && currentCheckpoint.requestId !== nextOperation.requestId) {
			const startOfNextRequestIdx = findLastIdx(checkpoints, (cp, i) =>
				cp.undoStopId === undefined && (checkpoints[i - 1]?.requestId === currentCheckpoint.requestId));
			const startOfNextRequest = startOfNextRequestIdx === -1 ? undefined : checkpoints[startOfNextRequestIdx];

			if (startOfNextRequest && nextOperation.requestId !== startOfNextRequest.requestId) {
				const requestAfterTheNext = findFirst(checkpoints, op => op.undoStopId === undefined, startOfNextRequestIdx + 1);
				if (requestAfterTheNext) {
					return requestAfterTheNext.epoch;
				}
			}
		}

		return Math.min(
			nextCheckpoint?.epoch || Infinity,
			(maxEncounteredEpoch + 1),
		);
	});

	public readonly canRedo: IObservable<boolean> = this._willRedoToEpoch.map(e => !!e);

	public readonly requestDisablement: IObservable<IChatRequestDisablement[]> = derivedOpts(
		{ equalsFn: (a, b) => arraysEqual(a, b, objectsEqual) },
		reader => {
			const currentEpoch = this._currentEpoch.read(reader);
			const operations = this._operations.read(reader);
			const checkpoints = this._checkpoints.read(reader);

			const maxEncounteredEpoch = Math.max(operations.at(-1)?.epoch || 0, checkpoints.at(-1)?.epoch || 0);
			if (currentEpoch > maxEncounteredEpoch) {
				return []; // common case -- nothing undone
			}

			const lastAppliedOperation = findLast(operations, op => op.epoch < currentEpoch)?.epoch || 0;
			const lastAppliedRequest = findLast(checkpoints, cp => cp.epoch < currentEpoch && cp.undoStopId === undefined)?.epoch || 0;
			const stopDisablingAtEpoch = Math.max(lastAppliedOperation, lastAppliedRequest);

			const disablement = new Map<string, string | undefined>();

			// Go through the checkpoints and disable any until the one that contains the last applied operation.
			// Subtle: the request will first make a checkpoint with an 'undefined' undo
			// stop, and in this loop we'll "automatically" disable the entire request when
			// we reach that checkpoint.
			for (let i = checkpoints.length - 1; i >= 0; i--) {
				const { undoStopId, requestId, epoch } = checkpoints[i];
				if (epoch <= stopDisablingAtEpoch) {
					break;
				}

				if (requestId) {
					disablement.set(requestId, undoStopId);
				}
			}

			return [...disablement].map(([requestId, afterUndoStop]): IChatRequestDisablement => ({ requestId, afterUndoStop }));
		});

	constructor(
		private readonly chatSessionId: string,
		private readonly _delegate: IChatEditingTimelineFsDelegate,
		@INotebookEditorModelResolverService private readonly _notebookEditorModelResolverService: INotebookEditorModelResolverService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this.createCheckpoint(undefined, undefined, 'Initial State', 'Starting point before any edits');
	}

	public createCheckpoint(requestId: string | undefined, undoStopId: string | undefined, label: string, description?: string): string {
		const existingCheckpoints = this._checkpoints.get();
		const existing = existingCheckpoints.find(c => c.undoStopId === undoStopId && c.requestId === requestId);
		if (existing) {
			return existing.checkpointId;
		}

		const { checkpoints, operations } = this._getVisibleOperationsAndCheckpoints();
		const checkpointId = generateUuid();
		const epoch = this.incrementEpoch();

		checkpoints.push({
			checkpointId,
			requestId,
			undoStopId,
			epoch,
			label,
			description
		});

		transaction(tx => {
			this._checkpoints.set(checkpoints, tx);
			this._operations.set(operations, tx);
			this._currentEpoch.set(epoch + 1, tx);
		});

		return checkpointId;
	}

	public async undoToLastCheckpoint(): Promise<void> {
		const checkpoint = this._willUndoToCheckpoint.get();
		if (checkpoint) {
			await this.navigateToCheckpoint(checkpoint.checkpointId);
		}
	}

	public async redoToNextCheckpoint(): Promise<void> {
		const targetEpoch = this._willRedoToEpoch.get();
		if (targetEpoch) {
			await this._navigateToEpoch(targetEpoch);
		}
	}

	public navigateToCheckpoint(checkpointId: string): Promise<void> {
		const targetCheckpoint = this._getCheckpoint(checkpointId);
		if (!targetCheckpoint) {
			throw new Error(`Checkpoint ${checkpointId} not found`);
		}

		if (targetCheckpoint.undoStopId === undefined) {
			// If we're navigating to the start of a request, we want to restore the file
			// to whatever baseline we captured, _not_ the result state from the prior request
			// because there may have been user changes in the meantime. But we still want
			// to set the epoch marking that checkpoint as having been undone (the second
			// arg below) so that disablement works and so it's discarded if appropriate later.
			return this._navigateToEpoch(targetCheckpoint.epoch + 1, targetCheckpoint.epoch);
		} else {
			return this._navigateToEpoch(targetCheckpoint.epoch + 1);
		}

	}

	public getContentURIAtStop(requestId: string, fileURI: URI, stopId: string | undefined): URI {
		return ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this.chatSessionId, requestId, stopId, fileURI.path);
	}

	private async _navigateToEpoch(restoreToEpoch: number, navigateToEpoch = restoreToEpoch): Promise<void> {
		const currentEpoch = this._currentEpoch.get();
		if (currentEpoch !== restoreToEpoch) {
			const urisToRestore = await this._applyFileSystemOperations(currentEpoch, restoreToEpoch);

			// Reconstruct content for files affected by operations in the range
			await this._reconstructAllFileContents(restoreToEpoch, urisToRestore);
		}

		// Update current epoch
		this._currentEpoch.set(navigateToEpoch, undefined);
	}

	private _getCheckpoint(checkpointId: string): ICheckpoint | undefined {
		return this._checkpoints.get().find(c => c.checkpointId === checkpointId);
	}

	public incrementEpoch() {
		return this._epochCounter++;
	}

	public recordFileOperation(operation: FileOperation): void {
		const { currentEpoch, checkpoints, operations } = this._getVisibleOperationsAndCheckpoints();
		if (operation.epoch < currentEpoch) {
			throw new Error(`Cannot record operation at epoch ${operation.epoch} when current epoch is ${currentEpoch}`);
		}

		operations.push(operation);
		transaction(tx => {
			this._checkpoints.set(checkpoints, tx);
			this._operations.set(operations, tx);
			this._currentEpoch.set(operation.epoch + 1, tx);
		});
	}

	private _getVisibleOperationsAndCheckpoints() {
		const currentEpoch = this._currentEpoch.get();
		const checkpoints = this._checkpoints.get();
		const operations = this._operations.get();

		return {
			currentEpoch,
			checkpoints: checkpoints.filter(c => c.epoch < currentEpoch),
			operations: operations.filter(op => op.epoch < currentEpoch)
		};
	}

	public recordFileBaseline(baseline: IFileBaseline): void {
		const key = this._getBaselineKey(baseline.uri, baseline.requestId);
		this._fileBaselines.set(key, baseline);
	}

	private _getFileBaseline(uri: URI, requestId: string): IFileBaseline | undefined {
		const key = this._getBaselineKey(uri, requestId);
		return this._fileBaselines.get(key);
	}

	public hasFileBaseline(uri: URI, requestId: string): boolean {
		const key = this._getBaselineKey(uri, requestId);
		return this._fileBaselines.has(key);
	}

	public async getContentAtStop(requestId: string, contentURI: URI, stopId: string | undefined) {
		let toEpoch: number | undefined;
		if (stopId?.startsWith(STOP_ID_EPOCH_PREFIX)) {
			toEpoch = Number(stopId.slice(STOP_ID_EPOCH_PREFIX.length));
		} else {
			toEpoch = this._checkpoints.get().find(c => c.requestId === requestId && c.undoStopId === stopId)?.epoch;
		}

		// The content URI doesn't preserve the original scheme or authority. Look through
		// to find the operation that touched that path to get its actual URI
		const fileURI = this._getTimelineCanonicalUriForPath(contentURI);

		if (!toEpoch || !fileURI) {
			return '';
		}

		const baseline = await this._findBestBaselineForFile(fileURI, toEpoch, requestId);
		if (!baseline) {
			return '';
		}

		const operations = this._getFileOperationsInRange(fileURI, baseline.epoch, toEpoch);
		const replayed = await this._replayOperations(baseline, operations);
		return replayed.exists ? replayed.content : undefined;
	}

	private _getTimelineCanonicalUriForPath(contentURI: URI) {
		for (const it of [this._fileBaselines.values(), this._operations.get()]) {
			for (const thing of it) {
				if (thing.uri.path === contentURI.path) {
					return thing.uri;
				}
			}
		}

		return undefined;
	}

	/**
	 * Creates a callback that is invoked when data at the stop changes. This
	 * will not fire initially and may be debounced internally.
	 */
	public onDidChangeContentsAtStop(requestId: string, contentURI: URI, stopId: string | undefined, callback: (data: string) => void): IDisposable {
		// The only case where we have data that updates is if we have an epoch pointer that's
		// after our know epochs (e.g. pointing to the end file state after all operations).
		// If this isn't the case, abort.
		if (!stopId || !stopId.startsWith(STOP_ID_EPOCH_PREFIX)) {
			return Disposable.None;
		}

		const target = Number(stopId.slice(STOP_ID_EPOCH_PREFIX.length));
		if (target <= this._epochCounter) {
			return Disposable.None; // already finalized
		}

		const store = new DisposableStore();
		const scheduler = store.add(new ThrottledDelayer(500));

		store.add(Event.fromObservableLight(this._operations)(() => {
			scheduler.trigger(async () => {
				if (this._operations.get().at(-1)?.epoch! >= target) {
					store.dispose();
				}

				const content = await this.getContentAtStop(requestId, contentURI, stopId);
				if (content !== undefined) {
					callback(content);
				}
			});
		}));

		return store;
	}

	private _getCheckpointBeforeEpoch(epoch: number, reader?: IReader) {
		return findLast(this._checkpoints.read(reader), c => c.epoch <= epoch);
	}

	private async _reconstructFileState(uri: URI, targetEpoch: number): Promise<IReconstructedFileState> {
		const targetCheckpoint = this._getCheckpointBeforeEpoch(targetEpoch);
		if (!targetCheckpoint) {
			throw new Error(`Checkpoint for epoch ${targetEpoch} not found`);
		}

		// Find the most appropriate baseline for this file
		const baseline = await this._findBestBaselineForFile(uri, targetEpoch, targetCheckpoint.requestId || '');
		if (!baseline) {
			// File doesn't exist at this checkpoint
			return {
				exists: false,
				uri,
			};
		}

		// Get operations that affect this file from baseline to target checkpoint
		const operations = this._getFileOperationsInRange(uri, baseline.epoch, targetEpoch);

		// Replay operations to reconstruct state
		return this._replayOperations(baseline, operations);
	}

	public getStateForPersistence(): IChatEditingTimelineState {
		return {
			checkpoints: this._checkpoints.get(),
			currentEpoch: this._currentEpoch.get(),
			fileBaselines: [...this._fileBaselines],
			operations: this._operations.get(),
			epochCounter: this._epochCounter,
		};
	}

	public restoreFromState(state: IChatEditingTimelineState, tx: ITransaction): void {
		this._checkpoints.set(state.checkpoints, tx);
		this._currentEpoch.set(state.currentEpoch, tx);
		this._operations.set(state.operations.slice(), tx);
		this._epochCounter = state.epochCounter;

		this._fileBaselines.clear();
		for (const [key, baseline] of state.fileBaselines) {
			this._fileBaselines.set(key, baseline);
		}
	}

	public getCheckpointIdForRequest(requestId: string, undoStopId?: string): string | undefined {
		const checkpoints = this._checkpoints.get();
		return checkpoints.find(c => c.requestId === requestId && c.undoStopId === undoStopId)?.checkpointId;
	}

	private async _reconstructAllFileContents(targetEpoch: number, filesToReconstruct: ResourceSet): Promise<void> {
		await Promise.all(Array.from(filesToReconstruct).map(async uri => {
			const reconstructedState = await this._reconstructFileState(uri, targetEpoch);
			if (reconstructedState.exists) {
				await this._delegate.setContents(reconstructedState.uri, reconstructedState.content, reconstructedState.telemetryInfo);
			}
		}));
	}

	private _getBaselineKey(uri: URI, requestId: string): string {
		return `${uri.toString()}::${requestId}`;
	}

	private async _findBestBaselineForFile(uri: URI, epoch: number, requestId: string): Promise<IFileBaseline | undefined> {
		// First, iterate backwards through operations before the target checkpoint
		// to see if the file was created/re-created more recently than any baseline

		let currentRequestId = requestId;
		const operations = this._operations.get();
		for (let i = operations.length - 1; i >= 0; i--) {
			const operation = operations[i];
			if (operation.epoch > epoch) {
				continue;
			}

			// If the file was just created, use that as its updated baseline
			if (operation.type === FileOperationType.Create && isEqual(operation.uri, uri)) {
				return {
					uri: operation.uri,
					requestId: operation.requestId,
					content: operation.initialContent,
					epoch: operation.epoch,
					telemetryInfo: operation.telemetryInfo,
				};
			}

			// If the file was renamed to this URI, use its old contents as the baseline
			if (operation.type === FileOperationType.Rename && isEqual(operation.newUri, uri)) {
				const prev = await this._findBestBaselineForFile(operation.oldUri, operation.epoch, operation.requestId);
				if (!prev) {
					return undefined;
				}


				const operations = this._getFileOperationsInRange(operation.oldUri, prev.epoch, operation.epoch);
				const replayed = await this._replayOperations(prev, operations);
				return {
					uri: uri,
					epoch: operation.epoch,
					content: replayed.exists ? replayed.content : '',
					requestId: operation.requestId,
					telemetryInfo: prev.telemetryInfo,
					notebookViewType: replayed.exists ? replayed.notebookViewType : undefined,
				};
			}

			// When the request ID changes, check if we have a baseline for the current request
			if (currentRequestId && operation.requestId !== currentRequestId) {
				const baseline = this._getFileBaseline(uri, currentRequestId);
				if (baseline) {
					return baseline;
				}
			}

			currentRequestId = operation.requestId;
		}

		// Check the final request ID for a baseline
		return this._getFileBaseline(uri, currentRequestId);
	}

	private _getFileOperationsInRange(uri: URI, fromEpoch: number, toEpoch: number): readonly FileOperation[] {
		return this._operations.get().filter(op => {
			const cellUri = CellUri.parse(op.uri);
			return op.epoch >= fromEpoch &&
				op.epoch < toEpoch &&
				(isEqual(op.uri, uri) || (cellUri && isEqual(cellUri.notebook, uri)));
		}).sort((a, b) => a.epoch - b.epoch);
	}

	private async _replayOperations(baseline: IFileBaseline, operations: readonly FileOperation[]): Promise<IReconstructedFileState> {
		let currentState: IReconstructedFileStateWithNotebook = {
			exists: true,
			content: baseline.content,
			uri: baseline.uri,
			telemetryInfo: baseline.telemetryInfo,
		};

		if (baseline.notebookViewType) {
			currentState.notebook = await this._notebookEditorModelResolverService.createUntitledNotebookTextModel(baseline.notebookViewType);
			if (baseline.content) {
				restoreNotebookSnapshot(currentState.notebook, baseline.content);
			}
		}

		for (const operation of operations) {
			currentState = await this._applyOperationToState(currentState, operation, baseline.telemetryInfo);
		}

		if (currentState.exists && currentState.notebook) {
			const info = await this._notebookService.withNotebookDataProvider(currentState.notebook.viewType);
			currentState.content = createNotebookSnapshot(currentState.notebook, info.serializer.options, this._configurationService);
			currentState.notebook.dispose();
		}

		return currentState;
	}

	private async _applyOperationToState(state: IReconstructedFileStateWithNotebook, operation: FileOperation, telemetryInfo: IModifiedEntryTelemetryInfo): Promise<IReconstructedFileStateWithNotebook> {
		switch (operation.type) {
			case FileOperationType.Create: {
				if (state.exists && state.notebook) {
					state.notebook.dispose();
				}

				let notebook: INotebookTextModel | undefined;
				if (operation.notebookViewType) {
					notebook = await this._notebookEditorModelResolverService.createUntitledNotebookTextModel(operation.notebookViewType);
					if (operation.initialContent) {
						restoreNotebookSnapshot(notebook, operation.initialContent);
					}
				}

				return {
					exists: true,
					content: operation.initialContent,
					uri: operation.uri,
					telemetryInfo,
					notebookViewType: operation.notebookViewType,
					notebook,
				};
			}

			case FileOperationType.Delete:
				if (state.exists && state.notebook) {
					state.notebook.dispose();
				}

				return {
					exists: false,
					uri: operation.uri
				};

			case FileOperationType.Rename:
				return {
					...state,
					uri: operation.newUri
				};

			case FileOperationType.TextEdit: {
				if (!state.exists) {
					throw new Error('Cannot apply text edits to non-existent file');
				}

				const nbCell = operation.cellIndex !== undefined && state.notebook?.cells.at(operation.cellIndex);
				if (nbCell) {
					const newContent = this._applyTextEditsToContent(nbCell.getValue(), operation.edits);
					state.notebook!.applyEdits([{
						editType: CellEditType.Replace,
						index: operation.cellIndex,
						count: 1,
						cells: [{ cellKind: nbCell.cellKind, language: nbCell.language, mime: nbCell.language, source: newContent, outputs: nbCell.outputs }]
					}], true, undefined, () => undefined, undefined);
					return state;
				}

				// Apply text edits using a temporary text model
				return {
					...state,
					content: this._applyTextEditsToContent(state.content, operation.edits)
				};
			}
			case FileOperationType.NotebookEdit:
				if (!state.exists) {
					throw new Error('Cannot apply notebook edits to non-existent file');
				}
				if (!state.notebook) {
					throw new Error('Cannot apply notebook edits to non-notebook file');
				}

				state.notebook.applyEdits(operation.cellEdits.slice(), true, undefined, () => undefined, undefined);
				return state;

			default:
				assertNever(operation);
		}
	}

	private async _applyFileSystemOperations(fromEpoch: number, toEpoch: number): Promise<ResourceSet> {
		const isMovingForward = toEpoch > fromEpoch;
		const operations = this._operations.get().filter(op => {
			if (isMovingForward) {
				return op.epoch >= fromEpoch && op.epoch < toEpoch;
			} else {
				return op.epoch < fromEpoch && op.epoch >= toEpoch;
			}
		}).sort((a, b) => isMovingForward ? a.epoch - b.epoch : b.epoch - a.epoch);

		// Apply file system operations in the correct direction
		const urisToRestore = new ResourceSet();
		for (const operation of operations) {
			await this._applyFileSystemOperation(operation, isMovingForward, urisToRestore);
		}

		return urisToRestore;
	}

	private async _applyFileSystemOperation(operation: FileOperation, isMovingForward: boolean, urisToRestore: ResourceSet): Promise<void> {
		switch (operation.type) {
			case FileOperationType.Create:
				if (isMovingForward) {
					await this._delegate.createFile(operation.uri, operation.initialContent);
					urisToRestore.add(operation.uri);
				} else {
					await this._delegate.deleteFile(operation.uri);
					urisToRestore.delete(operation.uri);
				}
				break;

			case FileOperationType.Delete:
				if (isMovingForward) {
					await this._delegate.deleteFile(operation.uri);
					urisToRestore.delete(operation.uri);
				} else {
					await this._delegate.createFile(operation.uri, operation.finalContent);
					urisToRestore.add(operation.uri);
				}
				break;

			case FileOperationType.Rename:
				if (isMovingForward) {
					await this._delegate.renameFile(operation.oldUri, operation.newUri);
					urisToRestore.delete(operation.oldUri);
					urisToRestore.add(operation.newUri);
				} else {
					await this._delegate.renameFile(operation.newUri, operation.oldUri);
					urisToRestore.delete(operation.newUri);
					urisToRestore.add(operation.oldUri);
				}
				break;

			// Text and notebook edits don't affect file system structure
			case FileOperationType.TextEdit:
			case FileOperationType.NotebookEdit:
				urisToRestore.add(CellUri.parse(operation.uri)?.notebook ?? operation.uri);
				break;

			default:
				assertNever(operation);
		}
	}

	private _applyTextEditsToContent(content: string, edits: readonly TextEdit[]): string {
		// Use the example pattern provided by the user
		const makeModel = (uri: URI, contents: string) => this._instantiationService.createInstance(TextModel, contents, '', this._modelService.getCreationOptions('', uri, true), uri);

		// Create a temporary URI for the model
		const tempUri = URI.from({ scheme: 'temp', path: `/temp-${Date.now()}.txt` });
		const model = makeModel(tempUri, content);

		try {
			// Apply edits
			model.applyEdits(edits.map(edit => ({
				range: {
					startLineNumber: edit.range.startLineNumber,
					startColumn: edit.range.startColumn,
					endLineNumber: edit.range.endLineNumber,
					endColumn: edit.range.endColumn
				},
				text: edit.text
			})));

			return model.getValue();
		} finally {
			model.dispose();
		}
	}

	public getEntryDiffBetweenStops(uri: URI, requestId: string | undefined, stopId: string | undefined): IObservable<IEditSessionEntryDiff | undefined> {
		const epochs = derivedOpts<{ start: ICheckpoint; end: ICheckpoint | undefined }>({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, reader => {
			const checkpoints = this._checkpoints.read(reader);
			const startIndex = checkpoints.findIndex(c => c.requestId === requestId && c.undoStopId === stopId);
			return { start: checkpoints[startIndex], end: checkpoints[startIndex + 1] };
		});

		return this._getEntryDiffBetweenEpochs(uri, epochs);
	}

	public getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> {
		const epochs = derivedOpts<{ start: ICheckpoint; end: ICheckpoint | undefined }>({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, reader => {
			const checkpoints = this._checkpoints.read(reader);
			const startIndex = checkpoints.findIndex(c => c.requestId === startRequestId);
			const start = startIndex === -1 ? checkpoints[0] : checkpoints[startIndex];
			const end = checkpoints.find(c => c.requestId === stopRequestId) || findFirst(checkpoints, c => c.requestId !== startRequestId, startIndex) || checkpoints[checkpoints.length - 1];
			return { start, end };
		});

		return this._getEntryDiffBetweenEpochs(uri, epochs);
	}

	private _getEntryDiffBetweenEpochs(uri: URI, epochs: IObservable<{ start: ICheckpoint | undefined; end: ICheckpoint | undefined }>): IObservable<IEditSessionEntryDiff | undefined> {
		const modelRefsPromise = derived(this, (reader) => {
			const { start, end } = epochs.read(reader);
			if (!start) { return undefined; }

			const store = reader.store.add(new DisposableStore());
			const promise = Promise.all([
				this._textModelService.createModelReference(this.getContentURIAtStop(start.requestId || START_REQUEST_EPOCH, uri, STOP_ID_EPOCH_PREFIX + start.epoch)),
				this._textModelService.createModelReference(this.getContentURIAtStop(end?.requestId || start.requestId || START_REQUEST_EPOCH, uri, STOP_ID_EPOCH_PREFIX + (end?.epoch || Number.MAX_SAFE_INTEGER))),
			]).then(refs => {
				if (store.isDisposed) {
					refs.forEach(r => r.dispose());
				} else {
					refs.forEach(r => store.add(r));
				}

				return { refs, isFinal: !!end };
			});

			return new ObservablePromise(promise);
		});

		const resolvedModels = derived(reader => {
			const refs2 = modelRefsPromise.read(reader)?.promiseResult.read(reader);
			return refs2?.data && {
				isFinal: refs2.data.isFinal,
				refs: refs2.data.refs.map(r => ({
					model: r.object.textEditorModel,
					onChange: observableSignalFromEvent(this, r.object.textEditorModel.onDidChangeContent.bind(r.object.textEditorModel)),
				})),
			};
		});

		const diff = derived((reader): ObservablePromise<IEditSessionEntryDiff> | undefined => {
			const modelsData = resolvedModels.read(reader);
			if (!modelsData) {
				return;
			}

			const { refs, isFinal } = modelsData;

			refs.forEach(m => m.onChange.read(reader)); // re-read when contents change

			const promise = this._computeDiff(refs[0].model.uri, refs[1].model.uri, isFinal);
			return new ObservablePromise(promise);
		});

		return derived(reader => {
			return diff.read(reader)?.promiseResult.read(reader)?.data || undefined;
		});
	}

	private _computeDiff(originalUri: URI, modifiedUri: URI, isFinal: boolean): Promise<IEditSessionEntryDiff> {
		return this._editorWorkerService.computeDiff(
			originalUri,
			modifiedUri,
			{ ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3000 },
			'advanced'
		).then((diff): IEditSessionEntryDiff => {
			const entryDiff: IEditSessionEntryDiff = {
				originalURI: originalUri,
				modifiedURI: modifiedUri,
				identical: !!diff?.identical,
				isFinal,
				quitEarly: !diff || diff.quitEarly,
				added: 0,
				removed: 0,
			};
			if (diff) {
				for (const change of diff.changes) {
					entryDiff.removed += change.original.endLineNumberExclusive - change.original.startLineNumber;
					entryDiff.added += change.modified.endLineNumberExclusive - change.modified.startLineNumber;
				}
			}
			return entryDiff;
		});
	}
}
