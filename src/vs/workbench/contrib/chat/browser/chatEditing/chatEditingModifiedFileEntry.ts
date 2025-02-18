/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, IReference, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { clamp } from '../../../../../base/common/numbers.js';
import { autorun, derived, IObservable, ITransaction, observableValue, transaction } from '../../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { OffsetEdit } from '../../../../../editor/common/core/offsetEdit.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { SingleModelEditStackElement } from '../../../../../editor/common/model/editStack.js';
import { ModelDecorationOptions, createTextBufferFactoryFromSnapshot } from '../../../../../editor/common/model/textModel.js';
import { OffsetEdits } from '../../../../../editor/common/model/textModelOffsetEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { editorBackground, editorSelectionBackground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { IUndoRedoService } from '../../../../../platform/undoRedo/common/undoRedo.js';
import { IEditorPane, SaveReason } from '../../../../common/editor.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IResolvedTextFileEditorModel, stringToSnapshot } from '../../../../services/textfile/common/textfiles.js';
import { IChatAgentResult } from '../../common/chatAgents.js';
import { ChatEditKind, IModifiedFileEntry, IModifiedFileEntryEditorIntegration, WorkingSetEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatEditingCodeEditorIntegration } from './chatEditingCodeEditorIntegration.js';
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from './chatEditingTextModelContentProviders.js';

class AutoAcceptControl {
	constructor(
		readonly total: number,
		readonly remaining: number,
		readonly cancel: () => void
	) { }
}

const pendingRewriteMinimap = registerColor('chatEdits.minimapColor',
	transparent(editorBackground, 0.6),
	localize('editorSelectionBackground', "Color of pending edit regions in the minimap"));


export abstract class AbstractChatEditingModifiedFileEntry extends Disposable implements IModifiedFileEntry {

	static readonly scheme = 'modified-file-entry';

	private static lastEntryId = 0;

	readonly entryId = `${AbstractChatEditingModifiedFileEntry.scheme}::${++AbstractChatEditingModifiedFileEntry.lastEntryId}`;

	protected readonly _onDidDelete = this._register(new Emitter<void>());
	readonly onDidDelete = this._onDidDelete.event;

	protected readonly _stateObs = observableValue<WorkingSetEntryState>(this, WorkingSetEntryState.Modified);
	readonly state: IObservable<WorkingSetEntryState> = this._stateObs;

	protected readonly _isCurrentlyBeingModifiedByObs = observableValue<IChatResponseModel | undefined>(this, undefined);
	readonly isCurrentlyBeingModifiedBy: IObservable<IChatResponseModel | undefined> = this._isCurrentlyBeingModifiedByObs;

	protected readonly _rewriteRatioObs = observableValue<number>(this, 0);
	readonly rewriteRatio: IObservable<number> = this._rewriteRatioObs;

	private readonly _reviewModeTempObs = observableValue<true | undefined>(this, undefined);
	readonly reviewMode: IObservable<boolean>;

	private readonly _autoAcceptCtrl = observableValue<AutoAcceptControl | undefined>(this, undefined);
	readonly autoAcceptController: IObservable<AutoAcceptControl | undefined> = this._autoAcceptCtrl;

	protected readonly _autoAcceptTimeout: IObservable<number>;

	get telemetryInfo(): IModifiedEntryTelemetryInfo {
		return this._telemetryInfo;
	}

	readonly createdInRequestId: string | undefined;

	get lastModifyingRequestId() {
		return this._telemetryInfo.requestId;
	}

	private _refCounter: number = 1;

	readonly originalURI: URI;

