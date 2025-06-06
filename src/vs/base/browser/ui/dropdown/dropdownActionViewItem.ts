/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Action, IAction, IActionRunner } from '../../../common/actions.js';
import { Codicon } from '../../../common/codicons.js';
import { Emitter } from '../../../common/event.js';
import { ResolvedKeybinding } from '../../../common/keybindings.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { IDisposable } from '../../../common/lifecycle.js';
import { ThemeIcon } from '../../../common/themables.js';
import { IContextMenuProvider } from '../../contextmenu.js';
import { $, addDisposableListener, append, EventType, h } from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { IActionViewItemProvider } from '../actionbar/actionbar.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions, IBaseActionViewItemOptions } from '../actionbar/actionViewItems.js';
import { AnchorAlignment } from '../contextview/contextview.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import './dropdown.css';
import { DropdownMenu, IActionProvider, IDropdownMenuOptions, ILabelRenderer } from './dropdown.js';

export interface IKeybindingProvider {
	(action: IAction): ResolvedKeybinding | undefined;
}

export interface IAnchorAlignmentProvider {
	(): AnchorAlignment;
}

export interface IDropdownMenuActionViewItemOptions extends IBaseActionViewItemOptions {
	readonly actionViewItemProvider?: IActionViewItemProvider;
	readonly keybindingProvider?: IKeybindingProvider;
	readonly actionRunner?: IActionRunner;
	readonly classNames?: string[] | string;
	readonly anchorAlignmentProvider?: IAnchorAlignmentProvider;
	readonly menuAsChild?: boolean;
	readonly skipTelemetry?: boolean;
}

export class DropdownMenuActionViewItem extends BaseActionViewItem {
	private menuActionsOrProvider: readonly IAction[] | IActionProvider;
	private dropdownMenu: DropdownMenu | undefined;
	private contextMenuProvider: IContextMenuProvider;
	private actionItem: HTMLElement | null = null;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	protected override readonly options: IDropdownMenuActionViewItemOptions;

	constructor(
		action: IAction,
		menuActionsOrProvider: readonly IAction[] | IActionProvider,
		contextMenuProvider: IContextMenuProvider,
		options: IDropdownMenuActionViewItemOptions = Object.create(null)
	) {
		super(null, action, options);

		this.menuActionsOrProvider = menuActionsOrProvider;
		this.contextMenuProvider = contextMenuProvider;
		this.options = options;

		if (this.options.actionRunner) {
			this.actionRunner = this.options.actionRunner;
		}
	}

	override render(container: HTMLElement): void {
		this.actionItem = container;

		const labelRenderer: ILabelRenderer = (el: HTMLElement): IDisposable | null => {
			this.element = append(el, $('a.action-label'));
			return this.renderLabel(this.element);
		};

		const isActionsArray = Array.isArray(this.menuActionsOrProvider);
		const options: IDropdownMenuOptions = {
			contextMenuProvider: this.contextMenuProvider,
			labelRenderer: labelRenderer,
			menuAsChild: this.options.menuAsChild,
			actions: isActionsArray ? this.menuActionsOrProvider as IAction[] : undefined,
			actionProvider: isActionsArray ? undefined : this.menuActionsOrProvider as IActionProvider,
			skipTelemetry: this.options.skipTelemetry
		};

		this.dropdownMenu = this._register(new DropdownMenu(container, options));
		this._register(this.dropdownMenu.onDidChangeVisibility(visible => {
			this.element?.setAttribute('aria-expanded', `${visible}`);
			this._onDidChangeVisibility.fire(visible);
		}));

		this.dropdownMenu.menuOptions = {
			actionViewItemProvider: this.options.actionViewItemProvider,
			actionRunner: this.actionRunner,
			getKeyBinding: this.options.keybindingProvider,
			context: this._context
		};

		if (this.options.anchorAlignmentProvider) {
			const that = this;

			this.dropdownMenu.menuOptions = {
				...this.dropdownMenu.menuOptions,
				get anchorAlignment(): AnchorAlignment {
					return that.options.anchorAlignmentProvider!();
				}
			};
		}

		this.updateTooltip();
		this.updateEnabled();
	}

