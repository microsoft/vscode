/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { RunOnceScheduler } from '../../../../../base/common/async.js';
// import { VSBuffer } from '../../../../../base/common/buffer.js';
// import { Event } from '../../../../../base/common/event.js';
// import { IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
// import { Schemas } from '../../../../../base/common/network.js';
// import { autorun, IObservable, ITransaction, transaction } from '../../../../../base/common/observable.js';
// import { themeColorFromId } from '../../../../../base/common/themables.js';
// import { URI } from '../../../../../base/common/uri.js';
// import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
// import { ISingleOffsetEdit, OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
// import { Range } from '../../../../../editor/common/core/range.js';
// import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
// import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
// import { TextEdit } from '../../../../../editor/common/languages.js';
// import { ILanguageService } from '../../../../../editor/common/languages/language.js';
// import { IModelDeltaDecoration, ITextModel, OverviewRulerLane } from '../../../../../editor/common/model.js';
// import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
// import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
// import { OffsetEdits } from '../../../../../editor/common/model/textModelOffsetEdit.js';
// import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
// import { IModelService } from '../../../../../editor/common/services/model.js';
// import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
// import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
// import { localize } from '../../../../../nls.js';
// import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
// import { IFileService } from '../../../../../platform/files/common/files.js';
// import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
// import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
// import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
// import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
// import { SaveReason } from '../../../../common/editor.js';
// import { IResolvedTextFileEditorModel, stringToSnapshot } from '../../../../services/textfile/common/textfiles.js';
// import { ChatEditKind, IModifiedEntryTelemetryInfo, IModifiedTextFileEntry, ITextSnapshotEntry, ITextSnapshotEntryDTO, WorkingSetEntryState } from '../../common/chatEditingService.js';
// import { IChatService } from '../../common/chatService.js';
// import { ChatEditingModifiedBaseFileEntry, readSnapshotContentFromStorage, writeSnapshotContentIntoStorage } from './chatEditingModifiedFileEntry.js';
// import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';


// export class ChatEditingModifiedTextFileEntry extends ChatEditingModifiedBaseFileEntry implements IModifiedTextFileEntry {
// 	public readonly kind = 'text';
// 	private readonly docSnapshot: ITextModel;
// 	public readonly initialContent: string;
// 	private readonly doc: ITextModel;
// 	private readonly docFileEditorModel: IResolvedTextFileEditorModel;
// 	get originalURI(): URI {
// 		return this.docSnapshot.uri;
// 	}

// 	get originalModel(): ITextModel {
// 		return this.docSnapshot;
// 	}

// 	get modifiedURI(): URI {
// 		return this.modifiedModel.uri;
// 	}

// 	get modifiedModel(): ITextModel {
// 		return this.doc;
// 	}
// 	private _edit: OffsetEdit = OffsetEdit.empty;
// 	public get originalToCurrentEdit(): OffsetEdit {
// 		return this._edit;
// 	}
// 	private _isEditFromUs: boolean = false;
// 	private _diffOperation: Promise<any> | undefined;
// 	private _diffOperationIds: number = 0;

// 	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []); }, 500));
// 	private _editDecorations: string[] = [];

// 	private static readonly _lastEditDecorationOptions = ModelDecorationOptions.register({
// 		isWholeLine: true,
// 		description: 'chat-last-edit',
// 		className: 'chat-editing-last-edit-line',
// 		marginClassName: 'chat-editing-last-edit',
// 		overviewRuler: {
// 			position: OverviewRulerLane.Full,
// 			color: themeColorFromId(editorSelectionBackground)
// 		},
// 	});

// 	private static readonly _pendingEditDecorationOptions = ModelDecorationOptions.register({
// 		isWholeLine: true,
// 		description: 'chat-pending-edit',
// 		className: 'chat-editing-pending-edit',
// 	});

// 	private readonly _diffTrimWhitespace: IObservable<boolean>;

