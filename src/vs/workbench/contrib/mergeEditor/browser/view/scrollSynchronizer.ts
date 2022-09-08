/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { autorunWithStore, IObservable } from 'vs/base/common/observable';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { DocumentLineRangeMap } from 'vs/workbench/contrib/mergeEditor/browser/model/mapping';
import { ReentrancyBarrier } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { BaseCodeEditorView } from 'vs/workbench/contrib/mergeEditor/browser/view/editors/baseCodeEditorView';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { InputCodeEditorView } from './editors/inputCodeEditorView';
import { ResultCodeEditorView } from './editors/resultCodeEditorView';

export class ScrollSynchronizer extends Disposable {
	private get model() { return this.viewModel.get()?.model; }

	private readonly reentrancyBarrier = new ReentrancyBarrier();

	constructor(
		private readonly viewModel: IObservable<MergeEditorViewModel | undefined>,
		private readonly input1View: InputCodeEditorView,
		private readonly input2View: InputCodeEditorView,
		private readonly baseView: IObservable<BaseCodeEditorView | undefined>,
		private readonly inputResultView: ResultCodeEditorView
	) {
		super();

		const handleInput1OnScroll = () => {
			const mapping = this.model?.input1ResultMapping.get();
			this.synchronizeScrolling(this.input1View.editor, this.inputResultView.editor, mapping);
			this.input2View.editor.setScrollTop(this.input1View.editor.getScrollTop(), ScrollType.Immediate);

			this.baseView.get()?.editor.setScrollTop(this.input1View.editor.getScrollTop(), ScrollType.Immediate);
		};

		this._store.add(
			this.input1View.editor.onDidScrollChange(
				this.reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						handleInput1OnScroll();
					}
					if (c.scrollLeftChanged) {
						this.baseView.get()?.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.inputResultView.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);

		this._store.add(
			this.input2View.editor.onDidScrollChange(
				this.reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping = this.model?.input2ResultMapping.get();
						this.synchronizeScrolling(this.input2View.editor, this.inputResultView.editor, mapping);
						this.input1View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);

						this.baseView.get()?.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
					}
					if (c.scrollLeftChanged) {
						this.baseView.get()?.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.inputResultView.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);
		this._store.add(
			this.inputResultView.editor.onDidScrollChange(
				this.reentrancyBarrier.makeExclusive((c) => {
					if (c.scrollTopChanged) {
						const mapping1 = this.model?.resultInput1Mapping.get();
						this.synchronizeScrolling(this.inputResultView.editor, this.input1View.editor, mapping1);
						const mapping2 = this.model?.resultInput2Mapping.get();
						this.synchronizeScrolling(this.inputResultView.editor, this.input2View.editor, mapping2);

						const baseMapping = this.model?.resultBaseMapping.get();
						const baseView = this.baseView.get();
						if (baseView) {
							this.synchronizeScrolling(this.inputResultView.editor, baseView.editor, baseMapping);
						}
					}
					if (c.scrollLeftChanged) {
						this.baseView.get()?.editor?.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
						this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
					}
				})
			)
		);

		this._store.add(
			autorunWithStore((reader, store) => {
				const baseView = this.baseView.read(reader);
				if (baseView) {
					store.add(baseView.editor.onDidScrollChange(
						this.reentrancyBarrier.makeExclusive((c) => {
							if (c.scrollTopChanged) {
								this.input1View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);
								this.input2View.editor.setScrollTop(c.scrollTop, ScrollType.Immediate);

								const baseMapping = this.model?.baseResultMapping.get();
								this.synchronizeScrolling(baseView.editor, this.inputResultView.editor, baseMapping);
							}
							if (c.scrollLeftChanged) {
								this.inputResultView.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
								this.input1View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
								this.input2View.editor.setScrollLeft(c.scrollLeft, ScrollType.Immediate);
							}
						})
					));
				}
			}, 'set baseViewEditor.onDidScrollChange')
		);

		this._store.add(
			autorunWithStore((reader, store) => {
				const vm = this.viewModel.read(reader);
				if (!vm) {
					return;
				}
				this.baseView.read(reader);

				this.reentrancyBarrier.runExclusively(() => {
					handleInput1OnScroll();
				});
			}, 'update scroll when base view changes')
		);
	}

	private synchronizeScrolling(scrollingEditor: CodeEditorWidget, targetEditor: CodeEditorWidget, mapping: DocumentLineRangeMap | undefined) {
		if (!mapping) {
			return;
		}

		const visibleRanges = scrollingEditor.getVisibleRanges();
		if (visibleRanges.length === 0) {
			return;
		}
		const topLineNumber = visibleRanges[0].startLineNumber - 1;

		const result = mapping.project(topLineNumber);
		const sourceRange = result.inputRange;
		const targetRange = result.outputRange;

		const resultStartTopPx = targetEditor.getTopForLineNumber(targetRange.startLineNumber);
		const resultEndPx = targetEditor.getTopForLineNumber(targetRange.endLineNumberExclusive);

		const sourceStartTopPx = scrollingEditor.getTopForLineNumber(sourceRange.startLineNumber);
		const sourceEndPx = scrollingEditor.getTopForLineNumber(sourceRange.endLineNumberExclusive);

		const factor = Math.min((scrollingEditor.getScrollTop() - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
		const resultScrollPosition = resultStartTopPx + (resultEndPx - resultStartTopPx) * factor;

		targetEditor.setScrollTop(resultScrollPosition, ScrollType.Immediate);
	}
}
