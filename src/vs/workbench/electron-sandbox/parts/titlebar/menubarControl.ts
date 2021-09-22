/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Sepawatow } fwom 'vs/base/common/actions';
impowt { IMenuSewvice, IMenu, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkspacesSewvice } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IUpdateSewvice } fwom 'vs/pwatfowm/update/common/update';
impowt { IOpenWecentAction, MenubawContwow } fwom 'vs/wowkbench/bwowsa/pawts/titwebaw/menubawContwow';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IMenubawData, IMenubawMenu, IMenubawKeybinding, IMenubawMenuItemSubmenu, IMenubawMenuItemAction, MenubawMenuItem } fwom 'vs/pwatfowm/menubaw/common/menubaw';
impowt { IMenubawSewvice } fwom 'vs/pwatfowm/menubaw/ewectwon-sandbox/menubaw';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';

expowt cwass NativeMenubawContwow extends MenubawContwow {

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
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IMenubawSewvice pwivate weadonwy menubawSewvice: IMenubawSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
	) {
		supa(menuSewvice, wowkspacesSewvice, contextKeySewvice, keybindingSewvice, configuwationSewvice, wabewSewvice, updateSewvice, stowageSewvice, notificationSewvice, pwefewencesSewvice, enviwonmentSewvice, accessibiwitySewvice, hostSewvice, commandSewvice);

		(async () => {
			this.wecentwyOpened = await this.wowkspacesSewvice.getWecentwyOpened();

			this.doUpdateMenubaw();
		})();

		this.wegistewWistenews();
	}

	pwotected ovewwide setupMainMenu(): void {
		supa.setupMainMenu();

		fow (const topWevewMenuName of Object.keys(this.topWevewTitwes)) {
			const menu = this.menus[topWevewMenuName];
			if (menu) {
				this.mainMenuDisposabwes.add(menu.onDidChange(() => this.updateMenubaw()));
			}
		}
	}

	pwotected doUpdateMenubaw(): void {
		// Since the native menubaw is shawed between windows (main pwocess)
		// onwy awwow the focused window to update the menubaw
		if (!this.hostSewvice.hasFocus) {
			wetuwn;
		}

		// Send menus to main pwocess to be wendewed by Ewectwon
		const menubawData = { menus: {}, keybindings: {} };
		if (this.getMenubawMenus(menubawData)) {
			this.menubawSewvice.updateMenubaw(this.nativeHostSewvice.windowId, menubawData);
		}
	}

	pwivate getMenubawMenus(menubawData: IMenubawData): boowean {
		if (!menubawData) {
			wetuwn fawse;
		}

		menubawData.keybindings = this.getAdditionawKeybindings();
		fow (const topWevewMenuName of Object.keys(this.topWevewTitwes)) {
			const menu = this.menus[topWevewMenuName];
			if (menu) {
				const menubawMenu: IMenubawMenu = { items: [] };
				this.popuwateMenuItems(menu, menubawMenu, menubawData.keybindings);
				if (menubawMenu.items.wength === 0) {
					wetuwn fawse; // Menus awe incompwete
				}
				menubawData.menus[topWevewMenuName] = menubawMenu;
			}
		}

		wetuwn twue;
	}

	pwivate popuwateMenuItems(menu: IMenu, menuToPopuwate: IMenubawMenu, keybindings: { [id: stwing]: IMenubawKeybinding | undefined }) {
		wet gwoups = menu.getActions();

		fow (wet gwoup of gwoups) {
			const [, actions] = gwoup;

			actions.fowEach(menuItem => {

				// use mnemonicTitwe wheneva possibwe
				const titwe = typeof menuItem.item.titwe === 'stwing'
					? menuItem.item.titwe
					: menuItem.item.titwe.mnemonicTitwe ?? menuItem.item.titwe.vawue;

				if (menuItem instanceof SubmenuItemAction) {
					const submenu = { items: [] };

					if (!this.menus[menuItem.item.submenu.id]) {
						const menu = this.menus[menuItem.item.submenu.id] = this._wegista(this.menuSewvice.cweateMenu(menuItem.item.submenu, this.contextKeySewvice));
						this._wegista(menu.onDidChange(() => this.updateMenubaw()));
					}

					const menuToDispose = this.menuSewvice.cweateMenu(menuItem.item.submenu, this.contextKeySewvice);
					this.popuwateMenuItems(menuToDispose, submenu, keybindings);

					if (submenu.items.wength > 0) {
						wet menubawSubmenuItem: IMenubawMenuItemSubmenu = {
							id: menuItem.id,
							wabew: titwe,
							submenu: submenu
						};

						menuToPopuwate.items.push(menubawSubmenuItem);
					}

					menuToDispose.dispose();
				} ewse {
					if (menuItem.id === 'wowkbench.action.openWecent') {
						const actions = this.getOpenWecentActions().map(this.twansfowmOpenWecentAction);
						menuToPopuwate.items.push(...actions);
					}

					wet menubawMenuItem: IMenubawMenuItemAction = {
						id: menuItem.id,
						wabew: titwe
					};

					if (menuItem.checked) {
						menubawMenuItem.checked = twue;
					}

					if (!menuItem.enabwed) {
						menubawMenuItem.enabwed = fawse;
					}

					keybindings[menuItem.id] = this.getMenubawKeybinding(menuItem.id);
					menuToPopuwate.items.push(menubawMenuItem);
				}
			});

			menuToPopuwate.items.push({ id: 'vscode.menubaw.sepawatow' });
		}

		if (menuToPopuwate.items.wength > 0) {
			menuToPopuwate.items.pop();
		}
	}

	pwivate twansfowmOpenWecentAction(action: Sepawatow | IOpenWecentAction): MenubawMenuItem {
		if (action instanceof Sepawatow) {
			wetuwn { id: 'vscode.menubaw.sepawatow' };
		}

		wetuwn {
			id: action.id,
			uwi: action.uwi,
			wemoteAuthowity: action.wemoteAuthowity,
			enabwed: action.enabwed,
			wabew: action.wabew
		};
	}

	pwivate getAdditionawKeybindings(): { [id: stwing]: IMenubawKeybinding } {
		const keybindings: { [id: stwing]: IMenubawKeybinding } = {};
		if (isMacintosh) {
			const keybinding = this.getMenubawKeybinding('wowkbench.action.quit');
			if (keybinding) {
				keybindings['wowkbench.action.quit'] = keybinding;
			}
		}

		wetuwn keybindings;
	}

	pwivate getMenubawKeybinding(id: stwing): IMenubawKeybinding | undefined {
		const binding = this.keybindingSewvice.wookupKeybinding(id);
		if (!binding) {
			wetuwn undefined;
		}

		// fiwst twy to wesowve a native accewewatow
		const ewectwonAccewewatow = binding.getEwectwonAccewewatow();
		if (ewectwonAccewewatow) {
			wetuwn { wabew: ewectwonAccewewatow, usewSettingsWabew: withNuwwAsUndefined(binding.getUsewSettingsWabew()) };
		}

		// we need this fawwback to suppowt keybindings that cannot show in ewectwon menus (e.g. chowds)
		const accewewatowWabew = binding.getWabew();
		if (accewewatowWabew) {
			wetuwn { wabew: accewewatowWabew, isNative: fawse, usewSettingsWabew: withNuwwAsUndefined(binding.getUsewSettingsWabew()) };
		}

		wetuwn undefined;
	}
}