// 	constructor(
// 		resourceRef: IReference<IResolvedTextEditorModel>,
// 		_multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
// 		_telemetryInfo: IModifiedEntryTelemetryInfo,
// 		kind: ChatEditKind,
// 		initialContent: string | undefined,
// 		@IModelService modelService: IModelService,
// 		@ITextModelService textModelService: ITextModelService,
// 		@ILanguageService languageService: ILanguageService,
// 		@IConfigurationService configService: IConfigurationService,
// 		@IChatService _chatService: IChatService,
// 		@IEditorWorkerService _editorWorkerService: IEditorWorkerService,
// 		@IUndoRedoService _undoRedoService: IUndoRedoService,
// 		@IFileService _fileService: IFileService,
// 		@IInstantiationService instantiationService: IInstantiationService,
// 	) {
// 		super(_multiDiffEntryDelegate, _telemetryInfo, kind, configService, _chatService, _editorWorkerService,
// 			_undoRedoService, _fileService, instantiationService);
// 		this.docFileEditorModel = this._register(resourceRef).object as IResolvedTextFileEditorModel;
// 		this.doc = resourceRef.object.textEditorModel;

// 		this.initialContent = initialContent ?? this.doc.getValue();
// 		const docSnapshot = this.docSnapshot = this._register(
// 			modelService.createModel(
// 				createTextBufferFactoryFromSnapshot(initialContent ? stringToSnapshot(initialContent) : this.doc.createSnapshot()),
// 				languageService.createById(this.doc.getLanguageId()),
// 				ChatEditingTextModelContentProvider.getFileURI(_telemetryInfo.sessionId, this.entryId, this.modifiedURI.path),
// 				false
// 			)
// 		);

// 		// Create a reference to this model to avoid it being disposed from under our nose
// 		(async () => {
// 			const reference = await textModelService.createModelReference(docSnapshot.uri);
// 			if (this._store.isDisposed) {
// 				reference.dispose();
// 				return;
// 			}
// 			this._register(reference);
// 		})();


// 		this._register(this.doc.onDidChangeContent(e => this._mirrorEdits(e)));

// 		if (this.modifiedURI.scheme !== Schemas.untitled && this.modifiedURI.scheme !== Schemas.vscodeNotebookCell) {
// 			this._register(this._fileService.watch(this.modifiedURI));
// 			this._register(this._fileService.onDidFilesChange(e => {
// 				if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
// 					this._onDidDelete.fire();
// 				}
// 			}));
// 		}

// 		this._register(toDisposable(() => {
// 			this._clearCurrentEditLineDecoration();
// 		}));

// 		this._diffTrimWhitespace = observableConfigValue('diffEditor.ignoreTrimWhitespace', true, configService);
// 		this._register(autorun(r => {
// 			this._diffTrimWhitespace.read(r);
// 			this._updateDiffInfoSeq();
// 		}));
// 	}
// 	entryId: string;
// 	state: IObservable<WorkingSetEntryState>;
// 	telemetryInfo: IModifiedEntryTelemetryInfo;
// 	diffInfo: IObservable<IDocumentDiff>;
// 	isCurrentlyBeingModified: IObservable<boolean>;
// 	rewriteRatio: IObservable<number>;
// 	maxLineNumber: IObservable<number>;
// 	lastModifyingRequestId: string;
// 	reviewMode: IObservable<boolean>;
// 	autoAcceptController: IObservable<{ total: number; remaining: number; cancel(): void; } | undefined>;
// 	onDidDelete: Event<void>;
// 	acquire(): this {
// 		throw new Error('Method not implemented.');
// 	}
// 	acceptStreamingEditsStart(tx: ITransaction): void {
// 		throw new Error('Method not implemented.');
// 	}
// 	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo): void {
// 		throw new Error('Method not implemented.');
// 	}
// 	enableReviewModeUntilSettled(): void {
// 		throw new Error('Method not implemented.');
// 	}
// 	dispose(): void {
// 		throw new Error('Method not implemented.');
// 	}

// 	private _clearCurrentEditLineDecoration() {
// 		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []);
// 	}

// 	async createSnapshot(requestId: string | undefined): Promise<ITextSnapshotEntry> {
// 		this._isFirstEditAfterStartOrSnapshot = true;
// 		return TextSnapshotEntry.create(this, requestId, this._edit, this.instantiationService);
// 	}

