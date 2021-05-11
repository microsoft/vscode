/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import * as DOM from 'vs/base/browser/dom';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class CodiconActionViewItem extends MenuEntryActionViewItem {
	constructor(
		_action: MenuItemAction,
		keybindingService: IKeybindingService,
		notificationService: INotificationService,
	) {
		super(_action, keybindingService, notificationService);
	}
	override updateLabel(): void {
		if (this.options.label && this.label) {
			DOM.reset(this.label, ...renderLabelWithIcons(this._commandAction.label ?? ''));
		}
	}
}
