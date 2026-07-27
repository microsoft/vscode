/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorFeedbackOverlay.css';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Button, ButtonWithDropdown, IButton } from '../../../../../base/browser/ui/button/button.js';
import { ActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, ActionRunner, IAction, Separator } from '../../../../../base/common/actions.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue, type IObservable } from '../../../../../base/common/observable.js';
import { assertType } from '../../../../../base/common/types.js';
import { MenuWorkbenchToolBar, HiddenItemStrategy } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { localize } from '../../../../../nls.js';

export interface IEditorFeedbackMenuOptions {
	readonly menuId: MenuId;
	readonly navigationBearingActionId: string;
	readonly navigatePreviousActionId: string;
	readonly navigateNextActionId: string;
	readonly submitActionId: string;
	readonly clearActionId: string;
	readonly submitLabel: (count: number) => string;
	readonly editorGroup?: IEditorGroup;
	readonly input?: {
		readonly key: string;
		readonly placeholder: string;
		readonly ariaLabel: string;
		readonly onDidChange: (value: string) => void;
		readonly onSubmit: (value: string) => Promise<boolean>;
	};
}

export interface IEditorFeedbackPlanAction {
	readonly id?: string;
	readonly label: string;
	readonly description?: string;
	readonly default?: boolean;
}

export interface IEditorFeedbackPlanOptions {
	readonly key: string;
	readonly actions: readonly IEditorFeedbackPlanAction[];
	readonly feedbackCount: number;
	readonly input?: {
		readonly placeholder: string;
		readonly ariaLabel: string;
	};
	readonly submitFeedbackLabel: string;
	readonly submitFeedbackWithCountLabel: (count: number) => string;
	readonly rejectLabel: string;
	readonly onSubmitFeedback: (overallFeedback: string | undefined) => Promise<void>;
	readonly onSubmitAction: (action: IEditorFeedbackPlanAction) => Promise<void>;
	readonly onReject: () => Promise<void>;
	readonly navigation?: {
		readonly menuId: MenuId;
		readonly bearingActionId: string;
		readonly clearActionId: string;
		readonly bearings: { activeIdx: number; totalCount: number };
	};
}

class EditorFeedbackActionRunner extends ActionRunner {

	constructor(
		private readonly _submitActionId: string | undefined,
		private readonly _clearActionId: string | undefined,
		private readonly _editorGroup: IEditorGroup | undefined,
		private readonly _getInput: () => string,
		private readonly _onSubmit: ((value: string) => Promise<boolean>) | undefined,
		private readonly _clearInput: () => void,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		if (action.id === this._clearActionId) {
			await action.run(context);
			this._clearInput();
			return;
		}
		const editorToClose = action.id === this._submitActionId ? this._editorGroup?.activeEditor : undefined;
		const didSubmit = action.id === this._submitActionId && this._onSubmit
			? await this._onSubmit(this._getInput())
			: await action.run(context);
		if (didSubmit === true && editorToClose && this._editorGroup) {
			await this._editorGroup.closeEditor(editorToClose);
		}
	}
}

class EditorFeedbackActionViewItem extends ActionViewItem {

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions,
		private readonly _keybindingService: IKeybindingService,
		private readonly _acceptedFeedbackCount: IObservable<number>,
		private readonly _submitActionId: string,
		navigatePreviousActionId: string,
		navigateNextActionId: string,
		private readonly _submitLabel: (count: number) => string,
		actionRunner: EditorFeedbackActionRunner,
	) {
		const isIconOnly = action.id === navigatePreviousActionId || action.id === navigateNextActionId;
		super(undefined, action, { ...options, icon: isIconOnly, label: !isIconOnly, keybindingNotRenderedWithLabel: true });
		this.actionRunner = actionRunner;
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this._action.id === this._submitActionId) {
			this.element?.classList.add('primary');
			this._store.add(autorun(reader => {
				this._acceptedFeedbackCount.read(reader);
				this.updateLabel();
				this.updateTooltip();
			}));
		}
	}

	protected override updateLabel(): void {
		if (this._action.id === this._submitActionId && this.label) {
			this.label.textContent = this._submitLabel(this._acceptedFeedbackCount.get());
			return;
		}
		super.updateLabel();
	}

	protected override getTooltip(): string | undefined {
		const value = this._action.id === this._submitActionId
			? this._submitLabel(this._acceptedFeedbackCount.get())
			: super.getTooltip();
		return value && !this.options.keybinding
			? this._keybindingService.appendKeybinding(value, this._action.id)
			: value;
	}
}

