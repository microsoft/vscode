/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, h, reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import { clamp } from 'vs/base/common/numbers';
import { autorun, derived, IObservable, ISettableObservable, ITransaction, observableValue, transaction } from 'vs/base/common/observable';
import { noBreakWhitespace } from 'vs/base/common/strings';
import { isDefined } from 'vs/base/common/types';
import { EditorExtensionsRegistry, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { CodeLensContribution } from 'vs/editor/contrib/codelens/browser/codelensController';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachToggleStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { InputState, ModifiedBaseRange, ModifiedBaseRangeState } from 'vs/workbench/contrib/mergeEditor/browser/model/modifiedBaseRange';
import { applyObservableDecorations, setFields } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from '../editorGutter';
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from './codeEditorView';

export class InputCodeEditorView extends CodeEditorView {
	constructor(
		public readonly inputNumber: 1 | 2,
		viewModel: IObservable<MergeEditorViewModel | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
	) {
		super(instantiationService, viewModel);

		this._register(
			new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
				getIntersectingGutterItems: (range, reader) => {
					return this.modifiedBaseRangeGutterItemInfos.read(reader);
				},
				createView: (item, target) => new MergeConflictGutterItemView(item, target, contextMenuService, themeService),
			})
		);

		this._register(
			createSelectionsAutorun(this, (baseRange, viewModel) =>
				viewModel.model.translateBaseRangeToInput(this.inputNumber, baseRange)
			)
		);

		this._register(
			instantiationService.createInstance(
				TitleMenu,
				inputNumber === 1 ? MenuId.MergeInput1Toolbar : MenuId.MergeInput2Toolbar,
				this.htmlElements.toolbar
			)
		);

		this._register(autorun('input${this.inputNumber}: update labels & text model', reader => {
			const vm = this.viewModel.read(reader);
			if (!vm) {
				return;
			}

			this.editor.setModel(this.inputNumber === 1 ? vm.model.input1.textModel : vm.model.input2.textModel);

			const title = this.inputNumber === 1
				? vm.model.input1.title || localize('input1', 'Input 1')
				: vm.model.input2.title || localize('input2', 'Input 2');

			const description = this.inputNumber === 1
				? vm.model.input1.description
				: vm.model.input2.description;

			const detail = this.inputNumber === 1
				? vm.model.input1.detail
				: vm.model.input2.detail;

			reset(this.htmlElements.title, ...renderLabelWithIcons(title));
			reset(this.htmlElements.description, ...(description ? renderLabelWithIcons(description) : []));
			reset(this.htmlElements.detail, ...(detail ? renderLabelWithIcons(detail) : []));
		}));


		this._register(applyObservableDecorations(this.editor, this.decorations));
	}

	private readonly modifiedBaseRangeGutterItemInfos = derived(`input${this.inputNumber}.modifiedBaseRangeGutterItemInfos`, reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) { return []; }
		const model = viewModel.model;
		const inputNumber = this.inputNumber;

		return model.modifiedBaseRanges.read(reader)
			.filter((r) => r.getInputDiffs(this.inputNumber).length > 0)
			.map((baseRange, idx) => new ModifiedBaseRangeGutterItemModel(idx.toString(), baseRange, inputNumber, viewModel));
	});

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
			if (!range || range.isEmpty) {
				continue;
			}

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

			if (modifiedBaseRange.isConflicting || !model.isHandled(modifiedBaseRange).read(reader)) {
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

	protected override getEditorContributions(): IEditorContributionDescription[] | undefined {
		return EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeLensContribution.ID);
	}
}

export class ModifiedBaseRangeGutterItemModel implements IGutterItemInfo {
	private readonly model = this.viewModel.model;
	public readonly range = this.baseRange.getInputRange(this.inputNumber);

	constructor(
		public readonly id: string,
		private readonly baseRange: ModifiedBaseRange,
		private readonly inputNumber: 1 | 2,
		private readonly viewModel: MergeEditorViewModel
	) {
	}

	public readonly enabled = this.model.isUpToDate;

	public readonly toggleState: IObservable<InputState> = derived('checkbox is checked', (reader) => {
		const input = this.model
			.getState(this.baseRange)
			.read(reader)
			.getInput(this.inputNumber);
		return input === InputState.second && !this.baseRange.isOrderRelevant
			? InputState.first
			: input;
	});

