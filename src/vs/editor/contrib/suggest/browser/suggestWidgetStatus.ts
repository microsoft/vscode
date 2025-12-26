/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar, IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction } from '../../../../base/common/actions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { MenuEntryActionViewItem, TextOnlyMenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export interface ISuggestWidgetStatusOptions {
	readonly allowIcons?: boolean;
}

export class SuggestWidgetStatus {

	readonly element: HTMLElement;

	private readonly _leftActions: ActionBar;
	private readonly _rightActions: ActionBar;
	private readonly _menuDisposables = new DisposableStore();

	constructor(
		container: HTMLElement,
		private readonly _menuId: MenuId,
		options: ISuggestWidgetStatusOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService private _menuService: IMenuService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
	) {
		this.element = dom.append(container, dom.$('.suggest-status-bar'));

		const actionViewItemProvider = <IActionViewItemProvider>(action => {
			if (options.allowIcons) {
				return action instanceof MenuItemAction ? instantiationService.createInstance(MenuEntryActionViewItem, action, undefined) : undefined;
			} else {
				return action instanceof MenuItemAction ? instantiationService.createInstance(TextOnlyMenuEntryActionViewItem, action, { useComma: false }) : undefined;
			}
		});
		this._leftActions = new ActionBar(this.element, { actionViewItemProvider });
		this._rightActions = new ActionBar(this.element, { actionViewItemProvider });

		this._leftActions.domNode.classList.add('left');
		this._rightActions.domNode.classList.add('right');
	}

	dispose(): void {
		this._menuDisposables.dispose();
		this._leftActions.dispose();
		this._rightActions.dispose();
		this.element.remove();
	}

	show(): void {
		const menu = this._menuService.createMenu(this._menuId, this._contextKeyService);
		const renderMenu = () => {
			const left: IAction[] = [];
			const right: IAction[] = [];
			for (const [group, actions] of menu.getActions()) {
				if (group === 'left') {
					left.push(...actions);
				} else {
					right.push(...actions);
				}
			}
			this._leftActions.clear();
			this._leftActions.push(left);
			this._rightActions.clear();
			this._rightActions.push(right);
		};
		this._menuDisposables.add(menu.onDidChange(() => renderMenu()));
		this._menuDisposables.add(menu);
	}

	hide(): void {
		this._menuDisposables.clear();
	}
}
