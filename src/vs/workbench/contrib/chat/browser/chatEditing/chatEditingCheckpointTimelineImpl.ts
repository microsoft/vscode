/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { findLast } from '../../../../../base/common/arraysFind.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { derived, derivedOpts, IObservable, IReader, ITransaction, ObservablePromise, observableSignalFromEvent, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditSessionEntryDiff, IModifiedEntryTelemetryInfo } from '../../common/chatEditingService.js';
import { IChatRequestDisablement } from '../../common/chatModel.js';
import { IChatEditingCheckpointTimeline } from './chatEditingCheckpointTimeline.js';
import { FileOperation, FileOperationType, IChatEditingTimelineState, ICheckpoint, IFileBaseline, IFileCreateOperation, IFileDeleteOperation, IFileRenameOperation, IReconstructedFileState } from './chatEditingOperations.js';
import { ChatEditingSnapshotTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

const START_REQUEST_EPOCH = '$$start';
const STOP_ID_EPOCH_PREFIX = '__epoch_';

/**
 * Implementation of the checkpoint-based timeline system.
 *
 * Invariants:
 * - There is at most one checkpoint or operation per epoch
 * - _checkpoints and _operations are always sorted in ascending order by epoch
 * - _currentEpoch being equal to the epoch of an operation means that
 *   operation is _not_ currently applied
 */
export class ChatEditingCheckpointTimelineImpl extends Disposable implements IChatEditingCheckpointTimeline {

	private _epochCounter = 0;
	private readonly _checkpoints = observableValue<readonly ICheckpoint[]>(this, []);
	private readonly _currentEpoch = observableValue<number>(this, 0);
	private readonly _operations = observableValueOpts<FileOperation[]>({ equalsFn: () => false }, []); // mutable
	private readonly _fileBaselines = new Map<string, IFileBaseline>(); // key: `${uri}::${requestId}`

	/** Gets the checkpoint, if any, we can 'undo' to. */
	private readonly _willUndoToCheckpoint = derived(reader => {
		const currentEpoch = this._currentEpoch.read(reader);
		const maxEpoch = this._operations.read(reader).findLast(op => op.epoch < currentEpoch)?.epoch || 0;
		return this._checkpoints.read(reader).findLast(cp => cp.epoch < maxEpoch);
	});

	public readonly canUndo: IObservable<boolean> = this._willUndoToCheckpoint.map(cp => !!cp);


	/**
	 * Gets the epoch we'll redo this. Unlike undo this doesn't only use checkpoints
	 * because we could potentially redo to a 'tip' operation that's not checkpointed yet.
	 */
	private readonly _willRedoToEpoch = derived(reader => {
		const currentEpoch = this._currentEpoch.read(reader);
		const operations = this._operations.read(reader);
		const maxOperationEpoch = operations.at(-1)?.epoch || 0;
		if (currentEpoch > maxOperationEpoch) {
			return undefined;
		}

		const minEpoch = operations.find(op => op.epoch >= currentEpoch)?.epoch;
		const checkpointEpoch = minEpoch && this._checkpoints.read(reader).find(op => op.epoch > minEpoch)?.epoch;
		return checkpointEpoch || (maxOperationEpoch + 1);
	});

	public readonly canRedo: IObservable<boolean> = this._willRedoToEpoch.map(e => !!e);

	public readonly requestDisablement: IObservable<IChatRequestDisablement[]> = derivedOpts(
		{ equalsFn: (a, b) => arraysEqual(a, b, objectsEqual) },
		reader => {
			const currentEpoch = this._currentEpoch.read(reader);
			const checkpoints = this._checkpoints.read(reader);

			const disablement = new Map<string, string | undefined>();
			// Go through the checkpoints and disable any that are after our current epoch.
			// Subtle: the request will first make a checkpoint with an 'undefined' undo
			// stop, and in this loop we'll "automatically" disable the entire request when
			// we reach that checkpoint.
			for (let i = checkpoints.length - 1; i >= 0; i--) {
				const { undoStopId, requestId, epoch } = checkpoints[i];
				if (epoch < currentEpoch) {
					break;
				}

				if (requestId) {
					disablement.set(requestId, undoStopId);
				}
			}

			return [...disablement].map(([requestId, undoStopId]) => ({ requestId, undoStopId }));
		});

	constructor(
		private readonly chatSessionId: string,
		private readonly _delegate: {
			setContents(uri: URI, content: string, telemetryInfo: IModifiedEntryTelemetryInfo): Promise<void>;
		},
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
	) {
		super();

		// Create initial checkpoint
		this.createCheckpoint(undefined, undefined, 'Initial State', 'Starting point before any edits');
	}

	public createCheckpoint(requestId: string | undefined, undoStopId: string | undefined, label: string, description?: string): void {
		const existingCheckpoints = this._checkpoints.get();
		if (existingCheckpoints.some(c => c.undoStopId === undoStopId && c.requestId === requestId)) {
			return;
		}

		const checkpointId = generateUuid();
		const checkpoint: ICheckpoint = {
			checkpointId,
			requestId,
			undoStopId,
			epoch: this.incrementEpoch(),
			label,
			description
		};

		transaction(tx => {
			this._checkpoints.set([...existingCheckpoints, checkpoint], tx);
			this._currentEpoch.set(checkpoint.epoch, tx);
		});
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

		return this._navigateToEpoch(targetCheckpoint.epoch);
	}

	public getContentURIAtStop(requestId: string, fileURI: URI, stopId: string | undefined): URI {
		return ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this.chatSessionId, requestId, stopId, fileURI.path);
	}

	private async _navigateToEpoch(targetEpoch: number): Promise<void> {
		const currentEpoch = this._currentEpoch.get();
		if (currentEpoch === targetEpoch) {
			return; // Already at target epoch
		}

		await this._applyFileSystemOperations(currentEpoch, targetEpoch);

		// Reconstruct content for files affected by operations in the range
		await this._reconstructAllFileContents(targetEpoch);

		// Update current epoch
		this._currentEpoch.set(targetEpoch, undefined);
	}

	private _getCheckpoint(checkpointId: string): ICheckpoint | undefined {
		return this._checkpoints.get().find(c => c.checkpointId === checkpointId);
	}

	public incrementEpoch() {
		return this._epochCounter++;
	}

	public recordFileOperation(operation: FileOperation): void {
		const currentEpoch = this._currentEpoch.get();
		const currentCheckpoints = this._checkpoints.get();

		const operations = this._operations.get();
		const insertAt = operations.findLastIndex(op => op.epoch <= currentEpoch);
		operations[insertAt + 1] = operation;
		operations.length = insertAt + 2; // Truncate any operations beyond this point

		// If we undid some operations and are dropping them out of history, also remove
		// any associated checkpoints.
		const newCheckpoints = currentCheckpoints.filter(c => c.epoch <= currentEpoch || c.epoch >= operation.epoch);
		transaction(tx => {
			if (newCheckpoints.length !== currentCheckpoints.length) {
				this._checkpoints.set(newCheckpoints, tx);
			}
			this._currentEpoch.set(operation.epoch + 1, tx);
			this._operations.set(operations, tx);
		});
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

	public getContentAtStop(requestId: string, contentURI: URI, stopId: string | undefined) {
		let toEpoch: number | undefined;
		if (stopId?.startsWith(STOP_ID_EPOCH_PREFIX)) {
			toEpoch = Number(stopId.slice(STOP_ID_EPOCH_PREFIX.length));
		} else {
			toEpoch = this._checkpoints.get().find(c => c.requestId === requestId && c.undoStopId === stopId)?.epoch;
		}

		// The content URI doesn't preserve the original scheme or authority. Look through
		// to find the operation that touched that path to get its actual URI
		const fileURI = this._operations.get().find(o => o.uri.path === contentURI.path)?.uri;

		if (!toEpoch || !fileURI) {
			return '';
		}


		const baseline = this._findBestBaselineForFile(fileURI, toEpoch, requestId);
		if (!baseline) {
			return '';
		}

		const operations = this._getFileOperationsInRange(fileURI, baseline.epoch, toEpoch);
		const replayed = this._replayOperations(baseline, operations);
		return replayed.exists ? replayed.content : undefined;
	}

	private _getCheckpointBeforeEpoch(epoch: number, reader?: IReader) {
		return findLast(this._checkpoints.read(reader), c => c.epoch <= epoch);
	}

	private _reconstructFileState(uri: URI, targetEpoch: number): IReconstructedFileState {
		const targetCheckpoint = this._getCheckpointBeforeEpoch(targetEpoch);
		if (!targetCheckpoint) {
			throw new Error(`Checkpoint for epoch ${targetEpoch} not found`);
		}

		// Find the most appropriate baseline for this file
		const baseline = this._findBestBaselineForFile(uri, targetEpoch, targetCheckpoint.requestId || '');
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

	private async _reconstructAllFileContents(targetEpoch: number): Promise<void> {
		const currentEpoch = this._currentEpoch.get();
		const isMovingForward = targetEpoch > currentEpoch;

		// Get operations between current and target epochs
		const relevantOperations = this._operations.get().filter(op => {
			return op.epoch > Math.min(currentEpoch, targetEpoch) &&
				op.epoch <= Math.max(currentEpoch, targetEpoch);
		}).sort((a, b) => isMovingForward ? a.epoch - b.epoch : b.epoch - a.epoch);

		const filesToReconstruct = new ResourceSet();
		for (const operation of relevantOperations) {
			switch (operation.type) {
				case FileOperationType.Create:
					if (isMovingForward) {
						filesToReconstruct.add(operation.uri);
					} else {
						filesToReconstruct.delete(operation.uri);
					}
					break;

				case FileOperationType.Delete:
					if (isMovingForward) {
						filesToReconstruct.delete(operation.uri);
					} else {
						filesToReconstruct.add(operation.uri);
					}
					break;

				case FileOperationType.Rename: {
					const renameOp = operation as IFileRenameOperation;
					if (isMovingForward) {
						filesToReconstruct.delete(renameOp.oldUri);
						filesToReconstruct.add(renameOp.newUri);
					} else {
						filesToReconstruct.delete(renameOp.newUri);
						filesToReconstruct.add(renameOp.oldUri);
					}
					break;
				}
				case FileOperationType.TextEdit:
				case FileOperationType.NotebookEdit:
					filesToReconstruct.add(operation.uri);
					break;
			}
		}

		// Reconstruct content for each file that needs it
		for (const uri of filesToReconstruct) {
			const reconstructedState = this._reconstructFileState(uri, targetEpoch);
			if (reconstructedState.exists) {
				this._delegate.setContents(reconstructedState.uri, reconstructedState.content, reconstructedState.telemetryInfo);
			}
		}
	}


	private _getBaselineKey(uri: URI, requestId: string): string {
		return `${uri.toString()}::${requestId}`;
	}

	private _findBestBaselineForFile(uri: URI, epoch: number, requestId: string): IFileBaseline | undefined {
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
				const createOp = operation as IFileCreateOperation;
				return {
					uri: operation.uri,
					requestId: operation.requestId,
					content: createOp.initialContent,
					epoch: operation.epoch,
					telemetryInfo: this._getFileBaseline(uri, currentRequestId)?.telemetryInfo!,
				};
			}

			// If the file was renamed to this URI, use its old contents as the baseline
			if (operation.type === FileOperationType.Rename && isEqual(operation.newUri, uri)) {
				const prev = this._findBestBaselineForFile(operation.oldUri, operation.epoch, operation.requestId);
				if (!prev) {
					return undefined;
				}


				const operations = this._getFileOperationsInRange(operation.oldUri, prev.epoch, operation.epoch);
				const replayed = this._replayOperations(prev, operations);
				return {
					uri: uri,
					epoch: operation.epoch,
					content: replayed.exists ? replayed.content : '',
					requestId: operation.requestId,
					telemetryInfo: prev.telemetryInfo,
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
		return this._operations.get().filter(op =>
			isEqual(op.uri, uri) &&
			op.epoch >= fromEpoch &&
			op.epoch <= toEpoch
		).sort((a, b) => a.epoch - b.epoch);
	}

	private _replayOperations(baseline: IFileBaseline, operations: readonly FileOperation[]): IReconstructedFileState {
		let currentState: IReconstructedFileState = {
			exists: true,
			content: baseline.content,
			uri: baseline.uri,
			telemetryInfo: baseline.telemetryInfo
		};

		for (const operation of operations) {
			currentState = this._applyOperationToState(currentState, operation, baseline.telemetryInfo);
		}

		return currentState;
	}

	private _applyOperationToState(state: IReconstructedFileState, operation: FileOperation, telemetryInfo: IModifiedEntryTelemetryInfo): IReconstructedFileState {
		switch (operation.type) {
			case FileOperationType.Create:
				return {
					exists: true,
					content: operation.initialContent,
					uri: operation.uri,
					telemetryInfo,
				};

			case FileOperationType.Delete:
				return {
					exists: false,
					uri: operation.uri
				};

			case FileOperationType.Rename:
				return {
					...state,
					uri: operation.newUri
				};

			case FileOperationType.TextEdit:
				if (!state.exists || !state.content) {
					throw new Error('Cannot apply text edits to non-existent file');
				}

				// Apply text edits using a temporary text model
				return {
					...state,
					content: this._applyTextEditsToContent(state.content, operation.edits)
				};

			case FileOperationType.NotebookEdit:
				// For notebook edits, we'll need to implement proper notebook cell edit application
				// For now, return the current state unchanged
				// TODO: Implement proper notebook edit application using notebook models
				if (!state.exists || !state.content) {
					throw new Error('Cannot apply notebook edits to non-existent file');
				}
				return state;

			default:
				throw new Error(`Unknown operation type: ${(operation as any).type}`);
		}
	}

	private async _applyFileSystemOperations(fromEpoch: number, toEpoch: number): Promise<void> {
		const isMovingForward = toEpoch > fromEpoch;
		const operations = this._operations.get().filter(op => {
			if (isMovingForward) {
				return op.epoch > fromEpoch && op.epoch <= toEpoch;
			} else {
				return op.epoch > toEpoch && op.epoch <= fromEpoch;
			}
		}).sort((a, b) => isMovingForward ? a.epoch - b.epoch : b.epoch - a.epoch);

		// Apply file system operations in the correct direction
		for (const operation of operations) {
			await this._applyFileSystemOperation(operation, isMovingForward);
		}
	}

	private async _applyFileSystemOperation(operation: FileOperation, isMovingForward: boolean): Promise<void> {
		switch (operation.type) {
			case FileOperationType.Create:
				if (isMovingForward) {
					// Moving forward: create the file
					await this._createFile(operation.uri, (operation as IFileCreateOperation).initialContent);
				} else {
					// Moving backward: delete the file
					await this._deleteFile(operation.uri);
				}
				break;

			case FileOperationType.Delete:
				if (isMovingForward) {
					// Moving forward: delete the file
					await this._deleteFile(operation.uri);
				} else {
					// Moving backward: recreate the file with its final content
					const deleteOp = operation as IFileDeleteOperation;
					await this._createFile(operation.uri, deleteOp.finalContent);
				}
				break;

			case FileOperationType.Rename:
				if (isMovingForward) {
					// Moving forward: rename from old to new
					await this._renameFile(operation.oldUri, operation.newUri);
				} else {
					// Moving backward: rename from new to old
					await this._renameFile(operation.newUri, operation.oldUri);
				}
				break;

			// Text and notebook edits don't affect file system structure
			case FileOperationType.TextEdit:
			case FileOperationType.NotebookEdit:
				break;
		}
	}

	// File system operation implementations - these would integrate with VS Code's file system
	private async _createFile(uri: URI, content: string): Promise<void> {
		await this._bulkEditService.apply({
			edits: [{
				newResource: uri,
				options: {
					overwrite: true,
					contents: content ? Promise.resolve(VSBuffer.fromString(content)) : undefined,
				},
			}],
		});
	}

	private async _deleteFile(uri: URI): Promise<void> {
		await this._bulkEditService.apply({ edits: [{ oldResource: uri }] });
	}

	private async _renameFile(fromUri: URI, toUri: URI): Promise<void> {
		await this._bulkEditService.apply({ edits: [{ oldResource: fromUri, newResource: toUri }] });
	}

	private _applyTextEditsToContent(content: string, edits: readonly TextEdit[]): string {
		// Use the example pattern provided by the user
		const makeModel = (uri: URI, contents: string) => this._instantiationService.createInstance(TextModel, contents, '', this._modelService.getCreationOptions('', uri, true), uri);

		// Create a temporary URI for the model
		const tempUri = URI.from({ scheme: 'temp', path: `/temp-${Date.now()}.txt` });
		const model = makeModel(tempUri, content);

		try {
			// Sort edits by position (end to start) to avoid position shifts
			const sortedEdits = [...edits].sort((a, b) => {
				const aStart = a.range.startLineNumber * 1000000 + a.range.startColumn;
				const bStart = b.range.startLineNumber * 1000000 + b.range.startColumn;
				return bStart - aStart; // reverse order
			});

			// Apply edits
			model.applyEdits(sortedEdits.map(edit => ({
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
		const epochs = derivedOpts<{ start: ICheckpoint | undefined; end: ICheckpoint | undefined }>({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, reader => {
			const checkpoints = this._checkpoints.read(reader);
			const startIndex = checkpoints.findIndex(c => c.requestId === requestId && c.undoStopId === stopId);
			return { start: checkpoints[startIndex], end: checkpoints[startIndex + 1] };
		});

		return this._getEntryDiffBetweenEpochs(uri, epochs);
	}

	public getEntryDiffBetweenRequests(uri: URI, startRequestId: string, stopRequestId: string): IObservable<IEditSessionEntryDiff | undefined> {
		const epochs = derivedOpts<{ start: ICheckpoint | undefined; end: ICheckpoint | undefined }>({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, reader => {
			const checkpoints = this._checkpoints.read(reader);
			const startIndex = checkpoints.findIndex(c => c.requestId === startRequestId);
			const start = startIndex === -1 ? checkpoints[0] : checkpoints[startIndex];
			const end = checkpoints.find(c => c.requestId === stopRequestId) || checkpoints.find(c => c.requestId !== startRequestId, startIndex) || checkpoints[checkpoints.length - 1];
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

				return refs;
			});

			return new ObservablePromise(promise);
		});

		const resolvedModels = derived(reader => {
			const refs2 = modelRefsPromise.read(reader)?.promiseResult.read(reader);
			return refs2?.data?.map(r => ({
				model: r.object.textEditorModel,
				onChange: observableSignalFromEvent(this, r.object.textEditorModel.onDidChangeContent.bind(r.object.textEditorModel)),
			}));
		});

		const diff = derived((reader): ObservablePromise<IEditSessionEntryDiff> | undefined => {
			const models = resolvedModels.read(reader);
			if (!models) {
				return;
			}

			models.forEach(m => m.onChange.read(reader)); // re-read when contents change

			const promise = this._computeDiff(models[0].model.uri, models[1].model.uri);
			return new ObservablePromise(promise);
		});

		return derived(reader => {
			return diff.read(reader)?.promiseResult.read(reader)?.data || undefined;
		});
	}

	private _computeDiff(originalUri: URI, modifiedUri: URI): Promise<IEditSessionEntryDiff> {
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