	public readonly state: IObservable<{ handled: boolean; focused: boolean }> = derived('checkbox state', (reader) => {
		const active = this.viewModel.activeModifiedBaseRange.read(reader);
		if (!this.model.hasBaseRange(this.baseRange)) {
			return { handled: false, focused: false }; // Invalid state, should only be observed temporarily
		}
		return {
			handled: this.model.isHandled(this.baseRange).read(reader),
			focused: this.baseRange === active,
		};
	});

	public setState(value: boolean, tx: ITransaction): void {
		this.viewModel.setState(
			this.baseRange,
			this.model
				.getState(this.baseRange)
				.get()
				.withInputValue(this.inputNumber, value),
			tx
		);
	}
	public toggleBothSides(): void {
		transaction(tx => {
			/** @description Context Menu: toggle both sides */
			const state = this.model
				.getState(this.baseRange)
				.get();
			this.model.setState(
				this.baseRange,
				state
					.toggle(this.inputNumber)
					.toggle(this.inputNumber === 1 ? 2 : 1),
				true,
				tx
			);
		});
	}

	public getContextMenuActions(): readonly IAction[] {
		const state = this.model.getState(this.baseRange).get();
		const handled = this.model.isHandled(this.baseRange).get();

		const update = (newState: ModifiedBaseRangeState) => {
			transaction(tx => {
				/** @description Context Menu: Update Base Range State */
				return this.viewModel.setState(this.baseRange, newState, tx);
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
			this.baseRange.input1Diffs.length > 0
				? action(
					'mergeEditor.acceptInput1',
					localize('mergeEditor.accept', 'Accept {0}', this.model.input1.title),
					state.toggle(1),
					state.input1
				)
				: undefined,
			this.baseRange.input2Diffs.length > 0
				? action(
					'mergeEditor.acceptInput2',
					localize('mergeEditor.accept', 'Accept {0}', this.model.input2.title),
					state.toggle(2),
					state.input2
				)
				: undefined,
			this.baseRange.isConflicting
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
					{ enabled: this.baseRange.canBeCombined }
				)
				: undefined,
			new Separator(),
			this.baseRange.isConflicting
				? setFields(
					action(
						'mergeEditor.swap',
						localize('mergeEditor.swap', 'Swap'),
						state.swap(),
						false
					),
					{ enabled: !state.isEmpty && (!both || this.baseRange.isOrderRelevant) }
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
							this.model.setHandled(this.baseRange, !handled, tx);
						});
					}
				),
				{ checked: handled }
			),
		].filter(isDefined);
	}
}

export class MergeConflictGutterItemView extends Disposable implements IGutterItemView<ModifiedBaseRangeGutterItemModel> {
	private readonly item: ISettableObservable<ModifiedBaseRangeGutterItemModel>;

	private readonly checkboxDiv: HTMLDivElement;
	private readonly isMultiLine = observableValue('isMultiLine', false);

	constructor(
		item: ModifiedBaseRangeGutterItemModel,
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
		checkBox.domNode.classList.add('accept-conflict-group');

		this._register(attachToggleStyler(checkBox, themeService));

		this._register(
			addDisposableListener(checkBox.domNode, EventType.MOUSE_DOWN, (e) => {
				const item = this.item.get();
				if (!item) {
					return;
				}

				if (e.button === /* Right */ 2) {
					e.stopPropagation();
					e.preventDefault();

					contextMenuService.showContextMenu({
						getAnchor: () => checkBox.domNode,
						getActions: () => item.getContextMenuActions(),
					});

				} else if (e.button === /* Middle */ 1) {
					e.stopPropagation();
					e.preventDefault();

					item.toggleBothSides();
				}
			})
		);

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
			const state = this.item.read(reader).state.read(reader);
			const classNames = [
				'merge-accept-gutter-marker',
				state.handled && 'handled',
				state.focused && 'focused',
				this.isMultiLine.read(reader) ? 'multi-line' : 'single-line',
			];
			target.className = classNames.filter(c => typeof c === 'string').join(' ');
		}));

		this._register(checkBox.onChange(() => {
			transaction(tx => {
				/** @description Handle Checkbox Change */
				this.item.get()!.setState(checkBox.checked, tx);
			});
		}));

		target.appendChild(h('div.background', [noBreakWhitespace]).root);
		target.appendChild(
			this.checkboxDiv = h('div.checkbox', [h('div.checkbox-background', [checkBox.domNode])]).root
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

	update(baseRange: ModifiedBaseRangeGutterItemModel): void {
		transaction(tx => {
			/** @description MergeConflictGutterItemView: Updating new base range */
			this.item.set(baseRange, tx);
		});
	}
}
