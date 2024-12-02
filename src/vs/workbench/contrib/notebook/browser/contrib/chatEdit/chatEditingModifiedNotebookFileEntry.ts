/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToReadableStream, streamToBuffer, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { hashAsync } from '../../../../../../base/common/hash.js';
import { isEqual, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { SnapshotContext } from '../../../../../services/workingCopy/common/fileWorkingCopy.js';
import { INotebookService } from '../../../common/notebookService.js';
import { ChatEditKind, ICellDiffInfo, IModifiedEntryTelemetryInfo, IModifiedNotebookFileEntry, INotebookSnapshotEntry, INotebookSnapshotEntryDTO, ISnapshotEntry, STORAGE_CONTENTS_FOLDER, WorkingSetEntryState } from '../../../../chat/common/chatEditingService.js';
import { getStorageLocation } from '../../../../chat/browser/chatEditing/chatEditingModifiedFileEntry.js';
import { ChatEditingNotebookFileSystemProvider } from './chatEditingNotebookFileSytemProviders.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IObservable, ITransaction, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { nullDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { INotebookTextModel, ICellEditOperation, IResolvedNotebookEditorModel, ICell, CellEditType } from '../../../common/notebookCommon.js';
import { Disposable, DisposableStore, IReference } from '../../../../../../base/common/lifecycle.js';
import { IChatService } from '../../../../chat/common/chatService.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { IUndoRedoService } from '../../../../../../platform/undoRedo/common/undoRedo.js';
import { SequencerByKey, timeout } from '../../../../../../base/common/async.js';
import { IOffsetEdit, ISingleOffsetEdit, OffsetEdit } from '../../../../../../editor/common/core/offsetEdit.js';
import { SingleModelEditStackElement } from '../../../../../../editor/common/model/editStack.js';
import { OffsetEdits } from '../../../../../../editor/common/model/textModelOffsetEdit.js';
import { IModelContentChangedEvent } from '../../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../../nls.js';
import { SaveReason } from '../../../../../common/editor.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { INotebookEditorModelResolverService } from '../../../common/notebookEditorModelResolverService.js';
import { TextEdit } from '../../../../../../editor/common/languages.js';
import { DetailedLineRangeMapping, RangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../../editor/common/core/lineRange.js';
import { ISettableObservable } from '../../../../../../base/common/observableInternal/base.js';

export class ChatEditingModifiedNotebookFileEntry extends Disposable implements IModifiedNotebookFileEntry {
	public readonly kind = 'notebook';
	public static readonly scheme = 'modified-notbook-file-entry';
	private static lastEntryId = 0;
	public readonly entryId = `${ChatEditingModifiedNotebookFileEntry.scheme}::${++ChatEditingModifiedNotebookFileEntry.lastEntryId}`;

	private readonly doc: INotebookTextModel;
	private readonly docFileEditorModel: IResolvedNotebookEditorModel;
	private _allEditsAreFromUs: boolean = true;

	private readonly _onDidDelete = this._register(new Emitter<void>());
	public get onDidDelete() {
		return this._onDidDelete.event;
	}

	get originalURI(): URI {
		return this.original.notebook.uri;
	}

	get modifiedURI(): URI {
		return this.modifiedModel.uri;
	}

	get modifiedModel(): INotebookTextModel {
		return this.doc;
	}

	get originalModel(): INotebookTextModel {
		return this.original.notebook;
	}

	private readonly _stateObs = observableValue<WorkingSetEntryState>(this, WorkingSetEntryState.Modified);
	public get state(): IObservable<WorkingSetEntryState> {
		return this._stateObs;
	}

	private readonly _isCurrentlyBeingModifiedObs = observableValue<boolean>(this, false);
	public get isCurrentlyBeingModified(): IObservable<boolean> {
		return this._isCurrentlyBeingModifiedObs;
	}

	private readonly _rewriteRatioObs = observableValue<number>(this, 0);
	public get rewriteRatio(): IObservable<number> {
		return this._rewriteRatioObs;
	}

	private _isFirstEditAfterStartOrSnapshot: boolean = true;
	public _cellEdits = new WeakMap<ICell, OffsetEdit>();
	private _isEditFromUs: boolean = false;
	private _diffOperationIds = new WeakMap<ICell, number>();
	private _lastModifiedLineNumber = new WeakMap<ICell, ISettableObservable<number>>();
	private readonly currentToOrignalCellMapping = new WeakMap<ICell, URI>();
	private _diffOperation = new SequencerByKey<ICell>();
	private _acceptAgentCellEdits = new SequencerByKey<ICell>();
	private notebookIsDisposing: boolean = false;
	private readonly cellChangeMonitor = this._register(new DisposableStore());

	private readonly _cellDiffInfo = observableValue<ICellDiffInfo[]>('diffInfo', []);

	get cellDiffInfo(): IObservable<ICellDiffInfo[]> {
		return this._cellDiffInfo;
	}

	get telemetryInfo(): IModifiedEntryTelemetryInfo {
		return this._telemetryInfo;
	}

	readonly createdInRequestId: string | undefined;

	get lastModifyingRequestId() {
		return this._telemetryInfo.requestId;
	}

	public get viewType() {
		return this.doc.viewType;
	}

	public static async create(resourceRef: IReference<IResolvedNotebookEditorModel>, chatKind: ChatEditKind, telemetryInfo: IModifiedEntryTelemetryInfo, instantiationService: IInstantiationService): Promise<ChatEditingModifiedNotebookFileEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const resolver = accessor.get(INotebookEditorModelResolverService);

			const notebookDisposables = new DisposableStore();
			notebookDisposables.add(resourceRef);
			const notebook = resourceRef.object.notebook;

			const buffer = await notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then(s => streamToBuffer(s));
			const originalUri = ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(telemetryInfo.requestId, notebook.uri.path);
			const originalDisposables = new DisposableStore();
			originalDisposables.add(ChatEditingNotebookFileSystemProvider.registerFile(originalUri, buffer));
			// Keep this, as we will need the original model for diffing later (e.g. diffing of cells to find diff per cell).
			const ref = await resolver.resolve(originalUri, notebook.viewType);
			originalDisposables.add(ref);

			return instantiationService.createInstance(ChatEditingModifiedNotebookFileEntry, resourceRef, notebookDisposables, telemetryInfo, chatKind, { notebook: ref.object.notebook, buffer, disposables: originalDisposables });
		});
	}

	constructor(
		resourceRef: IReference<IResolvedNotebookEditorModel>,
		private readonly notebookDisposables: DisposableStore,
		private _telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		public original: { notebook: NotebookTextModel; buffer: VSBuffer; disposables: DisposableStore },
		@IChatService private readonly _chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IFileService private readonly _fileService: IFileService,
		@INotebookService private readonly notebookService: INotebookService,
		@ITextModelService private readonly modelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookEditorModelResolverService private readonly notebookResolver: INotebookEditorModelResolverService,
	) {
		super();
		if (kind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}
		this.docFileEditorModel = resourceRef.object;
		this.doc = resourceRef.object.notebook;
		this._register(notebookDisposables);
		this._register(original.disposables);

		this._register(this.doc.onWillDispose(() => this.notebookIsDisposing = true));
		this._register(original.notebook.onWillDispose(() => this.notebookIsDisposing = true));
		this.updateTrackedInfo();
		// this._register(this.doc.onDidChangeContent(e => this._mirrorEdits(e)));
		this._register(this._fileService.watch(this.modifiedURI));
		this._register(this._fileService.onDidFilesChange(e => {
			if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
				this._onDidDelete.fire();
			}
		}));
	}

	private updateTrackedInfo(transaction?: ITransaction) {
		this.doc.cells.forEach((cell, index) => {
			this._cellEdits.delete(cell);
			if (index < this.original.notebook.cells.length) {
				const originalCell = this.original.notebook.cells[index];
				this.currentToOrignalCellMapping.set(cell, originalCell.uri);
			}
		});
		this.monitorChangesToCellContent();

		this._cellDiffInfo.set(this.doc.cells.map((_, i) => ({ type: 'unchanged', modifiedCellIndex: i, originalCellIndex: i, diff: nullDocumentDiff }) satisfies ICellDiffInfo), transaction);
	}

	private async monitorChangesToCellContent() {
		this.cellChangeMonitor.clear();
		// We need to check if user makes changes to any of the cells and preserve those edits when applying copilot edits.
		this.doc.cells.map(cell => {
			if (cell.textModel) {
				this.cellChangeMonitor.add(cell.textModel.onDidChangeContent(e => this._mirrorEdits(cell, e)));
			} else {
				this.cellChangeMonitor.add(Event.once(cell.onDidChangeTextModel)(this.monitorChangesToCellContent.bind(this)));
			}
		});
	}

	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo) {
		this._telemetryInfo = telemetryInfo;
	}

	createSnapshot(requestId: string | undefined): Promise<ISnapshotEntry> {
		this._isFirstEditAfterStartOrSnapshot = true;
		return NotebookSnapshotEntry.create(this, requestId, this.instantiationService);
	}

	async restoreFromSnapshot(snapshot: ISnapshotEntry) {
		if (snapshot.kind !== 'notebook') {
			throw new Error('Invalid snapshot');

		}
		const promises: Promise<unknown>[] = [this.notebookService.restoreNotebookTextModelFromSnapshot(this.doc.uri, this.doc.viewType, bufferToReadableStream(snapshot.current))];

		if (isEqual(this.originalURI, snapshot.snapshotUri)) {
			// Update the model in place, thats cheaper, as the Uris match
			promises.push(this.notebookService.restoreNotebookTextModelFromSnapshot(this.original.notebook.uri, this.doc.viewType, bufferToReadableStream(snapshot.original)));
		} else {
			// Dispose the old model and create a new one.
			this.original.disposables.clear();
			// This is required when we resolve the cell text models.
			// Resolving cell models end up resolving notebook from Uri, which reads from the file system.
			this.original.disposables.add(ChatEditingNotebookFileSystemProvider.registerFile(snapshot.snapshotUri, snapshot.original));
			// Keep this, as we will need the original model for diffing later (e.g. diffing of cells to find diff per cell).
			const ref = await this.notebookResolver.resolve(snapshot.snapshotUri, this.doc.viewType);
			this.original.notebook = ref.object.notebook;
			this.original.buffer = snapshot.original;
			this.original.disposables.add(ref);
		}

		await Promise.all(promises);

		this.updateTrackedInfo();

		this._stateObs.set(snapshot.state, undefined);

		// Restore edits.
		snapshot.originalToCurrentEdits.forEach((edits, cellIndex) => {
			const cell = this.doc.cells[cellIndex];
			if (cell) {
				this._cellEdits.set(cell, edits);
			}
		});
		// Restore diffs.
		this._cellDiffInfo.set(snapshot.diffInfo.map(d => {
			if (d.type === 'modified') {
				return {
					...d,
					diff: nullDocumentDiff // Best we re-compute it again.
				};
			}
			return d;
		}), undefined);
		this.doc.cells.forEach(cell => this._updateDiffInfoSeq(true, cell));
	}

	async resetToInitialValue() {
		await this.resetToInitialValueImpl();
		this.updateTrackedInfo();
	}

	async resetToInitialValueImpl() {
		await this.notebookService.restoreNotebookTextModelFromSnapshot(this.doc.uri, this.doc.viewType, bufferToReadableStream(this.original.buffer));
	}

	acceptStreamingEditsStart(tx: ITransaction) {
		this._resetEditsState(tx);
	}

	acceptStreamingEditsEnd(tx: ITransaction) {
		this._resetEditsState(tx);
	}

	private _resetEditsState(tx: ITransaction): void {
		this._isCurrentlyBeingModifiedObs.set(false, tx);
		this._rewriteRatioObs.set(0, tx);
	}

	private _mirrorEdits(cell: ICell, event: IModelContentChangedEvent): void {
		const textModel = cell.textModel;
		if (!textModel) {
			// Unlikely scenario.
			return;
		}

		const edit = OffsetEdits.fromContentChanges(event.changes);
		const cellEdits = this._cellEdits.get(cell) ?? OffsetEdit.empty;
		if (this._isEditFromUs) {
			const e_sum = cellEdits;
			const e_ai = edit;
			this._cellEdits.set(cell, e_sum.compose(e_ai));
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

			const e_ai = cellEdits;
			const e_user = edit;
			const e_user_r = e_user.tryRebase(e_ai.inverse(textModel.getValue()), true);

			if (e_user_r === undefined) {
				// user edits overlaps/conflicts with AI edits
				this._cellEdits.set(cell, e_ai.compose(e_user));
			} else {
				const edits = OffsetEdits.asEditOperations(e_user_r, textModel);
				textModel.applyEdits(edits);
				this._cellEdits.set(cell, e_ai.tryRebase(e_user_r));
			}

			this._allEditsAreFromUs = false;
		}

		if (!this.isCurrentlyBeingModified.get()) {
			// All we care about are cells when comparing the original content with the current content
			// Metadata/output do not change via copilot edits.
			const didResetToOriginalContent = this.doc.cells.map(c => c.getHashValue()).join('#') === this.original.notebook.cells.map(c => c.getHashValue()).join('#');
			const currentState = this._stateObs.get();
			switch (currentState) {
				case WorkingSetEntryState.Modified:
					if (didResetToOriginalContent) {
						this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
						break;
					}
			}
		}

		this._updateDiffInfoSeq(!this._isEditFromUs, cell);
	}

	async acceptAgentNotebookEdits(edits: ICellEditOperation[], isLastEdits: boolean): Promise<void> {
		// First wait for all cell edits to be applied.
		// Possible we could end up moving cells around, so we need to wait for all cell edits to be applied.
		await Promise.all(this.doc.cells.map(cell => this._acceptAgentCellEdits.queue(cell, () => Promise.resolve())));

		if (edits.length) {
			// make the actual edit
			this._applyEdits(() => this.doc.applyEdits(edits, true, undefined, () => undefined, undefined, true));
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
				this._isCurrentlyBeingModifiedObs.set(true, tx);
			} else {
				this._resetEditsState(tx);
				this._rewriteRatioObs.set(1, tx);
			}
		});

	}
	private async getCellTextModel(cell: ICell, store: DisposableStore): Promise<ITextModel | undefined> {
		if (cell.textModel) {
			return cell.textModel;
		}
		const ref = await this.modelService.createModelReference(cell.uri);
		store.add(ref);
		return ref.object.textEditorModel;
	}

	acceptAgentCellEdits(cellUri: URI, textEdits: TextEdit[], isLastEdits: boolean): void {
		// Copilot sends empty edits as a way to signal the start of edits.
		if (isEqual(this.doc.uri, cellUri)) {
			return;
		}
		const cell = this.doc.cells.find(cell => isEqual(cell.uri, cellUri));
		if (!cell) {
			// Possible the user deleted this cell
			return;
		}
		this._acceptAgentCellEdits.queue(cell, async () => {
			const textModel = cell ? await this.getCellTextModel(cell, this.notebookDisposables) : undefined;
			if (textModel) {
				this.acceptAgentCellEditsImpl(cell, textModel, textEdits, isLastEdits);
			}
		});
	}
	acceptAgentCellEditsImpl(cell: ICell, textModel: ITextModel, textEdits: TextEdit[], isLastEdits: boolean): void {
		if (!cell || !textModel) {
			// Possible the user deleted this cell
			return;
		}

		// push stack element for the first edit
		if (this._isFirstEditAfterStartOrSnapshot) {
			this._isFirstEditAfterStartOrSnapshot = false;
			const request = this._chatService.getSession(this._telemetryInfo.sessionId)?.getRequests().at(-1);
			const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
			this._undoRedoService.pushElement(new SingleModelEditStackElement(label, 'chat.edit', textModel, null));
		}

		const ops = textEdits.map(TextEdit.asEditOperation);
		this._applyEdits(() => textModel.pushEditOperations(null, ops, () => null));

		transaction((tx) => {
			if (!isLastEdits) {
				this._stateObs.set(WorkingSetEntryState.Modified, tx);
				this._isCurrentlyBeingModifiedObs.set(true, tx);

				// Is this current cell after any of the other cells that were previously edited?
				// If not, then we can ignore it.
				// We're only interested in the last cell that was changed.
				const indexOfCell = this.doc.cells.indexOf(cell);
				if (this.doc.cells.some(c => this._cellEdits.get(c) && indexOfCell > this.doc.cells.indexOf(c))) {
					// Calculate total number of lines until this cell.
					const lineCountOfPreviousCells = this.doc.cells.slice(0, indexOfCell).map(cell => cell.textBuffer.getLineCount()).reduce((a, b) => a + b, 0);
					const maxLineNumber = ops.reduce((max, op) => Math.max(max, op.range.endLineNumber), 0);
					const lineCount = this.doc.cells.map(cell => cell.textBuffer.getLineCount()).reduce((a, b) => a + b, 0);
					const rewriteRatio = Math.min(1, lineCountOfPreviousCells + maxLineNumber / lineCount);
					this._rewriteRatioObs.set(rewriteRatio, tx);

					const obs = this._lastModifiedLineNumber.get(cell) ?? observableValue<number>(`lastModifiedLineNumber${cell.handle}`, 0);
					this._lastModifiedLineNumber.set(cell, obs);

					obs.set(maxLineNumber, tx);
					const diffInfo = this._cellDiffInfo.get().slice();
					const diff = diffInfo.filter(d => d.type === 'modified').find(d => d.modifiedCellIndex === indexOfCell);
					if (diff) {
						diff.maxLineNumber = maxLineNumber;
						this._cellDiffInfo.set(diffInfo, tx);
					}
				}
			} else {
				this._resetEditsState(tx);
				this._updateDiffInfoSeq(true, cell);
				this._rewriteRatioObs.set(1, tx);
			}
		});
	}

	private _applyEdits(operation: () => void) {
		// make the actual edit
		this._isEditFromUs = true;
		try {
			operation();
		} finally {
			this._isEditFromUs = false;
		}
	}


	private _updateDiffInfoSeq(fast: boolean, cell: ICell) {
		(() => {
			const myDiffOperationId = (this._diffOperationIds.get(cell) ?? 0) + 1;
			this._diffOperationIds.set(cell, myDiffOperationId);
			this._diffOperation.queue(cell, async () => {
				if (this._diffOperationIds.get(cell) === myDiffOperationId) {
					await this._updateDiffInfo(fast, cell);
				}
			});
		})();
	}

	private async _updateDiffInfo(fast: boolean, cell: ICell): Promise<void> {
		if (this.notebookIsDisposing) {
			return;
		}

		const originalCellUri = this.currentToOrignalCellMapping.get(cell);
		const originalCell = originalCellUri ? this.original.notebook.cells.find(e => isEqual(e.uri, originalCellUri)) : undefined;
		const [currentCellTextModel, originalCellTextModel] = await Promise.all([
			this.getCellTextModel(cell, this.notebookDisposables),
			originalCell ? await this.getCellTextModel(originalCell, this.original.disposables) : undefined
		]);
		if (!currentCellTextModel || !originalCellTextModel || !originalCellUri) {
			return;
		}

		const docVersionNow = currentCellTextModel.getVersionId();
		const snapshotVersionNow = originalCellTextModel.getVersionId();

		const [diff] = await Promise.all([
			this._editorWorkerService.computeDiff(
				originalCellTextModel.uri,
				currentCellTextModel.uri,
				{ computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: 3000 },
				'advanced'
			),
			timeout(fast ? 50 : 800) // DON't diff too fast
		]);

		if (this.notebookIsDisposing) {
			return;
		}

		// only update the diff if the documents didn't change in the meantime
		if (currentCellTextModel.getVersionId() === docVersionNow && originalCellTextModel.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;
			this._cellEdits.set(cell, OffsetEdits.fromLineRangeMapping(originalCellTextModel, currentCellTextModel, diff2.changes));

			const index = this.doc.cells.indexOf(cell);
			if (index >= 0) {
				const diffInfo = this._cellDiffInfo.get().slice().map(d => {
					if (d.type === 'modified' && d.modifiedCellIndex === index) {
						if (diff2.identical) {
							return {
								modifiedCellIndex: index,
								originalCellIndex: d.originalCellIndex,
								type: 'unchanged',
								diff: nullDocumentDiff
							} satisfies ICellDiffInfo;
						}
						return {
							...d,
							diff: diff2
						} satisfies ICellDiffInfo;
					} else if (d.type === 'unchanged' && d.modifiedCellIndex === index) {
						if (diff2.identical) {
							return {
								modifiedCellIndex: index,
								originalCellIndex: d.originalCellIndex,
								type: 'unchanged',
								diff: nullDocumentDiff
							} satisfies ICellDiffInfo;
						}
						return {
							type: 'modified',
							modifiedCellIndex: index,
							originalCellIndex: d.originalCellIndex,
							diff: diff2,
							maxLineNumber: this._lastModifiedLineNumber.get(cell)?.get() ?? 0
						} satisfies ICellDiffInfo;
					}
					return d;
				});
				this._cellDiffInfo.set(diffInfo, undefined);
			}
		}
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		const stream = await this.notebookService.createNotebookTextDocumentSnapshot(this.doc.uri, SnapshotContext.Backup, CancellationToken.None);
		await this.notebookService.restoreNotebookTextModelFromSnapshot(this.original.notebook.uri, this.doc.viewType, stream);
		this.original.buffer = await streamToBuffer(stream);
		this.updateTrackedInfo(transaction);
		this._stateObs.set(WorkingSetEntryState.Accepted, transaction);
		this._notifyAction('accepted');
	}

	async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this._stateObs.set(WorkingSetEntryState.Rejected, transaction);
		this._notifyAction('rejected');
		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			await this._fileService.del(this.modifiedURI);
			this._onDidDelete.fire();
		} else {
			await this.resetToInitialValueImpl();
			this.updateTrackedInfo(transaction);
			this.docFileEditorModel.revert({ soft: true });
			if (this._allEditsAreFromUs) {
				// save the file after discarding so that the dirty indicator goes away
				// and so that an intermediate saved state gets reverted
				await this.docFileEditorModel.save({ reason: SaveReason.EXPLICIT });
			}
		}
	}


	private _notifyAction(outcome: 'accepted' | 'rejected') {
		this._chatService.notifyUserAction({
			action: { kind: 'chatEditingSessionAction', uri: this.modifiedURI, hasRemainingEdits: false, outcome },
			agentId: this._telemetryInfo.agentId,
			command: this._telemetryInfo.command,
			sessionId: this._telemetryInfo.sessionId,
			requestId: this._telemetryInfo.requestId,
			result: this._telemetryInfo.result
		});
	}
}

