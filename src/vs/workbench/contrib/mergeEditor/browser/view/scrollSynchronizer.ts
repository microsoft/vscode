/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ScrollType } from '../../../../../editor/common/editorCommon.js';
import { DocumentLineRangeMap } from '../model/mapping.js';
import { ReentrancyBarrier } from '../../../../../base/common/controlFlow.js';
import { BaseCodeEditorView } from './editors/baseCodeEditorView.js';
import { IMergeEditorLayout } from './mergeEditor.js';
import { MergeEditorViewModel } from './viewModel.js';
import { InputCodeEditorView } from './editors/inputCodeEditorView.js';
import { ResultCodeEditorView } from './editors/resultCodeEditorView.js';
import { CodeEditorView } from './editors/codeEditorView.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { isDefined } from '../../../../../base/common/types.js';

export class ScrollSynchronizer extends Disposable {
	private get model() { return this.viewModel.get()?.model; }

	private readonly reentrancyBarrier = new ReentrancyBarrier();

	public readonly updateScrolling: () => void;

	private get lockResultWithInputs() { return this.layout.get().kind === 'columns'; }
	private get lockBaseWithInputs() { return this.layout.get().kind === 'mixed' && !this.layout.get().showBaseAtTop; }

	private _isSyncing = true;

	constructor(
		private readonly viewModel: IObservable<MergeEditorViewModel | undefined>,
		private readonly input1View: InputCodeEditorView,
		private readonly input2View: InputCodeEditorView,
		private readonly baseView: IObservable<BaseCodeEditorView | undefined>,
		private readonly inputResultView: ResultCodeEditorView,
		private readonly layout: IObservable<IMergeEditorLayout>,
	) {
		super();

		const s = derived((reader) => {
			const baseView = this.baseView.read(reader);
			const editors = [this.input1View, this.input2View, this.inputResultView, baseView].filter(isDefined);

			const alignScrolling = (source: CodeEditorView, updateScrollLeft: boolean, updateScrollTop: boolean) => {
				this.reentrancyBarrier.runExclusivelyOrSkip(() => {
					if (updateScrollLeft) {
						const scrollLeft = source.editor.getScrollLeft();
						for (const editorView of editors) {
							if (editorView !== source) {
								editorView.editor.setScrollLeft(scrollLeft, ScrollType.Immediate);
							}
						}
					}
					if (updateScrollTop) {
						const scrollTop = source.editor.getScrollTop();
						for (const editorView of editors) {
							if (editorView !== source) {
								if (this._shouldLock(source, editorView)) {
									editorView.editor.setScrollTop(scrollTop, ScrollType.Immediate);
								} else {
									const m = this._getMapping(source, editorView);
									if (m) {
										this._synchronizeScrolling(source.editor, editorView.editor, m);
									}
								}
							}
						}
					}
				});
			};

			for (const editorView of editors) {
				reader.store.add(editorView.editor.onDidScrollChange(e => {
					if (!this._isSyncing) {
						return;
					}
					alignScrolling(editorView, e.scrollLeftChanged, e.scrollTopChanged);
				}));
			}

			return {
				update: () => {
					alignScrolling(this.inputResultView, true, true);
				}
			};
		}).recomputeInitiallyAndOnChange(this._store);

		this.updateScrolling = () => {
			s.get().update();
		};
	}

	public stopSync(): void {
		this._isSyncing = false;
	}

	public startSync(): void {
		this._isSyncing = true;
	}

	private _shouldLock(editor1: CodeEditorView, editor2: CodeEditorView): boolean {
		const isInput = (editor: CodeEditorView) => editor === this.input1View || editor === this.input2View;
		if (isInput(editor1) && editor2 === this.inputResultView || isInput(editor2) && editor1 === this.inputResultView) {
			return this.lockResultWithInputs;
		}
		if (isInput(editor1) && editor2 === this.baseView.get() || isInput(editor2) && editor1 === this.baseView.get()) {
			return this.lockBaseWithInputs;
		}
		if (isInput(editor1) && isInput(editor2)) {
			return true;
		}
		return false;
	}

	private _getMapping(editor1: CodeEditorView, editor2: CodeEditorView): DocumentLineRangeMap | undefined {
		if (editor1 === this.input1View) {
			if (editor2 === this.input2View) {
				return undefined;
			} else if (editor2 === this.inputResultView) {
				return this.model?.input1ResultMapping.get()!;
			} else if (editor2 === this.baseView.get()) {
				const b = this.model?.baseInput1Diffs.get();
				if (!b) { return undefined; }
				return new DocumentLineRangeMap(b, -1).reverse();
			}
		} else if (editor1 === this.input2View) {
			if (editor2 === this.input1View) {
				return undefined;
			} else if (editor2 === this.inputResultView) {
				return this.model?.input2ResultMapping.get()!;
			} else if (editor2 === this.baseView.get()) {
				const b = this.model?.baseInput2Diffs.get();
				if (!b) { return undefined; }
				return new DocumentLineRangeMap(b, -1).reverse();
			}
		} else if (editor1 === this.inputResultView) {
			if (editor2 === this.input1View) {
				return this.model?.resultInput1Mapping.get()!;
			} else if (editor2 === this.input2View) {
				return this.model?.resultInput2Mapping.get()!;
			} else if (editor2 === this.baseView.get()) {
				const b = this.model?.resultBaseMapping.get();
				if (!b) { return undefined; }
				return b;
			}
		} else if (editor1 === this.baseView.get()) {
			if (editor2 === this.input1View) {
				const b = this.model?.baseInput1Diffs.get();
				if (!b) { return undefined; }
				return new DocumentLineRangeMap(b, -1);
			} else if (editor2 === this.input2View) {
				const b = this.model?.baseInput2Diffs.get();
				if (!b) { return undefined; }
				return new DocumentLineRangeMap(b, -1);
			} else if (editor2 === this.inputResultView) {
				const b = this.model?.baseResultMapping.get();
				if (!b) { return undefined; }
				return b;
			}
		}

		throw new BugIndicatingError();
	}

	private _synchronizeScrolling(scrollingEditor: CodeEditorWidget, targetEditor: CodeEditorWidget, mapping: DocumentLineRangeMap | undefined) {
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
