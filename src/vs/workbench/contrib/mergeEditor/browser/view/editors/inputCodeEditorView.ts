/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, h, reset } from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Toggle } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { Action, IAction, Separator } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../base/common/numbers.js';
import { autorun, autorunOpts, derived, derivedOpts, IObservable, ISettableObservable, ITransaction, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { noBreakWhitespace } from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from '../../../../../../editor/common/model.js';
import { localize } from '../../../../../../nls.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultToggleStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { InputState, ModifiedBaseRange, ModifiedBaseRangeState } from '../../model/modifiedBaseRange.js';
import { applyObservableDecorations, setFields } from '../../utils.js';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from '../colors.js';
import { MergeEditorViewModel } from '../viewModel.js';
import { EditorGutter, IGutterItemInfo, IGutterItemView } from '../editorGutter.js';
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from './codeEditorView.js';

export class InputCodeEditorView extends CodeEditorView {
	public readonly otherInputNumber;

	constructor(
		public readonly inputNumber: 1 | 2,
		viewModel: IObservable<MergeEditorViewModel | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(instantiationService, viewModel, configurationService);
		this.otherInputNumber = this.inputNumber === 1 ? 2 : 1;
		this.modifiedBaseRangeGutterItemInfos = derivedOpts({ debugName: `input${this.inputNumber}.modifiedBaseRangeGutterItemInfos` }, reader => {
			const viewModel = this.viewModel.read(reader);
			if (!viewModel) { return []; }
			const model = viewModel.model;
			const inputNumber = this.inputNumber;

			const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);

			return model.modifiedBaseRanges.read(reader)
				.filter((r) => r.getInputDiffs(this.inputNumber).length > 0 && (showNonConflictingChanges || r.isConflicting || !model.isHandled(r).read(reader)))
				.map((baseRange, idx) => new ModifiedBaseRangeGutterItemModel(idx.toString(), baseRange, inputNumber, viewModel));
		});
		this.decorations = derivedOpts({ debugName: `input${this.inputNumber}.decorations` }, reader => {
			const viewModel = this.viewModel.read(reader);
			if (!viewModel) {
				return [];
			}
			const model = viewModel.model;
			const textModel = (this.inputNumber === 1 ? model.input1 : model.input2).textModel;

			const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);

			const result = new Array<IModelDeltaDecoration>();

			const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
			const showDeletionMarkers = this.showDeletionMarkers.read(reader);
			const diffWithThis = viewModel.baseCodeEditorView.read(reader) !== undefined && viewModel.baseShowDiffAgainst.read(reader) === this.inputNumber;
			const useSimplifiedDecorations = !diffWithThis && this.useSimplifiedDecorations.read(reader);

			for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {
				const range = modifiedBaseRange.getInputRange(this.inputNumber);
				if (!range) {
					continue;
				}

				const blockClassNames = ['merge-editor-block'];
				let blockPadding: [top: number, right: number, bottom: number, left: number] = [0, 0, 0, 0];
				const isHandled = model.isInputHandled(modifiedBaseRange, this.inputNumber).read(reader);
				if (isHandled) {
					blockClassNames.push('handled');
				}
				if (modifiedBaseRange === activeModifiedBaseRange) {
					blockClassNames.push('focused');
					blockPadding = [0, 2, 0, 2];
				}
				if (modifiedBaseRange.isConflicting) {
					blockClassNames.push('conflicting');
				}
				const inputClassName = this.inputNumber === 1 ? 'input i1' : 'input i2';
				blockClassNames.push(inputClassName);

				if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
					continue;
				}

				if (useSimplifiedDecorations && !isHandled) {
					blockClassNames.push('use-simplified-decorations');
				}

				result.push({
					range: range.toInclusiveRangeOrEmpty(),
					options: {
						showIfCollapsed: true,
						blockClassName: blockClassNames.join(' '),
						blockPadding,
						blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
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

				if (!useSimplifiedDecorations && (modifiedBaseRange.isConflicting || !model.isHandled(modifiedBaseRange).read(reader))) {
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
								if (showDeletionMarkers || !d.outputRange.isEmpty()) {
									result.push({
										range: d.outputRange,
										options: {
											className: d.outputRange.isEmpty() ? `merge-editor-diff-empty-word ${inputClassName}` : `merge-editor-diff-word ${inputClassName}`,
											description: 'Merge Editor',
											showIfCollapsed: true,
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

		this.htmlElements.root.classList.add(`input`);

		this._register(
			new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
				getIntersectingGutterItems: (range, reader) => {
					if (this.checkboxesVisible.read(reader)) {
						return this.modifiedBaseRangeGutterItemInfos.read(reader);
					} else {
						return [];
					}
				},
				createView: (item, target) => new MergeConflictGutterItemView(item, target, contextMenuService),
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

		this._register(autorunOpts({ debugName: `input${this.inputNumber}: update labels & text model` }, reader => {
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

	private readonly modifiedBaseRangeGutterItemInfos;

	private readonly decorations;
}

export class ModifiedBaseRangeGutterItemModel implements IGutterItemInfo {
	private readonly model;
	public readonly range;

	constructor(
		public readonly id: string,
		private readonly baseRange: ModifiedBaseRange,
		private readonly inputNumber: 1 | 2,
		private readonly viewModel: MergeEditorViewModel
	) {
		this.model = this.viewModel.model;
		this.range = this.baseRange.getInputRange(this.inputNumber);
		this.enabled = this.model.isUpToDate;
		this.toggleState = derived(this, reader => {
			const input = this.model
				.getState(this.baseRange)
				.read(reader)
				.getInput(this.inputNumber);
			return input === InputState.second && !this.baseRange.isOrderRelevant
				? InputState.first
				: input;
		});
		this.state = derived(this, reader => {
			const active = this.viewModel.activeModifiedBaseRange.read(reader);
			if (!this.model.hasBaseRange(this.baseRange)) {
				return { handled: false, focused: false }; // Invalid state, should only be observed temporarily
			}
			return {
				handled: this.model.isHandled(this.baseRange).read(reader),
				focused: this.baseRange === active,
			};
		});
	}

	public readonly enabled;

	public readonly toggleState: IObservable<InputState>;

	public readonly state: IObservable<{ handled: boolean; focused: boolean }>;

	public setState(value: boolean, tx: ITransaction): void {
		this.viewModel.setState(
			this.baseRange,
			this.model
				.getState(this.baseRange)
				.get()
				.withInputValue(this.inputNumber, value),
			tx,
			this.inputNumber
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
				return this.viewModel.setState(this.baseRange, newState, tx, this.inputNumber);
			});
		};

		function action(id: string, label: string, targetState: ModifiedBaseRangeState, checked: boolean) {
			const action = new Action(id, label, undefined, true, () => {
				update(targetState);
			});
			action.checked = checked;
			return action;
		}
		const both = state.includesInput1 && state.includesInput2;

		return [
			this.baseRange.input1Diffs.length > 0
				? action(
					'mergeEditor.acceptInput1',
					localize('mergeEditor.accept', 'Accept {0}', this.model.input1.title),
					state.toggle(1),
					state.includesInput1
				)
				: undefined,
			this.baseRange.input2Diffs.length > 0
				? action(
					'mergeEditor.acceptInput2',
					localize('mergeEditor.accept', 'Accept {0}', this.model.input2.title),
					state.toggle(2),
					state.includesInput2
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
						state.withInputValue(1, !both).withInputValue(2, !both),
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
					{ enabled: !state.kind && (!both || this.baseRange.isOrderRelevant) }
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
	private readonly isMultiLine = observableValue(this, false);

	constructor(
		item: ModifiedBaseRangeGutterItemModel,
		target: HTMLElement,
		contextMenuService: IContextMenuService,
	) {
		super();

		this.item = observableValue(this, item);

		const checkBox = new Toggle({
			isChecked: false,
			title: '',
			icon: Codicon.check,
			...defaultToggleStyles
		});
		checkBox.domNode.classList.add('accept-conflict-group');

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
			autorun(reader => {
				/** @description Update Checkbox */
				const item = this.item.read(reader)!;
				const value = item.toggleState.read(reader);
				const iconMap: Record<InputState, { icon: ThemeIcon | undefined; checked: boolean; title: string }> = {
					[InputState.excluded]: { icon: undefined, checked: false, title: localize('accept.excluded', "Accept") },
					[InputState.unrecognized]: { icon: Codicon.circleFilled, checked: false, title: localize('accept.conflicting', "Accept (result is dirty)") },
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

		this._register(autorun(reader => {
			/** @description Update Checkbox CSS ClassNames */
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