export class EditorFeedbackOverlayWidget extends Disposable {

	private readonly _domNode = document.createElement('div');
	private readonly _inputNode = document.createElement('div');
	private readonly _toolbarNode = document.createElement('div');
	private readonly _showStore = this._store.add(new DisposableStore());
	private readonly _navigationBearings = observableValue<{ activeIdx: number; totalCount: number }>(this, { activeIdx: -1, totalCount: 0 });
	private readonly _acceptedFeedbackCount = observableValue<number>(this, 0);
	private readonly _inputBox: InputBox;
	private _inputKey: string | undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();
		this._domNode.classList.add('agent-feedback-editor-overlay-widget');
		this._inputNode.classList.add('agent-feedback-editor-overlay-input');
		this._toolbarNode.classList.add('agent-feedback-editor-overlay-toolbar');
		this._inputBox = this._register(new InputBox(this._inputNode, undefined, { inputBoxStyles: defaultInputBoxStyles }));
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	get inputValue(): string {
		return this._inputBox.value;
	}

	layout(width: number): void {
		const availableWidth = Math.max(0, width - 48);
		this._domNode.style.maxWidth = `${availableWidth}px`;
		this._domNode.classList.toggle('compact', width < 760);
		this._domNode.classList.toggle('narrow', width < 520);
		this._domNode.style.width = width < 520 ? `${availableWidth}px` : '';
	}

