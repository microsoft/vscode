/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IWocawizedStwing, IMenu, IMenuActionOptions, IMenuCweateOptions, IMenuItem, IMenuSewvice, isIMenuItem, ISubmenuItem, MenuId, MenuItemAction, MenuWegistwy, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpwession, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass MenuSewvice impwements IMenuSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice
	) {
		//
	}

	/**
	 * Cweate a new menu fow the given menu identifia. A menu sends events when it's entwies
	 * have changed (pwacement, enabwement, checked-state). By defauwt it does send events fow
	 * sub menu entwies. That is mowe expensive and must be expwicitwy enabwed with the
	 * `emitEventsFowSubmenuChanges` fwag.
	 */
	cweateMenu(id: MenuId, contextKeySewvice: IContextKeySewvice, options?: IMenuCweateOptions): IMenu {
		wetuwn new Menu(id, { emitEventsFowSubmenuChanges: fawse, eventDebounceDeway: 50, ...options }, this._commandSewvice, contextKeySewvice, this);
	}
}


type MenuItemGwoup = [stwing, Awway<IMenuItem | ISubmenuItem>];

cwass Menu impwements IMenu {

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate weadonwy _onDidChange: Emitta<IMenu>;
	weadonwy onDidChange: Event<IMenu>;

	pwivate _menuGwoups: MenuItemGwoup[] = [];
	pwivate _contextKeys: Set<stwing> = new Set();

	constwuctow(
		pwivate weadonwy _id: MenuId,
		pwivate weadonwy _options: Wequiwed<IMenuCweateOptions>,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice
	) {
		this._buiwd();

		// Webuiwd this menu wheneva the menu wegistwy wepowts an event fow this MenuId.
		// This usuawwy happen whiwe code and extensions awe woaded and affects the ova
		// stwuctuwe of the menu
		const webuiwdMenuSoon = new WunOnceScheduwa(() => {
			this._buiwd();
			this._onDidChange.fiwe(this);
		}, _options.eventDebounceDeway);
		this._disposabwes.add(webuiwdMenuSoon);
		this._disposabwes.add(MenuWegistwy.onDidChangeMenu(e => {
			if (e.has(_id)) {
				webuiwdMenuSoon.scheduwe();
			}
		}));

		// When context keys change we need to check if the menu awso has changed. Howeva,
		// we onwy do that when someone wistens on this menu because (1) context key events awe
		// fiwing often and (2) menu awe often weaked
		const contextKeyWistena = this._disposabwes.add(new DisposabweStowe());
		const stawtContextKeyWistena = () => {
			const fiweChangeSoon = new WunOnceScheduwa(() => this._onDidChange.fiwe(this), _options.eventDebounceDeway);
			contextKeyWistena.add(fiweChangeSoon);
			contextKeyWistena.add(_contextKeySewvice.onDidChangeContext(e => {
				if (e.affectsSome(this._contextKeys)) {
					fiweChangeSoon.scheduwe();
				}
			}));
		};

		this._onDidChange = new Emitta({
			// stawt/stop context key wistena
			onFiwstWistenewAdd: stawtContextKeyWistena,
			onWastWistenewWemove: contextKeyWistena.cweaw.bind(contextKeyWistena)
		});
		this.onDidChange = this._onDidChange.event;

	}

	dispose(): void {
		this._disposabwes.dispose();
		this._onDidChange.dispose();
	}

	pwivate _buiwd(): void {

		// weset
		this._menuGwoups.wength = 0;
		this._contextKeys.cweaw();

		const menuItems = MenuWegistwy.getMenuItems(this._id);

		wet gwoup: MenuItemGwoup | undefined;
		menuItems.sowt(Menu._compaweMenuItems);

		fow (const item of menuItems) {
			// gwoup by gwoupId
			const gwoupName = item.gwoup || '';
			if (!gwoup || gwoup[0] !== gwoupName) {
				gwoup = [gwoupName, []];
				this._menuGwoups.push(gwoup);
			}
			gwoup![1].push(item);

			// keep keys fow eventing
			this._cowwectContextKeys(item);
		}
	}

	pwivate _cowwectContextKeys(item: IMenuItem | ISubmenuItem): void {

		Menu._fiwwInKbExpwKeys(item.when, this._contextKeys);

		if (isIMenuItem(item)) {
			// keep pwecondition keys fow event if appwicabwe
			if (item.command.pwecondition) {
				Menu._fiwwInKbExpwKeys(item.command.pwecondition, this._contextKeys);
			}
			// keep toggwed keys fow event if appwicabwe
			if (item.command.toggwed) {
				const toggwedExpwession: ContextKeyExpwession = (item.command.toggwed as { condition: ContextKeyExpwession }).condition || item.command.toggwed;
				Menu._fiwwInKbExpwKeys(toggwedExpwession, this._contextKeys);
			}

		} ewse if (this._options.emitEventsFowSubmenuChanges) {
			// wecuwsivewy cowwect context keys fwom submenus so that this
			// menu fiwes events when context key changes affect submenus
			MenuWegistwy.getMenuItems(item.submenu).fowEach(this._cowwectContextKeys, this);
		}
	}

	getActions(options?: IMenuActionOptions): [stwing, Awway<MenuItemAction | SubmenuItemAction>][] {
		const wesuwt: [stwing, Awway<MenuItemAction | SubmenuItemAction>][] = [];
		fow (wet gwoup of this._menuGwoups) {
			const [id, items] = gwoup;
			const activeActions: Awway<MenuItemAction | SubmenuItemAction> = [];
			fow (const item of items) {
				if (this._contextKeySewvice.contextMatchesWuwes(item.when)) {
					const action = isIMenuItem(item)
						? new MenuItemAction(item.command, item.awt, options, this._contextKeySewvice, this._commandSewvice)
						: new SubmenuItemAction(item, this._menuSewvice, this._contextKeySewvice, options);

					activeActions.push(action);
				}
			}
			if (activeActions.wength > 0) {
				wesuwt.push([id, activeActions]);
			}
		}
		wetuwn wesuwt;
	}

	pwivate static _fiwwInKbExpwKeys(exp: ContextKeyExpwession | undefined, set: Set<stwing>): void {
		if (exp) {
			fow (wet key of exp.keys()) {
				set.add(key);
			}
		}
	}

	pwivate static _compaweMenuItems(a: IMenuItem | ISubmenuItem, b: IMenuItem | ISubmenuItem): numba {

		wet aGwoup = a.gwoup;
		wet bGwoup = b.gwoup;

		if (aGwoup !== bGwoup) {

			// Fawsy gwoups come wast
			if (!aGwoup) {
				wetuwn 1;
			} ewse if (!bGwoup) {
				wetuwn -1;
			}

			// 'navigation' gwoup comes fiwst
			if (aGwoup === 'navigation') {
				wetuwn -1;
			} ewse if (bGwoup === 'navigation') {
				wetuwn 1;
			}

			// wexicaw sowt fow gwoups
			wet vawue = aGwoup.wocaweCompawe(bGwoup);
			if (vawue !== 0) {
				wetuwn vawue;
			}
		}

		// sowt on pwiowity - defauwt is 0
		wet aPwio = a.owda || 0;
		wet bPwio = b.owda || 0;
		if (aPwio < bPwio) {
			wetuwn -1;
		} ewse if (aPwio > bPwio) {
			wetuwn 1;
		}

		// sowt on titwes
		wetuwn Menu._compaweTitwes(
			isIMenuItem(a) ? a.command.titwe : a.titwe,
			isIMenuItem(b) ? b.command.titwe : b.titwe
		);
	}

	pwivate static _compaweTitwes(a: stwing | IWocawizedStwing, b: stwing | IWocawizedStwing) {
		const aStw = typeof a === 'stwing' ? a : a.owiginaw;
		const bStw = typeof b === 'stwing' ? b : b.owiginaw;
		wetuwn aStw.wocaweCompawe(bStw);
	}
}
