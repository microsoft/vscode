/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../../editor/browser/services/bulkEditService.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { OffsetEdit, SingleOffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IIdentifiedSingleEditOperation, IModelDeltaDecoration, ITextModel, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelContentChange, IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IChatAgentResult } from '../../common/chatAgents.js';
import { ChatEditKind, IModifiedFileEntry, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

export class ChatEditingModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	public static readonly scheme = 'modified-file-entry';
	static lastEntryId = 0;
	public readonly entryId = `${ChatEditingModifiedFileEntry.scheme}::${++ChatEditingModifiedFileEntry.lastEntryId}`;

	public readonly docSnapshot: ITextModel;
	private readonly doc: ITextModel;

	private readonly _onDidDelete = this._register(new Emitter<void>());
	public get onDidDelete() {
		return this._onDidDelete.event;
	}

	get originalURI(): URI {
		return this.docSnapshot.uri;
	}

	get originalModel(): ITextModel {
		return this.docSnapshot;
	}

	get modifiedURI(): URI {
		return this.doc.uri;
	}

	get modifiedModel(): ITextModel {
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

	private _isFirstEditAfterStartOrSnapshot: boolean = true;
	private _edit: OffsetEdit = OffsetEdit.empty;
	private _isEditFromUs: boolean = false;
	private _diffOperation: Promise<any> | undefined;
	private _diffOperationIds: number = 0;

	private readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);
	get diffInfo(): IObservable<IDocumentDiff> {
		return this._diffInfo;
	}

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []); }, 3000));
	private _editDecorations: string[] = [];

	private static readonly _editDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-editing',
		className: 'rangeHighlight',
		marginClassName: 'rangeHighlight',
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(editorSelectionBackground)
		},
	});

	get telemetryInfo(): IModifiedEntryTelemetryInfo {
		return this._telemetryInfo;
	}

	readonly createdInRequestId: string | undefined;

	get lastModifyingRequestId() {
		return this._telemetryInfo.requestId;
	}

	constructor(
		public readonly resource: URI,
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private _telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IBulkEditService public readonly bulkEditService: IBulkEditService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		if (kind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}
		this.doc = resourceRef.object.textEditorModel;
		const docSnapshot = this.docSnapshot = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(this.doc.createSnapshot()),
				languageService.createById(this.doc.getLanguageId()),
				ChatEditingTextModelContentProvider.getFileURI(this.entryId, resource.path),
				false
			)
		);

		// Create a reference to this model to avoid it being disposed from under our nose
		(async () => {
			const reference = await textModelService.createModelReference(docSnapshot.uri);
			if (this._store.isDisposed) {
				reference.dispose();
				return;
			}
			this._register(reference);
		})();

		this._register(resourceRef);

		this._register(this.doc.onDidChangeContent(e => this._mirrorEdits(e)));

		this._register(toDisposable(() => {
			this._clearCurrentEditLineDecoration();
		}));
	}

	private _clearCurrentEditLineDecoration() {
		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []);
	}

	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo) {
		this._telemetryInfo = telemetryInfo;
	}

	createSnapshot(requestId: string | undefined): ISnapshotEntry {
		this._isFirstEditAfterStartOrSnapshot = true;
		return {
			resource: this.modifiedURI,
			languageId: this.modifiedModel.getLanguageId(),
			snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(requestId, this.modifiedURI.path),
			original: this.originalModel.getValue(),
			current: this.modifiedModel.getValue(),
			originalToCurrentEdit: this._edit,
			state: this.state.get(),
			telemetryInfo: this._telemetryInfo
		};
	}

	restoreFromSnapshot(snapshot: ISnapshotEntry) {
		this._stateObs.set(snapshot.state, undefined);
		this.docSnapshot.setValue(snapshot.original);
		this._setDocValue(snapshot.current);
		this._edit = snapshot.originalToCurrentEdit;
	}

	resetToInitialValue(value: string) {
		this._setDocValue(value);
	}

	acceptStreamingEditsStart(tx: ITransaction) {
		this._isCurrentlyBeingModifiedObs.set(false, tx);
		this._clearCurrentEditLineDecoration();
	}

	acceptStreamingEditsEnd(tx: ITransaction) {
		this._isCurrentlyBeingModifiedObs.set(false, tx);
		this._clearCurrentEditLineDecoration();
	}

	private _mirrorEdits(event: IModelContentChangedEvent) {
		const edit = fromContentChange(event.changes);

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

			const e_user_r = e_user.tryRebase(e_ai.inverse(this.docSnapshot.getValue()), true);

			if (e_user_r === undefined) {
				// user edits overlaps/conflicts with AI edits
				this._edit = e_ai.compose(e_user);
			} else {
				const edits = toEditOperations(e_user_r, this.docSnapshot);
				this.docSnapshot.applyEdits(edits);
				this._edit = e_ai.tryRebase(e_user_r);
			}
		}

		this._updateDiffInfoSeq(!this._isEditFromUs);
	}

	acceptAgentEdits(textEdits: TextEdit[]): void {

		// highlight edits
		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, textEdits.map(edit => {
			return {
				options: ChatEditingModifiedFileEntry._editDecorationOptions,
				range: edit.range
			} satisfies IModelDeltaDecoration;
		}));
		this._editDecorationClear.schedule();

		// push stack element for the first edit
		if (this._isFirstEditAfterStartOrSnapshot) {
			this._isFirstEditAfterStartOrSnapshot = false;
			const request = this._chatService.getSession(this._telemetryInfo.sessionId)?.getRequests().at(-1);
			const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
			this._undoRedoService.pushElement(new SingleModelEditStackElement(label, 'chat.edit', this.doc, null));
		}

		this._applyEdits(textEdits.map(TextEdit.asEditOperation));

		transaction((tx) => {
			this._stateObs.set(WorkingSetEntryState.Modified, tx);
			this._isCurrentlyBeingModifiedObs.set(true, tx);
		});
	}

	private _applyEdits(edits: ISingleEditOperation[]) {
		// make the actual edit
		this._isEditFromUs = true;
		try {
			this.doc.pushEditOperations(null, edits, () => null);
		} finally {
			this._isEditFromUs = false;
		}
	}

	private _updateDiffInfoSeq(fast: boolean) {
		const myDiffOperationId = ++this._diffOperationIds;
		Promise.resolve(this._diffOperation).then(() => {
			if (this._diffOperationIds === myDiffOperationId) {
				this._diffOperation = this._updateDiffInfo(fast);
			}
		});
	}

	private async _updateDiffInfo(fast: boolean): Promise<void> {

		const docVersionNow = this.doc.getVersionId();
		const snapshotVersionNow = this.docSnapshot.getVersionId();

		const [diff] = await Promise.all([
			this._editorWorkerService.computeDiff(
				this.docSnapshot.uri,
				this.doc.uri,
				{ computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: 3000 },
				'advanced'
			),
			timeout(fast ? 50 : 800) // DON't diff too fast
		]);

		// only update the diff if the documents didn't change in the meantime
		if (this.doc.getVersionId() === docVersionNow && this.docSnapshot.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;
			this._diffInfo.set(diff2, undefined);
			this._edit = fromDiff(this.docSnapshot, this.doc, diff2);
		}
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this.docSnapshot.setValue(this.doc.createSnapshot());
		this._stateObs.set(WorkingSetEntryState.Accepted, transaction);
		await this.collapse(transaction);
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
			await this._fileService.del(this.resource);
			this._onDidDelete.fire();
			this.dispose();
		} else {
			this._setDocValue(this.docSnapshot.getValue());
			await this.collapse(transaction);
		}
	}

	private _setDocValue(value: string): void {
		this.doc.pushStackElement();
		const edit = EditOperation.replace(this.doc.getFullModelRange(), value);

		this._applyEdits([edit]);

		this.doc.pushStackElement();
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	private _notifyAction(outcome: 'accepted' | 'rejected') {
		this._chatService.notifyUserAction({
			action: { kind: 'chatEditingSessionAction', uri: this.resource, hasRemainingEdits: false, outcome },
			agentId: this._telemetryInfo.agentId,
			command: this._telemetryInfo.command,
			sessionId: this._telemetryInfo.sessionId,
			requestId: this._telemetryInfo.requestId,
			result: this._telemetryInfo.result
		});
	}
}