	constructor(
		readonly modifiedURI: URI,
		protected _telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		@IConfigurationService configService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService protected readonly _chatService: IChatService,
		@IFileService protected readonly _fileService: IFileService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.originalURI = ChatEditingTextModelContentProvider.getFileURI(_telemetryInfo.sessionId, this.entryId, modifiedURI.path);

		if (kind === ChatEditKind.Created) {
			this.createdInRequestId = this._telemetryInfo.requestId;
		}

		if (this.modifiedURI.scheme !== Schemas.untitled && this.modifiedURI.scheme !== Schemas.vscodeNotebookCell) {
			this._register(this._fileService.watch(this.modifiedURI));
			this._register(this._fileService.onDidFilesChange(e => {
				if (e.affects(this.modifiedURI) && kind === ChatEditKind.Created && e.gotDeleted()) {
					this._onDidDelete.fire();
				}
			}));
		}

		// review mode depends on setting and temporary override
		const autoAcceptRaw = observableConfigValue('chat.editing.autoAcceptDelay', 0, configService);
		this._autoAcceptTimeout = derived(r => {
			const value = autoAcceptRaw.read(r);
			return clamp(value, 0, 100);
		});
		this.reviewMode = derived(r => {
			const configuredValue = this._autoAcceptTimeout.read(r);
			const tempValue = this._reviewModeTempObs.read(r);
			return tempValue ?? configuredValue === 0;
		});

		const autoSaveOff = this._store.add(new MutableDisposable());
		this._store.add(autorun(r => {
			if (this.isCurrentlyBeingModifiedBy.read(r)) {
				autoSaveOff.value = fileConfigService.disableAutoSave(this.modifiedURI);
			} else {
				autoSaveOff.clear();
			}
		}));
	}

	override dispose(): void {
		if (--this._refCounter === 0) {
			super.dispose();
		}
	}

	acquire() {
		this._refCounter++;
		return this;
	}

	enableReviewModeUntilSettled(): void {

		this._reviewModeTempObs.set(true, undefined);

		const cleanup = autorun(r => {
			// reset config when settled
			const resetConfig = this.state.read(r) !== WorkingSetEntryState.Modified;
			if (resetConfig) {
				this._store.delete(cleanup);
				this._reviewModeTempObs.set(undefined, undefined);
			}
		});

		this._store.add(cleanup);
	}

	updateTelemetryInfo(telemetryInfo: IModifiedEntryTelemetryInfo) {
		this._telemetryInfo = telemetryInfo;
	}

	async accept(tx: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		await this._doAccept(tx);
		this._stateObs.set(WorkingSetEntryState.Accepted, tx);
		this._autoAcceptCtrl.set(undefined, tx);

		this._notifyAction('accepted');
	}

	protected abstract _doAccept(tx: ITransaction | undefined): Promise<void>;

	async reject(tx: ITransaction | undefined): Promise<void> {
		if (this._stateObs.get() !== WorkingSetEntryState.Modified) {
			// already accepted or rejected
			return;
		}

		await this._doReject(tx);
		this._stateObs.set(WorkingSetEntryState.Rejected, tx);
		this._autoAcceptCtrl.set(undefined, tx);
		this._notifyAction('rejected');
	}

	protected abstract _doReject(tx: ITransaction | undefined): Promise<void>;

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

	private readonly _editorIntegrations = this._register(new DisposableMap<IEditorPane, IModifiedFileEntryEditorIntegration>());

	getEditorIntegration(pane: IEditorPane): IModifiedFileEntryEditorIntegration {
		let value = this._editorIntegrations.get(pane);
		if (!value) {
			value = this._createEditorIntegration(pane);
			this._editorIntegrations.set(pane, value);
		}
		return value;
	}

	/**
	 * Create the editor integration for this entry and the given editor pane. This will only be called
	 * once (and cached) per pane. The integration is meant to be scoped to this entry only and when the
	 * passed pane/editor changes input, then the editor integration must handle that, e.g use default/null
	 * values
	 */
	protected abstract _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration;

	abstract readonly diffInfo: IObservable<IDocumentDiff>;
	abstract readonly changesCount: IObservable<number>;

	acceptStreamingEditsStart(responseModel: IChatResponseModel, tx: ITransaction) {
		this._resetEditsState(tx);
		this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
		this._autoAcceptCtrl.get()?.cancel();
	}

