/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./dropdown';
import { IAction, IActionRunner, IActionViewItemProvider } from 'vs/base/common/actions';
import { IDisposable } from 'vs/base/common/lifecycle';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { append, $, addClasses } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IActionProvider, DropdownMenu, IContextMenuProvider, IDropdownMenuOptions, ILabelRenderer } from 'vs/base/browser/ui/dropdown/dropdown';

export class DropdownMenuActionViewItem extends BaseActionViewItem {
	private menuActionsOrProvider: ReadonlyArray<IAction> | IActionProvider;
	private dropdownMenu: DropdownMenu | undefined;
	private contextMenuProvider: IContextMenuProvider;
	private actionViewItemProvider?: IActionViewItemProvider;
	private keybindings?: (action: IAction) => ResolvedKeybinding | undefined;
	private clazz: string | undefined;
	private anchorAlignmentProvider: (() => AnchorAlignment) | undefined;
	private menuAsChild?: boolean;

	private _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	constructor(action: IAction, menuActions: ReadonlyArray<IAction>, contextMenuProvider: IContextMenuProvider, actionViewItemProvider: IActionViewItemProvider | undefined, actionRunner: IActionRunner, keybindings: ((action: IAction) => ResolvedKeybinding | undefined) | undefined, clazz: string | undefined, anchorAlignmentProvider?: () => AnchorAlignment, menuAsChild?: boolean);
	constructor(action: IAction, actionProvider: IActionProvider, contextMenuProvider: IContextMenuProvider, actionViewItemProvider: IActionViewItemProvider | undefined, actionRunner: IActionRunner, keybindings: ((action: IAction) => ResolvedKeybinding) | undefined, clazz: string | undefined, anchorAlignmentProvider?: () => AnchorAlignment, menuAsChild?: boolean);
	constructor(action: IAction, menuActionsOrProvider: ReadonlyArray<IAction> | IActionProvider, contextMenuProvider: IContextMenuProvider, actionViewItemProvider: IActionViewItemProvider | undefined, actionRunner: IActionRunner, keybindings: ((action: IAction) => ResolvedKeybinding | undefined) | undefined, clazz: string | undefined, anchorAlignmentProvider?: () => AnchorAlignment, menuAsChild?: boolean) {
		super(null, action);

		this.menuActionsOrProvider = menuActionsOrProvider;
		this.contextMenuProvider = contextMenuProvider;
		this.actionViewItemProvider = actionViewItemProvider;
		this.actionRunner = actionRunner;
		this.keybindings = keybindings;
		this.clazz = clazz;
		this.anchorAlignmentProvider = anchorAlignmentProvider;
		this.menuAsChild = menuAsChild;
	}

	render(container: HTMLElement): void {
		const labelRenderer: ILabelRenderer = (el: HTMLElement): IDisposable | null => {
			this.element = append(el, $('a.action-label.codicon')); // todo@aeschli: remove codicon, should come through `this.clazz`
			if (this.clazz) {
				addClasses(this.element, this.clazz);
			}

			this.element.tabIndex = 0;
			this.element.setAttribute('role', 'button');
			this.element.setAttribute('aria-haspopup', 'true');
			this.element.setAttribute('aria-expanded', 'false');
			this.element.title = this._action.label || '';

			return null;
		};

		const options: IDropdownMenuOptions = {
			contextMenuProvider: this.contextMenuProvider,
			labelRenderer: labelRenderer,
			menuAsChild: this.menuAsChild
		};

		// Render the DropdownMenu around a simple action to toggle it
		if (Array.isArray(this.menuActionsOrProvider)) {
			options.actions = this.menuActionsOrProvider;
		} else {
			options.actionProvider = this.menuActionsOrProvider as IActionProvider;
		}

		this.dropdownMenu = this._register(new DropdownMenu(container, options));
		this._register(this.dropdownMenu.onDidChangeVisibility(visible => {
			this.element?.setAttribute('aria-expanded', `${visible}`);
			this._onDidChangeVisibility.fire(visible);
		}));

		this.dropdownMenu.menuOptions = {
			actionViewItemProvider: this.actionViewItemProvider,
			actionRunner: this.actionRunner,
			getKeyBinding: this.keybindings,
			context: this._context
		};

		if (this.anchorAlignmentProvider) {
			const that = this;

			this.dropdownMenu.menuOptions = {
				...this.dropdownMenu.menuOptions,
				get anchorAlignment(): AnchorAlignment {
					return that.anchorAlignmentProvider!();
				}
			};
		}
	}

	setActionContext(newContext: unknown): void {
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
		if (this.dropdownMenu) {
			this.dropdownMenu.show();
		}
	}
}
