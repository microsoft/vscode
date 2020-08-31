/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderCodicons } from 'vs/base/common/codicons';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class CodiconActionViewItem extends MenuEntryActionViewItem {
	constructor(
		readonly _action: MenuItemAction,
		keybindingService: IKeybindingService,
		notificationService: INotificationService,
		contextMenuService: IContextMenuService
	) {
		super(_action, keybindingService, notificationService, contextMenuService);
	}
	updateLabel(): void {
		if (this.options.label && this.label) {
			this.label.innerHTML = renderCodicons(this._commandAction.label ?? '');
		}
	}
}
