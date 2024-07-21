/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { MenuId, IMenuService, IMenu, SubmenuItemAction, IMenuActionOptions } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';

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
		this._primaryActions = [];
		this._secondaryActions = [];
		createAndFillInActionBarActions(this.menu, this.options, { primary: this._primaryActions, secondary: this._secondaryActions });
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
		const actions: IAction[] = [];

		if (this.contextMenuId) {
			const menu = this.menuService.getMenuActions(this.contextMenuId, this.contextKeyService, this.options);
			createAndFillInActionBarActions(menu, { primary: [], secondary: actions });
		}

		return actions;
	}
}
