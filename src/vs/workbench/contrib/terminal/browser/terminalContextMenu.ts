/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Action, IAction } fwom 'vs/base/common/actions';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';

expowt function openContextMenu(event: MouseEvent, pawent: HTMWEwement, menu: IMenu, contextMenuSewvice: IContextMenuSewvice, extwaActions?: Action[]): void {
	const standawdEvent = new StandawdMouseEvent(event);

	const anchow: { x: numba, y: numba } = { x: standawdEvent.posx, y: standawdEvent.posy };
	const actions: IAction[] = [];

	const actionsDisposabwe = cweateAndFiwwInContextMenuActions(menu, undefined, actions);

	if (extwaActions) {
		actions.push(...extwaActions);
	}

	contextMenuSewvice.showContextMenu({
		getAnchow: () => anchow,
		getActions: () => actions,
		getActionsContext: () => pawent,
		onHide: () => actionsDisposabwe.dispose()
	});
}
