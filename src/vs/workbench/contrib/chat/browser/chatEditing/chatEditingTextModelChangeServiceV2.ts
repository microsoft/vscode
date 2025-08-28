/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextModel } from '../../../../../editor/common/model/textModel.js';
import { OperationHistoryManager } from './chatEditingSessionV2OperationHistoryManager.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { ChatEditOperationState } from './chatEditingSessionV2.js';
import { ChatTextEditOperation } from './chatEditingSessionV2Operations.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { TextEdit } from '../../../../../editor/common/languages.js';

export class ChatEditingTextModelChangeServiceV2 extends Disposable {

	private readonly _diffInfo = observableValue<IDocumentDiff | undefined>(this, nullDocumentDiff);
	private _originalModel: ITextModel | undefined;
	private _modifiedModel: ITextModel | undefined;
	private _seq = 0;

	public get diffInfo() {
		return this._diffInfo.map<IDocumentDiff2 | undefined>(value => {
			return value && {
				...value,
				originalModel: this._originalModel!,
				modifiedModel: this._modifiedModel!,
				keep: (changes: DetailedLineRangeMapping) => this.keep(changes),
				undo: (changes: DetailedLineRangeMapping) => this.undo(changes),
			} satisfies IDocumentDiff2;
		});
	}

	constructor(
		private readonly uri: URI,
		private readonly operationHistoryManager: OperationHistoryManager,
		private readonly _insta: IInstantiationService,
	) {
		super();

		const recompute = async (baseText: string | undefined, previewText: string | undefined, seq: number) => {
			if (seq !== this._seq) { return; }
			if (baseText === undefined || previewText === undefined) {
				this._disposeModels();
				this._diffInfo.set(nullDocumentDiff, undefined);
				return;
			}

			this._disposeModels();
			const originalUri = this.uri.with({ scheme: 'vscode-chat-base', fragment: 'base' });
			const modifiedUri = this.uri; // keep same resource for UI equality checks
			const originalModel = this._insta.createInstance(TextModel, baseText, 'text/plain', TextModel.DEFAULT_CREATION_OPTIONS, originalUri);
			const modifiedModel = this._insta.createInstance(TextModel, previewText, 'text/plain', TextModel.DEFAULT_CREATION_OPTIONS, modifiedUri);
			this._originalModel = originalModel;
			this._modifiedModel = modifiedModel;

			const editorWorker = this._insta.invokeFunction(accessor => accessor.get(IEditorWorkerService));
			const diff = await editorWorker.computeDiff(
				originalModel.uri,
				modifiedModel.uri,
				{
					ignoreTrimWhitespace: false,
					computeMoves: false,
					maxComputationTimeMs: 3000,
				},
				'advanced'
			);
			if (seq !== this._seq) { return; }
			this._diffInfo.set(diff ?? nullDocumentDiff, undefined);
		};

		// Recompute on any change in operations
		this._register(autorun(r => {
			const baseText = this.operationHistoryManager.readOnlyAcceptedChanges(this.uri).read(r);
			const previewText = this.operationHistoryManager.readPreview(this.uri).read(r);
			const mySeq = ++this._seq;
			void recompute(baseText, previewText, mySeq);
		}));

		// Dispose ephemeral models when this service is disposed
		this._register({ dispose: () => this._disposeModels() });
	}

	private _disposeModels() {
		this._originalModel?.dispose();
		this._modifiedModel?.dispose();
		this._originalModel = undefined;
		this._modifiedModel = undefined;
	}

	// Placeholder: partial accept of hunks; implemented in next step with operation splitting
	async keep(changes: DetailedLineRangeMapping | DetailedLineRangeMapping[]): Promise<boolean> {
		const arr = Array.isArray(changes) ? changes : [changes];
		if (!this._modifiedModel || !this._originalModel) {
			return false;
		}
		// Ensure pending edits are normalized for precise mapping
		await this.operationHistoryManager.normalizePendingTextEditsFor(this.uri);

		const hunks = arr.flatMap(c => c.innerChanges ?? []);
		if (hunks.length === 0) { return true; }

		// Collect candidate operations affecting these ranges
		let pending = this._getPendingTextOps();

		// First ensure any multi-edit operations are split into single-edit ones
		for (const op of pending) {
			if (op.edits.length > 1) {
				await this.operationHistoryManager.normalizePendingTextEditsFor(this.uri);
				this.operationHistoryManager.splitTextEditOperation(op.id, op.edits);
			}
		}
		pending = this._getPendingTextOps();

		// Split ops that partially overlap the keep ranges into separate single-edit ops
		const keepRanges = hunks.map(h => h.modifiedRange);
		for (const op of pending) {
			if (op.edits.length !== 1) { continue; }
			const [edit] = op.edits;
			const split = this._splitEditByRanges(edit, keepRanges, this._modifiedModel);
			if (split?.length && (split.length > 1 || (split.length === 1 && !Range.equalsRange(split[0].range, edit.range)))) {
				this.operationHistoryManager.splitTextEditOperation(op.id, split);
			}
		}

		// Recompute pending ops and accept those fully inside keep ranges
		pending = this._getPendingTextOps();
		const toAccept = pending.filter(op => this._isEditInsideRanges(op.edits[0], keepRanges));
		if (toAccept.length === 0) { return false; }
		await this.operationHistoryManager.accept(toAccept);
		return true;
	}

