/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit, VersionedExtensionId } from '../../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel, ITextSnapshot, MinimapPosition, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { offsetEditFromContentChanges, offsetEditFromLineRangeMapping, offsetEditToEditOperations } from '../../../../../editor/common/model/textModelStringEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { EditSources, TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { pendingRewriteMinimap } from './chatEditingModifiedFileEntry.js';

type affectedLines = { linesAdded: number; linesRemoved: number; lineCount: number; hasRemainingEdits: boolean };
type acceptedOrRejectedLines = affectedLines & { state: 'accepted' | 'rejected' };

export class ChatEditingTextModelChangeService extends Disposable {

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

	private static readonly _atomicEditDecorationOptions = ModelDecorationOptions.register({
		isWholeLine: true,
		description: 'chat-atomic-edit',
		className: 'chat-editing-atomic-edit',
		minimap: {
			position: MinimapPosition.Inline,
			color: themeColorFromId(pendingRewriteMinimap)
		}
	});

	private _isEditFromUs: boolean = false;
	public get isEditFromUs() {
		return this._isEditFromUs;
	}
	private _allEditsAreFromUs: boolean = true;
	public get allEditsAreFromUs() {
		return this._allEditsAreFromUs;
	}
	private _isExternalEditInProgress: (() => boolean) | undefined;
	private _diffOperation: Promise<IDocumentDiff | undefined> | undefined;
	private _diffOperationIds: number = 0;

	private readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);
	public get diffInfo() {
		return this._diffInfo.map(value => {
			return {
				...value,
				originalModel: this.originalModel,
				modifiedModel: this.modifiedModel,
				keep: changes => this._keepHunk(changes),
				undo: changes => this._undoHunk(changes)
			} satisfies IDocumentDiff2;
		});
	}

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];

	private readonly _didAcceptOrRejectAllHunks = this._register(new Emitter<ModifiedFileEntryState.Accepted | ModifiedFileEntryState.Rejected>());
	public readonly onDidAcceptOrRejectAllHunks = this._didAcceptOrRejectAllHunks.event;

	private readonly _didAcceptOrRejectLines = this._register(new Emitter<acceptedOrRejectedLines>());
	public readonly onDidAcceptOrRejectLines = this._didAcceptOrRejectLines.event;

	private notifyHunkAction(state: 'accepted' | 'rejected', affectedLines: affectedLines) {
		if (affectedLines.lineCount > 0) {
			this._didAcceptOrRejectLines.fire({ state, ...affectedLines });
		}
	}

	private _didUserEditModelFired = false;
	private readonly _didUserEditModel = this._register(new Emitter<void>());
	public readonly onDidUserEditModel = this._didUserEditModel.event;

	private _originalToModifiedEdit: StringEdit = StringEdit.empty;

	private lineChangeCount: number = 0;
	private linesAdded: number = 0;
	private linesRemoved: number = 0;

	constructor(
		private readonly originalModel: ITextModel,
		private readonly modifiedModel: ITextModel,
		private readonly state: IObservable<ModifiedFileEntryState>,
		isExternalEditInProgress: (() => boolean) | undefined,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
		this._isExternalEditInProgress = isExternalEditInProgress;
		this._register(this.modifiedModel.onDidChangeContent(e => {
			this._mirrorEdits(e);
		}));

		this._register(toDisposable(() => {
			this.clearCurrentEditLineDecoration();
		}));

		this._register(autorun(r => this.updateLineChangeCount(this._diffInfo.read(r))));
	}

	private updateLineChangeCount(diff: IDocumentDiff) {
		this.lineChangeCount = 0;
		this.linesAdded = 0;
		this.linesRemoved = 0;

		for (const change of diff.changes) {
			const modifiedRange = change.modified.endLineNumberExclusive - change.modified.startLineNumber;
			this.linesAdded += Math.max(0, modifiedRange);
			const originalRange = change.original.endLineNumberExclusive - change.original.startLineNumber;
			this.linesRemoved += Math.max(0, originalRange);

			this.lineChangeCount += Math.max(modifiedRange, originalRange);
		}
	}

	public clearCurrentEditLineDecoration() {
		if (!this.modifiedModel.isDisposed()) {
			this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
		}
	}

	public async areOriginalAndModifiedIdentical(): Promise<boolean> {
		const diff = await this._diffOperation;
		return diff ? diff.identical : false;
	}

	async acceptAgentEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel | undefined): Promise<{ rewriteRatio: number; maxLineNumber: number }> {

		assertType(textEdits.every(TextEdit.isTextEdit), 'INVALID args, can only handle text edits');
		assert(isEqual(resource, this.modifiedModel.uri), ' INVALID args, can only edit THIS document');

		const isAtomicEdits = textEdits.length > 0 && isLastEdits;
		let maxLineNumber = 0;
		let rewriteRatio = 0;

		const source = this._createEditSource(responseModel);

		if (isAtomicEdits) {
			// EDIT and DONE
			const minimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this.modifiedModel.uri, textEdits) ?? textEdits;
			const ops = minimalEdits.map(TextEdit.asEditOperation);
			const undoEdits = this._applyEdits(ops, source);

			if (undoEdits.length > 0) {
				let range: Range | undefined;
				for (let i = 0; i < undoEdits.length; i++) {
					const op = undoEdits[i];
					if (!range) {
						range = Range.lift(op.range);
					} else {
						range = Range.plusRange(range, op.range);
					}
				}
				if (range) {

					const defer = new DeferredPromise<void>();
					const listener = addDisposableListener(getWindow(undefined), 'animationend', e => {
						if (e.animationName === 'kf-chat-editing-atomic-edit') { // CHECK with chat.css
							defer.complete();
							listener.dispose();
						}
					});

					this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, [{
						options: ChatEditingTextModelChangeService._atomicEditDecorationOptions,
						range
					}]);

					await Promise.any([defer.p, timeout(500)]); // wait for animation to finish but also time-cap it
					listener.dispose();
				}
			}


		} else {
			// EDIT a bit, then DONE
			const ops = textEdits.map(TextEdit.asEditOperation);
			const undoEdits = this._applyEdits(ops, source);
			maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);
			rewriteRatio = Math.min(1, maxLineNumber / this.modifiedModel.getLineCount());

			const newDecorations: IModelDeltaDecoration[] = [
				// decorate pending edit (region)
				{
					options: ChatEditingTextModelChangeService._pendingEditDecorationOptions,
					range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
				}
			];

			if (maxLineNumber > 0) {
				// decorate last edit
				newDecorations.push({
					options: ChatEditingTextModelChangeService._lastEditDecorationOptions,
					range: new Range(maxLineNumber, 1, maxLineNumber, Number.MAX_SAFE_INTEGER)
				});
			}
			this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, newDecorations);

		}

		if (isLastEdits) {
			this._updateDiffInfoSeq();
			this._editDecorationClear.schedule();
		}

		return { rewriteRatio, maxLineNumber };
	}

	private _createEditSource(responseModel: IChatResponseModel | undefined) {

		if (!responseModel) {
			return EditSources.unknown({ name: 'editSessionUndoRedo' });
		}

		const sessionId = responseModel.session.sessionId;
		const request = responseModel.session.getRequests().at(-1);
		const languageId = this.modifiedModel.getLanguageId();
		const agent = responseModel.agent;
		const extensionId = VersionedExtensionId.tryCreate(agent?.extensionId.value, agent?.extensionVersion);

		if (responseModel.request?.locationData?.type === ChatAgentLocation.EditorInline) {

			return EditSources.inlineChatApplyEdit({
				modelId: request?.modelId,
				requestId: request?.id,
				sessionId,
				languageId,
				extensionId,
			});
		}

		return EditSources.chatApplyEdits({
			modelId: request?.modelId,
			requestId: request?.id,
			sessionId,
			languageId,
			mode: request?.modeInfo?.modeId,
			extensionId,
			codeBlockSuggestionId: request?.modeInfo?.applyCodeBlockSuggestionId,
		});
	}

	private _applyEdits(edits: ISingleEditOperation[], source: TextModelEditSource) {
		try {
			this._isEditFromUs = true;
			// make the actual edit
			let result: ISingleEditOperation[] = [];

			this.modifiedModel.pushEditOperations(null, edits, (undoEdits) => {
				result = undoEdits;
				return null;
			}, undefined, source);

			return result;
		} finally {
			this._isEditFromUs = false;
		}
	}

	/**
	 * Keeps the current modified document as the final contents.
	 */
	public keep() {
		this.notifyHunkAction('accepted', { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
		this.originalModel.setValue(this.modifiedModel.createSnapshot());
		this._reset();
	}

	/**
	 * Undoes the current modified document as the final contents.
	 */
	public undo() {
		this.notifyHunkAction('rejected', { linesAdded: this.linesAdded, linesRemoved: this.linesRemoved, lineCount: this.lineChangeCount, hasRemainingEdits: false });
		this.modifiedModel.pushStackElement();
		this._applyEdits([(EditOperation.replace(this.modifiedModel.getFullModelRange(), this.originalModel.getValue()))], EditSources.chatUndoEdits());
		this.modifiedModel.pushStackElement();
		this._reset();
	}

	private _reset() {
		this._originalToModifiedEdit = StringEdit.empty;
		this._diffInfo.set(nullDocumentDiff, undefined);
		this._didUserEditModelFired = false;
	}

	public async resetDocumentValues(newOriginal: string | ITextSnapshot | undefined, newModified: string | undefined): Promise<void> {
		let didChange = false;
		if (newOriginal !== undefined) {
			this.originalModel.setValue(newOriginal);
			didChange = true;
		}
		if (newModified !== undefined && this.modifiedModel.getValue() !== newModified) {
			// NOTE that this isn't done via `setValue` so that the undo stack is preserved
			this.modifiedModel.pushStackElement();
			this._applyEdits([(EditOperation.replace(this.modifiedModel.getFullModelRange(), newModified))], EditSources.chatReset());
			this.modifiedModel.pushStackElement();
			didChange = true;
		}
		if (didChange) {
			await this._updateDiffInfoSeq();
		}
	}

	private _mirrorEdits(event: IModelContentChangedEvent) {
		const edit = offsetEditFromContentChanges(event.changes);
		const isExternalEdit = this._isExternalEditInProgress?.();

		if (this._isEditFromUs || isExternalEdit) {
			const e_sum = this._originalToModifiedEdit;
			const e_ai = edit;
			this._originalToModifiedEdit = e_sum.compose(e_ai);
			if (isExternalEdit) {
				this._updateDiffInfoSeq();
			}
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
			const e_ai = this._originalToModifiedEdit;
			const e_user = edit;

			const e_user_r = e_user.tryRebase(e_ai.inverse(this.originalModel.getValue()));

			if (e_user_r === undefined) {
				// user edits overlaps/conflicts with AI edits
				this._originalToModifiedEdit = e_ai.compose(e_user);
			} else {
				const edits = offsetEditToEditOperations(e_user_r, this.originalModel);
				this.originalModel.applyEdits(edits);
				this._originalToModifiedEdit = e_ai.rebaseSkipConflicting(e_user_r);
			}

			this._allEditsAreFromUs = false;
			this._updateDiffInfoSeq();
			if (!this._didUserEditModelFired) {
				this._didUserEditModelFired = true;
				this._didUserEditModel.fire();
			}
		}
	}

	private async _keepHunk(change: DetailedLineRangeMapping): Promise<boolean> {
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
		await this._updateDiffInfoSeq('accepted');
		if (this._diffInfo.get().identical) {
			this._didAcceptOrRejectAllHunks.fire(ModifiedFileEntryState.Accepted);
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
		return true;
	}

	private async _undoHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			return false;
		}
		const edits: ISingleEditOperation[] = [];
		for (const edit of change.innerChanges ?? []) {
			const newText = this.originalModel.getValueInRange(edit.originalRange);
			edits.push(EditOperation.replace(edit.modifiedRange, newText));
		}
		this.modifiedModel.pushEditOperations(null, edits, _ => null);
		await this._updateDiffInfoSeq('rejected');
		if (this._diffInfo.get().identical) {
			this._didAcceptOrRejectAllHunks.fire(ModifiedFileEntryState.Rejected);
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
		return true;
	}


	private async _updateDiffInfoSeq(notifyAction: 'accepted' | 'rejected' | undefined = undefined) {
		const myDiffOperationId = ++this._diffOperationIds;
		await Promise.resolve(this._diffOperation);
		const previousCount = this.lineChangeCount;
		const previousAdded = this.linesAdded;
		const previousRemoved = this.linesRemoved;
		if (this._diffOperationIds === myDiffOperationId) {
			const thisDiffOperation = this._updateDiffInfo();
			this._diffOperation = thisDiffOperation;
			await thisDiffOperation;
			if (notifyAction) {
				const affectedLines = {
					linesAdded: previousAdded - this.linesAdded,
					linesRemoved: previousRemoved - this.linesRemoved,
					lineCount: previousCount - this.lineChangeCount,
					hasRemainingEdits: this.lineChangeCount > 0
				};
				this.notifyHunkAction(notifyAction, affectedLines);
			}
		}
	}

	public hasHunkAt(range: IRange) {
		// return true if the range overlaps a diff range
		return this._diffInfo.get().changes.some(c => c.modified.intersectsStrict(LineRange.fromRangeInclusive(range)));
	}

	private async _updateDiffInfo(): Promise<IDocumentDiff | undefined> {

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
			return undefined;
		}

		if (this.state.get() !== ModifiedFileEntryState.Modified) {
			this._diffInfo.set(nullDocumentDiff, undefined);
			this._originalToModifiedEdit = StringEdit.empty;
			return nullDocumentDiff;
		}

		const docVersionNow = this.modifiedModel.getVersionId();
		const snapshotVersionNow = this.originalModel.getVersionId();

		const diff = await this._editorWorkerService.computeDiff(
			this.originalModel.uri,
			this.modifiedModel.uri,
			{
				ignoreTrimWhitespace: false, // NEVER ignore whitespace so that undo/accept edits are correct and so that all changes (1 of 2) are spelled out
				computeMoves: false,
				maxComputationTimeMs: 3000
			},
			'advanced'
		);

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed() || this._store.isDisposed) {
			return undefined;
		}

		// only update the diff if the documents didn't change in the meantime
		if (this.modifiedModel.getVersionId() === docVersionNow && this.originalModel.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;
			this._diffInfo.set(diff2, undefined);
			this._originalToModifiedEdit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diff2.changes);
			return diff2;
		}
		return undefined;
	}
}
