/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { findLastIdxMonotonous } from '../../../../util/vs/base/common/arraysFind';
import { assertReturnsDefined } from '../../../../util/vs/base/common/types';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { deserializeStringEdit } from '../../../inlineEdits/common/dataTypes/editUtils';
import { DocumentEventLogEntryData, LogEntry } from '../workspaceLog';
import {
	DocumentChangedOperation, DocumentClosedOperation, DocumentFocusChangedOperation, DocumentId,
	DocumentOpenedOperation, DocumentRestoreContentOperation, DocumentSelectionChangedOperation, DocumentSetContentOperation, DocumentStateId, InlineCompletionFetchRequest, Operation
} from './operation';

export class DocumentRecording {
	private readonly _docOperationsByStateIdBefore: DocumentChange[] = [];
	private _currentState: DocumentState = DocumentState.empty;
	private readonly _documentVersionAfterToOperation: Map<number, Operation> = new Map();

	constructor(
		public readonly documentId: DocumentId,
		public readonly documentRelativePath: string,
		private readonly _contentsByHash: Map<string, string>,
		public readonly documentUri: string | undefined,
	) {
		assertReturnsDefined(documentRelativePath);
	}

	getLastState(): DocumentState {
		return this._currentState;
	}

	addOperation(opIdx: number, e: LogEntry, logEntryIdx: number, createSyntheticSelectionEvents: boolean, fetchRequests: Map<number, InlineCompletionFetchRequest>): Operation[] {
		const prevStateId = this._currentState.stateId;
		switch (e.kind) {
			case 'setContent': {
				const docOp = new SetValueEdit(opIdx, e.content);
				this._docOperationsByStateIdBefore.push(docOp);
				this._currentState = docOp.applyTo(this._currentState);
				const op = new DocumentSetContentOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx, e.content);
				if (e.v !== undefined) {
					this._documentVersionAfterToOperation.set(e.v, op);
				}

				return [op];
			}

			case 'opened':
				return [new DocumentOpenedOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx)];

