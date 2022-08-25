/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findLast } from 'vs/base/common/arrays';
import { derived, derivedObservableWithWritableCache, IReader, ITransaction, observableValue, transaction } from 'vs/base/common/observable';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { ModifiedBaseRange, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { CodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/codeEditorView';
import { InputCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/inputCodeEditorView';
import { ResultCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/resultCodeEditorView';

export class MergeEditorViewModel {
	private counter = 0;
	private readonly lastFocusedEditor = derivedObservableWithWritableCache<
		{ view: CodeEditorView | undefined; counter: number }
	>('lastFocusedEditor', (reader, lastValue) => {
		const editors = [
			this.inputCodeEditorView1,
			this.inputCodeEditorView2,
			this.resultCodeEditorView,
		];
		const view = editors.find((e) => e.isFocused.read(reader));
		return view ? { view, counter: this.counter++ } : lastValue || { view: undefined, counter: this.counter++ };
	});

	private readonly manuallySetActiveModifiedBaseRange = observableValue<
		{ range: ModifiedBaseRange | undefined; counter: number }
	>('manuallySetActiveModifiedBaseRange', { range: undefined, counter: 0 });

	private getRange(editor: CodeEditorView, modifiedBaseRange: ModifiedBaseRange, reader: IReader | undefined): LineRange {
		if (editor === this.resultCodeEditorView) {
			return this.model.getRangeInResult(modifiedBaseRange.baseRange, reader);
		} else {
			const input = editor === this.inputCodeEditorView1 ? 1 : 2;
			return modifiedBaseRange.getInputRange(input);
		}
	}

	public readonly activeModifiedBaseRange = derived(
		'activeModifiedBaseRange',
		(reader) => {
			const focusedEditor = this.lastFocusedEditor.read(reader);
			const manualRange = this.manuallySetActiveModifiedBaseRange.read(reader);
			if (manualRange.counter > focusedEditor.counter) {
				return manualRange.range;
			}

			if (!focusedEditor.view) {
				return;
			}
			const cursorLineNumber = focusedEditor.view.cursorLineNumber.read(reader);
			if (!cursorLineNumber) {
				return undefined;
			}

			const modifiedBaseRanges = this.model.modifiedBaseRanges.read(reader);
			return modifiedBaseRanges.find((r) => {
				const range = this.getRange(focusedEditor.view!, r, reader);
				return range.isEmpty
					? range.startLineNumber === cursorLineNumber
					: range.contains(cursorLineNumber);
			});
		}
	);

	constructor(
		public readonly model: MergeEditorModel,
		public readonly inputCodeEditorView1: InputCodeEditorView,
		public readonly inputCodeEditorView2: InputCodeEditorView,
		public readonly resultCodeEditorView: ResultCodeEditorView
	) { }

	public setState(
		baseRange: ModifiedBaseRange,
		state: ModifiedBaseRangeState,
		tx: ITransaction
	): void {
		this.manuallySetActiveModifiedBaseRange.set({ range: baseRange, counter: this.counter++ }, tx);
		this.model.setState(baseRange, state, true, tx);
	}

	private goToConflict(getModifiedBaseRange: (editor: CodeEditorView, curLineNumber: number) => ModifiedBaseRange | undefined): void {
		let editor = this.lastFocusedEditor.get().view;
		if (!editor) {
			editor = this.resultCodeEditorView;
		}
		const curLineNumber = editor.editor.getPosition()?.lineNumber;
		if (curLineNumber === undefined) {
			return;
		}
		const modifiedBaseRange = getModifiedBaseRange(editor, curLineNumber);
		if (modifiedBaseRange) {
			const range = this.getRange(editor, modifiedBaseRange, undefined);
			editor.editor.focus();
			editor.editor.setPosition({
				lineNumber: range.startLineNumber,
				column: editor.editor.getModel()!.getLineFirstNonWhitespaceColumn(range.startLineNumber),
			});
			editor.editor.revealLinesNearTop(range.startLineNumber, range.endLineNumberExclusive, ScrollType.Smooth);
		}
	}

	public goToNextModifiedBaseRange(predicate: (m: ModifiedBaseRange) => boolean): void {
		this.goToConflict(
			(e, l) =>
				this.model.modifiedBaseRanges
					.get()
					.find(
						(r) =>
							predicate(r) &&
							this.getRange(e, r, undefined).startLineNumber > l
					) ||
				this.model.modifiedBaseRanges
					.get()
					.find((r) => predicate(r))
		);
	}

	public goToPreviousModifiedBaseRange(predicate: (m: ModifiedBaseRange) => boolean): void {
		this.goToConflict(
			(e, l) =>
				findLast(
					this.model.modifiedBaseRanges.get(),
					(r) =>
						predicate(r) &&
						this.getRange(e, r, undefined).endLineNumberExclusive < l
				) ||
				findLast(
					this.model.modifiedBaseRanges.get(),
					(r) => predicate(r)
				)
		);
	}

	public toggleActiveConflict(inputNumber: 1 | 2): void {
		const activeModifiedBaseRange = this.activeModifiedBaseRange.get();
		if (!activeModifiedBaseRange) {
			return;
		}
		transaction(tx => {
			/** @description Toggle Active Conflict */
			this.setState(
				activeModifiedBaseRange,
				this.model.getState(activeModifiedBaseRange).get().toggle(inputNumber),
				tx
			);
		});
	}

	public acceptAll(inputNumber: 1 | 2): void {
		transaction(tx => {
			/** @description Toggle Active Conflict */
			for (const range of this.model.modifiedBaseRanges.get()) {
				this.setState(
					range,
					this.model.getState(range).get().withInputValue(inputNumber, true),
					tx
				);
			}
		});
	}
}
