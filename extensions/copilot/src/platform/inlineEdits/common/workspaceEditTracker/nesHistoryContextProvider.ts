/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../util/vs/base/common/lifecycle';
import { autorun, mapObservableArrayCached } from '../../../../util/vs/base/common/observable';
import { assertType } from '../../../../util/vs/base/common/types';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { TextEdit } from '../../../../util/vs/editor/common/core/edits/textEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { DocumentId } from '../dataTypes/documentId';
import { Edits, RootedEdit } from '../dataTypes/edit';
import { LanguageId } from '../dataTypes/languageId';
import { RootedLineEdit } from '../dataTypes/rootedLineEdit';
import { TextLengthEdit } from '../dataTypes/textEditLength';
import { ObservableGit } from '../observableGit';
import { ObservableWorkspace } from '../observableWorkspace';
import { autorunWithChanges } from '../utils/observable';
import { Instant, now } from '../utils/utils';
import { DocumentHistory, HistoryContext, IHistoryContextProvider } from './historyContextProvider';

export class NesHistoryContextProvider extends Disposable implements IHistoryContextProvider {
	private readonly _documentState = new Map<DocumentId, DocumentState>();
	private readonly _lastDocuments = new FifoSet<DocumentState>(50);
	private _lastGitCheckout: Instant | undefined;

