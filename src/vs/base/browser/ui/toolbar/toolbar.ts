/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./toolbar';
import nls = require('vs/nls');
import Lifecycle = require('vs/base/common/lifecycle');
import Builder = require('vs/base/browser/builder');
import Types = require('vs/base/common/types');
import Actions = require('vs/base/common/actions');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import Dropdown = require('vs/base/browser/ui/dropdown/dropdown');
import EventEmitter = require('vs/base/common/eventEmitter');

var $ = <Builder.QuickBuilder> Builder.$;

export var CONTEXT = 'context.toolbar';

export interface IToolBarOptions {
	orientation?: ActionBar.ActionsOrientation;
	actionItemProvider?: ActionBar.IActionItemProvider;
}

/**
 * A widget that combines an action bar for primary actions and a dropdown for secondary actions.
 */
export class ToolBar {
	private options: IToolBarOptions;
	private actionBar: ActionBar.ActionBar;
	private toggleMenuAction: ToggleMenuAction;
	private toggleMenuActionItem: DropdownMenuActionItem;
	private hasSecondaryActions: boolean;

	constructor(container: HTMLElement, contextMenuProvider: Dropdown.IContextMenuProvider, options: IToolBarOptions = { orientation: ActionBar.ActionsOrientation.HORIZONTAL }) {
		this.options = options;
		this.toggleMenuAction = new ToggleMenuAction();

		var element = document.createElement('div');
		element.className = 'monaco-toolbar';
		container.appendChild(element);

		this.actionBar = new ActionBar.ActionBar($(element), {
			orientation: options.orientation,
			actionItemProvider: (action: Actions.Action) => {

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
						this.options.orientation === ActionBar.ActionsOrientation.HORIZONTAL,
						this.actionRunner,
						'toolbar-toggle-more'
					);

					return this.toggleMenuActionItem;
				}

				return options.actionItemProvider ? options.actionItemProvider(action) : null;
			}
		});
	}

	public set actionRunner(actionRunner: Actions.IActionRunner) {
		this.actionBar.actionRunner = actionRunner;
	}

	public get actionRunner(): Actions.IActionRunner {
		return this.actionBar.actionRunner;
	}

	public getContainer(): Builder.Builder {
		return this.actionBar.getContainer();
	}

	public setActions(primaryActions: Actions.IAction[], secondaryActions?: Actions.IAction[]): () => void {
		return () => {
			var primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];

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

	public addPrimaryAction(primaryActions: Actions.IAction): () => void {
		return () => {

			// Add after the "..." action if we have secondary actions
			if (this.hasSecondaryActions) {
				var itemCount = this.actionBar.length();
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

class ToggleMenuAction extends Actions.Action {

	public static ID = 'toolbar.toggle.more';

	private _menuActions: Actions.IAction[];

	constructor() {
		super(ToggleMenuAction.ID, nls.localize('more', "More"), null, true);
	}

	public get menuActions() {
		return this._menuActions;
	}

	public set menuActions(actions: Actions.IAction[]) {
		this._menuActions = actions;
	}
}

export class DropdownMenuActionItem extends ActionBar.BaseActionItem {

	private menuActionsOrProvider: any;
	private animateClick: boolean;
	private dropdownMenu: Dropdown.DropdownMenu;
	private toUnbind: EventEmitter.ListenerUnbind;
	private contextMenuProvider: Dropdown.IContextMenuProvider;
	private actionItemProvider: ActionBar.IActionItemProvider;
	private clazz: string;

	constructor(action: Actions.IAction, menuActions: Actions.IAction[], contextMenuProvider: Dropdown.IContextMenuProvider, actionItemProvider: ActionBar.IActionItemProvider, animateClick: boolean, actionRunner: Actions.IActionRunner, clazz: string);
	constructor(action: Actions.IAction, actionProvider: Dropdown.IActionProvider, contextMenuProvider: Dropdown.IContextMenuProvider, actionItemProvider: ActionBar.IActionItemProvider, animateClick: boolean, actionRunner: Actions.IActionRunner, clazz: string);
	constructor(action: Actions.IAction, menuActionsOrProvider: any, contextMenuProvider: Dropdown.IContextMenuProvider, actionItemProvider: ActionBar.IActionItemProvider, animateClick: boolean, actionRunner: Actions.IActionRunner, clazz: string) {
		super(null, action);

		this.menuActionsOrProvider = menuActionsOrProvider;
		this.contextMenuProvider = contextMenuProvider;
		this.actionItemProvider = actionItemProvider;
		this.animateClick = animateClick;
		this.actionRunner = actionRunner;
		this.clazz = clazz;
	}

	public render(container: HTMLElement): void {
		super.render(container);

		var labelRenderer: Dropdown.ILabelRenderer = (el: HTMLElement): Lifecycle.IDisposable => {
			var e = Builder.$('a.action-label').attr({
				tabIndex: '-1',
				role: 'menuitem',
				title: this._action.label || '',
				class: this.clazz
			}).appendTo(el);

			$('span.label').text(this.getAction().label).appendTo(e);

			if (this.animateClick) {
				$(el).on('mousedown', (e: MouseEvent) => {
					if (e.button === 0) {
						$(el).addClass('active');
					}
				});

				$(el).on(['mouseup', 'mouseout'], (e: MouseEvent) => {
					if (e.button === 0) {
						$(el).removeClass('active');
					}
				});
			}

			return null;
		};

		var options: Dropdown.IDropdownMenuOptions = {
			contextMenuProvider: this.contextMenuProvider,
			labelRenderer: labelRenderer
		};

		// Render the DropdownMenu around a simple action to toggle it
		if (Types.isArray(this.menuActionsOrProvider)) {
			options.actions = this.menuActionsOrProvider;
		} else {
			options.actionProvider = this.menuActionsOrProvider;
		}

		this.dropdownMenu = new Dropdown.DropdownMenu(container, options);

		this.dropdownMenu.menuOptions = {
			actionItemProvider: this.actionItemProvider,
			actionRunner: this.actionRunner
		};

		// Reemit events for running actions
		this.toUnbind = this.addEmitter(this.dropdownMenu);
	}

	public dispose(): void {
		this.toUnbind();
		this.dropdownMenu.dispose();

		super.dispose();
	}
}