// 	async restoreFromSnapshot(snapshot: ITextSnapshotEntry) {
// 		this._stateObs.set(snapshot.state, undefined);
// 		this.docSnapshot.setValue(snapshot.original.toString());
// 		this._setDocValue(snapshot.current.toString());
// 		this._edit = snapshot.originalToCurrentEdit;
// 		this._updateDiffInfoSeq();
// 	}

// 	async resetToInitialValue() {
// 		this._setDocValue(this.initialContent);
// 	}

// 	override async acceptStreamingEditsEnd(tx: ITransaction) {
// 		await this._diffOperation;
// 		return super.acceptStreamingEditsStart(tx);
// 	}

// 	protected override _resetEditsState(tx: ITransaction): void {
// 		super._resetEditsState(tx);
// 		this._clearCurrentEditLineDecoration();
// 	}

// 	private _mirrorEdits(event: IModelContentChangedEvent) {
// 		const edit = OffsetEdits.fromContentChanges(event.changes);

// 		if (this._isEditFromUs) {
// 			const e_sum = this._edit;
// 			const e_ai = edit;
// 			this._edit = e_sum.compose(e_ai);

// 		} else {

// 			//           e_ai
// 			//   d0 ---------------> s0
// 			//   |                   |
// 			//   |                   |
// 			//   | e_user_r          | e_user
// 			//   |                   |
// 			//   |                   |
// 			//   v       e_ai_r      v
// 			///  d1 ---------------> s1
// 			//
// 			// d0 - document snapshot
// 			// s0 - document
// 			// e_ai - ai edits
// 			// e_user - user edits
// 			//

// 			const e_ai = this._edit;
// 			const e_user = edit;

// 			const e_user_r = e_user.tryRebase(e_ai.inverse(this.docSnapshot.getValue()), true);

// 			if (e_user_r === undefined) {
// 				// user edits overlaps/conflicts with AI edits
// 				this._edit = e_ai.compose(e_user);
// 			} else {
// 				const edits = OffsetEdits.asEditOperations(e_user_r, this.docSnapshot);
// 				this.docSnapshot.applyEdits(edits);
// 				this._edit = e_ai.tryRebase(e_user_r);
// 			}

// 			this._allEditsAreFromUs = false;
// 			this._updateDiffInfoSeq();
// 		}

// 		if (!this.isCurrentlyBeingModified.get()) {
// 			const didResetToOriginalContent = this.doc.getValue() === this.initialContent;
// 			const currentState = this._stateObs.get();
// 			switch (currentState) {
// 				case WorkingSetEntryState.Modified:
// 					if (didResetToOriginalContent) {
// 						this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
// 						break;
// 					}
// 			}
// 		}
// 	}

// 	async acceptAgentEdits(_resource: URI, textEdits: TextEdit[], isLastEdits: boolean): Promise<void> {


// 		// push stack element for the first edit
// 		if (this._isFirstEditAfterStartOrSnapshot) {
// 			this._isFirstEditAfterStartOrSnapshot = false;
// 			const request = this._chatService.getSession(this._telemetryInfo.sessionId)?.getRequests().at(-1);
// 			const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
// 			this._undoRedoService.pushElement(new SingleModelEditStackElement(label, 'chat.edit', this.doc, null));
// 		}

// 		const ops = textEdits.map(TextEdit.asEditOperation);
// 		const undoEdits = this._applyEdits(ops);

// 		const maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);

// 		const newDecorations: IModelDeltaDecoration[] = [
// 			// decorate pending edit (region)
// 			{
// 				options: ChatEditingModifiedFileEntry._pendingEditDecorationOptions,
// 				range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
// 			}
// 		];

// 		if (maxLineNumber > 0) {
// 			// decorate last edit
// 			newDecorations.push({
// 				options: ChatEditingModifiedFileEntry._lastEditDecorationOptions,
// 				range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
// 			});
// 		}

// 		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, newDecorations);


