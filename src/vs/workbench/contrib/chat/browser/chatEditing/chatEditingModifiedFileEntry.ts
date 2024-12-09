/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelDeltaDecoration, ITextModel, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { OffsetEdits } from '../../../../../editor/common/model/textModelOffsetEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { SaveReason } from '../../../../common/editor.js';
import { IResolvedTextFileEditorModel, stringToSnapshot } from '../../../../services/textfile/common/textfiles.js';
import { IChatAgentResult } from '../../common/chatAgents.js';
import { ChatEditKind, IModifiedFileEntry, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

export class ChatEditingModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	public static readonly scheme = 'modified-file-entry';
	private static lastEntryId = 0;
	public readonly entryId = `${ChatEditingModifiedFileEntry.scheme}::${++ChatEditingModifiedFileEntry.lastEntryId}`;

	private readonly docSnapshot: ITextModel;
	public readonly initialContent: string;
	private readonly doc: ITextModel;
	private readonly docFileEditorModel: IResolvedTextFileEditorModel;
	private _allEditsAreFromUs: boolean = true;

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
		return this.modifiedModel.uri;
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

	private readonly _rewriteRatioObs = observableValue<number>(this, 0);
	public get rewriteRatio(): IObservable<number> {
		return this._rewriteRatioObs;
	}

	private readonly _maxLineNumberObs = observableValue<number>(this, 0);
	public get maxLineNumber(): IObservable<number> {
		return this._maxLineNumberObs;
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

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];

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
	});

	get telemetryInfo(): IModifiedEntryTelemetryInfo {
		return this._telemetryInfo;
	}

	readonly createdInRequestId: string | undefined;

	get lastModifyingRequestId() {
		return this._telemetryInfo.requestId;
	}

	constructor(
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		private _telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string | undefined,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IChatService private readonly _chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IFileService private readonly _fileService: IFileService,
	) {
		super();
		if (kind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}
		this.docFileEditorModel = this._register(resourceRef).object as IResolvedTextFileEditorModel;
		this.doc = resourceRef.object.textEditorModel;

		this.initialContent = initialContent ?? this.doc.getValue();
		const docSnapshot = this.docSnapshot = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(initialContent ? stringToSnapshot(initialContent) : this.doc.createSnapshot()),
				languageService.createById(this.doc.getLanguageId()),
				ChatEditingTextModelContentProvider.getFileURI(this.entryId, this.modifiedURI.path),
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


		this._register(this.doc.onDidChangeContent(e => this._mirrorEdits(e)));
		this._register(this._fileService.watch(this.modifiedURI));
		this._register(this._fileService.onDidFilesChange(e => {
			if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
				this._onDidDelete.fire();
			}
		}));

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
		this._updateDiffInfoSeq();
	}

	resetToInitialValue() {
		this._setDocValue(this.initialContent);
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
		this._clearCurrentEditLineDecoration();
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

			const e_user_r = e_user.tryRebase(e_ai.inverse(this.docSnapshot.getValue()), true);

			if (e_user_r === undefined) {
				// user edits overlaps/conflicts with AI edits
				this._edit = e_ai.compose(e_user);
			} else {
				const edits = OffsetEdits.asEditOperations(e_user_r, this.docSnapshot);
				this.docSnapshot.applyEdits(edits);
				this._edit = e_ai.tryRebase(e_user_r);
			}

			this._allEditsAreFromUs = false;
			this._updateDiffInfoSeq();
		}

		if (!this.isCurrentlyBeingModified.get()) {
			const didResetToOriginalContent = this.doc.getValue() === this.initialContent;
			const currentState = this._stateObs.get();
			switch (currentState) {
				case WorkingSetEntryState.Modified:
					if (didResetToOriginalContent) {
						this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
						break;
					}
			}
		}
	}

	acceptAgentEdits(textEdits: TextEdit[], isLastEdits: boolean): void {


		// push stack element for the first edit
		if (this._isFirstEditAfterStartOrSnapshot) {
			this._isFirstEditAfterStartOrSnapshot = false;
			const request = this._chatService.getSession(this._telemetryInfo.sessionId)?.getRequests().at(-1);
			const label = request?.message.text ? localize('chatEditing1', "Chat Edit: '{0}'", request.message.text) : localize('chatEditing2', "Chat Edit");
			this._undoRedoService.pushElement(new SingleModelEditStackElement(label, 'chat.edit', this.doc, null));
		}

		const ops = textEdits.map(TextEdit.asEditOperation);
		const undoEdits = this._applyEdits(ops);

		const maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);

		const newDecorations: IModelDeltaDecoration[] = [
			// decorate pending edit (region)
			{
				options: ChatEditingModifiedFileEntry._pendingEditDecorationOptions,
				range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
			}
		];

		if (maxLineNumber > 0) {
			// decorate last edit
			newDecorations.push({
				options: ChatEditingModifiedFileEntry._lastEditDecorationOptions,
				range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
			});
		}

		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, newDecorations);


		transaction((tx) => {
			if (!isLastEdits) {
				this._stateObs.set(WorkingSetEntryState.Modified, tx);
				this._isCurrentlyBeingModifiedObs.set(true, tx);
				const lineCount = this.doc.getLineCount();
				this._rewriteRatioObs.set(Math.min(1, maxLineNumber / lineCount), tx);
				this._maxLineNumberObs.set(maxLineNumber, tx);
			} else {
				this._resetEditsState(tx);
				this._updateDiffInfoSeq();
				this._rewriteRatioObs.set(1, tx);
				this._editDecorationClear.schedule();
			}
		});
	}

	private _applyEdits(edits: ISingleEditOperation[]) {
		// make the actual edit
		this._isEditFromUs = true;
		try {
			let result: ISingleEditOperation[] = [];
			this.doc.pushEditOperations(null, edits, (undoEdits) => {
				result = undoEdits;
				return null;
			});
			return result;
		} finally {
			this._isEditFromUs = false;
		}
	}

	private _updateDiffInfoSeq() {
		const myDiffOperationId = ++this._diffOperationIds;
		Promise.resolve(this._diffOperation).then(() => {
			if (this._diffOperationIds === myDiffOperationId) {
				this._diffOperation = this._updateDiffInfo();
			}
		});
	}

	private async _updateDiffInfo(): Promise<void> {

		if (this.docSnapshot.isDisposed() || this.doc.isDisposed()) {
			return;
		}

		const docVersionNow = this.doc.getVersionId();
		const snapshotVersionNow = this.docSnapshot.getVersionId();

		const diff = await this._editorWorkerService.computeDiff(
			this.docSnapshot.uri,
			this.doc.uri,
			{ computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: 3000 },
			'advanced'
		);

		if (this.docSnapshot.isDisposed() || this.doc.isDisposed()) {
			return;
		}

		// only update the diff if the documents didn't change in the meantime
		if (this.doc.getVersionId() === docVersionNow && this.docSnapshot.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;
			this._diffInfo.set(diff2, undefined);
			this._edit = OffsetEdits.fromLineRangeMapping(this.docSnapshot, this.doc, diff2.changes);
		}
	}

	async accept(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		this.docSnapshot.setValue(this.doc.createSnapshot());
		this._diffInfo.set(nullDocumentDiff, transaction);
		this._edit = OffsetEdit.empty;
		this._stateObs.set(WorkingSetEntryState.Accepted, transaction);
		await this.collapse(transaction);
		this._notifyAction('accepted');
	}

	async reject(transaction: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		if (this.createdInRequestId === this._telemetryInfo.requestId) {
			await this.docFileEditorModel.revert({ soft: true });
			await this._fileService.del(this.modifiedURI);
			this._onDidDelete.fire();
		} else {
			this._setDocValue(this.docSnapshot.getValue());
			if (this._allEditsAreFromUs) {
				// save the file after discarding so that the dirty indicator goes away
				// and so that an intermediate saved state gets reverted
				await this.docFileEditorModel.save({ reason: SaveReason.EXPLICIT, skipSaveParticipants: true });
			}
			await this.collapse(transaction);
		}
		this._stateObs.set(WorkingSetEntryState.Rejected, transaction);
		this._notifyAction('rejected');
	}

	private _setDocValue(value: string): void {
		if (this.doc.getValue() !== value) {

			this.doc.pushStackElement();
			const edit = EditOperation.replace(this.doc.getFullModelRange(), value);

			this._applyEdits([edit]);
			this._updateDiffInfoSeq();
			this.doc.pushStackElement();
		}
	}

	async collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
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

export interface IModifiedEntryTelemetryInfo {
	readonly agentId: string | undefined;
	readonly command: string | undefined;
	readonly sessionId: string;
	readonly requestId: string;
	readonly result: IChatAgentResult | undefined;
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
