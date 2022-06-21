/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { autorun, derivedObservable, IObservable, ITransaction, ObservableValue, transaction } from 'vs/workbench/contrib/audioCues/browser/observable';
import { InputState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { applyObservableDecorations, h } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from '../editorGutter';
import { CodeEditorView, ICodeEditorViewOptions } from './codeEditorView';

export class InputCodeEditorView extends CodeEditorView {
	private readonly decorations = derivedObservable('decorations', reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) {
			return [];
		}
		const model = viewModel.model;

		const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);

		const result = new Array<IModelDeltaDecoration>();
		for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {

			const range = modifiedBaseRange.getInputRange(this.inputNumber);
			if (range && !range.isEmpty) {


				const blockClassNames = ['merge-editor-block'];
				const isHandled = model.isHandled(modifiedBaseRange).read(reader);
				if (isHandled) {
					blockClassNames.push('handled');
				}
				if (modifiedBaseRange === activeModifiedBaseRange) {
					blockClassNames.push('active');
				}
				blockClassNames.push('input' + this.inputNumber);

				result.push({
					range: range.toInclusiveRange()!,
					options: {
						isWholeLine: true,
						blockClassName: blockClassNames.join(' '),
						description: 'Base Range Projection',
						minimap: {
							position: MinimapPosition.Gutter,
							color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
						},
						overviewRuler: {
							position: OverviewRulerLane.Center,
							color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
						}
					}
				});

				const inputDiffs = modifiedBaseRange.getInputDiffs(this.inputNumber);
				for (const diff of inputDiffs) {
					if (diff.rangeMappings) {
						for (const d of diff.rangeMappings) {
							result.push({
								range: d.outputRange,
								options: {
									className: `merge-editor-diff-input1`,
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
					const viewModel = this.viewModel.read(reader);
					if (!viewModel) { return []; }
					const model = viewModel.model;
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
							setState: (value, tx) => viewModel.setState(
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

export interface ModifiedBaseRangeGutterItemInfo extends IGutterItemInfo {
	enabled: IObservable<boolean>;
	toggleState: IObservable<InputState>;
	setState(value: boolean, tx: ITransaction): void;
}

export class MergeConflictGutterItemView extends Disposable implements IGutterItemView<ModifiedBaseRangeGutterItemInfo> {
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
