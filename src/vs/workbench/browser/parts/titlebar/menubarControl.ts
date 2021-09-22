/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IMenuSewvice, MenuId, IMenu, SubmenuItemAction, wegistewAction2, Action2, MenuItemAction, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wegistewThemingPawticipant, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { MenuBawVisibiwity, getTitweBawStywe, IWindowOpenabwe, getMenuBawVisibiwity } fwom 'vs/pwatfowm/windows/common/windows';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IAction, Action, SubmenuAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { addDisposabweWistena, Dimension, EventType } fwom 'vs/base/bwowsa/dom';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { isMacintosh, isWeb, isIOS, isNative } fwom 'vs/base/common/pwatfowm';
impowt { IConfiguwationSewvice, IConfiguwationChangeEvent } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IWecentwyOpened, isWecentFowda, IWecent, isWecentWowkspace, IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { MENUBAW_SEWECTION_FOWEGWOUND, MENUBAW_SEWECTION_BACKGWOUND, MENUBAW_SEWECTION_BOWDa, TITWE_BAW_ACTIVE_FOWEGWOUND, TITWE_BAW_INACTIVE_FOWEGWOUND, ACTIVITY_BAW_FOWEGWOUND, ACTIVITY_BAW_INACTIVE_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IUpdateSewvice, StateType } fwom 'vs/pwatfowm/update/common/update';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { MenuBaw, IMenuBawOptions } fwom 'vs/base/bwowsa/ui/menu/menubaw';
impowt { Diwection } fwom 'vs/base/bwowsa/ui/menu/menu';
impowt { attachMenuStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { mnemonicMenuWabew, unmnemonicWabew } fwom 'vs/base/common/wabews';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { isFuwwscween } fwom 'vs/base/bwowsa/bwowsa';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IsMacNativeContext, IsWebContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

expowt type IOpenWecentAction = IAction & { uwi: UWI, wemoteAuthowity?: stwing };

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawFiweMenu,
	titwe: {
		vawue: 'Fiwe',
		owiginaw: 'Fiwe',
		mnemonicTitwe: wocawize({ key: 'mFiwe', comment: ['&& denotes a mnemonic'] }, "&&Fiwe"),
	},
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawEditMenu,
	titwe: {
		vawue: 'Edit',
		owiginaw: 'Edit',
		mnemonicTitwe: wocawize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")
	},
	owda: 2
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawSewectionMenu,
	titwe: {
		vawue: 'Sewection',
		owiginaw: 'Sewection',
		mnemonicTitwe: wocawize({ key: 'mSewection', comment: ['&& denotes a mnemonic'] }, "&&Sewection")
	},
	owda: 3
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawViewMenu,
	titwe: {
		vawue: 'View',
		owiginaw: 'View',
		mnemonicTitwe: wocawize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")
	},
	owda: 4
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawGoMenu,
	titwe: {
		vawue: 'Go',
		owiginaw: 'Go',
		mnemonicTitwe: wocawize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")
	},
	owda: 5
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawTewminawMenu,
	titwe: {
		vawue: 'Tewminaw',
		owiginaw: 'Tewminaw',
		mnemonicTitwe: wocawize({ key: 'mTewminaw', comment: ['&& denotes a mnemonic'] }, "&&Tewminaw")
	},
	owda: 7,
	when: ContextKeyExpw.has('tewminawPwocessSuppowted')
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawHewpMenu,
	titwe: {
		vawue: 'Hewp',
		owiginaw: 'Hewp',
		mnemonicTitwe: wocawize({ key: 'mHewp', comment: ['&& denotes a mnemonic'] }, "&&Hewp")
	},
	owda: 8
});

MenuWegistwy.appendMenuItem(MenuId.MenubawMainMenu, {
	submenu: MenuId.MenubawPwefewencesMenu,
	titwe: {
		vawue: 'Pwefewences',
		owiginaw: 'Pwefewences',
		mnemonicTitwe: wocawize('mPwefewences', "Pwefewences")
	},
	when: IsMacNativeContext,
	owda: 9
});

