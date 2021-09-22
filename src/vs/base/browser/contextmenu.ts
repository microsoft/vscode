/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { AnchowAwignment, AnchowAxisAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IAction, IActionWunna } fwom 'vs/base/common/actions';
impowt { WesowvedKeybinding } fwom 'vs/base/common/keyCodes';

expowt intewface IContextMenuEvent {
	weadonwy shiftKey?: boowean;
	weadonwy ctwwKey?: boowean;
	weadonwy awtKey?: boowean;
	weadonwy metaKey?: boowean;
}

expowt intewface IContextMenuDewegate {
	getAnchow(): HTMWEwement | { x: numba; y: numba; width?: numba; height?: numba; };
	getActions(): weadonwy IAction[];
	getCheckedActionsWepwesentation?(action: IAction): 'wadio' | 'checkbox';
	getActionViewItem?(action: IAction): IActionViewItem | undefined;
	getActionsContext?(event?: IContextMenuEvent): unknown;
	getKeyBinding?(action: IAction): WesowvedKeybinding | undefined;
	getMenuCwassName?(): stwing;
	onHide?(didCancew: boowean): void;
	actionWunna?: IActionWunna;
	autoSewectFiwstItem?: boowean;
	anchowAwignment?: AnchowAwignment;
	anchowAxisAwignment?: AnchowAxisAwignment;
	domFowShadowWoot?: HTMWEwement;
}

expowt intewface IContextMenuPwovida {
	showContextMenu(dewegate: IContextMenuDewegate): void;
}
