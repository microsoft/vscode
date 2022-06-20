/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IView, IViewSize } from 'vs/base/browser/ui/grid/grid';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { CompareResult } from 'vs/base/common/arrays';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { Range } from 'vs/editor/common/core/range';
import { IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { autorun, derivedObservable, IObservable, ITransaction, ObservableValue, transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { MergeEditorModel } from 'vs/workbench/contrib/mergeEditor/browser/model/mergeEditorModel';
import { InputState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { applyObservableDecorations, join, h, setStyle } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from './editorGutter';

export interface ICodeEditorViewOptions {
	readonly: boolean;
}


abstract class CodeEditorView extends Disposable {
	private readonly _model = new ObservableValue<undefined | MergeEditorModel>(undefined, 'model');
	readonly model: IObservable<undefined | MergeEditorModel> = this._model;

	protected readonly htmlElements = h('div.code-view', [
		h('div.title', { $: 'title' }),
		h('div.container', [
			h('div.gutter', { $: 'gutterDiv' }),
			h('div', { $: 'editor' }),
		]),
	]);

	private readonly _onDidViewChange = new Emitter<IViewSize | undefined>();

	public readonly view: IView = {
		element: this.htmlElements.root,
		minimumWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
		maximumWidth: DEFAULT_EDITOR_MAX_DIMENSIONS.width,
		minimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
		maximumHeight: DEFAULT_EDITOR_MAX_DIMENSIONS.height,
		onDidChange: this._onDidViewChange.event,
		layout: (width: number, height: number, top: number, left: number) => {
			setStyle(this.htmlElements.root, { width, height, top, left });
			this.editor.layout({
				width: width - this.htmlElements.gutterDiv.clientWidth,
				height: height - this.htmlElements.title.clientHeight,
			});
		}
		// preferredWidth?: number | undefined;
		// preferredHeight?: number | undefined;
		// priority?: LayoutPriority | undefined;
		// snap?: boolean | undefined;
	};

	private readonly _title = new IconLabel(this.htmlElements.title, { supportIcons: true });
	private readonly _detail = new IconLabel(this.htmlElements.title, { supportIcons: true });

	public readonly editor = this.instantiationService.createInstance(
		CodeEditorWidget,
		this.htmlElements.editor,
		{
			minimap: { enabled: false },
			readOnly: this._options.readonly,
			glyphMargin: false,
			lineNumbersMinChars: 2,
		},
		{ contributions: [] }
	);

	constructor(
		private readonly _options: ICodeEditorViewOptions,
		@IInstantiationService
		private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	public setModel(
		model: MergeEditorModel,
		textModel: ITextModel,
		title: string,
		description: string | undefined,
		detail: string | undefined
	): void {
		this.editor.setModel(textModel);
		this._title.setLabel(title, description);
		this._detail.setLabel('', detail);

		this._model.set(model, undefined);
	}
}
export class InputCodeEditorView extends CodeEditorView {
	private readonly decorations = derivedObservable('decorations', reader => {
		const model = this.model.read(reader);
		if (!model) {
			return [];
		}
		const result = new Array<IModelDeltaDecoration>();
		for (const m of model.modifiedBaseRanges.read(reader)) {
			const range = m.getInputRange(this.inputNumber);
			if (!range.isEmpty) {
				result.push({
					range: new Range(range.startLineNumber, 1, range.endLineNumberExclusive - 1, 1),
					options: {
						isWholeLine: true,
						className: `merge-editor-modified-base-range-input${this.inputNumber}`,
						description: 'Base Range Projection'
					}
				});

				const inputDiffs = m.getInputDiffs(this.inputNumber);
				for (const diff of inputDiffs) {
					if (diff.rangeMappings) {
						for (const d of diff.rangeMappings) {
							result.push({
								range: d.outputRange,
								options: {
									className: `merge-editor-diff-input${this.inputNumber}`,
									description: 'Base Range Projection'
								}
							});
						}
					}
				}
			}
		}
		return result;
	});

	constructor(
		public readonly inputNumber: 1 | 2,
		options: ICodeEditorViewOptions,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(options, instantiationService);

		this._register(applyObservableDecorations(this.editor, this.decorations));

		this._register(
			new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
				getIntersectingGutterItems: (range, reader) => {
					const model = this.model.read(reader);
					if (!model) { return []; }
					return model.modifiedBaseRanges.read(reader)
						.filter((r) => r.getInputDiffs(this.inputNumber).length > 0)
						.map<ModifiedBaseRangeGutterItemInfo>((baseRange, idx) => ({
							id: idx.toString(),
							additionalHeightInPx: 0,
							offsetInPx: 0,
							range: baseRange.getInputRange(this.inputNumber),
							enabled: model.isUpToDate,
							toggleState: derivedObservable('toggle', (reader) => model
								.getState(baseRange)
								.read(reader)
								.getInput(this.inputNumber)
							),
							setState: (value, tx) => model.setState(
								baseRange,
								model
									.getState(baseRange)
									.get()
									.withInputValue(this.inputNumber, value),
								tx
							),
						}));
				},
				createView: (item, target) => new MergeConflictGutterItemView(item, target),
			})
		);
	}
}

interface ModifiedBaseRangeGutterItemInfo extends IGutterItemInfo {
	enabled: IObservable<boolean>;
	toggleState: IObservable<InputState>;
	setState(value: boolean, tx: ITransaction): void;
}

class MergeConflictGutterItemView extends Disposable implements IGutterItemView<ModifiedBaseRangeGutterItemInfo> {
	private readonly item = new ObservableValue<ModifiedBaseRangeGutterItemInfo | undefined>(undefined, 'item');

	constructor(item: ModifiedBaseRangeGutterItemInfo, private readonly target: HTMLElement) {
		super();

		this.item.set(item, undefined);

		target.classList.add('merge-accept-gutter-marker');

		const checkBox = new Toggle({ isChecked: false, title: localize('acceptMerge', "Accept Merge"), icon: Codicon.check });
		checkBox.domNode.classList.add('accept-conflict-group');

		this._register(
			autorun((reader) => {
				const item = this.item.read(reader)!;
				const value = item.toggleState.read(reader);
				const iconMap: Record<InputState, { icon: Codicon | undefined; checked: boolean }> = {
					[InputState.excluded]: { icon: undefined, checked: false },
					[InputState.conflicting]: { icon: Codicon.circleFilled, checked: false },
					[InputState.first]: { icon: Codicon.check, checked: true },
					[InputState.second]: { icon: Codicon.checkAll, checked: true },
				};
				checkBox.setIcon(iconMap[value].icon);
				checkBox.checked = iconMap[value].checked;

				if (!item.enabled.read(reader)) {
					checkBox.disable();
				} else {
					checkBox.enable();
				}
			}, 'Update Toggle State')
		);

		this._register(checkBox.onChange(() => {
			transaction(tx => {
				this.item.get()!.setState(checkBox.checked, tx);
			});
		}));

		target.appendChild(h('div.background', [noBreakWhitespace]).root);
		target.appendChild(
			h('div.checkbox', [h('div.checkbox-background', [checkBox.domNode])]).root
		);
	}

	layout(top: number, height: number, viewTop: number, viewHeight: number): void {
		this.target.classList.remove('multi-line');
		this.target.classList.remove('single-line');
		this.target.classList.add(height > 30 ? 'multi-line' : 'single-line');
	}

	update(baseRange: ModifiedBaseRangeGutterItemInfo): void {
		this.item.set(baseRange, undefined);
	}
}

export class ResultCodeEditorView extends CodeEditorView {
	private readonly decorations = derivedObservable('decorations', reader => {
		const model = this.model.read(reader);
		if (!model) {
			return [];
		}
		const result = new Array<IModelDeltaDecoration>();

		const baseRangeWithStoreAndTouchingDiffs = join(
			model.modifiedBaseRanges.read(reader),
			model.resultDiffs.read(reader),
			(baseRange, diff) => baseRange.baseRange.touches(diff.inputRange)
				? CompareResult.neitherLessOrGreaterThan
				: LineRange.compareByStart(
					baseRange.baseRange,
					diff.inputRange
				)
		);

		for (const m of baseRangeWithStoreAndTouchingDiffs) {
			for (const r of m.rights) {
				const range = r.outputRange;

				const state = m.left ? model.getState(m.left).read(reader) : undefined;

				if (!range.isEmpty) {
					result.push({
						range: new Range(range.startLineNumber, 1, range.endLineNumberExclusive - 1, 1),
						options: {
							isWholeLine: true,
							// TODO
							className: (() => {
								if (state) {
									if (state.input1 && !state.input2) {
										return 'merge-editor-modified-base-range-input1';
									}
									if (state.input2 && !state.input1) {
										return 'merge-editor-modified-base-range-input2';
									}
									if (state.input1 && state.input2) {
										return 'merge-editor-modified-base-range-combination';
									}
								}
								return 'merge-editor-modified-base-range';
							})(),
							description: 'Result Diff'
						}
					});
				}
			}
		}
		return result;
	});

	constructor(
		options: ICodeEditorViewOptions,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(options, instantiationService);

		this._register(applyObservableDecorations(this.editor, this.decorations));
	}
}
