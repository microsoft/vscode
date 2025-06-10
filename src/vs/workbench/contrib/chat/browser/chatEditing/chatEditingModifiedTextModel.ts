/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { assertType } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditOperation, ISingleEditOperation } from '../../../../../editor/common/core/editOperation.js';
import { StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { offsetEditFromContentChanges, offsetEditToEditOperations } from '../../../../../editor/common/model/textModelStringEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { TextModelEditReason } from '../../../../../editor/common/textModelEditReason.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { editorSelectionBackground } from '../../../../../platform/theme/common/colorRegistry.js';
import { ICellEditOperation } from '../../../notebook/common/notebookCommon.js';
import { ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatResponseModel } from '../../common/chatModel.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { pendingRewriteMinimap } from './chatEditingModifiedFileEntry.js';


export class ChatEditingModifiedTextModel extends Disposable {

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
	private _diffOperation: Promise<IDocumentDiff | undefined> | undefined;
	private _diffOperationIds: number = 0;

	private readonly _diffInfo = observableValue<IDocumentDiff>(this, nullDocumentDiff);
	public get diffInfo() {
		return this._diffInfo.map(value => {
			return {
				...value,
				originalModel: this.originalModel,
				modifiedModel: this.modifiedModel,
				keep: changes => this.applyEditFromUs(() => this._acceptHunk(changes)),
				undo: changes => this.applyEditFromUs(() => this._rejectHunk(changes))
			} satisfies IDocumentDiff2;
		});
	}

	private readonly _editDecorationClear = this._register(new RunOnceScheduler(() => { this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []); }, 500));
	private _editDecorations: string[] = [];

	private readonly hunkAction = new Emitter<'acceptedAllChanges' | 'rejectedAllChanges'>();
	public readonly onHunkAction = this.hunkAction.event;

	constructor(
		private readonly originalModel: ITextModel,
		private readonly modifiedModel: ITextModel,
		private readonly state: IObservable<ModifiedFileEntryState>,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();

		this._register(toDisposable(() => {
			this.clearCurrentEditLineDecoration();
		}));
	}

	public clearCurrentEditLineDecoration() {
		this._editDecorations = this.modifiedModel.deltaDecorations(this._editDecorations, []);
	}

	public async areOriginalAndModifiedIdentical(): Promise<boolean> {
		const diff = await this._diffOperation;
		return diff ? diff.identical : false;
	}

	public mirrorEdits(event: IModelContentChangedEvent, _edit: StringEdit) {
		const edit = offsetEditFromContentChanges(event.changes);

		if (this._isEditFromUs) {
			const e_sum = _edit;
			const e_ai = edit;
			_edit = e_sum.compose(e_ai);
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
			const e_ai = _edit;
			const e_user = edit;

			const e_user_r = e_user.tryRebase(e_ai.inverse(this.originalModel.getValue()), true);

			if (e_user_r === undefined) {
				// user edits overlaps/conflicts with AI edits
				_edit = e_ai.compose(e_user);
			} else {
				const edits = offsetEditToEditOperations(e_user_r, this.originalModel);
				this.originalModel.applyEdits(edits);
				_edit = e_ai.tryRebase(e_user_r);
			}

			this._allEditsAreFromUs = false;
			this._updateDiffInfoSeq();
		}
		return _edit;
	}

	async acceptAgentEdits(resource: URI, textEdits: (TextEdit | ICellEditOperation)[], isLastEdits: boolean, responseModel: IChatResponseModel): Promise<{ rewriteRatio: number; maxLineNumber: number }> {

		assertType(textEdits.every(TextEdit.isTextEdit), 'INVALID args, can only handle text edits');
		assert(isEqual(resource, this.modifiedModel.uri), ' INVALID args, can only edit THIS document');

		const isAtomicEdits = textEdits.length > 0 && isLastEdits;
		let maxLineNumber = 0;
		let rewriteRatio = 0;

		if (isAtomicEdits) {
			// EDIT and DONE
			const minimalEdits = await this._editorWorkerService.computeMoreMinimalEdits(this.modifiedModel.uri, textEdits) ?? textEdits;
			const ops = minimalEdits.map(TextEdit.asEditOperation);
			const undoEdits = this._applyEdits(ops);

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
						options: ChatEditingModifiedTextModel._atomicEditDecorationOptions,
						range
					}]);

					await Promise.any([defer.p, timeout(500)]); // wait for animation to finish but also time-cap it
					listener.dispose();
				}
			}


		} else {
			// EDIT a bit, then DONE
			const ops = textEdits.map(TextEdit.asEditOperation);
			const undoEdits = this._applyEdits(ops);
			maxLineNumber = undoEdits.reduce((max, op) => Math.max(max, op.range.startLineNumber), 0);
			rewriteRatio = Math.min(1, maxLineNumber / this.modifiedModel.getLineCount());

			const newDecorations: IModelDeltaDecoration[] = [
				// decorate pending edit (region)
				{
					options: ChatEditingModifiedTextModel._pendingEditDecorationOptions,
					range: new Range(maxLineNumber + 1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
				}
			];

			if (maxLineNumber > 0) {
				// decorate last edit
				newDecorations.push({
					options: ChatEditingModifiedTextModel._lastEditDecorationOptions,
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

	public async applyEdits(edits: ISingleEditOperation[]) {
		await this._applyEdits(edits);
	}
	public setDocValue(value: string): void {
		if (this.modifiedModel.getValue() !== value) {

			this.modifiedModel.pushStackElement();
			const edit = EditOperation.replace(this.modifiedModel.getFullModelRange(), value);

			this.applyEdits([edit]);
			this.updateDiffInfo();
			this.modifiedModel.pushStackElement();
		}
	}
	public async updateDiffInfo() {
		await this._updateDiffInfoSeq();
	}

	private async _acceptHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			// diffInfo should have model version ids and check them (instead of the caller doing that)
			return false;
		}
		try {
			this._isEditFromUs = true;
			const edits: ISingleEditOperation[] = [];
			for (const edit of change.innerChanges ?? []) {
				const newText = this.modifiedModel.getValueInRange(edit.modifiedRange);
				edits.push(EditOperation.replace(edit.originalRange, newText));
			}
			this.originalModel.pushEditOperations(null, edits, _ => null);
			await this._updateDiffInfoSeq();
			if (this._diffInfo.get().identical) {
				this.hunkAction.fire('acceptedAllChanges');
			}
			this._accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
			return true;
		} finally {
			this._isEditFromUs = false;
		}
	}

	private async _rejectHunk(change: DetailedLineRangeMapping): Promise<boolean> {
		if (!this._diffInfo.get().changes.includes(change)) {
			return false;
		}
		const edits: ISingleEditOperation[] = [];
		for (const edit of change.innerChanges ?? []) {
			const newText = this.originalModel.getValueInRange(edit.originalRange);
			edits.push(EditOperation.replace(edit.modifiedRange, newText));
		}
		this.modifiedModel.pushEditOperations(null, edits, _ => null);
		await this._updateDiffInfoSeq();
		if (this._diffInfo.get().identical) {
			this.hunkAction.fire('rejectedAllChanges');
		}
		this._accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
		return true;
	}


	private applyEditFromUs<T>(action: () => T) {
		try {
			this._isEditFromUs = true;
			return action();
		} finally {
			this._isEditFromUs = false;
		}
	}

	private _applyEdits(edits: ISingleEditOperation[]) {
		return this.applyEditFromUs(() => {
			// make the actual edit
			let result: ISingleEditOperation[] = [];
			TextModelEditReason.editWithReason(new TextModelEditReason({ source: 'Chat.applyEdits' }), () => {
				this.modifiedModel.pushEditOperations(null, edits, (undoEdits) => {
					result = undoEdits;
					return null;
				});
			});
			return result;
		});
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

	private async _updateDiffInfo(): Promise<IDocumentDiff | undefined> {

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed()) {
			return undefined;
		}

		if (this.state.get() !== ModifiedFileEntryState.Modified) {
			this._diffInfo.set(nullDocumentDiff, undefined);
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

		if (this.originalModel.isDisposed() || this.modifiedModel.isDisposed()) {
			return undefined;
		}

		// only update the diff if the documents didn't change in the meantime
		if (this.modifiedModel.getVersionId() === docVersionNow && this.originalModel.getVersionId() === snapshotVersionNow) {
			const diff2 = diff ?? nullDocumentDiff;
			this._diffInfo.set(diff2, undefined);
			// this._edit = offsetEditFromLineRangeMapping(this.originalModel, this.modifiedModel, diff2.changes);
			return diff2;
		}
		return undefined;
	}
}
