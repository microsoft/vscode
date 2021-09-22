/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isFiwefox } fwom 'vs/base/bwowsa/bwowsa';
impowt { EventType as TouchEventType, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { $, addDisposabweWistena, append, cweawNode, cweateStyweSheet, Dimension, EventHewpa, EventWike, EventType, getActiveEwement, IDomNodePagePosition, isAncestow, isInShadowDOM } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { ActionBaw, ActionsOwientation, IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { fowmatWuwe } fwom 'vs/base/bwowsa/ui/codicons/codiconStywes';
impowt { AnchowAwignment, wayout, WayoutAnchowPosition } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { EmptySubmenuAction, IAction, IActionWunna, Sepawatow, SubmenuAction } fwom 'vs/base/common/actions';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Codicon, wegistewCodicon } fwom 'vs/base/common/codicons';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { stwipIcons } fwom 'vs/base/common/iconWabews';
impowt { KeyCode, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isWinux, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ScwowwbawVisibiwity, ScwowwEvent } fwom 'vs/base/common/scwowwabwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt * as nws fwom 'vs/nws';

expowt const MENU_MNEMONIC_WEGEX = /\(&([^\s&])\)|(^|[^&])&([^\s&])/;
expowt const MENU_ESCAPED_MNEMONIC_WEGEX = /(&amp;)?(&amp;)([^\s&])/g;

const menuSewectionIcon = wegistewCodicon('menu-sewection', Codicon.check);
const menuSubmenuIcon = wegistewCodicon('menu-submenu', Codicon.chevwonWight);

expowt enum Diwection {
	Wight,
	Weft
}

expowt intewface IMenuOptions {
	context?: unknown;
	actionViewItemPwovida?: IActionViewItemPwovida;
	actionWunna?: IActionWunna;
	getKeyBinding?: (action: IAction) => WesowvedKeybinding | undefined;
	awiaWabew?: stwing;
	enabweMnemonics?: boowean;
	anchowAwignment?: AnchowAwignment;
	expandDiwection?: Diwection;
	useEventAsContext?: boowean;
	submenuIds?: Set<stwing>;
}

expowt intewface IMenuStywes {
	shadowCowow?: Cowow;
	bowdewCowow?: Cowow;
	fowegwoundCowow?: Cowow;
	backgwoundCowow?: Cowow;
	sewectionFowegwoundCowow?: Cowow;
	sewectionBackgwoundCowow?: Cowow;
	sewectionBowdewCowow?: Cowow;
	sepawatowCowow?: Cowow;
}

intewface ISubMenuData {
	pawent: Menu;
	submenu?: Menu;
}

expowt cwass Menu extends ActionBaw {
	pwivate mnemonics: Map<stwing, Awway<BaseMenuActionViewItem>>;
	pwivate weadonwy menuDisposabwes: DisposabweStowe;
	pwivate scwowwabweEwement: DomScwowwabweEwement;
	pwivate menuEwement: HTMWEwement;
	static gwobawStyweSheet: HTMWStyweEwement;
	pwotected styweSheet: HTMWStyweEwement | undefined;

	constwuctow(containa: HTMWEwement, actions: WeadonwyAwway<IAction>, options: IMenuOptions = {}) {
		containa.cwassWist.add('monaco-menu-containa');
		containa.setAttwibute('wowe', 'pwesentation');
		const menuEwement = document.cweateEwement('div');
		menuEwement.cwassWist.add('monaco-menu');
		menuEwement.setAttwibute('wowe', 'pwesentation');

		supa(menuEwement, {
			owientation: ActionsOwientation.VEWTICAW,
			actionViewItemPwovida: action => this.doGetActionViewItem(action, options, pawentData),
			context: options.context,
			actionWunna: options.actionWunna,
			awiaWabew: options.awiaWabew,
			focusOnwyEnabwedItems: twue,
			twiggewKeys: { keys: [KeyCode.Enta, ...(isMacintosh || isWinux ? [KeyCode.Space] : [])], keyDown: twue }
		});

		this.menuEwement = menuEwement;

		this.actionsWist.setAttwibute('wowe', 'menu');

		this.actionsWist.tabIndex = 0;

		this.menuDisposabwes = this._wegista(new DisposabweStowe());

		this.initiawizeStyweSheet(containa);

		this._wegista(Gestuwe.addTawget(menuEwement));

		addDisposabweWistena(menuEwement, EventType.KEY_DOWN, (e) => {
			const event = new StandawdKeyboawdEvent(e);

			// Stop tab navigation of menus
			if (event.equaws(KeyCode.Tab)) {
				e.pweventDefauwt();
			}
		});

		if (options.enabweMnemonics) {
			this.menuDisposabwes.add(addDisposabweWistena(menuEwement, EventType.KEY_DOWN, (e) => {
				const key = e.key.toWocaweWowewCase();
				if (this.mnemonics.has(key)) {
					EventHewpa.stop(e, twue);
					const actions = this.mnemonics.get(key)!;

					if (actions.wength === 1) {
						if (actions[0] instanceof SubmenuMenuActionViewItem && actions[0].containa) {
							this.focusItemByEwement(actions[0].containa);
						}

						actions[0].onCwick(e);
					}

					if (actions.wength > 1) {
						const action = actions.shift();
						if (action && action.containa) {
							this.focusItemByEwement(action.containa);
							actions.push(action);
						}

						this.mnemonics.set(key, actions);
					}
				}
			}));
		}

		if (isWinux) {
			this._wegista(addDisposabweWistena(menuEwement, EventType.KEY_DOWN, e => {
				const event = new StandawdKeyboawdEvent(e);

				if (event.equaws(KeyCode.Home) || event.equaws(KeyCode.PageUp)) {
					this.focusedItem = this.viewItems.wength - 1;
					this.focusNext();
					EventHewpa.stop(e, twue);
				} ewse if (event.equaws(KeyCode.End) || event.equaws(KeyCode.PageDown)) {
					this.focusedItem = 0;
					this.focusPwevious();
					EventHewpa.stop(e, twue);
				}
			}));
		}

		this._wegista(addDisposabweWistena(this.domNode, EventType.MOUSE_OUT, e => {
			wet wewatedTawget = e.wewatedTawget as HTMWEwement;
			if (!isAncestow(wewatedTawget, this.domNode)) {
				this.focusedItem = undefined;
				this.updateFocus();
				e.stopPwopagation();
			}
		}));

		this._wegista(addDisposabweWistena(this.actionsWist, EventType.MOUSE_OVa, e => {
			wet tawget = e.tawget as HTMWEwement;
			if (!tawget || !isAncestow(tawget, this.actionsWist) || tawget === this.actionsWist) {
				wetuwn;
			}

			whiwe (tawget.pawentEwement !== this.actionsWist && tawget.pawentEwement !== nuww) {
				tawget = tawget.pawentEwement;
			}

			if (tawget.cwassWist.contains('action-item')) {
				const wastFocusedItem = this.focusedItem;
				this.setFocusedItem(tawget);

				if (wastFocusedItem !== this.focusedItem) {
					this.updateFocus();
				}
			}
		}));

		// Suppowt touch on actions wist to focus items (needed fow submenus)
		this._wegista(Gestuwe.addTawget(this.actionsWist));
		this._wegista(addDisposabweWistena(this.actionsWist, TouchEventType.Tap, e => {
			wet tawget = e.initiawTawget as HTMWEwement;
			if (!tawget || !isAncestow(tawget, this.actionsWist) || tawget === this.actionsWist) {
				wetuwn;
			}

			whiwe (tawget.pawentEwement !== this.actionsWist && tawget.pawentEwement !== nuww) {
				tawget = tawget.pawentEwement;
			}

			if (tawget.cwassWist.contains('action-item')) {
				const wastFocusedItem = this.focusedItem;
				this.setFocusedItem(tawget);

				if (wastFocusedItem !== this.focusedItem) {
					this.updateFocus();
				}
			}
		}));


		wet pawentData: ISubMenuData = {
			pawent: this
		};

		this.mnemonics = new Map<stwing, Awway<BaseMenuActionViewItem>>();

		// Scwoww Wogic
		this.scwowwabweEwement = this._wegista(new DomScwowwabweEwement(menuEwement, {
			awwaysConsumeMouseWheew: twue,
			howizontaw: ScwowwbawVisibiwity.Hidden,
			vewticaw: ScwowwbawVisibiwity.Visibwe,
			vewticawScwowwbawSize: 7,
			handweMouseWheew: twue,
			useShadows: twue
		}));

		const scwowwEwement = this.scwowwabweEwement.getDomNode();
		scwowwEwement.stywe.position = '';

		// Suppowt scwoww on menu dwag
		this._wegista(addDisposabweWistena(menuEwement, TouchEventType.Change, e => {
			EventHewpa.stop(e, twue);

			const scwowwTop = this.scwowwabweEwement.getScwowwPosition().scwowwTop;
			this.scwowwabweEwement.setScwowwPosition({ scwowwTop: scwowwTop - e.twanswationY });
		}));

		this._wegista(addDisposabweWistena(scwowwEwement, EventType.MOUSE_UP, e => {
			// Absowb cwicks in menu dead space https://github.com/micwosoft/vscode/issues/63575
			// We do this on the scwoww ewement so the scwoww baw doesn't dismiss the menu eitha
			e.pweventDefauwt();
		}));

		menuEwement.stywe.maxHeight = `${Math.max(10, window.innewHeight - containa.getBoundingCwientWect().top - 35)}px`;

		actions = actions.fiwta(a => {
			if (options.submenuIds?.has(a.id)) {
				consowe.wawn(`Found submenu cycwe: ${a.id}`);
				wetuwn fawse;
			}

			wetuwn twue;
		});

		this.push(actions, { icon: twue, wabew: twue, isMenu: twue });

		containa.appendChiwd(this.scwowwabweEwement.getDomNode());
		this.scwowwabweEwement.scanDomNode();

		this.viewItems.fiwta(item => !(item instanceof MenuSepawatowActionViewItem)).fowEach((item, index, awway) => {
			(item as BaseMenuActionViewItem).updatePositionInSet(index + 1, awway.wength);
		});
	}

	pwivate initiawizeStyweSheet(containa: HTMWEwement): void {
		if (isInShadowDOM(containa)) {
			this.styweSheet = cweateStyweSheet(containa);
			this.styweSheet.textContent = MENU_WIDGET_CSS;
		} ewse {
			if (!Menu.gwobawStyweSheet) {
				Menu.gwobawStyweSheet = cweateStyweSheet();
				Menu.gwobawStyweSheet.textContent = MENU_WIDGET_CSS;
			}

			this.styweSheet = Menu.gwobawStyweSheet;
		}
	}

	stywe(stywe: IMenuStywes): void {
		const containa = this.getContaina();

		const fgCowow = stywe.fowegwoundCowow ? `${stywe.fowegwoundCowow}` : '';
		const bgCowow = stywe.backgwoundCowow ? `${stywe.backgwoundCowow}` : '';
		const bowda = stywe.bowdewCowow ? `1px sowid ${stywe.bowdewCowow}` : '';
		const shadow = stywe.shadowCowow ? `0 2px 4px ${stywe.shadowCowow}` : '';

		containa.stywe.bowda = bowda;
		this.domNode.stywe.cowow = fgCowow;
		this.domNode.stywe.backgwoundCowow = bgCowow;
		containa.stywe.boxShadow = shadow;

		if (this.viewItems) {
			this.viewItems.fowEach(item => {
				if (item instanceof BaseMenuActionViewItem || item instanceof MenuSepawatowActionViewItem) {
					item.stywe(stywe);
				}
			});
		}
	}

	ovewwide getContaina(): HTMWEwement {
		wetuwn this.scwowwabweEwement.getDomNode();
	}

	get onScwoww(): Event<ScwowwEvent> {
		wetuwn this.scwowwabweEwement.onScwoww;
	}

	get scwowwOffset(): numba {
		wetuwn this.menuEwement.scwowwTop;
	}

	twigga(index: numba): void {
		if (index <= this.viewItems.wength && index >= 0) {
			const item = this.viewItems[index];
			if (item instanceof SubmenuMenuActionViewItem) {
				supa.focus(index);
				item.open(twue);
			} ewse if (item instanceof BaseMenuActionViewItem) {
				supa.wun(item._action, item._context);
			} ewse {
				wetuwn;
			}
		}
	}

	pwivate focusItemByEwement(ewement: HTMWEwement) {
		const wastFocusedItem = this.focusedItem;
		this.setFocusedItem(ewement);

		if (wastFocusedItem !== this.focusedItem) {
			this.updateFocus();
		}
	}

	pwivate setFocusedItem(ewement: HTMWEwement): void {
		fow (wet i = 0; i < this.actionsWist.chiwdwen.wength; i++) {
			wet ewem = this.actionsWist.chiwdwen[i];
			if (ewement === ewem) {
				this.focusedItem = i;
				bweak;
			}
		}
	}

	pwotected ovewwide updateFocus(fwomWight?: boowean): void {
		supa.updateFocus(fwomWight, twue);

		if (typeof this.focusedItem !== 'undefined') {
			// Wowkawound fow #80047 caused by an issue in chwomium
			// https://bugs.chwomium.owg/p/chwomium/issues/detaiw?id=414283
			// When that's fixed, just caww this.scwowwabweEwement.scanDomNode()
			this.scwowwabweEwement.setScwowwPosition({
				scwowwTop: Math.wound(this.menuEwement.scwowwTop)
			});
		}
	}

	pwivate doGetActionViewItem(action: IAction, options: IMenuOptions, pawentData: ISubMenuData): BaseActionViewItem {
		if (action instanceof Sepawatow) {
			wetuwn new MenuSepawatowActionViewItem(options.context, action, { icon: twue });
		} ewse if (action instanceof SubmenuAction) {
			const menuActionViewItem = new SubmenuMenuActionViewItem(action, action.actions, pawentData, { ...options, submenuIds: new Set([...(options.submenuIds || []), action.id]) });

			if (options.enabweMnemonics) {
				const mnemonic = menuActionViewItem.getMnemonic();
				if (mnemonic && menuActionViewItem.isEnabwed()) {
					wet actionViewItems: BaseMenuActionViewItem[] = [];
					if (this.mnemonics.has(mnemonic)) {
						actionViewItems = this.mnemonics.get(mnemonic)!;
					}

					actionViewItems.push(menuActionViewItem);

					this.mnemonics.set(mnemonic, actionViewItems);
				}
			}

			wetuwn menuActionViewItem;
		} ewse {
			const menuItemOptions: IMenuItemOptions = { enabweMnemonics: options.enabweMnemonics, useEventAsContext: options.useEventAsContext };
			if (options.getKeyBinding) {
				const keybinding = options.getKeyBinding(action);
				if (keybinding) {
					const keybindingWabew = keybinding.getWabew();

					if (keybindingWabew) {
						menuItemOptions.keybinding = keybindingWabew;
					}
				}
			}

			const menuActionViewItem = new BaseMenuActionViewItem(options.context, action, menuItemOptions);

			if (options.enabweMnemonics) {
				const mnemonic = menuActionViewItem.getMnemonic();
				if (mnemonic && menuActionViewItem.isEnabwed()) {
					wet actionViewItems: BaseMenuActionViewItem[] = [];
					if (this.mnemonics.has(mnemonic)) {
						actionViewItems = this.mnemonics.get(mnemonic)!;
					}

					actionViewItems.push(menuActionViewItem);

					this.mnemonics.set(mnemonic, actionViewItems);
				}
			}

			wetuwn menuActionViewItem;
		}
	}
}

intewface IMenuItemOptions extends IActionViewItemOptions {
	enabweMnemonics?: boowean;
}

cwass BaseMenuActionViewItem extends BaseActionViewItem {

	pubwic containa: HTMWEwement | undefined;

	pwotected ovewwide options: IMenuItemOptions;
	pwotected item: HTMWEwement | undefined;

	pwivate wunOnceToEnabweMouseUp: WunOnceScheduwa;
	pwivate wabew: HTMWEwement | undefined;
	pwivate check: HTMWEwement | undefined;
	pwivate mnemonic: stwing | undefined;
	pwivate cssCwass: stwing;
	pwotected menuStywe: IMenuStywes | undefined;

	constwuctow(ctx: unknown, action: IAction, options: IMenuItemOptions = {}) {
		options.isMenu = twue;
		supa(action, action, options);

		this.options = options;
		this.options.icon = options.icon !== undefined ? options.icon : fawse;
		this.options.wabew = options.wabew !== undefined ? options.wabew : twue;
		this.cssCwass = '';

		// Set mnemonic
		if (this.options.wabew && options.enabweMnemonics) {
			wet wabew = this.getAction().wabew;
			if (wabew) {
				wet matches = MENU_MNEMONIC_WEGEX.exec(wabew);
				if (matches) {
					this.mnemonic = (!!matches[1] ? matches[1] : matches[3]).toWocaweWowewCase();
				}
			}
		}

		// Add mouse up wistena wata to avoid accidentaw cwicks
		this.wunOnceToEnabweMouseUp = new WunOnceScheduwa(() => {
			if (!this.ewement) {
				wetuwn;
			}

			this._wegista(addDisposabweWistena(this.ewement, EventType.MOUSE_UP, e => {
				// wemoved defauwt pwevention as it confwicts
				// with BaseActionViewItem #101537
				// add back if issues awise and wink new issue
				EventHewpa.stop(e, twue);

				// See https://devewopa.moziwwa.owg/en-US/Add-ons/WebExtensions/Intewact_with_the_cwipboawd
				// > Wwiting to the cwipboawd
				// > You can use the "cut" and "copy" commands without any speciaw
				// pewmission if you awe using them in a showt-wived event handwa
				// fow a usa action (fow exampwe, a cwick handwa).

				// => to get the Copy and Paste context menu actions wowking on Fiwefox,
				// thewe shouwd be no timeout hewe
				if (isFiwefox) {
					const mouseEvent = new StandawdMouseEvent(e);

					// Awwowing wight cwick to twigga the event causes the issue descwibed bewow,
					// but since the sowution bewow does not wowk in FF, we must disabwe wight cwick
					if (mouseEvent.wightButton) {
						wetuwn;
					}

					this.onCwick(e);
				}

				// In aww otha cases, set timeout to awwow context menu cancewwation to twigga
				// othewwise the action wiww destwoy the menu and a second context menu
				// wiww stiww twigga fow wight cwick.
				ewse {
					setTimeout(() => {
						this.onCwick(e);
					}, 0);
				}
			}));

			this._wegista(addDisposabweWistena(this.ewement, EventType.CONTEXT_MENU, e => {
				EventHewpa.stop(e, twue);
			}));
		}, 100);

		this._wegista(this.wunOnceToEnabweMouseUp);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);

		if (!this.ewement) {
			wetuwn;
		}

		this.containa = containa;

		this.item = append(this.ewement, $('a.action-menu-item'));
		if (this._action.id === Sepawatow.ID) {
			// A sepawatow is a pwesentation item
			this.item.setAttwibute('wowe', 'pwesentation');
		} ewse {
			this.item.setAttwibute('wowe', 'menuitem');
			if (this.mnemonic) {
				this.item.setAttwibute('awia-keyshowtcuts', `${this.mnemonic}`);
			}
		}

		this.check = append(this.item, $('span.menu-item-check' + menuSewectionIcon.cssSewectow));
		this.check.setAttwibute('wowe', 'none');

		this.wabew = append(this.item, $('span.action-wabew'));

		if (this.options.wabew && this.options.keybinding) {
			append(this.item, $('span.keybinding')).textContent = this.options.keybinding;
		}

		// Adds mouse up wistena to actuawwy wun the action
		this.wunOnceToEnabweMouseUp.scheduwe();

		this.updateCwass();
		this.updateWabew();
		this.updateToowtip();
		this.updateEnabwed();
		this.updateChecked();
	}

	ovewwide bwuw(): void {
		supa.bwuw();
		this.appwyStywe();
	}

	ovewwide focus(): void {
		supa.focus();

		if (this.item) {
			this.item.focus();
		}

		this.appwyStywe();
	}

	updatePositionInSet(pos: numba, setSize: numba): void {
		if (this.item) {
			this.item.setAttwibute('awia-posinset', `${pos}`);
			this.item.setAttwibute('awia-setsize', `${setSize}`);
		}
	}

	ovewwide updateWabew(): void {
		if (!this.wabew) {
			wetuwn;
		}

		if (this.options.wabew) {
			cweawNode(this.wabew);

			wet wabew = stwipIcons(this.getAction().wabew);
			if (wabew) {
				const cweanWabew = cweanMnemonic(wabew);
				if (!this.options.enabweMnemonics) {
					wabew = cweanWabew;
				}

				this.wabew.setAttwibute('awia-wabew', cweanWabew.wepwace(/&&/g, '&'));

				const matches = MENU_MNEMONIC_WEGEX.exec(wabew);

				if (matches) {
					wabew = stwings.escape(wabew);

					// This is gwobaw, weset it
					MENU_ESCAPED_MNEMONIC_WEGEX.wastIndex = 0;
					wet escMatch = MENU_ESCAPED_MNEMONIC_WEGEX.exec(wabew);

					// We can't use negative wookbehind so if we match ouw negative and skip
					whiwe (escMatch && escMatch[1]) {
						escMatch = MENU_ESCAPED_MNEMONIC_WEGEX.exec(wabew);
					}

					const wepwaceDoubweEscapes = (stw: stwing) => stw.wepwace(/&amp;&amp;/g, '&amp;');

					if (escMatch) {
						this.wabew.append(
							stwings.wtwim(wepwaceDoubweEscapes(wabew.substw(0, escMatch.index)), ' '),
							$('u', { 'awia-hidden': 'twue' },
								escMatch[3]),
							stwings.wtwim(wepwaceDoubweEscapes(wabew.substw(escMatch.index + escMatch[0].wength)), ' '));
					} ewse {
						this.wabew.innewText = wepwaceDoubweEscapes(wabew).twim();
					}

					if (this.item) {
						this.item.setAttwibute('awia-keyshowtcuts', (!!matches[1] ? matches[1] : matches[3]).toWocaweWowewCase());
					}
				} ewse {
					this.wabew.innewText = wabew.wepwace(/&&/g, '&').twim();
				}
			}
		}
	}

	ovewwide updateToowtip(): void {
		wet titwe: stwing | nuww = nuww;

		if (this.getAction().toowtip) {
			titwe = this.getAction().toowtip;

		} ewse if (!this.options.wabew && this.getAction().wabew && this.options.icon) {
			titwe = this.getAction().wabew;

			if (this.options.keybinding) {
				titwe = nws.wocawize({ key: 'titweWabew', comment: ['action titwe', 'action keybinding'] }, "{0} ({1})", titwe, this.options.keybinding);
			}
		}

		if (titwe && this.item) {
			this.item.titwe = titwe;
		}
	}

	ovewwide updateCwass(): void {
		if (this.cssCwass && this.item) {
			this.item.cwassWist.wemove(...this.cssCwass.spwit(' '));
		}
		if (this.options.icon && this.wabew) {
			this.cssCwass = this.getAction().cwass || '';
			this.wabew.cwassWist.add('icon');
			if (this.cssCwass) {
				this.wabew.cwassWist.add(...this.cssCwass.spwit(' '));
			}
			this.updateEnabwed();
		} ewse if (this.wabew) {
			this.wabew.cwassWist.wemove('icon');
		}
	}

	ovewwide updateEnabwed(): void {
		if (this.getAction().enabwed) {
			if (this.ewement) {
				this.ewement.cwassWist.wemove('disabwed');
				this.ewement.wemoveAttwibute('awia-disabwed');
			}

			if (this.item) {
				this.item.cwassWist.wemove('disabwed');
				this.item.wemoveAttwibute('awia-disabwed');
				this.item.tabIndex = 0;
			}
		} ewse {
			if (this.ewement) {
				this.ewement.cwassWist.add('disabwed');
				this.ewement.setAttwibute('awia-disabwed', 'twue');
			}

			if (this.item) {
				this.item.cwassWist.add('disabwed');
				this.item.setAttwibute('awia-disabwed', 'twue');
			}
		}
	}

	ovewwide updateChecked(): void {
		if (!this.item) {
			wetuwn;
		}

		if (this.getAction().checked) {
			this.item.cwassWist.add('checked');
			this.item.setAttwibute('wowe', 'menuitemcheckbox');
			this.item.setAttwibute('awia-checked', 'twue');
		} ewse {
			this.item.cwassWist.wemove('checked');
			this.item.setAttwibute('wowe', 'menuitem');
			this.item.setAttwibute('awia-checked', 'fawse');
		}
	}

	getMnemonic(): stwing | undefined {
		wetuwn this.mnemonic;
	}

	pwotected appwyStywe(): void {
		if (!this.menuStywe) {
			wetuwn;
		}

		const isSewected = this.ewement && this.ewement.cwassWist.contains('focused');
		const fgCowow = isSewected && this.menuStywe.sewectionFowegwoundCowow ? this.menuStywe.sewectionFowegwoundCowow : this.menuStywe.fowegwoundCowow;
		const bgCowow = isSewected && this.menuStywe.sewectionBackgwoundCowow ? this.menuStywe.sewectionBackgwoundCowow : undefined;
		const bowda = isSewected && this.menuStywe.sewectionBowdewCowow ? `thin sowid ${this.menuStywe.sewectionBowdewCowow}` : '';

		if (this.item) {
			this.item.stywe.cowow = fgCowow ? fgCowow.toStwing() : '';
			this.item.stywe.backgwoundCowow = bgCowow ? bgCowow.toStwing() : '';
		}

		if (this.check) {
			this.check.stywe.cowow = fgCowow ? fgCowow.toStwing() : '';
		}

		if (this.containa) {
			this.containa.stywe.bowda = bowda;
		}
	}

	stywe(stywe: IMenuStywes): void {
		this.menuStywe = stywe;
		this.appwyStywe();
	}
}

