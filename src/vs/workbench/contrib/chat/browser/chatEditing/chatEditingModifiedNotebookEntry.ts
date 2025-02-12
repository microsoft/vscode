/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../../../base/common/async.js';
import { bufferToReadableStream, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { LineRange } from '../../../../../editor/common/core/lineRange.js';
import { IOffsetEdit, ISingleOffsetEdit, OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { SaveReason } from '../../../../common/editor.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookCellTextModel } from '../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, ICellEditOperation, INotebookTextModel, IResolvedNotebookEditorModel } from '../../../notebook/common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { ChatEditKind, ICellDiffInfo, IModifiedEntryTelemetryInfo, IModifiedNotebookFileEntry, IModifiedTextFileEntry, INotebookSnapshotEntry, INotebookSnapshotEntryDTO, ISnapshotEntry, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingModifiedBaseFileEntry, readSnapshotContentFromStorage, writeSnapshotContentIntoStorage } from './chatEditingModifiedBaseFileEntry.js';
import { ChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';
import { ChatEditingNotebookFileSystemProvider } from './chatEditingNotebookFileSystemProvider.js';

export class ChatEditingModifiedNotebookEntry2 extends ChatEditingModifiedBaseFileEntry implements IModifiedNotebookFileEntry {
	override get originalURI(): URI {
		return this.original.notebook.uri;
	}
	override get modifiedURI(): URI {
		return this.modifiedModel.uri;
	}
	public readonly kind = 'notebook';
	public get originalModel(): INotebookTextModel {
		return this.original.notebook;
	}
	public get modifiedModel() {
		return this.resourceRef.object.notebook;
	}
	private readonly currentToOrignalCellMapping = new WeakMap<NotebookCellTextModel, URI>();
	private readonly cellModels = new WeakMap<NotebookCellTextModel, ChatEditingModifiedCellTextFileEntry>();
	private readonly _cellDiffInfo = observableValue<ICellDiffInfo[]>('diffInfo', []);

	get cellDiffInfo(): IObservable<ICellDiffInfo[]> {
		return this._cellDiffInfo;
	}

	private readonly _entries = observableValue<IModifiedCellTextFileEntry[]>('cellEntries', []);

	get entries(): IObservable<IModifiedCellTextFileEntry[]> {
		return this._entries;
	}

	private _acceptAgentCellEdits = new SequencerByKey<NotebookCellTextModel>();

	public static async create(resourceRef: IReference<IResolvedNotebookEditorModel>, multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void }, telemetryInfo: IModifiedEntryTelemetryInfo, chatKind: ChatEditKind, instantiationService: IInstantiationService): Promise<ChatEditingModifiedNotebookEntry2> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const resolver = accessor.get(INotebookEditorModelResolverService);
			const notebook = resourceRef.object.notebook;

			const buffer = await notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then(s => streamToBuffer(s));
			const originalUri = ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(telemetryInfo.requestId, notebook.uri.path);
			const originalDisposables = new DisposableStore();
			originalDisposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));
			// Keep this, as we will need the original model for diffing later (e.g. diffing of cells to find diff per cell).
			const ref = await resolver.resolve(originalUri, notebook.viewType);
			originalDisposables.add(ref);

			return instantiationService.createInstance(ChatEditingModifiedNotebookEntry2, resourceRef, multiDiffEntryDelegate, telemetryInfo, chatKind, { notebook: ref.object.notebook, buffer, disposables: originalDisposables });
		});
	}

	constructor(
		private readonly resourceRef: IReference<IResolvedNotebookEditorModel>,
		_multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		_telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		public original: { notebook: NotebookTextModel; buffer: VSBuffer; disposables: DisposableStore },
		@IChatService _chatService: IChatService,
		@IEditorWorkerService _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService _undoRedoService: IUndoRedoService,
		@IFileService _fileService: IFileService,
		@IConfigurationService configService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookService private readonly notebookService: INotebookService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@INotebookEditorModelResolverService private readonly notebookResolver: INotebookEditorModelResolverService,
	) {
		super(_multiDiffEntryDelegate, _telemetryInfo, kind, configService, _chatService, _editorWorkerService, _undoRedoService, _fileService, instantiationService);
		this._register(original.disposables);
		this.updateTrackedInfo();

		this._register(autorun(r => {
			const cellChanges = this._cellDiffInfo.read(r).filter(diff => diff.type !== 'unchanged');
			if (cellChanges.length) {
				this._diffInfo.set({
					identical: false,
					moves: cellChanges.map(item => item.diff.moves).flat(),
					changes: cellChanges.map(item => item.diff.changes).flat(),
					quitEarly: false
				}, undefined);
			} else {
				this._diffInfo.set(nullDocumentDiff, undefined);
			}
		}));
	}
	private updateTrackedInfo(transaction?: ITransaction) {
		this.modifiedModel.cells.forEach((cell, index) => {
			if (index < this.original.notebook.cells.length) {
				const originalCell = this.original.notebook.cells[index];
				this.currentToOrignalCellMapping.set(cell, originalCell.uri);
			}
		});

		this._cellDiffInfo.set(this.modifiedModel.cells.map((_, i) => ({ type: 'unchanged', modifiedCellIndex: i, originalCellIndex: i, diff: nullDocumentDiff }) satisfies ICellDiffInfo), transaction);
	}

	override createSnapshot(requestId: string | undefined): Promise<INotebookSnapshotEntry> {
		this._isFirstEditAfterStartOrSnapshot = true;
		return NotebookSnapshotEntry.create(this, requestId, this.instantiationService);

	}
	override async restoreFromSnapshot(snapshot: ISnapshotEntry): Promise<void> {
		if (snapshot.kind === 'text') {
			return;
		}

		const promises: Promise<unknown>[] = [this.notebookService.restoreNotebookTextModelFromSnapshot(this.modifiedModel.uri, this.modifiedModel.viewType, bufferToReadableStream(snapshot.current))];

		if (isEqual(this.originalURI, snapshot.snapshotUri)) {
			// Update the model in place, thats cheaper, as the Uris match
			promises.push(this.notebookService.restoreNotebookTextModelFromSnapshot(this.original.notebook.uri, this.modifiedModel.viewType, bufferToReadableStream(snapshot.original)));
		} else {
			// Dispose the old model and create a new one.
			this.original.disposables.clear();
			// This is required when we resolve the cell text models.
			// Resolving cell models end up resolving notebook from Uri, which reads from the file system.
			this.original.disposables.add(ChatEditingNotebookFileSystemProvider.registerFile(snapshot.snapshotUri, snapshot.original));
			// Keep this, as we will need the original model for diffing later (e.g. diffing of cells to find diff per cell).
			const ref = await this.notebookResolver.resolve(snapshot.snapshotUri, this.modifiedModel.viewType);
			this.original.notebook = ref.object.notebook;
			this.original.buffer = snapshot.original;
			this.original.disposables.add(ref);
		}

		await Promise.all(promises);

		this.updateTrackedInfo();

		this._stateObs.set(snapshot.state, undefined);

		// Create text model references for all cells.
		await Promise.all(this.modifiedModel.cells.map(async (cell, i) => {
			const modifiedFileEntry = await this.getOrCreateModifiedTextFileEntryForCell(cell);
			if (modifiedFileEntry) {
				await modifiedFileEntry.restoreFromSnapshot({
					current: VSBuffer.fromString(this.modifiedModel.cells[i].getValue()),
					kind: 'text',
					languageId: this.modifiedModel.cells[i].language,
					original: VSBuffer.fromString(this.original.notebook.cells[i].getValue()),
					originalToCurrentEdit: snapshot.originalToCurrentEdits.get(i) ?? OffsetEdit.empty,
					resource: cell.uri,
					serialize: () => { throw new Error('Not implemented'); },
					snapshotUri: cell.uri,
					state: snapshot.state,
					telemetryInfo: this._telemetryInfo,
				});
			}
		}));
	}
	async resetToInitialValue() {
		await this.resetToInitialValueImpl();
		this.updateTrackedInfo();
	}

	async resetToInitialValueImpl() {
		await this.notebookService.restoreNotebookTextModelFromSnapshot(this.modifiedModel.uri, this.modifiedModel.viewType, bufferToReadableStream(this.original.buffer));
	}

	// private async getCellTextModel(cell: ICell, store: DisposableStore): Promise<ITextModel | undefined> {
	// 	if (cell.textModel) {
	// 		return cell.textModel;
	// 	}
	// 	const ref = await this.modelService.createModelReference(cell.uri);
	// 	store.add(ref);
	// 	return ref.object.textEditorModel;
	// }
	// override async acceptAgentEdits(cellUri: URI, textEdits: TextEdit[], isLastEdits: boolean): Promise<void> {
	// 	// First wait for all cell edits to be applied.
	// 	// Possible we could end up moving cells around, so we need to wait for all cell edits to be applied.
	// 	await Promise.all(this.doc.cells.map(cell => this._acceptAgentCellEdits.queue(cell, () => Promise.resolve())));


	// 	const cell = await this.getCellTextModel(cellUri)
	// 	// push stack element for the first edit
	// 	if (this._isFirstEditAfterStartOrSnapshot) {
	// 		this._isFirstEditAfterStartOrSnapshot = false;
	// 		const request = this._chatService.getSession(this._telemetryInfo.sessionId)?.getRequests().at(-1);
	// 		const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
	// 		this._undoRedoService.pushElement(new SingleModelEditStackElement(label, 'chat.edit', this.doc, null));
	// 	}

	// 	const ops = textEdits.map(TextEdit.asEditOperation);
	// 	const undoEdits = this._applyEdits(ops);

	// 	const maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);

	// 	const newDecorations: IModelDeltaDecoration[] = [
	// 		// decorate pending edit (region)
	// 		{
	// 			options: ChatEditingModifiedFileEntry._pendingEditDecorationOptions,
	// 			range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
	// 		}
	// 	];

	// 	if (maxLineNumber > 0) {
	// 		// decorate last edit
	// 		newDecorations.push({
	// 			options: ChatEditingModifiedFileEntry._lastEditDecorationOptions,
	// 			range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
	// 		});
	// 	}

	// 	this._editDecorations = this.doc.deltaDecorations(this._editDecorations, newDecorations);


	// 	transaction((tx) => {
	// 		if (!isLastEdits) {
	// 			this._stateObs.set(WorkingSetEntryState.Modified, tx);
	// 			this._isCurrentlyBeingModifiedObs.set(true, tx);
	// 			const lineCount = this.doc.getLineCount();
	// 			this._rewriteRatioObs.set(Math.min(1, maxLineNumber / lineCount), tx);
	// 			this._maxLineNumberObs.set(maxLineNumber, tx);
	// 		} else {
	// 			this._resetEditsState(tx);
	// 			// this._updateDiffInfoSeq();
	// 			this._rewriteRatioObs.set(1, tx);
	// 			// this._editDecorationClear.schedule();
	// 		}
	// 	});
	// }

	// private _applyEdits(textModel: ITextModel, edits: ISingleEditOperation[]) {
	// 	// make the actual edit
	// 	// this._isEditFromUs = true;
	// 	try {
	// 		let result: ISingleEditOperation[] = [];
	// 		textModel.pushEditOperations(null, edits, (undoEdits) => {
	// 			result = undoEdits;
	// 			return null;
	// 		});
	// 		return result;
	// 	} finally {
	// 		// this._isEditFromUs = false;
	// 	}
	// }

	override acceptStreamingEditsStart(tx: ITransaction) {
		this.modifiedModel.cells.forEach(cell => this.cellModels.get(cell)?.acceptStreamingEditsStart(tx));
		super.acceptStreamingEditsStart(tx);
	}

	override async acceptStreamingEditsEnd(tx: ITransaction) {
		this.modifiedModel.cells.forEach(cell => this.cellModels.get(cell)?.acceptStreamingEditsEnd(tx));
		await super.acceptStreamingEditsEnd(tx);
	}

	async acceptAgentEdits(resource: URI, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		// Copilot sends empty edits as a way to signal the start & end of edits.
		if (isEqual(this.modifiedModel.uri, resource)) {
			return;
		}

		const cell = this.modifiedModel.cells.find(cell => isEqual(cell.uri, resource));
		if (!cell) {
			return;
		}

		await this._acceptAgentCellEdits.queue(cell, () => this.acceptAgentCellEdits(cell, textEdits, isLastEdits, responseModel));
	}

	async acceptAgentNotebookEdits(edits: ICellEditOperation[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<void> {
		// First wait for all cell edits to be applied.
		// Possible we could end up moving cells around, so we need to wait for all cell edits to be applied.
		await Promise.all(this.modifiedModel.cells.map(cell => this._acceptAgentCellEdits.queue(cell, () => Promise.resolve())));

		if (edits.length) {
			// make the actual edit
			edits.forEach(edit => {
				this._applyEdits(() => this.modifiedModel.applyEdits([edit], true, undefined, () => undefined, undefined, true));
			});
			edits.forEach(edit => {
				if (edit.editType !== CellEditType.Replace) {
					return;
				}
				if (edit.count === 0) {
					const diff = this._cellDiffInfo.get().slice();
					// All existing indexes are shifted by number of cells added.
					diff.forEach(d => {
						if (d.type !== 'delete' && d.modifiedCellIndex >= edit.index) {
							d.modifiedCellIndex += edit.cells.length;
						}
					});
					const diffInsert = edit.cells.map((c, i) => {
						const lines = c.source.split('\n');
						const originalRange = new Range(1, 0, 1, 0);
						const modifiedRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
						const innerChanges = new RangeMapping(originalRange, modifiedRange);
						const changes = [new DetailedLineRangeMapping(new LineRange(1, 1), new LineRange(1, lines.length), [innerChanges])];
						return {
							type: 'insert' as const,
							modifiedCellIndex: edit.index + i,
							diff: {
								changes,
								identical: false,
								moves: [],
								quitEarly: false
							}
						} satisfies ICellDiffInfo;
					});
					diff.splice(edit.index, 0, ...diffInsert);
					this._cellDiffInfo.set(diff, undefined);
				} else {
					// All existing indexes are shifted by number of cells removed.
					// And unchanged cells should be converted to deleted cells.
					const diff = this._cellDiffInfo.get().slice().map(d => {
						if (d.type === 'unchanged' && d.modifiedCellIndex >= (edit.index + edit.count - 1)) {
							const originalCell = this.originalModel.cells[d.originalCellIndex];
							const lines = new Array(originalCell.textBuffer.getLineCount()).fill(0).map((_, i) => originalCell.textBuffer.getLineContent(i + 1));
							const originalRange = new Range(1, 0, lines.length, lines[lines.length - 1].length);
							const modifiedRange = new Range(1, 0, 1, 0);
							const innerChanges = new RangeMapping(modifiedRange, originalRange);
							const changes = [new DetailedLineRangeMapping(new LineRange(1, lines.length), new LineRange(1, 1), [innerChanges])];

							// This will be deleted.
							return {
								type: 'delete' as const,
								originalCellIndex: d.originalCellIndex,
								diff: {
									changes,
									identical: false,
									moves: [],
									quitEarly: false
								}
							} satisfies ICellDiffInfo;
						}
						if (d.type !== 'delete' && d.modifiedCellIndex >= (edit.index + edit.count)) {
							d.modifiedCellIndex -= edit.count;
							return d;
						}
						return d;
					});
					this._cellDiffInfo.set(diff, undefined);
				}
			});
		}

		transaction((tx) => {
			if (!isLastEdits) {
				this._stateObs.set(WorkingSetEntryState.Modified, tx);
				this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
			} else {
				this._resetEditsState(tx);
				this._rewriteRatioObs.set(1, tx);
			}
		});
	}

	private _applyEdits(operation: () => void) {
		// make the actual edit
		// this._isEditFromUs = true;
		try {
			operation();
		} finally {
			// this._isEditFromUs = false;
		}
	}

	async getOrCreateModifiedTextFileEntryForCell(cell: NotebookCellTextModel): Promise<ChatEditingModifiedFileEntry | undefined> {
		let modifiedFileEntry = this.cellModels.get(cell);
		if (modifiedFileEntry) {
			return modifiedFileEntry;
		}
		const cellModel = await this.textModelService.createModelReference(cell.uri);
		modifiedFileEntry = this.cellModels.get(cell);
		if (modifiedFileEntry) {
			cellModel.dispose();
			return modifiedFileEntry;
		}

		const cellIndex = this.modifiedModel.cells.indexOf(cell);
		if (!this.originalModel.cells.length || cellIndex < 0 || this.originalModel.cells.length < (cellIndex + 1)) {
			return;
		}
		const originalText = this.originalModel.cells[cellIndex].getValue();
		modifiedFileEntry = this._register(this.instantiationService.createInstance(ChatEditingModifiedCellTextFileEntry, cellIndex, cellModel, this, this._telemetryInfo, this.chatEditKind, originalText));
		this.cellModels.set(cell, modifiedFileEntry);

		const disposable = autorun(r => {
			const index = this.modifiedModel.cells.indexOf(cell);
			if (modifiedFileEntry.disposed || index < 0) {
				return;
			}
			const cellDiff = modifiedFileEntry.diffInfo.read(r);
			const diffs = this.cellDiffInfo.get().slice();
			diffs[index].diff = cellDiff;
			if (diffs[index].type === 'unchanged' || diffs[index].type === 'modified') {
				diffs[index].type = cellDiff.identical ? 'unchanged' : 'modified';
			}
			this._cellDiffInfo.set(diffs, undefined);
		});

		modifiedFileEntry.onDispose(() => disposable.dispose());

		const entries = this.modifiedModel.cells.map(cell => this.cellModels.get(cell)).filter(entry => !!entry);
		this._entries.set(entries, undefined);

		return modifiedFileEntry;
	}
	async acceptAgentCellEdits(cell: NotebookCellTextModel, textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel) {
		const modifiedFileEntry = await this.getOrCreateModifiedTextFileEntryForCell(cell);
		if (!modifiedFileEntry) {
			return;
		}
		modifiedFileEntry.acceptAgentEdits(cell.uri, textEdits, isLastEdits, responseModel);
	}
	override async accept(transaction: ITransaction | undefined): Promise<void> {
		await Promise.all(this.modifiedModel.cells.map(cell => this.cellModels.get(cell)?.accept(transaction)));

		const stream = await this.notebookService.createNotebookTextDocumentSnapshot(this.modifiedModel.uri, SnapshotContext.Backup, CancellationToken.None);
		await this.notebookService.restoreNotebookTextModelFromSnapshot(this.original.notebook.uri, this.modifiedModel.viewType, stream);
		this.original.buffer = await streamToBuffer(stream);
		this.updateTrackedInfo(transaction);

		await super.accept(transaction);
	}
	override async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		const cellModels = this.modifiedModel.cells.map(cell => this.cellModels.get(cell)).filter(entry => !!entry);
		const allEditsInCellsAreFromus = cellModels.every(cell => cell.allEditsAreFromUs);
		await Promise.all(cellModels.map(item => item.reject(transaction)));

		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			//
		} else {
			await this.resetToInitialValueImpl();
			this.updateTrackedInfo(transaction);
			this.resourceRef.object.revert({ soft: true }); // WHY?
			if (this._allEditsAreFromUs && allEditsInCellsAreFromus) {
				// save the file after discarding so that the dirty indicator goes away
				// and so that an intermediate saved state gets reverted
				await this.resourceRef.object.save({ reason: SaveReason.EXPLICIT });
			}
		}
		await super.reject(transaction);
	}
}