			case 'closed':
				return [new DocumentClosedOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx)];

			case 'changed': {
				const edit = deserializeStringEdit(e.edit);

				const ops: Operation[] = [];

				if (createSyntheticSelectionEvents) {
					const selection = edit.replacements.map(e => e.replaceRange);
					const op = new SetSelectionEdit(opIdx, selection);
					this._docOperationsByStateIdBefore.push(op);
					this._currentState = op.applyTo(this._currentState);

					ops.push(new DocumentSelectionChangedOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx, selection));
					opIdx++;
				}

				const op = new DocumentEdit(opIdx, edit);
				this._docOperationsByStateIdBefore.push(op);
				this._currentState = op.applyTo(this._currentState);

				if (createSyntheticSelectionEvents) {
					const selection = edit.getNewRanges();
					const op = new SetSelectionEdit(opIdx, selection);
					this._docOperationsByStateIdBefore.push(op);
					this._currentState = op.applyTo(this._currentState);
				}

				const documentChangedOperation = new DocumentChangedOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx, edit);
				if (e.v !== undefined) {
					this._documentVersionAfterToOperation.set(e.v, documentChangedOperation);
				}
				ops.push(documentChangedOperation);
				return ops;
			}

			case 'documentEvent': {
				const data = e.data as DocumentEventLogEntryData;
				const referencedOp = this._documentVersionAfterToOperation.get(data.v);
				switch (data.sourceId) {
					case 'InlineCompletions.fetch':
						if (referencedOp) {
							const req = new InlineCompletionFetchRequest(data.requestId);
							referencedOp.inlineCompletionFetchRequests.push(req);
							fetchRequests.set(req.requestId, req);
						}
						break;
					case 'TextModel.setChangeReason':
						if (referencedOp) {
							referencedOp.reason = data.source;
						}
						break;
					default:
						break;
				}
				return [];
			}
			case 'focused':
				return [new DocumentFocusChangedOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx)];

			case 'selectionChanged': {
				const selection = e.selection.map(s => new OffsetRange(s[0], s[1]));
				const op = new SetSelectionEdit(opIdx, selection);
				this._docOperationsByStateIdBefore.push(op);
				this._currentState = op.applyTo(this._currentState);

				return [new DocumentSelectionChangedOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx, selection)];
			}
			case 'restoreContent': {
				const content = this._contentsByHash.get(e.contentId);
				if (content === undefined) { throw new Error(`No content with hash ${e.contentId} found`); }
				const op = new SetValueEdit(opIdx, content);
				this._docOperationsByStateIdBefore.push(op);
				this._currentState = op.applyTo(this._currentState);

				return [new DocumentRestoreContentOperation(opIdx, e.time, this.documentId, prevStateId, this._currentState.stateId, logEntryIdx)];
			}
			default:
				throw new Error(`Unknown entry type: ${e}`);
		}
	}

	private readonly statesByStateIdDiv100: DocumentState[] = [];

	private _previousState: DocumentState | undefined;

	private _getLastStateEqualOrBefore(stateId: DocumentStateId): DocumentState {
		if (this._previousState && this._previousState.stateId <= stateId) {
			return this._previousState;
		}
		const idx = Math.floor(stateId / 100);
		if (idx < this.statesByStateIdDiv100.length) {
			const s = this.statesByStateIdDiv100[idx];
			return s;
		}
		if (this.statesByStateIdDiv100.length === 0) {
			return DocumentState.empty;
		}
		return this.statesByStateIdDiv100[this.statesByStateIdDiv100.length - 1];
	}

	getState(documentStateId: DocumentStateId): DocumentState {
		let state = this._getLastStateEqualOrBefore(documentStateId);
		while (state.stateId < documentStateId) {
			if ((state.stateId % 100) === 0) {
				this.statesByStateIdDiv100[Math.floor(state.stateId / 100)] = state;
			}
			state = this._docOperationsByStateIdBefore[state.stateId].applyTo(state);
		}

		this._previousState = state;

		return state;
	}

	getStateIdAfterOp(opIdx: number): DocumentStateId {
		const idx = findLastIdxMonotonous(this._docOperationsByStateIdBefore, op => op.opIdx <= opIdx);
		if (idx === -1) { return this._docOperationsByStateIdBefore.length; }
		return idx + 1;
	}

	getEdit(initialState: DocumentStateId, lastState: DocumentStateId): StringEdit {
		let edit: StringEdit = StringEdit.empty;
		for (let i = initialState; i < lastState; i++) {
			const op = this._docOperationsByStateIdBefore[i];
			if (op instanceof DocumentEdit) {
				edit = edit.compose(op.edit);
			} else if (op instanceof SetValueEdit) {
				throw new Error('not implemented');
			}
		}
		return edit;
	}
}

export class DocumentState {
	public static readonly empty = new DocumentState('', [], 0);

	constructor(
		public readonly value: string,
		public readonly selection: OffsetRange[],
		public readonly stateId: DocumentStateId,
	) { }
}

abstract class DocumentChange {
	constructor(
		public readonly opIdx: number
	) { }

	abstract applyTo(state: DocumentState): DocumentState;
}

class DocumentEdit extends DocumentChange {
	constructor(
		opIdx: number,
		public readonly edit: StringEdit,
	) {
		super(opIdx);
	}

	override applyTo(state: DocumentState): DocumentState {
		return new DocumentState(this.edit.apply(state.value), state.selection, state.stateId + 1);
	}
}

class SetValueEdit extends DocumentChange {
	constructor(
		opIdx: number,
		public readonly value: string,
	) {
		super(opIdx);
	}

	override applyTo(state: DocumentState): DocumentState {
		return new DocumentState(this.value, state.selection, state.stateId + 1);
	}
}

class SetSelectionEdit extends DocumentChange {
	constructor(
		opIdx: number,
		public readonly selection: OffsetRange[],
	) {
		super(opIdx);
	}

	override applyTo(state: DocumentState): DocumentState {
		return new DocumentState(state.value, this.selection, state.stateId + 1);
	}
}
