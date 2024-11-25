/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToReadableStream, streamToBuffer, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { hashAsync } from '../../../../../base/common/hash.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { INotebookService } from '../../../notebook/common/notebookService.js';
import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedNotebookFileEntry, INotebookChatEditDiff, INotebookSnapshotEntry, INotebookSnapshotEntryDTO, STORAGE_CONTENTS_FOLDER, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { getStorageLocation } from './chatEditingModifiedFileEntry.js';
import { ChatEditingNotebookFileSystemProvider } from '../../../notebook/browser/contrib/chatEdit/chatEditingNotebookFileSytemProviders.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { INotebookTextModel, ICellEditOperation, IResolvedNotebookEditorModel, ICell } from '../../../notebook/common/notebookCommon.js';
import { Disposable, DisposableStore, IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { IChatService } from '../../common/chatService.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { SequencerByKey, timeout } from '../../../../../base/common/async.js';
import { IOffsetEdit, ISingleOffsetEdit, OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { OffsetEdits } from '../../../../../editor/common/model/textModelOffsetEdit.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../nls.js';
import { SaveReason } from '../../../../common/editor.js';

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
		return this.docSnapshot.snapshotUri;
	}

	get modifiedURI(): URI {
		return this.modifiedModel.uri;
	}

	get modifiedModel(): INotebookTextModel {
		return this.doc;
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
	private _cellEdits = new Map<ICell, OffsetEdit>();
	private _isEditFromUs: boolean = false;
	private _diffOperationIds = new Map<ICell, number>();
	private readonly currentToOrignalCellMapping = new WeakMap<ICell, URI>();
	private _diffOperation = new SequencerByKey<ICell>();
	private notebookIsDisposing: boolean = false;
	private readonly cellChangeMonitor = this._register(new DisposableStore());

	private readonly _diffInfo: INotebookChatEditDiff = {
		inserted: observableValue('insertedCells', []),
		deleted: observableValue('deletedCells', []),
		cellChanges: observableValue('cellChanges', [])
	};
	get diffInfo(): INotebookChatEditDiff {
		return this._diffInfo;
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
			const notebook = resourceRef.object.notebook;
			const snapshot = await NotebookSnapshotEntry.create(notebook, WorkingSetEntryState.Modified, telemetryInfo.requestId, telemetryInfo, instantiationService);
			const notebookService = accessor.get(INotebookService);
			// Keep this, as we will need the original model for diffing later (e.g. diffing of cells to find diff per cell).
			const originalNotebook = await notebookService.createNotebookTextModel(notebook.viewType, snapshot.snapshotUri, bufferToReadableStream(snapshot.original));
			// Wait for text models of all cells to be resolved.
			// We cannot apply the edits without the text models of all cells being resolved.
			await Promise.all((notebook.cells.concat(originalNotebook.cells)).map(cell => ChatEditingModifiedNotebookFileEntry.waitForCellModelToBeAvailable(cell)));
			return instantiationService.createInstance(ChatEditingModifiedNotebookFileEntry, resourceRef, telemetryInfo, chatKind, snapshot, originalNotebook);
		});
	}
	private static async waitForCellModelToBeAvailable(cell: ICell): Promise<void> {
		if (cell.textModel) {
			return;
		}
		await Event.toPromise(cell.onDidChangeTextModel);
		return ChatEditingModifiedNotebookFileEntry.waitForCellModelToBeAvailable(cell);
	}

	constructor(
		resourceRef: IReference<IResolvedNotebookEditorModel>,
		private _telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		private readonly docSnapshot: NotebookSnapshotEntry,
		public readonly originalModel: INotebookTextModel,
		@IChatService private readonly _chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IFileService private readonly _fileService: IFileService,
		@INotebookService private readonly notebookService: INotebookService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		if (kind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}
		this.docFileEditorModel = this._register(resourceRef).object;
		this.doc = resourceRef.object.notebook;
		this.doc.cells.forEach((cell, index) => {
			const originalCell = originalModel.cells[index];
			this.currentToOrignalCellMapping.set(cell, originalCell.uri);
		});

		this._register(this.doc.onWillDispose(() => this.notebookIsDisposing = true));
		this._register(originalModel.onWillDispose(() => this.notebookIsDisposing = true));
		this.monitorChangesToCellContent();
		// this._register(this.doc.onDidChangeContent(e => this._mirrorEdits(e)));
		this._register(this._fileService.watch(this.modifiedURI));
		this._register(this._fileService.onDidFilesChange(e => {
			if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
				this._onDidDelete.fire();
			}
		}));

		// this._register(toDisposable(() => {
		// 	this._clearCurrentEditLineDecoration();
		// }));
	}

	private monitorChangesToCellContent() {
		this.cellChangeMonitor.clear();
		this.doc.cells.forEach(cell => {
			let handler: IDisposable | undefined = undefined;
			this._register(cell.onDidChangeTextModel(() => {
				if (cell.textModel) {
					handler?.dispose();
					handler = cell.textModel.onDidChangeContent(e => this._mirrorEdits(cell, e));
				}
			}));
		});
	}

	// private _clearCurrentEditLineDecoration() {
	// 	this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []);
	// }

	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo) {
		this._telemetryInfo = telemetryInfo;
	}

	createSnapshot(requestId: string | undefined): Promise<INotebookSnapshotEntry> {
		this._isFirstEditAfterStartOrSnapshot = true;
		return NotebookSnapshotEntry.create(this.doc, WorkingSetEntryState.Modified, requestId, this.telemetryInfo, this.instantiationService, this._cellEdits, this.diffInfo);
	}

	restoreFromSnapshot(snapshot: INotebookSnapshotEntry) {
		this._stateObs.set(snapshot.state, undefined);
		this.notebookService.restoreNotebookTextModelFromSnapshot(this.docSnapshot.snapshotUri, this.doc.viewType, bufferToReadableStream(snapshot.original));
		// Restore edits.
		this._cellEdits.clear();
		snapshot.originalToCurrentEdits.forEach((edits, cellIndex) => {
			const cell = this.doc.cells[cellIndex];
			if (cell) {
				this._cellEdits.set(cell, edits);
			}
		});
		// Restore diffs.
		this._diffInfo.deleted.set(snapshot.diffInfo.deleted.map(cellIndex => this.doc.cells[cellIndex].uri), undefined);
		this._diffInfo.inserted.set(snapshot.diffInfo.inserted.map(cellIndex => this.doc.cells[cellIndex].uri), undefined);
		this._diffInfo.cellChanges.set([], undefined);
		this.doc.cells.forEach(cell => this._updateDiffInfoSeq(true, cell));
	}

	resetToInitialValue() {
		this.notebookService.restoreNotebookTextModelFromSnapshot(this.docSnapshot.snapshotUri, this.doc.viewType, bufferToReadableStream(this.docSnapshot.original));
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
		const textModel = cell?.textModel;
		if (!cell || !textModel) {
			// Possible the user deleted this cell
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
			const didResetToOriginalContent = this.doc.cells.map(c => c.getHashValue()).join('#') === this.originalModel.cells.map(c => c.getHashValue()).join('#');
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

	acceptAgentNotebookEdits(edits: ICellEditOperation[]): void {
		// make the actual edit
		this._applyEdits(() => this.doc.applyEdits(edits, true, undefined, () => undefined, undefined, true));

		transaction((tx) => {
			this._stateObs.set(WorkingSetEntryState.Modified, tx);
			this._isCurrentlyBeingModifiedObs.set(true, tx);
		});
	}
	acceptAgentCellEdits(cellUri: URI, textEdits: TextEdit[], isLastEdits: boolean): void {
		const cell = this.doc.cells.find(cell => isEqual(cell.uri, cellUri));
		const textModel = cell?.textModel;
		if (!cell || !textModel) {
			// Possible the user deleted this cell
			return;
		}

		// // highlight edits
		// this._editDecorations = this.doc.deltaDecorations(this._editDecorations, textEdits.map(edit => {
		// 	return {
		// 		options: ChatEditingModifiedFileEntry._editDecorationOptions,
		// 		range: edit.range
		// 	} satisfies IModelDeltaDecoration;
		// }));
		// this._editDecorationClear.schedule();

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

				// Does this cell have a greater index than other cells that were modified?
				// If not, then we can ignore it.
				// We're only interested in the last cell that was changed.
				const indexOfCell = this.doc.cells.indexOf(cell);
				if (Array.from(this._cellEdits.keys()).every((c) => this.doc.cells.indexOf(c) < indexOfCell)) {
					// Calculate total number of lines until this cell.
					const lineCountOfPreviousCells = this.doc.cells.slice(0, indexOfCell).map(cell => cell.textModel?.getLineCount() ?? 0).reduce((a, b) => a + b, 0);
					const maxLineNumber = ops.reduce((max, op) => Math.max(max, op.range.endLineNumber), 0);
					const lineCount = this.doc.cells.map(cell => cell.textModel?.getLineCount() ?? 0).reduce((a, b) => a + b, 0);
					const rewriteRatio = Math.min(1, lineCountOfPreviousCells + maxLineNumber / lineCount);
					this._rewriteRatioObs.set(rewriteRatio, tx);
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

		const originalCell = this.currentToOrignalCellMapping.get(cell);
		const currentCellTextModel = cell.textModel;
		const originalCellTextModel = this.originalModel.cells.find(e => isEqual(e.uri, originalCell))?.textModel;
		if (!currentCellTextModel || !originalCellTextModel || !originalCell) {
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
			const allCellChanges = this._diffInfo.cellChanges.read(undefined);
			const cellChanges = allCellChanges.find(c => isEqual(c.cell, cell.uri));
			if (cellChanges) {
				cellChanges.changes.set(diff2, undefined);
			} else {
				allCellChanges.push({ cell: cell.uri, changes: observableValue(`CellChanges#${cell.handle}`, diff2) });
				this._diffInfo.cellChanges.set(allCellChanges, undefined);
			}
			this._cellEdits.set(cell, OffsetEdits.fromLineRangeMapping(originalCellTextModel, currentCellTextModel, diff2.changes));
		}
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		const buffer = await this.notebookService.createNotebookTextDocumentSnapshot(this.doc.uri, SnapshotContext.Backup, CancellationToken.None);
		this.notebookService.restoreNotebookTextModelFromSnapshot(this.docSnapshot.snapshotUri, this.doc.viewType, buffer);
		this._cellEdits.clear();
		this._diffInfo.deleted.set([], transaction);
		this._diffInfo.inserted.set([], transaction);
		this._diffInfo.cellChanges.set([], transaction);
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
			this.resetToInitialValue();
			this._cellEdits.clear();
			this._diffInfo.deleted.set([], transaction);
			this._diffInfo.inserted.set([], transaction);
			this._diffInfo.cellChanges.set([], transaction);
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
		public readonly diffInfo: { deleted: number[]; inserted: number[] },
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@INotebookService private readonly notebookService: INotebookService,
	) {
	}

	public static create(notebook: INotebookTextModel, state: WorkingSetEntryState, requestId: string | undefined, telemetryInfo: IModifiedEntryTelemetryInfo, instantiationService: IInstantiationService, cellEdits?: WeakMap<ICell, OffsetEdit>, diffInfo?: INotebookChatEditDiff): Promise<NotebookSnapshotEntry> {
		const originalUri = ChatEditingNotebookFileSystemProvider.getSnapshotFileURI(requestId, notebook.uri.path);
		return instantiationService.invokeFunction(async accessor => {
			const notebookService = accessor.get(INotebookService);
			const [original, current] = await Promise.all([
				notebookService.createNotebookTextDocumentSnapshot(originalUri, SnapshotContext.Backup, CancellationToken.None).then(stream => streamToBuffer(stream)),
				notebookService.createNotebookTextDocumentSnapshot(notebook.uri, SnapshotContext.Backup, CancellationToken.None).then(stream => streamToBuffer(stream)),
			]);
			const originalToCurrentEdits = new Map<number, OffsetEdit>();
			notebook.cells.forEach(cell => {
				const edits = cellEdits?.get(cell);
				if (edits) {
					originalToCurrentEdits.set(notebook.cells.indexOf(cell), edits);
				}
			});
			const diff = diffInfo ? {
				deleted: diffInfo.deleted.get().map(cell => notebook.cells.findIndex(c => isEqual(c.uri, cell))).filter(i => i !== -1),
				inserted: diffInfo.deleted.get().map(cell => notebook.cells.findIndex(c => isEqual(c.uri, cell))).filter(i => i !== -1)
			} :
				{ deleted: [], inserted: [] };

			return instantiationService.createInstance(NotebookSnapshotEntry,
				notebook.uri,
				notebook.viewType,
				originalUri,
				original,
				current,
				state,
				telemetryInfo,
				originalToCurrentEdits,
				diff
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


	public async restore() {
		await this.notebookService.restoreNotebookTextModelFromSnapshot(this.resource, this.viewType, bufferToReadableStream(this.current));
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
