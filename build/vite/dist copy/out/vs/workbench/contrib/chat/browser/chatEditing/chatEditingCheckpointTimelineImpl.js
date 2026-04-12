/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { findFirst, findLast, findLastIdx } from '../../../../../base/common/arraysFind.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mapsStrictEqualIgnoreOrder, ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { constObservable, derived, derivedOpts, ObservablePromise, observableSignalFromEvent, observableValue, observableValueOpts, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { isDefined } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ValidAnnotatedEditOperation } from '../../../../../editor/common/model.js';
import { createTextBuffer } from '../../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { emptySessionEntryDiff } from '../../common/editing/chatEditingService.js';
import { FileOperationType } from './chatEditingOperations.js';
import { ChatEditingSnapshotTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { createSnapshot as createNotebookSnapshot, restoreSnapshot as restoreNotebookSnapshot } from './notebook/chatEditingModifiedNotebookSnapshot.js';
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
let ChatEditingCheckpointTimelineImpl = class ChatEditingCheckpointTimelineImpl {
    constructor(chatSessionResource, _delegate, _notebookEditorModelResolverService, _notebookService, _textModelService, _editorWorkerService, _configurationService) {
        this.chatSessionResource = chatSessionResource;
        this._delegate = _delegate;
        this._notebookEditorModelResolverService = _notebookEditorModelResolverService;
        this._notebookService = _notebookService;
        this._textModelService = _textModelService;
        this._editorWorkerService = _editorWorkerService;
        this._configurationService = _configurationService;
        this._epochCounter = 0;
        this._checkpoints = observableValue(this, []);
        this._currentEpoch = observableValue(this, 0);
        this._operations = observableValueOpts({ equalsFn: () => false }, []); // mutable
        this._fileBaselines = new Map(); // key: `${uri}::${requestId}`
        this._refCountedDiffs = new Map();
        this._finalizedDiffCache = new Map();
        /** Gets the checkpoint, if any, we can 'undo' to. */
        this._willUndoToCheckpoint = derived(reader => {
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
            if (!operations.some(op => op.epoch > startOfRequest.epoch && op.epoch < previousCheckpoint.epoch)) {
                return startOfRequest;
            }
            return previousCheckpoint.epoch > startOfRequest.epoch ? previousCheckpoint : startOfRequest;
        });
        this.canUndo = this._willUndoToCheckpoint.map(cp => !!cp);
        /**
         * Gets the epoch we'll redo this. Unlike undo this doesn't only use checkpoints
         * because we could potentially redo to a 'tip' operation that's not checkpointed yet.
         */
        this._willRedoToEpoch = derived(reader => {
            const currentEpoch = this._currentEpoch.read(reader);
            const operations = this._operations.read(reader);
            const checkpoints = this._checkpoints.read(reader);
            const maxEncounteredEpoch = Math.max(operations.at(-1)?.epoch || 0, checkpoints.at(-1)?.epoch || 0);
            if (currentEpoch > maxEncounteredEpoch) {
                return undefined;
            }
            // Find the next edit operation that would be applied...
            const nextOperation = operations.find(op => op.epoch >= currentEpoch);
            // When there are no more operations, advance one request at a time
            // by finding the next request-start checkpoint boundary.
            if (!nextOperation) {
                const nextRequestStart = checkpoints.find(cp => cp.epoch >= currentEpoch && cp.undoStopId === undefined);
                if (!nextRequestStart) {
                    return maxEncounteredEpoch + 1;
                }
                const requestAfter = checkpoints.find(cp => cp.epoch > nextRequestStart.epoch && cp.undoStopId === undefined);
                return requestAfter ? requestAfter.epoch : (maxEncounteredEpoch + 1);
            }
            const nextCheckpoint = checkpoints.find(op => op.epoch > nextOperation.epoch);
            // And figure out where we're going if we're navigating across request
            // 1. If there is no next request or if the next target checkpoint is in
            //    the next request, navigate there.
            // 2. Otherwise, navigate to the end of the next request.
            const currentCheckpoint = findLast(checkpoints, cp => cp.epoch < currentEpoch);
            if (currentCheckpoint && nextOperation && currentCheckpoint.requestId !== nextOperation.requestId) {
                const startOfNextRequestIdx = findLastIdx(checkpoints, (cp, i) => cp.undoStopId === undefined && (checkpoints[i - 1]?.requestId === currentCheckpoint.requestId));
                const startOfNextRequest = startOfNextRequestIdx === -1 ? undefined : checkpoints[startOfNextRequestIdx];
                if (startOfNextRequest && nextOperation.requestId !== startOfNextRequest.requestId) {
                    const requestAfterTheNext = findFirst(checkpoints, op => op.undoStopId === undefined, startOfNextRequestIdx + 1);
                    if (requestAfterTheNext) {
                        return requestAfterTheNext.epoch;
                    }
                }
            }
            return Math.min(nextCheckpoint?.epoch || Infinity, (maxEncounteredEpoch + 1));
        });
        this.canRedo = this._willRedoToEpoch.map(e => !!e);
        this.requestDisablement = derivedOpts({ equalsFn: (a, b) => arraysEqual(a, b, objectsEqual) }, reader => {
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
            const disablement = new Map();
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
            return [...disablement].map(([requestId, afterUndoStop]) => ({ requestId, afterUndoStop }));
        });
        this.createCheckpoint(undefined, undefined, 'Initial State', 'Starting point before any edits');
    }
    createCheckpoint(requestId, undoStopId, label, description) {
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
    async undoToLastCheckpoint() {
        const checkpoint = this._willUndoToCheckpoint.get();
        if (checkpoint) {
            await this.navigateToCheckpoint(checkpoint.checkpointId);
        }
    }
    async redoToNextCheckpoint() {
        const targetEpoch = this._willRedoToEpoch.get();
        if (targetEpoch) {
            await this._navigateToEpoch(targetEpoch);
        }
    }
    navigateToCheckpoint(checkpointId) {
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
        }
        else {
            return this._navigateToEpoch(targetCheckpoint.epoch + 1);
        }
    }
    getContentURIAtStop(requestId, fileURI, stopId) {
        return ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this.chatSessionResource, requestId, stopId, fileURI.path);
    }
    async _navigateToEpoch(restoreToEpoch, navigateToEpoch = restoreToEpoch) {
        const currentEpoch = this._currentEpoch.get();
        if (currentEpoch !== restoreToEpoch) {
            const urisToRestore = await this._applyFileSystemOperations(currentEpoch, restoreToEpoch);
            // Reconstruct content for files affected by operations in the range
            await this._reconstructAllFileContents(restoreToEpoch, urisToRestore);
        }
        // Update current epoch
        this._currentEpoch.set(navigateToEpoch, undefined);
    }
    _getCheckpoint(checkpointId) {
        return this._checkpoints.get().find(c => c.checkpointId === checkpointId);
    }
    incrementEpoch() {
        return this._epochCounter++;
    }
    recordFileOperation(operation) {
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
    _getVisibleOperationsAndCheckpoints() {
        const currentEpoch = this._currentEpoch.get();
        const checkpoints = this._checkpoints.get();
        const operations = this._operations.get();
        return {
            currentEpoch,
            checkpoints: checkpoints.filter(c => c.epoch < currentEpoch),
            operations: operations.filter(op => op.epoch < currentEpoch)
        };
    }
    recordFileBaseline(baseline) {
        const key = this._getBaselineKey(baseline.uri, baseline.requestId);
        this._fileBaselines.set(key, baseline);
    }
    _getFileBaseline(uri, requestId) {
        const key = this._getBaselineKey(uri, requestId);
        return this._fileBaselines.get(key);
    }
    hasFileBaseline(uri, requestId) {
        const key = this._getBaselineKey(uri, requestId);
        return this._fileBaselines.has(key) || this._operations.get().some(op => op.type === FileOperationType.Create && op.requestId === requestId && isEqual(uri, op.uri));
    }
    async getContentAtStop(requestId, contentURI, stopId) {
        let toEpoch;
        if (stopId?.startsWith(STOP_ID_EPOCH_PREFIX)) {
            toEpoch = Number(stopId.slice(STOP_ID_EPOCH_PREFIX.length));
        }
        else {
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
    _getTimelineCanonicalUriForPath(contentURI) {
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
    onDidChangeContentsAtStop(requestId, contentURI, stopId, callback) {
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
                if (this._operations.get().at(-1)?.epoch >= target) {
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
    _getCheckpointBeforeEpoch(epoch, reader) {
        return findLast(this._checkpoints.read(reader), c => c.epoch <= epoch);
    }
    async _reconstructFileState(uri, targetEpoch) {
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
    getStateForPersistence() {
        return {
            checkpoints: this._checkpoints.get(),
            currentEpoch: this._currentEpoch.get(),
            fileBaselines: [...this._fileBaselines],
            operations: this._operations.get(),
            epochCounter: this._epochCounter,
        };
    }
    restoreFromState(state, tx) {
        this._checkpoints.set(state.checkpoints, tx);
        this._currentEpoch.set(state.currentEpoch, tx);
        this._operations.set(state.operations.slice(), tx);
        this._epochCounter = state.epochCounter;
        this._fileBaselines.clear();
        for (const [key, baseline] of state.fileBaselines) {
            this._fileBaselines.set(key, baseline);
        }
    }
    getCheckpointIdForRequest(requestId, undoStopId) {
        const checkpoints = this._checkpoints.get();
        return checkpoints.find(c => c.requestId === requestId && c.undoStopId === undoStopId)?.checkpointId;
    }
    async _reconstructAllFileContents(targetEpoch, filesToReconstruct) {
        await Promise.all(Array.from(filesToReconstruct).map(async (uri) => {
            const reconstructedState = await this._reconstructFileState(uri, targetEpoch);
            if (reconstructedState.exists) {
                await this._delegate.setContents(reconstructedState.uri, reconstructedState.content, reconstructedState.telemetryInfo);
            }
        }));
    }
    _getBaselineKey(uri, requestId) {
        return `${uri.toString()}::${requestId}`;
    }
    async _findBestBaselineForFile(uri, epoch, requestId) {
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
    _getFileOperationsInRange(uri, fromEpoch, toEpoch) {
        return this._operations.get().filter(op => {
            const cellUri = CellUri.parse(op.uri);
            return op.epoch >= fromEpoch &&
                op.epoch < toEpoch &&
                (isEqual(op.uri, uri) || (cellUri && isEqual(cellUri.notebook, uri)));
        }).sort((a, b) => a.epoch - b.epoch);
    }
    async _replayOperations(baseline, operations) {
        let currentState = {
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
    async _applyOperationToState(state, operation, telemetryInfo) {
        switch (operation.type) {
            case FileOperationType.Create: {
                if (state.exists && state.notebook) {
                    state.notebook.dispose();
                }
                let notebook;
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
                    state.notebook.applyEdits([{
                            editType: 1 /* CellEditType.Replace */,
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
    async _applyFileSystemOperations(fromEpoch, toEpoch) {
        const isMovingForward = toEpoch > fromEpoch;
        const operations = this._operations.get().filter(op => {
            if (isMovingForward) {
                return op.epoch >= fromEpoch && op.epoch < toEpoch;
            }
            else {
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
    async _applyFileSystemOperation(operation, isMovingForward, urisToRestore) {
        switch (operation.type) {
            case FileOperationType.Create:
                if (isMovingForward) {
                    await this._delegate.createFile(operation.uri, operation.initialContent);
                    urisToRestore.add(operation.uri);
                }
                else {
                    await this._delegate.deleteFile(operation.uri);
                    urisToRestore.delete(operation.uri);
                }
                break;
            case FileOperationType.Delete:
                if (isMovingForward) {
                    await this._delegate.deleteFile(operation.uri);
                    urisToRestore.delete(operation.uri);
                }
                else {
                    await this._delegate.createFile(operation.uri, operation.finalContent);
                    urisToRestore.add(operation.uri);
                }
                break;
            case FileOperationType.Rename:
                if (isMovingForward) {
                    await this._delegate.renameFile(operation.oldUri, operation.newUri);
                    urisToRestore.delete(operation.oldUri);
                    urisToRestore.add(operation.newUri);
                }
                else {
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
    _applyTextEditsToContent(content, edits) {
        const { textBuffer, disposable } = createTextBuffer(content, 1 /* DefaultEndOfLine.LF */);
        try {
            textBuffer.applyEdits(edits.map(edit => new ValidAnnotatedEditOperation(null, Range.lift(edit.range), edit.text, false, false, false)), false, false);
            const fullRange = textBuffer.getRangeAt(0, textBuffer.getLength());
            return textBuffer.getValueInRange(fullRange, 0 /* EndOfLinePreference.TextDefined */);
        }
        finally {
            disposable.dispose();
        }
    }
    getEntryDiffBetweenStops(uri, requestId, stopId) {
        const epochs = derivedOpts({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, reader => {
            const checkpoints = this._checkpoints.read(reader);
            const startIndex = checkpoints.findIndex(c => c.requestId === requestId && c.undoStopId === stopId);
            return { start: checkpoints[startIndex], end: checkpoints[startIndex + 1] };
        });
        return this._getEntryDiffBetweenEpochs(uri, `s\0${requestId}\0${stopId}`, epochs);
    }
    /** Gets the epoch bounds of the request. If stopRequestId is undefined, gets ONLY the single request's bounds */
    _getRequestEpochBounds(startRequestId, stopRequestId) {
        return derivedOpts({ equalsFn: (a, b) => a.start === b.start && a.end === b.end }, reader => {
            const checkpoints = this._checkpoints.read(reader);
            const startIndex = checkpoints.findIndex(c => c.requestId === startRequestId);
            const start = startIndex === -1 ? checkpoints[0] : checkpoints[startIndex];
            let end;
            if (stopRequestId === undefined) {
                end = findFirst(checkpoints, c => c.requestId !== startRequestId, startIndex + 1);
            }
            else {
                end = checkpoints.find(c => c.requestId === stopRequestId)
                    || findFirst(checkpoints, c => c.requestId !== startRequestId, startIndex + 1)
                    || checkpoints[checkpoints.length - 1];
            }
            return { start, end };
        });
    }
    getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId) {
        return this._getEntryDiffBetweenEpochs(uri, `r\0${startRequestId}\0${stopRequestId}`, this._getRequestEpochBounds(startRequestId, stopRequestId));
    }
    _getEntryDiffBetweenEpochs(uri, cacheKey, epochs) {
        const key = `${uri.toString()}\0${cacheKey}`;
        const cached = this._finalizedDiffCache.get(key);
        if (cached) {
            return constObservable(cached);
        }
        let obs = this._refCountedDiffs.get(key);
        if (!obs) {
            obs = this._getEntryDiffBetweenEpochsInner(uri, key, epochs, () => this._refCountedDiffs.delete(key));
            this._refCountedDiffs.set(key, obs);
        }
        return obs;
    }
    _getEntryDiffBetweenEpochsInner(uri, cacheKey, epochs, onLastObserverRemoved) {
        const modelRefsPromise = derived(this, (reader) => {
            const { start, end } = epochs.read(reader);
            if (!start) {
                return undefined;
            }
            const store = reader.store.add(new DisposableStore());
            const originalURI = this.getContentURIAtStop(start.requestId || START_REQUEST_EPOCH, uri, STOP_ID_EPOCH_PREFIX + start.epoch);
            const modifiedURI = this.getContentURIAtStop(end?.requestId || start.requestId || START_REQUEST_EPOCH, uri, STOP_ID_EPOCH_PREFIX + (end?.epoch || Number.MAX_SAFE_INTEGER));
            const promise = Promise.all([
                this._textModelService.createModelReference(originalURI),
                this._textModelService.createModelReference(modifiedURI),
            ]).then(refs => {
                if (store.isDisposed) {
                    refs.forEach(r => r.dispose());
                }
                else {
                    refs.forEach(r => store.add(r));
                }
                return {
                    refs: refs.map(r => ({
                        model: r.object.textEditorModel,
                        onChange: observableSignalFromEvent(this, r.object.textEditorModel.onDidChangeContent.bind(r.object.textEditorModel)),
                    })),
                    isFinal: !!end,
                };
            }).catch((error) => {
                return { refs: [], isFinal: true, error };
            });
            return {
                originalURI,
                modifiedURI,
                promise: new ObservablePromise(promise),
            };
        });
        const diff = derived(reader => {
            const modelsData = modelRefsPromise.read(reader);
            if (!modelsData) {
                return;
            }
            const { originalURI, modifiedURI, promise } = modelsData;
            const promiseData = promise?.promiseResult.read(reader);
            if (!promiseData?.data) {
                return { originalURI, modifiedURI, promise: undefined };
            }
            const { refs, isFinal, error } = promiseData.data;
            if (error) {
                return { originalURI, modifiedURI, promise: new ObservablePromise(Promise.resolve(emptySessionEntryDiff(originalURI, modifiedURI))) };
            }
            refs.forEach(m => m.onChange.read(reader)); // re-read when contents change
            return { originalURI, modifiedURI, promise: new ObservablePromise(this._computeDiff(originalURI, modifiedURI, !!isFinal)) };
        });
        return derivedOpts({ onLastObserverRemoved }, reader => {
            const result = diff.read(reader);
            if (!result) {
                return undefined;
            }
            const promised = result.promise?.promiseResult.read(reader);
            if (promised?.data) {
                if (promised.data.isFinal) {
                    this._finalizedDiffCache.set(cacheKey, promised.data);
                }
                return promised.data;
            }
            if (promised?.error) {
                return emptySessionEntryDiff(result.originalURI, result.modifiedURI);
            }
            return { ...emptySessionEntryDiff(result.originalURI, result.modifiedURI), isBusy: true };
        });
    }
    _computeDiff(originalUri, modifiedUri, isFinal) {
        return this._editorWorkerService.computeDiff(originalUri, modifiedUri, { ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3000 }, 'advanced').then((diff) => {
            const entryDiff = {
                originalURI: originalUri,
                modifiedURI: modifiedUri,
                identical: !!diff?.identical,
                isFinal,
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
        });
    }
    hasEditsInRequest(requestId, reader) {
        for (const value of this._fileBaselines.values()) {
            if (value.requestId === requestId) {
                return true;
            }
        }
        for (const operation of this._operations.read(reader)) {
            if (operation.requestId === requestId) {
                return true;
            }
        }
        return false;
    }
    getDiffsForFilesInRequest(requestId) {
        const boundsObservable = this._getRequestEpochBounds(requestId);
        const startEpochs = derivedOpts({ equalsFn: mapsStrictEqualIgnoreOrder }, reader => {
            const uris = new ResourceMap();
            for (const value of this._fileBaselines.values()) {
                if (value.requestId === requestId) {
                    uris.set(value.uri, value.epoch);
                }
            }
            const bounds = boundsObservable.read(reader);
            for (const operation of this._operations.read(reader)) {
                if (operation.epoch < bounds.start.epoch) {
                    continue;
                }
                if (bounds.end && operation.epoch >= bounds.end.epoch) {
                    break;
                }
                if (operation.type === FileOperationType.Create) {
                    uris.set(operation.uri, 0);
                }
            }
            return uris;
        });
        return this._getDiffsForFilesAtEpochs(startEpochs, boundsObservable.map(b => b.end));
    }
    _getDiffsForFilesAtEpochs(startEpochs, endCheckpointObs) {
        // URIs are never removed from the set and we never adjust baselines backwards
        // (history is immutable) so we can easily cache to avoid regenerating diffs when new files are added
        const prevDiffs = new ResourceMap();
        let prevEndCheckpoint = undefined;
        const perFileDiffs = derived(this, reader => {
            const checkpoints = this._checkpoints.read(reader);
            const firstCheckpoint = checkpoints[0];
            if (!firstCheckpoint) {
                return [];
            }
            const endCheckpoint = endCheckpointObs.read(reader);
            if (endCheckpoint !== prevEndCheckpoint) {
                prevDiffs.clear();
                prevEndCheckpoint = endCheckpoint;
            }
            const uris = startEpochs.read(reader);
            const diffs = [];
            for (const [uri, epoch] of uris) {
                const obs = prevDiffs.get(uri) ?? this._getEntryDiffBetweenEpochs(uri, `e\0${epoch}\0${endCheckpoint?.epoch}`, constObservable({ start: checkpoints.findLast(cp => cp.epoch <= epoch) || firstCheckpoint, end: endCheckpoint }));
                prevDiffs.set(uri, obs);
                diffs.push(obs);
            }
            return diffs;
        });
        return perFileDiffs.map((diffs, reader) => {
            return diffs.flatMap(d => d.read(reader)).filter(isDefined);
        });
    }
    getDiffsForFilesInSession() {
        const startEpochs = derivedOpts({ equalsFn: mapsStrictEqualIgnoreOrder }, reader => {
            const uris = new ResourceMap();
            for (const baseline of this._fileBaselines.values()) {
                uris.set(baseline.uri, Math.min(baseline.epoch, uris.get(baseline.uri) ?? Number.MAX_SAFE_INTEGER));
            }
            for (const operation of this._operations.read(reader)) {
                if (operation.type === FileOperationType.Create) {
                    uris.set(operation.uri, 0);
                }
            }
            return uris;
        });
        return this._getDiffsForFilesAtEpochs(startEpochs, constObservable(undefined));
    }
    getDiffForSession() {
        const fileDiffs = this.getDiffsForFilesInSession();
        return derived(reader => {
            const diffs = fileDiffs.read(reader);
            let added = 0;
            let removed = 0;
            for (const diff of diffs) {
                added += diff.added;
                removed += diff.removed;
            }
            return { added, removed };
        });
    }
};
ChatEditingCheckpointTimelineImpl = __decorate([
    __param(2, INotebookEditorModelResolverService),
    __param(3, INotebookService),
    __param(4, ITextModelService),
    __param(5, IEditorWorkerService),
    __param(6, IConfigurationService)
], ChatEditingCheckpointTimelineImpl);
export { ChatEditingCheckpointTimelineImpl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmVJbXBsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxJQUFJLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxNQUFNLElBQUksWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFzQyxpQkFBaUIsRUFBRSx5QkFBeUIsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdE8sT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxTQUFTLEVBQVcsTUFBTSxxQ0FBcUMsQ0FBQztBQUV6RSxPQUFPLEVBQUUsWUFB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