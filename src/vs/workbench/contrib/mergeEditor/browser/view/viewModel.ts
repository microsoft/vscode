/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findLast } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';
import { derived, derivedObservableWithWritableCache, IObservable, IReader, ITransaction, observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { ModifiedBaseRange, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { BaseCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/baseCodeEditorView';
import { CodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/codeEditorView';
import { InputCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/inputCodeEditorView';
import { ResultCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/resultCodeEditorView';

export class MergeEditorViewModel extends Disposable {
	private readonly manuallySetActiveModifiedBaseRange = observableValue<
		{ range: ModifiedBaseRange | undefined; counter: number }
	>('manuallySetActiveModifiedBaseRange', { range: undefined, counter: 0 });

	constructor(
		public readonly model: MergeEditorModel,
		public readonly inputCodeEditorView1: InputCodeEditorView,
		public readonly inputCodeEditorView2: InputCodeEditorView,
		public readonly resultCodeEditorView: ResultCodeEditorView,
		public readonly baseCodeEditorView: IObservable<BaseCodeEditorView | undefined>,
		public readonly showNonConflictingChanges: IObservable<boolean>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		this._register(resultCodeEditorView.editor.onDidChangeModelContent(e => {
			transaction(tx => {
				/** @description Mark conflicts touched by manual edits as handled */
				for (const change of e.changes) {
					const rangeInBase = this.model.translateResultRangeToBase(Range.lift(change.range));
					const baseRanges = this.model.findModifiedBaseRangesInRange(new LineRange(rangeInBase.startLineNumber, rangeInBase.endLineNumber - rangeInBase.startLineNumber));
					if (baseRanges.length === 1) {
						this.model.setHandled(baseRanges[0], true, tx);
					}
				}
			});
		}));
	}

	public readonly shouldUseAppendInsteadOfAccept = observableFromEvent<boolean>(
		this.configurationService.onDidChangeConfiguration,
		() => /** @description appendVsAccept */ this.configurationService.getValue('mergeEditor.shouldUseAppendInsteadOfAccept') ?? false
	);

	private counter = 0;
	private readonly lastFocusedEditor = derivedObservableWithWritableCache<
		{ view: CodeEditorView | undefined; counter: number }
	>('lastFocusedEditor', (reader, lastValue) => {
		const editors = [
			this.inputCodeEditorView1,
			this.inputCodeEditorView2,
			this.resultCodeEditorView,
			this.baseCodeEditorView.read(reader),
		];
		const view = editors.find((e) => e && e.isFocused.read(reader));
		return view ? { view, counter: this.counter++ } : lastValue || { view: undefined, counter: this.counter++ };
	});

	public readonly baseShowDiffAgainst = derived<1 | 2 | undefined>('baseShowDiffAgainst', reader => {
		const lastFocusedEditor = this.lastFocusedEditor.read(reader);
		if (lastFocusedEditor.view === this.inputCodeEditorView1) {
			return 1;
		} else if (lastFocusedEditor.view === this.inputCodeEditorView2) {
			return 2;
		}
		return undefined;
	});

	public readonly selectionInBase = derived('selectionInBase', (reader) => {
		const sourceEditor = this.lastFocusedEditor.read(reader).view;
		if (!sourceEditor) {
			return undefined;
		}
		const selections = sourceEditor.selection.read(reader) || [];

		const rangesInBase = selections.map((selection) => {
			if (sourceEditor === this.inputCodeEditorView1) {
				return this.model.translateInputRangeToBase(1, selection);
			} else if (sourceEditor === this.inputCodeEditorView2) {
				return this.model.translateInputRangeToBase(2, selection);
			} else if (sourceEditor === this.resultCodeEditorView) {
				return this.model.translateResultRangeToBase(selection);
			} else if (sourceEditor === this.baseCodeEditorView.read(reader)) {
				return selection;
			} else {
				return selection;
			}
		});

		return {
			rangesInBase,
			sourceEditor
		};
	});

	private getRangeOfModifiedBaseRange(editor: CodeEditorView, modifiedBaseRange: ModifiedBaseRange, reader: IReader | undefined): LineRange {
		if (editor === this.resultCodeEditorView) {
			return this.model.getLineRangeInResult(modifiedBaseRange.baseRange, reader);
		} else if (editor === this.baseCodeEditorView.get()) {
			return modifiedBaseRange.baseRange;
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
				const range = this.getRangeOfModifiedBaseRange(focusedEditor.view!, r, reader);
				return range.isEmpty
					? range.startLineNumber === cursorLineNumber
					: range.contains(cursorLineNumber);
			});
		}
	);

	public setActiveModifiedBaseRange(range: ModifiedBaseRange | undefined, tx: ITransaction): void {
		this.manuallySetActiveModifiedBaseRange.set({ range, counter: this.counter++ }, tx);
	}

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
			const range = this.getRangeOfModifiedBaseRange(editor, modifiedBaseRange, undefined);
			editor.editor.focus();

			let startLineNumber = range.startLineNumber;
			let endLineNumberExclusive = range.endLineNumberExclusive;
			if (range.startLineNumber > editor.editor.getModel()!.getLineCount()) {
				transaction(tx => {
					this.setActiveModifiedBaseRange(modifiedBaseRange, tx);
				});
				startLineNumber = endLineNumberExclusive = editor.editor.getModel()!.getLineCount();
			}

			editor.editor.setPosition({
				lineNumber: startLineNumber,
				column: editor.editor.getModel()!.getLineFirstNonWhitespaceColumn(startLineNumber),
			});
			editor.editor.revealLinesNearTop(startLineNumber, endLineNumberExclusive, ScrollType.Smooth);
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
							this.getRangeOfModifiedBaseRange(e, r, undefined).startLineNumber > l
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
						this.getRangeOfModifiedBaseRange(e, r, undefined).endLineNumberExclusive < l
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
			this.notificationService.error(localize('noConflictMessage', "There is currently no conflict focused that can be toggled."));
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