export class NotebookSnapshotEntry implements INotebookSnapshotEntry {
	public readonly kind = 'notebook';
	constructor(
		public readonly original: VSBuffer,
		public readonly current: VSBuffer,
		public readonly resource: URI,
		public readonly snapshotUri: URI,
		public readonly state: WorkingSetEntryState,
		public readonly telemetryInfo: IModifiedEntryTelemetryInfo,
		public readonly viewType: string,
		public readonly originalToCurrentEdits: Map<number, OffsetEdit>,
		public readonly diffInfo: ICellDiffInfo[],

		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
	}

	public static async create(entry: ChatEditingModifiedNotebookEntry2, requestId: string | undefined,
		instantiationService: IInstantiationService): Promise<NotebookSnapshotEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const [originalStream, modifiedStream] = await Promise.all([
				notebookService.createNotebookTextDocumentSnapshot(entry.originalURI, SnapshotContext.Backup, CancellationToken.None),
				notebookService.createNotebookTextDocumentSnapshot(entry.modifiedURI, SnapshotContext.Backup, CancellationToken.None)
			]);

			const [original, modified] = await Promise.all([
				streamToBuffer(originalStream),
				streamToBuffer(modifiedStream)
			]);
			const originalToCurrentEdits = new Map<number, OffsetEdit>();
			await Promise.all(entry.modifiedModel.cells.map(async (cell, i) => {
				const modifiedFileEntry = await entry.getOrCreateModifiedTextFileEntryForCell(cell);
				if (modifiedFileEntry) {
					originalToCurrentEdits.set(i, modifiedFileEntry.originalToCurrentEdit);
				} else {
					originalToCurrentEdits.set(i, OffsetEdit.empty);
				}
			}));

