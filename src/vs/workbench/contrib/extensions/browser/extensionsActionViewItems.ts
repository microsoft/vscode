/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from 'vs/base/browser/contextmenu';
import { ActionWithDropdownActionViewItem, IActionWithDropdownActionViewItemOptions } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { ActionWithDropDownAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';

export class ExtensionActionWithDropdownActionViewItem extends ActionWithDropdownActionViewItem {

	constructor(
		action: ActionWithDropDownAction,
		options: IActionWithDropdownActionViewItemOptions,
		contextMenuProvider: IContextMenuProvider
	) {
		super(null, action, options, contextMenuProvider);
	}

	render(container: HTMLElement): void {
		super.render(container);
		this.updateClass();
	}

	updateClass(): void {
		super.updateClass();
		if (this.dropdownMenuActionViewItem && this.dropdownMenuActionViewItem.element) {
			this.dropdownMenuActionViewItem.element.classList.toggle('hide', (<ActionWithDropDownAction>this._action).menuActions.length === 0);
		}
	}

}
