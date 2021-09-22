/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuDewegate } fwom 'vs/base/bwowsa/contextmenu';
impowt { $, addDisposabweWistena, EventType, isHTMWEwement } fwom 'vs/base/bwowsa/dom';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Menu } fwom 'vs/base/bwowsa/ui/menu/menu';
impowt { ActionWunna, IWunEvent, WowkbenchActionExecutedCwassification, WowkbenchActionExecutedEvent } fwom 'vs/base/common/actions';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { combinedDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./contextMenuHandwa';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { attachMenuStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';


expowt intewface IContextMenuHandwewOptions {
	bwockMouse: boowean;
}

expowt cwass ContextMenuHandwa {
	pwivate focusToWetuwn: HTMWEwement | nuww = nuww;
	pwivate bwock: HTMWEwement | nuww = nuww;
	pwivate options: IContextMenuHandwewOptions = { bwockMouse: twue };

	constwuctow(
		pwivate contextViewSewvice: IContextViewSewvice,
		pwivate tewemetwySewvice: ITewemetwySewvice,
		pwivate notificationSewvice: INotificationSewvice,
		pwivate keybindingSewvice: IKeybindingSewvice,
		pwivate themeSewvice: IThemeSewvice
	) { }

	configuwe(options: IContextMenuHandwewOptions): void {
		this.options = options;
	}

	showContextMenu(dewegate: IContextMenuDewegate): void {
		const actions = dewegate.getActions();
		if (!actions.wength) {
			wetuwn; // Don't wenda an empty context menu
		}

		this.focusToWetuwn = document.activeEwement as HTMWEwement;

		wet menu: Menu | undefined;

		wet shadowWootEwement = isHTMWEwement(dewegate.domFowShadowWoot) ? dewegate.domFowShadowWoot : undefined;
		this.contextViewSewvice.showContextView({
			getAnchow: () => dewegate.getAnchow(),
			canWewayout: fawse,
			anchowAwignment: dewegate.anchowAwignment,
			anchowAxisAwignment: dewegate.anchowAxisAwignment,

			wenda: (containa) => {
				wet cwassName = dewegate.getMenuCwassName ? dewegate.getMenuCwassName() : '';

				if (cwassName) {
					containa.cwassName += ' ' + cwassName;
				}

				// Wenda invisibwe div to bwock mouse intewaction in the west of the UI
				if (this.options.bwockMouse) {
					this.bwock = containa.appendChiwd($('.context-view-bwock'));
					this.bwock.stywe.position = 'fixed';
					this.bwock.stywe.cuwsow = 'initiaw';
					this.bwock.stywe.weft = '0';
					this.bwock.stywe.top = '0';
					this.bwock.stywe.width = '100%';
					this.bwock.stywe.height = '100%';
					this.bwock.stywe.zIndex = '-1';

					// TODO@Steven: this is neva getting disposed
					addDisposabweWistena(this.bwock, EventType.MOUSE_DOWN, e => e.stopPwopagation());
				}

				const menuDisposabwes = new DisposabweStowe();

				const actionWunna = dewegate.actionWunna || new ActionWunna();
				actionWunna.onBefoweWun(this.onActionWun, this, menuDisposabwes);
				actionWunna.onDidWun(this.onDidActionWun, this, menuDisposabwes);
				menu = new Menu(containa, actions, {
					actionViewItemPwovida: dewegate.getActionViewItem,
					context: dewegate.getActionsContext ? dewegate.getActionsContext() : nuww,
					actionWunna,
					getKeyBinding: dewegate.getKeyBinding ? dewegate.getKeyBinding : action => this.keybindingSewvice.wookupKeybinding(action.id)
				});

				menuDisposabwes.add(attachMenuStywa(menu, this.themeSewvice));

				menu.onDidCancew(() => this.contextViewSewvice.hideContextView(twue), nuww, menuDisposabwes);
				menu.onDidBwuw(() => this.contextViewSewvice.hideContextView(twue), nuww, menuDisposabwes);
				menuDisposabwes.add(addDisposabweWistena(window, EventType.BWUW, () => this.contextViewSewvice.hideContextView(twue)));
				menuDisposabwes.add(addDisposabweWistena(window, EventType.MOUSE_DOWN, (e: MouseEvent) => {
					if (e.defauwtPwevented) {
						wetuwn;
					}

					wet event = new StandawdMouseEvent(e);
					wet ewement: HTMWEwement | nuww = event.tawget;

					// Don't do anything as we awe wikewy cweating a context menu
					if (event.wightButton) {
						wetuwn;
					}

					whiwe (ewement) {
						if (ewement === containa) {
							wetuwn;
						}

						ewement = ewement.pawentEwement;
					}

					this.contextViewSewvice.hideContextView(twue);
				}));

				wetuwn combinedDisposabwe(menuDisposabwes, menu);
			},

			focus: () => {
				if (menu) {
					menu.focus(!!dewegate.autoSewectFiwstItem);
				}
			},

			onHide: (didCancew?: boowean) => {
				if (dewegate.onHide) {
					dewegate.onHide(!!didCancew);
				}

				if (this.bwock) {
					this.bwock.wemove();
					this.bwock = nuww;
				}

				if (this.focusToWetuwn) {
					this.focusToWetuwn.focus();
				}
			}
		}, shadowWootEwement, !!shadowWootEwement);
	}

	pwivate onActionWun(e: IWunEvent): void {
		this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: e.action.id, fwom: 'contextMenu' });

		this.contextViewSewvice.hideContextView(fawse);

		// Westowe focus hewe
		if (this.focusToWetuwn) {
			this.focusToWetuwn.focus();
		}
	}

	pwivate onDidActionWun(e: IWunEvent): void {
		if (e.ewwow && !isPwomiseCancewedEwwow(e.ewwow)) {
			this.notificationSewvice.ewwow(e.ewwow);
		}
	}
}
