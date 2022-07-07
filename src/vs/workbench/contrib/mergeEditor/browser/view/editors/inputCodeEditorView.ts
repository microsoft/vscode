/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { autorun, derived, IObservable, ISettableObservable, ITransaction, transaction, observableValue } from 'vs/base/common/observable';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { isDefined } from 'vs/base/common/types';
import { EditorExtensionsRegistry, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { CodeLensContribution } from 'vs/editor/contrib/codelens/browser/codelensController';
import { localize } from 'vs/nls';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachToggleStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { InputState, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { applyObservableDecorations, setFields } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from '../editorGutter';
import { CodeEditorView } from './codeEditorView';

export class InputCodeEditorView extends CodeEditorView {
	private readonly decorations = derived(`input${this.inputNumber}.decorations`, reader => {
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
					blockClassNames.push('focused');
				}
				const inputClassName = this.inputNumber === 1 ? 'input1' : 'input2';
				blockClassNames.push(inputClassName);

				result.push({
					range: range.toInclusiveRange()!,
					options: {
						isWholeLine: true,
						blockClassName: blockClassNames.join(' '),
						description: 'Merge Editor',
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
					const range = diff.outputRange.toInclusiveRange();
					if (range) {
						result.push({
							range,
							options: {
								className: `merge-editor-diff ${inputClassName}`,
								description: 'Merge Editor',
								isWholeLine: true,
							}
						});
					}

					if (diff.rangeMappings) {
						for (const d of diff.rangeMappings) {
							result.push({
								range: d.outputRange,
								options: {
									className: `merge-editor-diff-word ${inputClassName}`,
									description: 'Merge Editor'
								}
							});
						}
					}
				}
			}
		}
		return result;
	});

	private readonly modifiedBaseRangeGutterItemInfos = derived(`input${this.inputNumber}.modifiedBaseRangeGutterItemInfos`, reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) { return []; }
		const model = viewModel.model;
		const inputNumber = this.inputNumber;

		return model.modifiedBaseRanges.read(reader)
			.filter((r) => r.getInputDiffs(this.inputNumber).length > 0)
			.map<ModifiedBaseRangeGutterItemInfo>((baseRange, idx) => ({
				id: idx.toString(),
				range: baseRange.getInputRange(this.inputNumber),
				enabled: model.isUpToDate,
				toggleState: derived('checkbox is checked', (reader) => {
					const input = model
						.getState(baseRange)
						.read(reader)
						.getInput(this.inputNumber);
					return input === InputState.second && !baseRange.isOrderRelevant
						? InputState.first
						: input;
				}
				),
				setState: (value, tx) => viewModel.setState(
					baseRange,
					model
						.getState(baseRange)
						.get()
						.withInputValue(this.inputNumber, value),
					tx
				),
				toggleBothSides() {
					transaction(tx => {
						/** @description Context Menu: toggle both sides */
						const state = model
							.getState(baseRange)
							.get();
						model.setState(
							baseRange,
							state
								.toggle(inputNumber)
								.toggle(inputNumber === 1 ? 2 : 1),
							true,
							tx
						);
					});
				},
				getContextMenuActions: () => {
					const state = model.getState(baseRange).get();
					const handled = model.isHandled(baseRange).get();

					const update = (newState: ModifiedBaseRangeState) => {
						transaction(tx => {
							/** @description Context Menu: Update Base Range State */
							return viewModel.setState(baseRange, newState, tx);
						});
					};

					function action(id: string, label: string, targetState: ModifiedBaseRangeState, checked: boolean) {
						const action = new Action(id, label, undefined, true, () => {
							update(targetState);
						});
						action.checked = checked;
						return action;
					}
					const both = state.input1 && state.input2;

					return [
						baseRange.input1Diffs.length > 0
							? action(
								'mergeEditor.acceptInput1',
								localize('mergeEditor.accept', 'Accept {0}', model.input1Title),
								state.toggle(1),
								state.input1
							)
							: undefined,
						baseRange.input2Diffs.length > 0
							? action(
								'mergeEditor.acceptInput2',
								localize('mergeEditor.accept', 'Accept {0}', model.input2Title),
								state.toggle(2),
								state.input2
							)
							: undefined,
						baseRange.isConflicting
							? setFields(
								action(
									'mergeEditor.acceptBoth',
									localize(
										'mergeEditor.acceptBoth',
										'Accept Both'
									),
									state.withInput1(!both).withInput2(!both),
									both
								),
								{ enabled: baseRange.canBeCombined }
							)
							: undefined,
						new Separator(),
						baseRange.isConflicting
							? setFields(
								action(
									'mergeEditor.swap',
									localize('mergeEditor.swap', 'Swap'),
									state.swap(),
									false
								),
								{ enabled: !state.isEmpty && (!both || baseRange.isOrderRelevant) }
							)
							: undefined,

						setFields(
							new Action(
								'mergeEditor.markAsHandled',
								localize('mergeEditor.markAsHandled', 'Mark as Handled'),
								undefined,
								true,
								() => {
									transaction((tx) => {
										/** @description Context Menu: Mark as handled */
										model.setHandled(baseRange, !handled, tx);
									});
								}
							),
							{ checked: handled }
						),
					].filter(isDefined);
				}
			}));
	});

	constructor(
		public readonly inputNumber: 1 | 2,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
	) {
		super(instantiationService);

		this._register(applyObservableDecorations(this.editor, this.decorations));

		this._register(
			new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
				getIntersectingGutterItems: (range, reader) => {
					return this.modifiedBaseRangeGutterItemInfos.read(reader);
				},
				createView: (item, target) => new MergeConflictGutterItemView(item, target, contextMenuService, themeService),
			})
		);
	}

	protected override getEditorContributions(): IEditorContributionDescription[] | undefined {
		return EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeLensContribution.ID);
	}
}

