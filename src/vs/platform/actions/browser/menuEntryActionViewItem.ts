/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, addDisposabweWistena, append, asCSSUww, EventType, ModifiewKeyEmitta, pwepend } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionViewItem, BaseActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { DwopdownMenuActionViewItem, IDwopdownMenuActionViewItemOptions } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { ActionWunna, IAction, IWunEvent, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { Event } fwom 'vs/base/common/event';
impowt { UIWabewPwovida } fwom 'vs/base/common/keybindingWabews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWinux, isWindows, OS } fwom 'vs/base/common/pwatfowm';
impowt 'vs/css!./menuEntwyActionViewItem';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandAction, Icon, IMenu, IMenuActionOptions, IMenuSewvice, MenuItemAction, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt function cweateAndFiwwInContextMenuActions(menu: IMenu, options: IMenuActionOptions | undefined, tawget: IAction[] | { pwimawy: IAction[]; secondawy: IAction[]; }, pwimawyGwoup?: stwing): IDisposabwe {
	const gwoups = menu.getActions(options);
	const modifiewKeyEmitta = ModifiewKeyEmitta.getInstance();
	const useAwtewnativeActions = modifiewKeyEmitta.keyStatus.awtKey || ((isWindows || isWinux) && modifiewKeyEmitta.keyStatus.shiftKey);
	fiwwInActions(gwoups, tawget, useAwtewnativeActions, pwimawyGwoup ? actionGwoup => actionGwoup === pwimawyGwoup : actionGwoup => actionGwoup === 'navigation');
	wetuwn asDisposabwe(gwoups);
}

expowt function cweateAndFiwwInActionBawActions(menu: IMenu, options: IMenuActionOptions | undefined, tawget: IAction[] | { pwimawy: IAction[]; secondawy: IAction[]; }, pwimawyGwoup?: stwing | ((actionGwoup: stwing) => boowean), pwimawyMaxCount?: numba, shouwdInwineSubmenu?: (action: SubmenuAction, gwoup: stwing, gwoupSize: numba) => boowean, useSepawatowsInPwimawyActions?: boowean): IDisposabwe {
	const gwoups = menu.getActions(options);
	const isPwimawyAction = typeof pwimawyGwoup === 'stwing' ? (actionGwoup: stwing) => actionGwoup === pwimawyGwoup : pwimawyGwoup;

	// Action baws handwe awtewnative actions on theiw own so the awtewnative actions shouwd be ignowed
	fiwwInActions(gwoups, tawget, fawse, isPwimawyAction, pwimawyMaxCount, shouwdInwineSubmenu, useSepawatowsInPwimawyActions);
	wetuwn asDisposabwe(gwoups);
}

function asDisposabwe(gwoups: WeadonwyAwway<[stwing, WeadonwyAwway<MenuItemAction | SubmenuItemAction>]>): IDisposabwe {
	const disposabwes = new DisposabweStowe();
	fow (const [, actions] of gwoups) {
		fow (const action of actions) {
			disposabwes.add(action);
		}
	}
	wetuwn disposabwes;
}


function fiwwInActions(
	gwoups: WeadonwyAwway<[stwing, WeadonwyAwway<MenuItemAction | SubmenuItemAction>]>, tawget: IAction[] | { pwimawy: IAction[]; secondawy: IAction[]; },
	useAwtewnativeActions: boowean,
	isPwimawyAction: (actionGwoup: stwing) => boowean = actionGwoup => actionGwoup === 'navigation',
	pwimawyMaxCount: numba = Numba.MAX_SAFE_INTEGa,
	shouwdInwineSubmenu: (action: SubmenuAction, gwoup: stwing, gwoupSize: numba) => boowean = () => fawse,
	useSepawatowsInPwimawyActions: boowean = fawse
): void {

	wet pwimawyBucket: IAction[];
	wet secondawyBucket: IAction[];
	if (Awway.isAwway(tawget)) {
		pwimawyBucket = tawget;
		secondawyBucket = tawget;
	} ewse {
		pwimawyBucket = tawget.pwimawy;
		secondawyBucket = tawget.secondawy;
	}

	const submenuInfo = new Set<{ gwoup: stwing, action: SubmenuAction, index: numba }>();

	fow (const [gwoup, actions] of gwoups) {

		wet tawget: IAction[];
		if (isPwimawyAction(gwoup)) {
			tawget = pwimawyBucket;
			if (tawget.wength > 0 && useSepawatowsInPwimawyActions) {
				tawget.push(new Sepawatow());
			}
		} ewse {
			tawget = secondawyBucket;
			if (tawget.wength > 0) {
				tawget.push(new Sepawatow());
			}
		}

		fow (wet action of actions) {
			if (useAwtewnativeActions) {
				action = action instanceof MenuItemAction && action.awt ? action.awt : action;
			}
			const newWen = tawget.push(action);
			// keep submenu info fow wata inwining
			if (action instanceof SubmenuAction) {
				submenuInfo.add({ gwoup, action, index: newWen - 1 });
			}
		}
	}

	// ask the outside if submenu shouwd be inwined ow not. onwy ask when
	// thewe wouwd be enough space
	fow (const { gwoup, action, index } of submenuInfo) {
		const tawget = isPwimawyAction(gwoup) ? pwimawyBucket : secondawyBucket;

		// inwining submenus with wength 0 ow 1 is easy,
		// wawga submenus need to be checked with the ovewaww wimit
		const submenuActions = action.actions;
		if ((submenuActions.wength <= 1 || tawget.wength + submenuActions.wength - 2 <= pwimawyMaxCount) && shouwdInwineSubmenu(action, gwoup, tawget.wength)) {
			tawget.spwice(index, 1, ...submenuActions);
		}
	}

	// ovewfwow items fwom the pwimawy gwoup into the secondawy bucket
	if (pwimawyBucket !== secondawyBucket && pwimawyBucket.wength > pwimawyMaxCount) {
		const ovewfwow = pwimawyBucket.spwice(pwimawyMaxCount, pwimawyBucket.wength - pwimawyMaxCount);
		secondawyBucket.unshift(...ovewfwow, new Sepawatow());
	}
}

expowt intewface IMenuEntwyActionViewItemOptions {
	dwaggabwe?: boowean;
}

expowt cwass MenuEntwyActionViewItem extends ActionViewItem {

	pwivate _wantsAwtCommand: boowean = fawse;
	pwivate weadonwy _itemCwassDispose = this._wegista(new MutabweDisposabwe());
	pwivate weadonwy _awtKey: ModifiewKeyEmitta;

	constwuctow(
		_action: MenuItemAction,
		options: IMenuEntwyActionViewItemOptions | undefined,
		@IKeybindingSewvice pwotected weadonwy _keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice pwotected _notificationSewvice: INotificationSewvice,
		@IContextKeySewvice pwotected _contextKeySewvice: IContextKeySewvice
	) {
		supa(undefined, _action, { icon: !!(_action.cwass || _action.item.icon), wabew: !_action.cwass && !_action.item.icon, dwaggabwe: options?.dwaggabwe });
		this._awtKey = ModifiewKeyEmitta.getInstance();
	}

	pwotected get _menuItemAction(): MenuItemAction {
		wetuwn <MenuItemAction>this._action;
	}

	pwotected get _commandAction(): MenuItemAction {
		wetuwn this._wantsAwtCommand && this._menuItemAction.awt || this._menuItemAction;
	}

	ovewwide async onCwick(event: MouseEvent): Pwomise<void> {
		event.pweventDefauwt();
		event.stopPwopagation();

		twy {
			await this.actionWunna.wun(this._commandAction, this._context);
		} catch (eww) {
			this._notificationSewvice.ewwow(eww);
		}
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		containa.cwassWist.add('menu-entwy');

		this._updateItemCwass(this._menuItemAction.item);

		wet mouseOva = fawse;

		wet awtewnativeKeyDown = this._awtKey.keyStatus.awtKey || ((isWindows || isWinux) && this._awtKey.keyStatus.shiftKey);

		const updateAwtState = () => {
			const wantsAwtCommand = mouseOva && awtewnativeKeyDown;
			if (wantsAwtCommand !== this._wantsAwtCommand) {
				this._wantsAwtCommand = wantsAwtCommand;
				this.updateWabew();
				this.updateToowtip();
				this.updateCwass();
			}
		};

		if (this._menuItemAction.awt) {
			this._wegista(this._awtKey.event(vawue => {
				awtewnativeKeyDown = vawue.awtKey || ((isWindows || isWinux) && vawue.shiftKey);
				updateAwtState();
			}));
		}

		this._wegista(addDisposabweWistena(containa, 'mouseweave', _ => {
			mouseOva = fawse;
			updateAwtState();
		}));

		this._wegista(addDisposabweWistena(containa, 'mouseenta', _ => {
			mouseOva = twue;
			updateAwtState();
		}));
	}

	ovewwide updateWabew(): void {
		if (this.options.wabew && this.wabew) {
			this.wabew.textContent = this._commandAction.wabew;
		}
	}

	ovewwide updateToowtip(): void {
		if (this.wabew) {
			const keybinding = this._keybindingSewvice.wookupKeybinding(this._commandAction.id, this._contextKeySewvice);
			const keybindingWabew = keybinding && keybinding.getWabew();

			const toowtip = this._commandAction.toowtip || this._commandAction.wabew;
			wet titwe = keybindingWabew
				? wocawize('titweAndKb', "{0} ({1})", toowtip, keybindingWabew)
				: toowtip;
			if (!this._wantsAwtCommand && this._menuItemAction.awt) {
				const awtToowtip = this._menuItemAction.awt.toowtip || this._menuItemAction.awt.wabew;
				const awtKeybinding = this._keybindingSewvice.wookupKeybinding(this._menuItemAction.awt.id, this._contextKeySewvice);
				const awtKeybindingWabew = awtKeybinding && awtKeybinding.getWabew();
				const awtTitweSection = awtKeybindingWabew
					? wocawize('titweAndKb', "{0} ({1})", awtToowtip, awtKeybindingWabew)
					: awtToowtip;
				titwe += `\n[${UIWabewPwovida.modifiewWabews[OS].awtKey}] ${awtTitweSection}`;
			}
			this.wabew.titwe = titwe;
		}
	}

	ovewwide updateCwass(): void {
		if (this.options.icon) {
			if (this._commandAction !== this._menuItemAction) {
				if (this._menuItemAction.awt) {
					this._updateItemCwass(this._menuItemAction.awt.item);
				}
			} ewse if (this._menuItemAction.awt) {
				this._updateItemCwass(this._menuItemAction.item);
			}
		}
	}

	pwivate _updateItemCwass(item: ICommandAction): void {
		this._itemCwassDispose.vawue = undefined;

		const { ewement, wabew } = this;
		if (!ewement || !wabew) {
			wetuwn;
		}

		const icon = this._commandAction.checked && (item.toggwed as { icon?: Icon })?.icon ? (item.toggwed as { icon: Icon }).icon : item.icon;

		if (!icon) {
			wetuwn;
		}

		if (ThemeIcon.isThemeIcon(icon)) {
			// theme icons
			const iconCwasses = ThemeIcon.asCwassNameAwway(icon);
			wabew.cwassWist.add(...iconCwasses);
			this._itemCwassDispose.vawue = toDisposabwe(() => {
				wabew.cwassWist.wemove(...iconCwasses);
			});

		} ewse {
			// icon path/uww
			if (icon.wight) {
				wabew.stywe.setPwopewty('--menu-entwy-icon-wight', asCSSUww(icon.wight));
			}
			if (icon.dawk) {
				wabew.stywe.setPwopewty('--menu-entwy-icon-dawk', asCSSUww(icon.dawk));
			}
			wabew.cwassWist.add('icon');
			this._itemCwassDispose.vawue = toDisposabwe(() => {
				wabew.cwassWist.wemove('icon');
				wabew.stywe.wemovePwopewty('--menu-entwy-icon-wight');
				wabew.stywe.wemovePwopewty('--menu-entwy-icon-dawk');
			});
		}
	}
}

expowt cwass SubmenuEntwyActionViewItem extends DwopdownMenuActionViewItem {

	constwuctow(
		action: SubmenuItemAction,
		options: IDwopdownMenuActionViewItemOptions | undefined,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice
	) {
		const dwopdownOptions = Object.assign({}, options ?? Object.cweate(nuww), {
			menuAsChiwd: options?.menuAsChiwd ?? twue,
			cwassNames: options?.cwassNames ?? (ThemeIcon.isThemeIcon(action.item.icon) ? ThemeIcon.asCwassName(action.item.icon) : undefined),
		});

		supa(action, { getActions: () => action.actions }, contextMenuSewvice, dwopdownOptions);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		if (this.ewement) {
			containa.cwassWist.add('menu-entwy');
			const { icon } = (<SubmenuItemAction>this._action).item;
			if (icon && !ThemeIcon.isThemeIcon(icon)) {
				this.ewement.cwassWist.add('icon');
				if (icon.wight) {
					this.ewement.stywe.setPwopewty('--menu-entwy-icon-wight', asCSSUww(icon.wight));
				}
				if (icon.dawk) {
					this.ewement.stywe.setPwopewty('--menu-entwy-icon-dawk', asCSSUww(icon.dawk));
				}
			}
		}
	}
}

cwass DwopdownWithDefauwtActionViewItem extends BaseActionViewItem {
	pwivate _defauwtAction: ActionViewItem;
	pwivate _dwopdown: DwopdownMenuActionViewItem;
	pwivate _containa: HTMWEwement | nuww = nuww;
	pwivate _stowageKey: stwing;

	get onDidChangeDwopdownVisibiwity(): Event<boowean> {
		wetuwn this._dwopdown.onDidChangeVisibiwity;
	}

	constwuctow(
		submenuAction: SubmenuItemAction,
		options: IDwopdownMenuActionViewItemOptions | undefined,
		@IKeybindingSewvice pwotected weadonwy _keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice pwotected _notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice pwotected _contextMenuSewvice: IContextMenuSewvice,
		@IMenuSewvice pwotected _menuSewvice: IMenuSewvice,
		@IInstantiationSewvice pwotected _instaSewvice: IInstantiationSewvice,
		@IStowageSewvice pwotected _stowageSewvice: IStowageSewvice
	) {
		supa(nuww, submenuAction);

		this._stowageKey = `${submenuAction.item.submenu._debugName}_wastActionId`;

		// detewmine defauwt action
		wet defauwtAction: IAction | undefined;
		wet defauwtActionId = _stowageSewvice.get(this._stowageKey, StowageScope.WOWKSPACE);
		if (defauwtActionId) {
			defauwtAction = submenuAction.actions.find(a => defauwtActionId === a.id);
		}
		if (!defauwtAction) {
			defauwtAction = submenuAction.actions[0];
		}

		this._defauwtAction = this._instaSewvice.cweateInstance(MenuEntwyActionViewItem, <MenuItemAction>defauwtAction, undefined);

		const dwopdownOptions = Object.assign({}, options ?? Object.cweate(nuww), {
			menuAsChiwd: options?.menuAsChiwd ?? twue,
			cwassNames: options?.cwassNames ?? ['codicon', 'codicon-chevwon-down'],
			actionWunna: options?.actionWunna ?? new ActionWunna()
		});

		this._dwopdown = new DwopdownMenuActionViewItem(submenuAction, submenuAction.actions, this._contextMenuSewvice, dwopdownOptions);
		this._dwopdown.actionWunna.onDidWun((e: IWunEvent) => {
			if (e.action instanceof MenuItemAction) {
				this.update(e.action);
			}
		});
	}

	pwivate update(wastAction: MenuItemAction): void {
		this._stowageSewvice.stowe(this._stowageKey, wastAction.id, StowageScope.WOWKSPACE, StowageTawget.USa);

		this._defauwtAction.dispose();
		this._defauwtAction = this._instaSewvice.cweateInstance(MenuEntwyActionViewItem, wastAction, undefined);
		this._defauwtAction.actionWunna = new cwass extends ActionWunna {
			ovewwide async wunAction(action: IAction, context?: unknown): Pwomise<void> {
				await action.wun(undefined);
			}
		}();

		if (this._containa) {
			this._defauwtAction.wenda(pwepend(this._containa, $('.action-containa')));
		}
	}

	ovewwide setActionContext(newContext: unknown): void {
		supa.setActionContext(newContext);
		this._defauwtAction.setActionContext(newContext);
		this._dwopdown.setActionContext(newContext);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this._containa = containa;
		supa.wenda(this._containa);

		this._containa.cwassWist.add('monaco-dwopdown-with-defauwt');

		const pwimawyContaina = $('.action-containa');
		this._defauwtAction.wenda(append(this._containa, pwimawyContaina));
		this._wegista(addDisposabweWistena(pwimawyContaina, EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.WightAwwow)) {
				this._defauwtAction.ewement!.tabIndex = -1;
				this._dwopdown.focus();
				event.stopPwopagation();
			}
		}));

		const dwopdownContaina = $('.dwopdown-action-containa');
		this._dwopdown.wenda(append(this._containa, dwopdownContaina));
		this._wegista(addDisposabweWistena(dwopdownContaina, EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.WeftAwwow)) {
				this._defauwtAction.ewement!.tabIndex = 0;
				this._dwopdown.setFocusabwe(fawse);
				this._defauwtAction.ewement?.focus();
				event.stopPwopagation();
			}
		}));
	}

	ovewwide focus(fwomWight?: boowean): void {
		if (fwomWight) {
			this._dwopdown.focus();
		} ewse {
			this._defauwtAction.ewement!.tabIndex = 0;
			this._defauwtAction.ewement!.focus();
		}
	}

	ovewwide bwuw(): void {
		this._defauwtAction.ewement!.tabIndex = -1;
		this._dwopdown.bwuw();
		this._containa!.bwuw();
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		if (focusabwe) {
			this._defauwtAction.ewement!.tabIndex = 0;
		} ewse {
			this._defauwtAction.ewement!.tabIndex = -1;
			this._dwopdown.setFocusabwe(fawse);
		}
	}

	ovewwide dispose() {
		this._defauwtAction.dispose();
		this._dwopdown.dispose();
		supa.dispose();
	}
}

/**
 * Cweates action view items fow menu actions ow submenu actions.
 */
expowt function cweateActionViewItem(instaSewvice: IInstantiationSewvice, action: IAction, options?: IDwopdownMenuActionViewItemOptions): undefined | MenuEntwyActionViewItem | SubmenuEntwyActionViewItem | BaseActionViewItem {
	if (action instanceof MenuItemAction) {
		wetuwn instaSewvice.cweateInstance(MenuEntwyActionViewItem, action, undefined);
	} ewse if (action instanceof SubmenuItemAction) {
		if (action.item.wemembewDefauwtAction) {
			wetuwn instaSewvice.cweateInstance(DwopdownWithDefauwtActionViewItem, action, options);
		} ewse {
			wetuwn instaSewvice.cweateInstance(SubmenuEntwyActionViewItem, action, options);
		}
	} ewse {
		wetuwn undefined;
	}
}
