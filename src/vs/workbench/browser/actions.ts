/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../base/common/actions.js';
import { Disposable, DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { Emitter, Event } from '../../base/common/event.js';
import { MenuId, IMenuService, IMenu, SubmenuItemAction, IMenuActionOptions } from '../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { getActionBarActions } from '../../platform/actions/browser/menuEntryActionViewItem.js';

class MenuActions extends Disposable {

	private readonly menu: IMenu;

	private _primaryActions: IAction[] = [];
	get primaryActions() { return this._primaryActions; }

	private _secondaryActions: IAction[] = [];
	get secondaryActions() { return this._secondaryActions; }

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly disposables = this._register(new DisposableStore());

	constructor(
		menuId: MenuId,
		private readonly options: IMenuActionOptions | undefined,
		private readonly menuService: IMenuService,
		private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.menu = this._register(menuService.createMenu(menuId, contextKeyService));

		this._register(this.menu.onDidChange(() => this.updateActions()));
		this.updateActions();
	}

	private updateActions(): void {
		this.disposables.clear();
		const newActions = getActionBarActions(this.menu.getActions(this.options));
		this._primaryActions = newActions.primary;
		this._secondaryActions = newActions.secondary;
		this.disposables.add(this.updateSubmenus([...this._primaryActions, ...this._secondaryActions], {}));
		this._onDidChange.fire();
	}

	private updateSubmenus(actions: readonly IAction[], submenus: Record<string, IMenu>): IDisposable {
		const disposables = new DisposableStore();

		for (const action of actions) {
			if (action instanceof SubmenuItemAction && !submenus[action.item.submenu.id]) {
				const menu = submenus[action.item.submenu.id] = disposables.add(this.menuService.createMenu(action.item.submenu, this.contextKeyService));
				disposables.add(menu.onDidChange(() => this.updateActions()));
				disposables.add(this.updateSubmenus(action.actions, submenus));
			}
		}

		return disposables;
	}
}

export class CompositeMenuActions extends Disposable {

	private readonly menuActions: MenuActions;

	private _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		readonly menuId: MenuId,
		private readonly contextMenuId: MenuId | undefined,
		private readonly options: IMenuActionOptions | undefined,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();

		this.menuActions = this._register(new MenuActions(menuId, this.options, menuService, contextKeyService));

		this._register(this.menuActions.onDidChange(() => this._onDidChange.fire()));
	}

	getPrimaryActions(): IAction[] {
		return this.menuActions.primaryActions;
	}

	getSecondaryActions(): IAction[] {
		return this.menuActions.secondaryActions;
	}

	getContextMenuActions(): IAction[] {
		if (this.contextMenuId) {
			const menu = this.menuService.getMenuActions(this.contextMenuId, this.contextKeyService, this.options);
			return getActionBarActions(menu).secondary;
		}

		return [];
	}
}
