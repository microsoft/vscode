/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IDocumentDiff, nullDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { TextEdit } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDocumentDiff2 } from './chatEditingCodeEditorIntegration.js';
import { ChatEditOperationState } from './chatEditingSessionV2.js';
import { OperationHistoryManager } from './chatEditingSessionV2OperationHistoryManager.js';
import { ChatTextEditOperation } from './chatEditingSessionV2Operations.js';

export class ChatEditingTextModelChangeServiceV2 extends Disposable {

	private readonly _diffInfo = observableValue<IDocumentDiff | undefined>(this, nullDocumentDiff);
	private readonly _originalModel = this._register(new MutableDisposable<IReference<IResolvedTextEditorModel>>());
	private readonly _modifiedModel = this._register(new MutableDisposable<IReference<IResolvedTextEditorModel>>());

	public get diffInfo() {
		return this._diffInfo.map<IDocumentDiff2 | undefined>(value => {
			return value && this._originalModel.value && this._modifiedModel.value && {
				...value,
				originalModel: this._originalModel.value?.object.textEditorModel,
				modifiedModel: this._modifiedModel.value?.object.textEditorModel,
				keep: (changes: DetailedLineRangeMapping) => this.keep(changes),
				undo: (changes: DetailedLineRangeMapping) => this.undo(changes),
				appliesToResource: this.uri,
			} satisfies IDocumentDiff2;
		});
	}

	constructor(
		private readonly uri: URI,
		originalURI: URI,
		modifiedURI: URI,
		private readonly operationHistoryManager: OperationHistoryManager,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IInstantiationService private readonly instantationService: IInstantiationService,
	) {
		super();

		Promise.all([
			this._textModelService.createModelReference(originalURI),
			this._textModelService.createModelReference(modifiedURI),
		]).then(([originalRef, modifiedRef]) => {
			if (this._store.isDisposed) {
				originalRef.dispose();
				modifiedRef.dispose();
				return;
			}

			this._originalModel.value = originalRef;
			this._modifiedModel.value = modifiedRef;

			let seq = 0;
			const recompute = async () => {
				const thisSeq = ++seq;
				const diff = await editorWorkerService.computeDiff(
					originalURI,
					modifiedURI,
					{
						ignoreTrimWhitespace: false,
						computeMoves: false,
						maxComputationTimeMs: 3000,
					},
					'advanced'
				);

				if (seq === thisSeq) {
					this._diffInfo.set(diff ?? undefined, undefined);
				}
			};

			this._register(originalRef.object.textEditorModel.onDidChangeContent(recompute));
			this._register(modifiedRef.object.textEditorModel.onDidChangeContent(recompute));
			recompute();
		});
	}

	keep(changes: DetailedLineRangeMapping | DetailedLineRangeMapping[]): Promise<boolean> {
		return this._acceptOrRejectHunks('reject', changes);
	}

	undo(changes: DetailedLineRangeMapping | DetailedLineRangeMapping[]): Promise<boolean> {
		return this._acceptOrRejectHunks('reject', changes);
	}

	private async _acceptOrRejectHunks(operation: 'accept' | 'reject', changes: DetailedLineRangeMapping | DetailedLineRangeMapping[]) {
		const arr = Array.isArray(changes) ? changes : [changes];
		if (!this._modifiedModel.value || !this._originalModel.value) {
			return false;
		}
		// Ensure pending edits are normalized for precise mapping
		await this.operationHistoryManager.normalizePendingTextEditsFor(this.uri);

		const hunks = arr.flatMap(c => c.innerChanges ?? []);
		if (hunks.length === 0) {
			return true;
		}

		// Split ops that partially overlap the keep ranges into separate single-edit ops
		const keepRanges = hunks.map(h => h.modifiedRange);
		const toAccept: ChatTextEditOperation[] = [];

		for (const op of this._getPendingTextOps()) {
			const accept: TextEdit[] = [];
			const unchanged: TextEdit[] = [];
			for (const edit of op.edits) {
				for (const part of this._splitEditByRanges(edit, keepRanges, this._modifiedModel.value!.object.textEditorModel)) {
					if (this._isEditInsideRanges(part, keepRanges)) {
						accept.push(part);
					} else {
						unchanged.push(part);
					}
				}
			}

			if (unchanged.length === 0) {
				toAccept.push(op);
			} else if (accept.length === 0) {
				// nothing to do
			} else {
				const acceptedOp = this.instantationService.createInstance(ChatTextEditOperation, op.id + '.1', this.uri, accept, false);
				this.operationHistoryManager.spliceOperations(op.id, 1,
					{ op: acceptedOp, state: ChatEditOperationState.Accepted },
					{ op: this.instantationService.createInstance(ChatTextEditOperation, op.id + '.2', this.uri, unchanged, false), state: ChatEditOperationState.Pending },
				);
				toAccept.push(op);
			}
		}

		await this.operationHistoryManager[operation](toAccept);

		return true;
	}

