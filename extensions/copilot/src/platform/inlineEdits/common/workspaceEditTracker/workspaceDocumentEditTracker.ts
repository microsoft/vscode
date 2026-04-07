/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { autorun, mapObservableArrayCached } from '../../../../util/vs/base/common/observable';
import { AnnotatedStringEdit, IEditData, StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { DocumentId } from '../dataTypes/documentId';
import { ObservableGit } from '../observableGit';
import { ObservableWorkspace } from '../observableWorkspace';
import { autorunWithChanges } from '../utils/observable';
import { Instant, now } from '../utils/utils';

export type DocumentHistoryDifference = {
	before: StringText;
	after: StringText;
	edits: StringEdit;
}

export class WorkspaceDocumentEditHistory extends Disposable {
	private readonly _documentState = new Map<DocumentId, DocumentEditHistory>();
	private readonly _lastDocuments = new FifoSet<DocumentEditHistory>(50);
	private _lastGitCheckout: Instant | undefined;

	constructor(workspace: ObservableWorkspace, observableGit: ObservableGit, historyLength: number) {
		super();

		this._register(autorun(reader => {
			const branch = reader.readObservable(observableGit.branch);
			if (branch === undefined) {
				return; // probably git extension hasn't activated or no repository found, so don't do anything
			}
			this._lastGitCheckout = now();
			this._documentState.forEach(d => d.resetEditHistory());
		}));

		mapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {
			const state = new DocumentEditHistory(doc.value.get(), historyLength);
			this._documentState.set(doc.id, state);

			store.add(autorunWithChanges(this, {
				value: doc.value,
			}, (data) => {
				const isInCooldown = this._isAwaitingGitCheckoutCooldown();
				for (const edit of data.value.changes) {
					this._lastDocuments.push(state);
					state.handleEdit(edit, isInCooldown);
				}
			}));

			store.add(toDisposable(() => {
				const state = this._documentState.get(doc.id);
				if (state) {
					this._lastDocuments.remove(state);
				}
				this._documentState.delete(doc.id);
			}));
		}, d => d.id).recomputeInitiallyAndOnChange(this._store);
	}

	private _isAwaitingGitCheckoutCooldown(): boolean {
		if (!this._lastGitCheckout) {
			return false;
		}
		const isInCooldown = now() - this._lastGitCheckout < 2 * 1000 /* 2 seconds */;
		if (!isInCooldown) {
			this._lastGitCheckout = undefined;
		}
		return isInCooldown;
	}

	public getRecentEdits(docId: DocumentId): DocumentHistoryDifference | undefined {
		const state = this._documentState.get(docId);
		if (!state) {
			return undefined;
		}
		return state.getRecentEdits();
	}

	public getNRecentEdits(docId: DocumentId, n: number): DocumentHistoryDifference | undefined {
		const state = this._documentState.get(docId);
		if (!state) {
			return undefined;
		}
		return state.getNRecentEdits(n);
	}

	public resetEditHistory(): void {
		this._documentState.forEach(d => d.resetEditHistory());
	}

	public getLastDocuments(): readonly DocumentEditHistory[] {
		return this._lastDocuments.getItemsReversed();
	}

	public hasDocument(docId: DocumentId): boolean {
		return this._documentState.has(docId);
	}
}

class DocumentEdit implements IEditData<DocumentEdit> {
	constructor(public readonly value: number) { }
	join(other: DocumentEdit): DocumentEdit {
		if (this.value >= other.value) {
			return this;
		}
		return other;
	}
}

class DocumentEditHistory {

	private _documentStateID: number = 0;
	private _recentEdits = AnnotatedStringEdit.create<DocumentEdit>([]);
	private _base: StringText;
	private _current: StringText;

	constructor(
		original: StringText,
		private readonly _historyLength: number
	) {
		this._base = original;
		this._current = original;
	}

	public handleEdit(edit: StringEdit, isInCooldown: boolean): void {
		if (edit.isEmpty()) {
			return;
		}

		const stateIdentifier = this._documentStateID++;
		this._current = edit.applyOnText(this._current);

		if (isInCooldown) {
			this.resetEditHistory();
			return;
		}

		const annotatedEdit = edit.mapData<DocumentEdit>(r => new DocumentEdit(stateIdentifier));
		const updatedRecentEdits = this._recentEdits.compose(annotatedEdit);
		const { e1: newRecentEdits, e2: oldEdits } = updatedRecentEdits.decomposeSplit((r) => r.data.value > this._documentStateID - this._historyLength);

		this._recentEdits = newRecentEdits;
		this._base = oldEdits.applyOnText(this._base);
	}

	public getRecentEdits(): DocumentHistoryDifference {
		return {
			before: this._base,
			after: this._current,
			edits: this._recentEdits.toStringEdit()
		};
	}

	public getNRecentEdits(n: number): DocumentHistoryDifference {
		const { e1: nRecentEdits, e2: oldEdits } = this._recentEdits.decomposeSplit((r) => r.data.value > this._documentStateID - n);

		return {
			before: oldEdits.applyOnText(this._base),
			after: this._current,
			edits: nRecentEdits.toStringEdit()
		};
	}

	public resetEditHistory() {
		this._base = this._current;
		this._recentEdits = AnnotatedStringEdit.create([]);
	}
}

class FifoSet<T> {
	private _arr: T[] = [];

	constructor(
		public readonly maxSize: number
	) {
	}

	push(e: T): void {
		const existing = this._arr.indexOf(e);
		if (existing !== -1) {
			this._arr.splice(existing, 1);
		} else if (this._arr.length >= this.maxSize) {
			this._arr.shift();
		}
		this._arr.push(e);
	}

	remove(e: T): void {
		const existing = this._arr.indexOf(e);
		if (existing !== -1) {
			this._arr.splice(existing, 1);
		}
	}

	getItemsReversed(): readonly T[] {
		const arr = [...this._arr];
		arr.reverse();
		return arr;
	}

	has(item: T): boolean {
		return this._arr.indexOf(item) !== -1;
	}
}
