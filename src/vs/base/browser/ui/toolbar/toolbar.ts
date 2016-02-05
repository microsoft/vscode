/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./toolbar';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {Builder, $} from 'vs/base/browser/builder';
import types = require('vs/base/common/types');
import {Action, IActionRunner, IAction} from 'vs/base/common/actions';
import {ActionBar, ActionsOrientation, IActionItemProvider, BaseActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IContextMenuProvider, DropdownMenu, IActionProvider, ILabelRenderer, IDropdownMenuOptions} from 'vs/base/browser/ui/dropdown/dropdown';
import {ListenerUnbind} from 'vs/base/common/eventEmitter';

export const CONTEXT = 'context.toolbar';

export interface IToolBarOptions {
	orientation?: ActionsOrientation;
	actionItemProvider?: IActionItemProvider;
	ariaLabel?: string;
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

	constructor(container: HTMLElement, contextMenuProvider: IContextMenuProvider, options: IToolBarOptions = { orientation: ActionsOrientation.HORIZONTAL }) {
		this.options = options;
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
						'toolbar-toggle-more'
					);

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
			this.actionBar.push(primaryActionsToSet, { icon: true, label: false });
		};
	}

	public addPrimaryAction(primaryActions: IAction): () => void {
		return () => {

			// Add after the "..." action if we have secondary actions
			if (this.hasSecondaryActions) {
				let itemCount = this.actionBar.length();
				this.actionBar.push(primaryActions, { icon: true, label: false, index: itemCount });
			}

			// Otherwise just add to the end
			else {
				this.actionBar.push(primaryActions, { icon: true, label: false });
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
	private toUnbind: ListenerUnbind;
	private contextMenuProvider: IContextMenuProvider;
	private actionItemProvider: IActionItemProvider;
	private clazz: string;

	constructor(action: IAction, menuActions: IAction[], contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, clazz: string);
	constructor(action: IAction, actionProvider: IActionProvider, contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, clazz: string);
	constructor(action: IAction, menuActionsOrProvider: any, contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, clazz: string) {
		super(null, action);

		this.menuActionsOrProvider = menuActionsOrProvider;
		this.contextMenuProvider = contextMenuProvider;
		this.actionItemProvider = actionItemProvider;
		this.actionRunner = actionRunner;
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
			actionRunner: this.actionRunner
		};

		// Reemit events for running actions
		this.toUnbind = this.addEmitter(this.dropdownMenu);
	}

	public show(): void {
		if (this.dropdownMenu) {
			this.dropdownMenu.show();
		}
	}

	public dispose(): void {
		this.toUnbind();
		this.dropdownMenu.dispose();

		super.dispose();
	}
}