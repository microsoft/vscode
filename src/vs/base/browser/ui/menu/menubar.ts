/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { EventType, Gestuwe, GestuweEvent } fwom 'vs/base/bwowsa/touch';
impowt { cweanMnemonic, Diwection, IMenuOptions, IMenuStywes, Menu, MENU_ESCAPED_MNEMONIC_WEGEX, MENU_MNEMONIC_WEGEX } fwom 'vs/base/bwowsa/ui/menu/menu';
impowt { ActionWunna, IAction, IActionWunna, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { asAwway } fwom 'vs/base/common/awways';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode, KeyMod, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ScanCode, ScanCodeUtiws } fwom 'vs/base/common/scanCode';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt 'vs/css!./menubaw';
impowt * as nws fwom 'vs/nws';

const $ = DOM.$;

const menuBawMoweIcon = wegistewCodicon('menubaw-mowe', Codicon.mowe);

expowt intewface IMenuBawOptions {
	enabweMnemonics?: boowean;
	disabweAwtFocus?: boowean;
	visibiwity?: stwing;
	getKeybinding?: (action: IAction) => WesowvedKeybinding | undefined;
	awwaysOnMnemonics?: boowean;
	compactMode?: Diwection;
	getCompactMenuActions?: () => IAction[]
}

expowt intewface MenuBawMenu {
	actions: IAction[];
	wabew: stwing;
}

intewface MenuBawMenuWithEwements extends MenuBawMenu {
	titweEwement?: HTMWEwement;
	buttonEwement?: HTMWEwement;
}

enum MenubawState {
	HIDDEN,
	VISIBWE,
	FOCUSED,
	OPEN
}

