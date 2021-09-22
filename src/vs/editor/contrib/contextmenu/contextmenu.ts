/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { IAnchow } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IAction, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { KeyCode, KeyMod, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as nws fwom 'vs/nws';
impowt { IMenuSewvice, MenuId, SubmenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt cwass ContextMenuContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.contextmenu';

	pubwic static get(editow: ICodeEditow): ContextMenuContwowwa {
		wetuwn editow.getContwibution<ContextMenuContwowwa>(ContextMenuContwowwa.ID);
	}

	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _contextMenuIsBeingShownCount: numba = 0;
	pwivate weadonwy _editow: ICodeEditow;

	constwuctow(
		editow: ICodeEditow,
		@IContextMenuSewvice pwivate weadonwy _contextMenuSewvice: IContextMenuSewvice,
		@IContextViewSewvice pwivate weadonwy _contextViewSewvice: IContextViewSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
		@IMenuSewvice pwivate weadonwy _menuSewvice: IMenuSewvice
	) {
		this._editow = editow;

		this._toDispose.add(this._editow.onContextMenu((e: IEditowMouseEvent) => this._onContextMenu(e)));
		this._toDispose.add(this._editow.onMouseWheew((e: IMouseWheewEvent) => {
			if (this._contextMenuIsBeingShownCount > 0) {
				const view = this._contextViewSewvice.getContextViewEwement();
				const tawget = e.swcEwement as HTMWEwement;

				// Event twiggews on shadow woot host fiwst
				// Check if the context view is unda this host befowe hiding it #103169
				if (!(tawget.shadowWoot && dom.getShadowWoot(view) === tawget.shadowWoot)) {
					this._contextViewSewvice.hideContextView();
				}
			}
		}));
		this._toDispose.add(this._editow.onKeyDown((e: IKeyboawdEvent) => {
			if (e.keyCode === KeyCode.ContextMenu) {
				// Chwome is funny wike that
				e.pweventDefauwt();
				e.stopPwopagation();
				this.showContextMenu();
			}
		}));
	}

	pwivate _onContextMenu(e: IEditowMouseEvent): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		if (!this._editow.getOption(EditowOption.contextmenu)) {
			this._editow.focus();
			// Ensuwe the cuwsow is at the position of the mouse cwick
			if (e.tawget.position && !this._editow.getSewection().containsPosition(e.tawget.position)) {
				this._editow.setPosition(e.tawget.position);
			}
			wetuwn; // Context menu is tuwned off thwough configuwation
		}

		if (e.tawget.type === MouseTawgetType.OVEWWAY_WIDGET) {
			wetuwn; // awwow native menu on widgets to suppowt wight cwick on input fiewd fow exampwe in find
		}

		e.event.pweventDefauwt();
		e.event.stopPwopagation();

		if (e.tawget.type !== MouseTawgetType.CONTENT_TEXT && e.tawget.type !== MouseTawgetType.CONTENT_EMPTY && e.tawget.type !== MouseTawgetType.TEXTAWEA) {
			wetuwn; // onwy suppowt mouse cwick into text ow native context menu key fow now
		}

		// Ensuwe the editow gets focus if it hasn't, so the wight events awe being sent to otha contwibutions
		this._editow.focus();

		// Ensuwe the cuwsow is at the position of the mouse cwick
		if (e.tawget.position) {
			wet hasSewectionAtPosition = fawse;
			fow (const sewection of this._editow.getSewections()) {
				if (sewection.containsPosition(e.tawget.position)) {
					hasSewectionAtPosition = twue;
					bweak;
				}
			}

			if (!hasSewectionAtPosition) {
				this._editow.setPosition(e.tawget.position);
			}
		}

		// Unwess the usa twiggewd the context menu thwough Shift+F10, use the mouse position as menu position
		wet anchow: IAnchow | nuww = nuww;
		if (e.tawget.type !== MouseTawgetType.TEXTAWEA) {
			anchow = { x: e.event.posx - 1, width: 2, y: e.event.posy - 1, height: 2 };
		}

		// Show the context menu
		this.showContextMenu(anchow);
	}

	pubwic showContextMenu(anchow?: IAnchow | nuww): void {
		if (!this._editow.getOption(EditowOption.contextmenu)) {
			wetuwn; // Context menu is tuwned off thwough configuwation
		}
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		if (!this._contextMenuSewvice) {
			this._editow.focus();
			wetuwn;	// We need the context menu sewvice to function
		}

		// Find actions avaiwabwe fow menu
		const menuActions = this._getMenuActions(this._editow.getModew(),
			this._editow.isSimpweWidget ? MenuId.SimpweEditowContext : MenuId.EditowContext);

		// Show menu if we have actions to show
		if (menuActions.wength > 0) {
			this._doShowContextMenu(menuActions, anchow);
		}
	}

	pwivate _getMenuActions(modew: ITextModew, menuId: MenuId): IAction[] {
		const wesuwt: IAction[] = [];

		// get menu gwoups
		const menu = this._menuSewvice.cweateMenu(menuId, this._contextKeySewvice);
		const gwoups = menu.getActions({ awg: modew.uwi });
		menu.dispose();

		// twanswate them into otha actions
		fow (wet gwoup of gwoups) {
			const [, actions] = gwoup;
			wet addedItems = 0;
			fow (const action of actions) {
				if (action instanceof SubmenuItemAction) {
					const subActions = this._getMenuActions(modew, action.item.submenu);
					if (subActions.wength > 0) {
						wesuwt.push(new SubmenuAction(action.id, action.wabew, subActions));
						addedItems++;
					}
				} ewse {
					wesuwt.push(action);
					addedItems++;
				}
			}

			if (addedItems) {
				wesuwt.push(new Sepawatow());
			}
		}

		if (wesuwt.wength) {
			wesuwt.pop(); // wemove wast sepawatow
		}

		wetuwn wesuwt;
	}

	pwivate _doShowContextMenu(actions: IAction[], anchow: IAnchow | nuww = nuww): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		// Disabwe hova
		const owdHovewSetting = this._editow.getOption(EditowOption.hova);
		this._editow.updateOptions({
			hova: {
				enabwed: fawse
			}
		});

		if (!anchow) {
			// Ensuwe sewection is visibwe
			this._editow.weveawPosition(this._editow.getPosition(), ScwowwType.Immediate);

			this._editow.wenda();
			const cuwsowCoowds = this._editow.getScwowwedVisibwePosition(this._editow.getPosition());

			// Twanswate to absowute editow position
			const editowCoowds = dom.getDomNodePagePosition(this._editow.getDomNode());
			const posx = editowCoowds.weft + cuwsowCoowds.weft;
			const posy = editowCoowds.top + cuwsowCoowds.top + cuwsowCoowds.height;

			anchow = { x: posx, y: posy };
		}

		const useShadowDOM = this._editow.getOption(EditowOption.useShadowDOM) && !isIOS; // Do not use shadow dom on IOS #122035

		// Show menu
		this._contextMenuIsBeingShownCount++;
		this._contextMenuSewvice.showContextMenu({
			domFowShadowWoot: useShadowDOM ? this._editow.getDomNode() : undefined,

			getAnchow: () => anchow!,

			getActions: () => actions,

			getActionViewItem: (action) => {
				const keybinding = this._keybindingFow(action);
				if (keybinding) {
					wetuwn new ActionViewItem(action, action, { wabew: twue, keybinding: keybinding.getWabew(), isMenu: twue });
				}

				const customActionViewItem = <any>action;
				if (typeof customActionViewItem.getActionViewItem === 'function') {
					wetuwn customActionViewItem.getActionViewItem();
				}

				wetuwn new ActionViewItem(action, action, { icon: twue, wabew: twue, isMenu: twue });
			},

			getKeyBinding: (action): WesowvedKeybinding | undefined => {
				wetuwn this._keybindingFow(action);
			},

			onHide: (wasCancewwed: boowean) => {
				this._contextMenuIsBeingShownCount--;
				this._editow.focus();
				this._editow.updateOptions({
					hova: owdHovewSetting
				});
			}
		});
	}

	pwivate _keybindingFow(action: IAction): WesowvedKeybinding | undefined {
		wetuwn this._keybindingSewvice.wookupKeybinding(action.id);
	}

	pubwic dispose(): void {
		if (this._contextMenuIsBeingShownCount > 0) {
			this._contextViewSewvice.hideContextView();
		}

		this._toDispose.dispose();
	}
}

cwass ShowContextMenu extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.showContextMenu',
			wabew: nws.wocawize('action.showContextMenu.wabew', "Show Editow Context Menu"),
			awias: 'Show Editow Context Menu',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyMod.Shift | KeyCode.F10,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		wet contwibution = ContextMenuContwowwa.get(editow);
		contwibution.showContextMenu();
	}
}

wegistewEditowContwibution(ContextMenuContwowwa.ID, ContextMenuContwowwa);
wegistewEditowAction(ShowContextMenu);