export class NotebookSnapshotEntry implements INotebookSnapshotEntry {
	public readonly kind = 'notebook';

	constructor(
		public readonly resource: URI,
		public readonly viewType: string,
		public readonly snapshotUri: URI,
		public readonly original: VSBuffer,
		public readonly current: VSBuffer,
		public readonly state: WorkingSetEntryState,
		public readonly telemetryInfo: IModifiedEntryTelemetryInfo,
		public readonly originalToCurrentEdits: Map<number, OffsetEdit>,
		public readonly diffInfo: ICellDiffInfo[],
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
	}

	public static create(entry: ChatEditingModifiedNotebookFileEntry, requestId: string | undefined, instantiationService: IInstantiationService): Promise<NotebookSnapshotEntry> {
		const originalUri = entry.originalURI;
		return instantiationService.invokeFunction(async accessor => {
			const notebook = entry.modifiedModel;
			const notebookService = accessor.get(INotebookService);
			const original = entry.original.buffer;
			const current = await notebookService.createNotebookTextDocumentSnapshot(entry.modifiedURI, SnapshotContext.Backup, CancellationToken.None).then(stream => streamToBuffer(stream));
			const originalToCurrentEdits = new Map<number, OffsetEdit>();
			notebook.cells.forEach(cell => {
				const edits = entry._cellEdits.get(cell);
				if (edits) {
					originalToCurrentEdits.set(notebook.cells.indexOf(cell), edits);
				}
			});

			return instantiationService.createInstance(NotebookSnapshotEntry,
				notebook.uri,
				notebook.viewType,
				originalUri,
				original,
				current,
				entry.state.get(),
				entry.telemetryInfo,
				originalToCurrentEdits,
				entry.cellDiffInfo.read(undefined)
			);
		});
	}