	showMenu(navigationBearings: { activeIdx: number; totalCount: number }, acceptedFeedbackCount: number, options: IEditorFeedbackMenuOptions): void {
		this._prepare();
		this._navigationBearings.set(navigationBearings, undefined);
		this._acceptedFeedbackCount.set(acceptedFeedbackCount, undefined);

		if (options.input) {
			if (this._inputKey !== options.input.key) {
				this._inputBox.value = '';
				this._inputKey = options.input.key;
			}
			this._showInput(options.input.placeholder, options.input.ariaLabel);
			this._showStore.add(this._inputBox.onDidChange(value => options.input?.onDidChange(value)));
		}

		const actionRunner = this._showStore.add(new EditorFeedbackActionRunner(
			options.submitActionId,
			options.clearActionId,
			options.editorGroup,
			() => this._inputBox.value,
			options.input?.onSubmit,
			() => { this._inputBox.value = ''; },
		));
		this._showStore.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, options.menuId, {
			telemetrySource: 'agentFeedback.overlayToolbar',
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: () => true,
				useSeparatorsInPrimaryActions: true,
			},
			menuOptions: { renderShortTitle: true },
			actionRunner,
			actionViewItemProvider: (action, viewItemOptions) => {
				if (action.id === options.navigationBearingActionId) {
					const that = this;
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...viewItemOptions, icon: false, label: true, keybindingNotRenderedWithLabel: true });
						}

						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.add('label-item');
							this._store.add(autorun(reader => {
								assertType(this.label);
								const { activeIdx, totalCount } = that._navigationBearings.read(reader);
								this.label.innerText = totalCount > 0
									? localize('editorFeedback.navigation.nOfM', '{0}/{1}', activeIdx === -1 ? 1 : activeIdx + 1, totalCount)
									: localize('editorFeedback.navigation.zero', '0/0');
							}));
						}
					};
				}
				return new EditorFeedbackActionViewItem(
					action,
					viewItemOptions,
					this._keybindingService,
					this._acceptedFeedbackCount,
					options.submitActionId,
					options.navigatePreviousActionId,
					options.navigateNextActionId,
					options.submitLabel,
					actionRunner,
				);
			},
		}));
	}

	showPlan(options: IEditorFeedbackPlanOptions): void {
		this._prepare();
		const actionsStore = this._showStore.add(new DisposableStore());
		this._navigationBearings.set(options.navigation?.bearings ?? { activeIdx: -1, totalCount: 0 }, undefined);
		if (this._inputKey !== options.key) {
			this._inputBox.value = '';
			this._inputKey = options.key;
		}
		if (options.input) {
			this._showInput(options.input.placeholder, options.input.ariaLabel);
		} else {
			this._inputBox.value = '';
			this._inputNode.remove();
		}

		const actionsNode = document.createElement('div');
		actionsNode.classList.add('agent-feedback-editor-plan-actions');
		this._toolbarNode.appendChild(actionsNode);
		const renderActions = () => {
			actionsStore.clear();
			actionsNode.replaceChildren();

			const overallFeedback = this._inputBox.value.trim();
			const hasFeedback = options.feedbackCount > 0 || overallFeedback.length > 0;
			if (hasFeedback) {
				const submitButton = actionsStore.add(new Button(actionsNode, { ...defaultButtonStyles, supportIcons: true }));
				submitButton.label = options.feedbackCount > 0
					? options.submitFeedbackWithCountLabel(options.feedbackCount)
					: options.submitFeedbackLabel;
				actionsStore.add(submitButton.onDidClick(() => void options.onSubmitFeedback(overallFeedback || undefined)));
			} else {
				const primary = options.actions.find(action => action.default) ?? options.actions[0];
				const moreActions = options.actions.filter(action => action !== primary);
				let primaryButton: IButton;
				if (moreActions.length > 0) {
					primaryButton = new ButtonWithDropdown(actionsNode, {
						...defaultButtonStyles,
						supportIcons: true,
						contextMenuProvider: this._contextMenuService,
						addPrimaryActionToDropdown: false,
						actions: moreActions.map(action => {
							const item = new Action(action.id ?? action.label, action.label, undefined, true, () => options.onSubmitAction(action));
							item.tooltip = action.description ?? '';
							return actionsStore.add(item);
						}) as (Action | Separator)[],
					});
				} else {
					primaryButton = new Button(actionsNode, { ...defaultButtonStyles, supportIcons: true });
				}
				actionsStore.add(primaryButton);
				primaryButton.label = primary?.label ?? '';
				primaryButton.element.title = primary?.description ?? '';
				if (primary) {
					actionsStore.add(primaryButton.onDidClick(() => void options.onSubmitAction(primary)));
				}
			}

			const rejectButton = actionsStore.add(new Button(actionsNode, { ...defaultButtonStyles, secondary: true }));
			rejectButton.label = options.rejectLabel;
			actionsStore.add(rejectButton.onDidClick(() => void options.onReject()));
		};

		renderActions();
		this._showStore.add(this._inputBox.onDidChange(renderActions));
		if (options.navigation) {
			const navigation = options.navigation;
			const actionRunner = this._showStore.add(new EditorFeedbackActionRunner(
				undefined,
				navigation.clearActionId,
				undefined,
				() => this._inputBox.value,
				undefined,
				() => { this._inputBox.value = ''; },
			));
			this._showStore.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, navigation.menuId, {
				telemetrySource: 'planReviewFeedback.overlayToolbar',
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				toolbarOptions: {
					primaryGroup: () => true,
					useSeparatorsInPrimaryActions: true,
				},
				menuOptions: { renderShortTitle: true },
				actionRunner,
				actionViewItemProvider: (action, viewItemOptions) => {
					if (action.id === navigation.bearingActionId) {
						const that = this;
						return new class extends ActionViewItem {
							constructor() {
								super(undefined, action, { ...viewItemOptions, icon: false, label: true, keybindingNotRenderedWithLabel: true });
							}

							override render(container: HTMLElement): void {
								super.render(container);
								container.classList.add('label-item');
								this._store.add(autorun(reader => {
									assertType(this.label);
									const { activeIdx, totalCount } = that._navigationBearings.read(reader);
									this.label.innerText = totalCount > 0
										? localize('editorFeedback.navigation.nOfM', '{0}/{1}', activeIdx === -1 ? 1 : activeIdx + 1, totalCount)
										: localize('editorFeedback.navigation.zero', '0/0');
								}));
							}
						};
					}
					return new ActionViewItem(undefined, action, { ...viewItemOptions, icon: true, label: false, keybindingNotRenderedWithLabel: true });
				},
			}));
		}
	}

	hide(): void {
		this._showStore.clear();
		this._navigationBearings.set({ activeIdx: -1, totalCount: 0 }, undefined);
		this._acceptedFeedbackCount.set(0, undefined);
		this._inputNode.remove();
		this._toolbarNode.remove();
	}

	private _prepare(): void {
		this._showStore.clear();
		this._toolbarNode.replaceChildren();
		if (!this._domNode.contains(this._toolbarNode)) {
			this._domNode.appendChild(this._toolbarNode);
		}
		this._showStore.add(toDisposable(() => this._toolbarNode.remove()));
	}

	private _showInput(placeholder: string, ariaLabel: string): void {
		this._inputBox.setPlaceHolder(placeholder);
		this._inputBox.setAriaLabel(ariaLabel);
		if (!this._domNode.contains(this._inputNode)) {
			this._domNode.insertBefore(this._inputNode, this._toolbarNode);
		}
		this._showStore.add(toDisposable(() => this._inputNode.remove()));
	}
}
