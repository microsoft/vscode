/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { IObservableDocument, ObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { autorunWithChanges } from '../../../platform/inlineEdits/common/utils/observable';
import { ILogger, ILogService } from '../../../platform/log/common/logService';
import { Disposable, IDisposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { mapObservableArrayCached } from '../../../util/vs/base/common/observable';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';

export class RejectionCollector extends Disposable {
	private readonly _garbageCollector = this._register(new LRUGarbageCollector(20));
	private readonly _documentCaches = new Map<DocumentId, DocumentRejectionTracker>();
	private readonly _logger: ILogger;

	constructor(
		public readonly workspace: ObservableWorkspace,
		logService: ILogService,
	) {
		super();

		this._logger = logService.createSubLogger(['NES', 'RejectionCollector']);

		mapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {
			const state = new DocumentRejectionTracker(doc, this._garbageCollector, this._logger);
			this._documentCaches.set(state.doc.id, state);

			store.add(autorunWithChanges(this, {
				value: doc.value,
				selection: doc.selection,
				languageId: doc.languageId,
			}, (data) => {
				for (const edit of data.value.changes) {
					state.handleEdit(edit, data.value.value);
				}
			}));

			store.add(toDisposable(() => {
				this._documentCaches.delete(doc.id);
			}));
		}).recomputeInitiallyAndOnChange(this._store);
	}

	public reject(docId: DocumentId, edit: StringReplacement): void {
		const docCache = this._documentCaches.get(docId);
		if (!docCache) {
			this._logger.trace(`Rejecting, no document cache: ${edit}`);
			return;
		}
		const e = edit.removeCommonSuffixAndPrefix(docCache.doc.value.get().value);
		this._logger.trace(`Rejecting: ${e}`);
		docCache.reject(e);
	}

	public isRejected(docId: DocumentId, edit: StringReplacement): boolean {
		const docCache = this._documentCaches.get(docId);
		if (!docCache) {
			this._logger.trace(`Checking rejection, no document cache: ${edit}`);
			return false;
		}
		const e = edit.removeCommonSuffixAndPrefix(docCache.doc.value.get().value);
		const isRejected = docCache.isRejected(e);
		this._logger.trace(`Checking rejection, ${isRejected ? 'rejected' : 'not rejected'}: ${e}`);
		return isRejected;
	}

	public clear() {
		this._garbageCollector.clear();
	}
}

class DocumentRejectionTracker {
	private readonly _rejectedEdits = new Set<RejectedEdit>();

	constructor(
		public readonly doc: IObservableDocument,
		private readonly _garbageCollector: LRUGarbageCollector,
		private readonly _logger: ILogger,
	) {
	}

	public handleEdit(edit: StringEdit, currentContent: StringText): void {
		for (const r of [...this._rejectedEdits]) {
			r.handleEdit(edit, currentContent); // this can remove the rejected edit from the set
		}
	}

	public reject(edit: StringReplacement): void {
		if (this.isRejected(edit)) {
			// already tracked
			return;
		}
		const r = new RejectedEdit(edit.toEdit(), () => {
			this._logger.trace(`Evicting: ${edit}`);
			this._rejectedEdits.delete(r);
		});
		this._rejectedEdits.add(r);
		this._garbageCollector.put(r);
	}

	public isRejected(edit: StringReplacement): boolean {
		for (const r of this._rejectedEdits) {
			if (r.isRejected(edit)) {
				return true;
			}
		}
		return false;
	}
}

class RejectedEdit implements IDisposable {
	constructor(
		private _edit: StringEdit,
		private readonly _onDispose: () => void,
	) { }

	public handleEdit(edit: StringEdit, currentContent: StringText): void {
		const d = this._edit.tryRebase(edit);
		if (d) {
			this._edit = d.removeCommonSuffixAndPrefix(currentContent.value);
		} else {
			this.dispose();
		}
	}

	public isRejected(edit: StringReplacement): boolean {
		return this._edit.equals(edit.toEdit());
	}

	public dispose(): void {
		this._onDispose();
	}
}

class LRUGarbageCollector implements IDisposable {
	private _disposables: IDisposable[] = [];

	constructor(
		private _maxSize: number,
	) {
	}

	put(disposable: IDisposable): void {
		this._disposables.push(disposable);
		if (this._disposables.length > this._maxSize) {
			this._disposables.shift()!.dispose();
		}
	}

	public clear(): void {
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
	}

	public dispose(): void {
		this.clear();
	}
}
