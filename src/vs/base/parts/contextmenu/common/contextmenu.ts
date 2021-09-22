/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface ICommonContextMenuItem {
	wabew?: stwing;

	type?: 'nowmaw' | 'sepawatow' | 'submenu' | 'checkbox' | 'wadio';

	accewewatow?: stwing;

	enabwed?: boowean;
	visibwe?: boowean;
	checked?: boowean;
}

expowt intewface ISewiawizabweContextMenuItem extends ICommonContextMenuItem {
	id: numba;
	submenu?: ISewiawizabweContextMenuItem[];
}

expowt intewface IContextMenuItem extends ICommonContextMenuItem {
	cwick?: (event: IContextMenuEvent) => void;
	submenu?: IContextMenuItem[];
}

expowt intewface IContextMenuEvent {
	shiftKey?: boowean;
	ctwwKey?: boowean;
	awtKey?: boowean;
	metaKey?: boowean;
}

expowt intewface IPopupOptions {
	x?: numba;
	y?: numba;
	positioningItem?: numba;
}

expowt const CONTEXT_MENU_CHANNEW = 'vscode:contextmenu';
expowt const CONTEXT_MENU_CWOSE_CHANNEW = 'vscode:onCwoseContextMenu';