	async acceptStreamingEditsEnd(tx: ITransaction) {
		this._resetEditsState(tx);

		// AUTO accept mode
		if (!this.reviewMode.get() && !this._autoAcceptCtrl.get()) {

			const acceptTimeout = this._autoAcceptTimeout.get() * 1000;
			const future = Date.now() + acceptTimeout;
			const update = () => {

				const reviewMode = this.reviewMode.get();
				if (reviewMode) {
					// switched back to review mode
					this._autoAcceptCtrl.set(undefined, undefined);
					return;
				}

				const remain = Math.round(future - Date.now());
				if (remain <= 0) {
					this.accept(undefined);
				} else {
					const handle = setTimeout(update, 100);
					this._autoAcceptCtrl.set(new AutoAcceptControl(acceptTimeout, remain, () => {
						clearTimeout(handle);
						this._autoAcceptCtrl.set(undefined, undefined);
					}), undefined);
				}
			};
			update();
		}
	}

	protected _resetEditsState(tx: ITransaction): void {
		this._isCurrentlyBeingModifiedByObs.set(undefined, tx);
		this._rewriteRatioObs.set(0, tx);
	}
}

export class ChatEditingModifiedFileEntry extends AbstractChatEditingModifiedFileEntry implements IModifiedFileEntry {

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


	private readonly docSnapshot: ITextModel;
	readonly initialContent: string;
	private readonly doc: ITextModel;
	private readonly docFileEditorModel: IResolvedTextFileEditorModel;
	private _allEditsAreFromUs: boolean = true;

	get originalModel(): ITextModel {
		return this.docSnapshot;
	}

	get modifiedModel(): ITextModel {
		return this.doc;
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

	readonly changesCount = this._diffInfo.map(diff => diff.changes.length);

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];


	private readonly _diffTrimWhitespace: IObservable<boolean>;

	constructor(
		resourceRef: IReference<IResolvedTextEditorModel>,
		private readonly _multiDiffEntryDelegate: { collapse: (transaction: ITransaction | undefined) => void },
		telemetryInfo: IModifiedEntryTelemetryInfo,
		kind: ChatEditKind,
		initialContent: string | undefined,
		@IModelService modelService: IModelService,
		@ITextModelService textModelService: ITextModelService,
		@ILanguageService languageService: ILanguageService,
		@IConfigurationService configService: IConfigurationService,
		@IFilesConfigurationService fileConfigService: IFilesConfigurationService,
		@IChatService chatService: IChatService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			resourceRef.object.textEditorModel.uri,
			telemetryInfo,
			kind,
			configService,
			fileConfigService,
			chatService,
			fileService,
			instantiationService
		);

		this.docFileEditorModel = this._register(resourceRef).object as IResolvedTextFileEditorModel;
		this.doc = resourceRef.object.textEditorModel;

