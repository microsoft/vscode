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
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class CodiconActionViewItem extends MenuEntryActionViewItem {
	constructor(
		_action: MenuItemAction,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
	) {
		super(_action, undefined, keybindingService, notificationService, contextKeyService, themeService);
	}
	override updateLabel(): void {
		if (this.options.label && this.label) {
			DOM.reset(this.label, ...renderLabelWithIcons(this._commandAction.label ?? ''));
		}
	}
}

export class ActionViewWithLabel extends MenuEntryActionViewItem {
	private _actionLabel?: HTMLAnchorElement;

	constructor(
		_action: MenuItemAction,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
	) {
		super(_action, undefined, keybindingService, notificationService, contextKeyService, themeService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('notebook-action-view-item');
		this._actionLabel = document.createElement('a');
		container.appendChild(this._actionLabel);
		this.updateLabel();
	}

	override updateLabel() {
		if (this._actionLabel) {
			this._actionLabel.classList.add('notebook-label');
			this._actionLabel.innerText = this._action.label;
			this._actionLabel.title = this._action.tooltip.length ? this._action.tooltip : this._action.label;
		}
	}
}
