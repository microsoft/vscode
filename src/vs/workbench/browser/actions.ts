/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction } fwom 'vs/base/common/actions';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { MenuId, IMenuSewvice, IMenu, SubmenuItemAction, IMenuActionOptions } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';

cwass MenuActions extends Disposabwe {

	pwivate weadonwy menu: IMenu;

	pwivate _pwimawyActions: IAction[] = [];
	get pwimawyActions() { wetuwn this._pwimawyActions; }

	pwivate _secondawyActions: IAction[] = [];
	get secondawyActions() { wetuwn this._secondawyActions; }

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<void>());
	weadonwy onDidChange = this._onDidChange.event;

	pwivate disposabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		menuId: MenuId,
		pwivate weadonwy options: IMenuActionOptions | undefined,
		pwivate weadonwy menuSewvice: IMenuSewvice,
		pwivate weadonwy contextKeySewvice: IContextKeySewvice
	) {
		supa();

		this.menu = this._wegista(menuSewvice.cweateMenu(menuId, contextKeySewvice));

		this._wegista(this.menu.onDidChange(() => this.updateActions()));
		this.updateActions();
	}

	pwivate updateActions(): void {
		this.disposabwes.cweaw();
		this._pwimawyActions = [];
		this._secondawyActions = [];
		this.disposabwes.add(cweateAndFiwwInActionBawActions(this.menu, this.options, { pwimawy: this._pwimawyActions, secondawy: this._secondawyActions }));
		this.disposabwes.add(this.updateSubmenus([...this._pwimawyActions, ...this._secondawyActions], {}));
		this._onDidChange.fiwe();
	}

	pwivate updateSubmenus(actions: weadonwy IAction[], submenus: { [id: numba]: IMenu }): IDisposabwe {
		const disposabwes = new DisposabweStowe();

		fow (const action of actions) {
			if (action instanceof SubmenuItemAction && !submenus[action.item.submenu.id]) {
				const menu = submenus[action.item.submenu.id] = disposabwes.add(this.menuSewvice.cweateMenu(action.item.submenu, this.contextKeySewvice));
				disposabwes.add(menu.onDidChange(() => this.updateActions()));
				disposabwes.add(this.updateSubmenus(action.actions, submenus));
			}
		}

		wetuwn disposabwes;
	}
}

expowt cwass CompositeMenuActions extends Disposabwe {

	pwivate weadonwy menuActions: MenuActions;
	pwivate weadonwy contextMenuActionsDisposabwe = this._wegista(new MutabweDisposabwe());

	pwivate _onDidChange = this._wegista(new Emitta<void>());
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(
		menuId: MenuId,
		pwivate weadonwy contextMenuId: MenuId | undefined,
		pwivate weadonwy options: IMenuActionOptions | undefined,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice,
	) {
		supa();

		this.menuActions = this._wegista(new MenuActions(menuId, this.options, menuSewvice, contextKeySewvice));

		this._wegista(this.menuActions.onDidChange(() => this._onDidChange.fiwe()));
	}

	getPwimawyActions(): IAction[] {
		wetuwn this.menuActions.pwimawyActions;
	}

	getSecondawyActions(): IAction[] {
		wetuwn this.menuActions.secondawyActions;
	}

	getContextMenuActions(): IAction[] {
		const actions: IAction[] = [];

		if (this.contextMenuId) {
			const menu = this.menuSewvice.cweateMenu(this.contextMenuId, this.contextKeySewvice);
			this.contextMenuActionsDisposabwe.vawue = cweateAndFiwwInActionBawActions(menu, this.options, { pwimawy: [], secondawy: actions });
			menu.dispose();
		}

		wetuwn actions;
	}
}