	constructor(workspace: ObservableWorkspace, observableGit: ObservableGit) {
		super();

		this._register(autorun(reader => {
			const branch = reader.readObservable(observableGit.branch);
			if (branch === undefined) {
				return; // probably git extension hasn't activated or no repository found, so don't do anything
			}
			this._lastGitCheckout = now();
			this._documentState.forEach(d => d.applyAllEdits());
		}));

		mapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {
			const initialSelection = doc.selection.get().at(0);
			const state = new DocumentState(doc.id, doc.value.get().value, doc.languageId.get(), initialSelection);
			this._documentState.set(state.docId, state);
			if (initialSelection) {
				this._lastDocuments.push(state);
			}

			store.add(autorunWithChanges(this, {
				value: doc.value,
				selection: doc.selection,
				languageId: doc.languageId,
			}, (data) => {
				if (data.languageId.changes.length > 0) {
					state.languageId = data.languageId.value;
				}
				const isInCooldown = this._isAwaitingGitCheckoutCooldown();
				for (const edit of data.value.changes) {
					this._lastDocuments.push(state);
					state.handleEdit(edit, isInCooldown);
				}
				if (data.selection.changes.length > 0) {
					state.handleSelection(data.selection.value.at(0));
					this._lastDocuments.push(state);
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

	public getHistoryContext(docId: DocumentId): HistoryContext | undefined {
		const state = this._documentState.get(docId);
		if (!state) {
			return undefined;
		}
		if (!this._lastDocuments.has(state)) {
			return undefined;
		}

		const docs: DocumentHistory[] = [];

		let hasProcessedCurrentDocument = false;
		let editCount = 5;

		for (const doc of this._lastDocuments.getItemsReversed()) {
			const result = doc.getRecentEdit(editCount);
			if (result === undefined) { // result is undefined if the document is not a user document
				continue;
			}
			if (result.editCount === 0 && hasProcessedCurrentDocument) {
				break;
			}
			if (doc.docId === docId) {
				hasProcessedCurrentDocument = true;
			}
			docs.push(result.history);
			editCount -= result.editCount;
			if (editCount <= 0) {
				break;
			}
		}
		docs.reverse();
		// Docs is sorted from least recent to most recent now

		if (!docs.some(d => d.docId === docId)) {
			return undefined;
		}

		return new HistoryContext(docs);
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
}

class DocumentState {
	private static readonly MAX_EDITED_LINES_PER_EDIT = 10;
	private static readonly MAX_EDITED_CHARS_PER_EDIT = 5000;

	private _baseValue: StringText;
	private _currentValue: StringText;
	private _edits: { edit: StringEdit; textLengthEdit: TextLengthEdit; instant: Instant }[] = [];
	private _isUserDocument = false;
	private _selection: OffsetRange | undefined;

	constructor(
		public readonly docId: DocumentId,
		initialValue: string,
		public languageId: LanguageId,
		selection: OffsetRange | undefined,
	) {
		this._baseValue = new StringText(initialValue);
		this._currentValue = this._baseValue;
		this.handleSelection(selection);
	}

	public getSelection(): OffsetRange | undefined {
		return this._selection;
	}

	public handleSelection(selection: OffsetRange | undefined): void {
		if (selection) {
			this._isUserDocument = true;
		}
		this._selection = selection;
	}

	public handleEdit(edit: StringEdit, isInCooldown: boolean): void {
		if (edit.isEmpty()) {
			return;
		}

		this._currentValue = edit.applyOnText(this._currentValue);
		const textEdit = TextEdit.fromStringEdit(edit, this._currentValue);
		const textLengthEdit = TextLengthEdit.fromTextEdit(textEdit);

		if (isInCooldown) {
			this._baseValue = this._currentValue;
			this._edits = [];
			return;
		}

		function editInsertSize(edit: StringEdit): number {
			return sum(edit.replacements, e => e.newText.length);
		}

		const lastEdit = this._edits.at(-1);
		if (lastEdit && editInsertSize(lastEdit.edit) < 200 && editExtends(edit, lastEdit.edit)) {
			lastEdit.edit = lastEdit.edit.compose(edit);
			lastEdit.textLengthEdit = lastEdit.textLengthEdit.compose(textLengthEdit);
			lastEdit.instant = now();
			if (lastEdit.edit.isEmpty()) {
				this._edits.pop();
			}
		} else {
			this._edits.push({ edit, textLengthEdit, instant: now() });
		}
	}

	public getRecentEdit(maxEditCount: number): { history: DocumentHistory; editCount: number } | undefined {
		if (!this._isUserDocument) {
			return undefined;
		}

		// note that `editCount` may not match the actual number of edits in the history because it's computed by transforming to line edits
		const { editCount } = this._applyStaleEdits(maxEditCount);

		const edits = new Edits(StringEdit, this._edits.map(e => e.edit));

		return {
			history: new DocumentHistory(this.docId, this.languageId, this._baseValue, edits, this._selection),
			editCount,
		};
	}

	public applyAllEdits() {
		this._baseValue = this._currentValue;
		this._edits = [];
	}

	private _applyStaleEdits(maxEditCount: number): { editCount: number } {
		let lastValue = this._currentValue;
		let recentEdit: StringEdit = StringEdit.empty;
		let recentTextLengthEdit = TextLengthEdit.empty;
		let i: number;
		let editCount = 0;
		let mostRecentEdit: StringEdit = StringEdit.empty;

		for (i = this._edits.length - 1; i >= 0; i--) {
			const e = this._edits[i];

			if (now() - e.instant > 10 * 60 * 1000) {
				break;
			}

			const potentialNewTextLengthEdit = e.textLengthEdit.compose(recentTextLengthEdit);
			const potentialNewRange = potentialNewTextLengthEdit.getRange();
			// FIXME@ulugbekna: the code below can actually throw if one edit cancels another one out
			assertType(potentialNewRange, 'we only compose non-empty Edits');
			if (potentialNewRange.endLineNumber - potentialNewRange.startLineNumber > 100) {
				break;
			}

			const changedLines = sum(e.textLengthEdit.edits, e => (e.range.endLineNumber - e.range.startLineNumber) + e.newLength.lineCount);
			if (changedLines > DocumentState.MAX_EDITED_LINES_PER_EDIT) { // 5k line long -- it should work for both deletion & insertion
				break;
			}
			const newCharacterCount = sum(e.edit.replacements, singleEdit => singleEdit.newText.length);
			if (newCharacterCount > DocumentState.MAX_EDITED_CHARS_PER_EDIT) {
				break;
			}
			const replacedCharacterCount = sum(e.edit.replacements, singleEdit => singleEdit.replaceRange.length);
			if (replacedCharacterCount > DocumentState.MAX_EDITED_CHARS_PER_EDIT) {
				break;
			}

			if (i === this._edits.length - 1) {
				mostRecentEdit = e.edit;
			} else {
				const swapResult = StringEdit.trySwap(e.edit, mostRecentEdit);
				if (swapResult) {
					mostRecentEdit = swapResult.e1;
				} else {
					if (changedLines >= 2) {
						// If the most recent edit (transformed to the current state) intersects with the current edit
						// and the current edit is too big, composing them would hide the effect of the most recent edit
						// relative to current edit. So, we stop here.
						break;
					}
					mostRecentEdit = e.edit.compose(mostRecentEdit);
				}
			}

			const inverseE = e.edit.inverse(lastValue.value);
			lastValue = inverseE.applyOnText(lastValue);

			const potentialRecentEdit = e.edit.compose(recentEdit);
			const potentialLineEdit = RootedEdit.toLineEdit(new RootedEdit(lastValue, potentialRecentEdit));
			const rootedLineEdit = new RootedLineEdit(lastValue, potentialLineEdit).removeCommonSuffixPrefixLines(); // do not take into account no-op edits
			const editLineCount = rootedLineEdit.edit.replacements.length;
			if (editLineCount > maxEditCount) {
				break;
			}

			// We take the edit!
			editCount = editLineCount;
			recentEdit = potentialRecentEdit;
			recentTextLengthEdit = potentialNewTextLengthEdit;
		}

		// remove & apply the edits we didn't take
		for (let j = 0; j <= i; j++) {
			const e = this._edits[j];
			this._baseValue = e.edit.applyOnText(this._baseValue);
		}

		this._edits = this._edits.slice(i + 1);

		return { editCount };
	}

	public toString(): string {
		return new Edits(StringEdit, this._edits.map(e => e.edit)).toHumanReadablePatch(this._baseValue);
	}
}

export function sum<T>(arr: readonly T[], f: (t: T) => number): number {
	let result = 0;
	for (const e of arr) {
		result += f(e);
	}
	return result;
}

export function editExtends(edit: StringEdit, previousEdit: StringEdit): boolean {
	const newRanges = previousEdit.getNewRanges();
	return edit.replacements.every(e => doesTouch(e.replaceRange, newRanges));
}

function doesTouch(range: OffsetRange, sortedRanges: readonly OffsetRange[]) {
	return sortedRanges.some(r => range.start === r.endExclusive || range.endExclusive === r.start);
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
