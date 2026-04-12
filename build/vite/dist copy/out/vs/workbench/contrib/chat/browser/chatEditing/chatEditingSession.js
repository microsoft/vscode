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
var ChatEditingSession_1;
import { DeferredPromise, Sequencer, SequencerByKey, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { derived, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { EditorActivation } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { MultiDiffEditorInput } from '../../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { CellUri } from '../../../notebook/common/notebookCommon.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { chatEditingSessionIsReady, getMultiDiffSourceUri } from '../../common/editing/chatEditingService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatEditingCheckpointTimelineImpl } from './chatEditingCheckpointTimelineImpl.js';
import { ChatEditingDeletedFileEntry } from './chatEditingDeletedFileEntry.js';
import { ChatEditingModifiedDocumentEntry } from './chatEditingModifiedDocumentEntry.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingModifiedNotebookEntry } from './chatEditingModifiedNotebookEntry.js';
import { FileOperationType, getKeyForChatSessionResource } from './chatEditingOperations.js';
import { IChatEditingExplanationModelManager } from './chatEditingExplanationModelManager.js';
import { ChatEditingSessionStorage } from './chatEditingSessionStorage.js';
import { ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
var NotExistBehavior;
(function (NotExistBehavior) {
    NotExistBehavior[NotExistBehavior["Create"] = 0] = "Create";
    NotExistBehavior[NotExistBehavior["Abort"] = 1] = "Abort";
})(NotExistBehavior || (NotExistBehavior = {}));
class ThrottledSequencer extends Sequencer {
    constructor(_minDuration, _maxOverallDelay) {
        super();
        this._minDuration = _minDuration;
        this._maxOverallDelay = _maxOverallDelay;
        this._size = 0;
    }
    queue(promiseTask) {
        this._size += 1;
        const noDelay = this._size * this._minDuration > this._maxOverallDelay;
        return super.queue(async () => {
            try {
                const p1 = promiseTask();
                const p2 = noDelay
                    ? Promise.resolve(undefined)
                    : timeout(this._minDuration, CancellationToken.None);
                const [result] = await Promise.all([p1, p2]);
                return result;
            }
            finally {
                this._size -= 1;
            }
        });
    }
}
function createOpeningEditCodeBlock(uri, isNotebook, undoStopId) {
    return [
        {
            kind: 'markdownContent',
            content: new MarkdownString('\n````\n')
        },
        {
            kind: 'codeblockUri',
            uri,
            isEdit: true,
            undoStopId
        },
        isNotebook
            ? {
                kind: 'notebookEdit',
                uri,
                edits: [],
                done: false,
                isExternalEdit: true
            }
            : {
                kind: 'textEdit',
                uri,
                edits: [],
                done: false,
                isExternalEdit: true
            },
    ];
}
let ChatEditingSession = ChatEditingSession_1 = class ChatEditingSession extends Disposable {
    get state() {
        return this._state;
    }
    get requestDisablement() {
        return this._timeline.requestDisablement;
    }
    get onDidDispose() {
        this._assertNotDisposed();
        return this._onDidDispose.event;
    }
    constructor(chatSessionResource, isGlobalEditingSession, _lookupExternalEntry, transferFrom, _instantiationService, _modelService, _languageService, _textModelService, _bulkEditService, _editorGroupsService, _editorService, _notebookService, _accessibilitySignalService, _logService, configurationService, _fileService, _explanationModelManager, _telemetryService) {
        super();
        this.chatSessionResource = chatSessionResource;
        this.isGlobalEditingSession = isGlobalEditingSession;
        this._lookupExternalEntry = _lookupExternalEntry;
        this._instantiationService = _instantiationService;
        this._modelService = _modelService;
        this._languageService = _languageService;
        this._textModelService = _textModelService;
        this._bulkEditService = _bulkEditService;
        this._editorGroupsService = _editorGroupsService;
        this._editorService = _editorService;
        this._notebookService = _notebookService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._logService = _logService;
        this.configurationService = configurationService;
        this._fileService = _fileService;
        this._explanationModelManager = _explanationModelManager;
        this._telemetryService = _telemetryService;
        this.supportsKeepUndo = false;
        this._state = observableValue(this, 0 /* ChatEditingSessionState.Initial */);
        /**
         * Contains the contents of a file when the AI first began doing edits to it.
         */
        this._initialFileContents = new ResourceMap();
        this._baselineCreationLocks = new SequencerByKey();
        this._streamingEditLocks = new SequencerByKey();
        /**
         * Tracks active external edit operations.
         * Key is operationId, value contains the operation state.
         */
        this._externalEditOperations = new Map();
        this._entriesObs = observableValue(this, []);
        this.entries = derived(reader => {
            const state = this._state.read(reader);
            if (state === 3 /* ChatEditingSessionState.Disposed */ || state === 0 /* ChatEditingSessionState.Initial */) {
                return [];
            }
            else {
                return this._entriesObs.read(reader);
            }
        });
        this._onDidDispose = new Emitter();
        this._timeline = this._instantiationService.createInstance(ChatEditingCheckpointTimelineImpl, chatSessionResource, this._getTimelineDelegate());
        this.canRedo = this._timeline.canRedo.map((hasHistory, reader) => hasHistory && this._state.read(reader) === 2 /* ChatEditingSessionState.Idle */);
        this.canUndo = this._timeline.canUndo.map((hasHistory, reader) => hasHistory && this._state.read(reader) === 2 /* ChatEditingSessionState.Idle */);
        this._init(transferFrom);
    }
    _getTimelineDelegate() {
        return {
            createFile: (uri, content) => {
                return this._bulkEditService.apply({
                    edits: [{
                            newResource: uri,
                            options: {
                                overwrite: true,
                                contents: content ? Promise.resolve(VSBuffer.fromString(content)) : undefined,
                            },
                        }],
                });
            },
            deleteFile: async (uri) => {
                const entries = this._entriesObs.get().filter(e => !isEqual(e.modifiedURI, uri));
                this._entriesObs.set(entries, undefined);
                await this._bulkEditService.apply({ edits: [{ oldResource: uri, options: { ignoreIfNotExists: true } }] });
            },
            renameFile: async (fromUri, toUri) => {
                const entries = this._entriesObs.get();
                const previousEntry = entries.find(e => isEqual(e.modifiedURI, fromUri));
                if (previousEntry) {
                    const newEntry = await this._getOrCreateModifiedFileEntry(toUri, 0 /* NotExistBehavior.Create */, previousEntry.telemetryInfo, this._getCurrentTextOrNotebookSnapshot(previousEntry));
                    previousEntry.dispose();
                    this._entriesObs.set(entries.map(e => e === previousEntry ? newEntry : e), undefined);
                }
            },
            setContents: async (uri, content, telemetryInfo) => {
                const entry = await this._getOrCreateModifiedFileEntry(uri, 0 /* NotExistBehavior.Create */, telemetryInfo);
                // We apply these edits as 'agent edits' which will by default make them get keep
                // /undo indicators. This is good in the case the edits were never initially accepted,
                // but if the file was already in an accepted state we should not make it modified again.
                const state = entry.state.get();
                if (entry instanceof ChatEditingModifiedNotebookEntry) {
                    await entry.restoreModifiedModelFromSnapshot(content);
                }
                else {
                    await entry.acceptAgentEdits(uri, [{ range: new Range(1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), text: content }], true, undefined);
                }
                if (state !== 0 /* ModifiedFileEntryState.Modified */) {
                    await entry.accept();
                }
            }
        };
    }
    async _init(transferFrom) {
        const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
        let restoredSessionState;
        if (transferFrom instanceof ChatEditingSession_1) {
            restoredSessionState = transferFrom._getStoredState(this.chatSessionResource);
        }
        else {
            restoredSessionState = await storage.restoreState().catch(err => {
                this._logService.error(`Error restoring chat editing session state for ${this.chatSessionResource}`, err);
                return undefined;
            });
            if (this._store.isDisposed) {
                return; // disposed while restoring
            }
        }
        if (restoredSessionState) {
            for (const [uri, content] of restoredSessionState.initialFileContents) {
                this._initialFileContents.set(uri, content);
            }
            if (restoredSessionState.timeline) {
                transaction(tx => this._timeline.restoreFromState(restoredSessionState.timeline, tx));
            }
            await this._initEntries(restoredSessionState.recentSnapshot);
        }
        this._state.set(2 /* ChatEditingSessionState.Idle */, undefined);
    }
    _getEntry(uri) {
        uri = CellUri.parse(uri)?.notebook ?? uri;
        return this._entriesObs.get().find(e => isEqual(e.modifiedURI, uri));
    }
    getEntry(uri) {
        return this._getEntry(uri);
    }
    readEntry(uri, reader) {
        uri = CellUri.parse(uri)?.notebook ?? uri;
        return this._entriesObs.read(reader).find(e => isEqual(e.modifiedURI, uri));
    }
    storeState() {
        const storage = this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource);
        const storedState = this._getStoredState();
        this._telemetryService.publicLog2('chatEditing/sessionStore', {
            editSessionId: getKeyForChatSessionResource(this.chatSessionResource),
            ...this._countEntryStates(this._entriesObs.get()),
        });
        return storage.storeState(storedState);
    }
    _getStoredState(sessionResource = this.chatSessionResource) {
        const entries = new ResourceMap();
        for (const entry of this._entriesObs.get()) {
            entries.set(entry.modifiedURI, entry.createSnapshot(sessionResource, undefined, undefined));
        }
        const state = {
            initialFileContents: this._initialFileContents,
            timeline: this._timeline.getStateForPersistence(),
            recentSnapshot: { entries, stopId: undefined },
        };
        return state;
    }
    getEntryDiffBetweenStops(uri, requestId, stopId) {
        return this._timeline.getEntryDiffBetweenStops(uri, requestId, stopId);
    }
    getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId) {
        return this._timeline.getEntryDiffBetweenRequests(uri, startRequestId, stopRequestId);
    }
    getDiffsForFilesInSession() {
        return this._timeline.getDiffsForFilesInSession();
    }
    getDiffForSession() {
        return this._timeline.getDiffForSession();
    }
    getDiffsForFilesInRequest(requestId) {
        return this._timeline.getDiffsForFilesInRequest(requestId);
    }
    hasEditsInRequest(requestId, reader) {
        return this._timeline.hasEditsInRequest(requestId, reader);
    }
    createSnapshot(requestId, undoStop) {
        const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
        this._timeline.createCheckpoint(requestId, undoStop, label);
    }
    async getSnapshotContents(requestId, uri, stopId) {
        const content = await this._timeline.getContentAtStop(requestId, uri, stopId);
        return typeof content === 'string' ? VSBuffer.fromString(content) : content;
    }
    async getSnapshotModel(requestId, undoStop, snapshotUri) {
        await this._baselineCreationLocks.peek(snapshotUri.path);
        const content = await this._timeline.getContentAtStop(requestId, snapshotUri, undoStop);
        if (content === undefined) {
            return null;
        }
        const contentStr = typeof content === 'string' ? content : content.toString();
        const model = this._modelService.createModel(contentStr, this._languageService.createByFilepathOrFirstLine(snapshotUri), snapshotUri, false);
        const store = new DisposableStore();
        store.add(model.onWillDispose(() => store.dispose()));
        store.add(this._timeline.onDidChangeContentsAtStop(requestId, snapshotUri, undoStop, c => model.setValue(c)));
        return model;
    }
    getSnapshotUri(requestId, uri, stopId) {
        return this._timeline.getContentURIAtStop(requestId, uri, stopId);
    }
    async restoreSnapshot(requestId, stopId) {
        const checkpointId = this._timeline.getCheckpointIdForRequest(requestId, stopId);
        if (checkpointId) {
            await this._timeline.navigateToCheckpoint(checkpointId);
        }
    }
    _assertNotDisposed() {
        if (this._state.get() === 3 /* ChatEditingSessionState.Disposed */) {
            throw new BugIndicatingError(`Cannot access a disposed editing session`);
        }
    }
    async accept(...uris) {
        if (await this._operateEntry('accept', uris)) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
        }
    }
    async reject(...uris) {
        if (await this._operateEntry('reject', uris)) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
        }
    }
    async _operateEntry(action, uris) {
        this._assertNotDisposed();
        const applicableEntries = this._entriesObs.get()
            .filter(e => uris.length === 0 || uris.some(u => isEqual(u, e.modifiedURI)))
            .filter(e => !e.isCurrentlyBeingModifiedBy.get())
            .filter(e => e.state.get() === 0 /* ModifiedFileEntryState.Modified */);
        if (applicableEntries.length === 0) {
            return 0;
        }
        // Perform all I/O operations in parallel, each resolving to a state transition callback
        const method = action === 'accept' ? 'acceptDeferred' : 'rejectDeferred';
        const transitionCallbacks = await Promise.all(applicableEntries.map(entry => entry[method]().catch(err => {
            this._logService.error(`Error calling ${method} on entry ${entry.modifiedURI}`, err);
        })));
        // Execute all state transitions atomically in a single transaction
        transaction(tx => {
            transitionCallbacks.forEach(callback => callback?.(tx));
        });
        return applicableEntries.length;
    }
    async show(previousChanges) {
        this._assertNotDisposed();
        if (this._editorPane) {
            if (this._editorPane.isVisible()) {
                return;
            }
            else if (this._editorPane.input) {
                await this._editorService.openEditor(this._editorPane.input, { pinned: true, activation: EditorActivation.ACTIVATE });
                return;
            }
        }
        const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
            multiDiffSource: getMultiDiffSourceUri(this, previousChanges),
            label: localize('multiDiffEditorInput.name', "Suggested Edits")
        }, this._instantiationService);
        this._editorPane = await this._editorService.openEditor(input, { pinned: true, activation: EditorActivation.ACTIVATE });
    }
    async stop(clearState = false) {
        this._stopPromise ??= Promise.allSettled([this._performStop(), this.storeState()]).then(() => { });
        await this._stopPromise;
        if (clearState) {
            await this._instantiationService.createInstance(ChatEditingSessionStorage, this.chatSessionResource).clearState();
        }
    }
    async _performStop() {
        // Close out all open files
        const schemes = [AbstractChatEditingModifiedFileEntry.scheme, ChatEditingTextModelContentProvider.scheme];
        await Promise.allSettled(this._editorGroupsService.groups.flatMap(async (g) => {
            return g.editors.map(async (e) => {
                if ((e instanceof MultiDiffEditorInput && e.initialResources?.some(r => r.originalUri && schemes.indexOf(r.originalUri.scheme) !== -1))
                    || (e instanceof DiffEditorInput && e.original.resource && schemes.indexOf(e.original.resource.scheme) !== -1)) {
                    await g.closeEditor(e);
                }
            });
        }));
    }
    dispose() {
        this._assertNotDisposed();
        this.clearExplanations();
        dispose(this._entriesObs.get());
        super.dispose();
        this._state.set(3 /* ChatEditingSessionState.Disposed */, undefined);
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
    }
    get isDisposed() {
        return this._state.get() === 3 /* ChatEditingSessionState.Disposed */;
    }
    startStreamingEdits(resource, responseModel, inUndoStop) {
        const completePromise = new DeferredPromise();
        const startPromise = new DeferredPromise();
        // Sequence all edits made this this resource in this streaming edits instance,
        // and also sequence the resource overall in the rare (currently invalid?) case
        // that edits are made in parallel to the same resource,
        const sequencer = new ThrottledSequencer(15, 1000);
        sequencer.queue(() => startPromise.p);
        // Lock around creating the baseline so we don't fail to resolve models
        // in the edit pills if they render quickly
        this._baselineCreationLocks.queue(resource.path, () => startPromise.p);
        this._streamingEditLocks.queue(resource.toString(), async () => {
            await chatEditingSessionIsReady(this);
            if (!this.isDisposed) {
                await this._acceptStreamingEditsStart(responseModel, inUndoStop, resource);
            }
            startPromise.complete();
            return completePromise.p;
        });
        let didComplete = false;
        return {
            pushText: (edits, isLastEdits) => {
                sequencer.queue(async () => {
                    if (!this.isDisposed) {
                        await this._acceptEdits(resource, edits, isLastEdits, responseModel);
                    }
                });
            },
            pushNotebookCellText: (cell, edits, isLastEdits) => {
                sequencer.queue(async () => {
                    if (!this.isDisposed) {
                        await this._acceptEdits(cell, edits, isLastEdits, responseModel);
                    }
                });
            },
            pushNotebook: (edits, isLastEdits) => {
                sequencer.queue(async () => {
                    if (!this.isDisposed) {
                        await this._acceptEdits(resource, edits, isLastEdits, responseModel);
                    }
                });
            },
            complete: () => {
                if (didComplete) {
                    return;
                }
                didComplete = true;
                sequencer.queue(async () => {
                    if (!this.isDisposed) {
                        await this._acceptEdits(resource, [], true, responseModel);
                        await this._resolve(responseModel.requestId, inUndoStop, resource);
                        completePromise.complete();
                    }
                });
            },
        };
    }
    startDeletion(resource, responseModel, undoStopId) {
        this._assertNotDisposed();
        // Queue the deletion operation with proper locking
        this._streamingEditLocks.queue(resource.toString(), async () => {
            if (this.isDisposed) {
                return;
            }
            await chatEditingSessionIsReady(this);
            // Check if file exists
            let fileContent;
            try {
                const content = await this._fileService.readFile(resource);
                fileContent = content.value.toString();
            }
            catch (e) {
                // File doesn't exist, nothing to delete
                this._logService.warn(`Cannot delete file ${resource.toString()}: file does not exist`);
                return;
            }
            // Check if there's already an entry for this file
            const existingEntry = this._getEntry(resource);
            if (existingEntry) {
                // If there's already an entry, we need to handle it differently
                // For now, we'll just collapse it and proceed with deletion
                existingEntry.dispose();
                const entries = this._entriesObs.get().filter(e => e !== existingEntry);
                this._entriesObs.set(entries, undefined);
            }
            // Store initial content for timeline restoration
            if (!this._initialFileContents.has(resource)) {
                this._initialFileContents.set(resource, fileContent);
            }
            // Delete the file on disk
            await this._bulkEditService.apply({
                edits: [{ oldResource: resource, options: { ignoreIfNotExists: true } }]
            });
            // Record the delete operation in the timeline
            this._timeline.recordFileOperation({
                type: FileOperationType.Delete,
                uri: resource,
                requestId: responseModel.requestId,
                epoch: this._timeline.incrementEpoch(),
                finalContent: fileContent
            });
            // Create a deleted file entry
            const telemetryInfo = this._getTelemetryInfoForModel(responseModel);
            const languageSelection = this._languageService.createByFilepathOrFirstLine(resource);
            const entry = this._instantiationService.createInstance(ChatEditingDeletedFileEntry, resource, fileContent, { collapse: (tx) => this._collapse(resource, tx) }, telemetryInfo, languageSelection.languageId);
            // Add entry to the entries observable
            const entries = [...this._entriesObs.get(), entry];
            this._entriesObs.set(entries, undefined);
        });
    }
    applyWorkspaceEdit(edit, responseModel, undoStopId) {
        for (const fileEdit of edit.edits) {
            if (fileEdit.oldResource && !fileEdit.newResource) {
                // File deletion
                this.startDeletion(fileEdit.oldResource, responseModel, undoStopId);
            }
            // Future: handle file creations and renames
        }
    }
    async startExternalEdits(responseModel, operationId, resources, undoStopId, contentFor) {
        const snapshots = new ResourceMap();
        const acquiredLockPromises = [];
        const releaseLockPromises = [];
        const progress = [];
        const telemetryInfo = this._getTelemetryInfoForModel(responseModel);
        await chatEditingSessionIsReady(this);
        // Acquire locks for each resource and take snapshots
        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            const contentSource = contentFor?.[i];
            const releaseLock = new DeferredPromise();
            releaseLockPromises.push(releaseLock);
            const acquiredLock = new DeferredPromise();
            acquiredLockPromises.push(acquiredLock);
            this._streamingEditLocks.queue(resource.toString(), async () => {
                if (this.isDisposed) {
                    acquiredLock.complete();
                    return;
                }
                let initialContent;
                if (contentSource) {
                    // Read the before-content from the provided URI instead of disk
                    try {
                        const data = await this._fileService.readFile(contentSource);
                        initialContent = data.value.toString();
                    }
                    catch {
                        initialContent = '';
                    }
                }
                const entry = await this._getOrCreateModifiedFileEntry(resource, 1 /* NotExistBehavior.Abort */, telemetryInfo, initialContent);
                if (entry) {
                    await this._acceptStreamingEditsStart(responseModel, undoStopId, resource);
                }
                const notebookUri = CellUri.parse(resource)?.notebook || resource;
                progress.push(...createOpeningEditCodeBlock(resource, this._notebookService.hasSupportedNotebooks(notebookUri), undoStopId));
                if (initialContent !== undefined) {
                    if (entry) {
                        entry.initialContent = initialContent;
                        await entry.resetEditTrackerToInitialContent(); // in case it's reused
                    }
                    snapshots.set(resource, initialContent);
                }
                else {
                    // Save to disk to ensure disk state is current before external edits
                    await entry?.save();
                    // Take snapshot of current state
                    snapshots.set(resource, entry && this._getCurrentTextOrNotebookSnapshot(entry));
                }
                entry?.startExternalEdit();
                acquiredLock.complete();
                // Wait for the lock to be released by stopExternalEdits
                return releaseLock.p;
            });
        }
        await Promise.all(acquiredLockPromises.map(p => p.p));
        this.createSnapshot(responseModel.requestId, undoStopId);
        // Store the operation state
        this._externalEditOperations.set(operationId, {
            responseModel,
            snapshots,
            undoStopId,
            releaseLocks: () => releaseLockPromises.forEach(p => p.complete())
        });
        return progress;
    }
    async stopExternalEdits(responseModel, operationId, contentFor) {
        const operation = this._externalEditOperations.get(operationId);
        if (!operation) {
            this._logService.warn(`stopExternalEdits called for unknown operation ${operationId}`);
            return [];
        }
        this._externalEditOperations.delete(operationId);
        const progress = [];
        try {
            // Build a map of resource -> contentFor URI
            const contentForMap = new ResourceMap();
            if (contentFor) {
                let idx = 0;
                for (const [resource] of operation.snapshots) {
                    if (idx < contentFor.length && contentFor[idx]) {
                        contentForMap.set(resource, contentFor[idx]);
                    }
                    idx++;
                }
            }
            // For each resource, compute the diff and create edit parts
            for (const [resource, beforeSnapshot] of operation.snapshots) {
                let entry = this._getEntry(resource);
                // Files that did not exist on disk before may not exist in our working
                // set yet. Create those if that's the case.
                if (!entry && beforeSnapshot === undefined) {
                    entry = await this._getOrCreateModifiedFileEntry(resource, 1 /* NotExistBehavior.Abort */, this._getTelemetryInfoForModel(responseModel), '');
                    if (entry) {
                        entry.startExternalEdit();
                        entry.acceptStreamingEditsStart(responseModel, operation.undoStopId, undefined);
                    }
                }
                if (!entry) {
                    continue;
                }
                let afterSnapshot;
                const contentSource = contentForMap.get(resource);
                if (contentSource) {
                    // Read after-content from the provided URI instead of disk
                    try {
                        const data = await this._fileService.readFile(contentSource);
                        afterSnapshot = data.value.toString();
                    }
                    catch (_e) {
                        afterSnapshot = '';
                    }
                }
                else {
                    // Reload from disk to ensure in-memory model is in sync with file system
                    await entry.revertToDisk();
                    afterSnapshot = this._getCurrentTextOrNotebookSnapshot(entry) ?? '';
                }
                // Compute edits from the snapshots
                let edits = [];
                if (beforeSnapshot === undefined) {
                    this._timeline.recordFileOperation({
                        type: FileOperationType.Create,
                        uri: resource,
                        requestId: responseModel.requestId,
                        epoch: this._timeline.incrementEpoch(),
                        initialContent: afterSnapshot,
                        telemetryInfo: entry.telemetryInfo,
                    });
                }
                else {
                    edits = await entry.computeEditsFromSnapshots(beforeSnapshot, afterSnapshot);
                    this._recordEditOperations(entry, resource, edits, responseModel);
                }
                progress.push(entry instanceof ChatEditingModifiedNotebookEntry ? {
                    kind: 'notebookEdit',
                    uri: resource,
                    edits: edits,
                    done: true,
                    isExternalEdit: true
                } : {
                    kind: 'textEdit',
                    uri: resource,
                    edits: edits,
                    done: true,
                    isExternalEdit: true
                });
                // Mark as no longer being modified
                await entry.acceptStreamingEditsEnd();
                // Accept the changes for background sessions
                if (getChatSessionType(this.chatSessionResource) === AgentSessionProviders.Background) {
                    await entry.accept();
                }
                // Clear external edit mode
                entry.stopExternalEdit();
            }
        }
        finally {
            // Release all the locks
            operation.releaseLocks();
            const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), k => !operation.snapshots.has(URI.parse(k)));
            if (!hasOtherTasks) {
                this._state.set(2 /* ChatEditingSessionState.Idle */, undefined);
            }
        }
        progress.push({
            kind: 'markdownContent',
            content: new MarkdownString('\n````\n'),
        });
        return progress;
    }
    async undoInteraction() {
        await this._timeline.undoToLastCheckpoint();
    }
    async redoInteraction() {
        await this._timeline.redoToNextCheckpoint();
    }
    async triggerExplanationGeneration() {
        // Clear any existing explanations first
        this.clearExplanations();
        const entries = this._entriesObs.get();
        const diffInfos = [];
        for (const entry of entries) {
            if (entry instanceof ChatEditingModifiedDocumentEntry) {
                const diff = await entry.getDiffInfo();
                diffInfos.push({
                    changes: diff.changes,
                    identical: diff.identical,
                    originalModel: entry.originalModel,
                    modifiedModel: entry.modifiedModel,
                });
            }
        }
        if (diffInfos.length > 0) {
            this._explanationHandle = this._explanationModelManager.generateExplanations(diffInfos, this.chatSessionResource, CancellationToken.None);
            await this._explanationHandle.completed;
        }
    }
    clearExplanations() {
        if (this._explanationHandle) {
            this._explanationHandle.dispose();
            this._explanationHandle = undefined;
        }
    }
    hasExplanations() {
        return this._explanationHandle !== undefined;
    }
    _recordEditOperations(entry, resource, edits, responseModel) {
        // Determine if these are text edits or notebook edits
        const isNotebookEdits = edits.length > 0 && hasKey(edits[0], { cells: true });
        if (isNotebookEdits) {
            // Record notebook edit operation
            const notebookEdits = edits;
            this._timeline.recordFileOperation({
                type: FileOperationType.NotebookEdit,
                uri: resource,
                requestId: responseModel.requestId,
                epoch: this._timeline.incrementEpoch(),
                cellEdits: notebookEdits
            });
        }
        else {
            let cellIndex;
            if (entry instanceof ChatEditingModifiedNotebookEntry) {
                const cellUri = CellUri.parse(resource);
                if (cellUri) {
                    const i = entry.getIndexOfCellHandle(cellUri.handle);
                    if (i !== -1) {
                        cellIndex = i;
                    }
                }
            }
            const textEdits = edits;
            this._timeline.recordFileOperation({
                type: FileOperationType.TextEdit,
                uri: resource,
                requestId: responseModel.requestId,
                epoch: this._timeline.incrementEpoch(),
                edits: textEdits,
                cellIndex,
            });
        }
    }
    _getCurrentTextOrNotebookSnapshot(entry) {
        if (entry instanceof ChatEditingModifiedNotebookEntry) {
            return entry.getCurrentSnapshot();
        }
        else if (entry instanceof ChatEditingModifiedDocumentEntry) {
            return entry.getCurrentContents();
        }
        else if (entry instanceof ChatEditingDeletedFileEntry) {
            return '';
        }
        else {
            throw new Error(`unknown entry type for ${entry.modifiedURI}`);
        }
    }
    async _acceptStreamingEditsStart(responseModel, undoStop, resource) {
        const entry = await this._getOrCreateModifiedFileEntry(resource, 0 /* NotExistBehavior.Create */, this._getTelemetryInfoForModel(responseModel));
        // Record file baseline if this is the first edit for this file in this request
        if (!this._timeline.hasFileBaseline(resource, responseModel.requestId)) {
            this._timeline.recordFileBaseline({
                uri: resource,
                requestId: responseModel.requestId,
                content: this._getCurrentTextOrNotebookSnapshot(entry),
                epoch: this._timeline.incrementEpoch(),
                telemetryInfo: entry.telemetryInfo,
                notebookViewType: entry instanceof ChatEditingModifiedNotebookEntry ? entry.viewType : undefined,
            });
        }
        transaction((tx) => {
            this._state.set(1 /* ChatEditingSessionState.StreamingEdits */, tx);
            entry.acceptStreamingEditsStart(responseModel, undoStop, tx);
            // Note: Individual edit operations will be recorded by the file entries
        });
        return entry;
    }
    async _initEntries({ entries }) {
        // Reset all the files which are modified in this session state
        // but which are not found in the snapshot
        for (const entry of this._entriesObs.get()) {
            const snapshotEntry = entries.get(entry.modifiedURI);
            if (!snapshotEntry) {
                await entry.resetToInitialContent();
                entry.dispose();
            }
        }
        const entriesArr = [];
        // Restore all entries from the snapshot
        for (const snapshotEntry of entries.values()) {
            let entry;
            if (snapshotEntry.isDeleted) {
                // Create a deleted file entry
                entry = this._instantiationService.createInstance(ChatEditingDeletedFileEntry, snapshotEntry.resource, snapshotEntry.original, // original content before deletion
                { collapse: (tx) => this._collapse(snapshotEntry.resource, tx) }, snapshotEntry.telemetryInfo, snapshotEntry.languageId);
                await entry.restoreFromSnapshot(snapshotEntry, false);
            }
            else {
                entry = await this._getOrCreateModifiedFileEntry(snapshotEntry.resource, 1 /* NotExistBehavior.Abort */, snapshotEntry.telemetryInfo);
                if (entry) {
                    const restoreToDisk = snapshotEntry.state === 0 /* ModifiedFileEntryState.Modified */;
                    await entry.restoreFromSnapshot(snapshotEntry, restoreToDisk);
                }
            }
            if (entry) {
                entriesArr.push(entry);
            }
        }
        this._entriesObs.set(entriesArr, undefined);
        this._telemetryService.publicLog2('chatEditing/sessionRestore', {
            editSessionId: getKeyForChatSessionResource(this.chatSessionResource),
            ...this._countEntryStates(entriesArr),
        });
    }
    async _acceptEdits(resource, textEdits, isLastEdits, responseModel) {
        const entry = await this._getOrCreateModifiedFileEntry(resource, 0 /* NotExistBehavior.Create */, this._getTelemetryInfoForModel(responseModel));
        // Record edit operations in the timeline if there are actual edits
        if (textEdits.length > 0) {
            this._recordEditOperations(entry, resource, textEdits, responseModel);
        }
        await entry.acceptAgentEdits(resource, textEdits, isLastEdits, responseModel);
    }
    _getTelemetryInfoForModel(responseModel) {
        // Make these getters because the response result is not available when the file first starts to be edited
        return new class {
            get agentId() { return responseModel.agent?.id; }
            get modelId() { return responseModel.request?.modelId; }
            get modeId() { return responseModel.request?.modeInfo?.modeId; }
            get command() { return responseModel.slashCommand?.name; }
            get sessionResource() { return responseModel.session.sessionResource; }
            get requestId() { return responseModel.requestId; }
            get result() { return responseModel.result; }
            get applyCodeBlockSuggestionId() { return responseModel.request?.modeInfo?.applyCodeBlockSuggestionId; }
            get feature() {
                if (responseModel.session.initialLocation === ChatAgentLocation.Chat) {
                    return 'sideBarChat';
                }
                else if (responseModel.session.initialLocation === ChatAgentLocation.EditorInline) {
                    return 'inlineChat';
                }
                return undefined;
            }
        };
    }
    _countEntryStates(entries) {
        let entryCount = 0;
        let modifiedCount = 0;
        let acceptedCount = 0;
        let rejectedCount = 0;
        for (const entry of entries) {
            entryCount += 1;
            switch (entry.state.get()) {
                case 0 /* ModifiedFileEntryState.Modified */:
                    modifiedCount += 1;
                    break;
                case 1 /* ModifiedFileEntryState.Accepted */:
                    acceptedCount += 1;
                    break;
                case 2 /* ModifiedFileEntryState.Rejected */:
                    rejectedCount += 1;
                    break;
            }
        }
        return { entryCount, modifiedCount, acceptedCount, rejectedCount };
    }
    async _resolve(requestId, undoStop, resource) {
        const hasOtherTasks = Iterable.some(this._streamingEditLocks.keys(), k => k !== resource.toString());
        if (!hasOtherTasks) {
            this._state.set(2 /* ChatEditingSessionState.Idle */, undefined);
        }
        const entry = this._getEntry(resource);
        if (!entry) {
            return;
        }
        // Create checkpoint for this edit completion
        const label = undoStop ? `Request ${requestId} - Stop ${undoStop}` : `Request ${requestId}`;
        this._timeline.createCheckpoint(requestId, undoStop, label);
        return entry.acceptStreamingEditsEnd();
    }
    async _getOrCreateModifiedFileEntry(resource, ifNotExists, telemetryInfo, _initialContent) {
        resource = CellUri.parse(resource)?.notebook ?? resource;
        const existingEntry = this._entriesObs.get().find(e => isEqual(e.modifiedURI, resource));
        if (existingEntry) {
            // If the existing entry is a deleted file entry, we need to replace it with a new modified entry
            // This handles the case where a file was deleted and then recreated
            if (existingEntry instanceof ChatEditingDeletedFileEntry) {
                // Use the original content from the deleted entry as the initial content for the new entry
                const initialContentFromDeleted = existingEntry.state.get() === 0 /* ModifiedFileEntryState.Modified */
                    ? existingEntry.initialContent
                    : undefined;
                // Remove the deleted entry
                existingEntry.dispose();
                const entries = this._entriesObs.get().filter(e => e !== existingEntry);
                this._entriesObs.set(entries, undefined);
                // Set the initial content from the deleted entry if it was still in modified state
                if (initialContentFromDeleted !== undefined) {
                    _initialContent = initialContentFromDeleted;
                }
                // Fall through to create a new entry
            }
            else {
                if (telemetryInfo.requestId !== existingEntry.telemetryInfo.requestId) {
                    existingEntry.updateTelemetryInfo(telemetryInfo);
                }
                return existingEntry;
            }
        }
        let entry;
        const existingExternalEntry = this._lookupExternalEntry(resource);
        if (existingExternalEntry) {
            entry = existingExternalEntry;
            if (telemetryInfo.requestId !== entry.telemetryInfo.requestId) {
                entry.updateTelemetryInfo(telemetryInfo);
            }
        }
        else {
            const initialContent = _initialContent ?? this._initialFileContents.get(resource);
            // This gets manually disposed in .dispose() or in .restoreSnapshot()
            const maybeEntry = await this._createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent);
            if (!maybeEntry) {
                return undefined;
            }
            entry = maybeEntry;
            if (initialContent === undefined) {
                this._initialFileContents.set(resource, entry.initialContent);
            }
        }
        // If an entry is deleted e.g. reverting a created file,
        // remove it from the entries and don't show it in the working set anymore
        // so that it can be recreated e.g. through retry
        const listener = entry.onDidDelete(() => {
            const newEntries = this._entriesObs.get().filter(e => !isEqual(e.modifiedURI, entry.modifiedURI));
            this._entriesObs.set(newEntries, undefined);
            this._editorService.closeEditors(this._editorService.findEditors(entry.modifiedURI));
            if (!existingExternalEntry) {
                // don't dispose entries that are not yours!
                entry.dispose();
            }
            this._store.delete(listener);
        });
        this._store.add(listener);
        const entriesArr = [...this._entriesObs.get(), entry];
        this._entriesObs.set(entriesArr, undefined);
        return entry;
    }
    async _createModifiedFileEntry(resource, telemetryInfo, ifNotExists, initialContent) {
        const multiDiffEntryDelegate = {
            collapse: (transaction) => this._collapse(resource, transaction),
            recordOperation: (operation) => {
                operation.epoch = this._timeline.incrementEpoch();
                this._timeline.recordFileOperation(operation);
            },
        };
        const notebookUri = CellUri.parse(resource)?.notebook || resource;
        const doCreate = async (chatKind) => {
            if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
                return await ChatEditingModifiedNotebookEntry.create(notebookUri, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, this._instantiationService);
            }
            else {
                const ref = await this._textModelService.createModelReference(resource);
                return this._instantiationService.createInstance(ChatEditingModifiedDocumentEntry, ref, multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent);
            }
        };
        try {
            return await doCreate(1 /* ChatEditKind.Modified */);
        }
        catch (err) {
            if (ifNotExists === 1 /* NotExistBehavior.Abort */) {
                return undefined;
            }
            // this file does not exist yet, create it and try again
            await this._bulkEditService.apply({ edits: [{ newResource: resource }] });
            if (this.configurationService.getValue('accessibility.openChatEditedFiles')) {
                this._editorService.openEditor({ resource, options: { inactive: true, preserveFocus: true, pinned: true } });
            }
            // Record file creation operation
            this._timeline.recordFileOperation({
                type: FileOperationType.Create,
                uri: resource,
                requestId: telemetryInfo.requestId,
                epoch: this._timeline.incrementEpoch(),
                initialContent: initialContent || '',
                telemetryInfo,
            });
            if (this._notebookService.hasSupportedNotebooks(notebookUri)) {
                return await ChatEditingModifiedNotebookEntry.create(resource, multiDiffEntryDelegate, telemetryInfo, 0 /* ChatEditKind.Created */, initialContent, this._instantiationService);
            }
            else {
                return await doCreate(0 /* ChatEditKind.Created */);
            }
        }
    }
    _collapse(resource, transaction) {
        const multiDiffItem = this._editorPane?.findDocumentDiffItem(resource);
        if (multiDiffItem) {
            this._editorPane?.viewModel?.items.get().find((documentDiffItem) => isEqual(documentDiffItem.originalUri, multiDiffItem.originalUri) &&
                isEqual(documentDiffItem.modifiedUri, multiDiffItem.modifiedUri))
                ?.collapsed.set(true, transaction);
        }
    }
};
ChatEditingSession = ChatEditingSession_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, IModelService),
    __param(6, ILanguageService),
    __param(7, ITextModelService),
    __param(8, IBulkEditService),
    __param(9, IEditorGroupsService),
    __param(10, IEditorService),
    __param(11, INotebookService),
    __param(12, IAccessibilitySignalService),
    __param(13, ILogService),
    __param(14, IConfigurationService),
    __param(15, IFileService),
    __param(16, IChatEditingExplanationModelManager),
    __param(17, ITelemetryService)
], ChatEditingSession);
export { ChatEditingSession };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdTZXNzaW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nU2Vzc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBUyxTQUFTLEVBQUUsY0FBYyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMxRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBc0MsZUFBZSxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsTUFBTSxFQUFXLE1BQU0scUNBQXFDLENBQUM7QUFDdEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJEQUEy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