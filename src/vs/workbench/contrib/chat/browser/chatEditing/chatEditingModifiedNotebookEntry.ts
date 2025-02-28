/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { streamToBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ITransaction, IObservable, observableValue, autorun, transaction } from '../../../../../base/common/observable.js';
import { ObservableDisposable } from '../../../../../base/common/observableDisposable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { LineRange } from '../../../../../editor/common/core/lineRange.js';
import { OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { OffsetEdits } from '../../../../../editor/common/model/textModelOffsetEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane, SaveReason } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookTextDiffEditor } from '../../../notebook/browser/diff/notebookDiffEditor.js';
import { INotebookTextDiffEditor } from '../../../notebook/browser/diff/notebookDiffEditorBrowser.js';
import { CellDiffInfo, computeDiff } from '../../../notebook/browser/diff/notebookDiffViewModel.js';
import { CellEditState, getNotebookEditorFromEditorPane } from '../../../notebook/browser/notebookBrowser.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { NotebookCellTextModel } from '../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, ICellDto2, ICellEditOperation, ICellReplaceEdit, IResolvedNotebookEditorModel, NotebookSetting, NotebookTextModelChangedEvent, TransientOptions } from '../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookLoggingService } from '../../../notebook/common/notebookLoggingService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { INotebookEditorWorkerService } from '../../../notebook/common/services/notebookWorkerService.js';
import { ChatEditKind, IEditSessionEntryDiff, IModifiedFileEntryEditorIntegration, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { AbstractChatEditingModifiedFileEntry, IModifiedEntryTelemetryInfo, ISnapshotEntry, pendingRewriteMinimap } from './chatEditingModifiedFileEntry.js';
import { createSnapshot, deserializeSnapshot, getNotebookSnapshotFileURI, restoreSnapshot } from './chatEditingModifiedNotebookSnapshot.js';
import { ChatEditingNotebookDiffEditorIntegration, ChatEditingNotebookEditorIntegration, countChanges, ICellDiffInfo, sortCellChanges } from './chatEditingNotebookEditorIntegration.js';
import { ChatEditingNotebookFileSystemProvider } from './chatEditingNotebookFileSystemProvider.js';


const noopKeep = () => Promise.resolve(true);
const noopUndo = () => Promise.resolve(true);
const SnapshotLanguageId = 'VSCodeChatNotebookSnapshotLanguage';

export class ChatEditingModifiedNotebookDiff {
	static NewModelCounter: number = 0;
	constructor(
		private readonly original: ISnapshotEntry,
		private readonly modified: ISnapshotEntry,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookLoggingService private readonly notebookLoggingService: INotebookLoggingService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelService: INotebookEditorModelResolverService,
	) {

	}

	async computeDiff(): Promise<IEditSessionEntryDiff> {

		let added = 0;
		let removed = 0;

		const disposables = new DisposableStore();
		try {
			const [modifiedRef, originalRef] = await Promise.all([
				this.notebookEditorModelService.resolve(this.modified.snapshotUri),
				this.notebookEditorModelService.resolve(this.original.snapshotUri)
			]);
			disposables.add(modifiedRef);
			disposables.add(originalRef);
			const notebookDiff = await this.notebookEditorWorkerService.computeDiff(this.original.snapshotUri, this.modified.snapshotUri);
			const result = computeDiff(originalRef.object.notebook, modifiedRef.object.notebook, notebookDiff);
			result.cellDiffInfo.forEach(diff => {
				switch (diff.type) {
					case 'modified':
					case 'insert':
						added++;
						break;
					case 'delete':
						removed++;
						break;
					default:
						break;
				}
			});
		} catch (e) {
			this.notebookLoggingService.error('Notebook Chat', 'Error computing diff:\n' + e);
		} finally {
			disposables.dispose();
		}

		return {
			added,
			removed,
			identical: added === 0 && removed === 0,
			quitEarly: false,
			modifiedURI: this.modified.snapshotUri,
			originalURI: this.original.snapshotUri,
		};
	}
}

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
	 * Whether we're in the process of applying edits.
	 */
	private _isEditFromUs: boolean = false;
	/**
	 * Whether all edits are from us, e.g. is possible a user has made edits, then this will be false.
	 */
	private _allEditsAreFromUs: boolean = true;
	private readonly _changesCount = observableValue<number>(this, 0);
	override changesCount: IObservable<number> = this._changesCount;

	private readonly cellEntryMap = new Map<NotebookCellTextModel, ChatEditingNotebookCellEntry>();
	private readonly _entries = observableValue<ChatEditingNotebookCellEntry[]>('cellEntries', []);
	private modifiedToOriginalCellMap = new ResourceMap<ITextModel>();
	private readonly _cellDiffInfo = observableValue<ICellDiffInfo[]>('diffInfo', []);
	private readonly _maxModifiedLineNumbers = observableValue<number[]>('changedMaxLineNumber', []);

	get cellDiffInfo(): IObservable<ICellDiffInfo[]> {
		return this._cellDiffInfo;
	}

	/**
	 * List of Cell URIs that are edited,
	 * Will be cleared once all edits have been accepted.
	 * I.e. this will only contain URIS will acceptAgentEdits are being called before `isLastEdit` is sent.
	 */
	private readonly editedCells = new ResourceSet();

	public static async create(uri: URI, _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void }, telemetryInfo: IModifiedEntryTelemetryInfo, chatKind: ChatEditKind, initialContent: string | undefined, instantiationService: IInstantiationService): Promise<AbstractChatEditingModifiedFileEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const resolver = accessor.get(INotebookEditorModelResolverService);
			const configurationServie = accessor.get(IConfigurationService);
			const textModelService = accessor.get(ITextModelService);
			const notebookEditorWorkerService = accessor.get(INotebookEditorWorkerService);
			const loggingService = accessor.get(INotebookLoggingService);
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
			const modifiedCells = new ResourceMap<ITextModel>();
			const originalCells = new ResourceMap<ITextModel>();
			await Promise.all(resourceRef.object.notebook.cells.map(async cell => {
				modifiedCells.set(cell.uri, disposables.add(await textModelService.createModelReference(cell.uri)).object.textEditorModel);
			}).concat(originalRef.object.notebook.cells.map(async cell => {
				originalCells.set(cell.uri, disposables.add(await textModelService.createModelReference(cell.uri)).object.textEditorModel);
			})));
			const cellDiffInfo: CellDiffInfo[] = [];
			if (initialContent) {
				restoreSnapshot(originalRef.object.notebook, initialContent);
				try {
					const notebookDiff = await notebookEditorWorkerService.computeDiff(originalRef.object.resource, resourceRef.object.resource);
					const result = computeDiff(originalRef.object.notebook, resourceRef.object.notebook, notebookDiff);
					if (result.cellDiffInfo.length) {
						cellDiffInfo.push(...result.cellDiffInfo);
					}
				} catch (ex) {
					loggingService.error('Notebook Chat', 'Error computing diff:\n' + ex);
				}
			} else {
				originalRef.object.notebook.cells.forEach((_, index) => {
					cellDiffInfo.push({ type: 'unchanged', originalCellIndex: index, modifiedCellIndex: index });
				});
			}
			initialContent = initialContent || createSnapshot(originalRef.object.notebook, options.serializer.options, configurationServie);
			const instance = instantiationService.createInstance(ChatEditingModifiedNotebookEntry, resourceRef, originalRef, modifiedCells, originalCells, _multiDiffEntryDelegate, options.serializer.options, telemetryInfo, chatKind, initialContent, cellDiffInfo);
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

	constructor(
		private readonly modifiedResourceRef: IReference<IResolvedNotebookEditorModel>,
		originalResourceRef: IReference<IResolvedNotebookEditorModel>,
		private readonly modifiedCellModels: ResourceMap<ITextModel>,
		private readonly originalCellModels: ResourceMap<ITextModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private readonly transientOptions: TransientOptions | undefined,
		telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string,
		cellDiffInfo: CellDiffInfo[],
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService chatService: IChatService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IModelService private readonly modelService: IModelService
	) {
		super(modifiedResourceRef.object.notebook.uri, telemetryInfo, kind, configurationService, fileConfigService, chatService, fileService, instantiationService);
		this._register(modifiedResourceRef);
		this._register(originalResourceRef);
		this.modifiedModel = modifiedResourceRef.object.notebook;
		this.originalModel = originalResourceRef.object.notebook;
		this.originalURI = this.originalModel.uri;
		this.initialContent = initialContent;
		this._register(this.modifiedModel.onDidChangeContent(this.mirrorNotebookEdits, this));
		this._maxModifiedLineNumbers.set(this.modifiedModel.cells.map(() => 0), undefined);
		const diffs = cellDiffInfo.map((diff, i) => {
			switch (diff.type) {
				case 'unchanged': {
					const modifiedCell = this.modifiedModel.cells[diff.modifiedCellIndex];
					const originalCell = this.originalModel.cells[diff.originalCellIndex];
					const originalCellModel = this.originalCellModels.get(originalCell.uri)!;
					this.modifiedToOriginalCellMap.set(modifiedCell.uri, originalCellModel);
					this.getOrCreateModifiedTextFileEntryForCell(modifiedCell);
					return this.createUnchangedCellDiffInfo(diff.originalCellIndex, diff.modifiedCellIndex);
				}
				case 'delete':
					return this.createDeleteCellDiffInfo(diff.originalCellIndex);
				case 'insert': {
					const cell = this.modifiedModel.cells[diff.modifiedCellIndex];
					return this.createInsertedCellDiffInfo(diff.modifiedCellIndex, this.modifiedCellModels.get(cell.uri)!);
				}
				default: {
					const modifiedCell = this.modifiedModel.cells[diff.modifiedCellIndex];
					const originalCell = this.originalModel.cells[diff.originalCellIndex];
					const orgiginalCellModel = this.originalCellModels.get(originalCell.uri)!;
					this.modifiedToOriginalCellMap.set(modifiedCell.uri, orgiginalCellModel);
					this.getOrCreateModifiedTextFileEntryForCell(modifiedCell);

					const entry = this.cellEntryMap.get(modifiedCell);
					const diff2: IDocumentDiff2 = {
						...(entry?.diffInfo.get() ?? nullDocumentDiff),
						keep: noopKeep,
						undo: noopUndo,
						modifiedModel: this.modifiedCellModels.get(modifiedCell.uri)!,
						originalModel: this.originalCellModels.get(originalCell.uri)!,
					};
					return {
						modifiedCellIndex: diff.modifiedCellIndex,
						originalCellIndex: diff.originalCellIndex,
						diff: diff2,
						type: 'modified'
					} satisfies ICellDiffInfo;
				}
			}
		});
		this._cellDiffInfo.set(diffs, undefined);
		this._changesCount.set(countChanges(diffs), undefined);
	}

	createEmptyDiffs() {
		this._cellDiffInfo.set(this.modifiedModel.cells.map((_, i) => this.createUnchangedCellDiffInfo(i, i)), undefined);
	}

	getDiffForUnchangedCell(cell: NotebookCellTextModel): IDocumentDiff2 {
		return {
			...nullDocumentDiff,
			keep: noopKeep,
			undo: noopUndo,
			originalModel: this.modifiedToOriginalCellMap.get(cell.uri)!,
			modifiedModel: this.modifiedCellModels.get(cell.uri)!,
		};
	}

	mirrorNotebookEdits(e: NotebookTextModelChangedEvent) {
		if (this._isEditFromUs || Array.from(this.cellEntryMap.values()).some(entry => entry.isEditFromUs)) {
			// TODO@DonJayamanne Apply this same edit to the original notebook.
			return;
		}

		// TODO@DonJayamanne We need a way to undo this operation.
		this._allEditsAreFromUs = this._allEditsAreFromUs || e.rawEvents.length > 0;

		const didResetToOriginalContent = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService) === this.initialContent;
		const currentState = this._stateObs.get();
		switch (currentState) {
			case WorkingSetEntryState.Modified:
				if (didResetToOriginalContent) {
					this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
					break;
				}
		}

	}

	protected override async _doAccept(tx: ITransaction | undefined): Promise<void> {
		const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
		const snapshot = this.modifiedModel.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions: this.transientOptions });
		this.originalModel.restoreSnapshot(snapshot, this.transientOptions);
		this._changesCount.set(0, tx);
		this.createEmptyDiffs();

		await this._collapse(tx);
	}

	protected override async _doReject(tx: ITransaction | undefined): Promise<void> {
		this._cellDiffInfo.set([], undefined);
		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			await this._applyEdits(async () => {
				await this.modifiedResourceRef.object.revert({ soft: true });
				await this._fileService.del(this.modifiedURI);
			});
			this._onDidDelete.fire();
		} else {
			await this._applyEdits(async () => {
				const outputSizeLimit = this.configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
				const snapshot = this.originalModel.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions: this.transientOptions });
				this.modifiedModel.restoreSnapshot(snapshot, this.transientOptions);
				if (this._allEditsAreFromUs && this._entries.get().every(entry => entry.allEditsAreFromUs)) {
					// save the file after discarding so that the dirty indicator goes away
					// and so that an intermediate saved state gets reverted
					await this.modifiedResourceRef.object.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
				}
			});
			await this._collapse(tx);
		}
		this.createEmptyDiffs();
	}
	private async _collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	protected override _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		const notebookEditor = getNotebookEditorFromEditorPane(editor);
		if (!notebookEditor && editor.getId() === NotebookTextDiffEditor.ID) {
			const diffEditor = (editor.getControl() as INotebookTextDiffEditor);
			return this._instantiationService.createInstance(ChatEditingNotebookDiffEditorIntegration, diffEditor, this._cellDiffInfo);
		}
		assertType(notebookEditor);
		return this._instantiationService.createInstance(ChatEditingNotebookEditorIntegration, this, notebookEditor, this.modifiedModel, this.originalModel, this._cellDiffInfo);
	}

	protected override _resetEditsState(tx: ITransaction): void {
		super._resetEditsState(tx);
		this.cellEntryMap.forEach(entry => !entry.disposed && entry.clearCurrentEditLineDecoration());
	}

	override async acceptAgentEdits(resource: URI, edits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		const isCellUri = resource.scheme === Schemas.vscodeNotebookCell;
		const cell = isCellUri && this.modifiedModel.cells.find(cell => isEqual(cell.uri, resource));
		const cellEntry = cell ? this.cellEntryMap.get(cell) : undefined;

		// For all cells that were edited, send the `isLastEdits` flag.
		const finishPreviousCells = () => {
			this.editedCells.forEach(uri => {
				const cell = this.modifiedModel.cells.find(cell => isEqual(cell.uri, uri));
				const cellEntry = cell && this.cellEntryMap.get(cell);
				cellEntry?.acceptAgentEdits([], true, responseModel);
			});
		};

		await this._applyEdits(async () => {
			await Promise.all(edits.map(async edit => {
				if (TextEdit.isTextEdit(edit)) {
					if (!this.editedCells.has(resource)) {
						finishPreviousCells();
						this.editedCells.add(resource);
					}
					cellEntry?.acceptAgentEdits([edit], isLastEdits, responseModel);
				} else {
					await this.acceptNotebookEdit(edit);
				}
			}));
		});

		// If the last edit for a cell was sent, then handle it
		if (isCellUri && isLastEdits) {
			this.editedCells.delete(resource);
			cellEntry?.acceptAgentEdits([], isLastEdits, responseModel);
		}

		// isLastEdits can be true for cell Uris, but when its true for Cells edits.
		// It cannot be true for the notebook itself.
		isLastEdits = !isCellUri && isLastEdits;

		transaction((tx) => {
			if (!isLastEdits) {
				this._stateObs.set(WorkingSetEntryState.Modified, tx);
				this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
				this._rewriteRatioObs.set(Math.min(1, this.calculateRewriteRadio()), tx);

			} else {
				finishPreviousCells();
				this.editedCells.clear();
				this._resetEditsState(tx);
				// this._updateDiffInfoSeq();
				this._rewriteRatioObs.set(1, tx);
				// this._editDecorationClear.schedule();
			}
		});
	}

	async acceptNotebookEdit(edit: ICellEditOperation): Promise<void> {
		// make the actual edit
		this.modifiedModel.applyEdits([edit], true, undefined, () => undefined, undefined, true);
		// Ensure the models have been resolved for the new cells inserted.
		if (edit.editType !== CellEditType.Replace) {
			return;
		}
		if (edit.count === 0) {
			const diff = sortCellChanges(this._cellDiffInfo.get()).slice();
			// All existing indexes are shifted by number of cells added.
			diff.forEach(d => {
				if (d.type !== 'delete' && d.modifiedCellIndex >= edit.index) {
					d.modifiedCellIndex += edit.cells.length;
				}
			});
			const diffInsert = await Promise.all(edit.cells.map(async (c, i) => {
				const cell = this.modifiedModel.cells[edit.index + i];
				const modifiedCellModel: ITextModel = cell.textModel ?? this._register((await this.textModelService.createModelReference(cell.uri))).object.textEditorModel;
				return this.createInsertedCellDiffInfo(edit.index + i, modifiedCellModel);
			}));
			diff.splice(edit.index + 1, 0, ...diffInsert);
			this._cellDiffInfo.set(sortCellChanges(diff), undefined);
		} else {
			// All existing indexes are shifted by number of cells removed.
			// And unchanged cells should be converted to deleted cells.
			const diff = sortCellChanges(this._cellDiffInfo.get()).slice().map(d => {
				if (d.type === 'unchanged' && d.modifiedCellIndex >= edit.index && d.modifiedCellIndex <= (edit.index + edit.count - 1)) {
					return this.createDeleteCellDiffInfo(d.originalCellIndex);
				}
				if (d.type !== 'delete' && d.modifiedCellIndex >= (edit.index + edit.count)) {
					d.modifiedCellIndex -= edit.count;
					return d;
				}
				return d;
			});
			this._cellDiffInfo.set(diff, undefined);
			this._changesCount.set(countChanges(this._cellDiffInfo.get()), undefined);
		}
	}

	createUnchangedCellDiffInfo(originalCellIndex: number, modifiedCellIndex: number): ICellDiffInfo {
		const cell = this.modifiedModel.cells[modifiedCellIndex];
		return { modifiedCellIndex, originalCellIndex, diff: this.getDiffForUnchangedCell(cell), type: 'unchanged' };
	}
	createInsertedCellDiffInfo(modifiedCellIndex: number, modifiedCellModel: ITextModel): ICellDiffInfo {
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
		this.modifiedCellModels.set(cell.uri, modifiedCellModel);
		this.modifiedToOriginalCellMap.set(cell.uri, originalModel);
		const keep = async () => {
			await this._applyEdits(async () => this.keepPreviouslyInsertedCell(cell));
			this.computeStateAfterAcceptingRejectingChanges(true);
			return true;
		};
		const undo = async () => {
			await this._applyEdits(async () => this.undoPreviouslyInsertedCell(cell));
			this.computeStateAfterAcceptingRejectingChanges(false);
			return true;
		};
		this.getOrCreateModifiedTextFileEntryForCell(cell, keep, undo);
		return {
			type: 'insert' as const,
			originalCellIndex: undefined,
			modifiedCellIndex: modifiedCellIndex,
			diff: {
				changes,
				identical: false,
				moves: [],
				quitEarly: false,
				keep,
				undo,
				modifiedModel: modifiedCellModel,
				originalModel,
			}
		} satisfies ICellDiffInfo;
	}
	private computeStateAfterAcceptingRejectingChanges(accepted: boolean) {
		const currentSnapshot = createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService);
		const originalSnapshot = createSnapshot(this.originalModel, this.transientOptions, this.configurationService);
		if (currentSnapshot === originalSnapshot) {
			const state = accepted ? WorkingSetEntryState.Accepted : WorkingSetEntryState.Rejected;
			this._stateObs.set(state, undefined);
		}
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
			await this._applyEdits(async () => this.keepPreviouslyDeletedCell(this.originalModel.cells.indexOf(originalCell)));
			this.computeStateAfterAcceptingRejectingChanges(true);
			return true;
		};
		const undo = async () => {
			await this._applyEdits(async () => this.undoPreviouslyDeletedCell(this.originalModel.cells.indexOf(originalCell), originalCell));
			this.computeStateAfterAcceptingRejectingChanges(false);
			return true;
		};

		// This will be deleted.
		return {
			type: 'delete' as const,
			modifiedCellIndex: undefined,
			originalCellIndex,
			diff: {
				changes,
				identical: false,
				moves: [],
				quitEarly: false,
				originalModel: originalCell.textModel!,
				modifiedModel: modifiedModel,
				keep,
				undo,
			}
		} satisfies ICellDiffInfo;
	}
	private undoPreviouslyInsertedCell(cell: NotebookCellTextModel) {
		const index = this.modifiedModel.cells.indexOf(cell);
		const diff = sortCellChanges(this._cellDiffInfo.get()).slice().map(d => {
			if (d.type === 'insert' && d.modifiedCellIndex === index) {
				return d;
			}
			if (d.type !== 'delete' && d.modifiedCellIndex > index) {
				return {
					...d,
					modifiedCellIndex: d.modifiedCellIndex - 1,
				};
			}
			return d;
		}).filter(d => !(d.type === 'insert' && d.modifiedCellIndex === index));
		const edit: ICellReplaceEdit = { cells: [], count: 1, editType: CellEditType.Replace, index, };
		this.modifiedModel.applyEdits([edit], true, undefined, () => undefined, undefined, true);
		this._cellDiffInfo.set(diff, undefined);
		this._changesCount.set(countChanges(this._cellDiffInfo.get()), undefined);
	}

	private async keepPreviouslyInsertedCell(cell: NotebookCellTextModel) {
		const modifiedCellIndex = this.modifiedModel.cells.indexOf(cell);
		if (modifiedCellIndex === -1) {
			// Not possible.
			return;
		}
		// Find where we should insert this cell in the original notebook.
		let diff = sortCellChanges(this._cellDiffInfo.get()).slice();
		const entryIndex = diff.findIndex(d => d.type === 'insert' && d.modifiedCellIndex === modifiedCellIndex);
		if (entryIndex === -1) {
			// Not possible.
			return;
		}
		diff = diff.slice(0, entryIndex);
		const index = diff.reduce((prev, d) => Math.max(prev, d.type === 'insert' ? -1 : d.originalCellIndex), 0);
		const cellToInsert: ICellDto2 = {
			cellKind: cell.cellKind,
			language: cell.language,
			metadata: cell.metadata,
			outputs: cell.outputs,
			source: cell.getValue(),
			mime: cell.mime
		};
		const edit: ICellReplaceEdit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index, };
		this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, true);
		const originalCell = this.originalModel.cells[index];
		const originalModel = originalCell.textModel ?? this._register((await this.textModelService.createModelReference(originalCell.uri))).object.textEditorModel;
		this.originalCellModels.set(originalCell.uri, originalModel);
		this.modifiedToOriginalCellMap.set(cell.uri, originalCell.textModel!);
		const unchangedCell: ICellDiffInfo = {
			type: 'unchanged',
			modifiedCellIndex,
			originalCellIndex: index,
			diff: this.getDiffForUnchangedCell(cell)
		};
		diff.push(unchangedCell);
		this._cellDiffInfo.set(sortCellChanges(diff), undefined);
		this._changesCount.set(countChanges(this._cellDiffInfo.get()), undefined);
	}

	private async undoPreviouslyDeletedCell(deletedOriginalIndex: number, originalCell: NotebookCellTextModel) {
		// Find where we should insert this cell.
		const index = sortCellChanges(this._cellDiffInfo.get()).reverse().reduce((previous, curr) => {
			if (curr.type === 'delete' || curr.type === 'insert') {
				return previous;
			}
			if (curr.originalCellIndex <= deletedOriginalIndex) {
				return previous;
			}
			if (curr.modifiedCellIndex < previous) {
				return curr.modifiedCellIndex;
			}
			return previous;
		}, this.modifiedModel.cells.length - 1);

		const diff = sortCellChanges(this._cellDiffInfo.get()).slice()
			.map(d => {
				if (d.type !== 'delete' && d.modifiedCellIndex >= index) {
					return {
						...d,
						modifiedCellIndex: d.modifiedCellIndex + 1,
					};
				}
				return d;
			}).filter(d => !(d.type === 'delete' && d.originalCellIndex === deletedOriginalIndex));

		const cellToInsert: ICellDto2 = {
			cellKind: originalCell.cellKind,
			language: originalCell.language,
			metadata: originalCell.metadata,
			outputs: originalCell.outputs,
			source: originalCell.getValue(),
			mime: originalCell.mime
		};
		const edit: ICellReplaceEdit = { cells: [cellToInsert], count: 0, editType: CellEditType.Replace, index, };
		this.modifiedModel.applyEdits([edit], true, undefined, () => undefined, undefined, true);
		const newCell = this.modifiedModel.cells[index];
		const modifiedModel = newCell.textModel ?? this._register((await this.textModelService.createModelReference(newCell.uri))).object.textEditorModel;
		this.modifiedCellModels.set(newCell.uri, modifiedModel);
		this.modifiedToOriginalCellMap.set(newCell.uri, originalCell.textModel!);
		const unchangedCell: ICellDiffInfo = {
			type: 'unchanged',
			modifiedCellIndex: index,
			originalCellIndex: deletedOriginalIndex,
			diff: this.getDiffForUnchangedCell(newCell)
		};
		diff.push(unchangedCell);
		this._cellDiffInfo.set(sortCellChanges(diff), undefined);
		this._changesCount.set(countChanges(this._cellDiffInfo.get()), undefined);
	}


	private keepPreviouslyDeletedCell(deletedOriginalIndex: number) {
		// Delete this cell from original as well.
		const edit: ICellReplaceEdit = { cells: [], count: 1, editType: CellEditType.Replace, index: deletedOriginalIndex, };
		this.originalModel.applyEdits([edit], true, undefined, () => undefined, undefined, true);
		const diffs = sortCellChanges(this._cellDiffInfo.get()).slice()
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
		this._cellDiffInfo.set(diffs, undefined);
		this._changesCount.set(countChanges(this._cellDiffInfo.get()), undefined);
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

	calculateRewriteRadio() {
		const cellChanges = this._cellDiffInfo.get();
		const totalNumberOfUpdatedLines = cellChanges.reduce((totalUpdatedLines, value) => {
			const getUpadtedLineCount = () => {
				if (value.type === 'unchanged') {
					return 0;
				}
				if (value.type === 'delete') {
					return this.originalModel.cells[value.originalCellIndex].textModel?.getLineCount() ?? 0;
				}
				if (value.type === 'insert') {
					return this.modifiedModel.cells[value.modifiedCellIndex].textModel?.getLineCount() ?? 0;
				}
				return value.diff.changes.reduce((maxLineNumber, change) => {
					return Math.max(maxLineNumber, change.modified.endLineNumberExclusive);
				}, 0);
			};

			return totalUpdatedLines + getUpadtedLineCount();
		}, 0);

		const totalNumberOfLines = this.modifiedModel.cells.reduce((totalLines, cell) => totalLines + (cell.textModel?.getLineCount() ?? 0), 0);
		return totalNumberOfLines === 0 ? 0 : Math.min(1, totalNumberOfUpdatedLines / totalNumberOfLines);
	}

	override createSnapshot(requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		this.cellEntryMap.forEach(entry => entry.isFirstEditAfterStartOrSnapshot = true);
		return {
			resource: this.modifiedURI,
			languageId: SnapshotLanguageId,
			snapshotUri: getNotebookSnapshotFileURI(this._telemetryInfo.sessionId, requestId, undoStop, this.modifiedURI.path, this.modifiedModel.viewType),
			original: createSnapshot(this.originalModel, this.transientOptions, this.configurationService),
			current: createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService),
			originalToCurrentEdit: OffsetEdit.empty,
			state: this.state.get(),
			telemetryInfo: this.telemetryInfo,
		};
	}

	override equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		return !!snapshot &&
			this.modifiedURI.toString() === snapshot.resource.toString() &&
			this.state.get() === snapshot.state &&
			createSnapshot(this.originalModel, this.transientOptions, this.configurationService) === snapshot.original &&
			createSnapshot(this.modifiedModel, this.transientOptions, this.configurationService) === snapshot.current;

	}

	override restoreFromSnapshot(snapshot: ISnapshotEntry): void {
		this._stateObs.set(snapshot.state, undefined);
		restoreSnapshot(this.originalModel, snapshot.original);
		restoreSnapshot(this.modifiedModel, snapshot.current);
	}

	override resetToInitialContent(): void {
		restoreSnapshot(this.modifiedModel, this.initialContent);
	}

	getOrCreateModifiedTextFileEntryForCell(cell: NotebookCellTextModel, accept?: () => Promise<boolean>, reject?: () => Promise<boolean>): ChatEditingNotebookCellEntry | undefined {
		let cellEntry = this.cellEntryMap.get(cell);
		if (cellEntry) {
			return cellEntry;
		}
		const originalCellModel = this.modifiedToOriginalCellMap.get(cell.uri);
		const modifiedCellModel = this.modifiedCellModels.get(cell.uri);
		if (!modifiedCellModel || !originalCellModel) {
			return;
		}
		cellEntry = this._register(this._instantiationService.createInstance(ChatEditingNotebookCellEntry, this.modifiedResourceRef.object.resource, cell, modifiedCellModel, originalCellModel, this._telemetryInfo, accept, reject));
		this.cellEntryMap.set(cell, cellEntry);

		this._register(autorun(r => {
			const cellDiff = cellEntry.diffInfo.read(r);
			let diffs = this.cellDiffInfo.get().slice();
			const index = this.modifiedModel.cells.indexOf(cell);
			const entry = diffs.find(entry => entry.modifiedCellIndex === index);
			if (!entry) {
				// Not possible.
				return;
			}
			entry.diff = { ...entry.diff, ...cellDiff };
			if (cellDiff.identical) {
				entry.diff = { ...entry.diff, ...nullDocumentDiff };
			}
			if (entry.type === 'unchanged' || entry.type === 'modified') {
				entry.type = cellDiff.identical ? 'unchanged' : 'modified';
			}
			diffs = diffs.filter(entry => entry.modifiedCellIndex !== index).concat({ ...entry });
			const maxModifiedLineNumber = cellEntry.maxModifiedLineNumber.read(r);
			const changeCount = countChanges(diffs);
			const maxModifiedLineNumbers = this._maxModifiedLineNumbers.get().slice();
			maxModifiedLineNumbers[index] = maxModifiedLineNumber;

			transaction(tx => {
				this._cellDiffInfo.set(sortCellChanges(diffs), tx);
				this._changesCount.set(changeCount, tx);
				this._maxModifiedLineNumbers.set(maxModifiedLineNumbers, tx);
			});
		}));

		this._register(autorun(r => {
			const cellState = cellEntry.state.read(r);
			if (cellState === WorkingSetEntryState.Accepted) {
				this.computeStateAfterAcceptingRejectingChanges(true);
			} else if (cellState === WorkingSetEntryState.Rejected) {
				this.computeStateAfterAcceptingRejectingChanges(false);
			}
		}));

		const entries = this.modifiedModel.cells.map(cell => this.cellEntryMap.get(cell)).filter(entry => !!entry);
		this._entries.set(entries, undefined);

		return cellEntry;
	}
}

