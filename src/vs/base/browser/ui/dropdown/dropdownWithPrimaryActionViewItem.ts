/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from 'vs/base/browser/contextmenu';
import { ActionViewItem, BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { IAction } from 'vs/base/common/actions';
import * as DOM from 'vs/base/browser/dom';

export class DropdownWithPrimaryActionViewItem extends BaseActionViewItem {
	private _primaryAction: ActionViewItem;
	private _dropdown: DropdownMenuActionViewItem;
	private _container: HTMLElement | null = null;

	constructor(
		primaryAction: IAction,
		dropdownAction: IAction,
		dropdownMenuActions: IAction[],
		private readonly _className: string,
		private readonly _contextMenuProvider: IContextMenuProvider,
		dropdownIcon?: string
	) {
		super(null, primaryAction);
		this._primaryAction = new ActionViewItem(undefined, primaryAction, {
			icon: true,
			label: false
		});
		this._dropdown = new DropdownMenuActionViewItem(dropdownAction, dropdownMenuActions, this._contextMenuProvider, {
			menuAsChild: true
		});
	}

	override render(container: HTMLElement): void {
		this._container = container;
		super.render(this._container);
		this.element = DOM.append(this._container, DOM.$(''));
		this.element.className = this._className;
		this.element.classList.add('monaco-dropdown-with-primary');
		this._primaryAction.render(this.element);
		this._dropdown.render(this.element);
	}

	update(dropdownAction: IAction, dropdownMenuActions: IAction[], dropdownIcon?: string): void {
		this._dropdown?.dispose();
		this._dropdown = new DropdownMenuActionViewItem(dropdownAction, dropdownMenuActions, this._contextMenuProvider, {
			menuAsChild: true,
			classNames: ['codicon', dropdownIcon || 'codicon-chevron-down']
		});
		if (this.element) {
			this._dropdown.render(this.element);
		}
	}
}