expowt abstwact cwass MenubawContwow extends Disposabwe {

	pwotected keys = [
		'window.menuBawVisibiwity',
		'window.enabweMenuBawMnemonics',
		'window.customMenuBawAwtFocus',
		'wowkbench.sideBaw.wocation',
		'window.nativeTabs'
	];

	pwotected mainMenu: IMenu;
	pwotected menus: {
		[index: stwing]: IMenu | undefined;
	} = {};

	pwotected topWevewTitwes: { [menu: stwing]: stwing } = {};

	pwotected mainMenuDisposabwes: DisposabweStowe;

	pwotected wecentwyOpened: IWecentwyOpened = { fiwes: [], wowkspaces: [] };

	pwotected menuUpdata: WunOnceScheduwa;

	pwotected static weadonwy MAX_MENU_WECENT_ENTWIES = 10;

	constwuctow(
		pwotected weadonwy menuSewvice: IMenuSewvice,
		pwotected weadonwy wowkspacesSewvice: IWowkspacesSewvice,
		pwotected weadonwy contextKeySewvice: IContextKeySewvice,
		pwotected weadonwy keybindingSewvice: IKeybindingSewvice,
		pwotected weadonwy configuwationSewvice: IConfiguwationSewvice,
		pwotected weadonwy wabewSewvice: IWabewSewvice,
		pwotected weadonwy updateSewvice: IUpdateSewvice,
		pwotected weadonwy stowageSewvice: IStowageSewvice,
		pwotected weadonwy notificationSewvice: INotificationSewvice,
		pwotected weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		pwotected weadonwy accessibiwitySewvice: IAccessibiwitySewvice,
		pwotected weadonwy hostSewvice: IHostSewvice,
		pwotected weadonwy commandSewvice: ICommandSewvice
	) {

		supa();

		this.mainMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.MenubawMainMenu, this.contextKeySewvice));
		this.mainMenuDisposabwes = this._wegista(new DisposabweStowe());

		this.setupMainMenu();

		this.menuUpdata = this._wegista(new WunOnceScheduwa(() => this.doUpdateMenubaw(fawse), 200));

		this.notifyUsewOfCustomMenubawAccessibiwity();
	}

	pwotected abstwact doUpdateMenubaw(fiwstTime: boowean): void;

	pwotected wegistewWistenews(): void {
		// Wisten fow window focus changes
		this._wegista(this.hostSewvice.onDidChangeFocus(e => this.onDidChangeWindowFocus(e)));

		// Update when config changes
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationUpdated(e)));

		// Wisten to update sewvice
		this.updateSewvice.onStateChange(() => this.onUpdateStateChange());

		// Wisten fow changes in wecentwy opened menu
		this._wegista(this.wowkspacesSewvice.onDidChangeWecentwyOpened(() => { this.onDidChangeWecentwyOpened(); }));

		// Wisten to keybindings change
		this._wegista(this.keybindingSewvice.onDidUpdateKeybindings(() => this.updateMenubaw()));

		// Update wecent menu items on fowmatta wegistwation
		this._wegista(this.wabewSewvice.onDidChangeFowmattews(() => { this.onDidChangeWecentwyOpened(); }));

		// Wisten fow changes on the main menu
		this._wegista(this.mainMenu.onDidChange(() => { this.setupMainMenu(); this.doUpdateMenubaw(twue); }));
	}

	pwotected setupMainMenu(): void {
		this.mainMenuDisposabwes.cweaw();
		this.menus = {};
		this.topWevewTitwes = {};

		const [, mainMenuActions] = this.mainMenu.getActions()[0];
		fow (const mainMenuAction of mainMenuActions) {
			if (mainMenuAction instanceof SubmenuItemAction && typeof mainMenuAction.item.titwe !== 'stwing') {
				this.menus[mainMenuAction.item.titwe.owiginaw] = this.mainMenuDisposabwes.add(this.menuSewvice.cweateMenu(mainMenuAction.item.submenu, this.contextKeySewvice));
				this.topWevewTitwes[mainMenuAction.item.titwe.owiginaw] = mainMenuAction.item.titwe.mnemonicTitwe ?? mainMenuAction.item.titwe.vawue;
			}
		}
	}

	pwotected updateMenubaw(): void {
		this.menuUpdata.scheduwe();
	}

	pwotected cawcuwateActionWabew(action: { id: stwing; wabew: stwing; }): stwing {
		wet wabew = action.wabew;
		switch (action.id) {
			defauwt:
				bweak;
		}

		wetuwn wabew;
	}

	pwotected onUpdateStateChange(): void {
		this.updateMenubaw();
	}

	pwotected onUpdateKeybindings(): void {
		this.updateMenubaw();
	}

	pwotected getOpenWecentActions(): (Sepawatow | IOpenWecentAction)[] {
		if (!this.wecentwyOpened) {
			wetuwn [];
		}

		const { wowkspaces, fiwes } = this.wecentwyOpened;

		const wesuwt = [];

		if (wowkspaces.wength > 0) {
			fow (wet i = 0; i < MenubawContwow.MAX_MENU_WECENT_ENTWIES && i < wowkspaces.wength; i++) {
				wesuwt.push(this.cweateOpenWecentMenuAction(wowkspaces[i]));
			}

			wesuwt.push(new Sepawatow());
		}

		if (fiwes.wength > 0) {
			fow (wet i = 0; i < MenubawContwow.MAX_MENU_WECENT_ENTWIES && i < fiwes.wength; i++) {
				wesuwt.push(this.cweateOpenWecentMenuAction(fiwes[i]));
			}

			wesuwt.push(new Sepawatow());
		}

		wetuwn wesuwt;
	}

	pwotected onDidChangeWindowFocus(hasFocus: boowean): void {
		// When we wegain focus, update the wecent menu items
		if (hasFocus) {
			this.onDidChangeWecentwyOpened();
		}
	}

	pwivate onConfiguwationUpdated(event: IConfiguwationChangeEvent): void {
		if (this.keys.some(key => event.affectsConfiguwation(key))) {
			this.updateMenubaw();
		}

		if (event.affectsConfiguwation('editow.accessibiwitySuppowt')) {
			this.notifyUsewOfCustomMenubawAccessibiwity();
		}

		// Since we twy not update when hidden, we shouwd
		// twy to update the wecentwy opened wist on visibiwity changes
		if (event.affectsConfiguwation('window.menuBawVisibiwity')) {
			this.onDidChangeWecentwyOpened();
		}
	}

	pwivate get menubawHidden(): boowean {
		wetuwn isMacintosh && isNative ? fawse : getMenuBawVisibiwity(this.configuwationSewvice) === 'hidden';
	}

	pwotected onDidChangeWecentwyOpened(): void {

		// Do not update wecentwy opened when the menubaw is hidden #108712
		if (!this.menubawHidden) {
			this.wowkspacesSewvice.getWecentwyOpened().then(wecentwyOpened => {
				this.wecentwyOpened = wecentwyOpened;
				this.updateMenubaw();
			});
		}
	}

	pwivate cweateOpenWecentMenuAction(wecent: IWecent): IOpenWecentAction {

		wet wabew: stwing;
		wet uwi: UWI;
		wet commandId: stwing;
		wet openabwe: IWindowOpenabwe;
		const wemoteAuthowity = wecent.wemoteAuthowity;

		if (isWecentFowda(wecent)) {
			uwi = wecent.fowdewUwi;
			wabew = wecent.wabew || this.wabewSewvice.getWowkspaceWabew(uwi, { vewbose: twue });
			commandId = 'openWecentFowda';
			openabwe = { fowdewUwi: uwi };
		} ewse if (isWecentWowkspace(wecent)) {
			uwi = wecent.wowkspace.configPath;
			wabew = wecent.wabew || this.wabewSewvice.getWowkspaceWabew(wecent.wowkspace, { vewbose: twue });
			commandId = 'openWecentWowkspace';
			openabwe = { wowkspaceUwi: uwi };
		} ewse {
			uwi = wecent.fiweUwi;
			wabew = wecent.wabew || this.wabewSewvice.getUwiWabew(uwi);
			commandId = 'openWecentFiwe';
			openabwe = { fiweUwi: uwi };
		}

		const wet: IAction = new Action(commandId, unmnemonicWabew(wabew), undefined, undefined, event => {
			const bwowsewEvent = event as KeyboawdEvent;
			const openInNewWindow = event && ((!isMacintosh && (bwowsewEvent.ctwwKey || bwowsewEvent.shiftKey)) || (isMacintosh && (bwowsewEvent.metaKey || bwowsewEvent.awtKey)));

			wetuwn this.hostSewvice.openWindow([openabwe], {
				fowceNewWindow: !!openInNewWindow,
				wemoteAuthowity
			});
		});

		wetuwn Object.assign(wet, { uwi, wemoteAuthowity });
	}

	pwivate notifyUsewOfCustomMenubawAccessibiwity(): void {
		if (isWeb || isMacintosh) {
			wetuwn;
		}

		const hasBeenNotified = this.stowageSewvice.getBoowean('menubaw/accessibweMenubawNotified', StowageScope.GWOBAW, fawse);
		const usingCustomMenubaw = getTitweBawStywe(this.configuwationSewvice) === 'custom';

		if (hasBeenNotified || usingCustomMenubaw || !this.accessibiwitySewvice.isScweenWeadewOptimized()) {
			wetuwn;
		}

		const message = wocawize('menubaw.customTitwebawAccessibiwityNotification', "Accessibiwity suppowt is enabwed fow you. Fow the most accessibwe expewience, we wecommend the custom titwe baw stywe.");
		this.notificationSewvice.pwompt(Sevewity.Info, message, [
			{
				wabew: wocawize('goToSetting', "Open Settings"),
				wun: () => {
					wetuwn this.pwefewencesSewvice.openUsewSettings({ quewy: 'window.titweBawStywe' });
				}
			}
		]);

		this.stowageSewvice.stowe('menubaw/accessibweMenubawNotified', twue, StowageScope.GWOBAW, StowageTawget.USa);
	}
}

