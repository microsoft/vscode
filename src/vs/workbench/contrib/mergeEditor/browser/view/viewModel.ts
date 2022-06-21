/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derivedObservable, derivedObservableWithWritableCache, ITransaction, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { ModifiedBaseRange, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { CodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/codeEditorView';
import { InputCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/inputCodeEditorView';
import { ResultCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/resultCodeEditorView';

export class MergeEditorViewModel {
	private readonly lastFocusedEditor = derivedObservableWithWritableCache<
		CodeEditorView | undefined
	>('lastFocusedEditor', (reader, lastValue) => {
		const editors = [
			this.inputCodeEditorView1,
			this.inputCodeEditorView2,
			this.resultCodeEditorView,
		];
		return editors.find((e) => e.isFocused.read(reader)) || lastValue;
	});

	private readonly manuallySetActiveModifiedBaseRange = new ObservableValue<
		ModifiedBaseRange | undefined
	>(undefined, 'manuallySetActiveModifiedBaseRange');

	public readonly activeModifiedBaseRange = derivedObservable(
		'activeModifiedBaseRange',
		(reader) => {
			const focusedEditor = this.lastFocusedEditor.read(reader);
			if (!focusedEditor) {
				return this.manuallySetActiveModifiedBaseRange.read(reader);
			}
			const cursorLineNumber = focusedEditor.cursorLineNumber.read(reader);
			if (!cursorLineNumber) {
				return undefined;
			}

			const modifiedBaseRanges = this.model.modifiedBaseRanges.read(reader);

			if (focusedEditor === this.resultCodeEditorView) {
				return modifiedBaseRanges.find((r) =>
					this.model.getRangeInResult(r.baseRange, reader).contains(cursorLineNumber)
				);
			} else {
				const input = focusedEditor === this.inputCodeEditorView1 ? 1 : 2;
				return modifiedBaseRanges.find((r) =>
					r.getInputRange(input).contains(cursorLineNumber)
				);
			}
		}
	);

	constructor(
		public readonly model: MergeEditorModel,
		private readonly inputCodeEditorView1: InputCodeEditorView,
		private readonly inputCodeEditorView2: InputCodeEditorView,
		private readonly resultCodeEditorView: ResultCodeEditorView
	) { }

	public setState(
		baseRange: ModifiedBaseRange,
		state: ModifiedBaseRangeState,
		tx: ITransaction
	): void {
		this.manuallySetActiveModifiedBaseRange.set(baseRange, tx);
		this.lastFocusedEditor.clearCache(tx);
		this.model.setState(baseRange, state, tx);
	}
}
