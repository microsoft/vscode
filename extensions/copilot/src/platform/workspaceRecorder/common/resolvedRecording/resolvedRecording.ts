/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../util/vs/base/common/assert';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { EventLogEntryData, LogEntry } from '../workspaceLog';
import { DocumentRecording } from './documentHistory';
import { DocumentId, DocumentStateId, InlineCompletionFetchRequest, Operation, OperationKind } from './operation';

export class RecordingData {
	public static create(logEntries: readonly LogEntry[]): RecordingData {
		return new RecordingData(logEntries);
	}

	constructor(
		public readonly logEntries: readonly LogEntry[],
	) { }

	public readonly useSyntheticSelectionEvents = false;
}

export class ResolvedRecording {
	public static resolve(data: RecordingData): ResolvedRecording {
		const operations: Operation[] = [];
		const documents = new Map<DocumentId, DocumentRecording>();
		const contentsByHash = new Map<string, string>();

		const fetchRequests = new Map<number, InlineCompletionFetchRequest>();

		let uuid: string | undefined = undefined;
		let repoRootUri: string | undefined = undefined;

		let idx = 0;
		for (let logEntryIdx = 0; logEntryIdx < data.logEntries.length; logEntryIdx++) {
			const e = data.logEntries[logEntryIdx];

			if (e.kind === 'header') {
				uuid = e.uuid;
				repoRootUri = e.repoRootUri;
				continue;
			}

			if (e.kind === 'meta') {
				const data = e.data as any;
				if (typeof data.repoRootUri === 'string') {
					repoRootUri = data.repoRootUri as string;
				}
				continue;
			}

			if (e.kind === 'applicationStart') {
				continue;
			}

			if (e.kind === 'bookmark') {
				continue;
			}

			if (e.kind === 'documentEncountered') {
				const doc = new DocumentRecording(e.id, e.relativePath, contentsByHash, repoRootUri ? joinUriWithRelativePath(repoRootUri, e.relativePath) : undefined);
				documents.set(e.id, doc);
				continue;
			}
			if (e.kind === 'event') {
				const data = e.data as EventLogEntryData;

				switch (data.sourceId) {
					case 'InlineCompletions.fetch': {
						assert(data.kind === 'end');
						const req = fetchRequests.get(data.requestId);
						if (req) {
							req.result = data;
						}
						break;
					}
					default:
						break;
				}
				continue;
			}

			const doc = documents.get(e.id);
			if (!doc) {
				throw new Error(`Document ${e.id} not encountered before`);
			}

			if (e.kind === 'storeContent') {
				contentsByHash.set(e.contentId, doc.getLastState().value);
				continue;
			}

			const op = doc.addOperation(idx, e, logEntryIdx, data.useSyntheticSelectionEvents, fetchRequests);
			operations.push(...op);
			idx += op.length;
		}

		return new ResolvedRecording(operations, documents, uuid, repoRootUri);
	}

	private constructor(
		private readonly _operations: Operation[],
		private readonly _documents: Map<DocumentId, DocumentRecording>,
		public readonly uuid: string | undefined,
		public readonly repoRootUri: string | undefined,
	) { }

	public findFirstOperationAfter<T extends Operation>(op: Operation, predicate1: (op: Operation) => op is T, predicate2: (op: T) => boolean): T | undefined {
		for (let i = op.operationIdx + 1; i < this._operations.length; i++) {
			const op = this._operations[i];
			if (predicate1(op) && predicate2(op)) {
				return op;
			}
		}
		return undefined;
	}

	public getChangeOperationAtOrBefore(opIdx: number): Operation | undefined {
		for (let i = opIdx; i >= 0; i--) {
			const op = this._operations[i];
			if (op.kind === OperationKind.Changed) {
				return op;
			}
		}
		return undefined;
	}

	public get operations(): readonly Operation[] { return this._operations; }
	public get documents(): readonly WorkspaceDocument[] {
		return [...this._documents.values()].map(d => new WorkspaceDocument(d.documentId, d));
	}

	public getStateAfter(operationIdx: number): WorkspaceDocumentState {
		const operation = this._operations[operationIdx];

		const document = this._documents.get(operation.documentId)!;
		const state = document.getState(operation.documentStateIdAfter);
		return new WorkspaceDocumentState(operation.operationIdx, operation, operation.documentId, operation.documentStateIdAfter, state.value, state.selection, operation.logEventIdx);
	}

	public getDocument(documentId: DocumentId): WorkspaceDocument {
		return new WorkspaceDocument(documentId, this._documents.get(documentId)!);
	}

	public getDocumentByRelativePath(documentRelativePath: string): WorkspaceDocument | undefined {
		for (const doc of this.documents) {
			if (doc.documentRelativePath === documentRelativePath) {
				return doc;
			}
		}
		return undefined;
	}

	public getDocumentByUri(uri: string): WorkspaceDocument | undefined {
		for (const doc of this.documents) {
			if (doc.documentUri === uri) {
				return doc;
			}
		}
		return undefined;
	}
}

function joinUriWithRelativePath(baseUri: string, relativePath: string): string {
	if (baseUri.endsWith('/')) {
		baseUri = baseUri.substring(0, baseUri.length - 1);
	}
	return baseUri + '/' + relativePath.replaceAll('\\', '/');
}

class WorkspaceDocument {
	public readonly documentRelativePath = this.documentHistory.documentRelativePath;

	public readonly documentUri = this.documentHistory.documentUri;

	constructor(
		public readonly documentId: DocumentId,
		private readonly documentHistory: DocumentRecording,
	) { }

	getInitialState(): DocumentState { return this.documentHistory.getState(1); }

	getLastState(): DocumentState { return this.documentHistory.getLastState(); }

	getState(documentStateId: DocumentStateId): DocumentState {
		return this.documentHistory.getState(documentStateId);
	}

	getEdit(initialState: DocumentStateId, lastState: DocumentStateId): StringEdit {
		return this.documentHistory.getEdit(initialState, lastState);
	}

	getStateIdBeforeOrAtOpIdx(opIdx: number): DocumentStateId | undefined {
		return this.documentHistory.getStateIdAfterOp(opIdx);
	}
}

export interface DocumentState {
	stateId: DocumentStateId;
	value: string;
	selection: OffsetRange[];
}

export class WorkspaceDocumentState {
	constructor(
		public readonly operationIdx: number,
		public readonly operation: Operation,
		public readonly activeDocumentId: DocumentId,
		public readonly documentStateId: DocumentStateId,
		public readonly documentValue: string,
		public readonly documentSelection: readonly OffsetRange[],
		public readonly logEventIdx: number,
	) { }
}
