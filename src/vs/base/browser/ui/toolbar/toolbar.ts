/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./toolbar';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Builder, $ } from 'vs/base/browser/builder';
import types = require('vs/base/common/types');
import { Action, IActionRunner, IAction } from 'vs/base/common/actions';
import { ActionBar, ActionsOrientation, IActionItemProvider, BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuProvider, DropdownMenu, IActionProvider, ILabelRenderer, IDropdownMenuOptions } from 'vs/base/browser/ui/dropdown/dropdown';
import { Keybinding } from 'vs/base/common/keyCodes';

export const CONTEXT = 'context.toolbar';

export interface IToolBarOptions {
	orientation?: ActionsOrientation;
	actionItemProvider?: IActionItemProvider;
	ariaLabel?: string;
	getKeyBinding?: (action: IAction) => Keybinding;
	getKeyBindingLabel?: (key: Keybinding) => string;
}

/**
 * A widget that combines an action bar for primary actions and a dropdown for secondary actions.
 */
export class ToolBar {
	private options: IToolBarOptions;
	private actionBar: ActionBar;
	private toggleMenuAction: ToggleMenuAction;
	private toggleMenuActionItem: DropdownMenuActionItem;
	private hasSecondaryActions: boolean;
	private lookupKeybindings: boolean;

	constructor(container: HTMLElement, contextMenuProvider: IContextMenuProvider, options: IToolBarOptions = { orientation: ActionsOrientation.HORIZONTAL }) {
		this.options = options;
		this.lookupKeybindings = typeof this.options.getKeyBinding === 'function' && typeof this.options.getKeyBindingLabel === 'function';

		this.toggleMenuAction = new ToggleMenuAction(() => this.toggleMenuActionItem && this.toggleMenuActionItem.show());

		let element = document.createElement('div');
		element.className = 'monaco-toolbar';
		container.appendChild(element);

		this.actionBar = new ActionBar($(element), {
			orientation: options.orientation,
			ariaLabel: options.ariaLabel,
			actionItemProvider: (action: Action) => {

				// Return special action item for the toggle menu action
				if (action.id === ToggleMenuAction.ID) {

					// Dispose old
					if (this.toggleMenuActionItem) {
						this.toggleMenuActionItem.dispose();
					}

					// Create new
					this.toggleMenuActionItem = new DropdownMenuActionItem(
						action,
						(<ToggleMenuAction>action).menuActions,
						contextMenuProvider,
						this.options.actionItemProvider,
						this.actionRunner,
						this.options.getKeyBinding,
						'toolbar-toggle-more'
					);
					this.toggleMenuActionItem.setActionContext(this.actionBar.context);

					return this.toggleMenuActionItem;
				}

				return options.actionItemProvider ? options.actionItemProvider(action) : null;
			}
		});
	}

	public set actionRunner(actionRunner: IActionRunner) {
		this.actionBar.actionRunner = actionRunner;
	}

	public get actionRunner(): IActionRunner {
		return this.actionBar.actionRunner;
	}

	public set context(context: any) {
		this.actionBar.context = context;
		if (this.toggleMenuActionItem) {
			this.toggleMenuActionItem.setActionContext(context);
		}
	}

	public getContainer(): Builder {
		return this.actionBar.getContainer();
	}

	public setAriaLabel(label: string): void {
		this.actionBar.setAriaLabel(label);
	}