		this.initialContent = initialContent ?? this.doc.getValue();
		const docSnapshot = this.docSnapshot = this._register(
			modelService.createModel(
				createTextBufferFactoryFromSnapshot(initialContent ? stringToSnapshot(initialContent) : this.doc.createSnapshot()),
				languageService.createById(this.doc.getLanguageId()),
				this.originalURI,
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



		this._register(toDisposable(() => {
			this._clearCurrentEditLineDecoration();
		}));

		this._diffTrimWhitespace = observableConfigValue('diffEditor.ignoreTrimWhitespace', true, configService);
		this._register(autorun(r => {
			this._diffTrimWhitespace.read(r);
			this._updateDiffInfoSeq();
		}));
	}

	private _clearCurrentEditLineDecoration() {
		this._editDecorations = this.doc.deltaDecorations(this._editDecorations, []);
	}

	equalsSnapshot(snapshot: ISnapshotEntry | undefined): boolean {
		return !!snapshot &&
			this.modifiedURI.toString() === snapshot.resource.toString() &&
			this.modifiedModel.getLanguageId() === snapshot.languageId &&
			this.originalModel.getValue() === snapshot.original &&
			this.modifiedModel.getValue() === snapshot.current &&
			this._edit.equals(snapshot.originalToCurrentEdit) &&
			this.state.get() === snapshot.state;
	}

	createSnapshot(requestId: string | undefined, undoStop: string | undefined): ISnapshotEntry {
		this._isFirstEditAfterStartOrSnapshot = true;
		return {
			resource: this.modifiedURI,
			languageId: this.modifiedModel.getLanguageId(),
			snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(this._telemetryInfo.sessionId, requestId, undoStop, this.modifiedURI.path),
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

	override async acceptStreamingEditsEnd(tx: ITransaction) {
		await this._diffOperation;
		super.acceptStreamingEditsEnd(tx);
	}

	protected override _resetEditsState(tx: ITransaction): void {
		super._resetEditsState(tx);
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

		if (!this.isCurrentlyBeingModifiedBy.get()) {
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

	acceptAgentEdits(textEdits: TextEdit[], isLastEdits: boolean, responseModel: IChatResponseModel): void {

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
				this._isCurrentlyBeingModifiedByObs.set(responseModel, tx);
				const lineCount = this.doc.getLineCount();
				this._rewriteRatioObs.set(Math.min(1, maxLineNumber / lineCount), tx);

			} else {
				this._resetEditsState(tx);
				this._updateDiffInfoSeq();
				this._rewriteRatioObs.set(1, tx);
				this._editDecorationClear.schedule();
			}
		});
	}

	async acceptHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			// diffInfo should have model version ids and check them (instead of the caller doing that)
			return false;
		}
		const edits: ISingleEditOperation[] = [];
		for (const edit of change.innerChanges ?? []) {
			const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
			edits.push(EditOperation.replace(edit.originalRange, newText));
		}
		this.docSnapshot.pushEditOperations(null, edits, _ => null);
		await this._updateDiffInfoSeq();
		if (this.diffInfo.get().identical) {
			this._stateObs.set(WorkingSetEntryState.Accepted, undefined);
		}
		return true;
	}

	async rejectHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			return false;
		}
		const edits: ISingleEditOperation[] = [];
		for (const edit of change.innerChanges ?? []) {
			const newText = this.docSnapshot.getValueInRange(edit.originalRange);
			edits.push(EditOperation.replace(edit.modifiedRange, newText));
		}
		this.doc.pushEditOperations(null, edits, _ => null);
		await this._updateDiffInfoSeq();
		if (this.diffInfo.get().identical) {
			this._stateObs.set(WorkingSetEntryState.Rejected, undefined);
		}
		return true;
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

		if (this.docSnapshot.isDisposed() || this.doc.isDisposed()) {
			return;
		}

		const docVersionNow = this.doc.getVersionId();
		const snapshotVersionNow = this.docSnapshot.getVersionId();

		const ignoreTrimWhitespace = this._diffTrimWhitespace.get();

		const diff = await this._editorWorkerService.computeDiff(
			this.docSnapshot.uri,
			this.doc.uri,
			{ ignoreTrimWhitespace, computeMoves: false, maxComputationTimeMs: 3000 },
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

	protected override async _doAccept(tx: ITransaction | undefined): Promise<void> {
		this.docSnapshot.setValue(this.doc.createSnapshot());
		this._diffInfo.set(nullDocumentDiff, tx);
		this._edit = OffsetEdit.empty;
		await this._collapse(tx);
	}

	protected override async _doReject(tx: ITransaction | undefined): Promise<void> {
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
			await this._collapse(tx);
		}
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

	private async _collapse(transaction: ITransaction | undefined): Promise<void> {
		this._multiDiffEntryDelegate.collapse(transaction);
	}

	protected _createEditorIntegration(editor: IEditorPane): IModifiedFileEntryEditorIntegration {
		const codeEditor = getCodeEditor(editor.getControl());
		assertType(codeEditor);
		return this._instantiationService.createInstance(ChatEditingCodeEditorIntegration, codeEditor, this);
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
