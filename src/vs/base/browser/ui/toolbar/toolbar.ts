/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./toolbar';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action, IActionRunner, IAction } from 'vs/base/common/actions';
import { ActionBar, ActionsOrientation, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuProvider, DropdownMenuActionItem } from 'vs/base/browser/ui/dropdown/dropdown';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';

export const CONTEXT = 'context.toolbar';

export interface IToolBarOptions {
	orientation?: ActionsOrientation;
	actionItemProvider?: IActionItemProvider;
	ariaLabel?: string;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding;
	actionRunner?: IActionRunner;
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
		this.lookupKeybindings = typeof this.options.getKeyBinding === 'function';

		this.toggleMenuAction = new ToggleMenuAction(() => this.toggleMenuActionItem && this.toggleMenuActionItem.show());

		let element = document.createElement('div');
		element.className = 'monaco-toolbar';
		container.appendChild(element);

		this.actionBar = new ActionBar(element, {
			orientation: options.orientation,
			ariaLabel: options.ariaLabel,
			actionRunner: options.actionRunner,
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

	public getContainer(): HTMLElement {
		return this.actionBar.getContainer();
	}

	public getItemsWidth(): number {
		let itemsWidth = 0;
		for (let i = 0; i < this.actionBar.length(); i++) {
			itemsWidth += this.actionBar.getWidth(i);
		}
		return itemsWidth;
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

		return key ? key.getLabel() : void 0;
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

	public static readonly ID = 'toolbar.toggle.more';

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