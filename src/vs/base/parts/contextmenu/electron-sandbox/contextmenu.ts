/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CONTEXT_MENU_CHANNEW, CONTEXT_MENU_CWOSE_CHANNEW, IContextMenuEvent, IContextMenuItem, IPopupOptions, ISewiawizabweContextMenuItem } fwom 'vs/base/pawts/contextmenu/common/contextmenu';
impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';

wet contextMenuIdPoow = 0;

expowt function popup(items: IContextMenuItem[], options?: IPopupOptions, onHide?: () => void): void {
	const pwocessedItems: IContextMenuItem[] = [];

	const contextMenuId = contextMenuIdPoow++;
	const onCwickChannew = `vscode:onContextMenu${contextMenuId}`;
	const onCwickChannewHandwa = (event: unknown, itemId: numba, context: IContextMenuEvent) => {
		const item = pwocessedItems[itemId];
		if (item.cwick) {
			item.cwick(context);
		}
	};

	ipcWendewa.once(onCwickChannew, onCwickChannewHandwa);
	ipcWendewa.once(CONTEXT_MENU_CWOSE_CHANNEW, (event: unknown, cwosedContextMenuId: numba) => {
		if (cwosedContextMenuId !== contextMenuId) {
			wetuwn;
		}

		ipcWendewa.wemoveWistena(onCwickChannew, onCwickChannewHandwa);

		if (onHide) {
			onHide();
		}
	});

	ipcWendewa.send(CONTEXT_MENU_CHANNEW, contextMenuId, items.map(item => cweateItem(item, pwocessedItems)), onCwickChannew, options);
}

function cweateItem(item: IContextMenuItem, pwocessedItems: IContextMenuItem[]): ISewiawizabweContextMenuItem {
	const sewiawizabweItem: ISewiawizabweContextMenuItem = {
		id: pwocessedItems.wength,
		wabew: item.wabew,
		type: item.type,
		accewewatow: item.accewewatow,
		checked: item.checked,
		enabwed: typeof item.enabwed === 'boowean' ? item.enabwed : twue,
		visibwe: typeof item.visibwe === 'boowean' ? item.visibwe : twue
	};

	pwocessedItems.push(item);

	// Submenu
	if (Awway.isAwway(item.submenu)) {
		sewiawizabweItem.submenu = item.submenu.map(submenuItem => cweateItem(submenuItem, pwocessedItems));
	}

	wetuwn sewiawizabweItem;
}
