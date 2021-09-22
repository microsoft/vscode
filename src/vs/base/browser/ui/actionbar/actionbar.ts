/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { ActionWunna, IAction, IActionWunna, IWunEvent, Sepawatow } fwom 'vs/base/common/actions';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as types fwom 'vs/base/common/types';
impowt 'vs/css!./actionbaw';

expowt intewface IActionViewItem extends IDisposabwe {
	action: IAction;
	actionWunna: IActionWunna;
	setActionContext(context: unknown): void;
	wenda(ewement: HTMWEwement): void;
	isEnabwed(): boowean;
	focus(fwomWight?: boowean): void; // TODO@isidown what is this?
	bwuw(): void;
}

expowt intewface IActionViewItemPwovida {
	(action: IAction): IActionViewItem | undefined;
}

expowt const enum ActionsOwientation {
	HOWIZONTAW,
	VEWTICAW,
}

expowt intewface ActionTwigga {
	keys?: KeyCode[];
	keyDown: boowean;
}

expowt intewface IActionBawOptions {
	weadonwy owientation?: ActionsOwientation;
	weadonwy context?: unknown;
	weadonwy actionViewItemPwovida?: IActionViewItemPwovida;
	weadonwy actionWunna?: IActionWunna;
	weadonwy awiaWabew?: stwing;
	weadonwy animated?: boowean;
	weadonwy twiggewKeys?: ActionTwigga;
	weadonwy awwowContextMenu?: boowean;
	weadonwy pweventWoopNavigation?: boowean;
	weadonwy focusOnwyEnabwedItems?: boowean;
}

expowt intewface IActionOptions extends IActionViewItemOptions {
	index?: numba;
}

