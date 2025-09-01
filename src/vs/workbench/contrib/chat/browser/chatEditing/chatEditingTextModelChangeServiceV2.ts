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
			const toAcceptOrDeny: TextEdit[] = [];
			const unchanged: TextEdit[] = [];
			for (const edit of op.edits) {
				if (this._isEditInsideRanges(edit, keepRanges)) {
					toAcceptOrDeny.push(edit);
				} else {
					unchanged.push(edit);
				}
			}

			if (unchanged.length === 0) {
				toAccept.push(op);
			} else if (toAcceptOrDeny.length === 0) {
				// nothing to do
			} else {
				const acceptedOp = this.instantationService.createInstance(ChatTextEditOperation, op.id + '.1', this.uri, toAcceptOrDeny, false);
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

	private _isEditInsideRanges(edit: TextEdit, ranges: Range[]): boolean {
		const e = this._getResultRangeForEdit(edit);
		if (e.isEmpty()) {
			const pos = new Position(e.startLineNumber, e.startColumn);
			return ranges.some(r => r.containsPosition(pos));
		}
		return ranges.some(r => r.intersectRanges(e));
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
}