	// Placeholder: partial undo of hunks; implemented in next step with operation splitting
	async undo(changes: DetailedLineRangeMapping | DetailedLineRangeMapping[]): Promise<boolean> {
		const arr = Array.isArray(changes) ? changes : [changes];
		if (!this._modifiedModel || !this._originalModel) {
			return false;
		}
		await this.operationHistoryManager.normalizePendingTextEditsFor(this.uri);

		const hunks = arr.flatMap(c => c.innerChanges ?? []);
		if (hunks.length === 0) { return true; }

		let pending = this._getPendingTextOps();
		for (const op of pending) {
			if (op.edits.length > 1) {
				await this.operationHistoryManager.normalizePendingTextEditsFor(this.uri);
				this.operationHistoryManager.splitTextEditOperation(op.id, op.edits);
			}
		}
		pending = this._getPendingTextOps();

		const keepRanges = hunks.map(h => h.modifiedRange);
		for (const op of pending) {
			if (op.edits.length !== 1) { continue; }
			const [edit] = op.edits;
			const split = this._splitEditByRanges(edit, keepRanges, this._modifiedModel);
			if (split?.length && (split.length > 1 || (split.length === 1 && !Range.equalsRange(split[0].range, edit.range)))) {
				this.operationHistoryManager.splitTextEditOperation(op.id, split);
			}
		}

		pending = this._getPendingTextOps();
		const toReject = pending.filter(op => this._isEditInsideRanges(op.edits[0], keepRanges));
		if (toReject.length === 0) { return false; }
		await this.operationHistoryManager.reject(toReject);
		return true;
	}

	private _getPendingTextOps(): ChatTextEditOperation[] {
		return this.operationHistoryManager
			.getOperations({ affectsResource: [this.uri], inState: ChatEditOperationState.Pending })
			.filter((op): op is ChatTextEditOperation => op instanceof ChatTextEditOperation);
	}

	private _splitEditByRanges(edit: TextEdit, keepRanges: Range[], modifiedModel: ITextModel): TextEdit[] | undefined {
		// Treat deletions (text === '') as atomic for now
		const editRange = Range.lift(edit.range);
		if (!editRange.isEmpty() && edit.text === '') {
			return [edit];
		}
		const intersects = keepRanges
			.map(r => Range.intersectRanges(editRange, r))
			.filter((r): r is Range => !!r)
			.sort(Range.compareRangesUsingStarts);
		if (intersects.length === 0) {
			return [edit];
		}

		// Merge overlapping intersects
		const merged: Range[] = [];
		for (const r of intersects) {
			const last = merged.at(-1);
			if (last && Range.areIntersectingOrTouching(last, r)) {
				merged[merged.length - 1] = Range.plusRange(last, r);
			} else {
				merged.push(r);
			}
		}

		const segs: TextEdit[] = [];
		let curStartLine = editRange.startLineNumber;
		let curStartCol = editRange.startColumn;
		for (const r of merged) {
			if (curStartLine < r.startLineNumber || (curStartLine === r.startLineNumber && curStartCol < r.startColumn)) {
				const left = new Range(curStartLine, curStartCol, r.startLineNumber, r.startColumn);
				segs.push({ range: left, text: modifiedModel.getValueInRange(left) });
			}
			segs.push({ range: r, text: modifiedModel.getValueInRange(r) });
			curStartLine = r.endLineNumber;
			curStartCol = r.endColumn;
		}
		if (curStartLine < editRange.endLineNumber || (curStartLine === editRange.endLineNumber && curStartCol < editRange.endColumn)) {
			const right = new Range(curStartLine, curStartCol, editRange.endLineNumber, editRange.endColumn);
			segs.push({ range: right, text: modifiedModel.getValueInRange(right) });
		}
		return segs.length ? segs : [edit];
	}

	private _isEditInsideRanges(edit: TextEdit, ranges: Range[]): boolean {
		const e = Range.lift(edit.range);
		if (e.isEmpty()) {
			const pos = new Position(e.startLineNumber, e.startColumn);
			return ranges.some(r => r.containsPosition(pos));
		}
		return ranges.some(r => r.containsRange(e));
	}
}
