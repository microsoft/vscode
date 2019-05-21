/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./toolbar';
import * as nls from 'vs/nls';
import { Action, IActionRunner, IAction } from 'vs/base/common/actions';
import { ActionBar, ActionsOrientation, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuProvider, DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdown';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { withNullAsUndefined } from 'vs/base/common/types';

export const CONTEXT = 'context.toolbar';

export interface IToolBarOptions {
	orientation?: ActionsOrientation;
	actionViewItemProvider?: IActionViewItemProvider;
	ariaLabel?: string;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding | undefined;
	actionRunner?: IActionRunner;
	toggleMenuTitle?: string;
	anchorAlignmentProvider?: () => AnchorAlignment;
}

/**
 * A widget that combines an action bar for primary actions and a dropdown for secondary actions.
 */
export class ToolBar extends Disposable {
	private options: IToolBarOptions;
	private actionBar: ActionBar;
	private toggleMenuAction: ToggleMenuAction;
	private toggleMenuActionViewItem?: DropdownMenuActionViewItem;
	private hasSecondaryActions: boolean;
	private lookupKeybindings: boolean;

	constructor(container: HTMLElement, contextMenuProvider: IContextMenuProvider, options: IToolBarOptions = { orientation: ActionsOrientation.HORIZONTAL }) {
		super();

		this.options = options;
		this.lookupKeybindings = typeof this.options.getKeyBinding === 'function';

		this.toggleMenuAction = this._register(new ToggleMenuAction(() => this.toggleMenuActionViewItem && this.toggleMenuActionViewItem.show(), options.toggleMenuTitle));

		let element = document.createElement('div');
		element.className = 'monaco-toolbar';
		container.appendChild(element);

		this.actionBar = this._register(new ActionBar(element, {
			orientation: options.orientation,
			ariaLabel: options.ariaLabel,
			actionRunner: options.actionRunner,
			actionViewItemProvider: (action: Action) => {

				// Return special action item for the toggle menu action
				if (action.id === ToggleMenuAction.ID) {

					// Dispose old
					if (this.toggleMenuActionViewItem) {
						this.toggleMenuActionViewItem.dispose();
					}

					// Create new
					this.toggleMenuActionViewItem = new DropdownMenuActionViewItem(
						action,
						(<ToggleMenuAction>action).menuActions,
						contextMenuProvider,
						this.options.actionViewItemProvider,
						this.actionRunner,
						this.options.getKeyBinding,
						'toolbar-toggle-more',
						this.options.anchorAlignmentProvider
					);
					this.toggleMenuActionViewItem!.setActionContext(this.actionBar.context);

					return this.toggleMenuActionViewItem;
				}

				return options.actionViewItemProvider ? options.actionViewItemProvider(action) : undefined;
			}
		}));
	}

	set actionRunner(actionRunner: IActionRunner) {
		this.actionBar.actionRunner = actionRunner;
	}

	get actionRunner(): IActionRunner {
		return this.actionBar.actionRunner;
	}

	set context(context: any) {
		this.actionBar.context = context;
		if (this.toggleMenuActionViewItem) {
			this.toggleMenuActionViewItem.setActionContext(context);
		}
	}

	getContainer(): HTMLElement {
		return this.actionBar.getContainer();
	}

	getItemsWidth(): number {
		let itemsWidth = 0;
		for (let i = 0; i < this.actionBar.length(); i++) {
			itemsWidth += this.actionBar.getWidth(i);
		}
		return itemsWidth;
	}

	setAriaLabel(label: string): void {
		this.actionBar.setAriaLabel(label);
	}

	setActions(primaryActions: IAction[], secondaryActions?: IAction[]): () => void {
		return () => {
			let primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];

			// Inject additional action to open secondary actions if present
			this.hasSecondaryActions = !!(secondaryActions && secondaryActions.length > 0);
			if (this.hasSecondaryActions && secondaryActions) {
				this.toggleMenuAction.menuActions = secondaryActions.slice(0);
				primaryActionsToSet.push(this.toggleMenuAction);
			}

			this.actionBar.clear();

			primaryActionsToSet.forEach(action => {
				this.actionBar.push(action, { icon: true, label: false, keybinding: this.getKeybindingLabel(action) });
			});
		};
	}

	private getKeybindingLabel(action: IAction): string | undefined {
		const key = this.lookupKeybindings && this.options.getKeyBinding ? this.options.getKeyBinding(action) : undefined;

		return withNullAsUndefined(key && key.getLabel());
	}

	addPrimaryAction(primaryAction: IAction): () => void {
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

	dispose(): void {
		if (this.toggleMenuActionViewItem) {
			this.toggleMenuActionViewItem.dispose();
			this.toggleMenuActionViewItem = undefined;
		}

		super.dispose();
	}
}

class ToggleMenuAction extends Action {

	static readonly ID = 'toolbar.toggle.more';

	private _menuActions: IAction[];
	private toggleDropdownMenu: () => void;

	constructor(toggleDropdownMenu: () => void, title?: string) {
		title = title || nls.localize('moreActions', "More Actions...");
		super(ToggleMenuAction.ID, title, undefined, true);

		this.toggleDropdownMenu = toggleDropdownMenu;
	}

	run(): Promise<any> {
		this.toggleDropdownMenu();

		return Promise.resolve(true);
	}

	get menuActions() {
		return this._menuActions;
	}

	set menuActions(actions: IAction[]) {
		this._menuActions = actions;
	}
}