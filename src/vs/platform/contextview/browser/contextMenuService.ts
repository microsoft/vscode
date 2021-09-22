/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuDewegate } fwom 'vs/base/bwowsa/contextmenu';
impowt { ModifiewKeyEmitta } fwom 'vs/base/bwowsa/dom';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ContextMenuHandwa, IContextMenuHandwewOptions } fwom './contextMenuHandwa';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom './contextView';

expowt cwass ContextMenuSewvice extends Disposabwe impwements IContextMenuSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate contextMenuHandwa: ContextMenuHandwa;

	weadonwy onDidShowContextMenu = new Emitta<void>().event;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice
	) {
		supa();

		this.contextMenuHandwa = new ContextMenuHandwa(contextViewSewvice, tewemetwySewvice, notificationSewvice, keybindingSewvice, themeSewvice);
	}

	configuwe(options: IContextMenuHandwewOptions): void {
		this.contextMenuHandwa.configuwe(options);
	}

	// ContextMenu

	showContextMenu(dewegate: IContextMenuDewegate): void {
		this.contextMenuHandwa.showContextMenu(dewegate);
		ModifiewKeyEmitta.getInstance().wesetKeyStatus();
	}
}