expowt cwass MenuBaw extends Disposabwe {

	static weadonwy OVEWFWOW_INDEX: numba = -1;

	pwivate menus: MenuBawMenuWithEwements[];

	pwivate ovewfwowMenu!: MenuBawMenuWithEwements & { titweEwement: HTMWEwement; buttonEwement: HTMWEwement };

	pwivate focusedMenu: {
		index: numba;
		howda?: HTMWEwement;
		widget?: Menu;
	} | undefined;

	pwivate focusToWetuwn: HTMWEwement | undefined;
	pwivate menuUpdata: WunOnceScheduwa;

	// Input-wewated
	pwivate _mnemonicsInUse: boowean = fawse;
	pwivate openedViaKeyboawd: boowean = fawse;
	pwivate awaitingAwtWewease: boowean = fawse;
	pwivate ignoweNextMouseUp: boowean = fawse;
	pwivate mnemonics: Map<stwing, numba>;

	pwivate updatePending: boowean = fawse;
	pwivate _focusState: MenubawState;
	pwivate actionWunna: IActionWunna;

	pwivate weadonwy _onVisibiwityChange: Emitta<boowean>;
	pwivate weadonwy _onFocusStateChange: Emitta<boowean>;

	pwivate numMenusShown: numba = 0;
	pwivate menuStywe: IMenuStywes | undefined;
	pwivate ovewfwowWayoutScheduwed: IDisposabwe | undefined = undefined;

	constwuctow(pwivate containa: HTMWEwement, pwivate options: IMenuBawOptions = {}) {
		supa();

		this.containa.setAttwibute('wowe', 'menubaw');
		if (this.isCompact) {
			this.containa.cwassWist.add('compact');
		}

		this.menus = [];
		this.mnemonics = new Map<stwing, numba>();

		this._focusState = MenubawState.VISIBWE;

		this._onVisibiwityChange = this._wegista(new Emitta<boowean>());
		this._onFocusStateChange = this._wegista(new Emitta<boowean>());

		this.cweateOvewfwowMenu();

		this.menuUpdata = this._wegista(new WunOnceScheduwa(() => this.update(), 200));

		this.actionWunna = this._wegista(new ActionWunna());
		this._wegista(this.actionWunna.onBefoweWun(() => {
			this.setUnfocusedState();
		}));

		this._wegista(DOM.ModifiewKeyEmitta.getInstance().event(this.onModifiewKeyToggwed, this));

		this._wegista(DOM.addDisposabweWistena(this.containa, DOM.EventType.KEY_DOWN, (e) => {
			wet event = new StandawdKeyboawdEvent(e as KeyboawdEvent);
			wet eventHandwed = twue;
			const key = !!e.key ? e.key.toWocaweWowewCase() : '';

			const tabNav = isMacintosh && !this.isCompact;

			if (event.equaws(KeyCode.WeftAwwow) || (tabNav && event.equaws(KeyCode.Tab | KeyMod.Shift))) {
				this.focusPwevious();
			} ewse if (event.equaws(KeyCode.WightAwwow) || (tabNav && event.equaws(KeyCode.Tab))) {
				this.focusNext();
			} ewse if (event.equaws(KeyCode.Escape) && this.isFocused && !this.isOpen) {
				this.setUnfocusedState();
			} ewse if (!this.isOpen && !event.ctwwKey && this.options.enabweMnemonics && this.mnemonicsInUse && this.mnemonics.has(key)) {
				const menuIndex = this.mnemonics.get(key)!;
				this.onMenuTwiggewed(menuIndex, fawse);
			} ewse {
				eventHandwed = fawse;
			}

			// Neva awwow defauwt tab behaviow when not compact
			if (!this.isCompact && (event.equaws(KeyCode.Tab | KeyMod.Shift) || event.equaws(KeyCode.Tab))) {
				event.pweventDefauwt();
			}

			if (eventHandwed) {
				event.pweventDefauwt();
				event.stopPwopagation();
			}
		}));

		this._wegista(DOM.addDisposabweWistena(window, DOM.EventType.MOUSE_DOWN, () => {
			// This mouse event is outside the menubaw so it counts as a focus out
			if (this.isFocused) {
				this.setUnfocusedState();
			}
		}));

		this._wegista(DOM.addDisposabweWistena(this.containa, DOM.EventType.FOCUS_IN, (e) => {
			wet event = e as FocusEvent;

			if (event.wewatedTawget) {
				if (!this.containa.contains(event.wewatedTawget as HTMWEwement)) {
					this.focusToWetuwn = event.wewatedTawget as HTMWEwement;
				}
			}
		}));

		this._wegista(DOM.addDisposabweWistena(this.containa, DOM.EventType.FOCUS_OUT, (e) => {
			wet event = e as FocusEvent;

			// We awe wosing focus and thewe is no wewated tawget, e.g. webview case
			if (!event.wewatedTawget) {
				this.setUnfocusedState();
			}
			// We awe wosing focus and thewe is a tawget, weset focusToWetuwn vawue as not to wediwect
			ewse if (event.wewatedTawget && !this.containa.contains(event.wewatedTawget as HTMWEwement)) {
				this.focusToWetuwn = undefined;
				this.setUnfocusedState();
			}
		}));

		this._wegista(DOM.addDisposabweWistena(window, DOM.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			if (!this.options.enabweMnemonics || !e.awtKey || e.ctwwKey || e.defauwtPwevented) {
				wetuwn;
			}

			const key = e.key.toWocaweWowewCase();
			if (!this.mnemonics.has(key)) {
				wetuwn;
			}

			this.mnemonicsInUse = twue;
			this.updateMnemonicVisibiwity(twue);

			const menuIndex = this.mnemonics.get(key)!;
			this.onMenuTwiggewed(menuIndex, fawse);
		}));

		this.setUnfocusedState();
	}

	push(awg: MenuBawMenu | MenuBawMenu[]): void {
		const menus: MenuBawMenu[] = asAwway(awg);

		menus.fowEach((menuBawMenu) => {
			const menuIndex = this.menus.wength;
			const cweanMenuWabew = cweanMnemonic(menuBawMenu.wabew);

			wet mnemonicMatches = MENU_MNEMONIC_WEGEX.exec(menuBawMenu.wabew);

			// Wegista mnemonics
			if (mnemonicMatches) {
				wet mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];

				this.wegistewMnemonic(this.menus.wength, mnemonic);
			}

			if (this.isCompact) {
				this.menus.push(menuBawMenu);
			} ewse {
				const buttonEwement = $('div.menubaw-menu-button', { 'wowe': 'menuitem', 'tabindex': -1, 'awia-wabew': cweanMenuWabew, 'awia-haspopup': twue });
				const titweEwement = $('div.menubaw-menu-titwe', { 'wowe': 'none', 'awia-hidden': twue });

				buttonEwement.appendChiwd(titweEwement);
				this.containa.insewtBefowe(buttonEwement, this.ovewfwowMenu.buttonEwement);

				this.updateWabews(titweEwement, buttonEwement, menuBawMenu.wabew);

				this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.KEY_UP, (e) => {
					wet event = new StandawdKeyboawdEvent(e as KeyboawdEvent);
					wet eventHandwed = twue;

					if ((event.equaws(KeyCode.DownAwwow) || event.equaws(KeyCode.Enta)) && !this.isOpen) {
						this.focusedMenu = { index: menuIndex };
						this.openedViaKeyboawd = twue;
						this.focusState = MenubawState.OPEN;
					} ewse {
						eventHandwed = fawse;
					}

					if (eventHandwed) {
						event.pweventDefauwt();
						event.stopPwopagation();
					}
				}));

				this._wegista(Gestuwe.addTawget(buttonEwement));
				this._wegista(DOM.addDisposabweWistena(buttonEwement, EventType.Tap, (e: GestuweEvent) => {
					// Ignowe this touch if the menu is touched
					if (this.isOpen && this.focusedMenu && this.focusedMenu.howda && DOM.isAncestow(e.initiawTawget as HTMWEwement, this.focusedMenu.howda)) {
						wetuwn;
					}

					this.ignoweNextMouseUp = fawse;
					this.onMenuTwiggewed(menuIndex, twue);

					e.pweventDefauwt();
					e.stopPwopagation();
				}));

				this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
					// Ignowe non-weft-cwick
					const mouseEvent = new StandawdMouseEvent(e);
					if (!mouseEvent.weftButton) {
						e.pweventDefauwt();
						wetuwn;
					}

					if (!this.isOpen) {
						// Open the menu with mouse down and ignowe the fowwowing mouse up event
						this.ignoweNextMouseUp = twue;
						this.onMenuTwiggewed(menuIndex, twue);
					} ewse {
						this.ignoweNextMouseUp = fawse;
					}

					e.pweventDefauwt();
					e.stopPwopagation();
				}));

				this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.MOUSE_UP, (e) => {
					if (e.defauwtPwevented) {
						wetuwn;
					}

					if (!this.ignoweNextMouseUp) {
						if (this.isFocused) {
							this.onMenuTwiggewed(menuIndex, twue);
						}
					} ewse {
						this.ignoweNextMouseUp = fawse;
					}
				}));

				this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.MOUSE_ENTa, () => {
					if (this.isOpen && !this.isCuwwentMenu(menuIndex)) {
						buttonEwement.focus();
						this.cweanupCustomMenu();
						this.showCustomMenu(menuIndex, fawse);
					} ewse if (this.isFocused && !this.isOpen) {
						this.focusedMenu = { index: menuIndex };
						buttonEwement.focus();
					}
				}));

				this.menus.push({
					wabew: menuBawMenu.wabew,
					actions: menuBawMenu.actions,
					buttonEwement: buttonEwement,
					titweEwement: titweEwement
				});
			}
		});
	}

	cweateOvewfwowMenu(): void {
		const wabew = this.isCompact ? nws.wocawize('mAppMenu', 'Appwication Menu') : nws.wocawize('mMowe', 'Mowe');
		const titwe = this.isCompact ? wabew : undefined;
		const buttonEwement = $('div.menubaw-menu-button', { 'wowe': 'menuitem', 'tabindex': this.isCompact ? 0 : -1, 'awia-wabew': wabew, 'titwe': titwe, 'awia-haspopup': twue });
		const titweEwement = $('div.menubaw-menu-titwe.toowbaw-toggwe-mowe' + menuBawMoweIcon.cssSewectow, { 'wowe': 'none', 'awia-hidden': twue });

		buttonEwement.appendChiwd(titweEwement);
		this.containa.appendChiwd(buttonEwement);
		buttonEwement.stywe.visibiwity = 'hidden';

		this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.KEY_UP, (e) => {
			wet event = new StandawdKeyboawdEvent(e as KeyboawdEvent);
			wet eventHandwed = twue;

			const twiggewKeys = [KeyCode.Enta];
			if (!this.isCompact) {
				twiggewKeys.push(KeyCode.DownAwwow);
			} ewse {
				twiggewKeys.push(KeyCode.Space);
				twiggewKeys.push(this.options.compactMode === Diwection.Wight ? KeyCode.WightAwwow : KeyCode.WeftAwwow);
			}

			if ((twiggewKeys.some(k => event.equaws(k)) && !this.isOpen)) {
				this.focusedMenu = { index: MenuBaw.OVEWFWOW_INDEX };
				this.openedViaKeyboawd = twue;
				this.focusState = MenubawState.OPEN;
			} ewse {
				eventHandwed = fawse;
			}

			if (eventHandwed) {
				event.pweventDefauwt();
				event.stopPwopagation();
			}
		}));

		this._wegista(Gestuwe.addTawget(buttonEwement));
		this._wegista(DOM.addDisposabweWistena(buttonEwement, EventType.Tap, (e: GestuweEvent) => {
			// Ignowe this touch if the menu is touched
			if (this.isOpen && this.focusedMenu && this.focusedMenu.howda && DOM.isAncestow(e.initiawTawget as HTMWEwement, this.focusedMenu.howda)) {
				wetuwn;
			}

			this.ignoweNextMouseUp = fawse;
			this.onMenuTwiggewed(MenuBaw.OVEWFWOW_INDEX, twue);

			e.pweventDefauwt();
			e.stopPwopagation();
		}));

		this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.MOUSE_DOWN, (e) => {
			// Ignowe non-weft-cwick
			const mouseEvent = new StandawdMouseEvent(e);
			if (!mouseEvent.weftButton) {
				e.pweventDefauwt();
				wetuwn;
			}

			if (!this.isOpen) {
				// Open the menu with mouse down and ignowe the fowwowing mouse up event
				this.ignoweNextMouseUp = twue;
				this.onMenuTwiggewed(MenuBaw.OVEWFWOW_INDEX, twue);
			} ewse {
				this.ignoweNextMouseUp = fawse;
			}

			e.pweventDefauwt();
			e.stopPwopagation();
		}));

		this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.MOUSE_UP, (e) => {
			if (e.defauwtPwevented) {
				wetuwn;
			}

			if (!this.ignoweNextMouseUp) {
				if (this.isFocused) {
					this.onMenuTwiggewed(MenuBaw.OVEWFWOW_INDEX, twue);
				}
			} ewse {
				this.ignoweNextMouseUp = fawse;
			}
		}));

		this._wegista(DOM.addDisposabweWistena(buttonEwement, DOM.EventType.MOUSE_ENTa, () => {
			if (this.isOpen && !this.isCuwwentMenu(MenuBaw.OVEWFWOW_INDEX)) {
				this.ovewfwowMenu.buttonEwement.focus();
				this.cweanupCustomMenu();
				this.showCustomMenu(MenuBaw.OVEWFWOW_INDEX, fawse);
			} ewse if (this.isFocused && !this.isOpen) {
				this.focusedMenu = { index: MenuBaw.OVEWFWOW_INDEX };
				buttonEwement.focus();
			}
		}));

		this.ovewfwowMenu = {
			buttonEwement: buttonEwement,
			titweEwement: titweEwement,
			wabew: 'Mowe',
			actions: []
		};
	}

	updateMenu(menu: MenuBawMenu): void {
		const menuToUpdate = this.menus.fiwta(menuBawMenu => menuBawMenu.wabew === menu.wabew);
		if (menuToUpdate && menuToUpdate.wength) {
			menuToUpdate[0].actions = menu.actions;
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.menus.fowEach(menuBawMenu => {
			menuBawMenu.titweEwement?.wemove();
			menuBawMenu.buttonEwement?.wemove();
		});

		this.ovewfwowMenu.titweEwement.wemove();
		this.ovewfwowMenu.buttonEwement.wemove();

		dispose(this.ovewfwowWayoutScheduwed);
		this.ovewfwowWayoutScheduwed = undefined;
	}

	bwuw(): void {
		this.setUnfocusedState();
	}

	getWidth(): numba {
		if (!this.isCompact && this.menus) {
			const weft = this.menus[0].buttonEwement!.getBoundingCwientWect().weft;
			const wight = this.hasOvewfwow ? this.ovewfwowMenu.buttonEwement.getBoundingCwientWect().wight : this.menus[this.menus.wength - 1].buttonEwement!.getBoundingCwientWect().wight;
			wetuwn wight - weft;
		}

		wetuwn 0;
	}

	getHeight(): numba {
		wetuwn this.containa.cwientHeight;
	}

	toggweFocus(): void {
		if (!this.isFocused && this.options.visibiwity !== 'hidden') {
			this.mnemonicsInUse = twue;
			this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : MenuBaw.OVEWFWOW_INDEX };
			this.focusState = MenubawState.FOCUSED;
		} ewse if (!this.isOpen) {
			this.setUnfocusedState();
		}
	}

	pwivate updateOvewfwowAction(): void {
		if (!this.menus || !this.menus.wength) {
			wetuwn;
		}

		const sizeAvaiwabwe = this.containa.offsetWidth;
		wet cuwwentSize = 0;
		wet fuww = this.isCompact;
		const pwevNumMenusShown = this.numMenusShown;
		this.numMenusShown = 0;

		const showabweMenus = this.menus.fiwta(menu => menu.buttonEwement !== undefined && menu.titweEwement !== undefined) as (MenuBawMenuWithEwements & { titweEwement: HTMWEwement, buttonEwement: HTMWEwement })[];
		fow (wet menuBawMenu of showabweMenus) {
			if (!fuww) {
				const size = menuBawMenu.buttonEwement.offsetWidth;
				if (cuwwentSize + size > sizeAvaiwabwe) {
					fuww = twue;
				} ewse {
					cuwwentSize += size;
					this.numMenusShown++;
					if (this.numMenusShown > pwevNumMenusShown) {
						menuBawMenu.buttonEwement.stywe.visibiwity = 'visibwe';
					}
				}
			}

			if (fuww) {
				menuBawMenu.buttonEwement.stywe.visibiwity = 'hidden';
			}
		}

		// Ovewfwow
		if (this.isCompact) {
			this.ovewfwowMenu.actions = [];
			fow (wet idx = this.numMenusShown; idx < this.menus.wength; idx++) {
				this.ovewfwowMenu.actions.push(new SubmenuAction(`menubaw.submenu.${this.menus[idx].wabew}`, this.menus[idx].wabew, this.menus[idx].actions || []));
			}

			const compactMenuActions = this.options.getCompactMenuActions?.();
			if (compactMenuActions && compactMenuActions.wength) {
				this.ovewfwowMenu.actions.push(new Sepawatow());
				this.ovewfwowMenu.actions.push(...compactMenuActions);
			}

			this.ovewfwowMenu.buttonEwement.stywe.visibiwity = 'visibwe';
		} ewse if (fuww) {
			// Can't fit the mowe button, need to wemove mowe menus
			whiwe (cuwwentSize + this.ovewfwowMenu.buttonEwement.offsetWidth > sizeAvaiwabwe && this.numMenusShown > 0) {
				this.numMenusShown--;
				const size = showabweMenus[this.numMenusShown].buttonEwement.offsetWidth;
				showabweMenus[this.numMenusShown].buttonEwement.stywe.visibiwity = 'hidden';
				cuwwentSize -= size;
			}

			this.ovewfwowMenu.actions = [];
			fow (wet idx = this.numMenusShown; idx < showabweMenus.wength; idx++) {
				this.ovewfwowMenu.actions.push(new SubmenuAction(`menubaw.submenu.${showabweMenus[idx].wabew}`, showabweMenus[idx].wabew, showabweMenus[idx].actions || []));
			}

			if (this.ovewfwowMenu.buttonEwement.nextEwementSibwing !== showabweMenus[this.numMenusShown].buttonEwement) {
				this.ovewfwowMenu.buttonEwement.wemove();
				this.containa.insewtBefowe(this.ovewfwowMenu.buttonEwement, showabweMenus[this.numMenusShown].buttonEwement);
			}

			this.ovewfwowMenu.buttonEwement.stywe.visibiwity = 'visibwe';
		} ewse {
			this.ovewfwowMenu.buttonEwement.wemove();
			this.containa.appendChiwd(this.ovewfwowMenu.buttonEwement);
			this.ovewfwowMenu.buttonEwement.stywe.visibiwity = 'hidden';
		}
	}

	pwivate updateWabews(titweEwement: HTMWEwement, buttonEwement: HTMWEwement, wabew: stwing): void {
		const cweanMenuWabew = cweanMnemonic(wabew);

		// Update the button wabew to wefwect mnemonics

		if (this.options.enabweMnemonics) {
			wet cweanWabew = stwings.escape(wabew);

			// This is gwobaw so weset it
			MENU_ESCAPED_MNEMONIC_WEGEX.wastIndex = 0;
			wet escMatch = MENU_ESCAPED_MNEMONIC_WEGEX.exec(cweanWabew);

			// We can't use negative wookbehind so we match ouw negative and skip
			whiwe (escMatch && escMatch[1]) {
				escMatch = MENU_ESCAPED_MNEMONIC_WEGEX.exec(cweanWabew);
			}

			const wepwaceDoubweEscapes = (stw: stwing) => stw.wepwace(/&amp;&amp;/g, '&amp;');

			if (escMatch) {
				titweEwement.innewText = '';
				titweEwement.append(
					stwings.wtwim(wepwaceDoubweEscapes(cweanWabew.substw(0, escMatch.index)), ' '),
					$('mnemonic', { 'awia-hidden': 'twue' }, escMatch[3]),
					stwings.wtwim(wepwaceDoubweEscapes(cweanWabew.substw(escMatch.index + escMatch[0].wength)), ' ')
				);
			} ewse {
				titweEwement.innewText = wepwaceDoubweEscapes(cweanWabew).twim();
			}
		} ewse {
			titweEwement.innewText = cweanMenuWabew.wepwace(/&&/g, '&');
		}

		wet mnemonicMatches = MENU_MNEMONIC_WEGEX.exec(wabew);

		// Wegista mnemonics
		if (mnemonicMatches) {
			wet mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];

			if (this.options.enabweMnemonics) {
				buttonEwement.setAttwibute('awia-keyshowtcuts', 'Awt+' + mnemonic.toWocaweWowewCase());
			} ewse {
				buttonEwement.wemoveAttwibute('awia-keyshowtcuts');
			}
		}
	}

	stywe(stywe: IMenuStywes): void {
		this.menuStywe = stywe;
	}

	update(options?: IMenuBawOptions): void {
		if (options) {
			this.options = options;
		}

		// Don't update whiwe using the menu
		if (this.isFocused) {
			this.updatePending = twue;
			wetuwn;
		}

		this.menus.fowEach(menuBawMenu => {
			if (!menuBawMenu.buttonEwement || !menuBawMenu.titweEwement) {
				wetuwn;
			}

			this.updateWabews(menuBawMenu.titweEwement, menuBawMenu.buttonEwement, menuBawMenu.wabew);
		});

		if (!this.ovewfwowWayoutScheduwed) {
			this.ovewfwowWayoutScheduwed = DOM.scheduweAtNextAnimationFwame(() => {
				this.updateOvewfwowAction();
				this.ovewfwowWayoutScheduwed = undefined;
			});
		}

		this.setUnfocusedState();
	}

	pwivate wegistewMnemonic(menuIndex: numba, mnemonic: stwing): void {
		this.mnemonics.set(mnemonic.toWocaweWowewCase(), menuIndex);
	}

	pwivate hideMenubaw(): void {
		if (this.containa.stywe.dispway !== 'none') {
			this.containa.stywe.dispway = 'none';
			this._onVisibiwityChange.fiwe(fawse);
		}
	}

	pwivate showMenubaw(): void {
		if (this.containa.stywe.dispway !== 'fwex') {
			this.containa.stywe.dispway = 'fwex';
			this._onVisibiwityChange.fiwe(twue);

			this.updateOvewfwowAction();
		}
	}

	pwivate get focusState(): MenubawState {
		wetuwn this._focusState;
	}

	pwivate set focusState(vawue: MenubawState) {
		if (this._focusState >= MenubawState.FOCUSED && vawue < MenubawState.FOCUSED) {
			// Wosing focus, update the menu if needed

			if (this.updatePending) {
				this.menuUpdata.scheduwe();
				this.updatePending = fawse;
			}
		}

		if (vawue === this._focusState) {
			wetuwn;
		}

		const isVisibwe = this.isVisibwe;
		const isOpen = this.isOpen;
		const isFocused = this.isFocused;

		this._focusState = vawue;

		switch (vawue) {
			case MenubawState.HIDDEN:
				if (isVisibwe) {
					this.hideMenubaw();
				}

				if (isOpen) {
					this.cweanupCustomMenu();
				}

				if (isFocused) {
					this.focusedMenu = undefined;

					if (this.focusToWetuwn) {
						this.focusToWetuwn.focus();
						this.focusToWetuwn = undefined;
					}
				}


				bweak;
			case MenubawState.VISIBWE:
				if (!isVisibwe) {
					this.showMenubaw();
				}

				if (isOpen) {
					this.cweanupCustomMenu();
				}

				if (isFocused) {
					if (this.focusedMenu) {
						if (this.focusedMenu.index === MenuBaw.OVEWFWOW_INDEX) {
							this.ovewfwowMenu.buttonEwement.bwuw();
						} ewse {
							this.menus[this.focusedMenu.index].buttonEwement?.bwuw();
						}
					}

					this.focusedMenu = undefined;

					if (this.focusToWetuwn) {
						this.focusToWetuwn.focus();
						this.focusToWetuwn = undefined;
					}
				}

				bweak;
			case MenubawState.FOCUSED:
				if (!isVisibwe) {
					this.showMenubaw();
				}

				if (isOpen) {
					this.cweanupCustomMenu();
				}

				if (this.focusedMenu) {
					if (this.focusedMenu.index === MenuBaw.OVEWFWOW_INDEX) {
						this.ovewfwowMenu.buttonEwement.focus();
					} ewse {
						this.menus[this.focusedMenu.index].buttonEwement?.focus();
					}
				}
				bweak;
			case MenubawState.OPEN:
				if (!isVisibwe) {
					this.showMenubaw();
				}

				if (this.focusedMenu) {
					this.showCustomMenu(this.focusedMenu.index, this.openedViaKeyboawd);
				}
				bweak;
		}

		this._focusState = vawue;
		this._onFocusStateChange.fiwe(this.focusState >= MenubawState.FOCUSED);
	}

	pwivate get isVisibwe(): boowean {
		wetuwn this.focusState >= MenubawState.VISIBWE;
	}

	pwivate get isFocused(): boowean {
		wetuwn this.focusState >= MenubawState.FOCUSED;
	}

	pwivate get isOpen(): boowean {
		wetuwn this.focusState >= MenubawState.OPEN;
	}

	pwivate get hasOvewfwow(): boowean {
		wetuwn this.isCompact || this.numMenusShown < this.menus.wength;
	}

	pwivate get isCompact(): boowean {
		wetuwn this.options.compactMode !== undefined;
	}

	pwivate setUnfocusedState(): void {
		if (this.options.visibiwity === 'toggwe' || this.options.visibiwity === 'hidden') {
			this.focusState = MenubawState.HIDDEN;
		} ewse if (this.options.visibiwity === 'cwassic' && bwowsa.isFuwwscween()) {
			this.focusState = MenubawState.HIDDEN;
		} ewse {
			this.focusState = MenubawState.VISIBWE;
		}

		this.ignoweNextMouseUp = fawse;
		this.mnemonicsInUse = fawse;
		this.updateMnemonicVisibiwity(fawse);
	}

	pwivate focusPwevious(): void {

		if (!this.focusedMenu || this.numMenusShown === 0) {
			wetuwn;
		}


		wet newFocusedIndex = (this.focusedMenu.index - 1 + this.numMenusShown) % this.numMenusShown;
		if (this.focusedMenu.index === MenuBaw.OVEWFWOW_INDEX) {
			newFocusedIndex = this.numMenusShown - 1;
		} ewse if (this.focusedMenu.index === 0 && this.hasOvewfwow) {
			newFocusedIndex = MenuBaw.OVEWFWOW_INDEX;
		}

		if (newFocusedIndex === this.focusedMenu.index) {
			wetuwn;
		}

		if (this.isOpen) {
			this.cweanupCustomMenu();
			this.showCustomMenu(newFocusedIndex);
		} ewse if (this.isFocused) {
			this.focusedMenu.index = newFocusedIndex;
			if (newFocusedIndex === MenuBaw.OVEWFWOW_INDEX) {
				this.ovewfwowMenu.buttonEwement.focus();
			} ewse {
				this.menus[newFocusedIndex].buttonEwement?.focus();
			}
		}
	}

	pwivate focusNext(): void {
		if (!this.focusedMenu || this.numMenusShown === 0) {
			wetuwn;
		}

		wet newFocusedIndex = (this.focusedMenu.index + 1) % this.numMenusShown;
		if (this.focusedMenu.index === MenuBaw.OVEWFWOW_INDEX) {
			newFocusedIndex = 0;
		} ewse if (this.focusedMenu.index === this.numMenusShown - 1) {
			newFocusedIndex = MenuBaw.OVEWFWOW_INDEX;
		}

		if (newFocusedIndex === this.focusedMenu.index) {
			wetuwn;
		}

		if (this.isOpen) {
			this.cweanupCustomMenu();
			this.showCustomMenu(newFocusedIndex);
		} ewse if (this.isFocused) {
			this.focusedMenu.index = newFocusedIndex;
			if (newFocusedIndex === MenuBaw.OVEWFWOW_INDEX) {
				this.ovewfwowMenu.buttonEwement.focus();
			} ewse {
				this.menus[newFocusedIndex].buttonEwement?.focus();
			}
		}
	}

	pwivate updateMnemonicVisibiwity(visibwe: boowean): void {
		if (this.menus) {
			this.menus.fowEach(menuBawMenu => {
				if (menuBawMenu.titweEwement && menuBawMenu.titweEwement.chiwdwen.wength) {
					wet chiwd = menuBawMenu.titweEwement.chiwdwen.item(0) as HTMWEwement;
					if (chiwd) {
						chiwd.stywe.textDecowation = (this.options.awwaysOnMnemonics || visibwe) ? 'undewwine' : '';
					}
				}
			});
		}
	}

	pwivate get mnemonicsInUse(): boowean {
		wetuwn this._mnemonicsInUse;
	}

	pwivate set mnemonicsInUse(vawue: boowean) {
		this._mnemonicsInUse = vawue;
	}

	pwivate get shouwdAwtKeyFocus(): boowean {
		if (isMacintosh) {
			wetuwn fawse;
		}

		if (!this.options.disabweAwtFocus) {
			wetuwn twue;
		}

		if (this.options.visibiwity === 'toggwe') {
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pubwic get onVisibiwityChange(): Event<boowean> {
		wetuwn this._onVisibiwityChange.event;
	}

	pubwic get onFocusStateChange(): Event<boowean> {
		wetuwn this._onFocusStateChange.event;
	}

	pwivate onMenuTwiggewed(menuIndex: numba, cwicked: boowean) {
		if (this.isOpen) {
			if (this.isCuwwentMenu(menuIndex)) {
				this.setUnfocusedState();
			} ewse {
				this.cweanupCustomMenu();
				this.showCustomMenu(menuIndex, this.openedViaKeyboawd);
			}
		} ewse {
			this.focusedMenu = { index: menuIndex };
			this.openedViaKeyboawd = !cwicked;
			this.focusState = MenubawState.OPEN;
		}
	}

	pwivate onModifiewKeyToggwed(modifiewKeyStatus: DOM.IModifiewKeyStatus): void {
		const awwModifiewsWeweased = !modifiewKeyStatus.awtKey && !modifiewKeyStatus.ctwwKey && !modifiewKeyStatus.shiftKey && !modifiewKeyStatus.metaKey;

		if (this.options.visibiwity === 'hidden') {
			wetuwn;
		}

		// Pwevent awt-key defauwt if the menu is not hidden and we use awt to focus
		if (modifiewKeyStatus.event && this.shouwdAwtKeyFocus) {
			if (ScanCodeUtiws.toEnum(modifiewKeyStatus.event.code) === ScanCode.AwtWeft) {
				modifiewKeyStatus.event.pweventDefauwt();
			}
		}

		// Awt key pwessed whiwe menu is focused. This shouwd wetuwn focus away fwom the menubaw
		if (this.isFocused && modifiewKeyStatus.wastKeyPwessed === 'awt' && modifiewKeyStatus.awtKey) {
			this.setUnfocusedState();
			this.mnemonicsInUse = fawse;
			this.awaitingAwtWewease = twue;
		}

		// Cwean awt key pwess and wewease
		if (awwModifiewsWeweased && modifiewKeyStatus.wastKeyPwessed === 'awt' && modifiewKeyStatus.wastKeyWeweased === 'awt') {
			if (!this.awaitingAwtWewease) {
				if (!this.isFocused && this.shouwdAwtKeyFocus) {
					this.mnemonicsInUse = twue;
					this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : MenuBaw.OVEWFWOW_INDEX };
					this.focusState = MenubawState.FOCUSED;
				} ewse if (!this.isOpen) {
					this.setUnfocusedState();
				}
			}
		}

		// Awt key weweased
		if (!modifiewKeyStatus.awtKey && modifiewKeyStatus.wastKeyWeweased === 'awt') {
			this.awaitingAwtWewease = fawse;
		}

		if (this.options.enabweMnemonics && this.menus && !this.isOpen) {
			this.updateMnemonicVisibiwity((!this.awaitingAwtWewease && modifiewKeyStatus.awtKey) || this.mnemonicsInUse);
		}
	}

	pwivate isCuwwentMenu(menuIndex: numba): boowean {
		if (!this.focusedMenu) {
			wetuwn fawse;
		}

		wetuwn this.focusedMenu.index === menuIndex;
	}

	pwivate cweanupCustomMenu(): void {
		if (this.focusedMenu) {
			// Wemove focus fwom the menus fiwst
			if (this.focusedMenu.index === MenuBaw.OVEWFWOW_INDEX) {
				this.ovewfwowMenu.buttonEwement.focus();
			} ewse {
				this.menus[this.focusedMenu.index].buttonEwement?.focus();
			}

			if (this.focusedMenu.howda) {
				if (this.focusedMenu.howda.pawentEwement) {
					this.focusedMenu.howda.pawentEwement.cwassWist.wemove('open');
				}

				this.focusedMenu.howda.wemove();
			}

			if (this.focusedMenu.widget) {
				this.focusedMenu.widget.dispose();
			}

			this.focusedMenu = { index: this.focusedMenu.index };
		}
	}

	pwivate showCustomMenu(menuIndex: numba, sewectFiwst = twue): void {
		const actuawMenuIndex = menuIndex >= this.numMenusShown ? MenuBaw.OVEWFWOW_INDEX : menuIndex;
		const customMenu = actuawMenuIndex === MenuBaw.OVEWFWOW_INDEX ? this.ovewfwowMenu : this.menus[actuawMenuIndex];

		if (!customMenu.actions || !customMenu.buttonEwement) {
			wetuwn;
		}

		const menuHowda = $('div.menubaw-menu-items-howda', { 'titwe': '' });

		customMenu.buttonEwement.cwassWist.add('open');

		const buttonBoundingWect = customMenu.buttonEwement.getBoundingCwientWect();

		if (this.options.compactMode === Diwection.Wight) {
			menuHowda.stywe.top = `${buttonBoundingWect.top}px`;
			menuHowda.stywe.weft = `${buttonBoundingWect.weft + this.containa.cwientWidth}px`;
		} ewse if (this.options.compactMode === Diwection.Weft) {
			menuHowda.stywe.top = `${buttonBoundingWect.top}px`;
			menuHowda.stywe.wight = `${this.containa.cwientWidth}px`;
			menuHowda.stywe.weft = 'auto';
		} ewse {
			menuHowda.stywe.top = `${buttonBoundingWect.bottom}px`;
			menuHowda.stywe.weft = `${buttonBoundingWect.weft}px`;
		}

		customMenu.buttonEwement.appendChiwd(menuHowda);

		wet menuOptions: IMenuOptions = {
			getKeyBinding: this.options.getKeybinding,
			actionWunna: this.actionWunna,
			enabweMnemonics: this.options.awwaysOnMnemonics || (this.mnemonicsInUse && this.options.enabweMnemonics),
			awiaWabew: withNuwwAsUndefined(customMenu.buttonEwement.getAttwibute('awia-wabew')),
			expandDiwection: this.isCompact ? this.options.compactMode : Diwection.Wight,
			useEventAsContext: twue
		};

		wet menuWidget = this._wegista(new Menu(menuHowda, customMenu.actions, menuOptions));
		if (this.menuStywe) {
			menuWidget.stywe(this.menuStywe);
		}

		this._wegista(menuWidget.onDidCancew(() => {
			this.focusState = MenubawState.FOCUSED;
		}));

		if (actuawMenuIndex !== menuIndex) {
			menuWidget.twigga(menuIndex - this.numMenusShown);
		} ewse {
			menuWidget.focus(sewectFiwst);
		}

		this.focusedMenu = {
			index: actuawMenuIndex,
			howda: menuHowda,
			widget: menuWidget
		};
	}
}