			return instantiationService.createInstance(NotebookSnapshotEntry,
				original,
				modified,
				entry.modifiedURI,
				ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(requestId, entry.modifiedURI.path),
				entry.state.get(),
				entry.telemetryInfo,
				entry.originalModel.viewType,
				originalToCurrentEdits,
				entry.cellDiffInfo.read(undefined));
		});
	}

	public static async deserialize(entry: INotebookSnapshotEntryDTO, sessionId: string, instantiationService: IInstantiationService): Promise<NotebookSnapshotEntry> {
		const [original, current] = await readSnapshotContentFromStorage(entry, sessionId, instantiationService);

		const originalToCurrentEdits = new Map<number, OffsetEdit>();
		for (const key in entry.originalToCurrentEdits) {
			if (entry.originalToCurrentEdits.hasOwnProperty(key)) {
				originalToCurrentEdits.set(Number(key), OffsetEdit.fromJson(entry.originalToCurrentEdits[key]));
			}
		}

		return instantiationService.createInstance(NotebookSnapshotEntry,
			original,
			current,
			URI.parse(entry.resource),
			URI.parse(entry.snapshotUri),
			entry.state,
			{ requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, sessionId: sessionId, result: undefined },
			entry.viewType,
			originalToCurrentEdits,
			entry.diffInfo
		);
	}

	async serialize(): Promise<INotebookSnapshotEntryDTO> {
		const [originalHash, currentHash] = await writeSnapshotContentIntoStorage(this, this._instantiationService);
		const originalToCurrentEdits = Array.from(this.originalToCurrentEdits.entries()).reduce<Record<number, IOffsetEdit>>((edits, [cellIndex, cellEdits]) => {
			edits[cellIndex] = cellEdits.edits.map(edit => ({ pos: edit.replaceRange.start, len: edit.replaceRange.length, txt: edit.newText } satisfies ISingleOffsetEdit));
			return edits;
		}, {});

		return {
			kind: 'notebook',
			resource: this.resource.toString(),
			viewType: this.viewType,
			originalHash,
			currentHash,
			state: this.state,
			diffInfo: this.diffInfo,
			originalToCurrentEdits,
			snapshotUri: this.snapshotUri.toString(),
			telemetryInfo: { requestId: this.telemetryInfo.requestId, agentId: this.telemetryInfo.agentId, command: this.telemetryInfo.command }
		} satisfies INotebookSnapshotEntryDTO;
	}
}

export interface IModifiedCellTextFileEntry extends IModifiedTextFileEntry {
	readonly cellIndex: number;
}

class ChatEditingModifiedCellTextFileEntry extends ChatEditingModifiedFileEntry implements IModifiedCellTextFileEntry {
	constructor(
		public cellIndex: number,
		resourceRef: IReference<IResolvedTextEditorModel>,
		_multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		_telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string | undefined,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IChatService _chatService: IChatService,
		@IEditorWorkerService _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService _undoRedoService: IUndoRedoService,
		@IFileService _fileService: IFileService,
		@IConfigurationService configService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(resourceRef, _multiDiffEntryDelegate, _telemetryInfo, kind, initialContent, modelService, textModelService, languageService, configService, _chatService, _editorWorkerService, _undoRedoService, _fileService, instantiationService);
	}
}
