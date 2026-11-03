/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { IEventFetchEnd } from '../workspaceLog';

export type Operation = DocumentSetContentOperation | DocumentOpenedOperation | DocumentClosedOperation
	| DocumentChangedOperation | DocumentFocusChangedOperation | DocumentSelectionChangedOperation | DocumentRestoreContentOperation;

export const enum OperationKind {
	SetContent = 0,
	Opened = 1,
	Closed = 2,
	Changed = 3,
	FocusChanged = 4,
	SelectionChanged = 5,
	Restore = 6,
}

export type Time = number;
export type DocumentId = number;
export type DocumentStateId = number;

export abstract class BaseOperation {
	public abstract get kind(): OperationKind;

	constructor(
		public readonly operationIdx: number,
		public readonly time: Time,
		public readonly documentId: DocumentId,
		public readonly documentStateIdBefore: DocumentStateId,
		public readonly documentStateIdAfter: DocumentStateId,
		public readonly logEventIdx: number,
	) { }

	public reason: string | undefined = undefined;
	public readonly inlineCompletionFetchRequests: InlineCompletionFetchRequest[] = [];
}

export class InlineCompletionFetchRequest {
	constructor(
		public readonly requestId: number,
		public result?: IEventFetchEnd,
	) { }
}

export class DocumentSetContentOperation extends BaseOperation {
	public readonly kind = OperationKind.SetContent;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
		/* If undefined, sets a rollback-point */
		public readonly content: string | undefined,
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}

export class DocumentOpenedOperation extends BaseOperation {
	public readonly kind = OperationKind.Opened;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}

export class DocumentClosedOperation extends BaseOperation {
	public readonly kind = OperationKind.Closed;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}

export class DocumentChangedOperation extends BaseOperation {
	public readonly kind = OperationKind.Changed;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
		public readonly edit: StringEdit,
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}

export class DocumentFocusChangedOperation extends BaseOperation {
	public readonly kind = OperationKind.FocusChanged;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}

export class DocumentSelectionChangedOperation extends BaseOperation {
	public readonly kind = OperationKind.SelectionChanged;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
		public readonly selection: readonly OffsetRange[],
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}

export class DocumentRestoreContentOperation extends BaseOperation {
	public readonly kind = OperationKind.Restore;

	constructor(
		operationIdx: number,
		time: Time,
		documentId: DocumentId,
		documentStateIdBefore: DocumentStateId,
		documentStateIdAfter: DocumentStateId,
		logEventIdx: number,
	) {
		super(operationIdx, time, documentId, documentStateIdBefore, documentStateIdAfter, logEventIdx);
	}
}