	private _getPendingTextOps(): ChatTextEditOperation[] {
		return this.operationHistoryManager
			.getOperations({ affectsResource: [this.uri], inState: ChatEditOperationState.Pending })
			.filter((op): op is ChatTextEditOperation => op instanceof ChatTextEditOperation);
	}

	private _splitEditByRanges(edit: TextEdit, keepRanges: Range[], modifiedModel: ITextModel): TextEdit[] {
		// Treat deletions (text === '') as atomic for now
		const resultRange = this._getResultRangeForEdit(edit);
		if (!resultRange.isEmpty() && edit.text === '') {
			return [edit];
		}

		// If the non-whitespace 'core' content of the result is fully covered by keepRanges,
		// accept the entire edit without splitting (helps when the selection excludes leading/trailing EOLs)
		const core = this._getResultCoreRangeForEdit(edit, modifiedModel);
		if (core && this._isRangeFullyCoveredByRanges(core, keepRanges)) {
			return [edit];
		}
		const intersects = keepRanges
			.map(r => Range.intersectRanges(resultRange, r))
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
		let curStartLine = resultRange.startLineNumber;
		let curStartCol = resultRange.startColumn;
		for (const r of merged) {
			if (curStartLine < r.startLineNumber || (curStartLine === r.startLineNumber && curStartCol < r.startColumn)) {
				const left = new Range(curStartLine, curStartCol, r.startLineNumber, r.startColumn);
				segs.push({ range: left, text: modifiedModel.getValueInRange(left) });
			}
			segs.push({ range: r, text: modifiedModel.getValueInRange(r) });
			curStartLine = r.endLineNumber;
			curStartCol = r.endColumn;
		}
		if (curStartLine < resultRange.endLineNumber || (curStartLine === resultRange.endLineNumber && curStartCol < resultRange.endColumn)) {
			const right = new Range(curStartLine, curStartCol, resultRange.endLineNumber, resultRange.endColumn);
			segs.push({ range: right, text: modifiedModel.getValueInRange(right) });
		}
		return segs.length ? segs : [edit];
	}

	private _isEditInsideRanges(edit: TextEdit, ranges: Range[]): boolean {
		const e = this._getResultRangeForEdit(edit);
		if (e.isEmpty()) {
			const pos = new Position(e.startLineNumber, e.startColumn);
			return ranges.some(r => r.containsPosition(pos));
		}
		return ranges.some(r => r.containsRange(e));
	}

	private _getResultRangeForEdit(edit: TextEdit): Range {
		const start = Range.lift(edit.range).getStartPosition();
		const text = edit.text ?? '';
		if (text.length === 0) {
			return new Range(start.lineNumber, start.column, start.lineNumber, start.column);
		}
		const parts = text.split('\n');
		if (parts.length === 1) {
			return new Range(start.lineNumber, start.column, start.lineNumber, start.column + parts[0].length);
		}
		const endLine = start.lineNumber + parts.length - 1;
		const endsWithNewline = text.endsWith('\n');
		const lastLineLen = parts[parts.length - 1].length;
		const endCol = endsWithNewline ? start.column : (lastLineLen + 1);
		return new Range(start.lineNumber, start.column, endLine, endCol);
	}

	private _getResultCoreRangeForEdit(edit: TextEdit, model: ITextModel): Range | undefined {
		const rr = this._getResultRangeForEdit(edit);
		const text = model.getValueInRange(rr);
		if (!text) { return undefined; }
		const leadMatch = text.match(/^\s*/);
		const trailMatch = text.match(/\s*$/);
		const lead = leadMatch ? leadMatch[0].length : 0;
		const trail = trailMatch ? trailMatch[0].length : 0;
		const contentLen = Math.max(0, text.length - lead - trail);
		if (contentLen === 0) { return undefined; }
		const startPos = this._offsetToPositionInText(rr.getStartPosition(), text, lead);
		const endPos = this._offsetToPositionInText(rr.getStartPosition(), text, lead + contentLen);
		return new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
	}

	private _offsetToPositionInText(start: Position, text: string, offset: number): Position {
		let line = start.lineNumber;
		let col = start.column;
		for (let i = 0; i < offset; i++) {
			const ch = text.charCodeAt(i);
			if (ch === 10 /* \n */) {
				line += 1;
				col = 1;
			} else if (ch === 13 /* \r */) {
				// ignore
			} else {
				col += 1;
			}
		}
		return new Position(line, col);
	}

	private _isRangeFullyCoveredByRanges(target: Range, ranges: Range[]): boolean {
		const parts = ranges
			.map(r => Range.intersectRanges(target, r))
			.filter((r): r is Range => !!r)
			.sort(Range.compareRangesUsingStarts);
		if (parts.length === 0) { return false; }
		let cur = new Position(target.startLineNumber, target.startColumn);
		for (const p of parts) {
			if (cur.lineNumber !== p.startLineNumber || cur.column !== p.startColumn) {
				return false;
			}
			cur = new Position(p.endLineNumber, p.endColumn);
		}
		return cur.lineNumber === target.endLineNumber && cur.column === target.endColumn;
	}
}