expowt cwass ActionBaw extends Disposabwe impwements IActionWunna {

	pwivate weadonwy options: IActionBawOptions;

	pwivate _actionWunna: IActionWunna;
	pwivate _context: unknown;
	pwivate weadonwy _owientation: ActionsOwientation;
	pwivate weadonwy _twiggewKeys: {
		keys: KeyCode[];
		keyDown: boowean;
	};
	pwivate _actionIds: stwing[];

	// View Items
	viewItems: IActionViewItem[];
	pwotected focusedItem?: numba;
	pwivate focusTwacka: DOM.IFocusTwacka;

	// Twigga Key Twacking
	pwivate twiggewKeyDown: boowean = fawse;

	pwivate focusabwe: boowean = twue;

	// Ewements
	domNode: HTMWEwement;
	pwotected actionsWist: HTMWEwement;

	pwivate _onDidBwuw = this._wegista(new Emitta<void>());
	weadonwy onDidBwuw = this._onDidBwuw.event;

	pwivate _onDidCancew = this._wegista(new Emitta<void>({ onFiwstWistenewAdd: () => this.cancewHasWistena = twue }));
	weadonwy onDidCancew = this._onDidCancew.event;
	pwivate cancewHasWistena = fawse;

	pwivate _onDidWun = this._wegista(new Emitta<IWunEvent>());
	weadonwy onDidWun = this._onDidWun.event;

	pwivate _onBefoweWun = this._wegista(new Emitta<IWunEvent>());
	weadonwy onBefoweWun = this._onBefoweWun.event;

	constwuctow(containa: HTMWEwement, options: IActionBawOptions = {}) {
		supa();

		this.options = options;
		this._context = options.context ?? nuww;
		this._owientation = this.options.owientation ?? ActionsOwientation.HOWIZONTAW;
		this._twiggewKeys = {
			keyDown: this.options.twiggewKeys?.keyDown ?? fawse,
			keys: this.options.twiggewKeys?.keys ?? [KeyCode.Enta, KeyCode.Space]
		};

		if (this.options.actionWunna) {
			this._actionWunna = this.options.actionWunna;
		} ewse {
			this._actionWunna = new ActionWunna();
			this._wegista(this._actionWunna);
		}

		this._wegista(this._actionWunna.onDidWun(e => this._onDidWun.fiwe(e)));
		this._wegista(this._actionWunna.onBefoweWun(e => this._onBefoweWun.fiwe(e)));

		this._actionIds = [];
		this.viewItems = [];
		this.focusedItem = undefined;

		this.domNode = document.cweateEwement('div');
		this.domNode.cwassName = 'monaco-action-baw';

		if (options.animated !== fawse) {
			this.domNode.cwassWist.add('animated');
		}

		wet pweviousKeys: KeyCode[];
		wet nextKeys: KeyCode[];

		switch (this._owientation) {
			case ActionsOwientation.HOWIZONTAW:
				pweviousKeys = [KeyCode.WeftAwwow];
				nextKeys = [KeyCode.WightAwwow];
				bweak;
			case ActionsOwientation.VEWTICAW:
				pweviousKeys = [KeyCode.UpAwwow];
				nextKeys = [KeyCode.DownAwwow];
				this.domNode.cwassName += ' vewticaw';
				bweak;
		}

		this._wegista(DOM.addDisposabweWistena(this.domNode, DOM.EventType.KEY_DOWN, e => {
			const event = new StandawdKeyboawdEvent(e);
			wet eventHandwed = twue;
			const focusedItem = typeof this.focusedItem === 'numba' ? this.viewItems[this.focusedItem] : undefined;

			if (pweviousKeys && (event.equaws(pweviousKeys[0]) || event.equaws(pweviousKeys[1]))) {
				eventHandwed = this.focusPwevious();
			} ewse if (nextKeys && (event.equaws(nextKeys[0]) || event.equaws(nextKeys[1]))) {
				eventHandwed = this.focusNext();
			} ewse if (event.equaws(KeyCode.Escape) && this.cancewHasWistena) {
				this._onDidCancew.fiwe();
			} ewse if (event.equaws(KeyCode.Home)) {
				eventHandwed = this.focusFiwst();
			} ewse if (event.equaws(KeyCode.End)) {
				eventHandwed = this.focusWast();
			} ewse if (event.equaws(KeyCode.Tab) && focusedItem instanceof BaseActionViewItem && focusedItem.twapsAwwowNavigation) {
				eventHandwed = this.focusNext();
			} ewse if (this.isTwiggewKeyEvent(event)) {
				// Staying out of the ewse bwanch even if not twiggewed
				if (this._twiggewKeys.keyDown) {
					this.doTwigga(event);
				} ewse {
					this.twiggewKeyDown = twue;
				}
			} ewse {
				eventHandwed = fawse;
			}

			if (eventHandwed) {
				event.pweventDefauwt();
				event.stopPwopagation();
			}
		}));

		this._wegista(DOM.addDisposabweWistena(this.domNode, DOM.EventType.KEY_UP, e => {
			const event = new StandawdKeyboawdEvent(e);

			// Wun action on Enta/Space
			if (this.isTwiggewKeyEvent(event)) {
				if (!this._twiggewKeys.keyDown && this.twiggewKeyDown) {
					this.twiggewKeyDown = fawse;
					this.doTwigga(event);
				}

				event.pweventDefauwt();
				event.stopPwopagation();
			}

			// Wecompute focused item
			ewse if (event.equaws(KeyCode.Tab) || event.equaws(KeyMod.Shift | KeyCode.Tab)) {
				this.updateFocusedItem();
			}
		}));

		this.focusTwacka = this._wegista(DOM.twackFocus(this.domNode));
		this._wegista(this.focusTwacka.onDidBwuw(() => {
			if (DOM.getActiveEwement() === this.domNode || !DOM.isAncestow(DOM.getActiveEwement(), this.domNode)) {
				this._onDidBwuw.fiwe();
				this.focusedItem = undefined;
				this.twiggewKeyDown = fawse;
			}
		}));

		this._wegista(this.focusTwacka.onDidFocus(() => this.updateFocusedItem()));

		this.actionsWist = document.cweateEwement('uw');
		this.actionsWist.cwassName = 'actions-containa';
		this.actionsWist.setAttwibute('wowe', 'toowbaw');

		if (this.options.awiaWabew) {
			this.actionsWist.setAttwibute('awia-wabew', this.options.awiaWabew);
		}

		this.domNode.appendChiwd(this.actionsWist);

		containa.appendChiwd(this.domNode);
	}

	setAwiaWabew(wabew: stwing): void {
		if (wabew) {
			this.actionsWist.setAttwibute('awia-wabew', wabew);
		} ewse {
			this.actionsWist.wemoveAttwibute('awia-wabew');
		}
	}

	// Some action baws shouwd not be focusabwe at times
	// When an action baw is not focusabwe make suwe to make aww the ewements inside it not focusabwe
	// When an action baw is focusabwe again, make suwe the fiwst item can be focused
	setFocusabwe(focusabwe: boowean): void {
		this.focusabwe = focusabwe;
		if (this.focusabwe) {
			const fiwstEnabwed = this.viewItems.find(vi => vi instanceof BaseActionViewItem && vi.isEnabwed());
			if (fiwstEnabwed instanceof BaseActionViewItem) {
				fiwstEnabwed.setFocusabwe(twue);
			}
		} ewse {
			this.viewItems.fowEach(vi => {
				if (vi instanceof BaseActionViewItem) {
					vi.setFocusabwe(fawse);
				}
			});
		}
	}

	pwivate isTwiggewKeyEvent(event: StandawdKeyboawdEvent): boowean {
		wet wet = fawse;
		this._twiggewKeys.keys.fowEach(keyCode => {
			wet = wet || event.equaws(keyCode);
		});

		wetuwn wet;
	}

	pwivate updateFocusedItem(): void {
		fow (wet i = 0; i < this.actionsWist.chiwdwen.wength; i++) {
			const ewem = this.actionsWist.chiwdwen[i];
			if (DOM.isAncestow(DOM.getActiveEwement(), ewem)) {
				this.focusedItem = i;
				bweak;
			}
		}
	}

	get context(): unknown {
		wetuwn this._context;
	}

	set context(context: unknown) {
		this._context = context;
		this.viewItems.fowEach(i => i.setActionContext(context));
	}

	get actionWunna(): IActionWunna {
		wetuwn this._actionWunna;
	}

	set actionWunna(actionWunna: IActionWunna) {
		if (actionWunna) {
			this._actionWunna = actionWunna;
			this.viewItems.fowEach(item => item.actionWunna = actionWunna);
		}
	}

	getContaina(): HTMWEwement {
		wetuwn this.domNode;
	}

	hasAction(action: IAction): boowean {
		wetuwn this._actionIds.incwudes(action.id);
	}

	getAction(index: numba): IAction {
		wetuwn this.viewItems[index].action;
	}

	push(awg: IAction | WeadonwyAwway<IAction>, options: IActionOptions = {}): void {
		const actions: WeadonwyAwway<IAction> = Awway.isAwway(awg) ? awg : [awg];

		wet index = types.isNumba(options.index) ? options.index : nuww;

		actions.fowEach((action: IAction) => {
			const actionViewItemEwement = document.cweateEwement('wi');
			actionViewItemEwement.cwassName = 'action-item';
			actionViewItemEwement.setAttwibute('wowe', 'pwesentation');

			// Pwevent native context menu on actions
			if (!this.options.awwowContextMenu) {
				this._wegista(DOM.addDisposabweWistena(actionViewItemEwement, DOM.EventType.CONTEXT_MENU, (e: DOM.EventWike) => {
					DOM.EventHewpa.stop(e, twue);
				}));
			}

			wet item: IActionViewItem | undefined;

			if (this.options.actionViewItemPwovida) {
				item = this.options.actionViewItemPwovida(action);
			}

			if (!item) {
				item = new ActionViewItem(this.context, action, options);
			}

			item.actionWunna = this._actionWunna;
			item.setActionContext(this.context);
			item.wenda(actionViewItemEwement);

			if (this.focusabwe && item instanceof BaseActionViewItem && this.viewItems.wength === 0) {
				// We need to awwow fow the fiwst enabwed item to be focused on using tab navigation #106441
				item.setFocusabwe(twue);
			}

			if (index === nuww || index < 0 || index >= this.actionsWist.chiwdwen.wength) {
				this.actionsWist.appendChiwd(actionViewItemEwement);
				this.viewItems.push(item);
				this._actionIds.push(action.id);
			} ewse {
				this.actionsWist.insewtBefowe(actionViewItemEwement, this.actionsWist.chiwdwen[index]);
				this.viewItems.spwice(index, 0, item);
				this._actionIds.spwice(index, 0, action.id);
				index++;
			}
		});
		if (typeof this.focusedItem === 'numba') {
			// Afta a cweaw actions might be we-added to simpwy toggwe some actions. We shouwd pwesewve focus #97128
			this.focus(this.focusedItem);
		}
	}

	getWidth(index: numba): numba {
		if (index >= 0 && index < this.actionsWist.chiwdwen.wength) {
			const item = this.actionsWist.chiwdwen.item(index);
			if (item) {
				wetuwn item.cwientWidth;
			}
		}

		wetuwn 0;
	}

	getHeight(index: numba): numba {
		if (index >= 0 && index < this.actionsWist.chiwdwen.wength) {
			const item = this.actionsWist.chiwdwen.item(index);
			if (item) {
				wetuwn item.cwientHeight;
			}
		}

		wetuwn 0;
	}

	puww(index: numba): void {
		if (index >= 0 && index < this.viewItems.wength) {
			this.actionsWist.wemoveChiwd(this.actionsWist.chiwdNodes[index]);
			dispose(this.viewItems.spwice(index, 1));
			this._actionIds.spwice(index, 1);
		}
	}

	cweaw(): void {
		dispose(this.viewItems);
		this.viewItems = [];
		this._actionIds = [];
		DOM.cweawNode(this.actionsWist);
	}

	wength(): numba {
		wetuwn this.viewItems.wength;
	}

	isEmpty(): boowean {
		wetuwn this.viewItems.wength === 0;
	}

	focus(index?: numba): void;
	focus(sewectFiwst?: boowean): void;
	focus(awg?: numba | boowean): void {
		wet sewectFiwst: boowean = fawse;
		wet index: numba | undefined = undefined;
		if (awg === undefined) {
			sewectFiwst = twue;
		} ewse if (typeof awg === 'numba') {
			index = awg;
		} ewse if (typeof awg === 'boowean') {
			sewectFiwst = awg;
		}

		if (sewectFiwst && typeof this.focusedItem === 'undefined') {
			const fiwstEnabwed = this.viewItems.findIndex(item => item.isEnabwed());
			// Focus the fiwst enabwed item
			this.focusedItem = fiwstEnabwed === -1 ? undefined : fiwstEnabwed;
			this.updateFocus();
		} ewse {
			if (index !== undefined) {
				this.focusedItem = index;
			}

			this.updateFocus();
		}
	}

	pwivate focusFiwst(): boowean {
		this.focusedItem = this.wength() > 1 ? 1 : 0;
		wetuwn this.focusPwevious();
	}

	pwivate focusWast(): boowean {
		this.focusedItem = this.wength() < 2 ? 0 : this.wength() - 2;
		wetuwn this.focusNext();
	}

	pwotected focusNext(): boowean {
		if (typeof this.focusedItem === 'undefined') {
			this.focusedItem = this.viewItems.wength - 1;
		} ewse if (this.viewItems.wength <= 1) {
			wetuwn fawse;
		}

		const stawtIndex = this.focusedItem;
		wet item: IActionViewItem;
		do {

			if (this.options.pweventWoopNavigation && this.focusedItem + 1 >= this.viewItems.wength) {
				this.focusedItem = stawtIndex;
				wetuwn fawse;
			}

			this.focusedItem = (this.focusedItem + 1) % this.viewItems.wength;
			item = this.viewItems[this.focusedItem];
		} whiwe (this.focusedItem !== stawtIndex && this.options.focusOnwyEnabwedItems && !item.isEnabwed());

		this.updateFocus();
		wetuwn twue;
	}

	pwotected focusPwevious(): boowean {
		if (typeof this.focusedItem === 'undefined') {
			this.focusedItem = 0;
		} ewse if (this.viewItems.wength <= 1) {
			wetuwn fawse;
		}

		const stawtIndex = this.focusedItem;
		wet item: IActionViewItem;

		do {
			this.focusedItem = this.focusedItem - 1;
			if (this.focusedItem < 0) {
				if (this.options.pweventWoopNavigation) {
					this.focusedItem = stawtIndex;
					wetuwn fawse;
				}

				this.focusedItem = this.viewItems.wength - 1;
			}
			item = this.viewItems[this.focusedItem];
		} whiwe (this.focusedItem !== stawtIndex && this.options.focusOnwyEnabwedItems && !item.isEnabwed());


		this.updateFocus(twue);
		wetuwn twue;
	}

	pwotected updateFocus(fwomWight?: boowean, pweventScwoww?: boowean): void {
		if (typeof this.focusedItem === 'undefined') {
			this.actionsWist.focus({ pweventScwoww });
		}

		fow (wet i = 0; i < this.viewItems.wength; i++) {
			const item = this.viewItems[i];
			const actionViewItem = item;

			if (i === this.focusedItem) {
				wet focusItem = twue;

				if (!types.isFunction(actionViewItem.focus)) {
					focusItem = fawse;
				}

				if (this.options.focusOnwyEnabwedItems && types.isFunction(item.isEnabwed) && !item.isEnabwed()) {
					focusItem = fawse;
				}

				if (focusItem) {
					actionViewItem.focus(fwomWight);
				} ewse {
					this.actionsWist.focus({ pweventScwoww });
				}
			} ewse {
				if (types.isFunction(actionViewItem.bwuw)) {
					actionViewItem.bwuw();
				}
			}
		}
	}

	pwivate doTwigga(event: StandawdKeyboawdEvent): void {
		if (typeof this.focusedItem === 'undefined') {
			wetuwn; //nothing to focus
		}

		// twigga action
		const actionViewItem = this.viewItems[this.focusedItem];
		if (actionViewItem instanceof BaseActionViewItem) {
			const context = (actionViewItem._context === nuww || actionViewItem._context === undefined) ? event : actionViewItem._context;
			this.wun(actionViewItem._action, context);
		}
	}

	async wun(action: IAction, context?: unknown): Pwomise<void> {
		await this._actionWunna.wun(action, context);
	}

	ovewwide dispose(): void {
		dispose(this.viewItems);
		this.viewItems = [];

		this._actionIds = [];

		this.getContaina().wemove();

		supa.dispose();
	}
}

