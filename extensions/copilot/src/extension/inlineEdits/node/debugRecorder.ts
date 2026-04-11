/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { serializeStringEdit } from '../../../platform/inlineEdits/common/dataTypes/editUtils';
import { LanguageId } from '../../../platform/inlineEdits/common/dataTypes/languageId';
import { DebugRecorderBookmark } from '../../../platform/inlineEdits/common/debugRecorderBookmark';
import { ObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { autorunWithChanges } from '../../../platform/inlineEdits/common/utils/observable';
import { Instant, now } from '../../../platform/inlineEdits/common/utils/utils';
import { ISerializedOffsetRange, LogEntry } from '../../../platform/workspaceRecorder/common/workspaceLog';
import { compareBy, numberComparator } from '../../../util/vs/base/common/arrays';
import { Disposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { Schemas } from '../../../util/vs/base/common/network';
import { mapObservableArrayCached } from '../../../util/vs/base/common/observableInternal';
import { relative } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';

export class DebugRecorder extends Disposable {
	private _id: number = 0;
	private readonly _documentHistories = new Map<DocumentId, DocumentHistory>();

	private _workspaceRoot: URI | undefined;

	constructor(
		private readonly _workspace: ObservableWorkspace,
		private readonly getNow = now
	) {
		super();

		mapObservableArrayCached(this, this._workspace.openDocuments, (doc, store) => {
			const root = this._workspace.getWorkspaceRoot(doc.id);
			if (!root) {
				return;
			}
			if (!this._workspaceRoot) {
				this._workspaceRoot = root;
			} else {
				if (this._workspaceRoot.toString() !== root.toString()) {
					// document is from a different root -> ignore
					return;
				}
			}

			const state = new DocumentHistory(root, doc.id, doc.value.get().value, this._id++, doc.languageId.get(), () => this.getTimestamp());
			this._documentHistories.set(state.docId, state);

			store.add(autorunWithChanges(this, {
				value: doc.value,
				selection: doc.selection,
				languageId: doc.languageId,
			}, (data) => {
				if (data.languageId.changes.length > 0) {
					state.languageId = data.languageId.value;
				}
				for (const edit of data.value.changes) {
					state.handleEdit(edit);
				}
				if (data.selection.changes.length > 0) {
					state.handleSelections(data.selection.value);
				}
			}));

			store.add(toDisposable(() => {
				// We might want to soft-delete the document
				this._documentHistories.delete(doc.id);
			}));
		}, d => d.id).recomputeInitiallyAndOnChange(this._store);
	}

	private _lastTimestamp: number | undefined;
	public getTimestamp(): number {
		let newTimestamp = this.getNow();
		if (this._lastTimestamp !== undefined && newTimestamp <= this._lastTimestamp) { // we want total ordering on the events
			newTimestamp = this._lastTimestamp + 1;
		}
		this._lastTimestamp = newTimestamp;
		return newTimestamp;
	}

	public getRecentLog(bookmark: DebugRecorderBookmark | undefined = undefined): LogEntry[] | undefined {
		if (!this._workspaceRoot) { // possible if the open file doesn't belong to a workspace
			return undefined;
		}

		const log: {
			entry: LogEntry;
			sortTime: number;
		}[] = [];

		log.push({ entry: { documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: this._workspaceRoot.toString(), time: this.getNow(), uuid: generateUuid() }, sortTime: 0 });

		for (const doc of this._documentHistories.values()) {
			log.push(...doc.getDocumentLog(bookmark));
		}

		log.sort(compareBy(e => e.sortTime, numberComparator));

		return log.map(l => l.entry);
	}

	public createBookmark(): DebugRecorderBookmark {
		return new DebugRecorderBookmark(this.getNow());
	}
}

class DocumentHistory {
	private _baseValue: StringText;
	/**
	 * Stores edits and selection changes in the order they happened.
	 */
	private _edits: ({
		kind: 'edit';
		edit: StringEdit;
		instant: Instant;
	} | {
		kind: 'selections';
		selections: readonly OffsetRange[];
		instant: Instant;
	})[] = [];

	public readonly creationTime: number;
	private _baseValueTime: number;

	constructor(
		public readonly workspaceUri: URI,
		public readonly docId: DocumentId,
		initialValue: string,
		public readonly id: number,
		public languageId: LanguageId,
		private readonly getNow: () => Instant
	) {
		this._baseValue = new StringText(initialValue);
		this.creationTime = this.getNow();
		this._baseValueTime = this.creationTime;
	}

	public handleSelections(selections: readonly OffsetRange[]): void {
		this._edits.push({ kind: 'selections', selections, instant: this.getNow() });
	}

	public handleEdit(edit: StringEdit): void {
		if (edit.isEmpty()) {
			return;
		}

		this._edits.push({ kind: 'edit', edit, instant: this.getNow() });

		this.cleanUpHistory();
	}

	public cleanUpHistory(): void {
		const windowSizeMs = 5 * 60 * 1000; // 5 minutes
		const earliestTime = this.getNow() - windowSizeMs;
		while (this._edits.length > 0 && this._edits[0].instant < earliestTime) {
			const edit = this._edits.shift()!;
			if (edit.kind === 'selections') {
				continue; // we drop selection changes
			}
			this._baseValue = edit.edit.applyOnText(this._baseValue);
			this._baseValueTime = edit.instant;
		}
	}

	private readonly relativePath = (() => {
		const basePath = relative(this.workspaceUri.path, this.docId.path);
		return this.docId.toUri().scheme === Schemas.vscodeNotebookCell ? `${basePath}#${this.docId.fragment}` : basePath;
	})();

	getDocumentLog(bookmark: DebugRecorderBookmark | undefined): { entry: LogEntry; sortTime: number }[] {
		this.cleanUpHistory();

		if (this._edits.length === 0) {
			return [];
		}

		const log: { entry: LogEntry; sortTime: number }[] = [];
		log.push({ entry: { kind: 'documentEncountered', id: this.id, relativePath: this.relativePath, time: this.creationTime }, sortTime: this.creationTime });
		let docVersion = 1;
		log.push({ entry: { kind: 'setContent', id: this.id, v: docVersion, content: this._baseValue.value, time: this._baseValueTime }, sortTime: this._baseValueTime });
		log.push({ entry: { kind: 'opened', id: this.id, time: this._baseValueTime }, sortTime: this._baseValueTime });

		for (const editOrSelectionChange of this._edits) {
			if (bookmark && editOrSelectionChange.instant > bookmark.timeMs) {
				// only considers edits that happened before the bookmark
				break;
			}
			docVersion++;
			if (editOrSelectionChange.kind === 'selections') {
				const serializedOffsetRange: ISerializedOffsetRange[] = editOrSelectionChange.selections.map(s => [s.start, s.endExclusive]);
				log.push({ entry: { kind: 'selectionChanged', id: this.id, selection: serializedOffsetRange, time: editOrSelectionChange.instant }, sortTime: editOrSelectionChange.instant });
			} else {
				log.push({ entry: { kind: 'changed', id: this.id, v: docVersion, edit: serializeStringEdit(editOrSelectionChange.edit), time: editOrSelectionChange.instant }, sortTime: editOrSelectionChange.instant });
			}
		}

		return log;
	}
}
