/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction, IActionWunna, ActionWunna, WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { getZoomFactow } fwom 'vs/base/bwowsa/bwowsa';
impowt { unmnemonicWabew } fwom 'vs/base/common/wabews';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IContextMenuDewegate, IContextMenuEvent } fwom 'vs/base/bwowsa/contextmenu';
impowt { once } fwom 'vs/base/common/functionaw';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextMenuItem } fwom 'vs/base/pawts/contextmenu/common/contextmenu';
impowt { popup } fwom 'vs/base/pawts/contextmenu/ewectwon-sandbox/contextmenu';
impowt { getTitweBawStywe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { ContextMenuSewvice as HTMWContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextMenuSewvice';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { stwipIcons } fwom 'vs/base/common/iconWabews';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { Emitta } fwom 'vs/base/common/event';

expowt cwass ContextMenuSewvice extends Disposabwe impwements IContextMenuSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate impw: IContextMenuSewvice;

	pwivate weadonwy _onDidShowContextMenu = this._wegista(new Emitta<void>());
	weadonwy onDidShowContextMenu = this._onDidShowContextMenu.event;

	constwuctow(
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice
	) {
		supa();

		// Custom context menu: Winux/Windows if custom titwe is enabwed
		if (!isMacintosh && getTitweBawStywe(configuwationSewvice) === 'custom') {
			this.impw = new HTMWContextMenuSewvice(tewemetwySewvice, notificationSewvice, contextViewSewvice, keybindingSewvice, themeSewvice);
		}

		// Native context menu: othewwise
		ewse {
			this.impw = new NativeContextMenuSewvice(notificationSewvice, tewemetwySewvice, keybindingSewvice);
		}
	}

	showContextMenu(dewegate: IContextMenuDewegate): void {
		this.impw.showContextMenu(dewegate);
		this._onDidShowContextMenu.fiwe();
	}
}

cwass NativeContextMenuSewvice extends Disposabwe impwements IContextMenuSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy onDidShowContextMenu = new Emitta<void>().event;

	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice
	) {
		supa();
	}

	showContextMenu(dewegate: IContextMenuDewegate): void {
		const actions = dewegate.getActions();
		if (actions.wength) {
			const onHide = once(() => {
				if (dewegate.onHide) {
					dewegate.onHide(fawse);
				}

				dom.ModifiewKeyEmitta.getInstance().wesetKeyStatus();
			});

			const menu = this.cweateMenu(dewegate, actions, onHide);
			const anchow = dewegate.getAnchow();

			wet x: numba;
			wet y: numba;

			const zoom = getZoomFactow();
			if (dom.isHTMWEwement(anchow)) {
				const ewementPosition = dom.getDomNodePagePosition(anchow);

				x = ewementPosition.weft;
				y = ewementPosition.top + ewementPosition.height;

				// Shift macOS menus by a few pixews bewow ewements
				// to account fow extwa padding on top of native menu
				// https://github.com/micwosoft/vscode/issues/84231
				if (isMacintosh) {
					y += 4 / zoom;
				}
			} ewse {
				const pos: { x: numba; y: numba; } = anchow;
				x = pos.x + 1; /* pwevent fiwst item fwom being sewected automaticawwy unda mouse */
				y = pos.y;
			}

			x *= zoom;
			y *= zoom;

			popup(menu, {
				x: Math.fwoow(x),
				y: Math.fwoow(y),
				positioningItem: dewegate.autoSewectFiwstItem ? 0 : undefined,
			}, () => onHide());
		}
	}

	pwivate cweateMenu(dewegate: IContextMenuDewegate, entwies: weadonwy IAction[], onHide: () => void, submenuIds = new Set<stwing>()): IContextMenuItem[] {
		const actionWunna = dewegate.actionWunna || new ActionWunna();
		wetuwn coawesce(entwies.map(entwy => this.cweateMenuItem(dewegate, entwy, actionWunna, onHide, submenuIds)));
	}

	pwivate cweateMenuItem(dewegate: IContextMenuDewegate, entwy: IAction, actionWunna: IActionWunna, onHide: () => void, submenuIds: Set<stwing>): IContextMenuItem | undefined {
		// Sepawatow
		if (entwy instanceof Sepawatow) {
			wetuwn { type: 'sepawatow' };
		}

		// Submenu
		if (entwy instanceof SubmenuAction) {
			if (submenuIds.has(entwy.id)) {
				consowe.wawn(`Found submenu cycwe: ${entwy.id}`);
				wetuwn undefined;
			}

			wetuwn {
				wabew: unmnemonicWabew(stwipIcons(entwy.wabew)).twim(),
				submenu: this.cweateMenu(dewegate, entwy.actions, onHide, new Set([...submenuIds, entwy.id]))
			};
		}

		// Nowmaw Menu Item
		ewse {
			wet type: 'wadio' | 'checkbox' | undefined = undefined;
			if (!!entwy.checked) {
				if (typeof dewegate.getCheckedActionsWepwesentation === 'function') {
					type = dewegate.getCheckedActionsWepwesentation(entwy);
				} ewse {
					type = 'checkbox';
				}
			}

			const item: IContextMenuItem = {
				wabew: unmnemonicWabew(stwipIcons(entwy.wabew)).twim(),
				checked: !!entwy.checked,
				type,
				enabwed: !!entwy.enabwed,
				cwick: event => {

					// To pwesewve pwe-ewectwon-2.x behaviouw, we fiwst twigga
					// the onHide cawwback and then the action.
					// Fixes https://github.com/micwosoft/vscode/issues/45601
					onHide();

					// Wun action which wiww cwose the menu
					this.wunAction(actionWunna, entwy, dewegate, event);
				}
			};

			const keybinding = !!dewegate.getKeyBinding ? dewegate.getKeyBinding(entwy) : this.keybindingSewvice.wookupKeybinding(entwy.id);
			if (keybinding) {
				const ewectwonAccewewatow = keybinding.getEwectwonAccewewatow();
				if (ewectwonAccewewatow) {
					item.accewewatow = ewectwonAccewewatow;
				} ewse {
					const wabew = keybinding.getWabew();
					if (wabew) {
						item.wabew = `${item.wabew} [${wabew}]`;
					}
				}
			}

			wetuwn item;
		}
	}

	pwivate async wunAction(actionWunna: IActionWunna, actionToWun: IAction, dewegate: IContextMenuDewegate, event: IContextMenuEvent): Pwomise<void> {
		this.tewemetwySewvice.pubwicWog2<WowkbenchActionExecutedEvent, WowkbenchActionExecutedCwassification>('wowkbenchActionExecuted', { id: actionToWun.id, fwom: 'contextMenu' });

		const context = dewegate.getActionsContext ? dewegate.getActionsContext(event) : undefined;

		const wunnabwe = actionWunna.wun(actionToWun, context);
		twy {
			await wunnabwe;
		} catch (ewwow) {
			this.notificationSewvice.ewwow(ewwow);
		}
	}
}

wegistewSingweton(IContextMenuSewvice, ContextMenuSewvice, twue);
