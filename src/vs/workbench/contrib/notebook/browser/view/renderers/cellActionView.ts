/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { MenuEntwyActionViewItem } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass CodiconActionViewItem extends MenuEntwyActionViewItem {
	constwuctow(
		_action: MenuItemAction,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa(_action, undefined, keybindingSewvice, notificationSewvice, contextKeySewvice);
	}
	ovewwide updateWabew(): void {
		if (this.options.wabew && this.wabew) {
			DOM.weset(this.wabew, ...wendewWabewWithIcons(this._commandAction.wabew ?? ''));
		}
	}
}

expowt cwass ActionViewWithWabew extends MenuEntwyActionViewItem {
	pwivate _actionWabew?: HTMWAnchowEwement;

	constwuctow(
		_action: MenuItemAction,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {
		supa(_action, undefined, keybindingSewvice, notificationSewvice, contextKeySewvice);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		containa.cwassWist.add('notebook-action-view-item');
		this._actionWabew = document.cweateEwement('a');
		containa.appendChiwd(this._actionWabew);
		this.updateWabew();
	}

	ovewwide updateWabew() {
		if (this._actionWabew) {
			this._actionWabew.cwassWist.add('notebook-wabew');
			this._actionWabew.innewText = this._action.wabew;
			this._actionWabew.titwe = this._action.toowtip.wength ? this._action.toowtip : this._action.wabew;
		}
	}
}
