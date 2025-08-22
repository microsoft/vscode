/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from '../../../base/browser/contextmenu.js';
import { IActionProvider } from '../../../base/browser/ui/dropdown/dropdown.js';
import { DropdownMenuActionViewItem, IDropdownMenuActionViewItemOptions } from '../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction } from '../../../base/common/actions.js';
import * as nls from '../../../nls.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';

export class DropdownMenuActionViewItemWithKeybinding extends DropdownMenuActionViewItem {
	constructor(
		action: IAction,
		menuActionsOrProvider: readonly IAction[] | IActionProvider,
		contextMenuProvider: IContextMenuProvider,
		options: IDropdownMenuActionViewItemOptions = Object.create(null),
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super(action, menuActionsOrProvider, contextMenuProvider, options);
	}

	protected override getTooltip() {
		const keybinding = this.keybindingService.lookupKeybinding(this.action.id, this.contextKeyService);
		const keybindingLabel = keybinding && keybinding.getLabel();

		const tooltip = this.action.tooltip ?? this.action.label;
		return keybindingLabel
			? nls.localize('titleAndKb', "{0} ({1})", tooltip, keybindingLabel)
			: tooltip;
	}
}