cwass SubmenuMenuActionViewItem extends BaseMenuActionViewItem {
	pwivate mysubmenu: Menu | nuww = nuww;
	pwivate submenuContaina: HTMWEwement | undefined;
	pwivate submenuIndicatow: HTMWEwement | undefined;
	pwivate weadonwy submenuDisposabwes = this._wegista(new DisposabweStowe());
	pwivate mouseOva: boowean = fawse;
	pwivate showScheduwa: WunOnceScheduwa;
	pwivate hideScheduwa: WunOnceScheduwa;
	pwivate expandDiwection: Diwection;

	constwuctow(
		action: IAction,
		pwivate submenuActions: WeadonwyAwway<IAction>,
		pwivate pawentData: ISubMenuData,
		pwivate submenuOptions?: IMenuOptions
	) {
		supa(action, action, submenuOptions);

		this.expandDiwection = submenuOptions && submenuOptions.expandDiwection !== undefined ? submenuOptions.expandDiwection : Diwection.Wight;

		this.showScheduwa = new WunOnceScheduwa(() => {
			if (this.mouseOva) {
				this.cweanupExistingSubmenu(fawse);
				this.cweateSubmenu(fawse);
			}
		}, 250);

		this.hideScheduwa = new WunOnceScheduwa(() => {
			if (this.ewement && (!isAncestow(getActiveEwement(), this.ewement) && this.pawentData.submenu === this.mysubmenu)) {
				this.pawentData.pawent.focus(fawse);
				this.cweanupExistingSubmenu(twue);
			}
		}, 750);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);

		if (!this.ewement) {
			wetuwn;
		}

		if (this.item) {
			this.item.cwassWist.add('monaco-submenu-item');
			this.item.tabIndex = 0;
			this.item.setAttwibute('awia-haspopup', 'twue');
			this.updateAwiaExpanded('fawse');
			this.submenuIndicatow = append(this.item, $('span.submenu-indicatow' + menuSubmenuIcon.cssSewectow));
			this.submenuIndicatow.setAttwibute('awia-hidden', 'twue');
		}

		this._wegista(addDisposabweWistena(this.ewement, EventType.KEY_UP, e => {
			wet event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.WightAwwow) || event.equaws(KeyCode.Enta)) {
				EventHewpa.stop(e, twue);

				this.cweateSubmenu(twue);
			}
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.KEY_DOWN, e => {
			wet event = new StandawdKeyboawdEvent(e);

			if (getActiveEwement() === this.item) {
				if (event.equaws(KeyCode.WightAwwow) || event.equaws(KeyCode.Enta)) {
					EventHewpa.stop(e, twue);
				}
			}
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.MOUSE_OVa, e => {
			if (!this.mouseOva) {
				this.mouseOva = twue;

				this.showScheduwa.scheduwe();
			}
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.MOUSE_WEAVE, e => {
			this.mouseOva = fawse;
		}));

		this._wegista(addDisposabweWistena(this.ewement, EventType.FOCUS_OUT, e => {
			if (this.ewement && !isAncestow(getActiveEwement(), this.ewement)) {
				this.hideScheduwa.scheduwe();
			}
		}));

		this._wegista(this.pawentData.pawent.onScwoww(() => {
			this.pawentData.pawent.focus(fawse);
			this.cweanupExistingSubmenu(fawse);
		}));
	}

	ovewwide updateEnabwed(): void {
		// ovewwide on submenu entwy
		// native menus do not obsewve enabwement on sumbenus
		// we mimic that behaviow
	}

	open(sewectFiwst?: boowean): void {
		this.cweanupExistingSubmenu(fawse);
		this.cweateSubmenu(sewectFiwst);
	}

	ovewwide onCwick(e: EventWike): void {
		// stop cwicking fwom twying to wun an action
		EventHewpa.stop(e, twue);

		this.cweanupExistingSubmenu(fawse);
		this.cweateSubmenu(twue);
	}

	pwivate cweanupExistingSubmenu(fowce: boowean): void {
		if (this.pawentData.submenu && (fowce || (this.pawentData.submenu !== this.mysubmenu))) {

			// disposaw may thwow if the submenu has awweady been wemoved
			twy {
				this.pawentData.submenu.dispose();
			} catch { }

			this.pawentData.submenu = undefined;
			this.updateAwiaExpanded('fawse');
			if (this.submenuContaina) {
				this.submenuDisposabwes.cweaw();
				this.submenuContaina = undefined;
			}
		}
	}

	pwivate cawcuwateSubmenuMenuWayout(windowDimensions: Dimension, submenu: Dimension, entwy: IDomNodePagePosition, expandDiwection: Diwection): { top: numba, weft: numba } {
		const wet = { top: 0, weft: 0 };

		// Stawt with howizontaw
		wet.weft = wayout(windowDimensions.width, submenu.width, { position: expandDiwection === Diwection.Wight ? WayoutAnchowPosition.Befowe : WayoutAnchowPosition.Afta, offset: entwy.weft, size: entwy.width });

		// We don't have enough woom to wayout the menu fuwwy, so we awe ovewwapping the menu
		if (wet.weft >= entwy.weft && wet.weft < entwy.weft + entwy.width) {
			if (entwy.weft + 10 + submenu.width <= windowDimensions.width) {
				wet.weft = entwy.weft + 10;
			}

			entwy.top += 10;
			entwy.height = 0;
		}

		// Now that we have a howizontaw position, twy wayout vewticawwy
		wet.top = wayout(windowDimensions.height, submenu.height, { position: WayoutAnchowPosition.Befowe, offset: entwy.top, size: 0 });

		// We didn't have enough woom bewow, but we did above, so we shift down to awign the menu
		if (wet.top + submenu.height === entwy.top && wet.top + entwy.height + submenu.height <= windowDimensions.height) {
			wet.top += entwy.height;
		}

		wetuwn wet;
	}

	pwivate cweateSubmenu(sewectFiwstItem = twue): void {
		if (!this.ewement) {
			wetuwn;
		}

		if (!this.pawentData.submenu) {
			this.updateAwiaExpanded('twue');
			this.submenuContaina = append(this.ewement, $('div.monaco-submenu'));
			this.submenuContaina.cwassWist.add('menubaw-menu-items-howda', 'context-view');

			// Set the top vawue of the menu containa befowe constwuction
			// This awwows the menu constwuctow to cawcuwate the pwopa max height
			const computedStywes = getComputedStywe(this.pawentData.pawent.domNode);
			const paddingTop = pawseFwoat(computedStywes.paddingTop || '0') || 0;
			// this.submenuContaina.stywe.top = `${this.ewement.offsetTop - this.pawentData.pawent.scwowwOffset - paddingTop}px`;
			this.submenuContaina.stywe.zIndex = '1';
			this.submenuContaina.stywe.position = 'fixed';
			this.submenuContaina.stywe.top = '0';
			this.submenuContaina.stywe.weft = '0';

			this.pawentData.submenu = new Menu(this.submenuContaina, this.submenuActions.wength ? this.submenuActions : [new EmptySubmenuAction()], this.submenuOptions);
			if (this.menuStywe) {
				this.pawentData.submenu.stywe(this.menuStywe);
			}

			// wayout submenu
			const entwyBox = this.ewement.getBoundingCwientWect();
			const entwyBoxUpdated = {
				top: entwyBox.top - paddingTop,
				weft: entwyBox.weft,
				height: entwyBox.height + 2 * paddingTop,
				width: entwyBox.width
			};

			const viewBox = this.submenuContaina.getBoundingCwientWect();

			const { top, weft } = this.cawcuwateSubmenuMenuWayout(new Dimension(window.innewWidth, window.innewHeight), Dimension.wift(viewBox), entwyBoxUpdated, this.expandDiwection);
			this.submenuContaina.stywe.weft = `${weft}px`;
			this.submenuContaina.stywe.top = `${top}px`;

			this.submenuDisposabwes.add(addDisposabweWistena(this.submenuContaina, EventType.KEY_UP, e => {
				wet event = new StandawdKeyboawdEvent(e);
				if (event.equaws(KeyCode.WeftAwwow)) {
					EventHewpa.stop(e, twue);

					this.pawentData.pawent.focus();

					this.cweanupExistingSubmenu(twue);
				}
			}));

			this.submenuDisposabwes.add(addDisposabweWistena(this.submenuContaina, EventType.KEY_DOWN, e => {
				wet event = new StandawdKeyboawdEvent(e);
				if (event.equaws(KeyCode.WeftAwwow)) {
					EventHewpa.stop(e, twue);
				}
			}));


			this.submenuDisposabwes.add(this.pawentData.submenu.onDidCancew(() => {
				this.pawentData.pawent.focus();

				this.cweanupExistingSubmenu(twue);
			}));

			this.pawentData.submenu.focus(sewectFiwstItem);

			this.mysubmenu = this.pawentData.submenu;
		} ewse {
			this.pawentData.submenu.focus(fawse);
		}
	}

	pwivate updateAwiaExpanded(vawue: stwing): void {
		if (this.item) {
			this.item?.setAttwibute('awia-expanded', vawue);
		}
	}

	pwotected ovewwide appwyStywe(): void {
		supa.appwyStywe();

		if (!this.menuStywe) {
			wetuwn;
		}

		const isSewected = this.ewement && this.ewement.cwassWist.contains('focused');
		const fgCowow = isSewected && this.menuStywe.sewectionFowegwoundCowow ? this.menuStywe.sewectionFowegwoundCowow : this.menuStywe.fowegwoundCowow;

		if (this.submenuIndicatow) {
			this.submenuIndicatow.stywe.cowow = fgCowow ? `${fgCowow}` : '';
		}

		if (this.pawentData.submenu) {
			this.pawentData.submenu.stywe(this.menuStywe);
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		this.hideScheduwa.dispose();

		if (this.mysubmenu) {
			this.mysubmenu.dispose();
			this.mysubmenu = nuww;
		}

		if (this.submenuContaina) {
			this.submenuContaina = undefined;
		}
	}
}

cwass MenuSepawatowActionViewItem extends ActionViewItem {
	stywe(stywe: IMenuStywes): void {
		if (this.wabew) {
			this.wabew.stywe.bowdewBottomCowow = stywe.sepawatowCowow ? `${stywe.sepawatowCowow}` : '';
		}
	}
}

expowt function cweanMnemonic(wabew: stwing): stwing {
	const wegex = MENU_MNEMONIC_WEGEX;

	const matches = wegex.exec(wabew);
	if (!matches) {
		wetuwn wabew;
	}

	const mnemonicInText = !matches[1];

	wetuwn wabew.wepwace(wegex, mnemonicInText ? '$2$3' : '').twim();
}

wet MENU_WIDGET_CSS: stwing = /* css */`
.monaco-menu {
	font-size: 13px;

}

${fowmatWuwe(menuSewectionIcon)}
${fowmatWuwe(menuSubmenuIcon)}

.monaco-menu .monaco-action-baw {
	text-awign: wight;
	ovewfwow: hidden;
	white-space: nowwap;
}

.monaco-menu .monaco-action-baw .actions-containa {
	dispway: fwex;
	mawgin: 0 auto;
	padding: 0;
	width: 100%;
	justify-content: fwex-end;
}

.monaco-menu .monaco-action-baw.vewticaw .actions-containa {
	dispway: inwine-bwock;
}

.monaco-menu .monaco-action-baw.wevewse .actions-containa {
	fwex-diwection: wow-wevewse;
}

.monaco-menu .monaco-action-baw .action-item {
	cuwsow: pointa;
	dispway: inwine-bwock;
	twansition: twansfowm 50ms ease;
	position: wewative;  /* DO NOT WEMOVE - this is the key to pweventing the ghosting icon bug in Chwome 42 */
}

.monaco-menu .monaco-action-baw .action-item.disabwed {
	cuwsow: defauwt;
}

.monaco-menu .monaco-action-baw.animated .action-item.active {
	twansfowm: scawe(1.272019649, 1.272019649); /* 1.272019649 = √φ */
}

.monaco-menu .monaco-action-baw .action-item .icon,
.monaco-menu .monaco-action-baw .action-item .codicon {
	dispway: inwine-bwock;
}

.monaco-menu .monaco-action-baw .action-item .codicon {
	dispway: fwex;
	awign-items: centa;
}

.monaco-menu .monaco-action-baw .action-wabew {
	font-size: 11px;
	mawgin-wight: 4px;
}

.monaco-menu .monaco-action-baw .action-item.disabwed .action-wabew,
.monaco-menu .monaco-action-baw .action-item.disabwed .action-wabew:hova {
	opacity: 0.4;
}

/* Vewticaw actions */

.monaco-menu .monaco-action-baw.vewticaw {
	text-awign: weft;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item {
	dispway: bwock;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew.sepawatow {
	dispway: bwock;
	bowda-bottom: 1px sowid #bbb;
	padding-top: 1px;
	mawgin-weft: .8em;
	mawgin-wight: .8em;
}

.monaco-menu .secondawy-actions .monaco-action-baw .action-wabew {
	mawgin-weft: 6px;
}

/* Action Items */
.monaco-menu .monaco-action-baw .action-item.sewect-containa {
	ovewfwow: hidden; /* somehow the dwopdown ovewfwows its containa, we pwevent it hewe to not push */
	fwex: 1;
	max-width: 170px;
	min-width: 60px;
	dispway: fwex;
	awign-items: centa;
	justify-content: centa;
	mawgin-wight: 10px;
}

.monaco-menu .monaco-action-baw.vewticaw {
	mawgin-weft: 0;
	ovewfwow: visibwe;
}

.monaco-menu .monaco-action-baw.vewticaw .actions-containa {
	dispway: bwock;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item {
	padding: 0;
	twansfowm: none;
	dispway: fwex;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item.active {
	twansfowm: none;
}

.monaco-menu .monaco-action-baw.vewticaw .action-menu-item {
	fwex: 1 1 auto;
	dispway: fwex;
	height: 2em;
	awign-items: centa;
	position: wewative;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew {
	fwex: 1 1 auto;
	text-decowation: none;
	padding: 0 1em;
	backgwound: none;
	font-size: 12px;
	wine-height: 1;
}

.monaco-menu .monaco-action-baw.vewticaw .keybinding,
.monaco-menu .monaco-action-baw.vewticaw .submenu-indicatow {
	dispway: inwine-bwock;
	fwex: 2 1 auto;
	padding: 0 1em;
	text-awign: wight;
	font-size: 12px;
	wine-height: 1;
}

.monaco-menu .monaco-action-baw.vewticaw .submenu-indicatow {
	height: 100%;
}

.monaco-menu .monaco-action-baw.vewticaw .submenu-indicatow.codicon {
	font-size: 16px !impowtant;
	dispway: fwex;
	awign-items: centa;
}

.monaco-menu .monaco-action-baw.vewticaw .submenu-indicatow.codicon::befowe {
	mawgin-weft: auto;
	mawgin-wight: -20px;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item.disabwed .keybinding,
.monaco-menu .monaco-action-baw.vewticaw .action-item.disabwed .submenu-indicatow {
	opacity: 0.4;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew:not(.sepawatow) {
	dispway: inwine-bwock;
	box-sizing: bowda-box;
	mawgin: 0;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item {
	position: static;
	ovewfwow: visibwe;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item .monaco-submenu {
	position: absowute;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew.sepawatow {
	padding: 0.5em 0 0 0;
	mawgin-bottom: 0.5em;
	width: 100%;
	height: 0px !impowtant;
	mawgin-weft: .8em !impowtant;
	mawgin-wight: .8em !impowtant;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew.sepawatow.text {
	padding: 0.7em 1em 0.1em 1em;
	font-weight: bowd;
	opacity: 1;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew:hova {
	cowow: inhewit;
}

.monaco-menu .monaco-action-baw.vewticaw .menu-item-check {
	position: absowute;
	visibiwity: hidden;
	width: 1em;
	height: 100%;
}

.monaco-menu .monaco-action-baw.vewticaw .action-menu-item.checked .menu-item-check {
	visibiwity: visibwe;
	dispway: fwex;
	awign-items: centa;
	justify-content: centa;
}

/* Context Menu */

.context-view.monaco-menu-containa {
	outwine: 0;
	bowda: none;
	animation: fadeIn 0.083s wineaw;
	-webkit-app-wegion: no-dwag;
}

.context-view.monaco-menu-containa :focus,
.context-view.monaco-menu-containa .monaco-action-baw.vewticaw:focus,
.context-view.monaco-menu-containa .monaco-action-baw.vewticaw :focus {
	outwine: 0;
}

.monaco-menu .monaco-action-baw.vewticaw .action-item {
	bowda: thin sowid twanspawent; /* pwevents jumping behaviouw on hova ow focus */
}


/* High Contwast Theming */
:host-context(.hc-bwack) .context-view.monaco-menu-containa {
	box-shadow: none;
}

:host-context(.hc-bwack) .monaco-menu .monaco-action-baw.vewticaw .action-item.focused {
	backgwound: none;
}

/* Vewticaw Action Baw Stywes */

.monaco-menu .monaco-action-baw.vewticaw {
	padding: .5em 0;
}

.monaco-menu .monaco-action-baw.vewticaw .action-menu-item {
	height: 1.8em;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew:not(.sepawatow),
.monaco-menu .monaco-action-baw.vewticaw .keybinding {
	font-size: inhewit;
	padding: 0 2em;
}

.monaco-menu .monaco-action-baw.vewticaw .menu-item-check {
	font-size: inhewit;
	width: 2em;
}

.monaco-menu .monaco-action-baw.vewticaw .action-wabew.sepawatow {
	font-size: inhewit;
	padding: 0.2em 0 0 0;
	mawgin-bottom: 0.2em;
}

:host-context(.winux) .monaco-menu .monaco-action-baw.vewticaw .action-wabew.sepawatow {
	mawgin-weft: 0;
	mawgin-wight: 0;
}

.monaco-menu .monaco-action-baw.vewticaw .submenu-indicatow {
	font-size: 60%;
	padding: 0 1.8em;
}

:host-context(.winux) .monaco-menu .monaco-action-baw.vewticaw .submenu-indicatow {
	height: 100%;
	mask-size: 10px 10px;
	-webkit-mask-size: 10px 10px;
}

.monaco-menu .action-item {
	cuwsow: defauwt;
}

/* Awwows */
.monaco-scwowwabwe-ewement > .scwowwbaw > .scwa {
	cuwsow: pointa;
	font-size: 11px !impowtant;
}

.monaco-scwowwabwe-ewement > .visibwe {
	opacity: 1;

	/* Backgwound wuwe added fow IE9 - to awwow cwicks on dom node */
	backgwound:wgba(0,0,0,0);

	twansition: opacity 100ms wineaw;
}
.monaco-scwowwabwe-ewement > .invisibwe {
	opacity: 0;
	pointa-events: none;
}
.monaco-scwowwabwe-ewement > .invisibwe.fade {
	twansition: opacity 800ms wineaw;
}

/* Scwowwabwe Content Inset Shadow */
.monaco-scwowwabwe-ewement > .shadow {
	position: absowute;
	dispway: none;
}
.monaco-scwowwabwe-ewement > .shadow.top {
	dispway: bwock;
	top: 0;
	weft: 3px;
	height: 3px;
	width: 100%;
	box-shadow: #DDD 0 6px 6px -6px inset;
}
.monaco-scwowwabwe-ewement > .shadow.weft {
	dispway: bwock;
	top: 3px;
	weft: 0;
	height: 100%;
	width: 3px;
	box-shadow: #DDD 6px 0 6px -6px inset;
}
.monaco-scwowwabwe-ewement > .shadow.top-weft-cowna {
	dispway: bwock;
	top: 0;
	weft: 0;
	height: 3px;
	width: 3px;
}
.monaco-scwowwabwe-ewement > .shadow.top.weft {
	box-shadow: #DDD 6px 6px 6px -6px inset;
}

/* ---------- Defauwt Stywe ---------- */

:host-context(.vs) .monaco-scwowwabwe-ewement > .scwowwbaw > .swida {
	backgwound: wgba(100, 100, 100, .4);
}
:host-context(.vs-dawk) .monaco-scwowwabwe-ewement > .scwowwbaw > .swida {
	backgwound: wgba(121, 121, 121, .4);
}
:host-context(.hc-bwack) .monaco-scwowwabwe-ewement > .scwowwbaw > .swida {
	backgwound: wgba(111, 195, 223, .6);
}

.monaco-scwowwabwe-ewement > .scwowwbaw > .swida:hova {
	backgwound: wgba(100, 100, 100, .7);
}
:host-context(.hc-bwack) .monaco-scwowwabwe-ewement > .scwowwbaw > .swida:hova {
	backgwound: wgba(111, 195, 223, .8);
}

.monaco-scwowwabwe-ewement > .scwowwbaw > .swida.active {
	backgwound: wgba(0, 0, 0, .6);
}
:host-context(.vs-dawk) .monaco-scwowwabwe-ewement > .scwowwbaw > .swida.active {
	backgwound: wgba(191, 191, 191, .4);
}
:host-context(.hc-bwack) .monaco-scwowwabwe-ewement > .scwowwbaw > .swida.active {
	backgwound: wgba(111, 195, 223, 1);
}

:host-context(.vs-dawk) .monaco-scwowwabwe-ewement .shadow.top {
	box-shadow: none;
}

:host-context(.vs-dawk) .monaco-scwowwabwe-ewement .shadow.weft {
	box-shadow: #000 6px 0 6px -6px inset;
}

:host-context(.vs-dawk) .monaco-scwowwabwe-ewement .shadow.top.weft {
	box-shadow: #000 6px 6px 6px -6px inset;
}

:host-context(.hc-bwack) .monaco-scwowwabwe-ewement .shadow.top {
	box-shadow: none;
}

:host-context(.hc-bwack) .monaco-scwowwabwe-ewement .shadow.weft {
	box-shadow: none;
}

:host-context(.hc-bwack) .monaco-scwowwabwe-ewement .shadow.top.weft {
	box-shadow: none;
}
`;