	public setActions(primaryActions: IAction[], secondaryActions?: IAction[]): () => void {
		return () => {
			let primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];

			// Inject additional action to open secondary actions if present
			this.hasSecondaryActions = secondaryActions && secondaryActions.length > 0;
			if (this.hasSecondaryActions) {
				this.toggleMenuAction.menuActions = secondaryActions.slice(0);
				primaryActionsToSet.push(this.toggleMenuAction);
			}

			this.actionBar.clear();

			primaryActionsToSet.forEach(action => {
				this.actionBar.push(action, { icon: true, label: false, keybinding: this.getKeybindingLabel(action) });
			});
		};
	}

	private getKeybindingLabel(action: IAction): string {
		const key = this.lookupKeybindings ? this.options.getKeyBinding(action) : void 0;

		return key ? this.options.getKeyBindingLabel(key) : void 0;
	}

	public addPrimaryAction(primaryAction: IAction): () => void {
		return () => {

			// Add after the "..." action if we have secondary actions
			if (this.hasSecondaryActions) {
				let itemCount = this.actionBar.length();
				this.actionBar.push(primaryAction, { icon: true, label: false, index: itemCount, keybinding: this.getKeybindingLabel(primaryAction) });
			}

			// Otherwise just add to the end
			else {
				this.actionBar.push(primaryAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(primaryAction) });
			}
		};
	}

	public dispose(): void {
		this.actionBar.dispose();
		this.toggleMenuAction.dispose();

		if (this.toggleMenuActionItem) {
			this.toggleMenuActionItem.dispose();
		}
	}
}

class ToggleMenuAction extends Action {

	public static ID = 'toolbar.toggle.more';

	private _menuActions: IAction[];
	private toggleDropdownMenu: () => void;

	constructor(toggleDropdownMenu: () => void) {
		super(ToggleMenuAction.ID, nls.localize('more', "More"), null, true);

		this.toggleDropdownMenu = toggleDropdownMenu;
	}

	public run(): TPromise<any> {
		this.toggleDropdownMenu();

		return TPromise.as(true);
	}

	public get menuActions() {
		return this._menuActions;
	}

	public set menuActions(actions: IAction[]) {
		this._menuActions = actions;
	}
}

export class DropdownMenuActionItem extends BaseActionItem {
	private menuActionsOrProvider: any;
	private dropdownMenu: DropdownMenu;
	private toUnbind: IDisposable;
	private contextMenuProvider: IContextMenuProvider;
	private actionItemProvider: IActionItemProvider;
	private keybindings: (action: IAction) => Keybinding;
	private clazz: string;

	constructor(action: IAction, menuActions: IAction[], contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, keybindings: (action: IAction) => Keybinding, clazz: string);
	constructor(action: IAction, actionProvider: IActionProvider, contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, keybindings: (action: IAction) => Keybinding, clazz: string);
	constructor(action: IAction, menuActionsOrProvider: any, contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, keybindings: (action: IAction) => Keybinding, clazz: string) {
		super(null, action);

		this.menuActionsOrProvider = menuActionsOrProvider;
		this.contextMenuProvider = contextMenuProvider;
		this.actionItemProvider = actionItemProvider;
		this.actionRunner = actionRunner;
		this.keybindings = keybindings;
		this.clazz = clazz;
	}

	public render(container: HTMLElement): void {
		let labelRenderer: ILabelRenderer = (el: HTMLElement): IDisposable => {
			this.builder = $('a.action-label').attr({
				tabIndex: '0',
				role: 'button',
				'aria-haspopup': 'true',
				title: this._action.label || '',
				class: this.clazz
			});

			this.builder.appendTo(el);

			return null;
		};

		let options: IDropdownMenuOptions = {
			contextMenuProvider: this.contextMenuProvider,
			labelRenderer: labelRenderer
		};

		// Render the DropdownMenu around a simple action to toggle it
		if (types.isArray(this.menuActionsOrProvider)) {
			options.actions = this.menuActionsOrProvider;
		} else {
			options.actionProvider = this.menuActionsOrProvider;
		}

		this.dropdownMenu = new DropdownMenu(container, options);

		this.dropdownMenu.menuOptions = {
			actionItemProvider: this.actionItemProvider,
			actionRunner: this.actionRunner,
			getKeyBinding: this.keybindings,
			context: this._context
		};

		// Reemit events for running actions
		this.toUnbind = this.addEmitter2(this.dropdownMenu);
	}

	public setActionContext(newContext: any): void {
		super.setActionContext(newContext);

		if (this.dropdownMenu) {
			this.dropdownMenu.menuOptions.context = newContext;
		}
	}

	public show(): void {
		if (this.dropdownMenu) {
			this.dropdownMenu.show();
		}
	}

	public dispose(): void {
		this.toUnbind.dispose();
		this.dropdownMenu.dispose();

		super.dispose();
	}
}