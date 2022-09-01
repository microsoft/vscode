/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { autorun, derived, IObservable, ISettableObservable, ITransaction, transaction, observableValue } from 'vs/base/common/observable';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { isDefined } from 'vs/base/common/types';
import { EditorExtensionsRegistry, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { CodeLensContribution } from 'vs/editor/contrib/codelens/browser/codelensController';
import { localize } from 'vs/nls';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
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
				if (modifiedBaseRange.isConflicting) {
					blockClassNames.push('conflicting');
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
						overviewRuler: modifiedBaseRange.isConflicting ? {
							position: OverviewRulerLane.Center,
							color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
						} : undefined
					}
				});

				if (modifiedBaseRange.isConflicting) {
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
				className: derived('checkbox classnames', (reader) => {
					const classNames = [];
					const active = viewModel.activeModifiedBaseRange.read(reader);
					if (!model.has(baseRange)) {
						return ''; // Invalid state, should only be observed temporarily
					}
					const isHandled = model.isHandled(baseRange).read(reader);
					if (isHandled) {
						classNames.push('handled');
					}
					if (baseRange === active) {
						classNames.push('focused');
					}
					return classNames.join(' ');
				}),
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
								localize('mergeEditor.accept', 'Accept {0}', model.input1.title),
								state.toggle(1),
								state.input1
							)
							: undefined,
						baseRange.input2Diffs.length > 0
							? action(
								'mergeEditor.acceptInput2',
								localize('mergeEditor.accept', 'Accept {0}', model.input2.title),
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
		titleMenuId: MenuId,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
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

		// title menu
		const titleMenu = menuService.createMenu(titleMenuId, contextKeyService);
		const toolBar = new ToolBar(this.htmlElements.toolbar, contextMenuService);
		const toolBarUpdate = () => {
			const secondary: IAction[] = [];
			createAndFillInActionBarActions(titleMenu, { renderShortTitle: true }, secondary);
			toolBar.setActions([], secondary);
		};
		this._store.add(toolBar);
		this._store.add(titleMenu);
		this._store.add(titleMenu.onDidChange(toolBarUpdate));
		toolBarUpdate();
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
	className: IObservable<string>;
}

export class MergeConflictGutterItemView extends Disposable implements IGutterItemView<ModifiedBaseRangeGutterItemInfo> {
	private readonly item: ISettableObservable<ModifiedBaseRangeGutterItemInfo>;

	private readonly checkboxDiv: HTMLDivElement;
	private readonly isMultiLine = observableValue('isMultiLine', false);

	constructor(
		item: ModifiedBaseRangeGutterItemInfo,
		target: HTMLElement,
		contextMenuService: IContextMenuService,
		themeService: IThemeService
	) {
		super();

		this.item = observableValue('item', item);

		const checkBox = new Toggle({
			isChecked: false,
			title: '',
			icon: Codicon.check
		});

		this._register(attachToggleStyler(checkBox, themeService));

		this._register(
			dom.addDisposableListener(checkBox.domNode, dom.EventType.MOUSE_DOWN, (e) => {
				const item = this.item.get();
				if (!item) {
					return;
				}

				if (e.button === /* Right */ 2) {
					e.stopPropagation();
					e.preventDefault();

					contextMenuService.showContextMenu({
						getAnchor: () => checkBox.domNode,
						getActions: item.getContextMenuActions,
					});

				} else if (e.button === /* Middle */ 1) {
					e.stopPropagation();
					e.preventDefault();

					item.toggleBothSides();
				}
			})
		);

		checkBox.domNode.classList.add('accept-conflict-group');

		this._register(
			autorun('Update Checkbox', (reader) => {
				const item = this.item.read(reader)!;
				const value = item.toggleState.read(reader);
				const iconMap: Record<InputState, { icon: Codicon | undefined; checked: boolean; title: string }> = {
					[InputState.excluded]: { icon: undefined, checked: false, title: localize('accept.excluded', "Accept") },
					[InputState.conflicting]: { icon: Codicon.circleFilled, checked: false, title: localize('accept.conflicting', "Accept (result is dirty)") },
					[InputState.first]: { icon: Codicon.check, checked: true, title: localize('accept.first', "Undo accept") },
					[InputState.second]: { icon: Codicon.checkAll, checked: true, title: localize('accept.second', "Undo accept (currently second)") },
				};
				const state = iconMap[value];
				checkBox.setIcon(state.icon);
				checkBox.checked = state.checked;
				checkBox.setTitle(state.title);

				if (!item.enabled.read(reader)) {
					checkBox.disable();
				} else {
					checkBox.enable();
				}
			})
		);

		this._register(autorun('Update Checkbox CSS ClassNames', (reader) => {
			let className = this.item.read(reader).className.read(reader);
			className += ' merge-accept-gutter-marker';
			if (this.isMultiLine.read(reader)) {
				className += ' multi-line';
			} else {
				className += ' single-line';
			}
			target.className = className;
		}));

		this._register(checkBox.onChange(() => {
			transaction(tx => {
				/** @description Handle Checkbox Change */
				this.item.get()!.setState(checkBox.checked, tx);
			});
		}));

		target.appendChild(dom.h('div.background', [noBreakWhitespace]).root);
		target.appendChild(
			this.checkboxDiv = dom.h('div.checkbox', [dom.h('div.checkbox-background', [checkBox.domNode])]).root
		);
	}

	layout(top: number, height: number, viewTop: number, viewHeight: number): void {
		const checkboxHeight = this.checkboxDiv.clientHeight;
		const middleHeight = height / 2 - checkboxHeight / 2;

		const margin = checkboxHeight;

		let effectiveCheckboxTop = top + middleHeight;

		const preferredViewPortRange = [
			margin,
			viewTop + viewHeight - margin - checkboxHeight
		];

		const preferredParentRange = [
			top + margin,
			top + height - checkboxHeight - margin
		];

		if (preferredParentRange[0] < preferredParentRange[1]) {
			effectiveCheckboxTop = clamp(effectiveCheckboxTop, preferredViewPortRange[0], preferredViewPortRange[1]);
			effectiveCheckboxTop = clamp(effectiveCheckboxTop, preferredParentRange[0], preferredParentRange[1]);
		}

		this.checkboxDiv.style.top = `${effectiveCheckboxTop - top}px`;

		transaction((tx) => {
			/** @description MergeConflictGutterItemView: Update Is Multi Line */
			this.isMultiLine.set(height > 30, tx);
		});
	}

	update(baseRange: ModifiedBaseRangeGutterItemInfo): void {
		transaction(tx => {
			/** @description MergeConflictGutterItemView: Updating new base range */
			this.item.set(baseRange, tx);
		});
	}
}