class ChatEditingNotebookCellEntry extends ObservableDisposable {
	private static readonly _lastEditDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-last-edit',
		className: 'chat-editing-last-edit-line',
		marginClassName: 'chat-editing-last-edit',
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(editorSelectionBackground)
		},
	});

	private static readonly _pendingEditDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-pending-edit',
		className: 'chat-editing-pending-edit',
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(pendingRewriteMinimap)
		}
	});


	private _isFirstEditAfterStartOrSnapshot: boolean = true;
	public set isFirstEditAfterStartOrSnapshot(value: boolean) {
		this._isFirstEditAfterStartOrSnapshot = value;
	}
	private _edit: OffsetEdit = OffsetEdit.empty;
	private _isEditFromUs: boolean = false;
	public get isEditFromUs(): boolean {
		return this._isEditFromUs;
	}

	private _allEditsAreFromUs: boolean = true;
	public get allEditsAreFromUs(): boolean {
		return this._allEditsAreFromUs;
	}
	private _diffOperation: Promise<any> | undefined;
	private _diffOperationIds: number = 0;

	private readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);
	public readonly changesCount: IObservable<number>;
	public readonly diffInfo: IObservable<IDocumentDiff2>;
	private readonly _maxModifiedLineNumber = observableValue<number>(this, 0);
	readonly maxModifiedLineNumber = this._maxModifiedLineNumber;

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];

	private readonly _diffTrimWhitespace: IObservable<boolean>;
	protected readonly _stateObs = observableValue<WorkingSetEntryState>(this, WorkingSetEntryState.Modified);
	readonly state: IObservable<WorkingSetEntryState> = this._stateObs;
	protected readonly _isCurrentlyBeingModifiedByObs = observableValue<IChatResponseModel | undefined>(this, undefined);
	readonly isCurrentlyBeingModifiedBy: IObservable<IChatResponseModel | undefined> = this._isCurrentlyBeingModifiedByObs;

	constructor(
		public readonly notebookUri: URI,
		public readonly cell: NotebookCellTextModel,
		private readonly modifiedModel: ITextModel,
		private readonly originalModel: ITextModel,
		private readonly _telemetryInfo: IModifiedEntryTelemetryInfo,
		acceptChange: (() => Promise<boolean>) | undefined,
		undoChange: (() => Promise<boolean>) | undefined,
		@IConfigurationService configService: IConfigurationService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService
	) {
		super();
		this.diffInfo = this._diffInfo.map(value => {
			return {
				...value,
				originalModel: this.originalModel,
				modifiedModel: this.modifiedModel,
				keep: changes => acceptChange ? acceptChange() : this._acceptHunk(changes),
				undo: changes => undoChange ? undoChange() : this._rejectHunk(changes)
			} satisfies IDocumentDiff2;
		});
		this.changesCount = this._diffInfo.map(diff => diff.changes.length);
		this._register(this.modifiedModel.onDidChangeContent(e => {
			if (this.disposed) {
				return;
			}
			this._mirrorEdits(e);

		}));
		this._register(toDisposable(() => {
			this.clearCurrentEditLineDecoration();
		}));

		this._diffTrimWhitespace = observableConfigValue('diffEditor.ignoreTrimWhitespace', true, configService);
		this._register(autorun(r => {
			this._diffTrimWhitespace.read(r);
			this._updateDiffInfoSeq();
		}));
	}

	public clearCurrentEditLineDecoration() {
		if (this.modifiedModel.isDisposed()) {
			return;
		}
		this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
	}


	private _mirrorEdits(event: IModelContentChangedEvent) {
		const edit = OffsetEdits.fromContentChanges(event.changes);

		if (this._isEditFromUs) {
			const e_sum = this._edit;
			const e_ai = edit;
			this._edit = e_sum.compose(e_ai);

		} else {

			//           e_ai
			//   d0 ---------------> s0
			//   |                   |
			//   |                   |
			//   | e_user_r          | e_user
			//   |                   |
			//   |                   |
			//   v       e_ai_r      v
			///  d1 ---------------> s1
			//
			// d0 - document snapshot
			// s0 - document
			// e_ai - ai edits
			// e_user - user edits
			//
			const e_ai = this._edit;
			const e_user = edit;

			const e_user_r = e_user.tryRebase(e_ai.inverse(this.originalModel.getValue()), true);

			if (e_user_r === undefined) {
				// user edits overlaps/conflicts with AI edits
				this._edit = e_ai.compose(e_user);
			} else {
				const edits = OffsetEdits.asEditOperations(e_user_r, this.originalModel);
				this.originalModel.applyEdits(edits);
				this._edit = e_ai.tryRebase(e_user_r);
			}

			this._allEditsAreFromUs = false;
			this._updateDiffInfoSeq();
		}
	}

	acceptAgentEdits(textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void {
		const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(this.notebookUri)?.value;
		if (notebookEditor) {
			const vm = notebookEditor.getCellByHandle(this.cell.handle);
			vm?.updateEditState(CellEditState.Editing, 'chatEdit');
		}

		// push stack element for the first edit
		if (this._isFirstEditAfterStartOrSnapshot) {
			this._isFirstEditAfterStartOrSnapshot = false;
			const request = this._chatService.getSession(this._telemetryInfo.sessionId)?.getRequests().at(-1);
			const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
			this._undoRedoService.pushElement(new SingleModelEditStackElement(label, 'chat.edit', this.modifiedModel, null));
		}

		const ops = textEdits.map(TextEdit.asEditOperation);
		const undoEdits = this._applyEdits(ops);

		const maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);

		const newDecorations: IModelDeltaDecoration[] = [
			// decorate pending edit (region)
			{
				options: ChatEditingNotebookCellEntry._pendingEditDecorationOptions,
				range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
			}
		];

		if (maxLineNumber > 0) {
			// decorate last edit
			newDecorations.push({
				options: ChatEditingNotebookCellEntry._lastEditDecorationOptions,
				range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
			});
		}

		this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, newDecorations);


		transaction((tx) => {
			if (!isLastEdits) {
				this._stateObs.set(WorkingSetEntryState.Modified, tx);
				this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
				this._maxModifiedLineNumber.set(maxLineNumber, tx);

			} else {
				this._resetEditsState(tx);
				this._updateDiffInfoSeq();
				this._maxModifiedLineNumber.set(0, tx);
				this._editDecorationClear.schedule();
			}
		});
	}

	scheduleEditDecorations() {
		this._editDecorationClear.schedule();
	}

	protected _resetEditsState(tx: ITransaction): void {
		this._isCurrentlyBeingModifiedByObs.set(undefined, tx);
		this._maxModifiedLineNumber.set(0, tx);
	}

	private async _acceptHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		this._isEditFromUs = true;
		try {
			if (!this._diffInfo.get().changes.includes(change)) {
				// diffInfo should have model version ids and check them (instead of the caller doing that)
				return false;
			}
			const edits: ISingleEditOperation[] = [];
			for (const edit of change.innerChanges ?? []) {
				const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
				edits.push(EditOperation.replace(edit.originalRange, newText));
			}
			this.originalModel.pushEditOperations(null, edits, _ => null);
		}
		finally {
			this._isEditFromUs = false;
		}
		await this._updateDiffInfoSeq();
		if (this._diffInfo.get().identical) {
			this._stateObs.set(WorkingSetEntryState.Accepted, undefined);
		}
		return true;
	}

	private async _rejectHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		this._isEditFromUs = true;
		try {
			if (!this._diffInfo.get().changes.includes(change)) {
				return false;
			}
			const edits: ISingleEditOperation[] = [];
			for (const edit of change.innerChanges ?? []) {
				const newText = this.originalModel.getValueInRange(edit.originalRange);
				edits.push(EditOperation.replace(edit.modifiedRange, newText));
			}
			this.modifiedModel.pushEditOperations(null, edits, _ => null);
		} finally {
			this._isEditFromUs = false;
		}
		await this._updateDiffInfoSeq();
		if (this._diffInfo.get().identical) {
			this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
		}
		return true;
	}

	private _applyEdits(edits: ISingleEditOperation[]) {
		// make the actual edit
		this._isEditFromUs = true;
		try {
			let result: ISingleEditOperation[] = [];
			this.modifiedModel.pushEditOperations(null, edits, (undoEdits) => {
				result = undoEdits;
				return null;
			});
			return result;
		} finally {
			this._isEditFromUs = false;
		}
	}

	private async _updateDiffInfoSeq() {
		const myDiffOperationId = ++this._diffOperationIds;
		await Promise.resolve(this._diffOperation);
		if (this._diffOperationIds === myDiffOperationId) {
			const thisDiffOperation = this._updateDiffInfo();
			this._diffOperation = thisDiffOperation;
			await thisDiffOperation;
		}
	}

	private async _updateDiffInfo(): Promise<void> {

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed()) {
			return;
		}

		const docVersionNow = this.modifiedModel.getVersionId();
		const snapshotVersionNow = this.originalModel.getVersionId();

		const ignoreTrimWhitespace = this._diffTrimWhitespace.get();

		const diff = await this._editorWorkerService.computeDiff(
			this.originalModel.uri,
			this.modifiedModel.uri,
			{ ignoreTrimWhitespace, computeMoves: false, maxComputationTimeMs: 3000 },
			'advanced'
		);

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed()) {
			return;
		}

		// only update the diff if the documents didn't change in the meantime
		if (this.modifiedModel.getVersionId() === docVersionNow && this.originalModel.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;
			this._diffInfo.set(diff2, undefined);
			this._edit = OffsetEdits.fromLineRangeMapping(this.originalModel, this.modifiedModel, diff2.changes);
		}
	}
}