	protected renderLabel(element: HTMLElement): IDisposable | null {
		let classNames: string[] = [];

		if (typeof this.options.classNames === 'string') {
			classNames = this.options.classNames.split(/\s+/g).filter(s => !!s);
		} else if (this.options.classNames) {
			classNames = this.options.classNames;
		}

		// todo@aeschli: remove codicon, should come through `this.options.classNames`
		if (!classNames.find(c => c === 'icon')) {
			classNames.push('codicon');
		}

		element.classList.add(...classNames);

		if (this._action.label) {
			this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('mouse'), element, this._action.label));
		}

		return null;
	}

	protected setAriaLabelAttributes(element: HTMLElement): void {
		element.setAttribute('role', 'button');
		element.setAttribute('aria-haspopup', 'true');
		element.setAttribute('aria-expanded', 'false');
		element.ariaLabel = this._action.label || '';
	}

	protected override getTooltip(): string | undefined {
		let title: string | null = null;

		if (this.action.tooltip) {
			title = this.action.tooltip;
		} else if (this.action.label) {
			title = this.action.label;
		}

		return title ?? undefined;
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);

		if (this.dropdownMenu) {
			if (this.dropdownMenu.menuOptions) {
				this.dropdownMenu.menuOptions.context = newContext;
			} else {
				this.dropdownMenu.menuOptions = { context: newContext };
			}
		}
	}

	show(): void {
		this.dropdownMenu?.show();
	}

	protected override updateEnabled(): void {
		const disabled = !this.action.enabled;
		this.actionItem?.classList.toggle('disabled', disabled);
		this.element?.classList.toggle('disabled', disabled);
	}
}

export interface IActionWithDropdownActionViewItemOptions extends IActionViewItemOptions {
	readonly menuActionsOrProvider: readonly IAction[] | IActionProvider;
	readonly menuActionClassNames?: string[];
}

export class ActionWithDropdownActionViewItem extends ActionViewItem {

	protected dropdownMenuActionViewItem: DropdownMenuActionViewItem | undefined;

	constructor(
		context: unknown,
		action: IAction,
		options: IActionWithDropdownActionViewItemOptions,
		private readonly contextMenuProvider: IContextMenuProvider
	) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this.element) {
			this.element.classList.add('action-dropdown-item');
			const menuActionsProvider = {
				getActions: () => {
					const actionsProvider = (<IActionWithDropdownActionViewItemOptions>this.options).menuActionsOrProvider;
					return Array.isArray(actionsProvider) ? actionsProvider : (actionsProvider as IActionProvider).getActions(); // TODO: microsoft/TypeScript#42768
				}
			};

			const menuActionClassNames = (<IActionWithDropdownActionViewItemOptions>this.options).menuActionClassNames || [];
			const separator = h('div.action-dropdown-item-separator', [h('div', {})]).root;
			separator.classList.toggle('prominent', menuActionClassNames.includes('prominent'));
			append(this.element, separator);

			this.dropdownMenuActionViewItem = this._register(new DropdownMenuActionViewItem(this._register(new Action('dropdownAction', nls.localize('moreActions', "More Actions..."))), menuActionsProvider, this.contextMenuProvider, { classNames: ['dropdown', ...ThemeIcon.asClassNameArray(Codicon.dropDownButton), ...menuActionClassNames], hoverDelegate: this.options.hoverDelegate }));
			this.dropdownMenuActionViewItem.render(this.element);

			this._register(addDisposableListener(this.element, EventType.KEY_DOWN, e => {
				// If we don't have any actions then the dropdown is hidden so don't try to focus it #164050
				if (menuActionsProvider.getActions().length === 0) {
					return;
				}
				const event = new StandardKeyboardEvent(e);
				let handled: boolean = false;
				if (this.dropdownMenuActionViewItem?.isFocused() && event.equals(KeyCode.LeftArrow)) {
					handled = true;
					this.dropdownMenuActionViewItem?.blur();
					this.focus();
				} else if (this.isFocused() && event.equals(KeyCode.RightArrow)) {
					handled = true;
					this.blur();
					this.dropdownMenuActionViewItem?.focus();
				}
				if (handled) {
					event.preventDefault();
					event.stopPropagation();
				}
			}));
		}
	}

	override blur(): void {
		super.blur();
		this.dropdownMenuActionViewItem?.blur();
	}

	override setFocusable(focusable: boolean): void {
		super.setFocusable(focusable);
		this.dropdownMenuActionViewItem?.setFocusable(focusable);
	}
}