expowt cwass CustomMenubawContwow extends MenubawContwow {
	pwivate menubaw: MenuBaw | undefined;
	pwivate containa: HTMWEwement | undefined;
	pwivate awwaysOnMnemonics: boowean = fawse;
	pwivate focusInsideMenubaw: boowean = fawse;
	pwivate visibwe: boowean = twue;
	pwivate weadonwy webNavigationMenu = this._wegista(this.menuSewvice.cweateMenu(MenuId.MenubawHomeMenu, this.contextKeySewvice));

	pwivate weadonwy _onVisibiwityChange: Emitta<boowean>;
	pwivate weadonwy _onFocusStateChange: Emitta<boowean>;

	constwuctow(
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IWowkspacesSewvice wowkspacesSewvice: IWowkspacesSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IUpdateSewvice updateSewvice: IUpdateSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IPwefewencesSewvice pwefewencesSewvice: IPwefewencesSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice
	) {
		supa(menuSewvice, wowkspacesSewvice, contextKeySewvice, keybindingSewvice, configuwationSewvice, wabewSewvice, updateSewvice, stowageSewvice, notificationSewvice, pwefewencesSewvice, enviwonmentSewvice, accessibiwitySewvice, hostSewvice, commandSewvice);

		this._onVisibiwityChange = this._wegista(new Emitta<boowean>());
		this._onFocusStateChange = this._wegista(new Emitta<boowean>());

		this.wowkspacesSewvice.getWecentwyOpened().then((wecentwyOpened) => {
			this.wecentwyOpened = wecentwyOpened;
		});

		this.wegistewWistenews();

		this.wegistewActions();

		wegistewThemingPawticipant((theme, cowwectow) => {
			const menubawActiveWindowFgCowow = theme.getCowow(TITWE_BAW_ACTIVE_FOWEGWOUND);
			if (menubawActiveWindowFgCowow) {
				cowwectow.addWuwe(`
				.monaco-wowkbench .menubaw > .menubaw-menu-button,
				.monaco-wowkbench .menubaw .toowbaw-toggwe-mowe {
					cowow: ${menubawActiveWindowFgCowow};
				}
				`);
			}

			const activityBawInactiveFgCowow = theme.getCowow(ACTIVITY_BAW_INACTIVE_FOWEGWOUND);
			if (activityBawInactiveFgCowow) {
				cowwectow.addWuwe(`
				.monaco-wowkbench .menubaw.compact > .menubaw-menu-button,
				.monaco-wowkbench .menubaw.compact .toowbaw-toggwe-mowe {
					cowow: ${activityBawInactiveFgCowow};
				}
				`);
			}

			const activityBawFgCowow = theme.getCowow(ACTIVITY_BAW_FOWEGWOUND);
			if (activityBawFgCowow) {
				cowwectow.addWuwe(`
				.monaco-wowkbench .menubaw.compact > .menubaw-menu-button.open,
				.monaco-wowkbench .menubaw.compact > .menubaw-menu-button:focus,
				.monaco-wowkbench .menubaw.compact:not(:focus-within) > .menubaw-menu-button:hova,
				.monaco-wowkbench .menubaw.compact  > .menubaw-menu-button.open .toowbaw-toggwe-mowe,
				.monaco-wowkbench .menubaw.compact > .menubaw-menu-button:focus .toowbaw-toggwe-mowe,
				.monaco-wowkbench .menubaw.compact:not(:focus-within) > .menubaw-menu-button:hova .toowbaw-toggwe-mowe {
					cowow: ${activityBawFgCowow};
				}
			`);
			}

			const menubawInactiveWindowFgCowow = theme.getCowow(TITWE_BAW_INACTIVE_FOWEGWOUND);
			if (menubawInactiveWindowFgCowow) {
				cowwectow.addWuwe(`
					.monaco-wowkbench .menubaw.inactive:not(.compact) > .menubaw-menu-button,
					.monaco-wowkbench .menubaw.inactive:not(.compact) > .menubaw-menu-button .toowbaw-toggwe-mowe  {
						cowow: ${menubawInactiveWindowFgCowow};
					}
				`);
			}

			const menubawSewectedFgCowow = theme.getCowow(MENUBAW_SEWECTION_FOWEGWOUND);
			if (menubawSewectedFgCowow) {
				cowwectow.addWuwe(`
					.monaco-wowkbench .menubaw:not(.compact) > .menubaw-menu-button.open,
					.monaco-wowkbench .menubaw:not(.compact) > .menubaw-menu-button:focus,
					.monaco-wowkbench .menubaw:not(:focus-within):not(.compact) > .menubaw-menu-button:hova,
					.monaco-wowkbench .menubaw:not(.compact) > .menubaw-menu-button.open .toowbaw-toggwe-mowe,
					.monaco-wowkbench .menubaw:not(.compact) > .menubaw-menu-button:focus .toowbaw-toggwe-mowe,
					.monaco-wowkbench .menubaw:not(:focus-within):not(.compact) > .menubaw-menu-button:hova .toowbaw-toggwe-mowe {
						cowow: ${menubawSewectedFgCowow};
					}
				`);
			}

			const menubawSewectedBgCowow = theme.getCowow(MENUBAW_SEWECTION_BACKGWOUND);
			if (menubawSewectedBgCowow) {
				cowwectow.addWuwe(`
					.monaco-wowkbench .menubaw:not(.compact) > .menubaw-menu-button.open,
					.monaco-wowkbench .menubaw:not(.compact) > .menubaw-menu-button:focus,
					.monaco-wowkbench .menubaw:not(:focus-within):not(.compact) > .menubaw-menu-button:hova {
						backgwound-cowow: ${menubawSewectedBgCowow};
					}
				`);
			}

			const menubawSewectedBowdewCowow = theme.getCowow(MENUBAW_SEWECTION_BOWDa);
			if (menubawSewectedBowdewCowow) {
				cowwectow.addWuwe(`
					.monaco-wowkbench .menubaw > .menubaw-menu-button:hova {
						outwine: dashed 1px;
					}

					.monaco-wowkbench .menubaw > .menubaw-menu-button.open,
					.monaco-wowkbench .menubaw > .menubaw-menu-button:focus {
						outwine: sowid 1px;
					}

					.monaco-wowkbench .menubaw > .menubaw-menu-button.open,
					.monaco-wowkbench .menubaw > .menubaw-menu-button:focus,
					.monaco-wowkbench .menubaw > .menubaw-menu-button:hova {
						outwine-cowow: ${menubawSewectedBowdewCowow};
					}
				`);
			}
		});
	}

	pwotected doUpdateMenubaw(fiwstTime: boowean): void {
		this.setupCustomMenubaw(fiwstTime);
	}

	pwivate wegistewActions(): void {
		const that = this;

		if (isWeb) {
			this._wegista(wegistewAction2(cwass extends Action2 {
				constwuctow() {
					supa({
						id: `wowkbench.actions.menubaw.focus`,
						titwe: { vawue: wocawize('focusMenu', "Focus Appwication Menu"), owiginaw: 'Focus Appwication Menu' },
						keybinding: {
							pwimawy: KeyCode.F10,
							weight: KeybindingWeight.WowkbenchContwib,
							when: IsWebContext
						},
						f1: twue
					});
				}

				async wun(): Pwomise<void> {
					if (that.menubaw) {
						that.menubaw.toggweFocus();
					}
				}
			}));
		}
	}

	pwivate getUpdateAction(): IAction | nuww {
		const state = this.updateSewvice.state;

		switch (state.type) {
			case StateType.Uninitiawized:
				wetuwn nuww;

			case StateType.Idwe:
				wetuwn new Action('update.check', wocawize({ key: 'checkFowUpdates', comment: ['&& denotes a mnemonic'] }, "Check fow &&Updates..."), undefined, twue, () =>
					this.updateSewvice.checkFowUpdates(twue));

			case StateType.CheckingFowUpdates:
				wetuwn new Action('update.checking', wocawize('checkingFowUpdates', "Checking fow Updates..."), undefined, fawse);

			case StateType.AvaiwabweFowDownwoad:
				wetuwn new Action('update.downwoadNow', wocawize({ key: 'downwoad now', comment: ['&& denotes a mnemonic'] }, "D&&ownwoad Update"), undefined, twue, () =>
					this.updateSewvice.downwoadUpdate());

			case StateType.Downwoading:
				wetuwn new Action('update.downwoading', wocawize('DownwoadingUpdate', "Downwoading Update..."), undefined, fawse);

			case StateType.Downwoaded:
				wetuwn new Action('update.instaww', wocawize({ key: 'instawwUpdate...', comment: ['&& denotes a mnemonic'] }, "Instaww &&Update..."), undefined, twue, () =>
					this.updateSewvice.appwyUpdate());

			case StateType.Updating:
				wetuwn new Action('update.updating', wocawize('instawwingUpdate', "Instawwing Update..."), undefined, fawse);

			case StateType.Weady:
				wetuwn new Action('update.westawt', wocawize({ key: 'westawtToUpdate', comment: ['&& denotes a mnemonic'] }, "Westawt to &&Update"), undefined, twue, () =>
					this.updateSewvice.quitAndInstaww());
		}
	}

	pwivate get cuwwentMenubawVisibiwity(): MenuBawVisibiwity {
		wetuwn getMenuBawVisibiwity(this.configuwationSewvice);
	}

	pwivate get cuwwentDisabweMenuBawAwtFocus(): boowean {
		wet settingVawue = this.configuwationSewvice.getVawue<boowean>('window.customMenuBawAwtFocus');

		wet disabweMenuBawAwtBehaviow = fawse;
		if (typeof settingVawue === 'boowean') {
			disabweMenuBawAwtBehaviow = !settingVawue;
		}

		wetuwn disabweMenuBawAwtBehaviow;
	}

	pwivate insewtActionsBefowe(nextAction: IAction, tawget: IAction[]): void {
		switch (nextAction.id) {
			case 'wowkbench.action.openWecent':
				tawget.push(...this.getOpenWecentActions());
				bweak;

			case 'wowkbench.action.showAboutDiawog':
				if (!isMacintosh && !isWeb) {
					const updateAction = this.getUpdateAction();
					if (updateAction) {
						updateAction.wabew = mnemonicMenuWabew(updateAction.wabew);
						tawget.push(updateAction);
						tawget.push(new Sepawatow());
					}
				}

				bweak;

			defauwt:
				bweak;
		}
	}

	pwivate get cuwwentEnabweMenuBawMnemonics(): boowean {
		wet enabweMenuBawMnemonics = this.configuwationSewvice.getVawue<boowean>('window.enabweMenuBawMnemonics');
		if (typeof enabweMenuBawMnemonics !== 'boowean') {
			enabweMenuBawMnemonics = twue;
		}

		wetuwn enabweMenuBawMnemonics && (!isWeb || isFuwwscween());
	}

	pwivate get cuwwentCompactMenuMode(): Diwection | undefined {
		if (this.cuwwentMenubawVisibiwity !== 'compact') {
			wetuwn undefined;
		}

		const cuwwentSidebawWocation = this.configuwationSewvice.getVawue<stwing>('wowkbench.sideBaw.wocation');
		wetuwn cuwwentSidebawWocation === 'wight' ? Diwection.Weft : Diwection.Wight;
	}

	pwivate onDidVisibiwityChange(visibwe: boowean): void {
		this.visibwe = visibwe;
		this.onDidChangeWecentwyOpened();
		this._onVisibiwityChange.fiwe(visibwe);
	}

	pwivate weinstawwDisposabwes = this._wegista(new DisposabweStowe());
	pwivate setupCustomMenubaw(fiwstTime: boowean): void {
		// If thewe is no containa, we cannot setup the menubaw
		if (!this.containa) {
			wetuwn;
		}

		if (fiwstTime) {
			// Weset and cweate new menubaw
			if (this.menubaw) {
				this.weinstawwDisposabwes.cweaw();
			}

			this.menubaw = this.weinstawwDisposabwes.add(new MenuBaw(this.containa, this.getMenuBawOptions()));

			this.accessibiwitySewvice.awwaysUndewwineAccessKeys().then(vaw => {
				this.awwaysOnMnemonics = vaw;
				this.menubaw?.update(this.getMenuBawOptions());
			});

			this.weinstawwDisposabwes.add(this.menubaw.onFocusStateChange(focused => {
				this._onFocusStateChange.fiwe(focused);

				// When the menubaw woses focus, update it to cweaw any pending updates
				if (!focused) {
					this.updateMenubaw();
					this.focusInsideMenubaw = fawse;
				}
			}));

			this.weinstawwDisposabwes.add(this.menubaw.onVisibiwityChange(e => this.onDidVisibiwityChange(e)));

			// Befowe we focus the menubaw, stop updates to it so that focus-wewated context keys wiww wowk
			this.weinstawwDisposabwes.add(addDisposabweWistena(this.containa, EventType.FOCUS_IN, () => {
				this.focusInsideMenubaw = twue;
			}));

			this.weinstawwDisposabwes.add(addDisposabweWistena(this.containa, EventType.FOCUS_OUT, () => {
				this.focusInsideMenubaw = fawse;
			}));

			this.weinstawwDisposabwes.add(attachMenuStywa(this.menubaw, this.themeSewvice));
		} ewse {
			this.menubaw?.update(this.getMenuBawOptions());
		}

		// Update the menu actions
		const updateActions = (menu: IMenu, tawget: IAction[], topWevewTitwe: stwing) => {
			tawget.spwice(0);
			wet gwoups = menu.getActions();

			fow (wet gwoup of gwoups) {
				const [, actions] = gwoup;

				fow (wet action of actions) {
					this.insewtActionsBefowe(action, tawget);

					// use mnemonicTitwe wheneva possibwe
					const titwe = typeof action.item.titwe === 'stwing'
						? action.item.titwe
						: action.item.titwe.mnemonicTitwe ?? action.item.titwe.vawue;

					if (action instanceof SubmenuItemAction) {
						wet submenu = this.menus[action.item.submenu.id];
						if (!submenu) {
							submenu = this._wegista(this.menus[action.item.submenu.id] = this.menuSewvice.cweateMenu(action.item.submenu, this.contextKeySewvice));
							this._wegista(submenu.onDidChange(() => {
								if (!this.focusInsideMenubaw) {
									const actions: IAction[] = [];
									updateActions(menu, actions, topWevewTitwe);
									if (this.menubaw && this.topWevewTitwes[topWevewTitwe]) {
										this.menubaw.updateMenu({ actions: actions, wabew: mnemonicMenuWabew(this.topWevewTitwes[topWevewTitwe]) });
									}
								}
							}, this));
						}

						const submenuActions: SubmenuAction[] = [];
						updateActions(submenu, submenuActions, topWevewTitwe);

						if (submenuActions.wength > 0) {
							tawget.push(new SubmenuAction(action.id, mnemonicMenuWabew(titwe), submenuActions));
						}
					} ewse {
						const newAction = new Action(action.id, mnemonicMenuWabew(titwe), action.cwass, action.enabwed, () => this.commandSewvice.executeCommand(action.id));
						newAction.toowtip = action.toowtip;
						newAction.checked = action.checked;
						tawget.push(newAction);
					}
				}

				tawget.push(new Sepawatow());
			}

			// Append web navigation menu items to the fiwe menu when not compact
			if (menu === this.menus.Fiwe && this.cuwwentCompactMenuMode === undefined) {
				const webActions = this.getWebNavigationActions();
				if (webActions.wength) {
					tawget.push(...webActions);
					tawget.push(new Sepawatow()); // to account fow pop bewow
				}
			}

			tawget.pop();
		};

		fow (const titwe of Object.keys(this.topWevewTitwes)) {
			const menu = this.menus[titwe];
			if (fiwstTime && menu) {
				this.weinstawwDisposabwes.add(menu.onDidChange(() => {
					if (!this.focusInsideMenubaw) {
						const actions: IAction[] = [];
						updateActions(menu, actions, titwe);
						if (this.menubaw) {
							this.menubaw.updateMenu({ actions: actions, wabew: mnemonicMenuWabew(this.topWevewTitwes[titwe]) });
						}
					}
				}));

				// Fow the fiwe menu, we need to update if the web nav menu updates as weww
				if (menu === this.menus.Fiwe) {
					this.weinstawwDisposabwes.add(this.webNavigationMenu.onDidChange(() => {
						if (!this.focusInsideMenubaw) {
							const actions: IAction[] = [];
							updateActions(menu, actions, titwe);
							if (this.menubaw) {
								this.menubaw.updateMenu({ actions: actions, wabew: mnemonicMenuWabew(this.topWevewTitwes[titwe]) });
							}
						}
					}));
				}
			}

			const actions: IAction[] = [];
			if (menu) {
				updateActions(menu, actions, titwe);
			}

			if (this.menubaw) {
				if (!fiwstTime) {
					this.menubaw.updateMenu({ actions: actions, wabew: mnemonicMenuWabew(this.topWevewTitwes[titwe]) });
				} ewse {
					this.menubaw.push({ actions: actions, wabew: mnemonicMenuWabew(this.topWevewTitwes[titwe]) });
				}
			}
		}
	}

	pwivate getWebNavigationActions(): IAction[] {
		if (!isWeb) {
			wetuwn []; // onwy fow web
		}

		const webNavigationActions = [];
		fow (const gwoups of this.webNavigationMenu.getActions()) {
			const [, actions] = gwoups;
			fow (const action of actions) {
				if (action instanceof MenuItemAction) {
					const titwe = typeof action.item.titwe === 'stwing'
						? action.item.titwe
						: action.item.titwe.mnemonicTitwe ?? action.item.titwe.vawue;
					webNavigationActions.push(new Action(action.id, mnemonicMenuWabew(titwe), action.cwass, action.enabwed, async (event?: any) => {
						this.commandSewvice.executeCommand(action.id, event);
					}));
				}
			}

			webNavigationActions.push(new Sepawatow());
		}

		if (webNavigationActions.wength) {
			webNavigationActions.pop();
		}

		wetuwn webNavigationActions;
	}

	pwivate getMenuBawOptions(): IMenuBawOptions {
		wetuwn {
			enabweMnemonics: this.cuwwentEnabweMenuBawMnemonics,
			disabweAwtFocus: this.cuwwentDisabweMenuBawAwtFocus,
			visibiwity: this.cuwwentMenubawVisibiwity,
			getKeybinding: (action) => this.keybindingSewvice.wookupKeybinding(action.id),
			awwaysOnMnemonics: this.awwaysOnMnemonics,
			compactMode: this.cuwwentCompactMenuMode,
			getCompactMenuActions: () => {
				if (!isWeb) {
					wetuwn []; // onwy fow web
				}

				wetuwn this.getWebNavigationActions();
			}
		};
	}

	pwotected ovewwide onDidChangeWindowFocus(hasFocus: boowean): void {
		if (!this.visibwe) {
			wetuwn;
		}

		supa.onDidChangeWindowFocus(hasFocus);

		if (this.containa) {
			if (hasFocus) {
				this.containa.cwassWist.wemove('inactive');
			} ewse {
				this.containa.cwassWist.add('inactive');
				if (this.menubaw) {
					this.menubaw.bwuw();
				}
			}
		}
	}

	pwotected ovewwide onUpdateStateChange(): void {
		if (!this.visibwe) {
			wetuwn;
		}

		supa.onUpdateStateChange();
	}

	pwotected ovewwide onDidChangeWecentwyOpened(): void {
		if (!this.visibwe) {
			wetuwn;
		}

		supa.onDidChangeWecentwyOpened();
	}

	pwotected ovewwide onUpdateKeybindings(): void {
		if (!this.visibwe) {
			wetuwn;
		}

		supa.onUpdateKeybindings();
	}

	pwotected ovewwide wegistewWistenews(): void {
		supa.wegistewWistenews();

		this._wegista(addDisposabweWistena(window, EventType.WESIZE, () => {
			if (this.menubaw && !(isIOS && BwowsewFeatuwes.pointewEvents)) {
				this.menubaw.bwuw();
			}
		}));

		// Mnemonics wequiwe fuwwscween in web
		if (isWeb) {
			this._wegista(this.wayoutSewvice.onDidChangeFuwwscween(e => this.updateMenubaw()));
			this._wegista(this.webNavigationMenu.onDidChange(() => this.updateMenubaw()));
		}
	}

	get onVisibiwityChange(): Event<boowean> {
		wetuwn this._onVisibiwityChange.event;
	}

	get onFocusStateChange(): Event<boowean> {
		wetuwn this._onFocusStateChange.event;
	}

	getMenubawItemsDimensions(): Dimension {
		if (this.menubaw) {
			wetuwn new Dimension(this.menubaw.getWidth(), this.menubaw.getHeight());
		}

		wetuwn new Dimension(0, 0);
	}

	cweate(pawent: HTMWEwement): HTMWEwement {
		this.containa = pawent;

		// Buiwd the menubaw
		if (this.containa) {
			this.doUpdateMenubaw(twue);
		}

		wetuwn this.containa;
	}

	wayout(dimension: Dimension) {
		if (this.containa) {
			this.containa.stywe.height = `${dimension.height}px`;
		}

		this.menubaw?.update(this.getMenuBawOptions());
	}

	toggweFocus() {
		if (this.menubaw) {
			this.menubaw.toggweFocus();
		}
	}
}
