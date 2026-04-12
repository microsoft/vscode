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
var ChatEditingModifiedNotebookEntry_1;
import { streamToBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { DisposableStore, thenRegisterOrDispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { autorun, ObservablePromise, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { assertType } from '../../../../../base/common/types.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { NotebookTextDiffEditor } from '../../../notebook/browser/diff/notebookDiffEditor.js';
import { getNotebookEditorFromEditorPane } from '../../../notebook/browser/notebookBrowser.js';
import { NotebookCellsChangeType, NotebookSetting } from '../../../notebook/common/notebookCommon.js';
import { computeDiff } from '../../../notebook/common/notebookDiff.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookLoggingService } from '../../../notebook/common/notebookLoggingService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { INotebookEditorWorkerService } from '../../../notebook/common/services/notebookWorkerService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { createSnapshot, deserializeSnapshot, getNotebookSnapshotFileURI, restoreSnapshot, SnapshotComparer } from './notebook/chatEditingModifiedNotebookSnapshot.js';
import { ChatEditingNewNotebookContentEdits } from './notebook/chatEditingNewNotebookContentEdits.js';
import { ChatEditingNotebookCellEntry } from './notebook/chatEditingNotebookCellEntry.js';
import { ChatEditingNotebookDiffEditorIntegration, ChatEditingNotebookEditorIntegration } from './notebook/chatEditingNotebookEditorIntegration.js';
import { ChatEditingNotebookFileSystemProvider } from './notebook/chatEditingNotebookFileSystemProvider.js';
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell, calculateNotebookRewriteRatio, getCorrespondingOriginalCellIndex, isTransientIPyNbExtensionEvent } from './notebook/helpers.js';
import { countChanges, sortCellChanges } from './notebook/notebookCellChanges.js';
const SnapshotLanguageId = 'VSCodeChatNotebookSnapshotLanguage';
let ChatEditingModifiedNotebookEntry = class ChatEditingModifiedNotebookEntry extends AbstractChatEditingModifiedFileEntry {
    static { ChatEditingModifiedNotebookEntry_1 = this; }
    static { this.NewModelCounter = 0; }
    get isProcessingResponse() {
        return this._isProcessingResponse;
    }
    get cellsDiffInfo() {
        return this._cellsDiffInfo;
    }
    get viewType() {
        return this.modifiedModel.viewType;
    }
    static async create(uri, _multiDiffEntryDelegate, telemetryInfo, chatKind, initialContent, instantiationService) {
        return instantiationService.invokeFunction(async (accessor) => {
            const notebookService = accessor.get(INotebookService);
            const resolver = accessor.get(INotebookEditorModelResolverService);
            const configurationServie = accessor.get(IConfigurationService);
            const resourceRef = await resolver.resolve(uri);
            const notebook = resourceRef.object.notebook;
            const originalUri = getNotebookSnapshotFileURI(telemetryInfo.sessionResource, telemetryInfo.requestId, generateUuid(), notebook.uri.scheme === Schemas.untitled ? `/${notebook.uri.path}` : notebook.uri.path, notebook.viewType);
            const [options, buffer] = await Promise.all([
                notebookService.withNotebookDataProvider(resourceRef.object.notebook.notebookType),
                notebookService.createNotebookTextDocumentSnapshot(notebook.uri, 2 /* SnapshotContext.Backup */, CancellationToken.None).then(s => streamToBuffer(s))
            ]);
            const disposables = new DisposableStore();
            // Register so that we can load this from file system.
            disposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));
            const originalRef = await resolver.resolve(originalUri, notebook.viewType);
            if (initialContent !== undefined) {
                try {
                    restoreSnapshot(originalRef.object.notebook, initialContent);
                }
                catch (ex) {
                    console.error(`Error restoring snapshot: ${initialContent}`, ex);
                    initialContent = createSnapshot(notebook, options.serializer.options, configurationServie);
                }
            }
            else {
                initialContent = createSnapshot(notebook, options.serializer.options, configurationServie);
                // Both models are the same, ensure the cell ids are the same, this way we get a perfect diffing.
                // No need to generate edits for this.
                // We want to ensure they are identitcal, possible original notebook was open and got modified.
                // Or something gets changed between serialization & deserialization of the snapshot into the original.
                // E.g. in jupyter notebooks the metadata contains transient data that gets updated after deserialization.
                restoreSnapshot(originalRef.object.notebook, initialContent);
                const edits = [];
                notebook.cells.forEach((cell, index) => {
                    const internalId = generateCellHash(cell.uri);
                    edits.push({ editType: 9 /* CellEditType.PartialInternalMetadata */, index, internalMetadata: { internalId } });
                });
                resourceRef.object.notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
                originalRef.object.notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
            }
            const instance = instantiationService.createInstance(ChatEditingModifiedNotebookEntry_1, resourceRef, originalRef, _multiDiffEntryDelegate, options.serializer.options, telemetryInfo, chatKind, initialContent);
            instance._register(disposables);
            return instance;
        });
    }
    static canHandleSnapshotContent(initialContent) {
        if (!initialContent) {
            return false;
        }
        try {
            deserializeSnapshot(initialContent);
            return true;
        }
        catch (ex) {
            // not a valid snapshot
            return false;
        }
    }
    static canHandleSnapshot(snapshot) {
        if (snapshot.languageId === SnapshotLanguageId && ChatEditingModifiedNotebookEntry_1.canHandleSnapshotContent(snapshot.current)) {
            return true;
        }
        return false;
    }
    constructor(modifiedResourceRef, originalResourceRef, _multiDiffEntryDelegate, transientOptions, telemetryInfo, kind, initialContent, configurationService, fileConfigService, chatService, fileService, instantiationService, textModelService, modelService, undoRedoService, notebookEditorWorkerService, loggingService, notebookResolver, aiEditTelemetryService) {
        super(modifiedResourceRef.object.notebook.uri, telemetryInfo, kind, configurationService, fileConfigService, chatService, fileService, undoRedoService, instantiationService, aiEditTelemetryService);
        this.modifiedResourceRef = modifiedResourceRef;
        this._multiDiffEntryDelegate = _multiDiffEntryDelegate;
        this.transientOptions = transientOptions;
        this.configurationService = configurationService;
        this.textModelService = textModelService;
        this.modelService = modelService;
        this.notebookEditorWorkerService = notebookEditorWorkerService;
        this.loggingService = loggingService;
        this.notebookResolver = notebookResolver;
        /**
         * Whether we're still generating diffs from a response.
         */
        this._isProcessingResponse = observableValue('isProcessingResponse', false);
        this._isEditFromUs = false;
        /**
         * Whether all edits are from us, e.g. is possible a user has made edits, then this will be false.
         */
        this._allEditsAreFromUs = true;
        this._changesCount = observableValue(this, 0);
        this.changesCount = this._changesCount;
        this.cellEntryMap = new ResourceMap();
        this.modifiedToOriginalCell = new ResourceMap();
        this._cellsDiffInfo = observableValue('diffInfo', []);
        /**
         * List of Cell URIs that are edited,
         * Will be cleared once all edits have been accepted.
         * I.e. this will only contain URIS while acceptAgentEdits is being called & before `isLastEdit` is sent.
         * I.e. this is populated only when edits are being streamed.
         */
        this.editedCells = new ResourceSet();
        this.computeRequestId = 0;
        this.cellTextModelMap = new ResourceMap();
        this.initialContentComparer = new SnapshotComparer(initialContent);
        this.modifiedModel = this._register(modifiedResourceRef).object.notebook;
        this.originalModel = this._register(originalResourceRef).object.notebook;
        this.originalURI = this.originalModel.uri;
        this.initialContent = initialContent;
        this.initializeModelsFromDiff();
        this._register(this.modifiedModel.onDidChangeContent(this.mirrorNotebookEdits, this));
    }
    initializeModelsFromDiffImpl(cellsDiffInfo) {
        this.cellEntryMap.forEach(entry => entry.dispose());
        this.cellEntryMap.clear();
        const diffs = cellsDiffInfo.map((cellDiff, i) => {
            switch (cellDiff.type) {
                case 'delete':
                    return this.createDeleteCellDiffInfo(cellDiff.originalCellIndex);
                case 'insert':
                    return this.createInsertedCellDiffInfo(cellDiff.modifiedCellIndex);
                default:
                    return this.createModifiedCellDiffInfo(cellDiff.modifiedCellIndex, cellDiff.originalCellIndex);
            }
        });
        this._cellsDiffInfo.set(diffs, undefined);
        this._changesCount.set(countChanges(diffs), undefined);
    }
    getIndexOfCellHandle(handle) {
        return this.modifiedModel.cells.findIndex(c => c.handle === handle);
    }
    async initializeModelsFromDiff() {
        const id = ++this.computeRequestId;
        if (this._areOriginalAndModifiedIdenticalImpl()) {
            const cellsDiffInfo = this.modifiedModel.cells.map((_, index) => {
                return { type: 'unchanged', originalCellIndex: index, modifiedCellIndex: index };
            });
            this.initializeModelsFromDiffImpl(cellsDiffInfo);
            return;
        }
        const cellsDiffInfo = [];
        try {
            this._isProcessingResponse.set(true, undefined);
            const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.originalURI, this.modifiedURI);
            if (id !== this.computeRequestId || this._store.isDisposed) {
                return;
            }
            const result = computeDiff(this.originalModel, this.modifiedModel, notebookDiff);
            if (result.cellDiffInfo.length) {
                cellsDiffInfo.push(...result.cellDiffInfo);
            }
        }
        catch (ex) {
            this.loggingService.error('Notebook Chat', 'Error computing diff:\n' + ex);
        }
        finally {
            this._isProcessingResponse.set(false, undefined);
        }
        this.initializeModelsFromDiffImpl(cellsDiffInfo);
    }
    updateCellDiffInfo(cellsDiffInfo, transcation) {
        this._cellsDiffInfo.set(sortCellChanges(cellsDiffInfo), transcation);
        this._changesCount.set(countChanges(cellsDiffInfo), transcation);
    }
    mirrorNotebookEdits(e) {
        if (this._isEditFromUs || this._isExternalEditInProgress || Array.from(this.cellEntryMap.values()).some(entry => entry.isEditFromUs)) {
            return;
        }
        // Possible user reverted the changes from SCM or the like.
        // Or user just reverted the changes made via edits (e.g. edit made a change in a cell and user undid that change either by typing over or other).
        // Computing snapshot is too slow, as this event gets triggered for every key stroke in a cell,
        // const didResetToOriginalContent = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService) === this.initialContent;
        let didResetToOriginalContent = this.initialContentComparer.isEqual(this.modifiedModel);
        const currentState = this._stateObs.get();
        if (currentState === 0 /* ModifiedFileEntryState.Modified */ && didResetToOriginalContent) {
            this._stateObs.set(2 /* ModifiedFileEntryState.Rejected */, undefined);
            this.updateCellDiffInfo([], undefined);
            this.initializeModelsFromDiff();
            this._notifySessionAction('rejected');
            return;
        }
        if (!e.rawEvents.length) {
            return;
        }
        if (currentState === 2 /* ModifiedFileEntryState.Rejected */) {
            return;
        }
        if (isTransientIPyNbExtensionEvent(this.modifiedModel.notebookType, e)) {
            return;
        }
        this._allEditsAreFromUs = false;
        this._userEditScheduler.schedule();
        // Changes to cell text is sync'ed and handled separately.
        // See ChatEditingNotebookCellEntry._mirrorEdits
        for (const event of e.rawEvents.filter(event => event.kind !== NotebookCellsChangeType.ChangeCellContent)) {
            switch (event.kind) {
                case NotebookCellsChangeType.ChangeDocumentMetadata: {
                    const edit = {
                        editType: 5 /* CellEditType.DocumentMetadata */,
                        metadata: this.modifiedModel.metadata
                    };
                    this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
                    break;
                }
                case NotebookCellsChangeType.ModelChange: {
                    let cellDiffs = sortCellChanges(this._cellsDiffInfo.get());
                    // Ensure the new notebook cells have internalIds
                    this._applyEditsSync(() => {
                        event.changes.forEach(change => {
                            change[2].forEach((cell, i) => {
                                if (cell.internalMetadata.internalId) {
                                    return;
                                }
                                const index = change[0] + i;
                                const internalId = generateCellHash(cell.uri);
                                const edits = [{ editType: 9 /* CellEditType.PartialInternalMetadata */, index, internalMetadata: { internalId } }];
                                this.modifiedModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
                                cell.internalMetadata ??= {};
                                cell.internalMetadata.internalId = internalId;
                            });
                        });
                    });
                    event.changes.forEach(change => {
                        cellDiffs = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(change, cellDiffs, this.modifiedModel.cells.length, this.originalModel.cells.length, this.originalModel.applyEdits.bind(this.originalModel), this.createModifiedCellDiffInfo.bind(this));
                    });
                    this.updateCellDiffInfo(cellDiffs, undefined);
                    this.disposeDeletedCellEntries();
                    break;
                }
                case NotebookCellsChangeType.ChangeCellLanguage: {
                    const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
                    if (typeof index === 'number') {
                        const edit = {
                            editType: 4 /* CellEditType.CellLanguage */,
                            index,
                            language: event.language
                        };
                        this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
                    }
                    break;
                }
                case NotebookCellsChangeType.ChangeCellMetadata: {
                    // ipynb and other extensions can alter metadata, ensure we update the original model in the corresponding cell.
                    const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
                    if (typeof index === 'number') {
                        const edit = {
                            editType: 3 /* CellEditType.Metadata */,
                            index,
                            metadata: event.metadata
                        };
                        this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
                    }
                    break;
                }
                case NotebookCellsChangeType.ChangeCellMime:
                    break;
                case NotebookCellsChangeType.ChangeCellInternalMetadata: {
                    const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
                    if (typeof index === 'number') {
                        const edit = {
                            editType: 9 /* CellEditType.PartialInternalMetadata */,
                            index,
                            internalMetadata: event.internalMetadata
                        };
                        this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
                    }
                    break;
                }
                case NotebookCellsChangeType.Output: {
                    // User can run cells.
                    const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
                    if (typeof index === 'number') {
                        const edit = {
                            editType: 2 /* CellEditType.Output */,
                            index,
                            append: event.append,
                            outputs: event.outputs
                        };
                        this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
                    }
                    break;
                }
                case NotebookCellsChangeType.OutputItem: {
                    // outputs are shared between original and modified model, so the original model is already updated.
                    break;
                }
                case NotebookCellsChangeType.Move: {
                    const result = adjustCellDiffAndOriginalModelBasedOnCellMovements(event, this._cellsDiffInfo.get().slice());
                    if (result) {
                        this.originalModel.applyEdits(result[1], true, undefined, () => undefined, undefined, false);
                        this._cellsDiffInfo.set(result[0], undefined);
                    }
                    break;
                }
                default: {
                    break;
                }
            }
        }
        didResetToOriginalContent = this.initialContentComparer.isEqual(this.modifiedModel);
        if (currentState === 0 /* ModifiedFileEntryState.Modified */ && didResetToOriginalContent) {
            this._stateObs.set(2 /* ModifiedFileEntryState.Rejected */, undefined);
            this.updateCellDiffInfo([], undefined);
            this.initializeModelsFromDiff();
            return;
        }
    }
    async _doAccept() {
        this.updateCellDiffInfo([], undefined);
        const snapshot = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
        restoreSnapshot(this.originalModel, snapshot);
        this.initializeModelsFromDiff();
        await this._collapse(undefined);
        const config = this._fileConfigService.getAutoSaveConfiguration(this.modifiedURI);
        if (this.modifiedModel.uri.scheme !== Schemas.untitled && (!config.autoSave || !this.notebookResolver.isDirty(this.modifiedURI))) {
            // SAVE after accept for manual-savers, for auto-savers
            // trigger explict save to get save participants going
            await this._applyEdits(async () => {
                try {
                    await this.modifiedResourceRef.object.save({
                        reason: 1 /* SaveReason.EXPLICIT */,
                        force: true,
                    });
                }
                catch {
                    // ignored
                }
            });
        }
    }
    async _doReject() {
        this.updateCellDiffInfo([], undefined);
        if (this.createdInRequestId === this._telemetryInfo.requestId) {
            await this._applyEdits(async () => {
                await this.modifiedResourceRef.object.revert({ soft: true });
                await this._fileService.del(this.modifiedURI);
            });
            this._onDidDelete.fire();
        }
        else {
            await this._applyEdits(async () => {
                const snapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
                this.restoreSnapshotInModifiedModel(snapshot);
                if (this._allEditsAreFromUs && Array.from(this.cellEntryMap.values()).every(entry => entry.allEditsAreFromUs)) {
                    // save the file after discarding so that the dirty indicator goes away
                    // and so that an intermediate saved state gets reverted
                    await this.modifiedResourceRef.object.save({ reason: 1 /* SaveReason.EXPLICIT */, skipSaveParticipants: true });
                }
            });
            this.initializeModelsFromDiff();
            await this._collapse(undefined);
        }
    }
    async _collapse(transaction) {
        this._multiDiffEntryDelegate.collapse(transaction);
    }
    _createEditorIntegration(editor) {
        const notebookEditor = getNotebookEditorFromEditorPane(editor);
        if (!notebookEditor && editor.getId() === NotebookTextDiffEditor.ID) {
            const diffEditor = editor.getControl();
            return this._instantiationService.createInstance(ChatEditingNotebookDiffEditorIntegration, diffEditor, this._cellsDiffInfo);
        }
        assertType(notebookEditor);
        return this._instantiationService.createInstance(ChatEditingNotebookEditorIntegration, this, editor, this.modifiedModel, this.originalModel, this._cellsDiffInfo);
    }
    _resetEditsState(tx) {
        super._resetEditsState(tx);
        this.cellEntryMap.forEach(entry => !entry.isDisposed && entry.clearCurrentEditLineDecoration());
    }
    _createUndoRedoElement(response) {
        const request = response.session.getRequests().find(req => req.id === response.requestId);
        const label = request?.message.text ? localize('chatNotebookEdit1', "Chat Edit: '{0}'", request.message.text) : localize('chatNotebookEdit2', "Chat Edit");
        const transientOptions = this.transientOptions;
        const outputSizeLimit = this.configurationService.getValue(NotebookSetting.outputBackupSizeLimit) * 1024;
        // create a snapshot of the current state of the model, before the next set of edits
        let initial = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
        let last = '';
        let redoState = 2 /* ModifiedFileEntryState.Rejected */;
        return {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: this.modifiedURI,
            label,
            code: 'chat.edit',
            confirmBeforeUndo: false,
            undo: async () => {
                last = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
                this._isEditFromUs = true;
                try {
                    restoreSnapshot(this.modifiedModel, initial);
                    restoreSnapshot(this.originalModel, initial);
                }
                finally {
                    this._isEditFromUs = false;
                }
                redoState = this._stateObs.get() === 1 /* ModifiedFileEntryState.Accepted */ ? 1 /* ModifiedFileEntryState.Accepted */ : 2 /* ModifiedFileEntryState.Rejected */;
                this._stateObs.set(2 /* ModifiedFileEntryState.Rejected */, undefined);
                this.updateCellDiffInfo([], undefined);
                this.initializeModelsFromDiff();
                this._notifySessionAction('userModified');
            },
            redo: async () => {
                initial = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
                this._isEditFromUs = true;
                try {
                    restoreSnapshot(this.modifiedModel, last);
                    restoreSnapshot(this.originalModel, last);
                }
                finally {
                    this._isEditFromUs = false;
                }
                this._stateObs.set(redoState, undefined);
                this.updateCellDiffInfo([], undefined);
                this.initializeModelsFromDiff();
                this._notifySessionAction('userModified');
            }
        };
    }
    async _areOriginalAndModifiedIdentical() {
        return this._areOriginalAndModifiedIdenticalImpl();
    }
    _areOriginalAndModifiedIdenticalImpl() {
        const snapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
        return new SnapshotComparer(snapshot).isEqual(this.modifiedModel);
    }
    async acceptAgentEdits(resource, edits, isLastEdits, responseModel) {
        const isCellUri = resource.scheme === Schemas.vscodeNotebookCell;
        const cell = isCellUri && this.modifiedModel.cells.find(cell => isEqual(cell.uri, resource));
        let cellEntry;
        if (cell) {
            const index = this.modifiedModel.cells.indexOf(cell);
            const entry = this._cellsDiffInfo.get().slice().find(entry => entry.modifiedCellIndex === index);
            if (!entry) {
                // Not possible.
                console.error('Original cell model not found');
                return;
            }
            cellEntry = this.getOrCreateModifiedTextFileEntryForCell(cell, await entry.modifiedModel.promise, await entry.originalModel.promise);
        }
        // For all cells that were edited, send the `isLastEdits` flag.
        const finishPreviousCells = async () => {
            await Promise.all(Array.from(this.editedCells).map(async (uri) => {
                const cell = this.modifiedModel.cells.find(cell => isEqual(cell.uri, uri));
                const cellEntry = cell && this.cellEntryMap.get(cell.uri);
                await cellEntry?.acceptAgentEdits([], true, responseModel);
            }));
            this.editedCells.clear();
        };
        await this._applyEdits(async () => {
            await Promise.all(edits.map(async (edit, idx) => {
                const last = isLastEdits && idx === edits.length - 1;
                if (TextEdit.isTextEdit(edit)) {
                    // Possible we're getting the raw content for the notebook.
                    if (isEqual(resource, this.modifiedModel.uri)) {
                        this.newNotebookEditGenerator ??= this._instantiationService.createInstance(ChatEditingNewNotebookContentEdits, this.modifiedModel);
                        this.newNotebookEditGenerator.acceptTextEdits([edit]);
                    }
                    else {
                        // If we get cell edits, its impossible to get text edits for the notebook uri.
                        this.newNotebookEditGenerator = undefined;
                        if (!this.editedCells.has(resource)) {
                            await finishPreviousCells();
                            this.editedCells.add(resource);
                        }
                        await cellEntry?.acceptAgentEdits([edit], last, responseModel);
                    }
                }
                else {
                    // If we notebook edits, its impossible to get text edits for the notebook uri.
                    this.newNotebookEditGenerator = undefined;
                    this.acceptNotebookEdit(edit);
                }
            }));
        });
        // If the last edit for a cell was sent, then handle it
        if (isLastEdits) {
            await finishPreviousCells();
        }
        // isLastEdits can be true for cell Uris, but when its true for Cells edits.
        // It cannot be true for the notebook itself.
        isLastEdits = !isCellUri && isLastEdits;
        // If this is the last edit and & we got regular text edits for generating new notebook content
        // Then generate notebook edits from those text edits & apply those notebook edits.
        if (isLastEdits && this.newNotebookEditGenerator) {
            const notebookEdits = await this.newNotebookEditGenerator.generateEdits();
            this.newNotebookEditGenerator = undefined;
            notebookEdits.forEach(edit => this.acceptNotebookEdit(edit));
        }
        transaction((tx) => {
            this._stateObs.set(0 /* ModifiedFileEntryState.Modified */, tx);
            if (!isLastEdits) {
                const newRewriteRation = Math.max(this._rewriteRatioObs.get(), calculateNotebookRewriteRatio(this._cellsDiffInfo.get(), this.originalModel, this.modifiedModel));
                this._rewriteRatioObs.set(Math.min(1, newRewriteRation), tx);
            }
            else {
                this.editedCells.clear();
                this._resetEditsState(tx);
                this._rewriteRatioObs.set(1, tx);
            }
        });
    }
    disposeDeletedCellEntries() {
        const cellsUris = new ResourceSet(this.modifiedModel.cells.map(cell => cell.uri));
        Array.from(this.cellEntryMap.keys()).forEach(uri => {
            if (cellsUris.has(uri)) {
                return;
            }
            this.cellEntryMap.get(uri)?.dispose();
            this.cellEntryMap.delete(uri);
        });
    }
    acceptNotebookEdit(edit) {
        // make the actual edit
        this.modifiedModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
        this.disposeDeletedCellEntries();
        if (edit.editType !== 1 /* CellEditType.Replace */) {
            return;
        }
        // Ensure cells have internal Ids.
        edit.cells.forEach((_, i) => {
            const index = edit.index + i;
            const cell = this.modifiedModel.cells[index];
            if (cell.internalMetadata.internalId) {
                return;
            }
            const internalId = generateCellHash(cell.uri);
            const edits = [{ editType: 9 /* CellEditType.PartialInternalMetadata */, index, internalMetadata: { internalId } }];
            this.modifiedModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
        });
        let diff = [];
        if (edit.count === 0) {
            // All existing indexes are shifted by number of cells added.
            diff = sortCellChanges(this._cellsDiffInfo.get());
            diff.forEach(d => {
                if (d.type !== 'delete' && d.modifiedCellIndex >= edit.index) {
                    d.modifiedCellIndex += edit.cells.length;
                }
            });
            const diffInsert = edit.cells.map((_, i) => this.createInsertedCellDiffInfo(edit.index + i));
            diff.splice(edit.index, 0, ...diffInsert);
        }
        else {
            // All existing indexes are shifted by number of cells removed.
            // And unchanged cells should be converted to deleted cells.
            diff = sortCellChanges(this._cellsDiffInfo.get()).map((d) => {
                if (d.type === 'unchanged' && d.modifiedCellIndex >= edit.index && d.modifiedCellIndex <= (edit.index + edit.count - 1)) {
                    return this.createDeleteCellDiffInfo(d.originalCellIndex);
                }
                if (d.type !== 'delete' && d.modifiedCellIndex >= (edit.index + edit.count)) {
                    d.modifiedCellIndex -= edit.count;
                    return d;
                }
                return d;
            });
        }
        this.updateCellDiffInfo(diff, undefined);
    }
    computeStateAfterAcceptingRejectingChanges(accepted) {
        const currentSnapshot = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
        if (new SnapshotComparer(currentSnapshot).isEqual(this.originalModel)) {
            const state = accepted ? 1 /* ModifiedFileEntryState.Accepted */ : 2 /* ModifiedFileEntryState.Rejected */;
            this._stateObs.set(state, undefined);
            this._notifySessionAction(accepted ? 'accepted' : 'rejected');
        }
    }
    createModifiedCellDiffInfo(modifiedCellIndex, originalCellIndex) {
        const modifiedCell = this.modifiedModel.cells[modifiedCellIndex];
        const originalCell = this.originalModel.cells[originalCellIndex];
        this.modifiedToOriginalCell.set(modifiedCell.uri, originalCell.uri);
        const modifiedCellModelPromise = this.resolveCellModel(modifiedCell.uri);
        const originalCellModelPromise = this.resolveCellModel(originalCell.uri);
        Promise.all([modifiedCellModelPromise, originalCellModelPromise]).then(([modifiedCellModel, originalCellModel]) => {
            this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
        });
        const diff = observableValue('diff', nullDocumentDiff);
        const unchangedCell = {
            type: 'unchanged',
            modifiedCellIndex,
            originalCellIndex,
            keep: async (changes) => {
                const [modifiedCellModel, originalCellModel] = await Promise.all([modifiedCellModelPromise, originalCellModelPromise]);
                const entry = this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
                return entry ? entry.keep(changes) : false;
            },
            undo: async (changes) => {
                const [modifiedCellModel, originalCellModel] = await Promise.all([modifiedCellModelPromise, originalCellModelPromise]);
                const entry = this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
                return entry ? entry.undo(changes) : false;
            },
            modifiedModel: new ObservablePromise(modifiedCellModelPromise),
            originalModel: new ObservablePromise(originalCellModelPromise),
            diff
        };
        return unchangedCell;
    }
    createInsertedCellDiffInfo(modifiedCellIndex) {
        const cell = this.modifiedModel.cells[modifiedCellIndex];
        const lines = cell.getValue().split(/\r?\n/);
        const originalRange = new Range(1, 0, 1, 0);
        const modifiedRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
        const innerChanges = new RangeMapping(originalRange, modifiedRange);
        const changes = [new DetailedLineRangeMapping(new LineRange(1, 1), new LineRange(1, lines.length), [innerChanges])];
        // When a new cell is inserted, we use the ChatEditingCodeEditorIntegration to handle the edits.
        // & to also display undo/redo and decorations.
        // However that needs a modified and original model.
        // For inserted cells there's no original model, so we create a new empty text model and pass that as the original.
        const originalModelUri = this.modifiedModel.uri.with({ query: (ChatEditingModifiedNotebookEntry_1.NewModelCounter++).toString(), scheme: 'emptyCell' });
        const originalModel = this.modelService.getModel(originalModelUri) || this._register(this.modelService.createModel('', null, originalModelUri));
        this.modifiedToOriginalCell.set(cell.uri, originalModelUri);
        const keep = async () => {
            this._applyEditsSync(() => this.keepPreviouslyInsertedCell(cell));
            this.computeStateAfterAcceptingRejectingChanges(true);
            return true;
        };
        const undo = async () => {
            this._applyEditsSync(() => this.undoPreviouslyInsertedCell(cell));
            this.computeStateAfterAcceptingRejectingChanges(false);
            return true;
        };
        this.resolveCellModel(cell.uri).then(modifiedModel => {
            if (this._store.isDisposed) {
                return;
            }
            // We want decorators for the cell just as we display decorators for modified cells.
            // This way we have the ability to accept/reject the entire cell.
            this.getOrCreateModifiedTextFileEntryForCell(cell, modifiedModel, originalModel);
        });
        return {
            type: 'insert',
            originalCellIndex: undefined,
            modifiedCellIndex: modifiedCellIndex,
            keep,
            undo,
            modifiedModel: new ObservablePromise(this.resolveCellModel(cell.uri)),
            originalModel: new ObservablePromise(Promise.resolve(originalModel)),
            diff: observableValue('deletedCellDiff', {
                changes,
                identical: false,
                moves: [],
                quitEarly: false,
            })
        };
    }
    createDeleteCellDiffInfo(originalCellIndex) {
        const originalCell = this.originalModel.cells[originalCellIndex];
        const lines = new Array(originalCell.textBuffer.getLineCount()).fill(0).map((_, i) => originalCell.textBuffer.getLineContent(i + 1));
        const originalRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
        const modifiedRange = new Range(1, 0, 1, 0);
        const innerChanges = new RangeMapping(modifiedRange, originalRange);
        const changes = [new DetailedLineRangeMapping(new LineRange(1, lines.length), new LineRange(1, 1), [innerChanges])];
        const modifiedModelUri = this.modifiedModel.uri.with({ query: (ChatEditingModifiedNotebookEntry_1.NewModelCounter++).toString(), scheme: 'emptyCell' });
        const modifiedModel = this.modelService.getModel(modifiedModelUri) || this._register(this.modelService.createModel('', null, modifiedModelUri));
        const keep = async () => {
            this._applyEditsSync(() => this.keepPreviouslyDeletedCell(this.originalModel.cells.indexOf(originalCell)));
            this.computeStateAfterAcceptingRejectingChanges(true);
            return true;
        };
        const undo = async () => {
            this._applyEditsSync(() => this.undoPreviouslyDeletedCell(this.originalModel.cells.indexOf(originalCell), originalCell));
            this.computeStateAfterAcceptingRejectingChanges(false);
            return true;
        };
        // This will be deleted.
        return {
            type: 'delete',
            modifiedCellIndex: undefined,
            originalCellIndex,
            originalModel: new ObservablePromise(this.resolveCellModel(originalCell.uri)),
            modifiedModel: new ObservablePromise(Promise.resolve(modifiedModel)),
            keep,
            undo,
            diff: observableValue('cellDiff', {
                changes,
                identical: false,
                moves: [],
                quitEarly: false,
            })
        };
    }
    undoPreviouslyInsertedCell(cell) {
        let diffs = [];
        this._applyEditsSync(() => {
            const index = this.modifiedModel.cells.indexOf(cell);
            diffs = adjustCellDiffForRevertingAnInsertedCell(index, this._cellsDiffInfo.get(), this.modifiedModel.applyEdits.bind(this.modifiedModel));
        });
        this.disposeDeletedCellEntries();
        this.updateCellDiffInfo(diffs, undefined);
    }
    keepPreviouslyInsertedCell(cell) {
        const modifiedCellIndex = this.modifiedModel.cells.indexOf(cell);
        if (modifiedCellIndex === -1) {
            // Not possible.
            return;
        }
        const cellToInsert = {
            cellKind: cell.cellKind,
            language: cell.language,
            metadata: cell.metadata,
            outputs: cell.outputs,
            source: cell.getValue(),
            mime: cell.mime,
            internalMetadata: {
                internalId: cell.internalMetadata.internalId
            }
        };
        this.cellEntryMap.get(cell.uri)?.dispose();
        this.cellEntryMap.delete(cell.uri);
        const cellDiffs = adjustCellDiffForKeepingAnInsertedCell(modifiedCellIndex, this._cellsDiffInfo.get().slice(), cellToInsert, this.originalModel.applyEdits.bind(this.originalModel), this.createModifiedCellDiffInfo.bind(this));
        this.updateCellDiffInfo(cellDiffs, undefined);
    }
    undoPreviouslyDeletedCell(deletedOriginalIndex, originalCell) {
        const cellToInsert = {
            cellKind: originalCell.cellKind,
            language: originalCell.language,
            metadata: originalCell.metadata,
            outputs: originalCell.outputs,
            source: originalCell.getValue(),
            mime: originalCell.mime,
            internalMetadata: {
                internalId: originalCell.internalMetadata.internalId
            }
        };
        let cellDiffs = [];
        this._applyEditsSync(() => {
            cellDiffs = adjustCellDiffForRevertingADeletedCell(deletedOriginalIndex, this._cellsDiffInfo.get(), cellToInsert, this.modifiedModel.applyEdits.bind(this.modifiedModel), this.createModifiedCellDiffInfo.bind(this));
        });
        this.updateCellDiffInfo(cellDiffs, undefined);
    }
    keepPreviouslyDeletedCell(deletedOriginalIndex) {
        // Delete this cell from original as well.
        const edit = { cells: [], count: 1, editType: 1 /* CellEditType.Replace */, index: deletedOriginalIndex, };
        this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
        const diffs = sortCellChanges(this._cellsDiffInfo.get())
            .filter(d => !(d.type === 'delete' && d.originalCellIndex === deletedOriginalIndex))
            .map(diff => {
            if (diff.type !== 'insert' && diff.originalCellIndex > deletedOriginalIndex) {
                return {
                    ...diff,
                    originalCellIndex: diff.originalCellIndex - 1,
                };
            }
            return diff;
        });
        this.updateCellDiffInfo(diffs, undefined);
    }
    async _applyEdits(operation) {
        // make the actual edit
        this._isEditFromUs = true;
        try {
            await operation();
        }
        finally {
            this._isEditFromUs = false;
        }
    }
    _applyEditsSync(operation) {
        // make the actual edit
        this._isEditFromUs = true;
        try {
            operation();
        }
        finally {
            this._isEditFromUs = false;
        }
    }
    _safeCreateSnapshot(model) {
        try {
            return createSnapshot(model, this.transientOptions, this.configurationService);
        }
        catch (e) {
            this.loggingService.error('Notebook Chat', `Error creating snapshot: ${e instanceof Error ? e.message : e}`);
            return this.initialContent;
        }
    }
    getCurrentSnapshot() {
        return this._safeCreateSnapshot(this.modifiedModel);
    }
    createSnapshot(chatSessionResource, requestId, undoStop) {
        const original = this._safeCreateSnapshot(this.originalModel);
        const current = this.getCurrentSnapshot();
        return {
            resource: this.modifiedURI,
            languageId: SnapshotLanguageId,
            snapshotUri: getNotebookSnapshotFileURI(chatSessionResource, requestId, undoStop, this.modifiedURI.path, this.modifiedModel.viewType),
            original,
            current,
            state: this.state.get(),
            telemetryInfo: this.telemetryInfo,
        };
    }
    equalsSnapshot(snapshot) {
        return !!snapshot &&
            isEqual(this.modifiedURI, snapshot.resource) &&
            this.state.get() === snapshot.state &&
            new SnapshotComparer(snapshot.original).isEqual(this.originalModel) &&
            new SnapshotComparer(snapshot.current).isEqual(this.modifiedModel);
    }
    async restoreFromSnapshot(snapshot, restoreToDisk = true) {
        this.updateCellDiffInfo([], undefined);
        this._stateObs.set(snapshot.state, undefined);
        restoreSnapshot(this.originalModel, snapshot.original);
        if (restoreToDisk) {
            this.restoreSnapshotInModifiedModel(snapshot.current);
        }
        this.initializeModelsFromDiff();
    }
    async resetEditTrackerToInitialContent() {
        if (this.initialContent) {
            restoreSnapshot(this.originalModel, this.initialContent);
        }
        this.updateCellDiffInfo([], undefined);
        this.initializeModelsFromDiff();
    }
    async resetToInitialContent() {
        this.updateCellDiffInfo([], undefined);
        this.restoreSnapshotInModifiedModel(this.initialContent);
        this.initializeModelsFromDiff();
    }
    restoreModifiedModelFromSnapshot(snapshot) {
        this.restoreSnapshotInModifiedModel(snapshot);
        return this.initializeModelsFromDiff();
    }
    restoreSnapshotInModifiedModel(snapshot) {
        if (snapshot === createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService)) {
            return;
        }
        this._applyEditsSync(() => {
            // See private _setDocValue in chatEditingModifiedDocumentEntry.ts
            this.modifiedModel.pushStackElement();
            restoreSnapshot(this.modifiedModel, snapshot);
            this.modifiedModel.pushStackElement();
        });
    }
    async resolveCellModel(cellURI) {
        const cell = this.originalModel.cells.concat(this.modifiedModel.cells).find(cell => isEqual(cell.uri, cellURI));
        if (!cell) {
            throw new Error('Cell not found');
        }
        const model = this.cellTextModelMap.get(cell.uri);
        if (model) {
            this.cellTextModelMap.set(cell.uri, model);
            return model;
        }
        else {
            const textEditorModel = await thenRegisterOrDispose(this.textModelService.createModelReference(cell.uri), this._store);
            const model = textEditorModel.object.textEditorModel;
            this.cellTextModelMap.set(cell.uri, model);
            return model;
        }
    }
    getOrCreateModifiedTextFileEntryForCell(cell, modifiedCellModel, originalCellModel) {
        let cellEntry = this.cellEntryMap.get(cell.uri);
        if (cellEntry) {
            return cellEntry;
        }
        if (this._store.isDisposed) {
            return;
        }
        const disposables = new DisposableStore();
        cellEntry = this._register(this._instantiationService.createInstance(ChatEditingNotebookCellEntry, this.modifiedResourceRef.object.resource, cell, modifiedCellModel, originalCellModel, () => this._isExternalEditInProgress, disposables));
        this.cellEntryMap.set(cell.uri, cellEntry);
        disposables.add(autorun(r => {
            if (this.modifiedModel.cells.indexOf(cell) === -1) {
                return;
            }
            const diffs = this.cellsDiffInfo.read(undefined).slice();
            const index = this.modifiedModel.cells.indexOf(cell);
            let entry = diffs.find(entry => entry.modifiedCellIndex === index);
            if (!entry) {
                // Not possible.
                return;
            }
            const entryIndex = diffs.indexOf(entry);
            entry.diff.set(cellEntry.diffInfo.read(r), undefined);
            if (cellEntry.diffInfo.read(undefined).identical && entry.type === 'modified') {
                entry = {
                    ...entry,
                    type: 'unchanged',
                };
            }
            if (!cellEntry.diffInfo.read(undefined).identical && entry.type === 'unchanged') {
                entry = {
                    ...entry,
                    type: 'modified',
                };
            }
            diffs.splice(entryIndex, 1, { ...entry });
            transaction(tx => {
                this.updateCellDiffInfo(diffs, tx);
            });
        }));
        disposables.add(autorun(r => {
            if (this.modifiedModel.cells.indexOf(cell) === -1) {
                return;
            }
            const cellState = cellEntry.state.read(r);
            if (cellState === 1 /* ModifiedFileEntryState.Accepted */) {
                this.computeStateAfterAcceptingRejectingChanges(true);
            }
            else if (cellState === 2 /* ModifiedFileEntryState.Rejected */) {
                this.computeStateAfterAcceptingRejectingChanges(false);
            }
        }));
        return cellEntry;
    }
    async computeEditsFromSnapshots(beforeSnapshot, afterSnapshot) {
        // For notebooks, we restore the snapshot and compute the cell-level edits
        // This is a simplified approach that replaces cells as needed
        const beforeData = deserializeSnapshot(beforeSnapshot);
        const afterData = deserializeSnapshot(afterSnapshot);
        const edits = [];
        // Simple approach: replace all cells
        // A more sophisticated approach would diff individual cells
        if (beforeData.data.cells.length > 0) {
            edits.push({
                editType: 1 /* CellEditType.Replace */,
                index: 0,
                count: beforeData.data.cells.length,
                cells: afterData.data.cells
            });
        }
        else if (afterData.data.cells.length > 0) {
            edits.push({
                editType: 1 /* CellEditType.Replace */,
                index: 0,
                count: 0,
                cells: afterData.data.cells
            });
        }
        return edits;
    }
    async save() {
        if (this.modifiedModel.uri.scheme === Schemas.untitled) {
            return;
        }
        // Save the notebook if dirty
        if (this.notebookResolver.isDirty(this.modifiedModel.uri)) {
            await this.modifiedResourceRef.object.save({
                reason: 1 /* SaveReason.EXPLICIT */,
                skipSaveParticipants: true
            });
        }
    }
    async revertToDisk() {
        if (this.modifiedModel.uri.scheme === Schemas.untitled) {
            return;
        }
        // Revert to reload from disk
        await this.modifiedResourceRef.object.revert({ soft: false });
    }
};
ChatEditingModifiedNotebookEntry = ChatEditingModifiedNotebookEntry_1 = __decorate([
    __param(7, IConfigurationService),
    __param(8, IFilesConfigurationService),
    __param(9, IChatService),
    __param(10, IFileService),
    __param(11, IInstantiationService),
    __param(12, ITextModelService),
    __param(13, IModelService),
    __param(14, IUndoRedoService),
    __param(15, INotebookEditorWorkerService),
    __param(16, INotebookLoggingService),
    __param(17, INotebookEditorModelResolverService),
    __param(18, IAiEditTelemetryService)
], ChatEditingModifiedNotebookEntry);
export { ChatEditingModifiedNotebookEntry };
function generateCellHash(cellUri) {
    const hash = new StringSHA1();
    hash.update(cellUri.toString());
    return hash.digest().substring(0, 8);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdNb2RpZmllZE5vdGVib29rRW50cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBYyxxQkFBcUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQTZCLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMvSSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFB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