// 		transaction((tx) => {
// 			if (!isLastEdits) {
// 				this._stateObs.set(WorkingSetEntryState.Modified, tx);
// 				this._isCurrentlyBeingModifiedObs.set(true, tx);
// 				const lineCount = this.doc.getLineCount();
// 				this._rewriteRatioObs.set(Math.min(1, maxLineNumber / lineCount), tx);
// 				this._maxLineNumberObs.set(maxLineNumber, tx);
// 			} else {
// 				this._resetEditsState(tx);
// 				this._updateDiffInfoSeq();
// 				this._rewriteRatioObs.set(1, tx);
// 				this._editDecorationClear.schedule();
// 			}
// 		});
// 	}

// 	async acceptHunk(change: DetailedLineRangeMapping): Promise<boolean> {
// 		if (!this._diffInfo.get().changes.includes(change)) {
// 			// diffInfo should have model version ids and check them (instead of the caller doing that)
// 			return false;
// 		}
// 		const edits: ISingleEditOperation[] = [];
// 		for (const edit of change.innerChanges ?? []) {
// 			const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
// 			edits.push(EditOperation.replace(edit.originalRange, newText));
// 		}
// 		this.docSnapshot.pushEditOperations(null, edits, _ => null);
// 		await this._updateDiffInfoSeq();
// 		if (this.diffInfo.get().identical) {
// 			this._stateObs.set(WorkingSetEntryState.Accepted, undefined);
// 		}
// 		return true;
// 	}

// 	async rejectHunk(change: DetailedLineRangeMapping): Promise<boolean> {
// 		if (!this._diffInfo.get().changes.includes(change)) {
// 			return false;
// 		}
// 		const edits: ISingleEditOperation[] = [];
// 		for (const edit of change.innerChanges ?? []) {
// 			const newText = this.docSnapshot.getValueInRange(edit.originalRange);
// 			edits.push(EditOperation.replace(edit.modifiedRange, newText));
// 		}
// 		this.doc.pushEditOperations(null, edits, _ => null);
// 		await this._updateDiffInfoSeq();
// 		if (this.diffInfo.get().identical) {
// 			this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
// 		}
// 		return true;
// 	}

// 	private _applyEdits(edits: ISingleEditOperation[]) {
// 		// make the actual edit
// 		this._isEditFromUs = true;
// 		try {
// 			let result: ISingleEditOperation[] = [];
// 			this.doc.pushEditOperations(null, edits, (undoEdits) => {
// 				result = undoEdits;
// 				return null;
// 			});
// 			return result;
// 		} finally {
// 			this._isEditFromUs = false;
// 		}
// 	}

// 	private async _updateDiffInfoSeq() {
// 		const myDiffOperationId = ++this._diffOperationIds;
// 		await Promise.resolve(this._diffOperation);
// 		if (this._diffOperationIds === myDiffOperationId) {
// 			const thisDiffOperation = this._updateDiffInfo();
// 			this._diffOperation = thisDiffOperation;
// 			await thisDiffOperation;
// 		}
// 	}

// 	private async _updateDiffInfo(): Promise<void> {

// 		if (this.docSnapshot.isDisposed() || this.doc.isDisposed()) {
// 			return;
// 		}

// 		const docVersionNow = this.doc.getVersionId();
// 		const snapshotVersionNow = this.docSnapshot.getVersionId();

// 		const ignoreTrimWhitespace = this._diffTrimWhitespace.get();

// 		const diff = await this._editorWorkerService.computeDiff(
// 			this.docSnapshot.uri,
// 			this.doc.uri,
// 			{ ignoreTrimWhitespace, computeMoves: false, maxComputationTimeMs: 3000 },
// 			'advanced'
// 		);

// 		if (this.docSnapshot.isDisposed() || this.doc.isDisposed()) {
// 			return;
// 		}

// 		// only update the diff if the documents didn't change in the meantime
// 		if (this.doc.getVersionId() === docVersionNow && this.docSnapshot.getVersionId() === snapshotVersionNow) {
// 			const diff2 = diff ?? nullDocumentDiff;
// 			this._diffInfo.set(diff2, undefined);
// 			this._edit = OffsetEdits.fromLineRangeMapping(this.docSnapshot, this.doc, diff2.changes);
// 		}
// 	}

// 	override async accept(transaction: ITransaction | undefined): Promise<void> {
// 		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
// 			// already accepted or rejected
// 			return;
// 		}

