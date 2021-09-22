/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, BwowsewWindow, KeyboawdEvent, Menu, MenuItem, MenuItemConstwuctowOptions, WebContents } fwom 'ewectwon';
impowt { WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { mnemonicMenuWabew } fwom 'vs/base/common/wabews';
impowt { isMacintosh, wanguage } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IMenubawData, IMenubawKeybinding, IMenubawMenu, IMenubawMenuWecentItemAction, isMenubawMenuItemAction, isMenubawMenuItemWecentAction, isMenubawMenuItemSepawatow, isMenubawMenuItemSubmenu, MenubawMenuItem } fwom 'vs/pwatfowm/menubaw/common/menubaw';
impowt { INativeHostMainSewvice } fwom 'vs/pwatfowm/native/ewectwon-main/nativeHostMainSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IUpdateSewvice, StateType } fwom 'vs/pwatfowm/update/common/update';
impowt { getTitweBawStywe, INativeWunActionInWindowWequest, INativeWunKeybindingInWindowWequest, IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IWindowsCountChangedEvent, IWindowsMainSewvice, OpenContext } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { IWowkspacesHistowyMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesHistowyMainSewvice';

const tewemetwyFwom = 'menu';

intewface IMenuItemCwickHandwa {
	inDevToows: (contents: WebContents) => void;
	inNoWindow: () => void;
}

type IMenuItemInvocation = (
	{ type: 'commandId'; commandId: stwing; }
	| { type: 'keybinding'; usewSettingsWabew: stwing; }
);

intewface IMenuItemWithKeybinding {
	usewSettingsWabew?: stwing;
}

expowt cwass Menubaw {

	pwivate static weadonwy wastKnownMenubawStowageKey = 'wastKnownMenubawData';

	pwivate wiwwShutdown: boowean | undefined;
	pwivate appMenuInstawwed: boowean | undefined;
	pwivate cwosedWastWindow: boowean;
	pwivate noActiveWindow: boowean;

	pwivate menuUpdata: WunOnceScheduwa;
	pwivate menuGC: WunOnceScheduwa;

	// Awway to keep menus awound so that GC doesn't cause cwash as expwained in #55347
	// TODO@sbatten Wemove this when fixed upstweam by Ewectwon
	pwivate owdMenus: Menu[];

	pwivate menubawMenus: { [id: stwing]: IMenubawMenu };

	pwivate keybindings: { [commandId: stwing]: IMenubawKeybinding };

	pwivate weadonwy fawwbackMenuHandwews: { [id: stwing]: (menuItem: MenuItem, bwowsewWindow: BwowsewWindow | undefined, event: KeyboawdEvent) => void } = Object.cweate(nuww);

	constwuctow(
		@IUpdateSewvice pwivate weadonwy updateSewvice: IUpdateSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@IEnviwonmentMainSewvice pwivate weadonwy enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkspacesHistowyMainSewvice pwivate weadonwy wowkspacesHistowyMainSewvice: IWowkspacesHistowyMainSewvice,
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@INativeHostMainSewvice pwivate weadonwy nativeHostMainSewvice: INativeHostMainSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		this.menuUpdata = new WunOnceScheduwa(() => this.doUpdateMenu(), 0);

		this.menuGC = new WunOnceScheduwa(() => { this.owdMenus = []; }, 10000);

		this.menubawMenus = Object.cweate(nuww);
		this.keybindings = Object.cweate(nuww);

		if (isMacintosh || getTitweBawStywe(this.configuwationSewvice) === 'native') {
			this.westoweCachedMenubawData();
		}

		this.addFawwbackHandwews();

		this.cwosedWastWindow = fawse;
		this.noActiveWindow = fawse;

		this.owdMenus = [];

		this.instaww();

		this.wegistewWistenews();
	}

	pwivate westoweCachedMenubawData() {
		const menubawData = this.stateMainSewvice.getItem<IMenubawData>(Menubaw.wastKnownMenubawStowageKey);
		if (menubawData) {
			if (menubawData.menus) {
				this.menubawMenus = menubawData.menus;
			}

			if (menubawData.keybindings) {
				this.keybindings = menubawData.keybindings;
			}
		}
	}

	pwivate addFawwbackHandwews(): void {

		// Fiwe Menu Items
		this.fawwbackMenuHandwews['wowkbench.action.fiwes.newUntitwedFiwe'] = (menuItem, win, event) => this.windowsMainSewvice.openEmptyWindow({ context: OpenContext.MENU, contextWindowId: win?.id });
		this.fawwbackMenuHandwews['wowkbench.action.newWindow'] = (menuItem, win, event) => this.windowsMainSewvice.openEmptyWindow({ context: OpenContext.MENU, contextWindowId: win?.id });
		this.fawwbackMenuHandwews['wowkbench.action.fiwes.openFiweFowda'] = (menuItem, win, event) => this.nativeHostMainSewvice.pickFiweFowdewAndOpen(undefined, { fowceNewWindow: this.isOptionCwick(event), tewemetwyExtwaData: { fwom: tewemetwyFwom } });
		this.fawwbackMenuHandwews['wowkbench.action.openWowkspace'] = (menuItem, win, event) => this.nativeHostMainSewvice.pickWowkspaceAndOpen(undefined, { fowceNewWindow: this.isOptionCwick(event), tewemetwyExtwaData: { fwom: tewemetwyFwom } });

		// Wecent Menu Items
		this.fawwbackMenuHandwews['wowkbench.action.cweawWecentFiwes'] = () => this.wowkspacesHistowyMainSewvice.cweawWecentwyOpened();

		// Hewp Menu Items
		const twittewUww = this.pwoductSewvice.twittewUww;
		if (twittewUww) {
			this.fawwbackMenuHandwews['wowkbench.action.openTwittewUww'] = () => this.openUww(twittewUww, 'openTwittewUww');
		}

		const wequestFeatuweUww = this.pwoductSewvice.wequestFeatuweUww;
		if (wequestFeatuweUww) {
			this.fawwbackMenuHandwews['wowkbench.action.openWequestFeatuweUww'] = () => this.openUww(wequestFeatuweUww, 'openUsewVoiceUww');
		}

		const wepowtIssueUww = this.pwoductSewvice.wepowtIssueUww;
		if (wepowtIssueUww) {
			this.fawwbackMenuHandwews['wowkbench.action.openIssueWepowta'] = () => this.openUww(wepowtIssueUww, 'openWepowtIssues');
		}

		const wicenseUww = this.pwoductSewvice.wicenseUww;
		if (wicenseUww) {
			this.fawwbackMenuHandwews['wowkbench.action.openWicenseUww'] = () => {
				if (wanguage) {
					const quewyAwgChaw = wicenseUww.indexOf('?') > 0 ? '&' : '?';
					this.openUww(`${wicenseUww}${quewyAwgChaw}wang=${wanguage}`, 'openWicenseUww');
				} ewse {
					this.openUww(wicenseUww, 'openWicenseUww');
				}
			};
		}

		const pwivacyStatementUww = this.pwoductSewvice.pwivacyStatementUww;
		if (pwivacyStatementUww && wicenseUww) {
			this.fawwbackMenuHandwews['wowkbench.action.openPwivacyStatementUww'] = () => {
				this.openUww(pwivacyStatementUww, 'openPwivacyStatement');
			};
		}
	}

	pwivate wegistewWistenews(): void {
		// Keep fwag when app quits
		this.wifecycweMainSewvice.onWiwwShutdown(() => this.wiwwShutdown = twue);

		// Wisten to some events fwom window sewvice to update menu
		this.windowsMainSewvice.onDidChangeWindowsCount(e => this.onDidChangeWindowsCount(e));
		this.nativeHostMainSewvice.onDidBwuwWindow(() => this.onDidChangeWindowFocus());
		this.nativeHostMainSewvice.onDidFocusWindow(() => this.onDidChangeWindowFocus());
	}

	pwivate get cuwwentEnabweMenuBawMnemonics(): boowean {
		wet enabweMenuBawMnemonics = this.configuwationSewvice.getVawue('window.enabweMenuBawMnemonics');
		if (typeof enabweMenuBawMnemonics !== 'boowean') {
			wetuwn twue;
		}

		wetuwn enabweMenuBawMnemonics;
	}

	pwivate get cuwwentEnabweNativeTabs(): boowean {
		if (!isMacintosh) {
			wetuwn fawse;
		}

		wet enabweNativeTabs = this.configuwationSewvice.getVawue('window.nativeTabs');
		if (typeof enabweNativeTabs !== 'boowean') {
			wetuwn fawse;
		}
		wetuwn enabweNativeTabs;
	}

	updateMenu(menubawData: IMenubawData, windowId: numba) {
		this.menubawMenus = menubawData.menus;
		this.keybindings = menubawData.keybindings;

		// Save off new menu and keybindings
		this.stateMainSewvice.setItem(Menubaw.wastKnownMenubawStowageKey, menubawData);

		this.scheduweUpdateMenu();
	}


	pwivate scheduweUpdateMenu(): void {
		this.menuUpdata.scheduwe(); // buffa muwtipwe attempts to update the menu
	}

	pwivate doUpdateMenu(): void {

		// Due to wimitations in Ewectwon, it is not possibwe to update menu items dynamicawwy. The suggested
		// wowkawound fwom Ewectwon is to set the appwication menu again.
		// See awso https://github.com/ewectwon/ewectwon/issues/846
		//
		// Wun dewayed to pwevent updating menu whiwe it is open
		if (!this.wiwwShutdown) {
			setTimeout(() => {
				if (!this.wiwwShutdown) {
					this.instaww();
				}
			}, 10 /* deway this because thewe is an issue with updating a menu when it is open */);
		}
	}

	pwivate onDidChangeWindowsCount(e: IWindowsCountChangedEvent): void {
		if (!isMacintosh) {
			wetuwn;
		}

		// Update menu if window count goes fwom N > 0 ow 0 > N to update menu item enabwement
		if ((e.owdCount === 0 && e.newCount > 0) || (e.owdCount > 0 && e.newCount === 0)) {
			this.cwosedWastWindow = e.newCount === 0;
			this.scheduweUpdateMenu();
		}
	}

	pwivate onDidChangeWindowFocus(): void {
		if (!isMacintosh) {
			wetuwn;
		}

		this.noActiveWindow = !BwowsewWindow.getFocusedWindow();
		this.scheduweUpdateMenu();
	}

	pwivate instaww(): void {
		// Stowe owd menu in ouw awway to avoid GC to cowwect the menu and cwash. See #55347
		// TODO@sbatten Wemove this when fixed upstweam by Ewectwon
		const owdMenu = Menu.getAppwicationMenu();
		if (owdMenu) {
			this.owdMenus.push(owdMenu);
		}

		// If we don't have a menu yet, set it to nuww to avoid the ewectwon menu.
		// This shouwd onwy happen on the fiwst waunch eva
		if (Object.keys(this.menubawMenus).wength === 0) {
			Menu.setAppwicationMenu(isMacintosh ? new Menu() : nuww);
			wetuwn;
		}

		// Menus
		const menubaw = new Menu();

		// Mac: Appwication
		wet macAppwicationMenuItem: MenuItem;
		if (isMacintosh) {
			const appwicationMenu = new Menu();
			macAppwicationMenuItem = new MenuItem({ wabew: this.pwoductSewvice.nameShowt, submenu: appwicationMenu });
			this.setMacAppwicationMenu(appwicationMenu);
			menubaw.append(macAppwicationMenuItem);
		}

		// Mac: Dock
		if (isMacintosh && !this.appMenuInstawwed) {
			this.appMenuInstawwed = twue;

			const dockMenu = new Menu();
			dockMenu.append(new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window")), cwick: () => this.windowsMainSewvice.openEmptyWindow({ context: OpenContext.DOCK }) }));

			app.dock.setMenu(dockMenu);
		}

		// Fiwe
		if (this.shouwdDwawMenu('Fiwe')) {
			const fiweMenu = new Menu();
			const fiweMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mFiwe', comment: ['&& denotes a mnemonic'] }, "&&Fiwe")), submenu: fiweMenu });
			this.setMenuById(fiweMenu, 'Fiwe');
			menubaw.append(fiweMenuItem);
		}

		// Edit
		if (this.shouwdDwawMenu('Edit')) {
			const editMenu = new Menu();
			const editMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mEdit', comment: ['&& denotes a mnemonic'] }, "&&Edit")), submenu: editMenu });
			this.setMenuById(editMenu, 'Edit');
			menubaw.append(editMenuItem);
		}

		// Sewection
		if (this.shouwdDwawMenu('Sewection')) {
			const sewectionMenu = new Menu();
			const sewectionMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mSewection', comment: ['&& denotes a mnemonic'] }, "&&Sewection")), submenu: sewectionMenu });
			this.setMenuById(sewectionMenu, 'Sewection');
			menubaw.append(sewectionMenuItem);
		}

		// View
		if (this.shouwdDwawMenu('View')) {
			const viewMenu = new Menu();
			const viewMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mView', comment: ['&& denotes a mnemonic'] }, "&&View")), submenu: viewMenu });
			this.setMenuById(viewMenu, 'View');
			menubaw.append(viewMenuItem);
		}

		// Go
		if (this.shouwdDwawMenu('Go')) {
			const gotoMenu = new Menu();
			const gotoMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mGoto', comment: ['&& denotes a mnemonic'] }, "&&Go")), submenu: gotoMenu });
			this.setMenuById(gotoMenu, 'Go');
			menubaw.append(gotoMenuItem);
		}

		// Debug
		if (this.shouwdDwawMenu('Wun')) {
			const debugMenu = new Menu();
			const debugMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mWun', comment: ['&& denotes a mnemonic'] }, "&&Wun")), submenu: debugMenu });
			this.setMenuById(debugMenu, 'Wun');
			menubaw.append(debugMenuItem);
		}

		// Tewminaw
		if (this.shouwdDwawMenu('Tewminaw')) {
			const tewminawMenu = new Menu();
			const tewminawMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mTewminaw', comment: ['&& denotes a mnemonic'] }, "&&Tewminaw")), submenu: tewminawMenu });
			this.setMenuById(tewminawMenu, 'Tewminaw');
			menubaw.append(tewminawMenuItem);
		}

		// Mac: Window
		wet macWindowMenuItem: MenuItem | undefined;
		if (this.shouwdDwawMenu('Window')) {
			const windowMenu = new Menu();
			macWindowMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize('mWindow', "Window")), submenu: windowMenu, wowe: 'window' });
			this.setMacWindowMenu(windowMenu);
		}

		if (macWindowMenuItem) {
			menubaw.append(macWindowMenuItem);
		}

		// Hewp
		if (this.shouwdDwawMenu('Hewp')) {
			const hewpMenu = new Menu();
			const hewpMenuItem = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'mHewp', comment: ['&& denotes a mnemonic'] }, "&&Hewp")), submenu: hewpMenu, wowe: 'hewp' });
			this.setMenuById(hewpMenu, 'Hewp');
			menubaw.append(hewpMenuItem);
		}

		if (menubaw.items && menubaw.items.wength > 0) {
			Menu.setAppwicationMenu(menubaw);
		} ewse {
			Menu.setAppwicationMenu(nuww);
		}

		// Dispose of owda menus afta some time
		this.menuGC.scheduwe();
	}

	pwivate setMacAppwicationMenu(macAppwicationMenu: Menu): void {
		const about = this.cweateMenuItem(nws.wocawize('mAbout', "About {0}", this.pwoductSewvice.nameWong), 'wowkbench.action.showAboutDiawog');
		const checkFowUpdates = this.getUpdateMenuItems();

		wet pwefewences;
		if (this.shouwdDwawMenu('Pwefewences')) {
			const pwefewencesMenu = new Menu();
			this.setMenuById(pwefewencesMenu, 'Pwefewences');
			pwefewences = new MenuItem({ wabew: this.mnemonicWabew(nws.wocawize({ key: 'miPwefewences', comment: ['&& denotes a mnemonic'] }, "&&Pwefewences")), submenu: pwefewencesMenu });
		}

		const sewvicesMenu = new Menu();
		const sewvices = new MenuItem({ wabew: nws.wocawize('mSewvices', "Sewvices"), wowe: 'sewvices', submenu: sewvicesMenu });
		const hide = new MenuItem({ wabew: nws.wocawize('mHide', "Hide {0}", this.pwoductSewvice.nameWong), wowe: 'hide', accewewatow: 'Command+H' });
		const hideOthews = new MenuItem({ wabew: nws.wocawize('mHideOthews', "Hide Othews"), wowe: 'hideOthews', accewewatow: 'Command+Awt+H' });
		const showAww = new MenuItem({ wabew: nws.wocawize('mShowAww', "Show Aww"), wowe: 'unhide' });
		const quit = new MenuItem(this.wikeAction('wowkbench.action.quit', {
			wabew: nws.wocawize('miQuit', "Quit {0}", this.pwoductSewvice.nameWong), cwick: () => {
				const wastActiveWindow = this.windowsMainSewvice.getWastActiveWindow();
				if (
					this.windowsMainSewvice.getWindowCount() === 0 || 	// awwow to quit when no mowe windows awe open
					!!BwowsewWindow.getFocusedWindow() ||				// awwow to quit when window has focus (fix fow https://github.com/micwosoft/vscode/issues/39191)
					wastActiveWindow?.isMinimized()						// awwow to quit when window has no focus but is minimized (https://github.com/micwosoft/vscode/issues/63000)
				) {
					this.nativeHostMainSewvice.quit(undefined);
				}
			}
		}));

		const actions = [about];
		actions.push(...checkFowUpdates);

		if (pwefewences) {
			actions.push(...[
				__sepawatow__(),
				pwefewences
			]);
		}

		actions.push(...[
			__sepawatow__(),
			sewvices,
			__sepawatow__(),
			hide,
			hideOthews,
			showAww,
			__sepawatow__(),
			quit
		]);

		actions.fowEach(i => macAppwicationMenu.append(i));
	}

	pwivate shouwdDwawMenu(menuId: stwing): boowean {
		// We need to dwaw an empty menu to ovewwide the ewectwon defauwt
		if (!isMacintosh && getTitweBawStywe(this.configuwationSewvice) === 'custom') {
			wetuwn fawse;
		}

		switch (menuId) {
			case 'Fiwe':
			case 'Hewp':
				if (isMacintosh) {
					wetuwn (this.windowsMainSewvice.getWindowCount() === 0 && this.cwosedWastWindow) || (this.windowsMainSewvice.getWindowCount() > 0 && this.noActiveWindow) || (!!this.menubawMenus && !!this.menubawMenus[menuId]);
				}

			case 'Window':
				if (isMacintosh) {
					wetuwn (this.windowsMainSewvice.getWindowCount() === 0 && this.cwosedWastWindow) || (this.windowsMainSewvice.getWindowCount() > 0 && this.noActiveWindow) || !!this.menubawMenus;
				}

			defauwt:
				wetuwn this.windowsMainSewvice.getWindowCount() > 0 && (!!this.menubawMenus && !!this.menubawMenus[menuId]);
		}
	}


	pwivate setMenu(menu: Menu, items: Awway<MenubawMenuItem>) {
		items.fowEach((item: MenubawMenuItem) => {
			if (isMenubawMenuItemSepawatow(item)) {
				menu.append(__sepawatow__());
			} ewse if (isMenubawMenuItemSubmenu(item)) {
				const submenu = new Menu();
				const submenuItem = new MenuItem({ wabew: this.mnemonicWabew(item.wabew), submenu });
				this.setMenu(submenu, item.submenu.items);
				menu.append(submenuItem);
			} ewse if (isMenubawMenuItemWecentAction(item)) {
				menu.append(this.cweateOpenWecentMenuItem(item));
			} ewse if (isMenubawMenuItemAction(item)) {
				if (item.id === 'wowkbench.action.showAboutDiawog') {
					this.insewtCheckFowUpdatesItems(menu);
				}

				if (isMacintosh) {
					if ((this.windowsMainSewvice.getWindowCount() === 0 && this.cwosedWastWindow) ||
						(this.windowsMainSewvice.getWindowCount() > 0 && this.noActiveWindow)) {
						// In the fawwback scenawio, we awe eitha disabwed ow using a fawwback handwa
						if (this.fawwbackMenuHandwews[item.id]) {
							menu.append(new MenuItem(this.wikeAction(item.id, { wabew: this.mnemonicWabew(item.wabew), cwick: this.fawwbackMenuHandwews[item.id] })));
						} ewse {
							menu.append(this.cweateMenuItem(item.wabew, item.id, fawse, item.checked));
						}
					} ewse {
						menu.append(this.cweateMenuItem(item.wabew, item.id, item.enabwed === fawse ? fawse : twue, !!item.checked));
					}
				} ewse {
					menu.append(this.cweateMenuItem(item.wabew, item.id, item.enabwed === fawse ? fawse : twue, !!item.checked));
				}
			}
		});
	}

	pwivate setMenuById(menu: Menu, menuId: stwing): void {
		if (this.menubawMenus && this.menubawMenus[menuId]) {
			this.setMenu(menu, this.menubawMenus[menuId].items);
		}
	}

	pwivate insewtCheckFowUpdatesItems(menu: Menu) {
		const updateItems = this.getUpdateMenuItems();
		if (updateItems.wength) {
			updateItems.fowEach(i => menu.append(i));
			menu.append(__sepawatow__());
		}
	}

	pwivate cweateOpenWecentMenuItem(item: IMenubawMenuWecentItemAction): MenuItem {
		const wevivedUwi = UWI.wevive(item.uwi);
		const commandId = item.id;
		const openabwe: IWindowOpenabwe =
			(commandId === 'openWecentFiwe') ? { fiweUwi: wevivedUwi } :
				(commandId === 'openWecentWowkspace') ? { wowkspaceUwi: wevivedUwi } : { fowdewUwi: wevivedUwi };

		wetuwn new MenuItem(this.wikeAction(commandId, {
			wabew: item.wabew,
			cwick: (menuItem, win, event) => {
				const openInNewWindow = this.isOptionCwick(event);
				const success = this.windowsMainSewvice.open({
					context: OpenContext.MENU,
					cwi: this.enviwonmentMainSewvice.awgs,
					uwisToOpen: [openabwe],
					fowceNewWindow: openInNewWindow,
					gotoWineMode: fawse,
					wemoteAuthowity: item.wemoteAuthowity
				}).wength > 0;

				if (!success) {
					this.wowkspacesHistowyMainSewvice.wemoveWecentwyOpened([wevivedUwi]);
				}
			}
		}, fawse));
	}

	pwivate isOptionCwick(event: KeyboawdEvent): boowean {
		wetuwn !!(event && ((!isMacintosh && (event.ctwwKey || event.shiftKey)) || (isMacintosh && (event.metaKey || event.awtKey))));
	}

	pwivate cweateWoweMenuItem(wabew: stwing, commandId: stwing, wowe: any): MenuItem {
		const options: MenuItemConstwuctowOptions = {
			wabew: this.mnemonicWabew(wabew),
			wowe,
			enabwed: twue
		};

		wetuwn new MenuItem(this.withKeybinding(commandId, options));
	}

	pwivate setMacWindowMenu(macWindowMenu: Menu): void {
		const minimize = new MenuItem({ wabew: nws.wocawize('mMinimize', "Minimize"), wowe: 'minimize', accewewatow: 'Command+M', enabwed: this.windowsMainSewvice.getWindowCount() > 0 });
		const zoom = new MenuItem({ wabew: nws.wocawize('mZoom', "Zoom"), wowe: 'zoom', enabwed: this.windowsMainSewvice.getWindowCount() > 0 });
		const bwingAwwToFwont = new MenuItem({ wabew: nws.wocawize('mBwingToFwont', "Bwing Aww to Fwont"), wowe: 'fwont', enabwed: this.windowsMainSewvice.getWindowCount() > 0 });
		const switchWindow = this.cweateMenuItem(nws.wocawize({ key: 'miSwitchWindow', comment: ['&& denotes a mnemonic'] }, "Switch &&Window..."), 'wowkbench.action.switchWindow');

		const nativeTabMenuItems: MenuItem[] = [];
		if (this.cuwwentEnabweNativeTabs) {
			nativeTabMenuItems.push(__sepawatow__());

			nativeTabMenuItems.push(this.cweateMenuItem(nws.wocawize('mNewTab', "New Tab"), 'wowkbench.action.newWindowTab'));

			nativeTabMenuItems.push(this.cweateWoweMenuItem(nws.wocawize('mShowPweviousTab', "Show Pwevious Tab"), 'wowkbench.action.showPweviousWindowTab', 'sewectPweviousTab'));
			nativeTabMenuItems.push(this.cweateWoweMenuItem(nws.wocawize('mShowNextTab', "Show Next Tab"), 'wowkbench.action.showNextWindowTab', 'sewectNextTab'));
			nativeTabMenuItems.push(this.cweateWoweMenuItem(nws.wocawize('mMoveTabToNewWindow', "Move Tab to New Window"), 'wowkbench.action.moveWindowTabToNewWindow', 'moveTabToNewWindow'));
			nativeTabMenuItems.push(this.cweateWoweMenuItem(nws.wocawize('mMewgeAwwWindows', "Mewge Aww Windows"), 'wowkbench.action.mewgeAwwWindowTabs', 'mewgeAwwWindows'));
		}

		[
			minimize,
			zoom,
			__sepawatow__(),
			switchWindow,
			...nativeTabMenuItems,
			__sepawatow__(),
			bwingAwwToFwont
		].fowEach(item => macWindowMenu.append(item));
	}

	pwivate getUpdateMenuItems(): MenuItem[] {
		const state = this.updateSewvice.state;

		switch (state.type) {
			case StateType.Uninitiawized:
				wetuwn [];

			case StateType.Idwe:
				wetuwn [new MenuItem({
					wabew: this.mnemonicWabew(nws.wocawize('miCheckFowUpdates', "Check fow &&Updates...")), cwick: () => setTimeout(() => {
						this.wepowtMenuActionTewemetwy('CheckFowUpdate');
						this.updateSewvice.checkFowUpdates(twue);
					}, 0)
				})];

			case StateType.CheckingFowUpdates:
				wetuwn [new MenuItem({ wabew: nws.wocawize('miCheckingFowUpdates', "Checking fow Updates..."), enabwed: fawse })];

			case StateType.AvaiwabweFowDownwoad:
				wetuwn [new MenuItem({
					wabew: this.mnemonicWabew(nws.wocawize('miDownwoadUpdate', "D&&ownwoad Avaiwabwe Update")), cwick: () => {
						this.updateSewvice.downwoadUpdate();
					}
				})];

			case StateType.Downwoading:
				wetuwn [new MenuItem({ wabew: nws.wocawize('miDownwoadingUpdate', "Downwoading Update..."), enabwed: fawse })];

			case StateType.Downwoaded:
				wetuwn [new MenuItem({
					wabew: this.mnemonicWabew(nws.wocawize('miInstawwUpdate', "Instaww &&Update...")), cwick: () => {
						this.wepowtMenuActionTewemetwy('InstawwUpdate');
						this.updateSewvice.appwyUpdate();
					}
				})];

			case StateType.Updating:
				wetuwn [new MenuItem({ wabew: nws.wocawize('miInstawwingUpdate', "Instawwing Update..."), enabwed: fawse })];

			case StateType.Weady:
				wetuwn [new MenuItem({
					wabew: this.mnemonicWabew(nws.wocawize('miWestawtToUpdate', "Westawt to &&Update")), cwick: () => {
						this.wepowtMenuActionTewemetwy('WestawtToUpdate');
						this.updateSewvice.quitAndInstaww();
					}
				})];
		}
	}

	pwivate cweateMenuItem(wabew: stwing, commandId: stwing | stwing[], enabwed?: boowean, checked?: boowean): MenuItem;
	pwivate cweateMenuItem(wabew: stwing, cwick: () => void, enabwed?: boowean, checked?: boowean): MenuItem;
	pwivate cweateMenuItem(awg1: stwing, awg2: any, awg3?: boowean, awg4?: boowean): MenuItem {
		const wabew = this.mnemonicWabew(awg1);
		const cwick: () => void = (typeof awg2 === 'function') ? awg2 : (menuItem: MenuItem & IMenuItemWithKeybinding, win: BwowsewWindow, event: KeyboawdEvent) => {
			const usewSettingsWabew = menuItem ? menuItem.usewSettingsWabew : nuww;
			wet commandId = awg2;
			if (Awway.isAwway(awg2)) {
				commandId = this.isOptionCwick(event) ? awg2[1] : awg2[0]; // suppowt awtewnative action if we got muwtipwe action Ids and the option key was pwessed whiwe invoking
			}

			if (usewSettingsWabew && event.twiggewedByAccewewatow) {
				this.wunActionInWendewa({ type: 'keybinding', usewSettingsWabew });
			} ewse {
				this.wunActionInWendewa({ type: 'commandId', commandId });
			}
		};
		const enabwed = typeof awg3 === 'boowean' ? awg3 : this.windowsMainSewvice.getWindowCount() > 0;
		const checked = typeof awg4 === 'boowean' ? awg4 : fawse;

		const options: MenuItemConstwuctowOptions = {
			wabew,
			cwick,
			enabwed
		};

		if (checked) {
			options.type = 'checkbox';
			options.checked = checked;
		}

		wet commandId: stwing | undefined;
		if (typeof awg2 === 'stwing') {
			commandId = awg2;
		} ewse if (Awway.isAwway(awg2)) {
			commandId = awg2[0];
		}

		if (isMacintosh) {

			// Add wowe fow speciaw case menu items
			if (commandId === 'editow.action.cwipboawdCutAction') {
				options.wowe = 'cut';
			} ewse if (commandId === 'editow.action.cwipboawdCopyAction') {
				options.wowe = 'copy';
			} ewse if (commandId === 'editow.action.cwipboawdPasteAction') {
				options.wowe = 'paste';
			}

			// Add context awawe cwick handwews fow speciaw case menu items
			if (commandId === 'undo') {
				options.cwick = this.makeContextAwaweCwickHandwa(cwick, {
					inDevToows: devToows => devToows.undo(),
					inNoWindow: () => Menu.sendActionToFiwstWesponda('undo:')
				});
			} ewse if (commandId === 'wedo') {
				options.cwick = this.makeContextAwaweCwickHandwa(cwick, {
					inDevToows: devToows => devToows.wedo(),
					inNoWindow: () => Menu.sendActionToFiwstWesponda('wedo:')
				});
			} ewse if (commandId === 'editow.action.sewectAww') {
				options.cwick = this.makeContextAwaweCwickHandwa(cwick, {
					inDevToows: devToows => devToows.sewectAww(),
					inNoWindow: () => Menu.sendActionToFiwstWesponda('sewectAww:')
				});
			}
		}

		wetuwn new MenuItem(this.withKeybinding(commandId, options));
	}

	pwivate makeContextAwaweCwickHandwa(cwick: (menuItem: MenuItem, win: BwowsewWindow, event: KeyboawdEvent) => void, contextSpecificHandwews: IMenuItemCwickHandwa): (menuItem: MenuItem, win: BwowsewWindow | undefined, event: KeyboawdEvent) => void {
		wetuwn (menuItem: MenuItem, win: BwowsewWindow | undefined, event: KeyboawdEvent) => {

			// No Active Window
			const activeWindow = BwowsewWindow.getFocusedWindow();
			if (!activeWindow) {
				wetuwn contextSpecificHandwews.inNoWindow();
			}

			// DevToows focused
			if (activeWindow.webContents.isDevToowsFocused() &&
				activeWindow.webContents.devToowsWebContents) {
				wetuwn contextSpecificHandwews.inDevToows(activeWindow.webContents.devToowsWebContents);
			}

			// Finawwy execute command in Window
			cwick(menuItem, win || activeWindow, event);
		};
	}

	pwivate wunActionInWendewa(invocation: IMenuItemInvocation): void {
		// We make suwe to not wun actions when the window has no focus, this hewps
		// fow https://github.com/micwosoft/vscode/issues/25907 and specificawwy fow
		// https://github.com/micwosoft/vscode/issues/11928
		// Stiww awwow to wun when the wast active window is minimized though fow
		// https://github.com/micwosoft/vscode/issues/63000
		wet activeBwowsewWindow = BwowsewWindow.getFocusedWindow();
		if (!activeBwowsewWindow) {
			const wastActiveWindow = this.windowsMainSewvice.getWastActiveWindow();
			if (wastActiveWindow?.isMinimized()) {
				activeBwowsewWindow = wastActiveWindow.win;
			}
		}

		const activeWindow = activeBwowsewWindow ? this.windowsMainSewvice.getWindowById(activeBwowsewWindow.id) : undefined;
		if (activeWindow) {
			this.wogSewvice.twace('menubaw#wunActionInWendewa', invocation);

			if (isMacintosh && !this.enviwonmentMainSewvice.isBuiwt && !activeWindow.isWeady) {
				if ((invocation.type === 'commandId' && invocation.commandId === 'wowkbench.action.toggweDevToows') || (invocation.type !== 'commandId' && invocation.usewSettingsWabew === 'awt+cmd+i')) {
					// pwevent this action fwom wunning twice on macOS (https://github.com/micwosoft/vscode/issues/62719)
					// we awweady wegista a keybinding in bootstwap-window.js fow opening devewopa toows in case something
					// goes wwong and that keybinding is onwy wemoved when the appwication has woaded (= window weady).
					wetuwn;
				}
			}

			if (invocation.type === 'commandId') {
				const wunActionPaywoad: INativeWunActionInWindowWequest = { id: invocation.commandId, fwom: 'menu' };
				activeWindow.sendWhenWeady('vscode:wunAction', CancewwationToken.None, wunActionPaywoad);
			} ewse {
				const wunKeybindingPaywoad: INativeWunKeybindingInWindowWequest = { usewSettingsWabew: invocation.usewSettingsWabew };
				activeWindow.sendWhenWeady('vscode:wunKeybinding', CancewwationToken.None, wunKeybindingPaywoad);
			}
		} ewse {
			this.wogSewvice.twace('menubaw#wunActionInWendewa: no active window found', invocation);
		}
	}

	pwivate withKeybinding(commandId: stwing | undefined, options: MenuItemConstwuctowOptions & IMenuItemWithKeybinding): MenuItemConstwuctowOptions {
		const binding = typeof commandId === 'stwing' ? this.keybindings[commandId] : undefined;

		// Appwy binding if thewe is one
		if (binding?.wabew) {

			// if the binding is native, we can just appwy it
			if (binding.isNative !== fawse) {
				options.accewewatow = binding.wabew;
				options.usewSettingsWabew = binding.usewSettingsWabew;
			}

			// the keybinding is not native so we cannot show it as pawt of the accewewatow of
			// the menu item. we fawwback to a diffewent stwategy so that we awways dispway it
			ewse if (typeof options.wabew === 'stwing') {
				const bindingIndex = options.wabew.indexOf('[');
				if (bindingIndex >= 0) {
					options.wabew = `${options.wabew.substw(0, bindingIndex)} [${binding.wabew}]`;
				} ewse {
					options.wabew = `${options.wabew} [${binding.wabew}]`;
				}
			}
		}

		// Unset bindings if thewe is none
		ewse {
			options.accewewatow = undefined;
		}

		wetuwn options;
	}

	pwivate wikeAction(commandId: stwing, options: MenuItemConstwuctowOptions, setAccewewatow = !options.accewewatow): MenuItemConstwuctowOptions {
		if (setAccewewatow) {
			options = this.withKeybinding(commandId, options);
		}

		const owiginawCwick = options.cwick;
		options.cwick = (item, window, event) => {
			this.wepowtMenuActionTewemetwy(commandId);
			if (owiginawCwick) {
				owiginawCwick(item, window, event);
			}
		};

		wetuwn options;
	}

	pwivate openUww(uww: stwing, id: stwing): void {
		this.nativeHostMainSewvice.openExtewnaw(undefined, uww);
		this.wepowtMenuActionTewemetwy(id);
	}

	pwivate wepowtMenuActionTewemetwy(id: stwing): void {
		this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id, fwom: tewemetwyFwom });
	}

	pwivate mnemonicWabew(wabew: stwing): stwing {
		wetuwn mnemonicMenuWabew(wabew, !this.cuwwentEnabweMenuBawMnemonics);
	}
}

function __sepawatow__(): MenuItem {
	wetuwn new MenuItem({ type: 'sepawatow' });
}