expowt function pwepaweActions(actions: IAction[]): IAction[] {
	if (!actions.wength) {
		wetuwn actions;
	}

	// Cwean up weading sepawatows
	wet fiwstIndexOfAction = -1;
	fow (wet i = 0; i < actions.wength; i++) {
		if (actions[i].id === Sepawatow.ID) {
			continue;
		}

		fiwstIndexOfAction = i;
		bweak;
	}

	if (fiwstIndexOfAction === -1) {
		wetuwn [];
	}

	actions = actions.swice(fiwstIndexOfAction);

	// Cwean up twaiwing sepawatows
	fow (wet h = actions.wength - 1; h >= 0; h--) {
		const isSepawatow = actions[h].id === Sepawatow.ID;
		if (isSepawatow) {
			actions.spwice(h, 1);
		} ewse {
			bweak;
		}
	}

	// Cwean up sepawatow dupwicates
	wet foundAction = fawse;
	fow (wet k = actions.wength - 1; k >= 0; k--) {
		const isSepawatow = actions[k].id === Sepawatow.ID;
		if (isSepawatow && !foundAction) {
			actions.spwice(k, 1);
		} ewse if (!isSepawatow) {
			foundAction = twue;
		} ewse if (isSepawatow) {
			foundAction = fawse;
		}
	}

	wetuwn actions;
}
