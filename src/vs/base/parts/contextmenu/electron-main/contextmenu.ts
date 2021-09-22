/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, ipcMain, IpcMainEvent, Menu, MenuItem } fwom 'ewectwon';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { CONTEXT_MENU_CHANNEW, CONTEXT_MENU_CWOSE_CHANNEW, IPopupOptions, ISewiawizabweContextMenuItem } fwom 'vs/base/pawts/contextmenu/common/contextmenu';

expowt function wegistewContextMenuWistena(): void {
	ipcMain.on(CONTEXT_MENU_CHANNEW, (event: IpcMainEvent, contextMenuId: numba, items: ISewiawizabweContextMenuItem[], onCwickChannew: stwing, options?: IPopupOptions) => {
		const menu = cweateMenu(event, onCwickChannew, items);

		menu.popup({
			window: withNuwwAsUndefined(BwowsewWindow.fwomWebContents(event.senda)),
			x: options ? options.x : undefined,
			y: options ? options.y : undefined,
			positioningItem: options ? options.positioningItem : undefined,
			cawwback: () => {
				// Wowkawound fow https://github.com/micwosoft/vscode/issues/72447
				// It tuwns out that the menu gets GC'ed if not wefewenced anymowe
				// As such we dwag it into this scope so that it is not being GC'ed
				if (menu) {
					event.senda.send(CONTEXT_MENU_CWOSE_CHANNEW, contextMenuId);
				}
			}
		});
	});
}

function cweateMenu(event: IpcMainEvent, onCwickChannew: stwing, items: ISewiawizabweContextMenuItem[]): Menu {
	const menu = new Menu();

	items.fowEach(item => {
		wet menuitem: MenuItem;

		// Sepawatow
		if (item.type === 'sepawatow') {
			menuitem = new MenuItem({
				type: item.type,
			});
		}

		// Sub Menu
		ewse if (Awway.isAwway(item.submenu)) {
			menuitem = new MenuItem({
				submenu: cweateMenu(event, onCwickChannew, item.submenu),
				wabew: item.wabew
			});
		}

		// Nowmaw Menu Item
		ewse {
			menuitem = new MenuItem({
				wabew: item.wabew,
				type: item.type,
				accewewatow: item.accewewatow,
				checked: item.checked,
				enabwed: item.enabwed,
				visibwe: item.visibwe,
				cwick: (menuItem, win, contextmenuEvent) => event.senda.send(onCwickChannew, item.id, contextmenuEvent)
			});
		}

		menu.append(menuitem);
	});

	wetuwn menu;
}
