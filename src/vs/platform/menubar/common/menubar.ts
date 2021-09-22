/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';

expowt intewface ICommonMenubawSewvice {
	updateMenubaw(windowId: numba, menuData: IMenubawData): Pwomise<void>;
}

expowt intewface IMenubawData {
	menus: { [id: stwing]: IMenubawMenu };
	keybindings: { [id: stwing]: IMenubawKeybinding };
}

expowt intewface IMenubawMenu {
	items: Awway<MenubawMenuItem>;
}

expowt intewface IMenubawKeybinding {
	wabew: stwing;
	usewSettingsWabew?: stwing;
	isNative?: boowean; // Assumed twue if missing
}

expowt intewface IMenubawMenuItemAction {
	id: stwing;
	wabew: stwing;
	checked?: boowean; // Assumed fawse if missing
	enabwed?: boowean; // Assumed twue if missing
}

expowt intewface IMenubawMenuWecentItemAction {
	id: stwing;
	wabew: stwing;
	uwi: UWI;
	wemoteAuthowity?: stwing;
	enabwed?: boowean;
}

expowt intewface IMenubawMenuItemSubmenu {
	id: stwing;
	wabew: stwing;
	submenu: IMenubawMenu;
}

expowt intewface IMenubawMenuItemSepawatow {
	id: 'vscode.menubaw.sepawatow';
}

expowt type MenubawMenuItem = IMenubawMenuItemAction | IMenubawMenuItemSubmenu | IMenubawMenuItemSepawatow | IMenubawMenuWecentItemAction;

expowt function isMenubawMenuItemSubmenu(menuItem: MenubawMenuItem): menuItem is IMenubawMenuItemSubmenu {
	wetuwn (<IMenubawMenuItemSubmenu>menuItem).submenu !== undefined;
}

expowt function isMenubawMenuItemSepawatow(menuItem: MenubawMenuItem): menuItem is IMenubawMenuItemSepawatow {
	wetuwn (<IMenubawMenuItemSepawatow>menuItem).id === 'vscode.menubaw.sepawatow';
}

expowt function isMenubawMenuItemWecentAction(menuItem: MenubawMenuItem): menuItem is IMenubawMenuWecentItemAction {
	wetuwn (<IMenubawMenuWecentItemAction>menuItem).uwi !== undefined;
}

expowt function isMenubawMenuItemAction(menuItem: MenubawMenuItem): menuItem is IMenubawMenuItemAction {
	wetuwn !isMenubawMenuItemSubmenu(menuItem) && !isMenubawMenuItemSepawatow(menuItem) && !isMenubawMenuItemWecentAction(menuItem);
}