export interface ModifiedBaseRangeGutterItemInfo extends IGutterItemInfo {
	enabled: IObservable<boolean>;
	toggleState: IObservable<InputState>;
	setState(value: boolean, tx: ITransaction): void;
	toggleBothSides(): void;
	getContextMenuActions(): readonly IAction[];
}

export class MergeConflictGutterItemView extends Disposable implements IGutterItemView<ModifiedBaseRangeGutterItemInfo> {
	private readonly item: ISettableObservable<ModifiedBaseRangeGutterItemInfo>;

	constructor(
		item: ModifiedBaseRangeGutterItemInfo,
		private readonly target: HTMLElement,
		contextMenuService: IContextMenuService,
		themeService: IThemeService
	) {
		super();

		this.item = observableValue('item', item);

		target.classList.add('merge-accept-gutter-marker');

		const checkBox = new Toggle({ isChecked: false, title: localize('accept', "Accept"), icon: Codicon.check });

		this._register(attachToggleStyler(checkBox, themeService));

		this._register(
			dom.addDisposableListener(checkBox.domNode, dom.EventType.MOUSE_DOWN, (e) => {
				const item = this.item.get();
				if (!item) {
					return;
				}

				if (e.button === /* Right */ 2) {
					contextMenuService.showContextMenu({
						getAnchor: () => checkBox.domNode,
						getActions: item.getContextMenuActions,
					});

					e.stopPropagation();
					e.preventDefault();
				} else if (e.button === /* Middle */ 1) {
					item.toggleBothSides();

					e.stopPropagation();
					e.preventDefault();
				}
			})
		);

		checkBox.domNode.classList.add('accept-conflict-group');

		this._register(
			autorun('Update Checkbox', (reader) => {
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
			})
		);

		this._register(checkBox.onChange(() => {
			transaction(tx => {
				/** @description Handle Checkbox Change */
				this.item.get()!.setState(checkBox.checked, tx);
			});
		}));

		target.appendChild(dom.h('div.background', [noBreakWhitespace]).root);
		target.appendChild(
			dom.h('div.checkbox', [dom.h('div.checkbox-background', [checkBox.domNode])]).root
		);
	}

	layout(top: number, height: number, viewTop: number, viewHeight: number): void {
		this.target.classList.remove('multi-line');
		this.target.classList.remove('single-line');
		this.target.classList.add(height > 30 ? 'multi-line' : 'single-line');
	}

	update(baseRange: ModifiedBaseRangeGutterItemInfo): void {
		transaction(tx => {
			/** @description MergeConflictGutterItemView: Updating new base range */
			this.item.set(baseRange, tx);
		});
	}
}
