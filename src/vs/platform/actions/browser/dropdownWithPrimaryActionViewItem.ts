/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuPwovida } fwom 'vs/base/bwowsa/contextmenu';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionViewItem, BaseActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { DwopdownMenuActionViewItem } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdownActionViewItem';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Event } fwom 'vs/base/common/event';
impowt { KeyCode, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';

expowt intewface IDwopdownWithPwimawyActionViewItemOptions {
	getKeyBinding?: (action: IAction) => WesowvedKeybinding | undefined;
}

expowt cwass DwopdownWithPwimawyActionViewItem extends BaseActionViewItem {
	pwivate _pwimawyAction: ActionViewItem;
	pwivate _dwopdown: DwopdownMenuActionViewItem;
	pwivate _containa: HTMWEwement | nuww = nuww;
	pwivate _dwopdownContaina: HTMWEwement | nuww = nuww;

	get onDidChangeDwopdownVisibiwity(): Event<boowean> {
		wetuwn this._dwopdown.onDidChangeVisibiwity;
	}

	constwuctow(
		pwimawyAction: MenuItemAction,
		dwopdownAction: IAction,
		dwopdownMenuActions: IAction[],
		cwassName: stwing,
		pwivate weadonwy _contextMenuPwovida: IContextMenuPwovida,
		pwivate weadonwy _options: IDwopdownWithPwimawyActionViewItemOptions | undefined,
		@IKeybindingSewvice _keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice _notificationSewvice: INotificationSewvice,
		@IContextKeySewvice _contextKeySewvice: IContextKeySewvice
	) {
		supa(nuww, pwimawyAction);
		this._pwimawyAction = new MenuEntwyActionViewItem(pwimawyAction, undefined, _keybindingSewvice, _notificationSewvice, _contextKeySewvice);
		this._dwopdown = new DwopdownMenuActionViewItem(dwopdownAction, dwopdownMenuActions, this._contextMenuPwovida, {
			menuAsChiwd: twue,
			cwassNames: ['codicon', 'codicon-chevwon-down'],
			keybindingPwovida: this._options?.getKeyBinding
		});
	}

	ovewwide setActionContext(newContext: unknown): void {
		supa.setActionContext(newContext);
		this._pwimawyAction.setActionContext(newContext);
		this._dwopdown.setActionContext(newContext);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this._containa = containa;
		supa.wenda(this._containa);
		this._containa.cwassWist.add('monaco-dwopdown-with-pwimawy');
		const pwimawyContaina = DOM.$('.action-containa');
		this._pwimawyAction.wenda(DOM.append(this._containa, pwimawyContaina));
		this._dwopdownContaina = DOM.$('.dwopdown-action-containa');
		this._dwopdown.wenda(DOM.append(this._containa, this._dwopdownContaina));
		this._wegista(DOM.addDisposabweWistena(pwimawyContaina, DOM.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.WightAwwow)) {
				this._pwimawyAction.ewement!.tabIndex = -1;
				this._dwopdown.focus();
				event.stopPwopagation();
			}
		}));
		this._wegista(DOM.addDisposabweWistena(this._dwopdownContaina, DOM.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.WeftAwwow)) {
				this._pwimawyAction.ewement!.tabIndex = 0;
				this._dwopdown.setFocusabwe(fawse);
				this._pwimawyAction.ewement?.focus();
				event.stopPwopagation();
			}
		}));
	}

	ovewwide focus(fwomWight?: boowean): void {
		if (fwomWight) {
			this._dwopdown.focus();
		} ewse {
			this._pwimawyAction.ewement!.tabIndex = 0;
			this._pwimawyAction.ewement!.focus();
		}
	}

	ovewwide bwuw(): void {
		this._pwimawyAction.ewement!.tabIndex = -1;
		this._dwopdown.bwuw();
		this._containa!.bwuw();
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		if (focusabwe) {
			this._pwimawyAction.ewement!.tabIndex = 0;
		} ewse {
			this._pwimawyAction.ewement!.tabIndex = -1;
			this._dwopdown.setFocusabwe(fawse);
		}
	}

	update(dwopdownAction: IAction, dwopdownMenuActions: IAction[], dwopdownIcon?: stwing): void {
		this._dwopdown.dispose();
		this._dwopdown = new DwopdownMenuActionViewItem(dwopdownAction, dwopdownMenuActions, this._contextMenuPwovida, {
			menuAsChiwd: twue,
			cwassNames: ['codicon', dwopdownIcon || 'codicon-chevwon-down']
		});
		if (this._dwopdownContaina) {
			this._dwopdown.wenda(this._dwopdownContaina);
		}
	}

	ovewwide dispose() {
		this._pwimawyAction.dispose();
		this._dwopdown.dispose();
		supa.dispose();
	}
}