	public static async deserialize(entry: INotebookSnapshotEntryDTO, chatSessionId: string, instantiationService: IInstantiationService): Promise<NotebookSnapshotEntry> {
		return instantiationService.invokeFunction(async accessor => {
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const environmentService = accessor.get(IEnvironmentService);
			const fileService = accessor.get(IFileService);
			const storageLocation = getStorageLocation(chatSessionId, workspaceContextService, environmentService);

			const [original, current] = await Promise.all([
				getFileContent(entry.originalHash, fileService, storageLocation),
				getFileContent(entry.currentHash, fileService, storageLocation)
			]);

			const originalToCurrentEdits = new Map<number, OffsetEdit>();
			for (const key in entry.originalToCurrentEdits) {
				if (entry.originalToCurrentEdits.hasOwnProperty(key)) {
					originalToCurrentEdits.set(Number(key), OffsetEdit.fromJson(entry.originalToCurrentEdits[key]));
				}
			}

			return instantiationService.createInstance(NotebookSnapshotEntry,
				URI.parse(entry.resource),
				entry.viewType,
				URI.parse(entry.snapshotUri),
				original,
				current,
				entry.state,
				{ requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, sessionId: chatSessionId, result: undefined },
				originalToCurrentEdits,
				entry.diffInfo
			);
		});
	}
	async serialize(): Promise<INotebookSnapshotEntryDTO> {
		const fileContents = new Map<string, string>();
		const [originalHash, currentHash] = await Promise.all([
			this.computeContentHash(this.original),
			this.computeContentHash(this.current)
		]);

		const originalToCurrentEdits = Array.from(this.originalToCurrentEdits.entries()).reduce<Record<number, IOffsetEdit>>((edits, [cellIndex, cellEdits]) => {
			edits[cellIndex] = cellEdits.edits.map(edit => ({ pos: edit.replaceRange.start, len: edit.replaceRange.length, txt: edit.newText } satisfies ISingleOffsetEdit));
			return edits;
		}, {});

		const serialized = {
			kind: 'notebook',
			resource: this.resource.toString(),
			viewType: this.viewType,
			originalHash,
			currentHash,
			state: this.state,
			snapshotUri: this.snapshotUri.toString(),
			telemetryInfo: { requestId: this.telemetryInfo.requestId, agentId: this.telemetryInfo.agentId, command: this.telemetryInfo.command },
			diffInfo: this.diffInfo,
			originalToCurrentEdits,
		} satisfies INotebookSnapshotEntryDTO;

		const storageFolder = getStorageLocation(this.telemetryInfo.sessionId, this._workspaceContextService, this._environmentService);
		const contentsFolder = URI.joinPath(storageFolder, STORAGE_CONTENTS_FOLDER);

		await Promise.all(Array.from(fileContents.entries()).map(async ([hash, content]) => {
			const file = joinPath(contentsFolder, hash);
			if (!(await this._fileService.exists(file))) {
				await this._fileService.writeFile(joinPath(contentsFolder, hash), VSBuffer.fromString(content));
			}
		}));

		return serialized;
	}
	private async computeContentHash(content: VSBuffer): Promise<string> {
		const hash = await hashAsync(content);
		return hash.substring(0, 7);
	}
}


function getFileContent(hash: string, fileService: IFileService, storageLocation: URI) {
	return fileService.readFile(joinPath(storageLocation, STORAGE_CONTENTS_FOLDER, hash)).then(content => content.value);
}