// 		this.docSnapshot.setValue(this.doc.createSnapshot());
// 		this._diffInfo.set(nullDocumentDiff, transaction);
// 		this._edit = OffsetEdit.empty;

// 		return super.accept(transaction);
// 	}

// 	override async reject(transaction: ITransaction | undefined): Promise<void> {
// 		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
// 			// already accepted or rejected
// 			return;
// 		}

// 		if (this.createdInRequestId === this._telemetryInfo.requestId) {
// 			await this.docFileEditorModel.revert({ soft: true });
// 		} else {
// 			await this.resetToInitialValue();
// 			if (this._allEditsAreFromUs) {
// 				// save the file after discarding so that the dirty indicator goes away
// 				// and so that an intermediate saved state gets reverted
// 				await this.docFileEditorModel.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
// 			}
// 		}
// 		return super.reject(transaction);
// 	}

// 	private _setDocValue(value: string): void {
// 		if (this.doc.getValue() !== value) {

// 			this.doc.pushStackElement();
// 			const edit = EditOperation.replace(this.doc.getFullModelRange(), value);

// 			this._applyEdits([edit]);
// 			this._updateDiffInfoSeq();
// 			this.doc.pushStackElement();
// 		}
// 	}
// }


// export class TextSnapshotEntry implements ITextSnapshotEntry {
// 	public readonly kind = 'text';
// 	constructor(
// 		public readonly languageId: string,
// 		public readonly original: VSBuffer,
// 		public readonly current: VSBuffer,
// 		public readonly originalToCurrentEdit: OffsetEdit,
// 		public readonly resource: URI,
// 		public readonly snapshotUri: URI,
// 		public readonly state: WorkingSetEntryState,
// 		public readonly telemetryInfo: IModifiedEntryTelemetryInfo,
// 		@IInstantiationService private readonly _instantiationService: IInstantiationService
// 	) {
// 	}

// 	public static create(entry: IModifiedTextFileEntry, requestId: string | undefined,
// 		edit: OffsetEdit, instantiationService: IInstantiationService): TextSnapshotEntry {

// 		return instantiationService.createInstance(TextSnapshotEntry,
// 			entry.modifiedModel.getLanguageId(),
// 			VSBuffer.fromString(entry.originalModel.getValue()),
// 			VSBuffer.fromString(entry.modifiedModel.getValue()),
// 			edit,
// 			entry.modifiedURI,
// 			ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(entry.telemetryInfo.sessionId, requestId, entry.modifiedURI.path),
// 			entry.state.get(),
// 			entry.telemetryInfo);
// 	}

// 	public static async deserialize(entry: ITextSnapshotEntryDTO, sessionId: string, instantiationService: IInstantiationService): Promise<TextSnapshotEntry> {
// 		return instantiationService.invokeFunction(async accessor => {
// 			const [original, current] = await readSnapshotContentFromStorage(entry, sessionId, instantiationService);

// 			return instantiationService.createInstance(TextSnapshotEntry,
// 				entry.languageId,
// 				original,
// 				current,
// 				OffsetEdit.fromJson(entry.originalToCurrentEdit),
// 				URI.parse(entry.resource),
// 				URI.parse(entry.snapshotUri),
// 				entry.state,
// 				{ requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, sessionId: sessionId, result: undefined }
// 			);
// 		});
// 	}

// 	async serialize(): Promise<ITextSnapshotEntryDTO> {
// 		const [originalHash, currentHash] = await writeSnapshotContentIntoStorage(this, this._instantiationService);
// 		return {
// 			kind: 'text',
// 			resource: this.resource.toString(),
// 			languageId: this.languageId,
// 			originalHash,
// 			currentHash,
// 			originalToCurrentEdit: this.originalToCurrentEdit.edits.map(edit => ({ pos: edit.replaceRange.start, len: edit.replaceRange.length, txt: edit.newText } satisfies ISingleOffsetEdit)),
// 			state: this.state,
// 			snapshotUri: this.snapshotUri.toString(),
// 			telemetryInfo: { requestId: this.telemetryInfo.requestId, agentId: this.telemetryInfo.agentId, command: this.telemetryInfo.command }
// 		} satisfies ITextSnapshotEntryDTO;
// 	}
// }
