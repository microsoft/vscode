/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { DisposableStore, IReference, thenRegisterOrDispose } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ITransaction, IObservable, observableValue, autorun, transaction, ObservablePromise } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { Location, TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoElement, IUndoRedoService, UndoRedoElementType } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane, SaveReason } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookTextDiffEditor } from '../../../notebook/browser/diff/notebookDiffEditor.js';
import { INotebookTextDiffEditor } from '../../../notebook/browser/diff/notebookDiffEditorBrowser.js';
import { CellDiffInfo } from '../../../notebook/browser/diff/notebookDiffViewModel.js';
import { getNotebookEditorFromEditorPane } from '../../../notebook/browser/notebookBrowser.js';
import { NotebookCellTextModel } from '../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, ICellDto2, ICellEditOperation, ICellReplaceEdit, IResolvedNotebookEditorModel, NotebookCellsChangeType, NotebookSetting, NotebookTextModelChangedEvent, TransientOptions } from '../../../notebook/common/notebookCommon.js';
import { computeDiff } from '../../../notebook/common/notebookDiff.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookLoggingService } from '../../../notebook/common/notebookLoggingService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { INotebookEditorWorkerService } from '../../../notebook/common/services/notebookWorkerService.js';
import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedFileEntryEditorIntegration, ISnapshotEntry, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { AbstractChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { createSnapshot, deserializeSnapshot, getNotebookSnapshotFileURI, restoreSnapshot, SnapshotComparer } from './notebook/chatEditingModifiedNotebookSnapshot.js';
import { ChatEditingNewNotebookContentEdits } from './notebook/chatEditingNewNotebookContentEdits.js';
import { ChatEditingNotebookCellEntry } from './notebook/chatEditingNotebookCellEntry.js';
import { ChatEditingNotebookDiffEditorIntegration, ChatEditingNotebookEditorIntegration } from './notebook/chatEditingNotebookEditorIntegration.js';
import { ChatEditingNotebookFileSystemProvider } from './notebook/chatEditingNotebookFileSystemProvider.js';
import { adjustCellDiffAndOriginalModelBasedOnCellAddDelete, adjustCellDiffAndOriginalModelBasedOnCellMovements, adjustCellDiffForKeepingAnInsertedCell, adjustCellDiffForRevertingADeletedCell, adjustCellDiffForRevertingAnInsertedCell, calculateNotebookRewriteRatio, getCorrespondingOriginalCellIndex, isTransientIPyNbExtensionEvent } from './notebook/helpers.js';
import { countChanges, ICellDiffInfo, sortCellChanges } from './notebook/notebookCellChanges.js';
import { IAiEditTelemetryService } from '../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';


const SnapshotLanguageId = 'VSCodeChatNotebookSnapshotLanguage';

export class ChatEditingModifiedNotebookEntry extends AbstractChatEditingModifiedFileEntry {
	static NewModelCounter: number = 0;
	private readonly modifiedModel: NotebookTextModel;
	private readonly originalModel: NotebookTextModel;
	override originalURI: URI;
	/**
	 * JSON stringified version of the original notebook.
	 */
	override initialContent: string;
	/**
	 * Whether we're still generating diffs from a response.
	 */
	private _isProcessingResponse = observableValue<boolean>('isProcessingResponse', false);
	get isProcessingResponse(): IObservable<boolean> {
		return this._isProcessingResponse;
	}
	private _isEditFromUs: boolean = false;
	/**
	 * Whether all edits are from us, e.g. is possible a user has made edits, then this will be false.
	 */
	private _allEditsAreFromUs: boolean = true;
	private readonly _changesCount = observableValue<number>(this, 0);
	override changesCount: IObservable<number> = this._changesCount;

	private readonly cellEntryMap = new ResourceMap<ChatEditingNotebookCellEntry>();
	private modifiedToOriginalCell = new ResourceMap<URI>();
	private readonly _cellsDiffInfo = observableValue<ICellDiffInfo[]>('diffInfo', []);

	get cellsDiffInfo(): IObservable<ICellDiffInfo[]> {
		return this._cellsDiffInfo;
	}

	get viewType() {
		return this.modifiedModel.viewType;
	}

	/**
	 * List of Cell URIs that are edited,
	 * Will be cleared once all edits have been accepted.
	 * I.e. this will only contain URIS while acceptAgentEdits is being called & before `isLastEdit` is sent.
	 * I.e. this is populated only when edits are being streamed.
	 */
	private readonly editedCells = new ResourceSet();

	public static async create(uri: URI, _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void }, telemetryInfo: IModifiedEntryTelemetryInfo, chatKind: ChatEditKind, initialContent: string | undefined, instantiationService: IInstantiationService): Promise<AbstractChatEditingModifiedFileEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const resolver = accessor.get(INotebookEditorModelResolverService);
			const configurationServie = accessor.get(IConfigurationService);
			const resourceRef: IReference<IResolvedNotebookEditorModel> = await resolver.resolve(uri);
			const notebook = resourceRef.object.notebook;
			const originalUri = getNotebookSnapshotFileURI(telemetryInfo.sessionId, telemetryInfo.requestId, generateUuid(), notebook.uri.scheme === Schemas.untitled ? `/${notebook.uri.path}` : notebook.uri.path, notebook.viewType);
			const [options, buffer] = await Promise.all([
				notebookService.withNotebookDataProvider(resourceRef.object.notebook.notebookType),
				notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then(s => streamToBuffer(s))
			]);
			const disposables = new DisposableStore();
			// Register so that we can load this from file system.
			disposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));
			const originalRef = await resolver.resolve(originalUri, notebook.viewType);
			if (initialContent !== undefined) {
				try {
					restoreSnapshot(originalRef.object.notebook, initialContent);
				} catch (ex) {
					console.error(`Error restoring snapshot: ${initialContent}`, ex);
					initialContent = createSnapshot(notebook, options.serializer.options, configurationServie);
				}
			} else {
				initialContent = createSnapshot(notebook, options.serializer.options, configurationServie);
				// Both models are the same, ensure the cell ids are the same, this way we get a perfect diffing.
				// No need to generate edits for this.
				// We want to ensure they are identitcal, possible original notebook was open and got modified.
				// Or something gets changed between serialization & deserialization of the snapshot into the original.
				// E.g. in jupyter notebooks the metadata contains transient data that gets updated after deserialization.
				restoreSnapshot(originalRef.object.notebook, initialContent);
				const edits: ICellEditOperation[] = [];
				notebook.cells.forEach((cell, index) => {
					const internalId = generateCellHash(cell.uri);
					edits.push({ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } });
				});
				resourceRef.object.notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
				originalRef.object.notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
			}
			const instance = instantiationService.createInstance(ChatEditingModifiedNotebookEntry, resourceRef, originalRef, _multiDiffEntryDelegate, options.serializer.options, telemetryInfo, chatKind, initialContent);
			instance._register(disposables);
			return instance;
		});
	}

	public static canHandleSnapshotContent(initialContent: string | undefined): boolean {
		if (!initialContent) {
			return false;
		}

		try {
			deserializeSnapshot(initialContent);
			return true;
		} catch (ex) {
			// not a valid snapshot
			return false;
		}
	}

	public static canHandleSnapshot(snapshot: ISnapshotEntry): boolean {
		if (snapshot.languageId === SnapshotLanguageId && ChatEditingModifiedNotebookEntry.canHandleSnapshotContent(snapshot.current)) {
			return true;
		}
		return false;
	}

	private readonly initialContentComparer: SnapshotComparer;

	constructor(
		private readonly modifiedResourceRef: IReference<IResolvedNotebookEditorModel>,
		originalResourceRef: IReference<IResolvedNotebookEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private readonly transientOptions: TransientOptions | undefined,
		telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService chatService: IChatService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IUndoRedoService undoRedoService: IUndoRedoService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookLoggingService private readonly loggingService: INotebookLoggingService,
		@INotebookEditorModelResolverService private readonly notebookResolver: INotebookEditorModelResolverService,
		@IAiEditTelemetryService aiEditTelemetryService: IAiEditTelemetryService,
	) {
		super(modifiedResourceRef.object.notebook.uri, telemetryInfo, kind, configurationService, fileConfigService, chatService, fileService, undoRedoService, instantiationService, aiEditTelemetryService);
		this.initialContentComparer = new SnapshotComparer(initialContent);
		this.modifiedModel = this._register(modifiedResourceRef).object.notebook;
		this.originalModel = this._register(originalResourceRef).object.notebook;
		this.originalURI = this.originalModel.uri;
		this.initialContent = initialContent;
		this.initializeModelsFromDiff();
		this._register(this.modifiedModel.onDidChangeContent(this.mirrorNotebookEdits, this));
	}

	public override hasModificationAt(location: Location): boolean {
		return this.cellEntryMap.get(location.uri)?.hasModificationAt(location.range) ?? false;
	}

	initializeModelsFromDiffImpl(cellsDiffInfo: CellDiffInfo[]) {
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

	getIndexOfCellHandle(handle: number) {
		return this.modifiedModel.cells.findIndex(c => c.handle === handle);
	}

	private computeRequestId: number = 0;
	async initializeModelsFromDiff() {
		const id = ++this.computeRequestId;
		if (this._areOriginalAndModifiedIdenticalImpl()) {
			const cellsDiffInfo: CellDiffInfo[] = this.modifiedModel.cells.map((_, index) => {
				return { type: 'unchanged', originalCellIndex: index, modifiedCellIndex: index } satisfies CellDiffInfo;
			});
			this.initializeModelsFromDiffImpl(cellsDiffInfo);
			return;
		}
		const cellsDiffInfo: CellDiffInfo[] = [];
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
		} catch (ex) {
			this.loggingService.error('Notebook Chat', 'Error computing diff:\n' + ex);
		} finally {
			this._isProcessingResponse.set(false, undefined);
		}
		this.initializeModelsFromDiffImpl(cellsDiffInfo);
	}
	updateCellDiffInfo(cellsDiffInfo: ICellDiffInfo[], transcation: ITransaction | undefined) {
		this._cellsDiffInfo.set(sortCellChanges(cellsDiffInfo), transcation);
		this._changesCount.set(countChanges(cellsDiffInfo), transcation);
	}

	mirrorNotebookEdits(e: NotebookTextModelChangedEvent) {
		if (this._isEditFromUs || this._isExternalEditInProgress || Array.from(this.cellEntryMap.values()).some(entry => entry.isEditFromUs)) {
			return;
		}

		// Possible user reverted the changes from SCM or the like.
		// Or user just reverted the changes made via edits (e.g. edit made a change in a cell and user undid that change either by typing over or other).
		// Computing snapshot is too slow, as this event gets triggered for every key stroke in a cell,
		// const didResetToOriginalContent = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService) === this.initialContent;
		let didResetToOriginalContent = this.initialContentComparer.isEqual(this.modifiedModel);
		const currentState = this._stateObs.get();
		if (currentState === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
			this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
			this.updateCellDiffInfo([], undefined);
			this.initializeModelsFromDiff();
			this._notifySessionAction('rejected');
			return;
		}

		if (!e.rawEvents.length) {
			return;
		}

		if (currentState === ModifiedFileEntryState.Rejected) {
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
					const edit: ICellEditOperation = {
						editType: CellEditType.DocumentMetadata,
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
								const edits: ICellEditOperation[] = [{ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } }];
								this.modifiedModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
								cell.internalMetadata ??= {};
								cell.internalMetadata.internalId = internalId;
							});
						});
					});
					event.changes.forEach(change => {
						cellDiffs = adjustCellDiffAndOriginalModelBasedOnCellAddDelete(change,
							cellDiffs,
							this.modifiedModel.cells.length,
							this.originalModel.cells.length,
							this.originalModel.applyEdits.bind(this.originalModel),
							this.createModifiedCellDiffInfo.bind(this));
					});
					this.updateCellDiffInfo(cellDiffs, undefined);
					this.disposeDeletedCellEntries();
					break;
				}
				case NotebookCellsChangeType.ChangeCellLanguage: {
					const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
					if (typeof index === 'number') {
						const edit: ICellEditOperation = {
							editType: CellEditType.CellLanguage,
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
						const edit: ICellEditOperation = {
							editType: CellEditType.Metadata,
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
						const edit: ICellEditOperation = {
							editType: CellEditType.PartialInternalMetadata,
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
						const edit: ICellEditOperation = {
							editType: CellEditType.Output,
							index,
							append: event.append,
							outputs: event.outputs
						};
						this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
					}
					break;
				}
				case NotebookCellsChangeType.OutputItem: {
					const index = getCorrespondingOriginalCellIndex(event.index, this._cellsDiffInfo.get());
					if (typeof index === 'number') {
						const edit: ICellEditOperation = {
							editType: CellEditType.OutputItems,
							outputId: event.outputId,
							append: event.append,
							items: event.outputItems
						};
						this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
					}
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
		if (currentState === ModifiedFileEntryState.Modified && didResetToOriginalContent) {
			this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
			this.updateCellDiffInfo([], undefined);
			this.initializeModelsFromDiff();
			return;
		}
	}

	protected override async _doAccept(): Promise<void> {
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
						reason: SaveReason.EXPLICIT,
						force: true,
					});
				} catch {
					// ignored
				}
			});
		}
	}

	protected override async _doReject(): Promise<void> {
		this.updateCellDiffInfo([], undefined);
		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			await this._applyEdits(async () => {
				await this.modifiedResourceRef.object.revert({ soft: true });
				await this._fileService.del(this.modifiedURI);
			});
			this._onDidDelete.fire();
		} else {
			await this._applyEdits(async () => {
				const snapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
				this.restoreSnapshotInModifiedModel(snapshot);
				if (this._allEditsAreFromUs && Array.from(this.cellEntryMap.values()).every(entry => entry.allEditsAreFromUs)) {
					// save the file after discarding so that the dirty indicator goes away
					// and so that an intermediate saved state gets reverted
					await this.modifiedResourceRef.object.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
				}
			});
			this.initializeModelsFromDiff();
			await this._collapse(undefined);
		}
	}

	private async _collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	protected override _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		const notebookEditor = getNotebookEditorFromEditorPane(editor);
		if (!notebookEditor && editor.getId() === NotebookTextDiffEditor.ID) {
			const diffEditor = (editor.getControl() as INotebookTextDiffEditor);
			return this._instantiationService.createInstance(ChatEditingNotebookDiffEditorIntegration, diffEditor, this._cellsDiffInfo);
		}
		assertType(notebookEditor);
		return this._instantiationService.createInstance(ChatEditingNotebookEditorIntegration, this, editor, this.modifiedModel, this.originalModel, this._cellsDiffInfo);
	}

	protected override _resetEditsState(tx: ITransaction): void {
		super._resetEditsState(tx);
		this.cellEntryMap.forEach(entry => !entry.isDisposed && entry.clearCurrentEditLineDecoration());
	}

	protected override _createUndoRedoElement(response: IChatResponseModel): IUndoRedoElement | undefined {
		const request = response.session.getRequests().find(req => req.id === response.requestId);
		const label = request?.message.text ? localize('chatNotebookEdit1', "Chat Edit: '{0}'", request.message.text) : localize('chatNotebookEdit2', "Chat Edit");
		const transientOptions = this.transientOptions;
		const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;

		// create a snapshot of the current state of the model, before the next set of edits
		let initial = createSnapshot(this.modifiedModel, transientOptions, outputSizeLimit);
		let last = '';
		let redoState = ModifiedFileEntryState.Rejected;

		return {
			type: UndoRedoElementType.Resource,
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
				} finally {
					this._isEditFromUs = false;
				}
				redoState = this._stateObs.get() === ModifiedFileEntryState.Accepted ? ModifiedFileEntryState.Accepted : ModifiedFileEntryState.Rejected;
				this._stateObs.set(ModifiedFileEntryState.Rejected, undefined);
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
				} finally {
					this._isEditFromUs = false;
				}
				this._stateObs.set(redoState, undefined);
				this.updateCellDiffInfo([], undefined);
				this.initializeModelsFromDiff();
				this._notifySessionAction('userModified');
			}
		};
	}

	protected override async _areOriginalAndModifiedIdentical(): Promise<boolean> {
		return this._areOriginalAndModifiedIdenticalImpl();
	}

	private _areOriginalAndModifiedIdenticalImpl(): boolean {
		const snapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
		return new SnapshotComparer(snapshot).isEqual(this.modifiedModel);
	}

	private newNotebookEditGenerator?: ChatEditingNewNotebookContentEdits;
	override async acceptAgentEdits(resource: URI, edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel | undefined): Promise<void> {
		const isCellUri = resource.scheme === Schemas.vscodeNotebookCell;
		const cell = isCellUri && this.modifiedModel.cells.find(cell => isEqual(cell.uri, resource));
		let cellEntry: ChatEditingNotebookCellEntry | undefined;
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
					} else {
						// If we get cell edits, its impossible to get text edits for the notebook uri.
						this.newNotebookEditGenerator = undefined;
						if (!this.editedCells.has(resource)) {
							await finishPreviousCells();
							this.editedCells.add(resource);
						}
						await cellEntry?.acceptAgentEdits([edit], last, responseModel);
					}
				} else {
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
			this._stateObs.set(ModifiedFileEntryState.Modified, tx);
			if (!isLastEdits) {
				const newRewriteRation = Math.max(this._rewriteRatioObs.get(), calculateNotebookRewriteRatio(this._cellsDiffInfo.get(), this.originalModel, this.modifiedModel));
				this._rewriteRatioObs.set(Math.min(1, newRewriteRation), tx);
			} else {
				this.editedCells.clear();
				this._resetEditsState(tx);
				this._rewriteRatioObs.set(1, tx);
			}
		});
	}

	private disposeDeletedCellEntries() {
		const cellsUris = new ResourceSet(this.modifiedModel.cells.map(cell => cell.uri));
		Array.from(this.cellEntryMap.keys()).forEach(uri => {
			if (cellsUris.has(uri)) {
				return;
			}
			this.cellEntryMap.get(uri)?.dispose();
			this.cellEntryMap.delete(uri);
		});
	}

	acceptNotebookEdit(edit: ICellEditOperation): void {
		// make the actual edit
		this.modifiedModel.applyEdits([edit], true, undefined, () => undefined, undefined, false);
		this.disposeDeletedCellEntries();


		if (edit.editType !== CellEditType.Replace) {
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
			const edits: ICellEditOperation[] = [{ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } }];
			this.modifiedModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
		});

		let diff: ICellDiffInfo[] = [];
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
		} else {
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

	private computeStateAfterAcceptingRejectingChanges(accepted: boolean) {
		const currentSnapshot = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
		if (new SnapshotComparer(currentSnapshot).isEqual(this.originalModel)) {
			const state = accepted ? ModifiedFileEntryState.Accepted : ModifiedFileEntryState.Rejected;
			this._stateObs.set(state, undefined);
			this._notifySessionAction(accepted ? 'accepted' : 'rejected');
		}
	}

	createModifiedCellDiffInfo(modifiedCellIndex: number, originalCellIndex: number): ICellDiffInfo {
		const modifiedCell = this.modifiedModel.cells[modifiedCellIndex];
		const originalCell = this.originalModel.cells[originalCellIndex];
		this.modifiedToOriginalCell.set(modifiedCell.uri, originalCell.uri);
		const modifiedCellModelPromise = this.resolveCellModel(modifiedCell.uri);
		const originalCellModelPromise = this.resolveCellModel(originalCell.uri);

		Promise.all([modifiedCellModelPromise, originalCellModelPromise]).then(([modifiedCellModel, originalCellModel]) => {
			this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
		});

		const diff = observableValue('diff', nullDocumentDiff);
		const unchangedCell: ICellDiffInfo = {
			type: 'unchanged',
			modifiedCellIndex,
			originalCellIndex,
			keep: async (changes: DetailedLineRangeMapping) => {
				const [modifiedCellModel, originalCellModel] = await Promise.all([modifiedCellModelPromise, originalCellModelPromise]);
				const entry = this.getOrCreateModifiedTextFileEntryForCell(modifiedCell, modifiedCellModel, originalCellModel);
				return entry ? entry.keep(changes) : false;
			},
			undo: async (changes: DetailedLineRangeMapping) => {
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
	createInsertedCellDiffInfo(modifiedCellIndex: number): ICellDiffInfo {
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
		const originalModelUri = this.modifiedModel.uri.with({ query: (ChatEditingModifiedNotebookEntry.NewModelCounter++).toString(), scheme: 'emptyCell' });
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
			type: 'insert' as const,
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
		} satisfies ICellDiffInfo;
	}
	createDeleteCellDiffInfo(originalCellIndex: number): ICellDiffInfo {
		const originalCell = this.originalModel.cells[originalCellIndex];
		const lines = new Array(originalCell.textBuffer.getLineCount()).fill(0).map((_, i) => originalCell.textBuffer.getLineContent(i + 1));
		const originalRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
		const modifiedRange = new Range(1, 0, 1, 0);
		const innerChanges = new RangeMapping(modifiedRange, originalRange);
		const changes = [new DetailedLineRangeMapping(new LineRange(1, lines.length), new LineRange(1, 1), [innerChanges])];
		const modifiedModelUri = this.modifiedModel.uri.with({ query: (ChatEditingModifiedNotebookEntry.NewModelCounter++).toString(), scheme: 'emptyCell' });
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
			type: 'delete' as const,
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
		} satisfies ICellDiffInfo;
	}

	private undoPreviouslyInsertedCell(cell: NotebookCellTextModel) {
		let diffs: ICellDiffInfo[] = [];
		this._applyEditsSync(() => {
			const index = this.modifiedModel.cells.indexOf(cell);
			diffs = adjustCellDiffForRevertingAnInsertedCell(index,
				this._cellsDiffInfo.get(),
				this.modifiedModel.applyEdits.bind(this.modifiedModel));
		});
		this.disposeDeletedCellEntries();
		this.updateCellDiffInfo(diffs, undefined);
	}

	private keepPreviouslyInsertedCell(cell: NotebookCellTextModel) {
		const modifiedCellIndex = this.modifiedModel.cells.indexOf(cell);
		if (modifiedCellIndex === -1) {
			// Not possible.
			return;
		}
		const cellToInsert: ICellDto2 = {
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
		const cellDiffs = adjustCellDiffForKeepingAnInsertedCell(
			modifiedCellIndex,
			this._cellsDiffInfo.get().slice(),
			cellToInsert,
			this.originalModel.applyEdits.bind(this.originalModel),
			this.createModifiedCellDiffInfo.bind(this)
		);
		this.updateCellDiffInfo(cellDiffs, undefined);
	}

	private undoPreviouslyDeletedCell(deletedOriginalIndex: number, originalCell: NotebookCellTextModel) {
		const cellToInsert: ICellDto2 = {
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
		let cellDiffs: ICellDiffInfo[] = [];
		this._applyEditsSync(() => {
			cellDiffs = adjustCellDiffForRevertingADeletedCell(
				deletedOriginalIndex,
				this._cellsDiffInfo.get(),
				cellToInsert,
				this.modifiedModel.applyEdits.bind(this.modifiedModel),
				this.createModifiedCellDiffInfo.bind(this)
			);
		});
		this.updateCellDiffInfo(cellDiffs, undefined);
	}


	private keepPreviouslyDeletedCell(deletedOriginalIndex: number) {
		// Delete this cell from original as well.
		const edit: ICellReplaceEdit = { cells: [], count: 1, editType: CellEditType.Replace, index: deletedOriginalIndex, };
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

	private async _applyEdits(operation: () => Promise<void>) {
		// make the actual edit
		this._isEditFromUs = true;
		try {
			await operation();
		} finally {
			this._isEditFromUs = false;
		}
	}

	private _applyEditsSync(operation: () => void) {
		// make the actual edit
		this._isEditFromUs = true;
		try {
			operation();
		} finally {
			this._isEditFromUs = false;
		}
	}

	public getCurrentSnapshot() {
		return createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
	}

	override createSnapshot(sessionId: string, requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		return {
			resource: this.modifiedURI,
			languageId: SnapshotLanguageId,
			snapshotUri: getNotebookSnapshotFileURI(sessionId, requestId, undoStop, this.modifiedURI.path, this.modifiedModel.viewType),
			original: createSnapshot(this.originalModel, this.transientOptions, this.configurationService),
			current: createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService),
			state: this.state.get(),
			telemetryInfo: this.telemetryInfo,
		};
	}

	override equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		return !!snapshot &&
			isEqual(this.modifiedURI, snapshot.resource) &&
			this.state.get() === snapshot.state &&
			new SnapshotComparer(snapshot.original).isEqual(this.originalModel) &&
			new SnapshotComparer(snapshot.current).isEqual(this.modifiedModel);

	}

	override async restoreFromSnapshot(snapshot: ISnapshotEntry, restoreToDisk = true): Promise<void> {
		this.updateCellDiffInfo([], undefined);
		this._stateObs.set(snapshot.state, undefined);
		restoreSnapshot(this.originalModel, snapshot.original);
		if (restoreToDisk) {
			this.restoreSnapshotInModifiedModel(snapshot.current);
		}
		this.initializeModelsFromDiff();
	}

	override async resetToInitialContent(): Promise<void> {
		this.updateCellDiffInfo([], undefined);
		this.restoreSnapshotInModifiedModel(this.initialContent);
		this.initializeModelsFromDiff();
	}

	public restoreModifiedModelFromSnapshot(snapshot: string) {
		this.restoreSnapshotInModifiedModel(snapshot);
		return this.initializeModelsFromDiff();
	}

	private restoreSnapshotInModifiedModel(snapshot: string) {
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

	private readonly cellTextModelMap = new ResourceMap<ITextModel>();

	private async resolveCellModel(cellURI: URI): Promise<ITextModel> {
		const cell = this.originalModel.cells.concat(this.modifiedModel.cells).find(cell => isEqual(cell.uri, cellURI));
		if (!cell) {
			throw new Error('Cell not found');
		}
		const model = this.cellTextModelMap.get(cell.uri);
		if (model) {
			this.cellTextModelMap.set(cell.uri, model);
			return model;
		} else {
			const textEditorModel = await thenRegisterOrDispose(this.textModelService.createModelReference(cell.uri), this._store);
			const model = textEditorModel.object.textEditorModel;
			this.cellTextModelMap.set(cell.uri, model);
			return model;
		}
	}

	getOrCreateModifiedTextFileEntryForCell(cell: NotebookCellTextModel, modifiedCellModel: ITextModel, originalCellModel: ITextModel): ChatEditingNotebookCellEntry | undefined {
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
			if (cellState === ModifiedFileEntryState.Accepted) {
				this.computeStateAfterAcceptingRejectingChanges(true);
			} else if (cellState === ModifiedFileEntryState.Rejected) {
				this.computeStateAfterAcceptingRejectingChanges(false);
			}
		}));

		return cellEntry;
	}

	async computeEditsFromSnapshots(beforeSnapshot: string, afterSnapshot: string): Promise<(TextEdit | ICellEditOperation)[]> {
		// For notebooks, we restore the snapshot and compute the cell-level edits
		// This is a simplified approach that replaces cells as needed

		const beforeData = deserializeSnapshot(beforeSnapshot);
		const afterData = deserializeSnapshot(afterSnapshot);

		const edits: ICellEditOperation[] = [];

		// Simple approach: replace all cells
		// A more sophisticated approach would diff individual cells
		if (beforeData.data.cells.length > 0) {
			edits.push({
				editType: CellEditType.Replace,
				index: 0,
				count: beforeData.data.cells.length,
				cells: afterData.data.cells
			});
		} else if (afterData.data.cells.length > 0) {
			edits.push({
				editType: CellEditType.Replace,
				index: 0,
				count: 0,
				cells: afterData.data.cells
			});
		}

		return edits;
	}

	async save(): Promise<void> {
		if (this.modifiedModel.uri.scheme === Schemas.untitled) {
			return;
		}

		// Save the notebook if dirty
		if (this.notebookResolver.isDirty(this.modifiedModel.uri)) {
			await this.modifiedResourceRef.object.save({
				reason: SaveReason.EXPLICIT,
				skipSaveParticipants: true
			});
		}
	}

	async revertToDisk(): Promise<void> {
		if (this.modifiedModel.uri.scheme === Schemas.untitled) {
			return;
		}

		// Revert to reload from disk
		await this.modifiedResourceRef.object.revert({ soft: false });
	}
}


function generateCellHash(cellUri: URI) {
	const hash = new StringSHA1();
	hash.update(cellUri.toString());
	return hash.digest().substring(0, 8);
}