export interface IModifiedEntryTelemetryInfo {
	agentId: string | undefined;
	command: string | undefined;
	sessionId: string;
	requestId: string;
	result: IChatAgentResult | undefined;
}

export interface ISnapshotEntry {
	readonly resource: URI;
	readonly languageId: string;
	readonly snapshotUri: URI;
	readonly original: string;
	readonly current: string;
	readonly originalToCurrentEdit: OffsetEdit;
	readonly state: WorkingSetEntryState;
	telemetryInfo: IModifiedEntryTelemetryInfo;
}

function toEditOperations(offsetEdit: OffsetEdit, doc: ITextModel): IIdentifiedSingleEditOperation[] {
	const edits: IIdentifiedSingleEditOperation[] = [];
	for (const singleEdit of offsetEdit.edits) {
		const range = Range.fromPositions(
			doc.getPositionAt(singleEdit.replaceRange.start),
			doc.getPositionAt(singleEdit.replaceRange.start + singleEdit.replaceRange.length)
		);
		edits.push(EditOperation.replace(range, singleEdit.newText));
	}
	return edits;
}

function fromContentChange(contentChanges: readonly IModelContentChange[]) {
	const editsArr = contentChanges.map(c => new SingleOffsetEdit(OffsetRange.ofStartAndLength(c.rangeOffset, c.rangeLength), c.text));
	editsArr.reverse();
	const edits = new OffsetEdit(editsArr);
	return edits;
}

function fromDiff(original: ITextModel, modified: ITextModel, diff: IDocumentDiff): OffsetEdit {
	const edits: SingleOffsetEdit[] = [];
	for (const c of diff.changes) {
		for (const i of c.innerChanges ?? []) {
			const newText = modified.getValueInRange(i.modifiedRange);

			const startOrig = original.getOffsetAt(i.originalRange.getStartPosition());
			const endExOrig = original.getOffsetAt(i.originalRange.getEndPosition());
			const origRange = new OffsetRange(startOrig, endExOrig);

			edits.push(new SingleOffsetEdit(origRange, newText));
		}
	}

	return new OffsetEdit(edits);
}
