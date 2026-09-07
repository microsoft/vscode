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

	/**
	 * Returns log entries whose recorded instant falls within `[fromTimeMs, toTimeMs]`.
	 * Each document's framing (`documentEncountered`, `setContent`, `opened`) is still emitted
	 * so the returned log is self-contained, even when the document's edits started before `fromTimeMs`.
	 */
	public getLogInRange(fromTimeMs: number, toTimeMs: number): LogEntry[] | undefined {
		if (!this._workspaceRoot) {
			return undefined;
		}

		const log: {
			entry: LogEntry;
			sortTime: number;
		}[] = [];

		log.push({ entry: { documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: this._workspaceRoot.toString(), time: this.getNow(), uuid: generateUuid() }, sortTime: 0 });

		for (const doc of this._documentHistories.values()) {
			log.push(...doc.getDocumentLogInRange(fromTimeMs, toTimeMs));
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
			if (editOrSelectionChange.kind === 'selections') {
				const serializedOffsetRange: ISerializedOffsetRange[] = editOrSelectionChange.selections.map(s => [s.start, s.endExclusive]);
				log.push({ entry: { kind: 'selectionChanged', id: this.id, selection: serializedOffsetRange, time: editOrSelectionChange.instant }, sortTime: editOrSelectionChange.instant });
			} else {
				// Only content changes bump the document version, mirroring how VS Code's real
				// model version works (and matching what `WorkspaceRecorder` writes in production).
				docVersion++;
				log.push({ entry: { kind: 'changed', id: this.id, v: docVersion, edit: serializeStringEdit(editOrSelectionChange.edit), time: editOrSelectionChange.instant }, sortTime: editOrSelectionChange.instant });
			}
		}

		return log;
	}

	/**
	 * Emit a self-contained log for entries with `instant` in `[fromTimeMs, toTimeMs]`.
	 * Returns `[]` when the document has no entries in range — the caller skips empty docs.
	 *
	 * Framing (`documentEncountered`, `setContent`, `opened`) reflects the document state at the
	 * effective base time. If `fromTimeMs > _baseValueTime`, the base value is fast-forwarded by
	 * applying edits in `[_baseValueTime, fromTimeMs)` so the emitted `setContent` represents the
	 * document state at the latest base time `<= fromTimeMs`.
	 *
	 * Framing entries carry their **true** times (`creationTime` for `documentEncountered`,
	 * `baseValueTime` for `setContent`/`opened`), even when those times pre-date `fromTimeMs`.
	 * This matches what production `WorkspaceRecorder` emits and keeps sorting deterministic by
	 * real timestamps. Consumers should treat any entry whose `time < fromTimeMs` as framing.
	 */
	getDocumentLogInRange(fromTimeMs: number, toTimeMs: number): { entry: LogEntry; sortTime: number }[] {
		// Intentionally no `cleanUpHistory()` call here. Cleanup uses `getNow() - 5min` as the
		// cutoff, which can be slightly later than `fromTimeMs` (we computed `fromTimeMs` a few
		// instants ago in the caller). In that race, cleanup would rotate an edit at the leading
		// edge of `[fromTimeMs, toTimeMs]` into `baseValue` and we'd silently drop it from the
		// emitted slice. The buffer is still bounded by the per-edit cleanup in `handleEdit`.

		const inRange = this._edits.filter(e => e.instant >= fromTimeMs && e.instant <= toTimeMs);
		if (inRange.length === 0) {
			return [];
		}

		// Fast-forward base value to fromTimeMs (or stay at _baseValueTime if it's later)
		let baseValue = this._baseValue;
		let baseValueTime = this._baseValueTime;
		if (fromTimeMs > baseValueTime) {
			for (const e of this._edits) {
				if (e.instant >= fromTimeMs) { break; }
				if (e.kind === 'edit') {
					baseValue = e.edit.applyOnText(baseValue);
					baseValueTime = e.instant;
				}
			}
		}

		const log: { entry: LogEntry; sortTime: number }[] = [];
		log.push({ entry: { kind: 'documentEncountered', id: this.id, relativePath: this.relativePath, time: this.creationTime }, sortTime: this.creationTime });
		let docVersion = 1;
		log.push({ entry: { kind: 'setContent', id: this.id, v: docVersion, content: baseValue.value, time: baseValueTime }, sortTime: baseValueTime });
		log.push({ entry: { kind: 'opened', id: this.id, time: baseValueTime }, sortTime: baseValueTime });

		for (const e of inRange) {
			if (e.kind === 'selections') {
				const serializedOffsetRange: ISerializedOffsetRange[] = e.selections.map(s => [s.start, s.endExclusive]);
				log.push({ entry: { kind: 'selectionChanged', id: this.id, selection: serializedOffsetRange, time: e.instant }, sortTime: e.instant });
			} else {
				// Only content changes bump the document version (selections don't), matching what
				// `WorkspaceRecorder` writes in production via VS Code's real model version.
				docVersion++;
				log.push({ entry: { kind: 'changed', id: this.id, v: docVersion, edit: serializeStringEdit(e.edit), time: e.instant }, sortTime: e.instant });
			}
		}

		return log;
	}
}
